# RabbitMQ

Source: https://docs.nestjs.com/microservices/rabbitmq

[RabbitMQ](https://www.rabbitmq.com/) 是一个支持多种消息传递协议的开源、轻量级消息代理。它可以部署在分布式和联合配置中，以满足高规模、高可用性的要求，并且是部署最广泛的消息代理之一，小型初创公司和大型企业都在使用。

#### 安装

开始建造 RabbitMQ-基于微服务，首先安装所需的软件包：

```bash
$ npm i --save amqplib amqp-connection-manager
```

#### 概述

使用 RabbitMQ 传输器，将以下选项对象传递给 `createMicroservice()` 方法：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.RMQ,
  options: {
    urls: ['amqp://localhost:5672'],
    queue: 'cats_queue',
    queueOptions: {
      durable: false
    },
  },
});
```

> info **Hint** 这个 `Transport` 枚举是从 `@nestjs/microservices` 包装。

#### 选项

这个 `options` 属性特定于所选传输程序。<strong>RabbitMQ</strong> transporter 显示以下属性。

<table>
  <tr>
    <td><code>urls</code></td>
    <td>An array of connection URLs to try in order</td>
  </tr>
  <tr>
    <td><code>queue</code></td>
    <td>Name of the queue your server listens to</td>
  </tr>
  <tr>
    <td><code>prefetchCount</code></td>
    <td>Sets the prefetch count for the channel</td>
  </tr>
  <tr>
    <td><code>isGlobalPrefetchCount</code></td>
    <td>If <code>true</code>, applies the prefetch count per channel instead of per consumer</td>
  </tr>
  <tr>
    <td><code>noAck</code></td>
    <td>If <code>false</code>, enables manual acknowledgment mode. Defaults to <code>true</code></td>
  </tr>
  <tr>
    <td><code>consumerTag</code></td>
    <td>A name the server uses to distinguish message deliveries for the consumer; it must not already be in use on the channel. It's usually easier to omit it, in which case the server creates a random name and supplies it in the reply (see <a href="https://amqp-node.github.io/amqplib/channel_api.html#channel_consume" rel="nofollow" target="_blank"><code>channel.consume()</code> in the amqplib documentation</a>)</td>
  </tr>
  <tr>
    <td><code>queueOptions</code></td>
    <td>Additional queue options (see <a href="https://amqp-node.github.io/amqplib/channel_api.html#channel_assertQueue" rel="nofollow" target="_blank"><code>channel.assertQueue()</code> in the amqplib documentation</a>)</td>
  </tr>
  <tr>
    <td><code>socketOptions</code></td>
    <td>Additional socket options (see <a href="https://amqp-node.github.io/amqplib/channel_api.html#connect" rel="nofollow" target="_blank"><code>connect()</code> in the amqplib documentation</a>)</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>Headers to send with every message. Applies only to the producer (client) configuration</td>
  </tr>
  <tr>
    <td><code>replyQueue</code></td>
    <td>Reply queue for the producer. Defaults to <code>amq.rabbitmq.reply-to</code></td>
  </tr>
  <tr>
    <td><code>persistent</code></td>
    <td>If truthy, messages survive broker restarts, provided they are in a queue that also survives restarts</td>
  </tr>
  <tr>
    <td><code>noAssert</code></td>
    <td>If <code>true</code>, the queue is not asserted before consuming. Defaults to <code>false</code></td>
  </tr>
  <tr>
    <td><code>wildcards</code></td>
    <td>Set to <code>true</code> only if you want to use a topic exchange to route messages to queues. Enabling it lets you use wildcards (<code>*</code>, <code>#</code>) in message and event patterns</td>
  </tr>
  <tr>
    <td><code>exchange</code></td>
    <td>Name of the exchange. Defaults to the queue name when <code>wildcards</code> is set to <code>true</code></td>
  </tr>
  <tr>
    <td><code>exchangeType</code></td>
    <td>Type of the exchange. Defaults to <code>topic</code>. Accepts the standard AMQP types <code>direct</code>, <code>fanout</code>, <code>topic</code>, and <code>headers</code>, or the name of a custom exchange type</td>
  </tr>
  <tr>
    <td><code>exchangeArguments</code></td>
    <td>Additional arguments passed when asserting the exchange</td>
  </tr>
  <tr>
    <td><code>routingKey</code></td>
    <td>Additional routing key for the topic exchange</td>
  </tr>
  <tr>
    <td><code>maxConnectionAttempts</code></td>
    <td>Maximum number of connection attempts. Applies only to the consumer configuration. Defaults to <code>-1</code> (infinite)</td>
  </tr>
</table>

#### 客户

与其他微服务传输程序一样，您可以 [几种选择](/microservices/basics#client-producer-class) 创建一个 RabbitMQ`ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`.导入它并调用它 `register()` 方法，传递一个 options 对象，该对象具有与上面所示的相同的属性 `createMicroservice()` 方法，加上 `name` 属性用作注入令牌。了解更多关于 `ClientsModule` 在 [微服务概述](/microservices/basics#client-producer-class).

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'cats_queue',
          queueOptions: {
            durable: false
          },
        },
      },
    ]),
  ]
  ...
})
```

