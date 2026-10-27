# Resilience

Source: https://docs.nestjs.com/reliability/resilience

迟早，每个调用另一个系统的应用程序都会遇到一个变慢或停机的应用程序。如果没有计划，缓慢的依赖会束缚您的请求处理程序，您的客户端会等到他们自己的超时触发，并且每一层的重试都会给已经陷入困境的服务带来更多的负载。

`@nestjs/resilience` 给你常用的装饰工具：**重试**，**超时**，**断路器**，**隔板**和**回退**。它们应用于应用程序的**入口点**，即控制器，GraphQL 解析器、微服务消息处理程序和 WebSocket 网关。对于服务内部的代码，相同的设置可用作策略对象。单个全局拦截器应用装饰器，因此它们在每个传输上的行为都是相同的，每个失败都成为该传输的本地错误。超过 HTTP，例如，超时响应 `504 Gateway Timeout` 一个打开的断路器回答 `503 Service Unavailable` 用一个 `Retry-After` 头球。

在本教程中，您将强化顺序 API 猫粮和用品的网上商店。Checkout 向承运人询问报价，承运人的报价 API 在最好的情况下很慢，偶尔会掉下来。到最后，慢速承运人最多需要三秒钟的结账时间。一旦知道承运人停运，结账就会完全停止等待：客户看到统一费率运输而不是错误，后台作业会停止调用承运人，直到它恢复。

#### 先决条件

本教程假设导出 `OrdersService` 的 `OrdersModule`。服务需要这些方法：`findOne(id)`（抛出 `NotFoundException` 作为未知 id）、`findAll()`、`update(id, changes)` 和 `exportCsv()`。订单如下所示：

```typescript
export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'paid' | 'shipped';
}

export function subtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
```

安装软件包：

```bash
$ npm i --save @nestjs/resilience
```

