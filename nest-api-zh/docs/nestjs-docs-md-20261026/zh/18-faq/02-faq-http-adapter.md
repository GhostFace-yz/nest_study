# HTTP adapter

Source: https://docs.nestjs.com/faq/http-adapter

有时，您可能需要访问底层 HTTP 服务器，或者来自 Nest 应用程序上下文或来自应用程序上下文之外。

每个本机（特定于平台）HTTP 服务器或库实例（例如，Express 或者 Fastify）被包装在一个**适配器**中。适配器注册为全局可用的提供程序，因此您可以从应用程序上下文中检索它或将其注入到其他提供程序中。

#### 外部应用上下文策略

获取对 `HttpAdapter` 从应用程序上下文外部，调用 `getHttpAdapter()` 方法：

```typescript
const app = await NestFactory.create(AppModule);
const httpAdapter = app.getHttpAdapter();
```

#### 可注射

获取对 `HttpAdapterHost` 从应用程序上下文中，像任何其他提供程序一样注入它（例如，使用构造函数注入）：

```typescript
export class CatsService {
  constructor(private adapterHost: HttpAdapterHost) {}
}
```

> info **Hint** 这个 `HttpAdapterHost` 是从 `@nestjs/core` 包装。

`HttpAdapterHost` 不是实际的 `HttpAdapter`。要获得实际的 `HttpAdapter` 实例，请读取其 `httpAdapter` 属性：

```typescript
const adapterHost = app.get(HttpAdapterHost);
const httpAdapter = adapterHost.httpAdapter;
```

`httpAdapter` 是包装底层框架的 HTTP 适配器实例。它是 `ExpressAdapter` 或 `FastifyAdapter` 的实例（两个类都扩展了 `AbstractHttpAdapter`）。

适配器对象公开了几种与 HTTP 服务器。访问库实例（例如，Express 实例）直接，调用 `getInstance()` 方法：

```typescript
const instance = httpAdapter.getInstance();
```

#### 收听事件

若要在服务器开始侦听传入请求时运行代码，请订阅 `listen$` 流：

```typescript
this.httpAdapterHost.listen$.subscribe(() =>
  console.log('HTTP server is listening'),
);
```

这个 `HttpAdapterHost` 还暴露了 `listening` 指示服务器当前是否正在监听的布尔属性：

```typescript
if (this.httpAdapterHost.listening) {
  console.log('HTTP server is listening');
}
```
