# Guards

Source: https://docs.nestjs.com/websockets/guards

WebSocket guards 和 [定期的 HTTP 应用防护](/guards) 之间没有本质区别。唯一的区别是，你应该抛出 `HttpException`，而不是抛出 `WsException`。如果守卫返回 `false`，Nest 将抛出带有消息 `'Forbidden resource'` 的 `WsException`。

> info **Hint** 这个 `WsException` 类从 `@nestjs/websockets` 包装。

#### 绑定防护装置

以下示例使用方法作用域防护。与基于 HTTP 的应用程序一样，您也可以使用网关作用域保护（即用 `@UseGuards()` 修饰网关类）。使用 `app.useGlobalGuards()` 或 `APP_GUARD` 令牌注册的全局守卫也适用于网关。

```typescript
@UseGuards(AuthGuard)
@SubscribeMessage('events')
handleEvent(client: Client, data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}
```
