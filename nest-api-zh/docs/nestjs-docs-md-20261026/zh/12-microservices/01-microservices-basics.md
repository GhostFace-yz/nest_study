# Overview

Source: https://docs.nestjs.com/microservices/basics

除了传统（有时称为单片）应用程序体系结构之外，Nest 本地支持微服务架构开发风格。本文档其他地方讨论的大多数概念，如依赖注入、装饰器、异常过滤器、管道、防护和拦截器，同样适用于微服务。只要有可能，Nest 抽象实现细节，以便相同的组件可以跨 HTTP-基于平台、WebSockets 和微服务。本节涵盖 Nest 这些是特定于微服务的。

在 Nest 中，微服务基本上是使用与 HTTP 不同的**传输**层的应用程序。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Microservices_1.png" /></figure>

Nest 支持几个内置的传输层实现，称为**transporters**，它们负责在不同的微服务实例之间传输消息。大多数传输程序本机支持**请求-响应**和**基于事件**的消息样式。Nest 抽象了两种样式的规范接口背后每个传输程序的实现细节。这允许您从一个传输层切换到另一个传输层（例如，利用特定传输层的可靠性或性能特征），而无需更改应用程序代码。

#### 安装

要开始构建微服务，首先安装所需的软件包：

```bash
$ npm i --save @nestjs/microservices
```

#### 入门

若要实例化微服务，请使用 `createMicroservice()` 方法 `NestFactory` 班级：

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
    },
  );
  await app.listen();
}
await bootstrap();
```

> info **Hint** 微服务使用**TCP**默认传输层。

第二个论点 `createMicroservice()` 方法是 `options` 有两个成员的对象：

<table>
  <tr>
    <td><code>transport</code></td>
    <td>Specifies the transporter (e.g., <code>Transport.NATS</code>)</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>A transporter-specific options object that determines transporter behavior</td>
  </tr>
</table>

<p>
  The <code>options</code> object is specific to the chosen transporter. The <strong>TCP</strong> transporter exposes
  the properties described below. For other transporters (e.g., Redis or MQTT), see the relevant chapter for a description of the available options.
</p>

<table>
  <tr>
    <td><code>host</code></td>
    <td>Connection hostname</td>
  </tr>
  <tr>
    <td><code>port</code></td>
    <td>Connection port</td>
  </tr>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>Number of times the server tries to listen again after it closes unexpectedly (default: <code>0</code>)</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>Delay between those attempts (ms) (default: <code>0</code>)</td>
  </tr>
  <tr>
    <td><code>serializer</code></td>
    <td>Custom <a href="https://github.com/nestjs/nest/blob/master/packages/microservices/interfaces/serializer.interface.ts" target="_blank">serializer</a> for outgoing messages</td>
  </tr>
  <tr>
    <td><code>deserializer</code></td>
    <td>Custom <a href="https://github.com/nestjs/nest/blob/master/packages/microservices/interfaces/deserializer.interface.ts" target="_blank">deserializer</a> for incoming messages</td>
  </tr>
  <tr>
    <td><code>socketClass</code></td>
    <td>A custom Socket that extends <code>TcpSocket</code> (default: <code>JsonSocket</code>)</td>
  </tr>
  <tr>
    <td><code>tlsOptions</code></td>
    <td>Options to configure the TLS protocol (see <a href="/microservices/basics#tls-support">TLS support</a>)</td>
  </tr>
  <tr>
    <td><code>maxBufferSize</code></td>
    <td>Maximum size of the buffer for incoming messages, in characters (default: <code>(512 * 1024 * 1024) / 4</code>)</td>
  </tr>
  <tr>
    <td><code>incompleteMessageTimeout</code></td>
    <td>How long (ms) a peer may stay silent in the middle of a packet before the connection is dropped. Set to <code>0</code> to disable (default: <code>30000</code>)</td>
  </tr>
  <tr>
    <td><code>maxSendBufferSize</code></td>
    <td>Maximum number of response bytes that may be queued for a peer that isn't reading them before the connection is dropped. Set to <code>0</code> to disable (default: 128MB)</td>
  </tr>
</table>

#### 消息和事件模式

微服务通过**模式**识别消息和事件。模式是纯值，例如文字对象或字符串。模式被自动序列化，并与消息的数据部分一起通过网络发送。这样，消息发送者和消费者可以协调哪些请求由哪些处理程序消费。

#### 请求-响应

当您需要在服务之间**交换**消息时，请求-响应消息样式非常有用。它确保服务实际上已经接收到消息，而不需要您手动实现确认协议。然而，请求响应并不总是最合适的。例如，使用基于日志的持久性的流平台，例如 [Kafka](https://docs.confluent.io/3.0.0/streams/) 或者 [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream)，针对一组不同的挑战进行了优化，更符合事件消息传递范例（参见 [基于事件的消息传递](/microservices/basics#event-based) 更多详情）。

要启用请求-响应消息类型，Nest 创建两个逻辑通道：一个用于传输数据，另一个用于等待传入响应。对于某些底层传输，例如 [NATS](https://nats.io/) 这种双通道支持是开箱即用的。对其他人来说，Nest 通过手动创建单独的通道进行补偿，这会引入一些开销。如果您不需要请求-响应消息样式，请考虑使用基于事件的方法。

要创建基于请求-响应范式的消息处理程序，请使用 `@MessagePattern()` 装饰器，从 `@nestjs/microservices` 包装。仅在以下情况下使用此装饰器 [控制者](/controllers) 类，因为它们是应用程序的切入点。这个 Nest 运行时在提供程序中忽略它。

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class MathController {
  @MessagePattern({ cmd: 'sum' })
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }
}
```

