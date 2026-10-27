# Pipes

Source: https://docs.nestjs.com/websockets/pipes

之间没有根本区别 [常规管道](/pipes) 和 WebSocket 管道。唯一的区别是，不是扔 `HttpException`，你应该扔 `WsException`.只有一个 `WsException` 用自己的消息到达客户端。任何其他例外情况，包括 `BadRequestException` 默认情况下，内置验证管道抛出的数据将报告给客户端 `'Internal server error'`.

> info **Hint** 这个 `WsException` 类从 `@nestjs/websockets` 包装。

#### 捆扎管

以下示例使用手动实例化的方法作用域管道。与基于 HTTP 的应用程序一样，您也可以使用网关作用域管道（即用 `@UsePipes()` 修饰网关类）。使用 `app.useGlobalPipes()` 或 `APP_PIPE` 令牌注册的全局管道也适用于网关。

```typescript
@UsePipes(new ValidationPipe({ exceptionFactory: (errors) => new WsException(errors) }))
@SubscribeMessage('events')
handleEvent(client: Client, data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}
```

方法、网关和全局作用域管道为消息处理程序的每个参数运行。若要仅转换或验证消息有效载荷，请在参数级别绑定管道，例如 `@MessageBody(new ParseIntPipe())` 或 `@MessageBody('id', ParseIntPipe)`。

#### 基于模式的验证

喜欢 HTTP 参数装饰器，`@MessageBody()` 接受选项对象 `schema` 财产。模式可以来自任何 [Standard Schema](https://standardschema.dev/) 兼容库，如 Zod、Valibot 或 ArkType。内置的 `StandardSchemaValidationPipe` 根据该模式验证有效载荷，并在没有模式的情况下传递参数。看 [Schema-based validation](/application/validation#schema-based-validation) 详情。

```typescript
@UsePipes(
  new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => new WsException(issues),
  }),
)
@SubscribeMessage('events')
handleEvent(@MessageBody({ schema: createEventSchema }) data: CreateEventDto) {
  return data;
}
```

要提取单个属性并验证它，请首先传递属性键：`@MessageBody('id', { schema: z.number() })`。
