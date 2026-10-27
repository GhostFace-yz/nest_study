# Session

Source: https://docs.nestjs.com/http/session

**HTTP 会话**跨多个请求存储有关用户的信息，这对于 [MVC](/http/mvc) 应用。

#### 与 Express（默认）

首先，安装 [express-session](https://github.com/expressjs/session) 包（及其类型，用于 TypeScript 用户）：

```shell
$ npm i express-session
$ npm i -D @types/express-session
```

安装完成后，应用 `express-session` 中间件作为全局中间件（例如，在 `main.ts` 文件）：

```typescript
import session from 'express-session';
// somewhere in your initialization file
app.use(
  session({
    secret: 'my-secret',
    resave: false,
    saveUninitialized: false,
  }),
);
```

> warning **Notice** 默认的服务器端会话存储故意不是为生产环境设计的。它在大多数情况下都会泄漏内存，不会扩展到单个进程，并且用于调试和开发。在 [快速会话存储库](https://github.com/expressjs/session) 中阅读更多内容。

这个 `secret` 用于签名会话 ID 曲奇。它可以是一个字符串（单个秘密），也可以是一个秘密数组。如果提供数组，则只有第一个元素用于签名会话 IDcookie，而在验证请求中的签名时会考虑所有元素。秘密不应该轻易猜到；一组随机的字符效果最好。

启用 `resave` 选项强制将会话保存回会话存储区，即使在请求期间从未修改过会话。默认值为 `true`，但不推荐依赖默认值，因为默认值将来会更改。

同样，启用 `saveUninitialized` 选项强制将“未初始化”的会话保存到存储。当会话是新的但未修改时，会话未初始化。选择 `false` 对于实现登录会话、减少服务器存储使用或遵守在设置 cookie 之前需要许可的法律非常有用。选择 `false` 对于客户端在没有会话的情况下发出多个并行请求的竞争情况也有帮助（请参见 [`saveUninitialized` documentation](https://github.com/expressjs/session#saveuninitialized)).

`session` 中间件接受其他几个选项。在 [快速会话 API 文件](https://github.com/expressjs/session#options) 中阅读更多关于它们的信息。

> info **Hint** 这个 `cookie.secure: true` 推荐选项。但是，它需要一个 HTTPS-启用的网站，因为仅发送安全 cookies HTTPS.如果 `secure` 设置后，您可以通过以下方式访问站点 HTTP，未设置 cookie。如果你的 Node.js 服务器运行在代理后面，您使用 `secure: true`，您需要设置 `"trust proxy"` 在 Express.

完成此操作后，您可以在路由处理程序中设置和读取会话值，如下所示：

```typescript
@Get()
findAll(@Req() request: Request) {
  request.session.visits = request.session.visits ? request.session.visits + 1 : 1;
}
```

> info **Hint** 这个 `@Req()` 装饰器是从 `@nestjs/common` 包，而 `Request` 是从 `express` 包装。

或者，您可以使用 `@Session()` 从请求中提取会话对象的装饰器，如下所示：

```typescript
@Get()
findAll(@Session() session: Record<string, any>) {
  session.visits = session.visits ? session.visits + 1 : 1;
}
```

> info **Hint** 这个 `@Session()` 装饰器是从 `@nestjs/common` 包装。

#### 与 Fastify

首先，安装所需的软件包：

```shell
$ npm i @fastify/secure-session
```

安装完成后，注册 `@fastify/secure-session` 插件：

```typescript
import secureSession from '@fastify/secure-session';

// somewhere in your initialization file
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
await app.register(secureSession, {
  secret: 'averylogphrasebiggerthanthirtytwochars',
  salt: 'mq9hDxBVDbspDR6n',
});
```

> info **Hint** 您也可以 [预生成密钥](https://github.com/fastify/fastify-secure-session) 或使用 [键旋转](https://github.com/fastify/fastify-secure-session#using-keys-with-key-rotation)。

在 [@fastify/secure-session repository](https://github.com/fastify/fastify-secure-session) 中阅读有关可用选项的更多信息。

完成此操作后，您可以在路由处理程序中设置和读取会话值，如下所示：

```typescript
@Get()
findAll(@Req() request: FastifyRequest) {
  const visits = request.session.get('visits');
  request.session.set('visits', visits ? visits + 1 : 1);
}
```

或者，您可以使用 `@Session()` 从请求中提取会话对象的装饰器，如下所示：

```typescript
@Get()
findAll(@Session() session: secureSession.Session) {
  const visits = session.get('visits');
  session.set('visits', visits ? visits + 1 : 1);
}
```

> info **Hint** `@Session()` 装饰器是从 `@nestjs/common` 包导入的，而 `secureSession.Session` 来自 `@fastify/secure-session` 包（导入语句：`import * as secureSession from '@fastify/secure-session'`）。
