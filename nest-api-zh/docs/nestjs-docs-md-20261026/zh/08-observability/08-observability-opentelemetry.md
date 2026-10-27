# OpenTelemetry

Source: https://docs.nestjs.com/observability/opentelemetry

[OpenTelemetry](https://opentelemetry.io/) 是跟踪、度量和日志的供应商中立标准。您对应用程序进行一次仪器测试，然后将数据发送到任何兼容的后端 - Jaeger、Grafana Tempo 或接受 OpenTelemetry 协议的众多供应商之一（OTLP）-以后无需接触应用程序代码即可更改后端。

对于一个 NestJS 后端，我们推荐 [NestJS Observe](/observability/overview) 反而。本页解释了为什么，以及何时 OpenTelemetry 仍然是更好的选择。如果您需要 OpenTelemetry，[设置](#zero-code-setup) 如下。

#### 为什么我们推荐 NestJS 观察

开放式遥测仪器 aNode.js 从外部应用：它修补 HTTP 服务器、路由器和数据库驱动程序加载时。它没有办法看到结构 Nest 介于两者之间，因此跟踪可以读入库的词汇表。缓慢的 `POST /orders` 在 OpenTelemetry 后端中看起来大致是这样的 NestJS11（上 NestJS12、两个 Nest 跨度也丢失了）：

```bash
POST /orders                          1,812 ms
  OrdersController.create             1,806 ms
    create                            1,806 ms
      pg.query SELECT customers          11 ms
      POST api.stripe.com             1,747 ms
```

NestJS 从内部观察仪器框架。Nest 将它交给它创建的每个提供程序，通过 `instrument` 选择 `NestFactory.create()` 因此，控制器、服务、存储库、防护、拦截器或管道上的每个方法调用都会变成一个以您命名的方式命名的跨度。观察中的相同请求：

```bash
POST /orders                          1,812 ms
  AuthGuard.canActivate                   3 ms
  OrdersController.create             1,806 ms   self 1 ms
    OrdersService.create              1,805 ms   self 6 ms
      CustomersService.findById          12 ms
        SELECT customers                 11 ms
      PricingService.quote               38 ms
      PaymentsService.charge          1,749 ms
        POST api.stripe.com           1,747 ms
```

没有人为 `PricingService.quote` 写一个跨度，也没有人事先猜到它可能很重要。因为树是完整的，所以 Observe 可以计算每个方法在自己身上花费的时间（自我时间），而不是让它去猜测。使用 OpenTelemetry，获得相同的树意味着手动为您关心的每个方法添加一个跨度——必须编写、保持最新的代码，并且只涵盖某人已经怀疑的内容（参见 [Adding your own spans](#adding-your-own-spans)）。

在请求之后，差异仍然存在：

- **无需运行。** OpenTelemetry 管道是一个 SDK、一个导出器（通常是一个收集器）和一个用于存储、查询和提醒数据的后端。观察是一个命令 `npx @nestjs/observe link`，它安装 SDK，将其连接到您的应用程序中，并将 API 键写入 `.env`。没有收集器，也没有后端操作。
- **Nest 的构建块，记录为它们是什么。**队列消费者，`@Cron()` 处理程序，GraphQL 解析器、微服务处理程序和 WebSocket 网关都被记录为它们自己的操作类型，BullMQ 或 Bull 作业与排队它的请求共享一个跟踪。
- **与框架保持同步。** Observe 由 Nest 团队，并肩 Nest 本身。开放式遥测 Nest 相比之下，仪器不支持 NestJS 12 还（见 [What gets recorded for Nest](#what-gets-recorded-for-nest)).
- **不仅仅是跟踪。**错误监控与源上下文、队列等待时间和重试、每个类的时间去向细分、运行时概要分析以及相同的发布 SDK，在每个计划上，包括免费层。

Observe 故意比 OpenTelemetry 窄，而且权衡是真实的：

- 是 NestJS 在 Node.js 只有。在同一请求路径中用另一种语言编写的服务不会出现在跟踪中，服务通过 `x-request-id` 标题（参见 [Distributed tracing](/observability/distributed-tracing)），而不是 W3C`traceparent`OpenTelemetry 传播的标题。
- 这是一个托管服务，它不导出或接收 OTLP 当今。它的跟踪不能发送到 OpenTelemetry 后端，而是从 OpenTelemetry 跨越 SDK 不要出现在观察中。
- 它的图书馆覆盖范围较窄。Redis 和 Kafka 例如，客户端呼叫不会记录为跨度。

因此，当供应商中立、将遥测保留在您自己的基础架构上或跨用多种语言编写的服务的一个跟踪是一个硬性要求时，请选择 OpenTelemetry。对于 NestJS 后端上的其他所有内容——尤其是如果您今天没有跟踪，因为没有人有一周的时间来构建管道——从 [NestJS Observe](/observability/overview) 开始。

两者可以安装在同一个应用程序中，但两者都挂钩数据库驱动程序，因此请先在暂存环境中尝试组合。他们没有共同点。有关这种权衡的更多讨论，请参见 [NestJS and OpenTelemetry: why we instrument the framework instead](https://dev.to/nestjs/nestjs-and-opentelemetry-why-we-instrument-the-framework-instead-50i6)。

#### 零代码设置

> info **Hint** OpenTelemetry 的大部分 Node.js 文档假设编译后的应用程序作为 CommonJS 运行。生成的应用程序 `nest new` 在 Nest12 是 ES 模块，需要一个额外的加载程序标志。两种变体如下所示。

提取痕迹的最快方法 Nest 应用是 OpenTelemetry 的零代码仪器。安装 API 以及自动仪表包：

```bash
$ npm i --save @opentelemetry/api @opentelemetry/auto-instrumentations-node
```

仪器必须在 Nest 和它修补的库之前加载，因此它在 `node` 命令行上运行，而不是进入 `main.ts`。对于 CommonJS 构建：

```bash
$ OTEL_SERVICE_NAME=orders-api \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node --require @opentelemetry/auto-instrumentations-node/register dist/main.js
```

对于一个 ES 模块构建，还需要 OpenTelemetry 的加载器挂钩：

```bash
$ OTEL_SERVICE_NAME=orders-api \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node --experimental-loader=@opentelemetry/instrumentation/hook.mjs \
  --import @opentelemetry/auto-instrumentations-node/register dist/main.js
```

如果您的平台为您启动了该过程，而您无法更改命令，请将相同的标志放入 `NODE_OPTIONS` 环境变量。

跨度被发送 OTLP 到您配置的端点。要在本地查看它们，Jaeger 在一个容器中运行并接受 OTLP 端口 4318：

```bash
$ docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/jaeger
```

打开 `http://localhost:16686`，向您的应用程序发送请求，跟踪将显示在您设置的服务名称下。

#### 配置 SDK 在代码中

要自行选择导出器、采样器或仪器，请启动 SDK 从您自己的文件而不是 `register` 入口点：

```bash
$ npm i --save @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http
```

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export const otelSdk = new NodeSDK({
  serviceName: 'orders-api',
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

otelSdk.start();
```

`OTLPTraceExporter` 从 `OTEL_EXPORTER_OTLP_ENDPOINT` 读取其端点，并默认为 `http://localhost:4318`。先加载文件，方法与零代码入口点相同：

```bash
# CommonJS
$ node --require ./dist/instrumentation.js dist/main.js

# ES modules
$ node --experimental-loader=@opentelemetry/instrumentation/hook.mjs \
  --import ./dist/instrumentation.js dist/main.js
```

在 CommonJS 版本中，您可以在 `main.ts` 的第一行导入文件，在 `@nestjs/core` 和 `AppModule` 之前。在 ES 模块构建中，这是不够的，因为加载程序钩子必须在命令行上注册。

这个 SDK 批量出口跨越。若要在应用程序停止时发送最后一批，请调用 `otelSdk.shutdown()` 一次 Nest 已完成关闭，例如从 `onApplicationShutdown()` 挂钩 [关闭挂钩](/fundamentals/lifecycle-events#application-shutdown) 已启用。

#### 记录什么 Nest

自动仪表包记录传入和传出 HTTP 请求（包括 `fetch`),Express 以及常见的数据库驱动程序，如 `pg`,`mysql2`,`mongodb` 还有猫鼬。基于这些驱动程序构建的 ORM，例如 TypeORM、微蠕虫和 Drizzle，通过它们运行的查询显示出来。

Nest 它本身由 `@opentelemetry/instrumentation-nestjs-core`，它是包的一部分。它发出三种类型的跨度：

| 跨度名称 | 类型 | 它涵盖的内容 |
| ------------------------------- | ----------------- | ---------------------------------------------- |
| `Create Nest App` | `app_creation` | 这个 `NestFactory.create()` 启动时呼叫 |
| `<ControllerName>.<memberName>` | `request_context` | 整个请求从 Nest 的观点 |
| `<memberName>` | `handler` | 处理请求的控制器方法 |

> warning **Warning** 在撰写本文时，`@opentelemetry/instrumentation-nestjs-core` 支架 `@nestjs/core`12 以下的版本。在 NestJS12 上面的三个跨度没有记录，一个跟踪包含 HTTP 并且数据库仅跨越。检查您安装的版本的软件包支持版本。

跨度在控制器处停止。它调用的提供者——服务、存储库以及它周围的守卫、拦截器和管道——不会被自动跟踪，因此在您自己的代码中花费的时间显示为一个不可分割的跨度。在 Fastify 适配器，路由级跨度来自 `@fastify/otel`，由 Fastify 团队，它不是自动仪表包的一部分。

#### 添加您自己的跨度

要查看您的提供者内部，请使用 OpenTelemetryAPI 创建跨度。`startActiveSpan()` 使新跨度成为回调中运行的所有内容的父跨度，包括数据库和 HTTP 跨度：

```typescript
import { Injectable } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('orders-api');

@Injectable()
export class PricingService {
  async quote(cart: Cart) {
    return tracer.startActiveSpan('PricingService.quote', async (span) => {
      try {
        span.setAttribute('cart.items', cart.items.length);
        return await this.calculate(cart);
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
```

您开始的每个跨度都必须结束，包括当工作失败时，这就是 `finally` 块是为了。这个 API 即使没有包装，进口也是安全的 SDK 正在运行：没有一个，调用什么都不做。

这就是工作 NestJS 观察为你做：用它 SDK 安装后，每个提供程序方法已经是一个跨度，并且手册 API 只有不是提供程序方法的代码才需要。
