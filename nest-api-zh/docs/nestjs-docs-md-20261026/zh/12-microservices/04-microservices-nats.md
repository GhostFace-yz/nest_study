# NATS

Source: https://docs.nestjs.com/microservices/nats

[NATS](https://nats.io) 是一个简单、安全、高性能的开源消息传递系统，适用于云原生应用程序、物联网消息传递和微服务架构。这个 NATS 服务器是用 Go 编写的，客户端库适用于几十种主要的编程语言。NATS 支持**最多一次**和**至少一次**交付。它可以在任何地方运行，从大型服务器和云实例到边缘网关和物联网设备。

#### 安装

开始建造 NATS-基于微服务，首先安装所需的包：

```bash
$ npm i --save @nats-io/transport-node
```

> warning **Warning** 作为 NestJSv12，NATS 转运蛋白目标**NATSv3**并使用 `@nats-io/transport-node` 司机。如果从早期版本升级，请卸载旧版本 `nats` 包装（`npm uninstall nats`) 并安装 `@nats-io/transport-node` 反而。参见 [迁移指南](/migration-guide#nats-v3) 详情。

#### 概述

使用 NATS 传输器，将以下选项对象传递给 `createMicroservice()` 方法：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.NATS,
  options: {
    servers: ['nats://localhost:4222'],
  },
});
```

> info **Hint** 这个 `Transport` 枚举是从 `@nestjs/microservices` 包装。

#### 选项

这个 `options` 对象特定于所选的传送器。<strong>NATS</strong> transporter 暴露 [NATS 连接选项](https://github.com/nats-io/nats.js/blob/main/core/README.md#connecting-to-a-nats-server)，以及以下属性：

<table>
  <tr>
    <td><code>queue</code></td>
    <td>Queue group that your server subscribes with (leave <code>undefined</code> to ignore this setting). Read more about NATS queue groups <a href="/microservices/nats#queue-groups">below</a>.</td>
  </tr>
  <tr>
    <td><code>gracefulShutdown</code></td>
    <td>Enables graceful shutdown. When enabled, the server first unsubscribes from all subjects, then waits for <code>gracePeriod</code> before closing the connection. Default is <code>false</code>.</td>
  </tr>
  <tr>
    <td><code>gracePeriod</code></td>
    <td>Time in milliseconds to wait after unsubscribing from all subjects when <code>gracefulShutdown</code> is enabled. Default is <code>10000</code> ms.</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>Headers added to every message a client sends (see <a href="/microservices/nats#record-builders">record builders</a>).</td>
  </tr>
</table>

#### 客户

与其他微服务传输程序一样，您有<a href="/microservices/basics#client-producer-class">若干选项</a>来创建 NATS`ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`.导入并使用它 `register()` 方法来传递具有与上面所示的相同属性的 options 对象 `createMicroservice()` 方法，加上 `name` 属性用作注入令牌。阅读有关 `ClientsModule` 在概述的<a href="/microservices/basics#client-producer-class">client 部分</a>中。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.NATS,
        options: {
          servers: ['nats://localhost:4222'],
        }
      },
    ]),
  ]
  ...
})
```

您还可以使用 `ClientProxyFactory` 或者 `@Client()` 装修师。两者都在概述</a>的<a href="/microservices/basics#client-producer-class">client 部分中进行了描述。

#### 请求-响应

为了 [request-response](/microservices/basics#request-response) 消息样式 NATS transporter 不使用内置 NATS [Request-Reply](https://docs.nats.io/nats-concepts/reqreply) API.相反，客户端使用 `publish()` 方法和唯一的回复主题名称。响应者监听该主题，并向回复主题发送响应。无论任何一方的位置如何，回复主题都会被动态路由回请求者。

#### 基于事件的

为了 [event-based](/microservices/basics#event-based) 消息样式 NATStransporter 使用内置 NATS[Publish-Subscribe](https://docs.nats.io/nats-concepts/pubsub) 机制。发布者发送有关主题的消息，收听该主题的每个活动订户都会接收该消息。订户也可以登记兴趣 [通配符](#wildcards) 主题。这种一对多模式有时被称为扇出。

#### 队列组

NATS 提供了一个名为 [分布式队列](https://docs.nats.io/nats-concepts/queue) 的内置负载平衡功能。要创建队列订阅，请按如下方式使用 `queue` 属性：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.NATS,
  options: {
    servers: ['nats://localhost:4222'],
    queue: 'cats_queue',
  },
});
```

#### 上下文

在更复杂的场景中，您可能需要有关传入请求的附加信息。与 NATS 传送器，您可以访问 `NatsContext` 物体。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`);
}
```

> info **Hint** `@Payload()`,`@Ctx()` 和 `NatsContext` 是从 `@nestjs/microservices` 包装。

#### 通配符

订阅可以针对显式主题，也可以包含通配符。

```typescript
@MessagePattern('time.us.*')
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}
```

#### 记录建设者

要配置消息选项，请使用 `NatsRecordBuilder` 班级。它适用于请求响应和基于事件的流。例如，要添加一个 `x-version` 标题，使用 `setHeaders()` 方法：

```typescript
import * as nats from '@nats-io/nats-core';

