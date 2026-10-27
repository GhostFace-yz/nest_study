# Adapters

Source: https://docs.nestjs.com/websockets/adapter

WebSockets 模块与平台无关，因此您可以通过实现 `WebSocketAdapter` 接口。接口需要下表中描述的方法：

<table>
  <tr>
    <td><code>create</code></td>
    <td>Creates a socket server instance based on the passed arguments</td>
  </tr>
  <tr>
    <td><code>bindClientConnect</code></td>
    <td>Binds the client connection event</td>
  </tr>
  <tr>
    <td><code>bindClientDisconnect</code></td>
    <td>Binds the client disconnection event (optional)</td>
  </tr>
  <tr>
    <td><code>bindMessageHandlers</code></td>
    <td>Binds the incoming message to the corresponding message handler</td>
  </tr>
  <tr>
    <td><code>close</code></td>
    <td>Terminates a server instance</td>
  </tr>
</table>

#### 延长 socket.io

这个 [socket.io](https://github.com/socketio/socket.io) 包裹包裹在一个 `IoAdapter` 班级。您可以扩展此类以增强适配器的基本功能。例如，假设您的应用程序必须跨 web 服务的多个负载平衡实例广播事件。要支持此功能，请扩展 `IoAdapter` 并覆盖负责实例化新的方法 socket.io 服务器。首先，安装所需的软件包。

> warning **Warning** 使用 socket.io 对于多个负载平衡实例，必须通过设置禁用轮询 `transports: ['websocket']` 在你的客户中 socket.io 配置，或在负载平衡器中启用基于 cookie 的路由（粘性会话）。Redis 光靠是不够的。看 [Enabling sticky session](https://socket.io/docs/v4/using-multiple-nodes/#enabling-sticky-session) 在 socket.io 更多信息的文档。

```bash
$ npm i --save redis socket.io @socket.io/redis-adapter
```

安装软件包后，创建一个 `RedisIoAdapter` 班级。

```typescript
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: `redis://localhost:6379` });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

然后切换到新创建的 Redis 适配器。

```typescript
const app = await NestFactory.create(AppModule);
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();

app.useWebSocketAdapter(redisIoAdapter);
```

#### Ws 库

另一个可用的适配器是 `WsAdapter`，它充当框架和快速的、经过彻底测试的 [ws](https://github.com/websockets/ws) 图书馆。此适配器与本机浏览器 WebSockets 完全兼容，并且比 socket.io 包装。然而，它提供的开箱即用的功能要少得多，这是许多应用程序不需要的。

> info **Hint** `ws` 库不支持命名空间（由 `socket.io` 普及的通信渠道），如果您设置 `namespace` 选项，`WsAdapter` 会抛出错误。要模拟此功能，请在不同的路径（例如，`@WebSocketGateway({ path: '/users' })`）上挂载多个 `ws` 服务器。

使用 `ws`，首先安装所需的软件包：

```bash
$ npm i --save @nestjs/platform-ws
```

安装软件包后，切换适配器：

```typescript
const app = await NestFactory.create(AppModule);
app.useWebSocketAdapter(new WsAdapter(app));
```

> info **Hint** `WsAdapter` 是从 `@nestjs/platform-ws` 导入的。

这个 `WsAdapter` 中处理消息 `{ event: string, data: any }` 格式。若要接收和处理不同格式的消息，请配置一个消息解析器，将其转换为这种格式。

```typescript
const wsAdapter = new WsAdapter(app, {
  // To handle messages in the [event, data] format
  messageParser: (data) => {
    const [event, payload] = JSON.parse(data.toString());
    return { event, data: payload };
  },
});
```

或者，您可以在使用 `setMessageParser()` 方法。

#### 高级（自定义适配器）

出于演示目的，我们将集成 [ws](https://github.com/websockets/ws) 手动库。如前所述，该库的适配器已经存在：`WsAdapter` 类从 `@nestjs/platform-ws` 包装。简化的实现可能如下所示：

```typescript
import WebSocket from 'ws';
import { WebSocketAdapter, INestApplicationContext } from '@nestjs/common';
import { MessageMappingProperties } from '@nestjs/websockets';
import { Observable, fromEvent, EMPTY } from 'rxjs';
import { mergeMap, filter } from 'rxjs/operators';

export class WsAdapter implements WebSocketAdapter {
  constructor(private app: INestApplicationContext) {}

  create(port: number, options: any = {}): any {
    return new WebSocket.Server({ port, ...options });
  }

  bindClientConnect(server, callback: Function) {
    server.on('connection', callback);
  }

  bindMessageHandlers(
    client: WebSocket,
    handlers: MessageMappingProperties[],
    process: (data: any) => Observable<any>,
  ) {
    fromEvent(client, 'message')
      .pipe(
        mergeMap(data => this.bindMessageHandler(data, handlers, process)),
        filter(result => result),
      )
      .subscribe(response => client.send(JSON.stringify(response)));
  }

  bindMessageHandler(
    buffer,
    handlers: MessageMappingProperties[],
    process: (data: any) => Observable<any>,
  ): Observable<any> {
    const message = JSON.parse(buffer.data);
    const messageHandler = handlers.find(
      handler => handler.message === message.event,
    );
    if (!messageHandler) {
      return EMPTY;
    }
    return process(messageHandler.callback(message.data));
  }

  close(server) {
    server.close();
  }
}
```

> info **Hint** 使用 [ws](https://github.com/websockets/ws) 库，使用内置的 `WsAdapter` 而不是创造自己的。

然后使用 `useWebSocketAdapter()` 方法：

```typescript
const app = await NestFactory.create(AppModule);
app.useWebSocketAdapter(new WsAdapter(app));
```

#### 例子

[16-gateways-ws 样本](https://github.com/nestjs/nest/tree/master/sample/16-gateways-ws) 中提供了一个使用 `WsAdapter` 的工作示例。