您也可以使用 `ClientProxyFactory` 或 `@Client()` 创建客户端，如 [微服务概述](/microservices/basics#client-producer-class) 中所述。

#### 上下文

在更复杂的场景中，您可能需要有关传入请求的附加信息。使用时 RabbitMQ 传送器，您可以访问 `RmqContext` 物体。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(`Pattern: ${context.getPattern()}`);
}
```

> info **Hint** `@Payload()`,`@Ctx()` 和 `RmqContext` 是从 `@nestjs/microservices` 包装。

访问原始 RabbitMQ 消息（与其 `properties`,`fields`，和 `content`），使用 `getMessage()` 方法 `RmqContext` 对象：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(context.getMessage());
}
```

检索对 RabbitMQ[渠道](https://www.rabbitmq.com/channels.html)，使用 `getChannelRef()` 方法 `RmqContext` 对象：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(context.getChannelRef());
}
```

#### 消息确认

为了确保消息永远不会丢失， RabbitMQ 支架 [消息确认](https://www.rabbitmq.com/confirms.html).消费者发送确认回来告诉 RabbitMQ 特定消息已被接收和处理，以及 RabbitMQ 可以随意删除。如果消费者死亡（其通道关闭、连接关闭或 TCP 连接丢失）而没有发送 ack， RabbitMQ 假设消息未被完全处理并重新排队。

默认情况下，RabbitMQ 传输器不期望确认（`noAck` 是 `true`）。要启用手动确认模式，请将 `noAck` 属性设置为 `false`：

```typescript
options: {
  urls: ['amqp://localhost:5672'],
  queue: 'cats_queue',
  noAck: false,
  queueOptions: {
    durable: false
  },
},
```

当启用手动消费者确认时，您必须从工作人员发送确认，以表明其已完成任务：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  const channel = context.getChannelRef();
  const originalMsg = context.getMessage();

  channel.ack(originalMsg);
}
```

#### 记录建设者

要配置消息选项，请使用 `RmqRecordBuilder` 类（这也适用于基于事件的流）。例如，要设置 `headers` 和 `priority` 属性，使用 `setOptions()` 方法：

```typescript
const message = ':cat:';
const record = new RmqRecordBuilder(message)
  .setOptions({
    headers: {
      ['x-version']: '1.0.0',
    },
    priority: 3,
  })
  .build();

this.client.send('replace-emoji', record).subscribe(...);
```

> info **Hint** 这个 `RmqRecordBuilder` 类是从 `@nestjs/microservices` 包装。