在上面的代码中 `accumulate()`**消息处理程序**侦听与 `{ cmd: 'sum' }` 消息模式。消息处理程序接受一个参数，即 `data` 从客户那里传过来的。在这种情况下，数据是要累加的数字数组。

#### 异步响应

消息处理程序可以同步或**异步**响应，因此 `async` 方法受支持。

```typescript
@MessagePattern({ cmd: 'sum' })
async accumulate(data: number[]): Promise<number> {
  return (data || []).reduce((a, b) => a + b);
}
```

消息处理程序还可以返回 `Observable`，在这种情况下，输出结果值直到流完成。

```typescript
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): Observable<number> {
  return from([1, 2, 3]);
}
```

在上面的例子中，消息处理程序响应**三次**，对数组中的每个项目响应一次。

#### 基于事件的

虽然请求-响应方法非常适合在服务之间交换消息，但它不太适合基于事件的消息传递，在这种情况下，您希望在不等待响应的情况下发布**事件**。在这种情况下，维护两个请求响应信道的开销是不必要的。

例如，如果要通知另一个服务系统的这一部分发生了特定条件，请使用基于事件的消息样式。

若要创建事件处理程序，请使用 `@EventPattern()` 装饰器，从 `@nestjs/microservices` 包装。

```typescript
@EventPattern('user_created')
async handleUserCreated(data: Record<string, unknown>) {
  // business logic
}
```

> info **Hint** 您可以为**单个**事件模式注册多个事件处理程序，并且 Nest 并行触发所有这些。

这个 `handleUserCreated()`**事件处理程序**监听 `'user_created'` 事件。事件处理程序接受一个参数，即 `data` 从客户端传递（在本例中，是通过网络发送的事件有效载荷）。

#### 其他请求详细信息

在更高级的场景中，您可能需要有关传入请求的其他详细信息。例如，当使用 NATS 对于通配符订阅，您可能希望检索制作者向其发送消息的原始主题。同样，随着 Kafka，您可能需要访问消息头。为此，请使用如下所示的内置装饰器：

```typescript
@MessagePattern('time.us.*')
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}
```

> info **Hint** `@Payload()`、`@Ctx()` 和 `NatsContext` 是从 `@nestjs/microservices` 导入的。

> info **Hint** 还可以将属性密钥传递给 `@Payload()` 装饰器，以从传入的有效载荷对象中提取特定属性，例如 `@Payload('id')`。要根据模式验证有效载荷，请参见 [微服务管道](/microservices/pipes)。

#### 客户端（生产者类）

客户 Nest 应用程序可以与 Nest 使用微服务 `ClientProxy` 班级。此类提供了几种与远程微服务通信的方法，例如 `send()`（用于请求-响应消息传递）和 `emit()`（用于事件驱动的消息传递）。您可以通过以下方式获得该类的实例。

