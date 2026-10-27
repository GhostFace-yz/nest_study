# CSRF Protection

Source: https://docs.nestjs.com/security/csrf

跨站点请求伪造（CSRF 或者 XSRF) 是一种攻击，其中恶意站点使用户的浏览器向您的应用程序发送不需要的、改变状态的请求。因为浏览器将用户的 cookies 附加到这些请求上，所以应用程序会将它们视为用户故意发送的。

从 NestJSv12.1，Nest 有内置的 CSRF 保护。它的工作原理是一样的 Express 和 Fastify，并且不需要额外的包、cookie、会话或更改客户端代码。

#### 它是如何工作的

现代浏览器告诉服务器每个请求来自哪里。他们发送一个 [`Sec-Fetch-Site`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-Fetch-Site) 头（获取元数据的一部分），它是 `same-origin` 当您自己的一个页面提出请求时，以及 `same-site` 或者 `cross-site` 当另一个网站做的时候。他们还发送了一个 `Origin` 具有交叉源请求的标头。内置保护拒绝浏览器报告为交叉源的状态更改请求，遵循 Go 1.25 的算法 [`CrossOriginProtection`](https://pkg.go.dev/net/http#CrossOriginProtection).

详细地，每个请求的检查如下：

1. `GET`,`HEAD` 和 `OPTIONS` 请求总是被允许的。
2. 如果请求有一个 `Sec-Fetch-Site` 标题，值 `same-origin` 和 `none`（用户开始的导航，如打开书签）是允许的。任何其他值，包括 `same-site`，被拒绝。
3. 如果请求既没有 `Sec-Fetch-Site` 诺尔安 `Origin` 头，这是允许的，因为它不是来自浏览器。
4. 否则，`Origin` 头的主机必须匹配请求的 `Host` 头（HTTP/2 上的 `:authority`）。该比较不区分大小写，并且忽略了方案的默认端口，因此 `https://example.com` 匹配 `example.com:443`。忽略 `X-Forwarded-Host` 标题。

当请求与 [排除路线](/security/csrf#excluding-routes) 匹配时，或者当它的 `Origin` 是 [可信来源](/security/csrf#trusted-origins) 之一时，仍然允许被拒绝的请求。

#### 入门

要启用保护，请调用 `enableCsrfProtection()` 方法 Nest 应用对象：

```typescript
// main.ts
const app = await NestFactory.create(AppModule);
app.enableCsrfProtection();
await app.listen(process.env.PORT ?? 3000);
```

检查对每个请求运行，包括对不存在的路由的请求 Nest 中间件、主体解析、防护、拦截器和路由处理程序。适用以下规则：

- 在 `app.init()` 或 `app.listen()` 之前调用 `enableCsrfProtection()`。之后调用它，或者调用两次，都会抛出错误。
- 当您调用该方法时，选项会被验证，因此错误的配置会在启动时失败。例如，拼写错误的选项会抛出 `Invalid CSRF protection options: unknown option "trustedOrigin" (expected "trustedOrigins", "exclude").`
- 检查被注册为框架级中间件（Express）或 `onRequest` 钩子（Fastify) 在调用方法的点上。注册的中间件 `app.use()` 在调用首先运行之前，请调用 `enableCsrfProtection()` 就在之后 `NestFactory.create()`.
- `app.useSecurityHeaders()`（见 [Security headers](/security/helmet)) 共享相同的请求挂钩。可以按任意顺序调用这两个方法：头总是写在 CSRF 检查运行，因此被拒绝的请求也携带它们。
- `setGlobalPrefix()` 和 `enableVersioning()` 可以在之前或之后调用 `enableCsrfProtection()`，因为排除在应用程序初始化时被解析。

#### 拒绝的请求

被拒绝的请求变成 `ForbiddenException`，它通过您的全球 [异常筛选器](/exception-filters) 就像其他例外一样。如果没有自定义筛选器，客户端会收到一个 `403` 这样回答：

```json
{
  "message": "Cross-origin request detected from Sec-Fetch-Site header",
  "error": "Forbidden",
  "statusCode": 403
}
```

当请求没有 `Sec-Fetch-Site` 头并且其 `Origin` 与 `Host` 不匹配时，消息为 `Cross-origin request detected, and/or browser is out of date: Sec-Fetch-Site is missing, and Origin does not match Host`。

由于检查在路由之前运行，因此控制器范围内的过滤器、保护和拦截器不会针对被拒绝的请求运行。

#### 选项

