# Distributed tracing

Source: https://docs.nestjs.com/observability/distributed-tracing

**跟踪**是您的应用程序在单个跟踪 id 下记录的所有内容：启动它的请求或作业，以及下面的每个跨度。在单个服务中，这是自动的。这个 SDK 工作开始时生成跟踪 id，以及下面的每个跨度（包括手动添加的跨度）[`TracerService`](/observability/manual-instrumentation)，继承它。

跨服务，这取决于渠道。HTTP 调用、队列作业和（打开 `@nestjs/microservices`12.0.4 或更高版本）TCP 和 Redis 运输工具本身携带跟踪 id；gRPC 其他微服务传输需要转发它。涉及多个服务的单个用户操作（一个 API 把粉丝叫来 gRPC 服务，或通过微服务传输发送到另一个应用程序的消息）仅当涉及的每个服务使用相同的跟踪 id 时，才会在仪表板中显示为**一个跟踪**。否则，每个服务都会创建自己的 via`traceIdGenerator`，并且该操作显示为多个断开的跟踪，每个服务一个。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/service-flow.webp" alt="Trace correlation across services" /></figure>

在需要转发的地方，它是应用程序代码，而不是仪表板设置，模式总是相同的：呼叫者将其当前跟踪 id 放在协议具有的任何信道上，而被叫方的 `traceIdGenerator` 读回去。此页面显示了每次传输的方法。

#### 正在读取当前跟踪 id

要将跟踪 id 转发到下游，服务首先读取它当前运行的跟踪 id。`TracerService.currentTraceId()` 返回它：

```typescript
import { Injectable } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';

@Injectable()
export class OrdersService {
  constructor(private readonly tracerService: TracerService) {}

  async report(orderId: string) {
    const traceId = this.tracerService.currentTraceId();
    // ...forward traceId to the next service
  }
}
```

它从相同的上下文存储中读取 `getAttribute()`/`setAttribute()`，但与那些不同的是，它不会抛出跟踪上下文。它返回 `null` 相反，从启动挂钩或其他未跟踪路径转发跟踪 id 的代码不需要 `try`/`catch`.如果代码可以在跟踪之外运行，请检查 `null` 在设置标题之前。

#### HTTP 二 HTTP

HTTP 两个方向的传播都是自动的。在进来的路上，默认 `traceIdGenerator` 采用一种成型良好的 `x-request-id` 头，否则铸造一个时间顺序 UUID(v7)。在离开的路上，SDK 将当前跟踪 id 添加为 `x-request-id` 对于尚未携带应用程序代码的出站请求，因此从一个检测服务到另一个检测服务的调用会落在同一个跟踪中，而没有应用程序代码。

出站传播涵盖每个受支持的 Node 版本上的 `fetch` 和 `undici`，包括 [HTTP 客户](/application/http-client)，以及 Node22.12 及更高版本上基于 `node:http`（axios、got、`@nestjs/axios`）构建的客户端，这是第一个允许在创建请求对象后添加标头的版本。若要限制哪些主机接收报头，或将其关闭，请参见 [`outgoing.http.propagateTraceId`](/observability/sdk#database-queries-and-outbound-http)。

在一个旧的 Node 版本使用基于 axios 的客户端，注册一次请求拦截器，以便自行转发 id：

```typescript
@Module({
  imports: [HttpModule],
})
export class OrdersModule implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly tracerService: TracerService,
  ) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      config.headers['x-request-id'] = this.tracerService.currentTraceId();
      return config;
    });
  }
}
```

> info **Hint** 许多反向代理和负载平衡器（nginx、Envoy、AWSALB）可以设置 `x-request-id` 每个入站请求。当他们这样做时，仪表板中的跟踪 id 将与代理访问日志中的请求 id 匹配。

#### gRPC

gRPC 没有标题，只有元数据。调用者将跟踪 id 作为元数据附加，并且 gRPC 服务覆盖 `traceIdGenerator` 将其读回，因为默认生成器不读取 gRPC 元数据：

```typescript
import { Metadata } from '@grpc/grpc-js';

const metadata = new Metadata();
const traceId = this.tracerService.currentTraceId();
if (traceId) {
  metadata.set('x-request-id', traceId);
}
this.heroesService.findOne({ id: 1 }, metadata);
```

```typescript
import { randomUUID } from 'node:crypto';

// gRPC service - passed to createObserveModule(), not forRoot()
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdGenerator: (call: any) => {
    const inbound = call.metadata?.get?.('x-request-id')?.[0];
    return typeof inbound === 'string' && inbound.length > 0
      ? inbound
      : randomUUID(); // no id was propagated - this call started its own trace
  },
});
```

参见 [gRPC](/microservices/grpc) 关于如何在调用双方读取和写入元数据的章节。

#### TCP,Redis,NATS 和其他微服务传输

在 `@nestjs/microservices`12.0.4 或更高版本，TCP 和 Redis 传输携带分组元数据，以及 `@nestjs/observe`0.3.0 或更高版本使用它。这个 SDK 将当前跟踪 id 附加到通过 `ClientProxy` 注册为供应商（例如，与 `ClientsModule`），以及默认值 `traceIdGenerator` 接收端采用它，因此不需要应用程序代码。

其他运输，以及 TCP 和 Redis 在早期版本中，没有元数据通道，只有消息有效载荷。在那里，跟踪 id 必须作为有效载荷本身内的字段传输：

```typescript
this.client.send('orders.report', {
  ...payload,
  traceId: this.tracerService.currentTraceId(),
});
```

```typescript
import { randomUUID } from 'node:crypto';

// receiving service
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdGenerator: (ctx: any) => ctx.getData()?.traceId ?? randomUUID(),
});
```

生成器接收传输的上下文对象，因此相同的代码适用于请求响应（`send()`）和基于事件的（`emit()`) 消息。