您也可以通过访问 `RmqContext` 在服务器端读取这些值：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: RmqContext): string {
  const { properties: { headers } } = context.getMessage();
  return headers['x-version'] === '1.0.0' ? '🐱' : '🐈';
}
```

从 NestJSv12.1.3，消息处理程序也可以返回记录。Nest 将记录数据作为回复发送，并应用记录选项（例如，`headers` 和 `priority` 属性）到回复消息：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji() {
  return new RmqRecordBuilder(':cat:')
    .setOptions({
      headers: {
        ['x-version']: '1.0.0',
      },
      priority: 3,
    })
    .build();
}
```

回复总是携带请求的相关 id，因此客户端可以将其与请求匹配。

#### 实例状态更新

要获取有关连接和底层驱动程序实例状态的实时更新，请订阅 `status` 溪流。此流提供特定于所选驱动程序的状态更新。为了 RMQ 司机 `status` 流发射 `connected`,`disconnected`,`blocked`，和 `unblocked` 事件。

```typescript
this.client.status.subscribe((status: RmqStatus) => {
  console.log(status);
});
```

> info **Hint** 这个 `RmqStatus` 类型是从 `@nestjs/microservices` 包装。

同样，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知：

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: RmqStatus) => {
  console.log(status);
});
```

#### 听 RabbitMQ 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以听 `error` 发生错误时触发其他操作的事件。为此，请使用 `on()` 方法：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});
```

同样，您可以监听服务器的内部事件：

```typescript
server.on<RmqEvents>('error', (err) => {
  console.error(err);
});
```

> info **Hint** 这个 `RmqEvents` 类型是从 `@nestjs/microservices` 包装。

从 NestJSv12.1.2，在客户端注册的侦听器 `on()` 方法保持注册状态，直到您调用 `close()`，因此它们也附加到客户端在下一个 `send()` 或者 `emit()` 连接尝试失败后呼叫。注册不会进行重复数据删除，因此注册每个侦听器一次，而不是在尝试失败后再次注册。

#### 底层驱动程序访问

对于更高级的用例，您可能需要访问底层驱动程序实例，例如，手动关闭连接或使用特定于驱动程序的方法。但是，在大多数情况下，您**不应该**直接访问驱动程序。

为此，请使用 `unwrap()` 方法，它返回底层驱动程序实例。使用通用类型参数指定您期望的驱动程序实例的类型。

```typescript
const managerRef =
  this.client.unwrap<import('amqp-connection-manager').AmqpConnectionManager>();
```

同样，您可以访问服务器的底层驱动程序实例：

```typescript
const managerRef =
  server.unwrap<import('amqp-connection-manager').AmqpConnectionManager>();
```

#### 通配符

RabbitMQ 支持在路由键中使用通配符，以允许灵活的消息路由。这个 `#` 通配符匹配零个或多个单词，而 `*` 通配符恰好匹配一个单词。

例如，路由密钥 `cats.#` 匹配 `cats`、`cats.meow` 和 `cats.meow.purr`。路由密钥 `cats.*` 匹配 `cats.meow`，但不匹配 `cats.meow.purr`。

要在您的 RabbitMQ 微服务，设置 `wildcards` 配置选项 `true` 在选项对象中：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://localhost:5672'],
      queue: 'cats_queue',
      wildcards: true,
    },
  },
);
```

使用此配置，您可以在订阅事件和消息时在路由密钥中使用通配符。例如，要侦听路由密钥 `cats.#` 的消息：

```typescript
@MessagePattern('cats.#')
getCats(@Payload() data: { message: string }, @Ctx() context: RmqContext) {
  console.log(`Received message with routing key: ${context.getPattern()}`);

  return {
    message: 'Hello from the cats service!',
  }
}
```

要发送带有特定路由密钥的消息，请使用 `send()` 方法 `ClientProxy` 实例：

```typescript
this.client.send('cats.meow', { message: 'Meow!' }).subscribe((response) => {
  console.log(response);
});
```
