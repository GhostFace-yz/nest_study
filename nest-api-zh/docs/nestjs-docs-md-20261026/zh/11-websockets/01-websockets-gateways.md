# Gateways

Source: https://docs.nestjs.com/websockets/gateways

本文档其他地方讨论的大多数概念，如依赖注入、装饰器、异常过滤器、管道、防护和拦截器，同样适用于网关。只要有可能，Nest 抽象实现细节，以便相同的组件可以跨 HTTP-基于平台、WebSockets 和微服务。本节涵盖 Nest 特定于 WebSockets。

在 Nest 中，网关是用 `@WebSocketGateway()` 装饰器注释的类。网关与平台无关，因此一旦存在适配器，它们就可以与任何 WebSockets 库配合使用。Nest 开箱即用支持两个 WebSocket 平台：[socket.io](https://github.com/socketio/socket.io) 和 [ws](https://github.com/websockets/ws)。选择最适合你需求的。您也可以按照 [适配器指南](/websockets/adapter) 构建自己的适配器。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Gateways_1.png" /></figure>

> info **Hint** 网关是 [供应商](/providers)：它们可以通过类构造函数注入依赖项，其他类（提供程序和控制器）也可以注入它们。

#### 安装

要开始构建基于 WebSockets 的应用程序，首先安装所需的包：

```bash
$ npm i --save @nestjs/websockets @nestjs/platform-socket.io
```

#### 概述

默认情况下，每个网关在与**相同的端口上侦听 HTTP 服务器**。若要使用不同的端口，请将其作为第一个参数传递给装饰器，例如，`@WebSocketGateway(80)`，其中 `80` 是选定的端口号。您还可以设置 [命名空间](https://socket.io/docs/v4/namespaces/) 网关使用：

```typescript
@WebSocketGateway(80, { namespace: 'events' })
```

> warning **Warning** 在现有模块的提供程序数组中引用网关之前，网关不会被实例化。

第二个论点 `@WebSocketGateway()` 装饰器通过任何受支持的 [服务器选项](https://socket.io/docs/v4/server-options/) 到套接字服务器构造函数。如果您不需要自定义端口，请将 options 对象作为唯一的参数传递。

```typescript
@WebSocketGateway(81, { transports: ['websocket'] })
```

网关现在正在监听，但它还没有订阅任何传入的消息。让我们创建一个订阅 `events` 使用相同的数据向客户端发送消息和响应。

```typescript
@SubscribeMessage('events')
handleEvent(@MessageBody() data: string): string {
  return data;
}
```

> info **Hint** 这个 `@SubscribeMessage()` 和 `@MessageBody()` 装饰器是从 `@nestjs/websockets` 包装。

创建网关后，将其注册到模块中。

```typescript
import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';

@Module({
  providers: [EventsGateway]
})
export class EventsModule {}
```

也可以将属性密钥传递给 `@MessageBody()` 从传入的消息正文中提取属性的装饰器：

```typescript
@SubscribeMessage('events')
handleEvent(@MessageBody('id') id: number): number {
  // id === messageBody.id
  return id;
}
```

如果您不想使用装饰器，以下代码在功能上是等效的：

```typescript
@SubscribeMessage('events')
handleEvent(client: Socket, data: string): string {
  return data;
}
```

在上面的例子中，`handleEvent()` 方法接受两个参数。第一个是特定于平台的 [套接字实例](https://socket.io/docs/v4/server-api/#socket)，第二个是从客户端接收的数据。不推荐这种方法，因为它需要嘲笑 `socket` 每个单元测试中的实例。

当 `events` 收到消息后，处理程序发送一个确认，其中包含通过网络发送的相同数据。您还可以发送特定于库的消息 API 例如，`client.emit()` 方法。要访问已连接的套接字实例，请使用 `@ConnectedSocket()` 装修师。

```typescript
@SubscribeMessage('events')
handleEvent(
  @MessageBody() data: string,
  @ConnectedSocket() client: Socket,
): string {
  return data;
}
```

> info **Hint** 这个 `@ConnectedSocket()` 装饰器是从 `@nestjs/websockets` 包装。

但是，您直接通过套接字旁路拦截器发出的消息，它只看到处理程序的返回值。如果您不想响应客户端，请省略 `return` 语句（或返回 `null` 或 `undefined`）。其他 false 值，如 `false` 或 `0`，仍然作为响应发送。

当客户端发出如下消息时，`handleEvent()` 方法被执行：

```typescript
socket.emit('events', { name: 'Nest' });
```

要接收上面处理程序发送的响应，客户端必须附加相应的确认回调：

```typescript
socket.emit('events', { name: 'Nest' }, (data) => console.log(data));
```

从消息处理程序返回值隐式发送确认，但高级场景通常需要直接控制确认回调。

这个 `@Ack()` 参数装饰器注入 `ack` 将函数直接回调到消息处理程序中。当你使用它的时候，Nest 不根据返回值发送确认，因此必须调用 `ack()` 你自己。如果没有 decorator，回调将作为方法的第三个参数传递。

```typescript
@SubscribeMessage('events')
handleEvent(
  @MessageBody() data: string,
  @Ack() ack: (response: { status: string; data: string }) => void,
) {
  ack({ status: 'received', data });
}
```

#### 多重响应

确认只发送一次，本地 WebSocket 实现不支持它。要解决这些限制，请返回具有两个属性的对象：`event`，发出的事件的名称，以及 `data`，要转发到客户端的有效载荷。

```typescript
@SubscribeMessage('events')
handleEvent(@MessageBody() data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}
```

> info **Hint** 这个 `WsResponse` 接口是从 `@nestjs/websockets` 包装。

> warning **Warning** 如果你的 `data` 领域依赖于 `ClassSerializerInterceptor`，返回实现 `WsResponse`，因为拦截器忽略了普通 JavaScript 对象响应。

要接收传入的响应，客户端必须添加另一个事件监听器。

```typescript
socket.on('events', (data) => console.log(data));
```

#### 异步响应

消息处理程序可以同步或**异步**响应，因此 `async` 方法受支持。消息处理程序还可以返回 `Observable`，在这种情况下，每个发射值被发送到客户端，直到流完成。

```typescript
@SubscribeMessage('events')
onEvent(@MessageBody() data: unknown): Observable<WsResponse<number>> {
  const event = 'events';
  const response = [1, 2, 3];

  return from(response).pipe(
    map(data => ({ event, data })),
  );
}
```

在上面的例子中，消息处理程序响应**3 次**（对数组中的每个项目响应一次）。

#### 生命周期挂钩

网关支持三个生命周期挂钩。每个都有相应的接口，如下表所述：

<table>
  <tr>
    <td>
      <code>OnGatewayInit</code>
    </td>
    <td>
      Requires the <code>afterInit()</code> method, which receives the library-specific server instance as an argument.
    </td>
  </tr>
  <tr>
    <td>
      <code>OnGatewayConnection</code>
    </td>
    <td>
      Requires the <code>handleConnection()</code> method, which receives the library-specific client socket instance as
      its first argument.
    </td>
  </tr>
  <tr>
    <td>
      <code>OnGatewayDisconnect</code>
    </td>
    <td>
      Requires the <code>handleDisconnect()</code> method, which receives the library-specific client socket instance as
      its first argument.
    </td>
  </tr>
</table>

> info **Hint** 每个生命周期接口都从 `@nestjs/websockets` 包装。

> warning **Warning** Nest 不等待异步 `handleConnection()` 在它处理客户端的消息之前完成，所以钩子不是一个门：在它断开客户端连接之前到达的消息仍然会被处理。要检查每条消息，请绑定 [警卫](/websockets/guards) 到消息处理程序。若要在处理客户端的任何消息之前拒绝客户端，请改用连接级中间件：socket.io 的 `server.use()` 在 `afterInit()`，或，与 `WsAdapter`, 一个 `verifyClient` 中的函数 `@WebSocketGateway()` 选项。

#### 服务器和命名空间

有时，您可能需要直接访问本机的**特定于平台的**服务器实例。Nest 将其作为参数传递给 `afterInit()` 方法（`OnGatewayInit` 接口）。或者，使用 `@WebSocketServer()` 装修师。

```typescript
@WebSocketServer()
server: Server;
```

您还可以检索相应的命名空间：

```typescript
@WebSocketGateway({ namespace: 'my-namespace' })
export class EventsGateway {
  @WebSocketServer()
  namespace: Namespace;
}
```

这个 `@WebSocketServer()`decorator 根据存储的元数据注入服务器实例 `@WebSocketGateway()` 装修师。如果你通过 `namespace` 选项 `@WebSocketGateway()`,`@WebSocketServer()` 注入 a`Namespace` 实例而不是 `Server` 实例。

> warning **Notice** 这个 `@WebSocketServer()` 装饰器是从 `@nestjs/websockets` 包装。

Nest 服务器实例准备好使用后，将其分配给该属性。

#### 请求范围网关

从 NestJSv12，网关支持 [request-scoped](/fundamentals/injection-scopes) 供应商。Nest 为每个连接的套接字创建每个请求范围依赖项的新实例。该实例的寿命与连接的寿命一样长，因此它可以安全地保持每个连接状态。

将插座本身注入 `REQUEST` 令牌，就像你注入 HTTP 请求到请求范围 HTTP 供应商：

```typescript
import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Socket } from 'socket.io';

@Injectable({ scope: Scope.REQUEST })
export class ConnectionStateService {
  private sequence = 0;

  constructor(@Inject(REQUEST) private readonly client: Socket) {}

  next() {
    return { clientId: this.client.id, sequence: ++this.sequence };
  }
}
```

然后，网关像其他提供者一样注入它：

```typescript
@WebSocketGateway()
export class EventsGateway {
  constructor(private readonly connectionState: ConnectionStateService) {}

  handleConnection(client: Socket) {
    client.emit('connected', this.connectionState.next());
  }

  @SubscribeMessage('state')
  onState() {
    return { event: 'state', data: this.connectionState.next() };
  }
}
```

因为作用域绑定到连接而不是单个消息，所以 `sequence` 对该套接字上接收的每条消息进行计数，而第二个客户端获得自己的独立实例。Nest 当套接字断开连接时，拆卸请求范围内的实例。

> warning **Notice** 和 HTTP，请求作用域提供程序会增加每个连接的实例化开销。除非需要每个连接状态，否则使用默认的单例作用域。

#### 例子

[02-网关样本](https://github.com/nestjs/nest/tree/master/sample/02-gateways) 中提供了一个工作示例。
