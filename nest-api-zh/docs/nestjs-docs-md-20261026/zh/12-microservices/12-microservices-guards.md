# Guards

Source: https://docs.nestjs.com/microservices/guards

微服务防护的工作方式与 [定期的 HTTP 应用防护](/guards) 相同。唯一的区别是他们应该抛出 `RpcException` 而不是 `HttpException`。当守卫返回 `false` 时，Nest 抛出带有 `Forbidden resource` 消息的 `RpcException`。

> info **Hint** 这个 `RpcException` 类从 `@nestjs/microservices` 包装。

#### 绑定防护装置

以下示例使用方法作用域防护。和 HTTP 基于-的应用程序，还可以使用控制器作用域保护（即，在控制器类前缀为 `@UseGuards()` 装饰师）。

```typescript
@UseGuards(AuthGuard)
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}
```

> info **Hint** 除非您设置了 `inheritAppConfig` 选项，否则在主 HTTP 应用程序上注册的全局守卫不适用于连接到 [混合应用](/faq/hybrid-application) 的微服务。见 [共享配置](/faq/hybrid-application#sharing-configuration)。
