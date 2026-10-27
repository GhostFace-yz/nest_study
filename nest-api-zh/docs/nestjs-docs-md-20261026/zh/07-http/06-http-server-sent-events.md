# Server-Sent Events

Source: https://docs.nestjs.com/http/server-sent-events

服务器发送的事件（SSE) 是一种服务器推送技术，它使客户端能够通过 HTTP 联系。每个通知都是以一对换行符结尾的文本块发送的（请参见 [Server-sent events on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) 了解更多）。

#### 使用

若要在路由（在**控制器类**中注册的路由）上启用服务器发送的事件，请使用 `@Sse()` 装修师。

```typescript
@Sse('sse')
sse(): Observable<MessageEvent> {
  return interval(1000).pipe(map((_) => ({ data: { hello: 'world' } })));
}
```

> info **Hint** 这个 `@Sse()` 装饰和 `MessageEvent` 接口是从 `@nestjs/common` 包，而 `Observable`,`interval`，和 `map` 是从 `rxjs` 包装。

> warning **Warning** 服务器发送的事件路由必须返回一个 `Observable` 流（或解析为一个的 `Promise` 流，如 [以下](/http/server-sent-events#client-disconnection) 所示）。

在上面的示例中，我们定义了一个名为 `sse` 传播实时更新。客户端可以使用 [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource).

这个 `sse()` 方法返回一个 `Observable` 发射多个 `MessageEvent` 对象（在本例中，一个新的 `MessageEvent` 每一秒）。每个 `MessageEvent` 对象应遵循以下接口以匹配规范：

```typescript
export interface MessageEvent {
  data?: string | object;
  id?: string;
  type?: string;
  retry?: number;
  comment?: string;
}
```

对象 `data` 被序列化为 JSON。`type` 属性作为 SSE`event` 字段发送，`comment` 作为注释行发送，`EventSource` 客户端会忽略该注释行（例如，作为保持生存状态很有用）。如果不设置 `id`，Nest 将为每个事件分配一个递增的 ID。

有了这个，您就可以创建 `EventSource` 客户端应用程序中的类，传递 `/sse` 路由（与传递给 `@Sse()` 上面的装饰器）作为构造函数参数。

安 `EventSource` 实例打开到 HTTP 服务器，它在 `text/event-stream` 格式。连接保持打开状态，直到通过调用将其关闭 `EventSource.close()`.

一旦连接打开，来自服务器的传入消息就会以事件的形式传递给您的代码。如果传入的消息具有 `event` 字段，则触发的事件具有与字段值相同的名称。如果不存在 `event` 字段，将触发通用 `message` 事件（参见 [EventSource documentation on MDN](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)）。

```javascript
const eventSource = new EventSource('/sse');
eventSource.onmessage = ({ data }) => {
  console.log('New message', JSON.parse(data));
};
```

#### 状态代码和标题

安 `@Sse()` 路由发送标头设置为 `@Header()` 装修师。从 NestJSv12.1.3，它还会在流开始之前发送其处理程序或拦截器在响应上设置的状态代码，并且 Fastify，他们设置的标题（Express 已经发送了）。若要在处理程序中设置它们，请使用 `@Res()` 装饰及其 `passthrough` 选项已启用：

```typescript
@Sse('sse')
sse(@Res({ passthrough: true }) res: Response): Observable<MessageEvent> {
  res.status(202);
  res.header('x-version', '1.0.0');
  return interval(1000).pipe(map((_) => ({ data: { hello: 'world' } })));
}
```

> info **Hint** `Res` 是从 `@nestjs/common` 包，以及 `Response` 从 `express` 包装。在 Fastify，使用 `FastifyReply` 从 `fastify` 包装。

#### 客户端断开连接

当客户端关闭 SSE 连接（例如，使用 `eventSource.close()`）时，Nest 会自动从返回的 `Observable` 中取消订阅。这将停止事件流并清理任何相关资源，包括上面示例中的间隔定时器。

若要在客户端断开连接时运行自定义拆卸逻辑，请使用 `finalize` 操作员：

```typescript
@Sse('sse')
sse(): Observable<MessageEvent> {
  return interval(1000).pipe(
    map((_) => ({ data: { hello: 'world' } })),
    finalize(() => console.log('Client disconnected')),
  );
}
```

> info **Hint** 这个 `finalize` 运算符（从 `rxjs`) 每当 `Observable` 终止：通过完成、错误或取消订阅（包括客户端断开连接）。这使得它成为释放绑定到流的外部资源（如数据库游标或文件句柄）的正确位置。