这个 `enableCsrfProtection()` 方法接受可选的选项对象：

```typescript
app.enableCsrfProtection({
  trustedOrigins: ['https://admin.example.com'],
  exclude: [{ path: 'webhooks/stripe', method: RequestMethod.POST }],
});
```

| 选择 | 类型 | 描述 |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `trustedOrigins` | `string[]` | 可以发送跨起源、状态更改请求的起源。默认值为无。 |
| `exclude` | 路径阵列和 `RouteInfo` 对象或函数 | 跳过检查的请求。仅对否则会被拒绝的请求进行咨询。 |

当调用该方法时，任何其他选项都将被拒绝。

#### 可信来源

从另一个源服务的前端（例如兄弟子域上的管理面板）发送跨源请求。浏览器将它们报告为 `same-site` 或 `cross-site`，因此它们将被拒绝，除非您在 `trustedOrigins` 中列出前端的来源：

```typescript
app.enableCsrfProtection({
  trustedOrigins: ['https://admin.example.com', 'http://localhost:4200'],
});
```

每个条目必须是 `scheme://host[:port]` 形式的序列化源：

- 一条小路（即使是一条小路 `/`)、查询字符串、片段、凭据和通配符是不允许的。分别列出每个原产地。
- 条目的规范化方式与浏览器序列化的方式相同 `Origin` 标题：小写，没有默认端口。 `https://Example.com:443` 变成 `https://example.com`.
- 请求在以下情况下被豁免：`Origin` 标题正好等于其中一个条目。

无效条目在启动时抛出，例如 `Invalid trusted origin "https://example.com/": expected "scheme://host[:port]", without a path, query string or fragment.`

> warning **Warning** 允许的原产地 [CORS](/security/cors) 不会自动信任。如果跨源前端发送带有凭据的状态更改请求，请在 `trustedOrigins` 也。

#### 排除路线

