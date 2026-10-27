# Pipes

Source: https://docs.nestjs.com/microservices/pipes

微服务管道的工作方式与 [常规管道](/pipes) 相同。唯一的区别是他们应该抛出 `RpcException` 而不是 `HttpException`。除非自定义异常筛选器处理它，否则在消息处理过程中抛出的 `HttpException` 将作为通用 `Internal server error` 消息到达客户端。

> info **Hint** 这个 `RpcException` 类从 `@nestjs/microservices` 包装。

#### 捆扎管

以下示例使用手动实例化的方法作用域管道。`exceptionFactory` 选项使 `ValidationPipe` 抛出一个 `RpcException`，而不是其默认的 `BadRequestException`。与基于 HTTP 的应用程序一样，您也可以使用控制器作用域的管道（即，在控制器类前缀一个 `@UsePipes()` 装饰符）。

```typescript
@UsePipes(new ValidationPipe({ exceptionFactory: (errors) => new RpcException(errors) }))
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}
```

`@Payload()` 装饰器还接受 `schema` 选项，该选项允许 `StandardSchemaValidationPipe`（从 `@nestjs/common` 导出）根据 [Standard Schema](/application/validation#schema-based-validation)（例如，Zod 模式）验证有效载荷。以相同的方式配置其 `exceptionFactory` 选项，以便将验证错误抛出为 `RpcException`：

```typescript
@UsePipes(new StandardSchemaValidationPipe({ exceptionFactory: (issues) => new RpcException(issues) }))
@MessagePattern({ cmd: 'sum' })
accumulate(@Payload({ schema: z.array(z.number()) }) data: number[]): number {
  return data.reduce((a, b) => a + b, 0);
}
```

> info **Hint** 除非设置了 `inheritAppConfig` 选项，否则在主 HTTP 应用程序上注册的全局管道不适用于连接到 [混合应用](/faq/hybrid-application) 的微服务。见 [共享配置](/faq/hybrid-application#sharing-configuration)。