[Retry a POST safely](/reliability/resilience#retry-a-post-safely) 也使用 `@nestjs/idempotency`（参见 [Idempotency keys](/reliability/idempotency)）。

#### 注册模块

进口 `ResilienceModule` 进入根模块。配置字段默认值和一个名为预设的字段，`carrier` 描述了应用程序应如何处理载体：

```typescript
import { Module } from '@nestjs/common';
import { ResilienceModule } from '@nestjs/resilience';
import { OrdersModule } from './orders/orders.module.js';
import { ShippingModule } from './shipping/shipping.module.js';

@Module({
  imports: [
    ResilienceModule.forRoot({
      defaults: {
        timeout: '5s',
        retry: { attempts: 3, backoff: { delay: '200ms', maxDelay: '2s' } },
      },
      presets: {
        carrier: {
          timeout: '2s',
          retry: { attempts: 2 },
          circuitBreaker: { failureRateThreshold: 50, minimumCalls: 10, openDuration: '30s' },
        },
      },
    }),
    OrdersModule,
    ShippingModule,
  ],
})
export class AppModule {}
```

这两个选项执行不同的工作：

- `defaults` 填充装饰器或预设打开的任何阶段的字段。违约永远不会给自己带来舞台。这里，重试首先等待 0 到 200 毫秒之间的随机时间（`delay`），然后长达 400 毫秒，每次加倍直到 2 秒（`maxDelay`）。裸 `@Timeout()` 表示 5 秒。
- `presets` 保存命名的阶段集，通常每个依赖项一个。这个 `carrier` 预设给每次尝试 2 秒，最多尝试 2 次，并添加一个断路器。该断路器以**名称共享 `carrier`**每个使用预设的路由、处理程序和服务。载波是一个依赖项，所以它得到一个断路器。

每个时间值选项都需要毫秒或字符串，如 `'200ms'`、`'2s'` 或 `'30s'`。

该模块是全局的，所以在根模块中导入一次。它注册了一个应用程序范围的拦截器，除了错误映射之外，它对没有弹性装饰器的处理程序没有任何作用。它在引导时检查其配置：未知的预设名称、无效的持续时间或编号（例如 `NaN` 未设置的环境变量），缺少回退方法或以两种不同方式配置的一个断路器名称会导致引导失败，而不是第一个请求。使用 `ResilienceModule.forRootAsync()` 从配置中构建选项。

#### 在报价路线上设置时间预算

从运营商的客户开始。每个方法都取一个 `AbortSignal` 并将其交给 `fetch()`：

```typescript
import { Injectable } from '@nestjs/common';
import type { Order } from '../orders/order.js';

export interface ShippingQuote {
  service: string;
  price: number;
  estimatedDays: number;
}

export interface Shipment {
  id: string;
  reference: string;
  trackingNumber: string;
}

export class CarrierError extends Error {
  constructor(readonly status: number) {
    super(`The carrier answered with status ${status}`);
  }
}

@Injectable()
export class CarrierClient {
  private readonly baseUrl = process.env.CARRIER_URL ?? 'https://api.carrier.example.com';

  getQuotes(order: Order, signal: AbortSignal): Promise<ShippingQuote[]> {
    return this.post('/v2/quotes', { reference: order.id, items: order.items }, signal);
  }

  /** The carrier returns the existing shipment when it has seen the reference before. */
  createShipment(order: Order, signal: AbortSignal): Promise<Shipment> {
    return this.post('/v2/shipments', { reference: order.id, items: order.items }, signal);
  }

  private async post<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new CarrierError(response.status);
    }
    return (await response.json()) as T;
  }
}
```

服务传递信号。它还有一个统一费率的价格表和一个预订方法，其中断路器和重试 POST 使用以下内容：

```typescript
import { Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service.js';
import { CarrierClient, type Shipment, type ShippingQuote } from './carrier.client.js';

@Injectable()
export class ShippingService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly carrierClient: CarrierClient,
  ) {}

  async getQuotes(orderId: string, signal: AbortSignal): Promise<ShippingQuote[]> {
    const order = await this.ordersService.findOne(orderId);
    return this.carrierClient.getQuotes(order, signal);
  }

  flatRateQuotes(): ShippingQuote[] {
    return [{ service: 'flat-rate', price: 4.99, estimatedDays: 5 }];
  }

  async createShipment(orderId: string, signal: AbortSignal): Promise<Shipment> {
    const order = await this.ordersService.findOne(orderId);
    return this.carrierClient.createShipment(order, signal);
  }
}
```

现在路线。`@Resilience('carrier')` 应用预设，`@Signal()` 注入当前尝试的 `AbortSignal`：

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { Resilience, Signal, Timeout } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('quotes')
  @Resilience('carrier')
  @Timeout('1.5s')
  getQuotes(@Query('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shippingService.getQuotes(orderId, signal);
  }
}
```

将 `CarrierClient` 和 `ShippingService` 注册为导入 `OrdersModule` 的 `ShippingModule` 的提供程序，将 `ShippingController` 注册为控制器。

结账不能等太久，所以 `@Timeout('1.5s')` 给这个路由比预设的更紧的预算。设置解决**逐级**：处理程序上的装饰器赢得了自己阶段的预设，预设仍然提供重试和破坏者。裸体 `@Timeout()` 将花费预设的 2 秒，然后回落到 `defaults.timeout` 仅当没有预设或类级别 `@Timeout()` 设置持续时间。

当一次尝试用完时，会发生三件事：

1. 尝试以 `ResilienceTimeoutError` 被拒绝。
2. 信号因相同的错误而中止。`fetch()` 拒绝并关闭连接，因此没有什么可以等待没有人会阅读的答案。取消是合作的：忽略信号的代码继续在后台运行，其结果被丢弃。
3. 因为 `GET` 是一种安全的方法，预设的重试进行第二次尝试。只有管道、内部拦截器和处理程序再次运行。防护和中间件每个请求运行一次。

如果第二次尝试也超时，客户端会得到一个 `504`：

```json
{
  "statusCode": 504,
  "error": "Gateway Timeout",
  "message": "The operation timed out",
  "code": "TIMEOUT"
}
```

超时适用于**每次尝试**，因此挂起的载波在这条路线上花费大约 3.2 秒：两次 1.5 秒的尝试加上长达 200 毫秒的回退。状态是 504 而不是故意的 408。一个 408 声称_client_太慢而无法发送其请求，并且一些客户端和代理自动重复 408，甚至 `POST` 请求。

客户端错误不是失败。对未知订单的请求抛出 `NotFoundException` 在呼叫承运人之前。它响应 404，断路器既不重试也不计数。

> info **Hint** 不能将信号作为参数的代码可以注入 `ResilienceContext` 阅读它 `signal` 和 `attempt`.它从 `AsyncLocalStorage`，因此它可以在处理程序调用的任何服务中工作，在每次传输中。尝试中使用的策略对象也会继承其信号，因此路由的超时也会停止该策略的重试。

#### 断路器快速失效

预设的断路器记录每次尝试的结果。这个 `carrier` 断路器一旦至少看到 `minimumCalls` (10) 呼叫，并且至少 `failureRateThreshold` （50%）失败。默认情况下，它会查看最近 20 个呼叫。除了客户端错误和其他策略的拒绝，每个错误都算作失败，包括超时。客户端错误是 4xx `HttpException`，或 4xx 的任何其他错误 `status` 或者 `statusCode` 财产。这包括 `CarrierError`：当运营商应答时 `422` 对于格式错误的请求，它不会关闭，因此断路器会忽略错误，并且重试不会重复它。一个 `408` 或者 `429` 来自承运人是例外，因为这意味着承运人正在向后推，所以它算作一个 `5xx`.一个 `HttpException` 其中一个状态仍然是一个客户端错误：处理程序抛出它来回答自己的调用者，这并没有说明任何关于运营商的信息。要更改计数，请传递 `recordIf` 断路器选项中的功能。

当断路器**打开**时，呼叫会立即失败，根本不会呼叫运营商。客户得到一个 `503` 用一个 `Retry-After`header：断路器允许探测器通过的秒数。重试包装断路器，因此拒绝永远不会重试。

`openDuration`（30 s）后，断路器**半开**。它允许一个探测器调用（参见 `halfOpenMaxCalls`）。如果探测成功，断路器将关闭并以空窗口重新启动。如果失败，断路器将再打开 30 秒。断路器不使用定时器。它会在下一次调用时检查状态。

503 是正确的，但是 checkout 可以做得更好。在已知运营商处于停机状态时，添加一个提供统一费率报价的备份（从 `@nestjs/resilience` 导入 `Fallback` 和 `CircuitOpenError`）：

```typescript
@Get('quotes')
@Resilience('carrier')
@Timeout('1.5s')
@Fallback('flatRateQuotes', {
  handleIf: (error) => error instanceof CircuitOpenError,
})
getQuotes(@Query('orderId') orderId: string, @Signal() signal: AbortSignal) {
  return this.shippingService.getQuotes(orderId, signal);
}

flatRateQuotes() {
  return this.shippingService.flatRateQuotes();
}
```

`@Fallback()` 获取同一类上的方法或函数的名称。TypeScript 检查该类是否有一个同名的方法。回退与错误和 `ExecutionContext` 一起调用，它返回的任何内容都成为响应。它可以是一个值、`Promise` 或 `Observable`。回退是最外层的阶段，所以它也看到断路器的拒绝。

默认情况下，回退会替换除客户端错误之外的所有错误。这个 `handleIf` 选项缩小了范围。统一费率会让商店在沉重的包裹（例如垃圾袋）上花费金钱，因此这是最后的手段：只有当断路器显示承运人停运时，它们才会被送达，并且一个缓慢的回答仍然会得到 504。

> info **Hint** 要从您自己的代码中查看断路器，请注入 `ResilienceService` 并调用 `circuitBreaker('carrier')`。断路器暴露 `state` 和 `stats`，您可以使用 `trip()` 和 `reset()` 强制打开或关闭它。

#### Cap 并发 CSV 带隔板的出口

后台将所有订单下载为 CSV 文件。构建文件会读取每个订单，并且对数据库和 CPU 都有很大的负担。一次两次出口没问题，但二十次出口会减慢每个人的结账速度。隔板限制了同时运行的数量：

```typescript
import { Controller, Get, Header } from '@nestjs/common';
import { Bulkhead } from '@nestjs/resilience';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Bulkhead({ maxConcurrent: 2, maxQueue: 3, queueTimeout: '10s' })
  export() {
    return this.ordersService.exportCsv();
  }
}
```

同时运行两个导出。最多等待三个插槽，每个插槽最多等待 10 秒。第六个请求得到一个 `503` 马上，等待请求在 10 秒结束后也是如此：

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "message": "Server is at capacity",
  "code": "BULKHEAD_FULL"
}
```

