# CORS

Source: https://docs.nestjs.com/security/cors

跨源资源共享（CORS) 是允许从另一个域请求资源的机制。在底层，Nest 使用 Express[科尔](https://github.com/expressjs/cors) 包装或 Fastify[@fastify/cors](https://github.com/fastify/fastify-cors) 包，取决于底层平台。这些软件包提供了各种选项，您可以根据自己的要求进行定制。

#### 入门

启用 CORS，打电话给 `enableCors()` 方法 Nest 应用对象。

```typescript
const app = await NestFactory.create(AppModule);
app.enableCors();
await app.listen(process.env.PORT ?? 3000);
```

这个 `enableCors()` 方法获取一个可选的配置对象。它的可用属性在官方文件中描述 [CORS 配置选项](https://github.com/expressjs/cors#configuration-options) 文件。或者，通过 [回调函数](https://github.com/expressjs/cors#customizing-cors-settings-dynamically-per-request) 它计算每个请求的配置对象。

您还可以启用 CORS 通过选项对象 `create()` 方法。设置 `cors` 财产至 `true` 启用 CORS 使用默认设置，或传递 [CORS 配置对象](https://github.com/expressjs/cors#configuration-options) 或者 [回调函数](https://github.com/expressjs/cors#customizing-cors-settings-dynamically-per-request) 作为 `cors` 属性值以自定义其行为。

```typescript
const app = await NestFactory.create(AppModule, { cors: true });
await app.listen(process.env.PORT ?? 3000);
```

#### 默认允许的方法

这两个包不共享相同的默认值，因此 `enableCors()` 没有选项不做广告 `Access-Control-Allow-Methods` 在两个平台上。这个 Express [科尔](https://github.com/expressjs/cors) 套餐答案 `GET,HEAD,PUT,PATCH,POST,DELETE`，而 [@fastify/cors](https://github.com/fastify/fastify-cors) 只回答 [CORS-safelisted methods](https://fetch.spec.whatwg.org/#methods): `GET,HEAD,POST`.

> warning **Warning** 在 Fastify 上，除非您自己列出方法，否则交叉原点 `PUT`、`PATCH` 或 `DELETE` 将在飞行前阶段被拒绝。相同的应用程序代码适用于 Express。

两个软件包读起来相同 `methods` 选项，因此每当您 API 使用安全列表之外的方法从另一个源调用。它被接受 `enableCors()` 通过 `cors` 财产 `create()` 选项对象相似。

```typescript
app.enableCors({
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
});
```
