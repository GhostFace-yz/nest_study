# Custom transporters

Source: https://docs.nestjs.com/microservices/custom-transport

Nest 提供了各种开箱即用的**传输器**，以及用于构建自定义传输策略的 API。
Transporters 允许您使用可插拔通信层和简单的应用程序级消息协议（参见 [全文](https://dev.to/nestjs/integrate-nestjs-with-external-services-using-microservice-transporters-part-1-p3)）通过网络连接组件。

> info **Hint** 构建微服务 Nest 并不一定意味着您必须使用 `@nestjs/microservices` 包装。例如，如果您想与外部服务（例如，用不同语言编写的其他微服务）进行通信，您可能不需要由 `@nestjs/microservices` 图书馆。
> 如果您不需要允许您声明式定义订阅者的装饰器（`@EventPattern` 或者 `@MessagePattern`），运行一个 [独立应用](/application-context) 手动管理连接和频道订阅对于大多数用例来说已经足够了，并为您提供了更大的灵活性。

使用自定义传输器，您可以集成任何消息传递系统或协议（包括 Google Cloud Pub/Sub、Amazon Kinesis 等），或使用额外功能扩展现有系统（例如，[QoS](https://github.com/mqttjs/MQTT.js/blob/master/README.md#qos) 代表 MQTT）。

> info **Hint** 为了更好地理解如何 Nest 微服务的工作原理以及如何扩展现有传输程序的功能，我们建议您阅读 [NestJS Microservices in Action](https://dev.to/johnbiundo/series/4724) 和 [Advanced NestJS Microservices](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l) 文章系列。

#### 创建策略

首先，让我们定义一个表示自定义传输器的类：

```typescript
import { CustomTransportStrategy, Server } from '@nestjs/microservices';

class GoogleCloudPubSubServer
  extends Server
  implements CustomTransportStrategy
{
  /**
   * Triggered when you run "app.listen()".
   */
  listen(callback: () => void) {
    callback();
  }

  /**
   * Triggered on application shutdown.
   */
  close() {}

  /**
   * You can ignore this method if you don't want transporter users
   * to be able to register event listeners. Most custom implementations
   * will not need this.
   */
  on(event: string, callback: Function) {
    throw new Error('Method not implemented.');
  }

  /**
   * You can ignore this method if you don't want transporter users
   * to be able to retrieve the underlying native server. Most custom implementations
   * will not need this.
   */
  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}
```

> warning **Warning** 本章没有实现功能齐全的 Google Cloud Pub/Sub 服务器，因为这需要深入研究 transporter 特定的技术细节。

在上面的例子中，我们声明了 `GoogleCloudPubSubServer` 类，并提供了 `CustomTransportStrategy` 接口强制实施的 `listen()` 和 `close()` 方法。
我们的类还从 `@nestjs/microservices` 包扩展了 `Server` 类，它提供了几个有用的方法，比如 Nest 运行时用来注册消息处理程序的方法。或者，要扩展现有传输策略的功能，可以扩展相应的服务器类，例如 `ServerRedis`。
按照惯例，我们在类名中添加了 `"Server"` 后缀，因为类负责订阅消息和事件（并在必要时对它们做出响应）。

有了这一点，我们就可以使用自定义策略，而不是内置的传送器：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    strategy: new GoogleCloudPubSubServer(),
  },
);
```

而不是用 `transport` 和 `options` 属性，我们传递一个属性，`strategy`，其值是我们自定义 transporter 类的一个实例。

回到 `GoogleCloudPubSubServer` 班级。在实际应用中， `listen()` 方法将建立到消息代理或外部服务的连接，并注册订户或监听特定频道（以及 `close()` 拆除方法将删除订阅并关闭连接）。
因为这需要很好地理解如何 Nest 微服务相互通信，我们建议阅读 [Advanced NestJS Microservices article series](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l).
本章侧重于以下功能 `Server` 类提供了如何使用它们来构建自定义策略。

例如，假设在应用程序的某个地方定义了以下消息处理程序：

```typescript
@MessagePattern('echo')
echo(@Payload() data: object) {
  return data;
}
```

这个 Nest 运行时自动注册此消息处理程序。与 `Server` 类，您可以查看哪些消息模式已注册，并访问和执行分配给它们的方法。
为了测试这一点，让我们添加一个 `console.log` 在里面打电话 `listen()` 方法，在 `callback` 函数调用：

```typescript
listen(callback: () => void) {
  console.log(this.messageHandlers);
  callback();
}
```

应用程序重新启动后，您将在终端中看到以下日志：

```text
Map(1) {
  'echo' => [AsyncFunction (anonymous)] { isEventHandler: false, extras: {} }
}
```

> info **Hint** 使用 `@EventPattern` 装饰器，您将看到相同的输出，但将 `isEventHandler` 属性设置为 `true`。

这个 `messageHandlers` 财产是一个 `Map` 所有消息（和事件）处理程序中，按模式键。
您可以使用密钥（例如，`"echo"`) 获取对消息处理程序的引用：

```typescript
async listen(callback: () => void) {
  const echoHandler = this.messageHandlers.get('echo');
  console.log(await echoHandler('Hello world!'));
  callback();
}
```

当我们执行 `echoHandler` 使用任意字符串作为参数（`"Hello world!"` 这里），我们应该在控制台中看到它：

```text
Hello world!
```

这意味着我们的处理程序方法被正确执行。

当您使用 `CustomTransportStrategy` 和 [拦截器](/interceptors)，处理程序被包装在 RxJS 流中。这意味着您需要订阅它们来执行流的底层逻辑（例如，在拦截器运行后继续进入控制器逻辑）。

例如：

```typescript
async listen(callback: () => void) {
  const echoHandler = this.messageHandlers.get('echo');
  const streamOrResult = await echoHandler('Hello World');
  if (isObservable(streamOrResult)) {
    streamOrResult.subscribe();
  }
  callback();
}
```

#### 报告事件处理程序错误

事件处理程序没有响应流，因此抛入其中的错误无处可去。Nest 相反，记录它，但只有在异常筛选器运行之后。如果其中一个筛选器与异常匹配，则该筛选器是唯一的报告。

一些传输程序自己等待事件流，并将故障交给他们的客户端库，后者会报告故障。`ServerKafka` 这样做：`kafkajs` 记录拒绝，因此第二个报告来自 Nest 会复制它。设置 `propagatesEventHandlerErrors` 二 `true` 在这种情况下：

```typescript
class GoogleCloudPubSubServer
  extends Server
  implements CustomTransportStrategy
{
  /**
   * The client library reports an event handler failure, so Nest must not
   * log it a second time.
   */
  public override readonly propagatesEventHandlerErrors = true;
}
```

默认值是 `false`，这适合使用继承的传输器 `handleEvent`.那里没有任何东西订阅事件流，所以 Nest 是唯一能报告失败的东西。

#### 客户端代理

如第一部分所述，您不一定需要 `@nestjs/microservices` 创建微服务的包。但是，如果您使用它并需要集成自定义策略，您还需要提供一个“客户端”类。

> info **Hint** 实现与所有 `@nestjs/microservices` 特性（例如，流）兼容的全功能客户端类需要很好地理解框架使用的通信技术。要了解更多信息，请参见 [基本客户端组件文章](https://dev.to/nestjs/part-4-basic-client-component-16f9)。

要与外部服务通信并发布消息（或发出事件），您可以使用特定于库的 SDK 包，也可以实现扩展 `ClientProxy` 的自定义客户端类：

```typescript
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';

class GoogleCloudPubSubClient extends ClientProxy {
  async connect(): Promise<any> {}
  async close() {}
  async dispatchEvent(packet: ReadPacket<any>): Promise<any> {}
  publish(
    packet: ReadPacket<any>,
    callback: (packet: WritePacket<any>) => void,
  ): () => void {}
  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}
```

> warning **Warning** 本章没有实现功能齐全的 Google Cloud Pub/Sub 客户端，因为这需要深入研究特定于 transporter 的技术细节。

`ClientProxy` 类要求您实现用于建立和关闭连接以及用于发布消息（`publish()`）和事件（`dispatchEvent()`）的方法。
如果不需要支持请求-响应通信风格，可以将 `publish()` 方法留空。同样，如果您不需要支持基于事件的通信，请将 `dispatchEvent()` 方法留空。

为了观察哪些方法运行，以及何时运行，让我们添加几个 `console.log` 电话：

```typescript
class GoogleCloudPubSubClient extends ClientProxy {
  async connect(): Promise<any> {
    console.log('connect');
  }

  async close() {
    console.log('close');
  }

  async dispatchEvent(packet: ReadPacket<any>): Promise<any> {
    return console.log('event to dispatch: ', packet);
  }

  publish(
    packet: ReadPacket<any>,
    callback: (packet: WritePacket<any>) => void,
  ): () => void {
    console.log('message:', packet);

    // In a real-world application, the "callback" function should be executed
    // with the payload sent back from the responder. Here, we simulate a response
    // (after a 5-second delay) by passing back the same "data" we originally sent.
    //
    // The "isDisposed" flag on the WritePacket signals that no further data is
    // expected. If it's omitted or false, the data is emitted to the Observable.
    setTimeout(() => callback({ 
      response: packet.data,
      isDisposed: true,
    }), 5000);

    return () => console.log('teardown');
  }

  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}
```

有了这个，让我们创建一个实例 `GoogleCloudPubSubClient` 类并调用 `send()` 方法（您可能在前面的章节中看到过），订阅返回的可观测流：

```typescript
const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .subscribe((response) => console.log(response));
```

您应该会在终端中看到以下输出：

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
Hello world! // <-- after 5 seconds
```

测试拆卸函数（我们的 `publish()` 方法返回）运行，让我们应用 `timeout` 运算符到流，设置为 2 秒，以便它在我们的 `setTimeout` 调用 `callback` 功能：

```typescript
const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .pipe(timeout(2000))
  .subscribe({
    next: (response) => console.log(response),
    error: (error) => console.error(error.message),
  });
```

> info **Hint** 这个 `timeout` 运算符从 `rxjs/operators` 包装。

与 `timeout` 应用操作员后，您的终端输出应如下所示：

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
teardown // <-- teardown
Timeout has occurred
```

若要调度事件（而不是发送消息），请使用 `emit()` 方法：

```typescript
googlePubSubClient.emit('event', 'Hello world!');
```

您应该在控制台中看到以下内容：

```typescript
connect
event to dispatch:  { pattern: 'event', data: 'Hello world!' }
```

#### 消息序列化

要在客户端围绕响应序列化添加自定义逻辑，请使用扩展 `ClientProxy` 类或其子类之一的自定义类。要修改成功的响应，请重写 `serializeResponse()` 方法；要修改通过此客户端的任何错误，请重写 `serializeError()` 方法。要使用此自定义类，请使用 `customClass` 属性将类本身传递给 `ClientsModule.register()` 方法。下面是一个自定义 `ClientProxy` 的示例，它将每个错误序列化为 `RpcException`。

```typescript
import { ClientTCP, RpcException } from '@nestjs/microservices';

class ErrorHandlingProxy extends ClientTCP {
  serializeError(err: Error) {
    return new RpcException(err);
  }
}
```

然后在 `ClientsModule` 中使用它：

```typescript
@Module({
  imports: [
    ClientsModule.register([{
      name: 'CustomProxy',
      customClass: ErrorHandlingProxy,
    }]),
  ]
})
export class AppModule {}
```

> info **Hint** 您将类本身传递给 `customClass`，而不是类的实例。Nest 为您创建实例，并将 `options` 属性中给出的任何选项传递给新的 `ClientProxy`。