一种方法是导入 `ClientsModule`，这暴露了静态 `register()` 方法。该方法采用表示微服务传输器的对象数组。每个对象必须包括 `name` 属性，并且可以包括 `transport` 属性（如果省略，Nest 使用 `Transport.TCP`）和一个 `options` 财产。

`name` 属性充当**注入令牌**，您可以使用它在任何需要的地方注入 `ClientProxy` 的实例。它的值可以是任何字符串或 JavaScript 符号，如 [非基于类的提供程序令牌](/fundamentals/custom-providers#non-class-based-provider-tokens) 中所述。

这个 `options` 属性是一个对象，具有我们在 `createMicroservice()` 方法前面。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      { name: 'MATH_SERVICE', transport: Transport.TCP },
    ]),
  ],
})
```

或者，使用 `registerAsync()` 方法，如果您需要在安装期间提供配置或执行其他异步进程。

```typescript
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        imports: [ConfigModule],
        name: 'MATH_SERVICE',
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('HOST'),
            port: configService.get('PORT'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
})
```

导入模块后，使用 `@Inject()` 装饰器注入 `ClientProxy` 实例配置为 `'MATH_SERVICE'` 运输机。

```typescript
constructor(
  @Inject('MATH_SERVICE') private client: ClientProxy,
) {}
```

> info **Hint** 这个 `ClientsModule` 和 `ClientProxy` 类是从 `@nestjs/microservices` 包装。

有时，您可能需要从另一个服务（例如 `ConfigService`）而不是在客户端应用程序中硬编码。为此，请注册 [自定义提供者](/fundamentals/custom-providers) 使用 `ClientProxyFactory` 班级。此类提供静态 `create()` 方法，该方法接受 transporter options 对象并返回自定义 `ClientProxy` 实例。

```typescript
@Module({
  providers: [
    {
      provide: 'MATH_SERVICE',
      useFactory: (configService: ConfigService) => {
        const mathSvcOptions = configService.getMathSvcOptions();
        return ClientProxyFactory.create(mathSvcOptions);
      },
      inject: [ConfigService],
    }
  ]
  ...
})
```

> info **Hint** 这个 `ClientProxyFactory` 类是从 `@nestjs/microservices` 包装。

另一种选择是使用 `@Client()` 房产装修师。

```typescript
@Client({ transport: Transport.TCP })
client: ClientProxy;
```

> info **Hint** 这个 `@Client()` 装饰器是从 `@nestjs/microservices` 包装。

这个 `@Client()`decorator 不是首选技术，因为以这种方式创建的客户端更难测试，也更难共享。

这个 `ClientProxy` 是**懒**。它不会立即启动连接。相反，连接是在第一个微服务呼叫之前建立的，并且在每个后续呼叫中重复使用。如果要将应用程序引导过程延迟到建立连接，请使用 `ClientProxy` 对象的 `connect()` 方法内部 `onApplicationBootstrap()` 生命周期挂钩。

```typescript
async onApplicationBootstrap() {
  await this.client.connect();
}
```

如果无法创建连接，则 `connect()` 方法用相应的错误对象拒绝。

#### 发送消息

这个 `ClientProxy` 暴露 `send()` 方法，它调用微服务并返回一个 `Observable` 用它的反应。

```typescript
accumulate(): Observable<number> {
  const pattern = { cmd: 'sum' };
  const payload = [1, 2, 3];
  return this.client.send<number>(pattern, payload);
}
```

`send()` 方法接受两个参数，`pattern` 和 `payload`。`pattern` 应该与 `@MessagePattern()` 装饰器中定义的一个匹配。`payload` 是要传输到远程微服务的消息。此方法返回一个**cold`Observable`**，这意味着您必须在发送消息之前显式订阅它。

#### 出版事件

若要发送事件，请使用 `ClientProxy` 对象的 `emit()` 方法。此方法将事件发布到消息代理。

```typescript
async publish() {
  this.client.emit<number>('user_created', new UserCreatedEvent());
}
```

`emit()` 方法接受两个参数，`pattern` 和 `payload`。`pattern` 应该与 `@EventPattern()` 装饰器中定义的一个匹配，而 `payload` 是要传输到远程微服务的事件数据。此方法返回**hot`Observable`**（与 `send()` 返回的冷 `Observable` 形成对比），这意味着代理会立即尝试传递事件，无论您是否订阅可观测值。

#### 请求范围

如果您来自不同的编程语言背景，您可能会感到惊讶 Nest 大多数东西都是在传入的请求之间共享的。这包括数据库连接池、具有全局状态的单例服务等。Node.js 不遵循请求/响应多线程无状态模型，其中每个请求由单独的线程处理。因此，使用单例实例对您的应用程序来说是**安全的**。

然而，在某些边缘情况下，处理程序可能需要基于请求的生存期，例如在 GraphQL 应用程序、请求跟踪或多租户。了解如何控制中的范围 [注射镜](/fundamentals/injection-scopes) 篇章。

请求范围处理程序和提供程序可以注入 `RequestContext` 使用 `@Inject()` 装饰师与 `CONTEXT` 令牌：

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { CONTEXT, RequestContext } from '@nestjs/microservices';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(CONTEXT) private ctx: RequestContext) {}
}
```

