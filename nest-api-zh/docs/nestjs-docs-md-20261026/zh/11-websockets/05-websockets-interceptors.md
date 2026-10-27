# Interceptors

Source: https://docs.nestjs.com/websockets/interceptors

[常规拦截器](/interceptors) 和 WebSocket 拦截器没有区别。以下示例使用手动实例化的方法作用域拦截器。与基于 HTTP 的应用程序一样，您也可以使用网关作用域拦截器（即用 `@UseInterceptors()` 修饰网关类）。使用 `app.useGlobalInterceptors()` 或 `APP_INTERCEPTOR` 令牌注册的全局拦截器也适用于网关。

```typescript
@UseInterceptors(new TransformInterceptor())
@SubscribeMessage('events')
handleEvent(client: Client, data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}
```