服务器到服务器请求通常既不携带 `Sec-Fetch-Site` 也不 `Origin`，因此它们无需任何配置即可通过检查。当路由必须接受来自外部来源的请求时，排除该路由，例如来自设置 `Origin` 头，或来自身份提供者，该提供者使用跨站点表单将用户发送回您的应用程序 `POST`(SAML，或 OAuth 的 `form_post` 响应模式）。

排除声明如下： `MiddlewareConsumer.exclude()` （见 [Middleware](/middleware)）：作为路径，匹配每个请求方法，或者作为 `RouteInfo` 对象 `path`, a `method` 和一个可选的 `version`.路径声明时没有全局前缀：

```typescript
// main.ts
import { RequestMethod } from '@nestjs/common';

app.setGlobalPrefix('api');
app.enableCsrfProtection({
  exclude: [
    // POST /api/webhooks/stripe
    { path: 'webhooks/stripe', method: RequestMethod.POST },
    // POST /api/auth/saml/callback
    { path: 'auth/saml/callback', method: RequestMethod.POST },
  ],
});
```

当应用程序初始化时，将解决排除：

- 这个 [全局前缀](/faq/global-prefix) 是添加的，除非路由从中排除。
- 和 [URI 版本](/http/versioning) 的版本段 `version` 属性被添加。未应用默认版本，因此设置 `version` 关于排除版本化路线。
- 路由参数和通配符的工作方式与路由路径相同，例如 `webhooks/:provider` 或 `webhooks/*path`。

不像 `MiddlewareConsumer.exclude()`，匹配是精确的，因为宽松匹配可以让请求到达不排除的路由：

- 匹配区分大小写，尾部斜杠不匹配。查询字符串被忽略。
- 非规范请求路径永远不匹配：包含 `//`、`.` 或 `..` 段、`;`、`#`、`\` 或百分比编码的 `.`、`/` 或 `\` 的路径。此类请求与其他请求一样通过检查，因此保护无法关闭。
- 在 Fastify，排除与 URL 以前 `rewriteUrl` 运行，如 `MiddlewareConsumer.exclude()`.

如果你的 Fastify 应用程序启用 `ignoreTrailingSlash` 或者 `caseSensitive: false` 路由器选项，排除路径的变体仍然到达路由，但没有被排除，因此它们被拒绝。如果客户需要这样的变体，明确列出它们。因为尾随斜杠是从排除路径中剥离的，所以使用可选组来匹配它：

```typescript
app.enableCsrfProtection({
  exclude: [
    // matches /webhooks/stripe and /webhooks/stripe/
    { path: 'webhooks/stripe{/}', method: RequestMethod.POST },
    // a variant accepted with caseSensitive: false
    { path: 'webhooks/Stripe', method: RequestMethod.POST },
  ],
});
```

而不是列表，`exclude` 还接受接收平台请求对象的谓词（anExpress`Request` 或者一个 `FastifyRequest`）和回报 `true` 跳过检查。它只对否则会被拒绝的请求调用。

> warning **Warning** 谓词接收原始请求，因此上面的匹配规则都不适用于它。例如，测试 `request.url` 是否以 `/public/` 开头的谓词也会跳过对 `/public/../account` 的检查，路由器或代理可能会将其解析为 `/account`。尽可能选择一份路线列表。

#### 限制

- 这种保护不是一种象征性的方案。它依赖于浏览器的 `Sec-Fetch-Site` 头，浏览器仅将其发送到安全源（HTTPS 或者 `localhost`），或在 `Origin` 头球。
- `GET`,`HEAD` 和 `OPTIONS` 请求从不被检查，因此这些方法的处理程序不能更改状态。
- 这个 `Origin`/`Host` 回退不知道这个计划。对于不发送的浏览器 `Sec-Fetch-Site`，来自 `http://example.com` 二 `https://example.com` 是允许的（无法打开），就像在 Go 中一样。[HSTS](/security/helmet#default-headers)，其中 `app.useSecurityHeaders()` 默认发送，缓解了这种情况。
- `X-Forwarded-Host` 被忽略。在一个代理后面重写 `Host` 标题，不发送的浏览器 `Sec-Fetch-Site` 点击回退并收到一个 `403`.配置代理以保留 `Host`，或将您的公共来源添加到 `trustedOrigins`.
- 当 CORS 在保护之后注册时，`403` 响应不携带 CORS 头，`NestFactory.create()` 的 `cors` 选项就是这种情况。
- 注册的中间件 `app.use()` 以前 `enableCsrfProtection()` 在检查之前运行，并请求不检查此类中间件响应。
- 不检查 WebSocket 升级请求。如果你的 [网关](/websockets/gateways) 使用 cookies 验证连接，验证握手 `Origin` 你自己标题。

#### 当您需要基于令牌的方法时

CSRF 滥用浏览器自动附加到请求的凭据，因此非浏览器客户端（如移动应用程序），CLI 工具和其他服务器，不需要 CSRF 保护。他们的请求既不包含 `Sec-Fetch-Site` 也不 `Origin`，并且是允许的。

每个常青浏览器都发送了 `Sec-Fetch-Site` 自 2023 年起。非常旧的浏览器既不发送标头，看起来就像非浏览器客户端，所以它们的请求也是允许的。如果您必须保护此类浏览器的用户，请添加一个基于令牌的方案，如下所述。

#### 基于令牌的保护

基于令牌的方案将秘密存储在 cookie 或会话中，并要求客户端在每个状态更改请求中发送匹配的令牌。他们需要对您的客户端代码和依赖于底层平台的包进行更改。

##### Express

安装 [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) 包装：

```bash
$ npm i csrf-csrf
```

然后将其中间件注册为全局中间件。这个 `doubleCsrf()` 函数需要 `getSecret` 和 `getSessionIdentifier` 选项；其他选项有默认值：

```typescript
// main.ts
import { doubleCsrf } from 'csrf-csrf';

const { doubleCsrfProtection } = doubleCsrf(doubleCsrfOptions);
app.use(doubleCsrfProtection);
```

> warning **Warning** 如 [csrf-csrf 文档](https://github.com/Psifi-Solutions/csrf-csrf?tab=readme-ov-file#getting-started)，此中间件需要会话中间件或 `cookie-parser` 要预先初始化。`doubleCsrf()` 还返回一个函数，该函数生成路由交给客户端的令牌。更多详情请参考文档。

##### Fastify

安装 [@fastify/csrf-protection](https://github.com/fastify/csrf-protection) 包装：

```bash
$ npm i @fastify/csrf-protection
```

然后将其注册为 Fastify 插件：

```typescript
// main.ts
import fastifyCsrf from '@fastify/csrf-protection';

// after registering a storage plugin
await app.register(fastifyCsrf);
```

> warning **Warning** 如 [@fastify/csrf-protection documentation](https://github.com/fastify/csrf-protection#usage)，此插件需要一个存储插件（`@fastify/cookie`,`@fastify/session`, 或 `@fastify/secure-session`) 先注册。
