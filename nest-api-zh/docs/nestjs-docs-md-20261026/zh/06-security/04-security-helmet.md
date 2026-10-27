# Security headers

Source: https://docs.nestjs.com/security/helmet

安全头，例如 [Helmet](https://github.com/helmetjs/helmet) 设置，告诉浏览器打开针对众所周知的 web 攻击的保护，如跨站点脚本和点击劫持。例子有 `Content-Security-Policy`, `Strict-Transport-Security` 和 `X-Frame-Options`.

从 NestJS v12.1, Nest 可以为您设置这些标题 `app.useSecurityHeaders()`.它使用与头盔 8 相同的默认设置，工作方式相同 Express 和 Fastify，并且不需要额外的包装。

#### 入门

若要启用标题，请调用 `useSecurityHeaders()` 方法 Nest 应用对象：

```typescript
// main.ts
const app = await NestFactory.create(AppModule);
app.useSecurityHeaders();
await app.listen(process.env.PORT ?? 3000);
```

标题设置在每个响应上：路由响应，`404` 响应、错误响应、被拒绝的响应 [CSRF 保护](/security/csrf) 和服务器发送的事件流。这个 `X-Powered-By` 标题被删除。适用以下规则：

- 在 `app.init()` 或 `app.listen()` 之前调用 `useSecurityHeaders()`。之后调用它，或者调用两次，都会抛出错误。
- 当您调用该方法时，选项会被验证，因此错误的配置会在启动时失败（参见 [Configuring headers](/security/helmet#configuring-headers)）。
- 标头由框架级中间件编写（Express）或 `onRequest` 钩子（Fastify)，在调用方法时注册。注册的中间件 `app.use()` 在调用首先运行之前，这种中间件本身发送的响应不携带报头，因此调用 `useSecurityHeaders()` 就在之后 `NestFactory.create()`.
- `app.enableCsrfProtection()` 共享相同的请求挂钩。可以按任意顺序调用这两个方法：头总是写在 CSRF 检查运行。

#### 默认标题

没有选择，`useSecurityHeaders()` 发送以下标题，其值与头盔 8 相同：

| 头球 | 默认值 | 选择 |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| `Content-Security-Policy` | 看 [Content Security Policy](/security/helmet#content-security-policy) | `contentSecurityPolicy` |
| `Cross-Origin-Embedder-Policy` | 未发送 | `crossOriginEmbedderPolicy` |
| `Cross-Origin-Opener-Policy` | `same-origin` | `crossOriginOpenerPolicy` |
| `Cross-Origin-Resource-Policy` | `same-origin` | `crossOriginResourcePolicy` |
| `Origin-Agent-Cluster` | `?1` | `originAgentCluster` |
| `Referrer-Policy` | `no-referrer` | `referrerPolicy` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `strictTransportSecurity` |
| `X-Content-Type-Options` | `nosniff` | `xContentTypeOptions` |
| `X-DNS-Prefetch-Control` | `off` | `xDnsPrefetchControl` |
| `X-Download-Options` | `noopen` | `xDownloadOptions` |
| `X-Frame-Options` | `SAMEORIGIN` | `xFrameOptions` |
| `X-Permitted-Cross-Domain-Policies` | `none` | `xPermittedCrossDomainPolicies` |
| `X-XSS-Protection` | `0` | `xXssProtection` |
| `X-Powered-By` | 移除 | `xPoweredBy` |

> info **Hint** 浏览器忽略 `Strict-Transport-Security` 过平原 HTTP，和 `X-XSS-Protection: 0` 关闭 XSS 旧浏览器的审计员，这本身就是漏洞的来源。

#### 配置标头

每个选项控制一个标题。通过 `false` 为了省略标题，`true` 发送其默认值或配置它的对象：

```typescript
app.useSecurityHeaders({
  xFrameOptions: false,
  strictTransportSecurity: { maxAge: 63072000, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
```

接受对象的选项具有以下属性：

| 选择 | 属性 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contentSecurityPolicy` | `directives`、`useDefaults`（默认值 `true`）和 `reportOnly`（默认值 `false`）。参见 [Content Security Policy](/security/helmet#content-security-policy)。 |
| `crossOriginEmbedderPolicy` | `policy`：`'require-corp'`（为 `true` 发送）、`'credentialless'` 或 `'unsafe-none'`。 |
| `crossOriginOpenerPolicy` | `policy`：`'same-origin'`（默认值）、`'same-origin-allow-popups'`、`'noopener-allow-popups'` 或 `'unsafe-none'`。 |
| `crossOriginResourcePolicy` | `policy`：`'same-origin'`（默认值）、`'same-site'` 或 `'cross-origin'`。 |
| `referrerPolicy` | `policy`：推荐人策略，例如 `'strict-origin-when-cross-origin'`（默认 `'no-referrer'`），或策略列表，浏览器将其读取为回退链。 |
| `strictTransportSecurity` | `maxAge` 以秒为单位（默认值 `31536000`，即 365 天）、`includeSubDomains`（默认值 `true`）和 `preload`（默认值 `false`）。 |
| `xDnsPrefetchControl` | `allow`（默认值为 `false`）。`true` 发送 `on`。 |
| `xFrameOptions` | `action`：`'sameorigin'`（默认值）或 `'deny'`。 |
| `xPermittedCrossDomainPolicies` | `permittedPolicies`：`'none'`（默认值）、`'master-only'`、`'by-content-type'` 或 `'all'`。 |

剩下的选项，`originAgentCluster`,`xContentTypeOptions`,`xDownloadOptions`,`xPoweredBy` 和 `xXssProtection`，只接受布尔值。例如，`xPoweredBy: false` 保持 `X-Powered-By` 头球。

未知选项、未知属性和无效值 `useSecurityHeaders()` 叫做。例如，Helmet 的遗留选项名称会被拒绝，并提示当前名称 `Invalid security headers configuration: unknown option "hsts" (helmet's legacy name, use "strictTransportSecurity").`

路由仍然可以用 [`@Header()`](/controllers#response-headers) 装饰器，例如让其他站点加载图像：

```typescript
@Get('avatars/:id')
@Header('Cross-Origin-Resource-Policy', 'cross-origin')
findAvatar(@Param('id') id: string) {}
```

> info **Hint** 在 Fastify 上，`reply.header()` 也覆盖标题，但 `reply.removeHeader()` 不能删除由 `useSecurityHeaders()` 设置的标题。

#### 内容安全策略

默认 `Content-Security-Policy` 和头盔 8 的一样。它在一行上发送，分号后面没有空格：

```text
default-src 'self';
base-uri 'self';
font-src 'self' https: data:;
form-action 'self';
frame-ancestors 'self';
img-src 'self' data:;
object-src 'none';
script-src 'self';
script-src-attr 'none';
style-src 'self' https: 'unsafe-inline';
upgrade-insecure-requests
```

使用 `directives` 要更改它的属性：

```typescript
app.useSecurityHeaders({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", 'https://cdn.example.com'],
      connectSrc: ["'self'", 'wss://realtime.example.com'],
      upgradeInsecureRequests: null,
    },
  },
});
```

指令的工作原理如下：

- 名字写在 camelCase (`scriptSrc`）或在烤肉串的情况下（`'script-src'`).
- 您设置的指令**替换**同名的默认指令，因此包括 `'self'` 当你想保留它的时候。其他指令被添加到策略中。
- 值是字符串或字符串列表。`true` 或者空列表发送没有值的指令，并且 `null` 或者 `false` 删除指令，包括默认指令。
- 关键字、随机数和散列必须是单引号，如 `"'self'"` 所示。未引号的 `self` 被拒绝，因为浏览器会将其视为主机名。
- 值只能包含可打印的 ASCII 人物，两者都不是 `;` 也不 `,`，因此值不能添加指令或策略。

若要仅发送您自己的指令，请设置 `useDefaults` 二 `false`.然后，策略需要一个 `defaultSrc` 指令，除非您设置 `defaultSrc: null` 故意把它排除在外。

若要在不破坏页面的情况下尝试策略，请将 `reportOnly` 设置为 `true`。Nest 然后发送 `Content-Security-Policy-Report-Only`，浏览器报告违规行为，而不是阻止它们。添加 `report-to` 或 `report-uri` 指令以接收报告。

```typescript
app.useSecurityHeaders({
  contentSecurityPolicy: { reportOnly: true },
});
```

要完全省略标题，请将 `contentSecurityPolicy` 设置为 `false`。

#### SwaggerUI 和 GraphQL 伊德斯

该策略适用于每个响应，包括 HTML 页数 API 工具。

这个 [Swagger UI](/openapi/introduction) 服务对象 `@nestjs/swagger` 从应用程序加载其脚本和样式表，因此它可以使用默认策略。如果添加脚本 `customJs` 选项，将其主机添加到 `scriptSrc`.内联代码 `customJsStr` 选项要求 `'unsafe-inline'`.默认值 `upgrade-insecure-requests` 指令使浏览器加载脚本和样式表 HTTPS 所以如果你服务 Swagger UI 过平原 HTTP 在本地开发之外，例如在通过 IP 地址，他们无法加载。服务 Swagger UI 超过 HTTPS，或删除指令 `upgradeInsecureRequests: null`.

[GraphiQL](/graphql/quick-start#graphql-ide) 由阿波罗驱动程序提供服务，加载 React 和 GraphiQL 从 `unpkg.com` 并从内联脚本开始。默认情况下，GraphiQL 仅在以下情况下启用 `NODE_ENV` 不是 `production`，所以只放宽那里的政策：

```typescript
const isProduction = process.env.NODE_ENV === 'production';

app.useSecurityHeaders({
  contentSecurityPolicy: isProduction
    ? true
    : {
        directives: {
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        },
      },
});
```

[Apollo Sandbox](/graphql/quick-start#apollo-sandbox)，启用 `ApolloServerPluginLandingPageLocalDefault()`，从 Apollo 加载脚本、图像和清单 CDN，并将沙盒嵌入到框架中：

```typescript
app.useSecurityHeaders({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://embeddable-sandbox.cdn.apollographql.com',
      ],
      imgSrc: [
        "'self'",
        'data:',
        'https://apollo-server-landing-page.cdn.apollographql.com',
      ],
      manifestSrc: [
        "'self'",
        'https://apollo-server-landing-page.cdn.apollographql.com',
      ],
      frameSrc: ["'self'", 'https://sandbox.embed.apollographql.com'],
    },
  },
});
```

> warning **Warning** `'unsafe-inline'` 在 `script-src` 放弃了大部分的保护 CSP 针对应用程序服务的每个页面提供跨站点脚本。在生产中避免它。

#### 直接使用头盔

已经使用 Helmet 的应用程序可以继续使用它。由于选项名称 `useSecurityHeaders()` 与头盔相同，头盔配置通常会在切换时保留，但有两个例外：

- CSP 指令值必须是字符串、字符串列表、布尔值或 `null`。头盔接受生成每个请求随机数的函数不受支持。
- 头盔的传统选项名称被拒绝：

| 传统头盔名称 | 选择 |
| ------------------------------ | ------------------------------- |
| `dnsPrefetchControl` | `xDnsPrefetchControl` |
| `frameguard` | `xFrameOptions` |
| `hidePoweredBy` | `xPoweredBy` |
| `hsts` | `strictTransportSecurity` |
| `ieNoOpen` | `xDownloadOptions` |
| `noSniff` | `xContentTypeOptions` |
| `permittedCrossDomainPolicies` | `xPermittedCrossDomainPolicies` |
| `xssFilter` | `xXssProtection` |

要使用头盔本身，请为您的平台安装软件包，并在其他调用之前注册它 `app.use()` 或设置可能调用的函数 `app.use()`.底层平台按照注册的顺序应用中间件，因此在路由之后注册的头盔不适用于该路由。这个 CSP 上面显示的指令适用于头盔 `contentSecurityPolicy` 选项也是。

##### Express

```bash
$ npm i helmet
```

```typescript
// main.ts
import helmet from 'helmet';

app.use(helmet());
```

##### Fastify

对于 `FastifyAdapter`，请使用 [@fastify/helmet](https://github.com/fastify/fastify-helmet) 包。它是一个 [Fastify plugin](https://fastify.dev/docs/latest/Reference/Plugins/)，而不是一个中间件，所以用 `app.register()` 注册它：

```bash
$ npm i @fastify/helmet
```

```typescript
// main.ts
import helmet from '@fastify/helmet';

await app.register(helmet);
```