> warning **Warning** 相同 `traceIdGenerator` 被称为 HTTP 请求和 RPC 上下文相似。在一个 [混合应用](/faq/hybrid-application) 这对双方都有好处 HTTP 和微服务传输，防御性地写入生成器：检查 `headers` 首先，然后回到有效载荷。

#### GraphQL

无需额外配置 GraphQL 服务器位于同一服务的后面 HTTP 层。它加入任何跟踪 HTTP 代理已经为请求打开，该请求本身可能已经通过 `x-request-id` 如上所述。仅操作不封闭 HTTP 跟踪，如原始 WebSocket 上的订阅，需要单独处理，目前没有针对这种情况的内置传播挂钩。

#### 队列作业（BullMQ 和 Bull）

队列传播是自动的。当从跟踪操作（请求处理程序、RPC 处理程序，另一项工作），SDK 将当前跟踪 id 标记到作业的选项上，拾取作业的处理器在该 id 下运行，而不是创建自己的 id。请求及其排队的每个作业呈现为一个跟踪，不涉及应用程序代码：

```typescript
@Post()
async create(@Body() dto: CreateOrderDto) {
  const order = await this.ordersService.create(dto);
  // The job inherits this request's trace id
  await this.ordersQueue.add('send-confirmation', { orderId: order.id });
  return order;
}
```

这同样适用于 `@nestjs/bullmq` 和 `@nestjs/bull`, 为了 `add()` 和 `addBulk()`，以及 worker 是在与 producer 相同的进程中运行还是在单独的服务中运行：id 遍历 Redis 有了工作。重试作业保留它排队时使用的 id，因此每次尝试都落在同一个跟踪中。

有两个案例故意开始自己的痕迹：

- **可重复作业及 `@nestjs/schedule` 处理程序。**计划的寿命比注册它的操作长，因此每次触发都是它自己的跟踪，而不是附加到设置计划的任何请求的不断增长的跟踪的一部分。
- **在任何跟踪操作之外添加的作业**，例如从引导钩子或纯脚本。没有遗传的痕迹。

> info **Hint** 跟踪 id 存储在 `observeTraceId` 工作选择。将作业附加到跟踪 SDK 没有看到（例如，一个由非 Nestproducer），在添加作业时自行设置该选项。

> warning **Warning** 跟踪作业的继承要求 `@nestjs/observe`0.3.0 或更高版本，包括添加作业的服务和处理作业的服务。对于旧的生产者，作业没有 id，每次运行都会打开自己的跟踪，就像以前一样。

#### 仪表板中的跟踪是什么样子的

一旦服务就跟踪 id 达成一致，跟踪详细信息页面就会将在其下运行的每个执行（跨服务、请求和作业）呈现为一个瀑布：嵌套深度作为缩进，持续时间作为条形长度，水平位置作为跨度运行时。阅读时，请记住以下几点：

- **自我时间**是重要的数字。跨度的持续时间减去其子跨度所占的时间就是跨度在自己的代码中花费的时间。按总持续时间排名总是把控制器放在最上面（它包含了一切）；按自我时间排序浮出水面，实际上消耗了时间的存储库调用。每个执行页面都带有一个以这种方式排序的跨度表。
- **重叠的子级将被标记。**当跨度的子级总和大于跨度本身的持续时间时，它们将同时运行（`Promise.all`，平行扇出），行是这么说的。
- **标记失败的跨度**，执行页面将显示第一个抛出的跨度的错误卡 - 类、消息、标记了抛出帧的修剪堆栈跟踪及其周围的源行 [`sourceContext`](/observability/sdk#error-source-context) 开着。
- **日志放在 trace 的时钟上。**`forwardLogs` 启用后，每条线都放置在与轨迹起点的偏移量处，并用写入时的飞行跨度进行标记；悬停一条线在瀑布上立即标记。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/traces.webp" alt="Trace waterfall" /></figure>

对于任何失败或异常缓慢的执行，**复制代理提示**按钮会将整个页面（上下文、错误、带源的堆栈跟踪、自我时间的顶部跨度和日志）打包为编码代理的独立降价提示。参见 [Dashboard](/observability/dashboard#handing-a-failure-to-a-coding-agent)。