// somewhere in your code
const headers = nats.headers();
headers.set('x-version', '1.0.0');

const record = new NatsRecordBuilder(':cat:').setHeaders(headers).build();
this.client.send('replace-emoji', record).subscribe(...);
```

> info **Hint** 这个 `NatsRecordBuilder` 类是从 `@nestjs/microservices` 包装。

在服务器端，您可以通过 `NatsContext` 读取这些标头：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: NatsContext): string {
  const headers = context.getHeaders();
  return headers?.get('x-version') === '1.0.0' ? '🐱' : '🐈';
}
```

要为客户端发送的所有请求配置标头，请将它们作为选项传递给 `ClientProxyFactory`：

```typescript
import { Module } from '@nestjs/common';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';

@Module({
  providers: [
    {
      provide: 'API_v1',
      useFactory: () =>
        ClientProxyFactory.create({
          transport: Transport.NATS,
          options: {
            servers: ['nats://localhost:4222'],
            headers: { 'x-version': '1.0.0' },
          },
        }),
    },
  ],
})
export class ApiModule {}
```

记录上设置的标题优先于客户端级别 `headers` 选择。

从 NestJSv12.1.3，消息处理程序也可以返回记录。Nest 将记录数据作为回复发送，将记录头作为回复消息的头发送：

```typescript
import * as nats from '@nats-io/nats-core';

@MessagePattern('replace-emoji')
replaceEmoji() {
  const headers = nats.headers();
  headers.set('x-version', '1.0.0');

  return new NatsRecordBuilder(':cat:').setHeaders(headers).build();
}
```

#### 自定义序列化程序和反序列化程序

从 NestJS v12, Nest 序列化 NATS 数据包作为 JSON 字符串和自定义 NATS 反序列化程序接收完整 NATS 消息对象而不是原始 `Uint8Array`.如果您编写了自定义反序列化程序，请读取有效载荷 `msg.json()` 而不是手动解码字节：

```typescript
import { Deserializer, IncomingRequest } from '@nestjs/microservices';

export class CustomNatsDeserializer implements Deserializer {
  deserialize(msg: any): IncomingRequest {
    // Previously: JSON.parse(new TextDecoder().decode(msg));
    return msg.json();
  }
}
```

#### 实例状态更新

要获取有关连接和底层驱动程序实例状态的实时更新，请订阅 `status` 溪流。此流提供特定于所选驱动程序的状态更新。为了 NATS 司机 `status` 流发射 `connected`,`disconnected`，和 `reconnecting` 事件。

```typescript
this.client.status.subscribe((status: NatsStatus) => {
  console.log(status);
});
```

> info **Hint** 这个 `NatsStatus` 类型是从 `@nestjs/microservices` 包装。

同样，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: NatsStatus) => {
  console.log(status);
});
```

#### 听 NATS 事件

在某些情况下，您可能希望监听微服务发出的内部事件。这个 NATS 转运蛋白发出 `disconnect`,`reconnect`，和 `update`（群集服务器添加或删除）事件。例如，您可以听 `disconnect` 当连接丢失时触发其他操作的事件。为此，请使用 `on()` 方法如下所示：

```typescript
this.client.on('disconnect', (serverUrl) => {
  console.error(`Disconnected from ${serverUrl}`);
});
```

同样，您可以监听服务器的内部事件：

```typescript
server.on<NatsEvents>('disconnect', (serverUrl) => {
  console.error(`Disconnected from ${serverUrl}`);
});
```

> info **Hint** 这个 `NatsEvents` 类型是从 `@nestjs/microservices` 包装。

#### 底层驱动程序访问

对于更高级的用例，您可能需要访问底层驱动程序实例，例如，手动关闭连接或使用特定于驱动程序的方法。然而，在大多数情况下，您**不应该**直接访问驱动程序。

为此，请使用 `unwrap()` 方法，它返回底层驱动程序实例。通用类型参数指定您期望的驱动程序实例的类型。

```typescript
const natsConnection =
  this.client.unwrap<import('@nats-io/transport-node').NatsConnection>();
```

同样，您可以访问服务器的底层驱动程序实例：

```typescript
const natsConnection =
  server.unwrap<import('@nats-io/transport-node').NatsConnection>();
```