这个 503 没有 `Retry-After` 头，因为没有人知道插槽什么时候会释放。状态是 503 而不是 429，因为 429 归咎于客户端的请求速率，而满隔板意味着服务器对每个人都有容量。

一个时隙一直被占用，直到处理程序完成，或者直到路由上的超时放弃尝试。忽略其信号的处理程序会在后台继续运行，在隔板的计数之外，这是将信号传递给每个接受信号的调用的另一个原因。没有名称的隔板属于其处理程序，并以处理程序的名称注册。要读取其负载，请注入 `ResilienceService` 看看 `bulkhead('OrdersController.export')`，它有 `active` 和 `queued` 计数。给舱壁一个 `name` 在多个处理程序之间共享一个槽池。

#### 重试 POST 安全地

到目前为止，重试只发生在 `GET` 上。那是故意的。在 HTTP 上，重试仅适用于安全方法 `GET`、`HEAD` 和 `OPTIONS`，在 GraphQL 上，仅适用于查询。运行 `POST` 两次可能会创建两次发货，而包无法知道这是否无害。因此，预设的重试在 `POST` 上被简单地跳过。直接放置在 `POST` 处理程序上的 `@Retry()` 装饰器也会被跳过，bootstrap 会对此发出警告：

```bash
WARN [ResilienceModule] @Retry() on ShippingController.createShipment() is inactive: it only re-runs safe operations (GET, HEAD, OPTIONS, GraphQL queries). If the handler is safe to repeat, use @Retry({ idempotent: true }).
```

重复预订货件是安全的，因为承运人通过以下方式对货件进行重复数据删除 `reference`，这是订单 id。这也很重要，还有另一个原因：超时的预订可能仍然由承运人处理，所以无论如何重试都必须是安全的。设置 `idempotent: true` 在 `@Retry()` 如何说明在一个请求中运行处理程序两次是可以的：

```typescript
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Idempotent } from '@nestjs/idempotency';
import { CircuitOpenError, Fallback, Resilience, Retry, Signal, Timeout } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('quotes')
  @Resilience('carrier')
  @Timeout('1.5s')
  @Fallback('flatRateQuotes', {
    handleIf: (error) => error instanceof CircuitOpenError,
  })
  getQuotes(@Query('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shippingService.getQuotes(orderId, signal);
  }

  flatRateQuotes() {
    return this.shippingService.flatRateQuotes();
  }

  @Post('shipments')
  @Idempotent()
  @Resilience('carrier')
  @Retry({ idempotent: true })
  createShipment(@Body('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shippingService.createShipment(orderId, signal);
  }
}
```

处理程序级别 `@Retry()` 逐字段合并到预设的重试中。您设置的字段获胜，其余的来自预设，然后来自 `defaults.retry`.所以这个路由保留预设的 2 次尝试，只添加 `idempotent: true`.预设的 2 秒超时及其断路器仍然适用。只有装修师才会说 `idempotent: true`：预设不能声明每个使用它的处理程序都可以安全地重复。

`idempotent: true` 和 `@Idempotent()` 解决两个不同的问题：

- `idempotent: true` 允许**服务器**在一个请求内重新运行处理程序。
- `@Idempotent()` 对整个请求的**客户端**重试进行重复数据删除。当客户端重复请求时 `Idempotency-Key` 头，它取回存储的响应，处理程序不再运行。