这提供了对 `RequestContext` 对象，其形状如下：

```typescript
export interface RequestContext<TData = any, TContext extends BaseRpcContext = any> {
  pattern: string | Record<string, any>;
  data: TData;
  context?: TContext;
  getData(): TData;
  getPattern(): string | Record<string, any>;
  getContext(): TContext;
}
```

这个 `data` 属性是消息生成器发送的消息有效载荷。这个 `pattern` 属性是用于标识传入消息处理程序的模式。这个 `context` 属性保存特定于传输程序的上下文对象（例如，`NatsContext`），与 `@Ctx()` 装饰注入。

#### 实例状态更新

要获取有关连接和底层驱动程序实例状态的实时更新，请订阅 `status` 溪流。此流提供特定于所选驱动程序的状态更新。例如，使用 TCP 传送器（默认值），`status` 流发射 `connected` 和 `disconnected` 事件。

```typescript
this.client.status.subscribe((status: TcpStatus) => {
  console.log(status);
});
```

> info **Hint** 这个 `TcpStatus` 类型是从 `@nestjs/microservices` 包装。

同样，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: TcpStatus) => {
  console.log(status);
});
```

#### 监听内部事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以听 `error` 发生错误时触发其他操作的事件。为此，请使用 `on()` 方法：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});
```

同样，您可以监听服务器的内部事件：

```typescript
server.on<TcpEvents>('error', (err) => {
  console.error(err);
});
```

> info **Hint** 这个 `TcpEvents` 类型是从 `@nestjs/microservices` 包装。

与 TCPtransporter，从 NestJSv12.1.1，在客户端注册的侦听器 `on()` 方法保持注册状态，直到您调用 `close()`，因此它们也附加到客户端下次打开的新套接字 `send()` 或者 `emit()` 连接关闭后呼叫。注册不会进行重复数据删除，因此请注册每个侦听器一次，而不是在其回调或每次重新连接后再次注册。

#### 底层驱动程序访问

对于更高级的用例，您可能需要访问底层驱动程序实例，例如，手动关闭连接或使用特定于驱动程序的方法。然而，在大多数情况下，您**不应该**直接访问驱动程序。

为此，请使用 `unwrap()` 方法，它返回底层驱动程序实例。通用类型参数指定您期望的驱动程序实例的类型。

```typescript
const netServer = this.client.unwrap<Server>();
```

这里，`Server` 是从 `net` 模块。

同样，您可以访问服务器的底层驱动程序实例：

```typescript
const netServer = server.unwrap<Server>();
```

#### 处理超时