安 `@Sse()` 处理程序可以是异步的，返回 `Promise<Observable>` 而不是一个 `Observable` 直接地。当流在产生第一个事件之前需要昂贵的设置时，这种情况很常见，例如打开数据库游标、获取模型会话或针对下游服务进行授权。

```typescript
@Sse('stream')
async stream(): Promise<Observable<MessageEvent>> {
  const session = await createSession();

  return new Observable(subscriber => {
    // ...produce events from `session`
  });
}
```

这留下了一个缺口。如果客户端断开连接**而承诺仍在解析中**，Nest 从不订阅返回的 `Observable` 因为它不会启动一个消费者已经离开的生产者。这是流的正确行为，但这意味着 `Observable` 的拆卸逻辑永远不会运行，并且在安装过程中分配的任何内容（`session` 上图）泄漏。

要缩小差距，请注入请求的 `AbortSignal` 与 `@SseSignal()` 装饰师：

```typescript
import { MessageEvent, Sse, SseSignal } from '@nestjs/common';
import { EMPTY, Observable } from 'rxjs';

@Sse('stream')
async stream(@SseSignal() signal: AbortSignal): Promise<Observable<MessageEvent>> {
  const session = await createSession();

  if (signal.aborted) {
    // The client disconnected during setup. The Observable below will never be
    // subscribed, so release the resource here.
    await session.close();
    return EMPTY;
  }

  return new Observable(subscriber => {
    const stream = session.start();
    stream.on('data', data => subscriber.next({ data }));

    return () => {
      stream.stop();
      session.close();
    };
  });
}
```

#### 信号寿命

该信号表示**的寿命 SSE 响应**，不仅仅是连接。一旦流因任何原因终止，它就会中止：

- 客户端断开连接；
- 这个 `Observable` 完成；
- 这个 `Observable` 出错了。

这使得信号成为整个请求的单个清理挂钩。而不是在一个 `abort` 听众和 `Observable` 的自带拆卸功能，您可以将资源连接到信号上一次，并在每个出口路径上释放它们：

```typescript
@Sse('stream')
async stream(@SseSignal() signal: AbortSignal): Promise<Observable<MessageEvent>> {
  // The signal aborts when the response ends, so the fetch is canceled whether
  // the client disconnected or the stream simply finished.
  const upstream = await fetch(UPSTREAM_URL, { signal });

  return new Observable(subscriber => {
    // ...
  });
}
```

因为信号在正常完成时也会中止，`signal.aborted` 只有当“客户走了吗？”才有意义。检查**在设置过程中**，在 `Observable` 被返回。此时，流可能还没有完成，因此中止的信号明确意味着客户端断开连接。

> warning **Notice** 清理连线至 `abort` 事件可以与 `Observable` 的拆卸函数，所以使它是幂等的。

在生产者内部，您还可以在客户端离开时使用信号结束流：

```typescript
return new Observable<MessageEvent>(subscriber => {
  const timer = setInterval(() => subscriber.next({ data: 'tick' }), 1000);
  const onAbort = () => subscriber.complete();

  signal.addEventListener('abort', onAbort, { once: true });

  return () => {
    clearInterval(timer);
    signal.removeEventListener('abort', onAbort);
  };
});
```

> info **Hint** `@SseSignal()` 仅填充在 `@Sse()` 道路；在任何其他路由处理程序上，它解析为 `undefined`.它在 Express 和 Fastify 平台。

#### 例子

[第 28 个样品](https://github.com/nestjs/nest/tree/master/sample/28-sse) 中提供了一个工作示例。