注册 `IdempotencyModule` **之前** `ResilienceModule`：

```typescript
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@nestjs/idempotency';
import { ResilienceModule } from '@nestjs/resilience';
import { OrdersModule } from './orders/orders.module.js';
import { ShippingModule } from './shipping/shipping.module.js';

@Module({
  imports: [
    // Import order matters: the first global interceptor runs outermost.
    IdempotencyModule.forRoot({}),
    ResilienceModule.forRoot({
      defaults: {
        timeout: '5s',
        retry: { attempts: 3, backoff: { delay: '200ms', maxDelay: '2s' } },
      },
      presets: {
        carrier: {
          timeout: '2s',
          retry: { attempts: 2 },
          circuitBreaker: { failureRateThreshold: 50, minimumCalls: 10, openDuration: '30s' },
        },
      },
    }),
    OrdersModule,
    ShippingModule,
  ],
})
export class AppModule {}
```

两个模块都注册了一个全局拦截器，首先导入的拦截器运行在最外面。使用此顺序：

- 重播，或 `409` 对于仍在飞行中的密钥，在任何重试、中断或超时运行之前应答。即使断路器打开，也已经成功重播的预订。
- 一个请求的所有重试都发生在单个声明密钥下。
- 在重试和任何回退之后，存储的响应是最终结果。
- 一个 `503` 或者 `504` 是一个 5xx 响应，因此密钥被释放，客户端可以稍后使用相同的密钥再次尝试。

释放 `504` 上的键会有陷阱。一旦超时响应，密钥就会被释放，但超时运行可能仍在进行中，或者可能已经到达运营商，因此使用相同密钥的重试可能会与它重叠。这就是为什么副作用必须安全地在下游重复，就像载体使用 `reference` 一样。像 `createShipment()` 那样传递信号会更快地停止本地工作。

#### 在服务中使用相同的策略

待处理订单在其 `total` 中包含运费估算。每隔 15 分钟，一个后台作业就会重新引用它们。该作业不是入口点，因此它使用一个**策略对象**，您可以从 `ResilienceService` 获得该对象：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { CircuitOpenError, ResilienceService, type ResiliencePolicy } from '@nestjs/resilience';
import { subtotal } from '../orders/order.js';
import { OrdersService } from '../orders/orders.service.js';
import { CarrierClient } from './carrier.client.js';

@Injectable()
export class RepricingService {
  private readonly logger = new Logger(RepricingService.name);
  private readonly resiliencePolicy: ResiliencePolicy;

  constructor(
    resilience: ResilienceService,
    private readonly ordersService: OrdersService,
    private readonly carrierClient: CarrierClient,
  ) {
    this.resiliencePolicy = resilience.preset('carrier');
  }

  /** Refreshes the shipping part of every pending order's total. */
  async repricePendingOrders(): Promise<number> {
    const pending = (await this.ordersService.findAll()).filter((order) => order.status === 'pending');
    let repriced = 0;
    for (const order of pending) {
      try {
        const quotes = await this.resiliencePolicy.execute(
          ({ signal }) => this.carrierClient.getQuotes(order, signal),
          { source: 'RepricingService.repricePendingOrders' },
        );
        const shipping = Math.min(...quotes.map((quote) => quote.price));
        await this.ordersService.update(order.id, { total: subtotal(order) + shipping });
        repriced++;
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          this.logger.warn(`The carrier is unavailable, stopping after ${repriced} of ${pending.length} orders`);
          break;
        }
        this.logger.error(`Could not reprice order ${order.id}`, (error as Error).stack);
      }
    }
    return repriced;
  }
}
```

将 `RepricingService` 添加到 `ShippingModule` 的提供程序中，并从计划作业调用 `repricePendingOrders()`（参见 [Task scheduling](/application/task-scheduling#declarative-cron-jobs)）。

`resilience.preset('carrier')` 将预设作为一个策略返回。它的断路器是路由使用的**同一实例**，因此作业和结帐会在两个方向上共享它们对承运人的了解：

- 当断路器打开时，作业得到一个 `CircuitOpenError` 立即停止，而不是在每个订单上花费超时。
- 如果作业是第一个发现运营商故障的，它的故障会打开断路器，结帐服务统一费率，而无需先等待超时。

一些细节与入口点不同：

- `execute()` 传递您的函数尝试的 `signal` 和 `attempt` 数字。这个 `source` 选项标记此调用发出的事件。
- 策略对象没有 `GET` 或者 `POST` 看，所以预设的重试**总是**适用。只包装可以安全重复的调用（引号是）。
- 路线的 `@Timeout('1.5s')` 属于路线。该作业获得预设的 2 秒。
- 创建一次策略，例如在构造函数中，而不是在每次调用时。对于非预设选项，请使用 `resilience.create(options, name)`。

为什么不把 `@Retry()` 放在 `repricePendingOrders()` 上？弹性修饰器是全局拦截器读取的元数据，拦截器仅在入口点周围运行。在 provider 方法上，decorator 什么也不做，所以 bootstrap 会警告：

```bash
WARN [ResilienceModule] Resilience decorators on RepricingService.repricePendingOrders() have no effect: RepricingService is not a controller, resolver or gateway. They apply to entrypoints only. Inside services, use a policy object (ResilienceService.preset() or create(), or new RetryPolicy() etc.).
```

这是一个深思熟虑的选择，原因有三：

- 包装任意提供程序方法会错过请求作用域和瞬态实例，这 Nest 引导后创建。
- 隐藏在服务深处的重试倍增。进行 3 次尝试的路由，调用进行 3 次尝试的服务，调用 SDK 这将进行 3 次尝试，向已经在挣扎的依赖项发送多达 27 个请求。
- 策略对象在调用站点上是可见的，在那里您可以看到它的作用。

> info **Hint** 没有装饰器的入口点仍然会映射弹性错误。如果服务抛出 `CircuitOpenError` 在普通路由中，客户端得到一个 `503` 和 `Retry-After`.设置 `mapErrors: false` 在模块选项中关闭此功能。

#### 其他运输

相同的装饰器处理微服务处理程序。仓库服务要求报价 TCP 重新打包订单时：

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Resilience, Retry, Signal } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@Controller()
export class ShippingHandlers {
  constructor(private readonly shippingService: ShippingService) {}

  @MessagePattern('shipping.quotes')
  @Resilience('carrier')
  @Retry({ attempts: 3 })
  getQuotes(@Payload() data: { orderId: string }, @Signal() signal: AbortSignal) {
    return this.shippingService.getQuotes(data.orderId, signal);
  }
}
```

