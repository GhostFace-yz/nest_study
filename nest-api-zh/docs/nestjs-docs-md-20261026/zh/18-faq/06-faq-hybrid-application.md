# Hybrid application

Source: https://docs.nestjs.com/faq/hybrid-application

混合应用程序监听来自两个或多个不同源的请求。它可以结合 HTTP 带有微服务侦听器的服务器，或组合几个不同的微服务侦听器。这个 `createMicroservice()` 方法不支持多个服务器，因此在这种情况下，您需要手动创建和启动每个微服务。为此，请连接 `INestMicroservice` 实例到 `INestApplication` 实例 `connectMicroservice()` 方法。

```typescript
const app = await NestFactory.create(AppModule);
const microservice = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.TCP,
});

await app.startAllMicroservices();
await app.listen(3001);
```

> info **Hint** 这个 `app.listen(port)` 方法启动 HTTP 指定端口上的服务器。如果您的应用程序无法处理 HTTP 请求，使用 `app.init()` 而是方法。

> warning **Notice** 这些电话的顺序很重要。和 `await app.startAllMicroservices()` 首先（如上所述），微服务在应用程序的生命周期挂钩（例如 `onModuleInit` 和 `onApplicationBootstrap`）已经完成。呼吁 `app.listen()`（或 `app.init()`）之前 `startAllMicroservices()` 如果处理程序在每个模块完全初始化之前不得接收消息。

要连接多个微服务实例，请调用 `connectMicroservice()` 每个微服务一次：

```typescript
const app = await NestFactory.create(AppModule);
// microservice #1
const microserviceTcp = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.TCP,
  options: {
    port: 3002,
  },
});
// microservice #2
const microserviceRedis = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.REDIS,
  options: {
    host: 'localhost',
    port: 6379,
  },
});

await app.startAllMicroservices();
await app.listen(3001);
```

在具有多个微服务的混合应用程序中，可以绑定 `@MessagePattern()` 到单个传输策略（例如，NATS) 通过传递标识传输的第二个参数。对于内置策略，这是 `Transport` 枚举；对于一个 [定制运输机](/microservices/custom-transport)，是 `transportId` 其服务器类的符号。

```typescript
@MessagePattern('time.us.*', Transport.NATS)
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}
@MessagePattern({ cmd: 'time.us' }, Transport.TCP)
getTCPDate(@Payload() data: number[]) {
  return new Date().toLocaleTimeString(...);
}
@MessagePattern('topic.time.us', XYZServer.Transport) // XYZServer is a custom transporter
getXYZDate(@Payload() data: number[]) {
  return new Date().toLocaleTimeString(...);
}
```

> info **Hint** `@Payload()`、`@Ctx()`、`Transport` 和 `NatsContext` 是从 `@nestjs/microservices` 导入的。`XYZServer.Transport` 此处代表自定义传送器暴露的 `transportId` 符号。

#### 共享配置

默认情况下，连接的微服务不会继承为主（基于 HTTP）应用程序配置的全局管道、拦截器、防护和过滤器。这既适用于使用 `useGlobal*()` 方法注册的增强器，也适用于使用 `APP_PIPE`、`APP_INTERCEPTOR`、`APP_GUARD` 和 `APP_FILTER` 令牌注册为提供者的增强器。
若要继承此配置，请将 options 对象中的 `inheritAppConfig` 属性设置为 `connectMicroservice()` 的第二个参数：

```typescript
const microservice = app.connectMicroservice<MicroserviceOptions>(
  {
    transport: Transport.TCP,
  },
  { inheritAppConfig: true },
);
```

> info **Hint** 连接的微服务在 `connectMicroservice()` 叫做。当您使用 `inheritAppConfig`, 呼叫 `app.useGlobalPipes()`,`app.useGlobalGuards()`，还有另一个 `useGlobal*()` 方法**之前**`connectMicroservice()`，否则它们注册的增强器将不会应用于微服务的处理程序。
