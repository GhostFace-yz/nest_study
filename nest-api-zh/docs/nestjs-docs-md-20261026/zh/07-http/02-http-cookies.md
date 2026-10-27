# Cookies

Source: https://docs.nestjs.com/http/cookies

到**HTTPcookie**是用户浏览器存储的一小块数据。Cookies 被设计为网站记住状态信息的可靠机制。当用户再次访问网站时，浏览器会自动发送包含请求的 cookie。

从 NestJSv12.1，Nest 支持开箱即用的 cookies。相同 API 在每一个方面工作 HTTP 适配器（Express,Fastify，或您自己的适配器扩展 `AbstractHttpAdapter`），并且不需要额外的包：

- 这个 `@Cookies()` 和 `@SignedCookies()` 参数装饰器读取随请求发送的 cookies
- 这个 HTTP 适配器的 `setCookie()` 和 `clearCookie()` 方法写入 `Set-Cookie` 响应头
- 这个 `cookies` 应用程序选项启用签名 Cookie，支持旋转秘密

已经使用的应用程序 `cookie-parser` 或者 `@fastify/cookie` 保持工作不变。看 [Using cookie-parser or @fastify/cookie](#using-cookie-parser-or-fastifycookie) 了解这两种方法是如何相互作用的。

#### 读取 cookies

使用 `@Cookies()` 装饰器从传入的请求中提取 cookies。传递 cookie 名称以提取单个 cookie，或者省略它以将所有 cookie 作为由 cookie 名称键控的对象。

```typescript
import { Controller, Cookies, Get } from '@nestjs/common';

@Controller('preferences')
export class PreferencesController {
  @Get()
  findAll(@Cookies() cookies: Record<string, string>) {
    return cookies;
  }

  @Get('theme')
  findTheme(@Cookies('theme') theme?: string) {
    return theme ?? 'light';
  }
}
```

> info **Hint** 导入 `@Cookies()` 装饰师 `@nestjs/common` 包装。

未发送的命名 cookie 解析为 `undefined`。Nest 仅在参数请求 cookies 时解析 `Cookie` 头，并且每个请求最多一次。值是百分比解码的，当相同的名称出现不止一次时，第一次出现获胜（浏览器首先发送具有最特定路径的 cookie）。

和 `@Query()` 或者 `@Param()`，你可以通过 [管道](/pipes) 在 cookie 名称之后：

```typescript
@Get('cart')
findCart(@Cookies('cartSize', ParseIntPipe) cartSize: number) {
  return { cartSize };
}
```

有了这个，一个 `cartSize=abc`cookie 会导致 `400 Bad Request` 响应，缺少的 cookie 也是如此，除非您启用了管道的 `optional` 选择。

> info **Hint** 管道接收 cookie 参数，其中 `ArgumentMetadata` 的 `type` 属性设置为 `'custom'`。因此，除非启用其 `validateCustomDecorators` 选项，否则全局 `ValidationPipe` 会跳过它们。

> warning **Warning** `@Cookies()` 不验证签名。它的值直接来自客户端，可能已经被篡改，因此请阅读您需要信任的任何值 `@SignedCookies()` 相反（见 [Signing cookies](#signing-cookies)).

#### 设置和清除 Cookie

Cookie 是通过 HTTP 适配器，它为此目的公开了两种方法：

- `setCookie(response, name, value, options?)` 附加一个 `Set-Cookie` 响应头
- `clearCookie(response, name, options?)` 附加一个 `Set-Cookie` 立即使 cookie 过期的标头

两种方法都将本机响应对象作为第一个参数。在路由处理程序中，注入 `HttpAdapterHost`（见 [HTTP 适配器](/faq/http-adapter)）并使用 `@Res()` 装饰师及其 `passthrough` 选项已启用：

```typescript
import { Body, Controller, Delete, Put, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  @Put('theme')
  setTheme(
    @Body('theme') theme: string,
    @Res({ passthrough: true }) res: unknown,
  ) {
    this.adapterHost.httpAdapter.setCookie(res, 'theme', theme, {
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // one year, in seconds
    });
  }

  @Delete('theme')
  resetTheme(@Res({ passthrough: true }) res: unknown) {
    this.adapterHost.httpAdapter.clearCookie(res, 'theme');
  }
}
```

> warning **Warning** 若要将响应处理逻辑留给框架，请设置 `passthrough` 选项 `true`，如上所示。参见 [图书馆专用方法](/controllers#library-specific-approach) 有关详细信息，请参阅控制器章节。

控制器从来不需要知道响应对象的类型： `setCookie()` 接受底层平台提供的任何内容（ Express `Response`, a `FastifyReply`，等等），这使得代码与平台无关。每个调用都附加自己的 `Set-Cookie` 头，因此在处理请求时设置的所有 cookies 都会在每个平台上发送。因为这些方法只需要响应对象，所以也可以从防护或拦截器调用它们，使用 `context.switchToHttp().getResponse()`.

> info **Hint** `setCookie()` 和 `clearCookie()` 是可选成员 `HttpServer` 接口。`AbstractHttpAdapter` 实现一次，在其顶部 `appendHeader()` 方法，因此每个扩展它的适配器（包括 `ExpressAdapter` 和 `FastifyAdapter`）支持他们。

cookie 值必须是字符串。它总是用百分比编码 `encodeURIComponent()` （并再次由 `@Cookies()`），因此任何字符串都可以安全存储。自己转换其他类型，例如使用 `JSON.stringify()`.

这个 `options` 论点（`CookieSerializeOptions` 接口，从 `@nestjs/common`) 接受以下属性：

| 选择 | 描述 | 默认的 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `path` | `Path` 特征。 | `'/'` |
| `domain` | `Domain` 特征。必须是有效的主机名，可选地带有前导点。省略时，cookie 仅适用于主机。 | 未设置 |
| `maxAge` | `Max-Age` 属性，以**秒**为单位。必须是整数。 | 未设置 |
| `expires` | `Expires` 属性，作为 `Date`。当两者都设置时，浏览器优先考虑 `maxAge`。 | 未设置 |
| `httpOnly` | `HttpOnly` 属性。从客户端隐藏 cookieJavaScript。 | `false` |
| `secure` | `Secure` 属性。浏览器仅通过 HTTPS 发送 cookie。 | `false` |
| `sameSite` | `SameSite` 属性：`'strict'`、`'lax'` 或 `'none'`。`'none'` 需要 `secure: true`。 | 未设置 |
| `partitioned` | `Partitioned` 属性 (CHIPS)。需要 `secure: true`。 | `false` |
| `priority` | `Priority` 属性（非标准，由 Chromium 授予）：`'low'`、`'medium'` 或 `'high'`。 | 未设置 |
| `signed` | 使用第一个配置的秘密对值进行签名。参见 [Signing cookies](#signing-cookies)。 | `false` |

除了 `path` 之外，没有任何属性具有默认值，包括 `httpOnly`，它与 Express 和 `@fastify/cookie` 的行为相匹配。对于携带凭据或会话标识符的 Cookie，请显式设置 `httpOnly`、`secure` 和 `sameSite`。

> warning **Warning** `maxAge` 以**秒**表示，如 RFC 6265 和 `@fastify/cookie`. Express' `res.cookie()` 方法需要 `maxAge` 以**毫秒**为单位，因此一个不变的值可以使 cookie 的寿命延长 1000 倍。一天，通过 `60 * 60 * 24`.

`clearCookie()` 用过去的 `Max-Age=0` 和 `Expires` 日期写入一个空 cookie。浏览器仅在 `path` 和 `domain` 与设置的 cookie 匹配时删除 cookie，因此将相同的值传递给两种方法。由于 `path` 在两者中都默认为 `/`，因此 `clearCookie(res, 'theme')` 清除了带有 `setCookie(res, 'theme', value)` 的 cookie 集。`clearCookie()` 忽略了 `maxAge`、`expires` 和 `signed` 选项。

#### 签名 cookies

签名 cookie 携带 HMAC 其值旁边的签名，这可以让服务器检测客户端是否篡改了它。若要启用签名，请通过 `cookies` 选择权 `NestFactory.create()` 方法：

```typescript
// main.ts
const app = await NestFactory.create(AppModule, {
  cookies: {
    secret: process.env.COOKIE_SECRET,
  },
});
```

然后，使用 `signed` 选项并用 `@SignedCookies()` 装饰师：

```typescript
import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  SignedCookies,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly authService: AuthService,
  ) {}

  @Post('login')
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: unknown,
  ) {
    const user = await this.authService.signIn(signInDto);
    this.adapterHost.httpAdapter.setCookie(res, 'uid', String(user.id), {
      signed: true,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60, // one hour, in seconds
    });
  }

  @Get('profile')
  getProfile(@SignedCookies('uid') userId?: string) {
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.authService.findProfile(userId);
  }

  @Post('logout')
  signOut(@Res({ passthrough: true }) res: unknown) {
    this.adapterHost.httpAdapter.clearCookie(res, 'uid');
  }
}
```

> info **Hint** 导入 `@SignedCookies()` 装饰师 `@nestjs/common` 包装。

`@SignedCookies('uid')` 当签名验证时，解析为原始的未签名值。当 cookie 丢失、未签名、被篡改或使用未配置的秘密签名时，它会解析为 `undefined`.无名打电话， `@SignedCookies()` 返回一个对象，该对象仅包含其签名验证的 cookies。喜欢 `@Cookies()`，它接受 cookie 名称后的管道。

当没有配置秘密时，签名会大声失败：`setCookie()` 带有 `signed` 选项会抛出错误，解析 `@SignedCookies()` 参数也会抛出错误（除非 `cookie-parser` 提供签名 cookie，请参见 [以下](#using-cookie-parser-or-fastifycookie)），这会导致 `500 Internal Server Error` 响应，而不是每个签名 cookie 默认读取为 `undefined`。创建应用程序时抛出一个空秘密（空字符串、空数组或具有空条目的数组）。

> warning **Warning** 一个 `secret` 那就是 `undefined` 例如，因为没有设置环境变量，所以根本算不上秘密。应用程序启动，只有当请求设置或读取签名的 cookie 时，错误才会出现。在启动时验证您的配置，例如 [Configuration](/application/configuration#schema-validation) 篇章。

> warning **Warning** 签名保护的是 cookie 的完整性，而不是它的机密性：值以纯文本存储，客户端可以读取它。不要将敏感数据存储在签名的 cookie 中。还要注意，与 `cookie-signature` 包，cookie 名称不是签名数据的一部分，因此为一个 cookie 签名的值也会验证客户端何时以另一个名称发送它。

##### 旋转秘密

若要替换一个秘密而不使与其签名的 cookie 失效，请传递一个秘密数组。Nest 使用第一个秘密标记新的 cookie，并根据所有传入的 cookie 进行验证：

```typescript
// main.ts
const app = await NestFactory.create(AppModule, {
  cookies: {
    // Signs with the first secret, verifies with all of them.
    secret: ['current-secret', 'previous-secret'],
  },
});
```

若要旋转，请在数组的开头添加新的秘密，并在每个与其签名的 cookie 过期后删除前一个秘密。签名在恒定的时间内进行比较，并针对每个秘密进行比较，因此响应时间不会揭示哪个秘密匹配。

##### 签名格式

Nest 格式为 cookies 签名 `cookie-signature` 包，其中 `cookie-parser` 和 `express-session` 也可以使用：`s:` 前缀，后跟值、点和 HMAC-SHA256base64 中值的摘要，没有填充。结果：

- 使用相同密码签名的 CookieExpress（`signed` 选择 `res.cookie()`),`cookie-parser` 或者 `express-session` 移至内置后继续验证 API，和 `cookie-parser` 可以验证由以下人员签名的 cookiesNest
- 签名的值 `@fastify/cookie`，其中省略了 `s:` 前缀，也验证一下。相反的方向不起作用：`unsignCookie()` 方法 `@fastify/cookie` 无法验证由签名的 CookieNest，因为 `s:` 前缀

#### 无效的名称和属性

`setCookie()` 和 `clearCookie()` 拒绝无效输入而不是转义，因此 cookie 名称和属性都不能通过 `;`,CR 或者 LF 人物。他们扔了一个 `TypeError` 何时：

- 该名称无效 RFC7230 令牌（例如，它包含空格，`;`,`=` 或控制字符）
- `path` 包含 `;`，或可打印外部的字符 ASCII
- `domain` 不是有效的主机名（允许使用前导点）
- `maxAge` 不是整数，或 `expires` 不是有效的 `Date`
- `sameSite` 或者 `priority` 不是允许值之一
- `sameSite` 是 `'none'`，或者 `partitioned` 是 `true`，而 `secure` 不是 `true`。浏览器会悄悄删除此类 cookie，因此 Nest 会报告错误
- 值不是字符串

值的内容永远不会被拒绝：因为它是百分比编码的，所以值中的 `;`、CR 或 LF 变成 `%3B`、`%0D` 或 `%0A`。

这些错误不是 HTTP 异常，因此当从路由处理程序抛出一个时，客户端会收到一个 `500 Internal Server Error` 回应。如果 cookie 名称或属性来自用户输入，请在调用之前验证它 `setCookie()`.

> info **Hint** Nest 不执行 `__Host-` 和 `__Secure-`cookie 名称前缀的规则。如果您使用它们，请设置它们需要您自己的属性：`secure: true` 表示两者，加上 `path: '/'`，而 `__Host-` 没有 `domain` 表示。

#### 使用 cookie 解析器或@fastify/cookie

在内置支持可用之前，读取 cookies 需要 `cookie-parser` 中间件（Express）或 `@fastify/cookie` 插件（Fastify）。使用它们的应用程序继续工作，内置装饰器与它们协作：

- `@Cookies()` 回报 `req.cookies` 中间件或插件填充了它，并且只解析 `Cookie` 否则标题本身。因此，该包的行为会继续下去。例如，`cookie-parser` 将签名的 cookie 从 `req.cookies` 二 `req.signedCookies` 当它被赋予一个秘密，并转向 `j:`-前缀 JSON 将 cookies 变成对象。
- 当设置了 `cookies.secret` 应用程序选项时，`@SignedCookies()` 总是根据 Nest 秘密验证原始 `Cookie` 标头，并忽略 `req.signedCookies`。配置与您的中间件相同的秘密，以便它签名的 cookies 保持验证。
- 没有 `cookies.secret` 选项，`@SignedCookies()` 回到 `req.signedCookies` 对象由 `cookie-parser`（当它被赋予秘密时），并将其标记为无效的 cookies 视为丢失。`@fastify/cookie` 不填充 `req.signedCookies`,等等 Fastify,`@SignedCookies()` 需要 `cookies.secret` 选择。

Nest 从不分配 `req.cookies` 本身。如果您删除 `cookie-parser` 或者 `@fastify/cookie`，替换任何读取的代码 `request.cookies`（或呼叫 `reply.setCookie()`) 具有内置的装饰器和适配器方法。同样，如果您的应用程序定义了自己的 `@Cookies()` 装饰用 `createParamDecorator()`，你可以把它换成内置的。当您更换 `res.cookie()` 呼叫 `setCookie()`，记得转换 `maxAge` 从毫秒到秒。

##### Express（cookie 解析器）

首先，安装 [cookie-parser](https://github.com/expressjs/cookie-parser) 包（及其类型，用于 TypeScript 用户）：

```shell
$ npm i cookie-parser
$ npm i -D @types/cookie-parser
```

安装完成后，应用 `cookie-parser` 全局中间件（例如，在您的 `main.ts` 文件）：

```typescript
import cookieParser from 'cookie-parser';
// somewhere in your initialization file
app.use(cookieParser('my-secret'));
```

第一个参数是用于验证签名 cookie 的可选秘密（或秘密数组）。中间件解析 `Cookie` 头并将 cookies 公开为 `req.cookies` 并且，如果提供了秘密，则验证的签名 cookies 作为 `req.signedCookies` （验证失败的签名 cookie 具有 `false`).参见 [cookie 解析器存储库](https://github.com/expressjs/cookie-parser) 对于其他选项。

有了这个，您就可以使用 `@Cookies()` 和 `@SignedCookies()` 装饰器，或来自请求对象：

```typescript
@Get()
findAll(@Req() request: Request) {
  console.log(request.cookies); // or "request.cookies['cookieKey']"
  // or console.log(request.signedCookies);
}
```

若要将 cookie 附加到传出响应，请使用适配器的 `setCookie()` 方法或 `Response#cookie()` 方法：

```typescript
@Get()
findAll(@Res({ passthrough: true }) response: Response) {
  response.cookie('key', 'value');
}
```

> info **Hint** 导入 `@Req()` 和 `@Res()` 来自 `@nestjs/common` 包装，以及 `Request` 和 `Response` 从 `express` 包装。

##### Fastify(@fastify/cookie)

首先，安装所需的软件包：

```shell
$ npm i @fastify/cookie
```

安装完成后，注册 `@fastify/cookie` 插件：

```typescript
import fastifyCookie from '@fastify/cookie';

// somewhere in your initialization file
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.register(fastifyCookie, {
  secret: 'my-secret', // for cookies signature
});
```

有了这个，您就可以使用 `@Cookies()` 装饰器，或从请求对象：

```typescript
@Get()
findAll(@Req() request: FastifyRequest) {
  console.log(request.cookies); // or "request.cookies['cookieKey']"
}
```

要将 cookie 附加到传出响应，请使用适配器的 `setCookie()` 方法或 `FastifyReply#setCookie()` 方法（参见 [@fastify/cookie documentation on sending cookies](https://github.com/fastify/fastify-cookie#sending)）：

```typescript
@Get()
findAll(@Res({ passthrough: true }) response: FastifyReply) {
  response.setCookie('key', 'value');
}
```

> info **Hint** 导入 `@Req()` 和 `@Res()` 来自 `@nestjs/common` 包装，以及 `FastifyRequest` 和 `FastifyReply` 从 `fastify` 包装。