将 `ShippingHandlers` 添加到 `ShippingModule` 的 `controllers` 中。

消息没有 `GET` 或者 `POST` 要判断重复是否安全，因此在消息、事件和 WebSocket 处理程序上，只有一个 `@Retry()` 处理程序本身打开重试。预设的重试，或类级别 `@Retry()` 没有 `idempotent: true`，它本身并不适用于那里，所以重用 `carrier` 预设不能静默地重新运行有副作用的处理程序。这是处理器 `@Retry()` 选择加入，其 `attempts: 3` 将预设的 2 次尝试提高到 3 次。仅在可以安全运行两次的处理程序上使用它。错误到达呼叫者 `RpcException` 对于结构化有效载荷：

```json
{ "status": "error", "code": "CIRCUIT_OPEN", "statusCode": 503, "message": "Service temporarily unavailable", "retryAfter": 30 }
```

超时有 `"code": "TIMEOUT"` 和 `"statusCode": 504`，没有 `retryAfter`。在混合应用程序中，将微服务与 `inheritAppConfig: true` 连接，否则全局拦截器将无法到达其处理程序（参见 [Hybrid application](/faq/hybrid-application#sharing-configuration)）：

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>(
    { transport: Transport.TCP, options: { port: 3001 } },
    { inheritAppConfig: true },
  );
  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

GraphQL 旋转变压器的工作方式相同。如果您的应用程序服务 GraphQL，将解析器添加到 `ShippingModule` 的提供者：

```typescript
import { Args, Field, Float, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Resilience, Signal, Timeout } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@ObjectType('ShippingQuote')
export class ShippingQuoteModel {
  @Field() service: string;
  @Field(() => Float) price: number;
  @Field(() => Int) estimatedDays: number;
}

@Resolver(() => ShippingQuoteModel)
export class ShippingResolver {
  constructor(private readonly shippingService: ShippingService) {}

  @Query(() => [ShippingQuoteModel], { nullable: true })
  @Resilience('carrier')
  @Timeout('1.5s')
  shippingQuotes(@Args('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shippingService.getQuotes(orderId, signal);
  }
}
```

查询被重试，而突变需要 `idempotent: true`，就像 `POST` 请求。失败只会使自己的字段失败。响应仍然具有状态 200，并且错误携带代码 `extensions`:

```graphql
{ shippingQuotes(orderId: "1001") { service price } }
```

```json
{
  "errors": [
    {
      "message": "The operation timed out",
      "locations": [{ "line": 1, "column": 3 }],
      "path": ["shippingQuotes"],
      "extensions": { "code": "TIMEOUT", "httpStatus": 504 }
    }
  ],
  "data": { "shippingQuotes": null }
}
```

开放式断路器报告 `"code": "CIRCUIT_OPEN"`,`"httpStatus": 503` 和 `"retryAfter"` 在几秒钟内。软件包集 `httpStatus` 而不是阿波罗的 `extensions.http` 因为阿波罗会申请 `extensions.http` 到整个响应，尽管只有一个字段失败。

#### 观察断路器转换

每个策略都会发出类型化事件： `retry`, `timeout`, `circuit-open`, `circuit-half-open`, `circuit-closed`, `circuit-rejected`, `bulkhead-rejected`, `rate-limited` 和 `fallback`.每个事件都携带 `policy` 名称及其 `source` 当有一个时：入口点（例如 `ShippingController.getQuotes`）或传递给 `execute()`.注射 `ResilienceEvents` 得到它们：它 `events$` 是此应用程序策略中每个事件的 RxJS 流。记录某人应该看到的：

```typescript
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ResilienceEvents } from '@nestjs/resilience';

@Injectable()
export class ResilienceLogger implements OnModuleInit {
  private readonly logger = new Logger('Resilience');

  constructor(private readonly resilienceEvents: ResilienceEvents) {}

  onModuleInit() {
    this.resilienceEvents.events$.subscribe((event) => {
      switch (event.type) {
        case 'circuit-open':
        case 'circuit-half-open':
        case 'circuit-closed':
          this.logger.warn(`Circuit "${event.policy}" went from ${event.from} to ${event.to}`);
          break;
        case 'bulkhead-rejected':
          this.logger.warn(`${event.source} is at capacity (${event.active} running, ${event.queued} queued)`);
          break;
        case 'fallback':
          this.logger.log(`${event.source} answered with its fallback`);
          break;
      }
    });
  }
}
```

将 `ResilienceLogger` 添加到 `AppModule` 的 `providers` 数组中。

每个策略还将每个事件发布到 [诊断通道](https://nodejs.org/api/diagnostics_channel.html) 它自己的，例如 `nestjs:resilience:timeout` 或者 `nestjs:resilience:circuit-open`，包括在没有模块的情况下创建的策略。指标和跟踪工具可以订阅，而不依赖于这个包。`ResilienceTimeoutEvent` 是一个通道的消息类型，并且 `ResilienceEvent` 他们所有人的联合：

```typescript
import { subscribe } from 'node:diagnostics_channel';
import type { ResilienceTimeoutEvent } from '@nestjs/resilience';

const timeouts = new Map<string, number>();

subscribe('nestjs:resilience:timeout', (message) => {
  const { policy } = message as ResilienceTimeoutEvent;
  timeouts.set(policy, (timeouts.get(policy) ?? 0) + 1);
});
```

[NestJS Observe](/observability/overview#what-it-offers) 已经从 Node 的诊断通道读取出站 HTTP（参见 [Database queries and outbound HTTP](/observability/sdk#database-queries-and-outbound-http)）。它还没有订阅 `nestjs:resilience` 频道。一旦这样做了，它就可以将重试和超时附加到请求的跨度、每个名称的图表断路器状态以及隔板拒绝的警报，两个包中都没有依赖于另一个包的代码。

#### 试试

以 `CARRIER_URL` 指向您控制的载波存根启动应用程序，例如模拟服务器或几行 `node:http`。当运营商回答时，checkout 会收到实时报价：

```bash
$ curl "localhost:3000/shipping/quotes?orderId=1001"
[{"service":"ground","price":6.9,"estimatedDays":4},{"service":"express","price":14.5,"estimatedDays":1}]
```

现在把树桩挂起来。相同的请求响应 `504` 大约 3 秒钟后，存根看到它的两个请求都被取消了：

```bash
$ curl "localhost:3000/shipping/quotes?orderId=1001"
{"statusCode":504,"error":"Gateway Timeout","message":"The operation timed out","code":"TIMEOUT"}
```

继续发。每个请求记录两次失败的尝试。在第五个慢请求上，断路器窗口中有 10 个调用，其中 9 个失败。断路器打开，请求的第二次尝试被拒绝，后备响应。应用程序日志：

```bash
WARN [Resilience] Circuit "carrier" went from closed to open
LOG [Resilience] ShippingController.getQuotes answered with its fallback
```

从现在起，如果不致电承运人，预订货件将很快失败：

```bash
$ curl -i -X POST localhost:3000/shipping/shipments \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: 5f1c2a9e-shipment-1001" \
    -d '{"orderId":"1001"}'
HTTP/1.1 503 Service Unavailable
Retry-After: 30

{"statusCode":503,"error":"Service Unavailable","message":"Service temporarily unavailable","code":"CIRCUIT_OPEN"}
```

报价，同时，立即用统一费率回答：

```bash
$ curl "localhost:3000/shipping/quotes?orderId=1002"
[{"service":"flat-rate","price":4.99,"estimatedDays":5}]
```

让存根再次回答，等待 30 秒。下一个报价请求是探针。它成功了，所以断路器关闭，结帐再次显示实时报价：

```bash
WARN [Resilience] Circuit "carrier" went from open to half-open
WARN [Resilience] Circuit "carrier" went from half-open to closed
```

现在，使用相同的 `Idempotency-Key` 重复预订将创建装运并返回 `201`。早期的 503 释放了密钥。

#### 检测

弹性行为值得测试，但不是通过等待 30 秒来测试断路器。取代 `CarrierClient` 用一个假的，用 Vitest 时钟的假计时器。仅限假货 `setTimeout`,`clearTimeout` 和 `Date`，这样 HTTP 服务器和超级测试继续与真实的 I/O 一起工作：

```typescript
import type { INestApplication } from '@nestjs/common';
import { ResilienceService } from '@nestjs/resilience';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CarrierClient } from '../src/shipping/carrier.client.js';

const liveQuotes = [{ service: 'ground', price: 6.9, estimatedDays: 4 }];

/** A carrier call that only ends when its signal aborts. */
const hang = (_order: unknown, signal: AbortSignal) =>
  new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));

describe('Shipping quotes', () => {
  let app: INestApplication;
  const carrier = { getQuotes: vi.fn(), createShipment: vi.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CarrierClient)
      .useValue(carrier)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    // Fake only timers and Date: the HTTP server and supertest keep real I/O.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.resetAllMocks();
    await app.close();
  });

  it('answers 504 and cancels the carrier call when the carrier hangs', async () => {
    carrier.getQuotes.mockImplementation(hang);

    // .then() sends the request now; the clock only moves when we advance it.
    const response = request(app.getHttpServer())
      .get('/shipping/quotes?orderId=1001')
      .then((res) => res);
    await vi.waitFor(() => expect(carrier.getQuotes).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(5_000); // two attempts of 1.5 s, plus backoff

    expect((await response).status).toBe(504);
    expect(carrier.getQuotes).toHaveBeenCalledTimes(2);
    const [, signal] = carrier.getQuotes.mock.calls[0];
    expect(signal.aborted).toBe(true);
  });

  it('serves flat rates while the breaker is open, then recovers', async () => {
    carrier.getQuotes.mockResolvedValue(liveQuotes);
    const breaker = app.get(ResilienceService).circuitBreaker('carrier');
    breaker.trip();

    const fallback = await request(app.getHttpServer()).get('/shipping/quotes?orderId=1001');
    expect(fallback.body).toEqual([
      { service: 'flat-rate', price: 4.99, estimatedDays: 5 },
    ]);
    expect(carrier.getQuotes).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000); // openDuration: the next call is a probe
    const live = await request(app.getHttpServer()).get('/shipping/quotes?orderId=1001');
    expect(live.body).toEqual(liveQuotes);
    expect(breaker.state).toBe('closed');
  });
});
```

有几件事可以做到这一点：

- `vi.waitFor()` 等待，直到请求实际到达运营商。只有这样才有前进的计时器。启用假计时器后，`vi.waitFor()` 还会移动时钟的轮询间隔（50 毫秒），该间隔保持在 1.5 秒的预算内。
- `vi.advanceTimersByTimeAsync()` 按顺序触发超时和回退，并让中间的承诺结算。
- `trip()` 直接打开断路器，这样你就不必产生十次故障来测试打开状态。因为断路器检查 `openDuration` 反对 `Date` 在下一个通话中，将假时钟向前移动足以使该通话成为一个探测。
- 断路器、隔板和出站速率限制属于创建它们的应用程序，因此每个测试应用程序都以新鲜状态开始。
- 要使用不同的设置进行测试，例如较短的 `openDuration`，请使用 `overrideProvider(RESILIENCE_MODULE_OPTIONS)` 覆盖模块的选项。

看 [End-to-end testing](/fundamentals/testing#end-to-end-testing) 测试基础知识。

#### 生产检查表

- **预算时间端到端。**每次尝试的时间乘以尝试次数，加上回退，必须符合客户端的超时和负载平衡器的超时。对于报价路线，大约需要 3.2 秒。
- **仅在安全的情况下重试。**设置 `idempotent: true` 仅当同一请求内的第二次运行无害时。将其与 `@Idempotent()` 处理客户端重试。
- **将信号传递给每个 I/O 调用。**如果没有它，超时工作将继续在后台运行，而允许它的隔板看不到。
- **在一层重试。**在入口点或服务策略中重试，而不是两者都重试，并关闭 SDK 和 HTTP 下面的客户。
- **调整每个断路器的依赖关系。**`minimumCalls` 足够高，晚上两个错误打不开，设置 `openDuration` 接近依赖项通常需要多长时间才能恢复，并使用 `recordIf` 排除不是中断的错误。
- **给每个断路器一个超时时间。**断路器只从结束的呼叫中学习。挂断的电话永远不会被计算在内，挂断的探头会让半开的断路器拒绝其他一切。
- **请记住，状态是每个进程的。**对于多个实例，每个实例都有自己的断路器、隔板和出站速率限制，重新启动会重新启动它们。每个断路器单独打开，隔板限制适用于每个实例，出站速率限制允许 `limit` 每个实例调用。
- **保持后备资源的廉价和独立性。**后备资源绝不能调用它所代表的依赖关系。
- **转换警报。**断路器打开和隔板拒绝请求是转页的信号。
- **注册一个幂等存储。**如果没有幂等存储，`@Idempotent()` 将其记录保存在每个进程的内存中，在每次重新启动或部署时丢失，并且生产拒绝启动。看 [Store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql) 在幂等教程中。
- **正确接线模块。**导入 `ResilienceModule` 一次，在根模块中，并且 `IdempotencyModule` 在此之前。使用 `inheritAppConfig: true` 用于混合应用。
- **尊重客户的重试。**它会告诉他们何时重试可以成功。

#### 参考

##### 模块选项

`ResilienceModule.forRoot()` 采取这些选项。`forRootAsync()` 从工厂构建相同的对象，一个实现 `ResilienceOptionsFactory`，或现有提供者。

| 选择 | 类型 | 默认的 | 描述 |
| --- | --- | --- | --- |
| `defaults` | `ResilienceDefaults` | 没有一个 | `retry`、`timeout`、`circuitBreaker` 和 `bulkhead` 的字段默认值。它们填充装饰器或预设打开的阶段，并且从不打开阶段。参见 [Register the module](/reliability/resilience#register-the-module)。 |
| `presets` | `Record<string, ResiliencePreset>` | 没有一个 | 命名阶段集：`retry`、`timeout`、`circuitBreaker`、`bulkhead`、`outboundRateLimit` 和 `fallback`。预设的断路器、隔板和出站速率限制在预设的名称下共享。 |
| `mapErrors` | `boolean` | `true` | 将任何处理程序抛出的弹性错误（无论是否有装饰器）转换为传输的错误，如下面的错误下所列。 |
| `isGlobal` | `boolean` | `true` | 全局注册模块。在根模块中注册一次。 |

每个时间值选项都需要毫秒或字符串，如 `'200ms'`、`'2s'` 或 `'15m'`。选项的注入令牌是 `RESILIENCE_MODULE_OPTIONS`。

##### 装饰师

每个装饰器都在一个处理程序或一个类上工作，除了 `@Signal()`，这是一个参数装饰器。

| 装饰师 | 选项（默认） |
| --- | --- |
| `@Retry(options)` | `attempts`（3，包括第一个；`Infinity` 重试，直到信号中止），`backoff`，`retryIf(error, attempt)`（除客户端错误外的所有错误），`idempotent`（参见 [Retry a POST safely](/reliability/resilience#retry-a-post-safely)）。`@Retry(5)` 设置 `attempts`，`@Retry(false)` 关闭继承的重试。 |
| `backoff`（来自 `@Retry()`） | `delay`(`'200ms'`),`factor`(2),`maxDelay`(`'30s'`),`jitter`:`'full'`,`'equal'` 或者 `'none'`(`'full'`, 或 `'none'` 何时 `factor` 是 1）。或者失败的尝试及其返回持续时间的错误的函数。 |
| `@Timeout(duration)` | 每次尝试的预算。如果没有参数，预设或类超时，则 `defaults.timeout`。 |
| `@CircuitBreaker(options)` | `name`、`failureRateThreshold`（50，百分比）、`minimumCalls`（10）、`slidingWindow`（最后 20 次调用：`type` 是 `'count'` 或 `'time'`，带有 `size`）、`openDuration`（`'30s'`）、`halfOpenMaxCalls`（1）、`recordIf(error)`（除客户端错误外的所有错误）。字符串是断路器名称。参见 [Fail fast with a circuit breaker](/reliability/resilience#fail-fast-with-a-circuit-breaker)。 |
| `@Bulkhead(options)` | `name`、`maxConcurrent`（10）、`maxQueue`（0）、`queueTimeout`（无限制）。字符串是隔板名称。参见 [Cap concurrent CSV exports with a bulkhead](/reliability/resilience#cap-concurrent-csv-exports-with-a-bulkhead)。 |
| `@Fallback(method, options)` | 同一个类或函数上的方法名，用错误和 `ExecutionContext` 调用。`handleIf(error)`（除客户端错误外的所有错误）。 |
| `@Resilience(preset)` | 应用预设从 `presets`，一步一步。 |
| `@Signal()` | 当前尝试是 `AbortSignal`。 |

预设的 `outboundRateLimit` 采取 `limit`（呼叫 `interval`),`interval` 和 `maxWait`（0：立即拒绝）。

`ResilienceService` 提供 `preset(name)`、`create(options, name)`、`circuitBreaker(name)`、`bulkhead(name)`、`circuitBreakers()` 和 `bulkheads()`。参见 [Use the same policies inside services](/reliability/resilience#use-the-same-policies-inside-services)。

##### 事件

每个事件都发布在 `ResilienceEvents.events$` 和诊断频道 `nestjs:resilience:<type>` 上。每个有效载荷都有 `type`、`policy`，如果有的话，还有 `source`（参见 [Observe breaker transitions](/reliability/resilience#observe-breaker-transitions)）。

| 类型 | 有效载荷类型 | 其他领域 |
| --- | --- | --- |
| `retry` | `ResilienceRetryEvent` | `attempt`（失败的那个，基于 1），`delayMs`（下一个之前的等待），`error` |
| `timeout` | `ResilienceTimeoutEvent` | `timeoutMs` |
| `circuit-open` | `ResilienceCircuitOpenEvent` | `from`,`to` |
| `circuit-half-open` | `ResilienceCircuitHalfOpenEvent` | `from`,`to` |
| `circuit-closed` | `ResilienceCircuitClosedEvent` | `from`,`to` |
| `circuit-rejected` | `ResilienceCircuitRejectedEvent` | `retryAfterMs` |
| `bulkhead-rejected` | `ResilienceBulkheadRejectedEvent` | `reason`(`'full'` 或者 `'queue-timeout'`),`active`,`queued` |
| `rate-limited` | `ResilienceRateLimitedEvent` | `retryAfterMs` |
| `fallback` | `ResilienceFallbackEvent` | `error` |

断路器的状态（`from` 和 `to`）是 `'closed'`、`'open'` 或 `'half-open'`。`ResilienceEvent` 是所有有效载荷类型的并集。

##### 错误

所有错误扩展 `ResilienceError`，它有一个 `code` 和 `policy` 名字。

| 错误 | 代码 | HTTP | 发送给客户端的消息 | 字段 |
| --- | --- | --- | --- | --- |
| `ResilienceTimeoutError` | `TIMEOUT` | 504 | 操作超时 | `timeoutMs` |
| `CircuitOpenError` | `CIRCUIT_OPEN` | 503，与 `Retry-After` | 服务暂时不可用 | `retryAfterMs` |
| `BulkheadFullError` | `BULKHEAD_FULL` | 503 | 服务器已达到容量 | `reason` |
| `OutboundRateLimitError` | `RATE_LIMITED` | 503，与 `Retry-After` | 超出依赖项的速率限制 | `retryAfterMs` |

在 microservice 和 WebSocket 处理程序上，错误是 `RpcException` 或 `WsException`，其有效载荷在几秒钟内具有 `status`、`code`、`statusCode`、`message`，对于知道它的拒绝，还有 `retryAfter`。在 GraphQL 上，该字段的误差在 `extensions` 中有 `code`、`httpStatus` 和 `retryAfter`（参见 [Other transports](/reliability/resilience#other-transports)）。
