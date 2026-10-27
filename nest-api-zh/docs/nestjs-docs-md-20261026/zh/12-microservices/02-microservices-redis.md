# Redis

Source: https://docs.nestjs.com/microservices/redis

[Redis](https://redis.io/) 传输器实现发布/订阅消息范例，并使用 Redis 的 [Pub/Sub](https://redis.io/topics/pubsub) 特性。发布的消息被分类到频道中，发布者不知道哪些订阅者（如果有的话）会收到它们。每个微服务可以订阅任意数量的信道，并且单个消息可以由多个订户接收。通过渠道交换的消息是**一笔勾销**：如果发布了一条消息，没有订阅者对它感兴趣，消息就会被删除，无法恢复。因此，不能保证消息或事件由至少一个服务处理。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Redis_1.png" /></figure>

#### 安装

开始建造 Redis-基于微服务，首先安装所需的包：

```bash
$ npm i --save ioredis
```

#### 概述

使用 Redis 传输器，将以下选项对象传递给 `createMicroservice()` 方法：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.REDIS,
  options: {
    host: 'localhost',
    port: 6379,
  },
});
```

> info **Hint** 这个 `Transport` 枚举是从 `@nestjs/microservices` 包装。

#### 选项

这个 `options` 属性特定于所选传输程序。<strong>Redis</strong> transporter 显示下述属性。

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
    <td>Number of times to retry the connection (default: <code>0</code>, i.e., no retries)</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>Delay between connection retry attempts (ms) (default: <code>5000</code>)</td>
  </tr>
  <tr>
    <td><code>wildcards</code></td>
    <td>Enables Redis wildcard subscriptions, instructing the transporter to use <code>psubscribe</code>/<code>pmessage</code> under the hood (default: <code>false</code>)</td>
  </tr>
</table>

传输器还支持官方的所有属性 [约雷迪斯](https://redis.github.io/ioredis/index.html#RedisOptions) 客户。

#### 客户

与其他微服务传输程序一样，您有<a href="/microservices/basics#client-producer-class">若干选项</a>来创建 Redis`ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`.导入并使用它 `register()` 方法来传递具有与上面所示的相同属性的 options 对象 `createMicroservice()` 方法，加上 `name` 属性用作注入令牌。阅读有关 `ClientsModule` 在概述的<a href="/microservices/basics#client-producer-class">client 部分</a>中。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.REDIS,
        options: {
          host: 'localhost',
          port: 6379,
        }
      },
    ]),
  ]
  ...
})
```

您还可以使用 `ClientProxyFactory` 或者 `@Client()` 装修师。两者都在概述</a>的<a href="/microservices/basics#client-producer-class">client 部分中进行了描述。

#### 上下文

在更复杂的场景中，您可能需要有关传入请求的附加信息。与 Redis 传送器，您可以访问 `RedisContext` 物体。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RedisContext) {
  console.log(`Channel: ${context.getChannel()}`);
}
```

> info **Hint** `@Payload()`,`@Ctx()` 和 `RedisContext` 是从 `@nestjs/microservices` 包装。

#### 通配符

要启用通配符支持，请将 `wildcards` 选项设置为 `true`。这指示运输机在底层使用 `psubscribe` 和 `pmessage`。

```typescript
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.REDIS,
  options: {
    // Other options
    wildcards: true,
  },
});
```

通过 `wildcards` 创建客户端实例时的选项。

启用此选项后，您可以在消息和事件模式中使用通配符。例如，要订阅从 `notifications.`，使用以下模式：

```typescript
@EventPattern('notifications.*')
```

#### 实例状态更新

要获取有关连接和底层驱动程序实例状态的实时更新，请订阅 `status` 溪流。此流提供特定于所选驱动程序的状态更新。为了 Redis 司机 `status` 流发射 `connected`,`disconnected`，和 `reconnecting` 事件。

```typescript
this.client.status.subscribe((status: RedisStatus) => {
  console.log(status);
});
```

> info **Hint** 这个 `RedisStatus` 类型是从 `@nestjs/microservices` 包装。

同样，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: RedisStatus) => {
  console.log(status);
});
```

#### 听 Redis 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以听 `error` 发生错误时触发其他操作的事件。为此，请使用 `on()` 方法。因为 Redistransporter 使用两个连接（参见 [底层驱动程序访问](#underlying-driver-access)），回调接收发出事件的连接（`'pub'` 或者 `'sub'`）作为其第一个参数：

```typescript
this.client.on('error', (client, err) => {
  console.error(client, err);
});
```

同样，您可以监听服务器的内部事件：

```typescript
server.on<RedisEvents>('error', (client, err) => {
  console.error(client, err);
});
```

> info **Hint** 这个 `RedisEvents` 类型是从 `@nestjs/microservices` 包装。

从 NestJSv12.1，在客户端注册的侦听器 `on()` 方法保持注册状态，直到您调用 `close()`，所以它们也附着在新的 `pub` 和 `sub` 客户端在下一个上创建的连接 `send()` 或者 `emit()` 连接结束后调用（一旦配置 `retryAttempts` 筋疲力尽）。注册不会进行重复数据删除，因此请注册每个侦听器一次，而不是在其回调或每次重新连接后再次注册。

#### 底层驱动程序访问

对于更高级的用例，您可能需要访问底层驱动程序实例，例如，手动关闭连接或使用特定于驱动程序的方法。然而，在大多数情况下，您**不应该**直接访问驱动程序。

为此，请使用 `unwrap()` 方法，它返回底层驱动程序实例。通用类型参数指定您期望的驱动程序实例的类型。

```typescript
const [pub, sub] =
  this.client.unwrap<[import('ioredis').Redis, import('ioredis').Redis]>();
```

同样，您可以访问服务器的底层驱动程序实例：

```typescript
const [pub, sub] =
  server.unwrap<[import('ioredis').Redis, import('ioredis').Redis]>();
```

与其他运输机不同，Redistransporter 返回一个 2 的元组 `ioredis` 实例：第一个发布消息，第二个订阅它们。
