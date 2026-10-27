# Interceptors

Source: https://docs.nestjs.com/microservices/interceptors

微服务拦截器的工作方式与 [常规拦截器](/interceptors) 相同。以下示例使用手动实例化的方法作用域拦截器。与基于 HTTP 的应用程序一样，您也可以使用控制器作用域拦截器（即，在控制器类前缀一个 `@UseInterceptors()` 装饰符）。

```typescript
@UseInterceptors(new TransformInterceptor())
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}
```

> info **Hint** 除非设置了 `inheritAppConfig` 选项，否则在主 HTTP 应用程序上注册的全局拦截器不适用于连接到 [混合应用](/faq/hybrid-application) 的微服务。见 [共享配置](/faq/hybrid-application#sharing-configuration)。
