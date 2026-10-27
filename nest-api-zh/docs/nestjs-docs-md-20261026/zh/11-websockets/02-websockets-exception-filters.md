# Exception filters

Source: https://docs.nestjs.com/websockets/exception-filters

WebSockets 异常层的工作方式如下 HTTP [异常过滤器](/exception-filters) 层，有一点不同：而不是投掷 `HttpException`,扔 `WsException`.

```typescript
throw new WsException('Invalid credentials.');
```

> info **Hint** 这个 `WsException` 类是从 `@nestjs/websockets` 包装。

当处理程序抛出上述异常时，Nest 抓住它并发出一个 `exception` 发送给客户端的消息具有以下结构：

```typescript
{
  status: 'error',
  message: 'Invalid credentials.',
  cause: {
    pattern: 'events', // pattern of the message that caused the exception
    data: { name: 'Nest' }, // payload of that message
  },
}
```

这个 `cause` 属性允许客户端将错误与触发错误的消息相关联。如果将对象（而不是字符串）传递给 `WsException` 构造函数，Nest 按原样发射该对象。任何不是 `WsException` 生成相同的结构，`'Internal server error'` 作为信息。与 `ws` 适配器，它没有命名事件，客户端接收 JSON 表单字符串 `{ "event": "exception", "data": ... }` 反而。

#### 过滤器

WebSocket 异常筛选器的行为方式与 HTTP 异常筛选器相同。以下示例使用手动实例化的方法范围过滤器。与基于 HTTP 的应用程序一样，您也可以使用网关范围过滤器（即用 `@UseFilters()` 修饰网关类）。

```typescript
@UseFilters(new WsExceptionFilter())
@SubscribeMessage('events')
onEvent(client, data: any): WsResponse<any> {
  const event = 'events';
  return { event, data };
}
```

> warning **Warning** 全局异常筛选器（注册为 `app.useGlobalFilters()` 或者 `APP_FILTER` 令牌）不适用于网关。在网关或方法级别绑定 WebSocket 异常筛选器 `@UseFilters()`.

#### 遗产

通常，您将根据应用程序需求创建完全定制的异常筛选器。但是，有时您可能希望扩展**核心异常筛选器**并根据某些因素覆盖其行为。

若要将异常处理委托给基本筛选器，请展开 `BaseWsExceptionFilter` 并调用继承的 `catch()` 方法。

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';

@Catch()
export class AllExceptionsFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    super.catch(exception, host);
  }
}
```

上面的实现只是演示该方法的一个外壳。一个真正的扩展异常过滤器会添加您自己的**业务逻辑**（例如，处理各种条件）。

这个 `BaseWsExceptionFilter` 构造函数接受选项对象。设置 `includeCause` 二 `false` 省略 `cause` 属性来自错误消息，或传递 `causeFactory(pattern, data)` 控制其形状的函数。