在分布式系统中，微服务有时会关闭或不可用。要避免无限期等待，请使用 [RxJS](https://rxjs.dev)`timeout` 经营者。如果微服务在指定的时间内没有响应，则会抛出一个错误，您可以捕捉并适当地处理该错误。

应用 `timeout` 管道内的操作员：

```typescript
this.client
  .send<TResult, TInput>(pattern, data)
  .pipe(timeout(5000));
```

> info **Hint** 这个 `timeout` 运算符从 `rxjs/operators` 包装。

如果微服务在 5 秒内没有响应，`Observable` 会出错，为 `TimeoutError`。

#### 跨服务跟踪请求

超时告诉您呼叫未能及时回复。他们不会告诉你时间去了哪里，而且是在一个由五个服务组成的系统中交谈 TCP,NATS，和 Kafka 这才是最重要的问题。一个花费 3 秒的网关请求可能会在没有人怀疑的下游服务中花费 2.9 秒，而每个服务自己的日志显示一切看起来都很好。

通常的解决办法是传播相关性 ID 手工完成每一次运输，然后在事后将时间线缝合在一起。[NestJS Observe](https://www.observe.nestjs.com/) 帮你缝针。将每项服务与 `@nestjs/observe`SDK 并转发痕迹 ID 在传输已有的任何信道上（aKafka 标题，aNATS 标题，或上的字段 TCP 有效载荷），仪表板会重新组装一个瀑布，涵盖参与的每个服务：

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/service-flow.webp" alt="Trace correlation across services" /></figure>

从那时起，超时就不再是一个谜了。你可以看到网关的 `send()` 等待，消费者接收消息（以及消息在此之前等待了多长时间），处理程序内部运行了很长时间的查询，以及它最终抛出的错误及其源代码行，都在一个时钟上。消息和事件处理程序是自动插入的，因此 `@MessagePattern()` 和 `@EventPattern()` 处理程序显示为没有任何手动跨度布线的操作。

转发跟踪 ID 是一个需要应用程序代码的部分，因为只有你知道你的传输离开哪个渠道是免费的。看 [Distributed tracing](/observability/distributed-tracing) 对于每次传输的模式，以及 [Observability](/observability/overview) 章节要建立。

#### TLS 支持

在专用网络之外通信时，对流量进行加密。这个 TCPtransporter 内置支持 TLS，基于 Node 的 [TLS](https://nodejs.org/api/tls.html) 模块，允许您加密微服务与其客户端之间的通信。

启用 TLS 对于一个 TCP 服务器，您需要私钥和证书 PEM 格式。将它们添加到服务器的选项中 `tlsOptions` 属性：

```typescript
import * as fs from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const key = fs.readFileSync('<pathToKeyFile>', 'utf8').toString();
  const cert = fs.readFileSync('<pathToCertFile>', 'utf8').toString();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: {
        tlsOptions: {
          key,
          cert,
        },
      },
    },
  );

  await app.listen();
}
await bootstrap();
```

供客户端通过以下方式进行安全通信 TLS，定义 `tlsOptions` 对象也是，这次用 CA 证书，即签署服务器证书的机构的证书。这确保了客户端信任服务器的证书，并可以建立安全连接。

```typescript
import * as fs from 'node:fs';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.TCP,
        options: {
          tlsOptions: {
            ca: [fs.readFileSync('<pathToCaFile>', 'utf-8').toString()],
          },
        },
      },
    ]),
  ],
})
export class AppModule {}
```

这个 `ca` 属性接受数组，因此如果您的设置涉及多个受信任的机构，您可以列出多个 CA。

一旦一切都设置好了，注入 `ClientProxy` 像往常一样 `@Inject()` 装修师。然后，微服务之间的通信将被加密，Node 的 TLS 处理加密细节的模块。

有关更多信息，请参阅 Node 的 [TLS 文件](https://nodejs.org/api/tls.html)。

#### 动态配置

微服务的传输选项被传递到 `createMicroservice()`，在任何提供者（例如 `ConfigService` 从 `@nestjs/config` 包装）可以注射。要使用注入的提供程序配置微服务，请通过 `AsyncMicroserviceOptions` 相反：Nest 解析中列出的提供程序 `inject` 并将它们传递给 `useFactory` 函数，它返回传输选项。

```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AsyncMicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(
    AppModule,
    {
      useFactory: (configService: ConfigService) => ({
        transport: Transport.TCP,
        options: {
          host: configService.get<string>('HOST'),
          port: configService.get<number>('PORT'),
        },
      }),
      inject: [ConfigService],
    },
  );

  await app.listen();
}
await bootstrap();
```
