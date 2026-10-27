# Authentication

Source: https://docs.nestjs.com/security/authentication

`@nestjs/authentication` 登录用户并告诉应用程序的其余部分他们是谁。它注册了一个全局守卫，为您提供了装饰器和一个可注入的上下文来读取当前用户，并发送了每个登录流程所需的部分：服务器端会话、密码散列、电子邮件验证和密码重置链接，TOTP 双因素身份验证、magic links、OpenID Connect、访问和刷新令牌以及 API 钥匙。所有这些都建立在 Node.js 内置的，它们通过您根据文档接口编写的存储将它们的状态保存在您的数据库中，并通过包的测试来检查它。您编写只有您的应用程序知道的内容：如何加载用户，哪些路由是公共的，以及登录流的端点。

在本教程中，您将向 API 猫粮和用品的网上商店。最后，它将：

- 使用密码、Google 或通过电子邮件发送的链接登录客户，并使用会话 cookie 保持 web 应用程序登录。
- 确认客户的电子邮件地址，并让他们重置忘记的密码。
- 给移动应用短期承载令牌和旋转刷新令牌。
- 使用 authenticator 应用程序提供双因素身份验证，并要求它更改帐户的电子邮件地址。
- 让客户看到他们在哪里登录，并在任何地方注销。
- 限制任何人猜测密码的速度。
- 在 PostgreSQL 中保留其会话、令牌和挂起的链接，通过 Drizzle （或 TypeORM).
- 让合作伙伴的系统和客户的脚本调用 API 使用客户创建和撤销的密钥。

这些是您要构建的端点，以及添加每个端点的部分：

| 端点 | 部分 |
| --- | --- |
| `POST /auth/sign-up`,`POST /auth/sign-in` | [Add sign-up and sign-in](/security/authentication#add-sign-up-and-sign-in) |
| `POST /auth/email/verify`,`POST /auth/email/verification` | [Verify email addresses](/security/authentication#verify-email-addresses) |
| `POST /auth/password/forgot`,`POST /auth/password/reset` | [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords) |
| `GET /me`,`GET /orders`,`POST /orders` | [Read the current user](/security/authentication#read-the-current-user) |
| `POST /auth/token`,`POST /auth/token/refresh` | [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app) |
| `POST /auth/mfa/enroll`,`POST /auth/mfa/replace`,`POST /auth/mfa/confirm`,`POST /auth/mfa/verify`,`PATCH /me/email` | [Add two-factor authentication](/security/authentication#add-two-factor-authentication) |
| `GET /auth/oidc/google/login`,`GET /auth/oidc/google/callback` | [Add "Sign in with Google"](/security/authentication#add-sign-in-with-google) |
| `POST /auth/magic-link`,`POST /auth/magic-link/consume` | [Add magic-link sign-in](/security/authentication#add-magic-link-sign-in) |
| `GET /auth/sessions`,`DELETE /auth/sessions/:id`,`POST /auth/sign-out`,`POST /auth/sign-out-everywhere`,`POST /auth/token/revoke` | [Let customers manage their sessions](/security/authentication#let-customers-manage-their-sessions) |
| `POST /auth/api-keys`,`GET /auth/api-keys`,`DELETE /auth/api-keys/:id` | [Issue API keys to partners](/security/authentication#issue-api-keys-to-partners) |

#### 安装

安装软件包：

```bash
$ npm i --save @nestjs/authentication
```

请求主体会根据您的应用程序已经使用的任何内容进行验证。每一 DTO 这个页面出现了两次，作为一个带有装饰器的类和一个 Zod 模式，所以选择你有的样式，跳过其他列表。

该教程将用户保存在内存中，位于 `UsersRepository` 类后面。用 Prisma、Drizzle、TypeORM 或应用程序使用的任何方法替换其方法体；代码的其余部分只看到普通的 `User` 对象。身份验证状态（会话、令牌、身份验证器、挂起链接）在 [Keep sessions and tokens in your database](/security/authentication#keep-sessions-and-tokens-in-your-database) 中移动到 PostgreSQL。

从电子邮件验证开始，应用程序从环境变量中读取设置和秘密。把它们放在一个 `.env` 开发期间的文件，并用它启动应用程序：

```bash
$ npm run start:dev -- --env-file .env
```

#### 注册认证模块

该包从不读取您的用户表。它通过 id 向您的代码询问用户，您的代码决定用户是什么。这是商店的用户。`emailVerified` 记录客户是否证明他们拥有该地址；电子邮件验证设置了它，下订单、谷歌登录和魔法链接都依赖于它：

```typescript
export type Role = 'customer' | 'staff' | 'admin';

export interface User {
  id: string;
  email: string;
  /** Whether the owner proved the address to us, e.g. by using a magic link. */
  emailVerified: boolean;
  roles: Role[];
}
```

存储库将密码散列保留给自己。它返回的一切都是一个 `User` 如果没有，用户可以从路由返回或写入日志，而不会泄露散列：

```typescript
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { User } from './user.js';

interface UserRow extends User {
  passwordHash: string | null;
}

/**
 * In-memory stand-in for your data layer (Prisma, Drizzle, TypeORM, ...).
 * Only `User` objects leave this class: password hashes stay inside.
 */
@Injectable()
export class UsersRepository {
  private readonly rows = new Map<string, UserRow>();

  async create(
    email: string,
    { passwordHash = null, emailVerified = false }: { passwordHash?: string | null; emailVerified?: boolean } = {},
  ): Promise<User> {
    const row: UserRow = { id: randomUUID(), email: normalize(email), emailVerified, roles: ['customer'], passwordHash };
    this.rows.set(row.id, row);
    return toUser(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = this.rows.get(id);
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = this.findRow(email);
    return row ? toUser(row) : null;
  }

  /** For password sign-in only. */
  async findCredentials(email: string): Promise<{ user: User; passwordHash: string | null } | null> {
    const row = this.findRow(email);
    return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) {
      row.passwordHash = passwordHash;
    }
  }

  async updateEmail(id: string, email: string): Promise<User | null> {
    const row = this.rows.get(id);
    if (!row) {
      return null;
    }
    row.email = normalize(email);
    row.emailVerified = false; // nobody has proven the new address yet
    return toUser(row);
  }

  private findRow(email: string) {
    const normalized = normalize(email);
    return [...this.rows.values()].find((row) => row.email === normalized);
  }
}

// As the package passes addresses to handlers: an accent typed as two code points matches the stored one.
const normalize = (email: string) => email.trim().normalize('NFC').toLowerCase();
const toUser = ({ id, email, emailVerified, roles }: UserRow): User => ({ id, email, emailVerified, roles: [...roles] });
```

```typescript
import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository.js';

@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
```

接下来是**凭证提供者**。提供者查看传入的请求并返回请求证明的用户，或者 `null` 当请求没有凭据时，它可以理解。`SessionCookieProvider` 读取会话 cookie，加载会话，并将其传递给您的 `validate()` 方法，它加载用户：

```typescript
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, SessionCookieProvider, type SessionRecord } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class SessionAuth extends SessionCookieProvider<User> {
  constructor(
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    // Adds this provider to the chain the guard runs for every request.
    registry.registerProvider(this);
  }

  // Called for every request with a live session cookie.
  // Returning null (the user was deleted) ends the session.
  validate(session: SessionRecord) {
    return this.usersRepository.findById(session.userId);
  }
}
```

提供者是普通的 `@Injectable()` 类，所以他们注入他们需要的任何东西，他们注册自己：构造函数手 `this` 二 `AuthenticationRegistry`，包的提供者列表，警卫会查阅该列表。基类接收 `SessionService` 通过属性注入，这就是为什么构造函数只列出 `UsersRepository` 和注册表。因为 `validate()` 在每个经过身份验证的请求上运行，删除的用户会立即失去访问权限，而不是在会话过期时。当用户与会话驻留在同一数据库中时，存储可以在同一查询中读取用户并将其交给 `validate()` 作为 `session.extra`，因此请求花费一次读取而不是两次；[Keep sessions and tokens in your database](/security/authentication#keep-sessions-and-tokens-in-your-database) 展示了如何。

在你自己的模块中提供。`AuthModule` 将保存本教程在 `src/auth` 下添加的所有内容：

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { SessionAuth } from './session-auth.provider.js';

@Module({
  imports: [UsersModule],
  providers: [SessionAuth],
})
export class AuthModule {}
```

现在在根模块中注册 `AuthenticationModule`，在 `AuthModule` 旁边：

```typescript
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AuthenticationModule.forRoot({
      session: {
        absoluteTtl: '14d', // signed out after 14 days, however active
        idleTtl: '3d', // or after 3 days without a request
      },
    }),
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
```

`forRoot()` 只接受值：生命周期、秘密、客户 id、电子邮件链接到的页面。没有类进入选项。凭据提供程序、稍后部分添加的处理程序以及 [数据库存储](/security/authentication#keep-sessions-and-tokens-in-your-database) 是您自己的模块的提供者，每个模块都从其构造函数注册自己，因此它与它注入的任何内容相邻，并且模块的选项保持简单的数据。生命周期是毫秒，或字符串，如 `'15m'` 和 `'14d'` 长达 100 年。`@nestjs/jwt` 而是计算秒数，因此低于一分钟的数字生命周期会在启动时记录警告：`3600` 这里是 3.6 秒，不是一小时。

在启动时，一旦每个提供程序的构造函数运行，注册表就会锁定并记录它将尝试的链：

```bash
LOG [AuthenticationModule] AuthenticationRegistry: providers SessionAuth
```

该模块还注册一个全局保护。从现在开始，**每条路由都需要一个登录用户**并回答 `401 Unauthorized` 对其他人。如果您的应用程序已经有必须保持打开的路由，如健康检查或产品目录，请将其标记为 `@Public()`，下一节将介绍。

> info **Hint** 会话存储在内存中，直到提供程序注册存储，并且 `NODE_ENV` 设置为 `production` 模块拒绝以这种方式启动。一个 [后节](/security/authentication#keep-sessions-and-tokens-in-your-database) 将它们移动到数据库中。

#### 添加注册和登录

首先验证请求主体。注册强制执行最小密码长度；登录不会，因此在旧规则下设置的密码仍然有效：

```typescript
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}

export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

与 Zod 模式相同的规则，其推断类型替换类。Nest 12.1 通过 `StandardSchemaValidationPipe` 验证来自 Zod、Valibot 或 ArkType 的任何 [Standard Schema](https://standardschema.dev/) 对象：

```typescript
import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
});
export type SignUpDto = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email(),
  password: z.string(),
});
export type SignInDto = z.infer<typeof signInSchema>;
```

`PasswordHasher` 使用 scrypt 散列密码（`crypto.scrypt`，在 libuv 线程池上，因此它不会阻塞事件循环），使用 OWASP 默认情况下推荐的参数。服务包装了控制器需要的两件事：

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async register(email: string, password: string): Promise<User> {
    if (await this.usersRepository.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    // The address is unverified: anyone can type any email into a sign-up form.
    return this.usersRepository.create(email, { passwordHash: await this.passwordHasher.hash(password) });
  }

  /** The user, or `null` when the email or the password is wrong. */
  async verify(email: string, password: string): Promise<User | null> {
    const found = await this.usersRepository.findCredentials(email);
    // With no account (or no password), verify() checks a dummy hash, so the
    // response time does not reveal which emails are registered.
    const valid = await this.passwordHasher.verify(password, found?.passwordHash);
    if (!valid || !found?.passwordHash) {
      return null;
    }
    // The cost settings changed since this hash was stored: upgrade it now,
    // while we have the plaintext.
    if (this.passwordHasher.needsRehash(found.passwordHash)) {
      await this.usersRepository.updatePasswordHash(found.user.id, await this.passwordHasher.hash(password));
    }
    return found.user;
  }
}
```

- `verify()` 在没有存储哈希的情况下，根据虚拟哈希检查密码。一个未知的电子邮件和一个错误的密码需要相同的时间并产生相同的答案，因此都不会透露哪些电子邮件有帐户。
- 在 libuv 线程池上，使用 `node:crypto` 中的 scrypt 散列密码，参数为 OWASP 推荐（N=2^17，r=8，p=1：每个散列大约 128 MiB 内存）。这是一个内存硬函数，而 bcrypt 不是，它不需要本机依赖关系。每个散列记录了它所使用的参数（`$scrypt$ln=17,r=8,p=1$...`）。当您使用 `password` 选项提高成本时，`needsRehash()` 会告诉您要升级哪些存储的哈希值，您唯一可以这样做的时刻是在用户登录时。在此之前，`verify()` 会将旧的、更便宜的散列检查添加到新参数的工作中，因此它仍然需要像未知电子邮件一样长的时间。降低成本不能这样隐藏：用更昂贵的参数制作的散列需要更长的时间来检查，直到它被升级。成本上限为 1 GiB 内存，是每个散列默认工作量的 16 倍，因此 `r` 在 8 时，`logN` 在 20 时停止。超出它的参数在启动时失败，用它们制作的存储哈希永远不会验证。
- `register()` 使地址未经验证。在注册表格中键入电子邮件并不能证明您拥有它。

控制器将经过验证的密码转换为会话：

```typescript
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Public, SignInService } from '@nestjs/authentication';
import { SignInDto, SignUpDto } from './auth.dto.js';
import { CredentialsService } from './credentials.service.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly signInService: SignInService,
  ) {}

  @Post('sign-up')
  async signUp(@Body() body: SignUpDto) {
    const user = await this.credentialsService.register(body.email, body.password);
    await this.signInService.signIn(user.id, { method: 'password' });
    return user;
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(@Body() body: SignInDto) {
    const user = await this.credentialsService.verify(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { session } = await this.signInService.signIn(user.id, { method: 'password' });
    return { mfaRequired: session.mfa === 'pending' };
  }
}
```

类上的 `@Public()` 跳过两条路由的身份验证。`SignInService.signIn()` 是第一个因素变成会话的地方：这一步在密码之后调用它，Google 和 magic-link 步骤也会经过它。它创建会话并在响应本身上设置会话 cookie，在 Express 和 Fastify 上都是如此，因此控制器既不需要 `@Req()` 也不需要 `@Res()`：

- 饼干， `__Host-sid`，保存一个随机 256 位令牌，并且是 `HttpOnly`, `Secure` 和 `SameSite=Lax`.这 `__Host-` 前缀告诉浏览器只从这个主机接受它，所以另一个子域上的页面不能植入自己的会话 cookie。只有令牌的 SHA-256 哈希被存储，因此泄露的会话存储不能作为 cookies 重播。
- 它会删除此浏览器之前拥有的会话，从而防止会话固定。
- 它以 403 拒绝了另一个网站页面上发布的登录。否则，该页面可能会将客户的浏览器登录到攻击者选择的帐户（登录 CSRF）。
- `method` 记录在审计跟踪中，[管理会话](/security/authentication#let-customers-manage-their-sessions) 提及。
- `mfaRequired` 停留 `false`，直到您 [添加第二个因素](/security/authentication#add-two-factor-authentication)。

对于 Zod 模式，主体参数声明它们的模式而不是类：

```typescript
import { signInSchema, signUpSchema, type SignInDto, type SignUpDto } from './auth.schemas.js';
// ...
@Post('sign-up')
async signUp(@Body({ schema: signUpSchema }) body: SignUpDto) {
  // ...
}

@Post('sign-in')
@HttpCode(200)
async signIn(@Body({ schema: signInSchema }) body: SignInDto) {
  // ...
}
```

在 `AuthModule` 中注册控制器：

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { SessionAuth } from './session-auth.provider.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [SessionAuth, CredentialsService],
})
export class AuthModule {}
```

> info **Hint** DTO 仅由验证管道强制执行：bind `ValidationPipe` 在全球范围内，作为一个 `APP_PIPE` 提供者 `AppModule` 或与 `useGlobalPipes()` 在 `main.ts`.使用 Zod 模式，绑定 `StandardSchemaValidationPipe` 相反，同样的方法：应用程序使用其中一个或另一个。这个 [验证](/application/validation) 页面有每个选项。

> info **Hint** Chrome、Firefox 和 curl treat `http://localhost` 作为安全来源并接受 `Secure` 和 `__Host-` 它的饼干，所以你不需要 HTTPS 开发过程中。在另一台主机上 HTTP，如 a LAN 地址，设置 `cookie.secure` 二 `false` 在 `session` 那里的选项然后将 cookie 命名为 `sid`.

会话 cookie 还受到保护，防止跨站点请求伪造。除了 `SameSite=Lax`，模块忽略 cookie `POST`, `PUT`, `PATCH` 和 `DELETE` 请求和 WebSocket 握手来自另一个来源，由 `Sec-Fetch-Site`, `Origin` 和 `Host` 头，所以这些请求是匿名的。既不发送 `Sec-Fetch-Site` 也不 `Origin`，如 curl 和您的移动应用程序，不受影响。如果您的 web 应用程序运行在除 API，列在 `session.trustedOrigins`.

在 Nest12.1 或更高版本上，也可以在 `main.ts` 中调用 `app.enableCsrfProtection()`。它对每条路由做出相同的决定，使用 403，包括还没有会话要保护的公共路由。传递与 `session` 选项相同的 `trustedOrigins`。

#### 验证电子邮件地址

任何人都可以在注册表格中输入任何地址。在顾客通过打开发送给它的链接证明地址是他们的之前，商店会将其视为未经验证的：它不会接受收据会发送到那里的订单，也不会让谷歌帐户或魔法链接进入该帐户，如后面的部分所示。包创建并检查链接。您的应用程序使用您选择的邮件库发送它们；商店使用 `@nestjs/mail`：

```bash
$ npm i --save @nestjs/mail
```

从这一步开始，应用程序从环境变量中读取设置。将应用程序的公共 URL 添加到 `.env`。电子邮件中的链接指向 web 应用程序的页面：

```bash
APP_URL=http://localhost:3000
```

> info **Hint** 教程中写道 `process.env` 直接，长话短说。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 使用验证模式，因此缺少或格式错误的变量会在启动时而不是在第一个请求时停止应用程序，并从 `ConfigService`.

登记 `MailModule` 在 `AppModule` 两个模块现在都读取环境变量，因此 `AuthenticationModule` 切换到 `forRootAsync()`：它的工厂是自举运行的，而参数 `forRoot()` 导入文件时进行计算，当每个值都是文字值时，这很好。和 `@nestjs/config`,添加 `inject: [ConfigService]` 而是从注入的服务中读取值。在发展中， `LogMailTransport` 将每封电子邮件打印到应用程序的日志中，以便您可以点击链接；设置 `SMTP_URL` 发送真正的电子邮件。 `FileTemplateEngine` 从 HTML 文件在 `src/mail/templates` 每封电子邮件一个：

```typescript
import { FileTemplateEngine, LogMailTransport, MailModule, SmtpTransport } from '@nestjs/mail';
// ...
import { join } from 'node:path';
// ...

@Module({
  imports: [
    MailModule.forRootAsync({
      useFactory: () => ({
        // Your provider in production. In development, each email (links
        // included) is printed to the log.
        transport: process.env.SMTP_URL ? new SmtpTransport({ url: process.env.SMTP_URL }) : new LogMailTransport(),
        // The emails' HTML: the templates in mail/templates, next to this file
        templates: new FileTemplateEngine({ dir: join(import.meta.dirname, 'mail/templates') }),
        from: 'Accounts <accounts@example.com>',
      }),
    }),
    AuthenticationModule.forRootAsync({
      // ...
```

这个 TypeScript 编译器不复制 HTML 文件到 `dist`：将模板添加到中的资产中 `nest-cli.json`，作为 [Mail](/application/mail#register-the-mail-module) 教程显示；它还涵盖了模板语法。

验证电子邮件是一个模板。链接位于双括号之间，双括号会跳过它：

```html
<p>Confirm the email address of your store account:</p>
<p><a href="{{ url }}">Confirm my address</a></p>
<p>If you didn't create an account, ignore this email.</p>
```

邮件类从模板呈现电子邮件，链接作为其上下文，`EmailVerificationHandler` 将软件包连接到它：`send()` 传递链接，并且 `markVerified()` 在用户表中记录经过验证的地址。与凭据提供程序一样，处理程序以其服务的功能名称注册自己：

```typescript
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, EmailVerificationHandler, type EmailVerificationLink } from '@nestjs/authentication';
import { Mailer, type Mailable } from '@nestjs/mail';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class VerifyEmailMail implements Mailable<EmailVerificationLink> {
  render({ url }: EmailVerificationLink) {
    return {
      subject: 'Confirm your email address',
      template: 'verify-email',
      context: { url },
    };
  }
}

@Injectable()
export class EmailVerificationMailer extends EmailVerificationHandler {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly mailer: Mailer,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('emailVerification', this);
  }

  async send(link: EmailVerificationLink) {
    await this.mailer.send(VerifyEmailMail, { to: link.email, data: link });
  }

  // Runs when the link is used. It verifies nothing if the address changed since.
  markVerified(userId: string, email: string) {
    return this.usersRepository.markEmailVerified(userId, email);
  }
}
```

`markVerified()` 仅标记链接发送到的地址。如果客户从那以后更改了他们的地址，链接不会验证任何东西。存储库仅在地址匹配时才更新行，这在 SQL 中是一次条件更新（`UPDATE users SET email_verified = true WHERE id = $1 AND email = $2`）：

```typescript
/** Only if `email` is still the user's address: a link sent to an old one verifies nothing. */
async markEmailVerified(id: string, email: string): Promise<boolean> {
  const row = this.rows.get(id);
  if (!row || row.email !== normalize(email)) {
    return false;
  }
  row.emailVerified = true;
  return true;
}
```

一个特性有两半：它的处理程序和它的选项。在 `AuthModule`，并配置链接打开的页面。没有另一半的一半在启动时失败，并显示一条消息命名缺失的一半：

```typescript
providers: [
  SessionAuth,
  CredentialsService,
  EmailVerificationMailer,
],
```

```typescript
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    session: {
      // ...
    },
    emailVerification: { url: `${process.env.APP_URL}/verify-email` },
  }),
}),
```

客户注册时发送链接：

```typescript
import { EmailVerificationService, Public, SignInService } from '@nestjs/authentication';
// ...
constructor(
  private readonly credentialsService: CredentialsService,
  private readonly signInService: SignInService,
  private readonly emailVerificationService: EmailVerificationService,
) {}

@Post('sign-up')
async signUp(@Body() body: SignUpDto) {
  const user = await this.credentialsService.register(body.email, body.password);
  await this.signInService.signIn(user.id, { method: 'password' });
  // The link in this email proves the customer owns the address.
  await this.emailVerificationService.send(user);
  return user;
}
```

然后添加端点。该链接将打开 web 应用程序的一个页面，该页面将令牌从其 URL 回到 API：电子邮件扫描器和链接预览跟踪电子邮件中的链接 GET 请求，并在客户点击之前用完。

```typescript
import { BadRequestException, Body, ConflictException, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, EmailVerificationService, Public } from '@nestjs/authentication';
import type { User } from '../users/user.js';

@Controller('auth/email')
export class EmailVerificationController {
  constructor(private readonly emailVerificationService: EmailVerificationService) {}

  // Called by the page the link opens, which POSTs the token from its URL.
  @Public()
  @Post('verify')
  @HttpCode(200)
  async verify(@Body('token') token: string) {
    const verified = await this.emailVerificationService.verify(token);
    if (!verified) {
      throw new BadRequestException('Invalid or expired link');
    }
    return { email: verified.email, emailVerified: true };
  }

  // "Send the link again", to the signed-in customer's current address.
  @Post('verification')
  @HttpCode(202)
  async resend(@CurrentUser() user: User) {
    if (user.emailVerified) {
      throw new ConflictException('Email address already verified');
    }
    await this.emailVerificationService.send(user);
  }
}
```

- `EmailVerificationService.send()` 存储 SHA-256 随机 256 位令牌的散列，包含客户的 id 和地址，并将链接传递给处理程序。令牌本身只存在于电子邮件中。
- 链接工作一次，持续 24 小时（`emailVerification.ttl`），并且仅限于它被发送到的地址。`verify()` 回报 `null` 对于未知的、使用过的或过期的令牌，以及对于从那时起已经改变的地址，并且路由响应 400。
- `resend` 不是 `@Public()`：只有登录的客户才能请求新链接，并且只能请求到他们自己的地址，因此路由不会透露任何关于其他帐户的信息。

注册控制器：

```typescript
controllers: [
  AuthController,
  EmailVerificationController,
],
```

包还可能需要路由上的验证地址：`@Authenticate()` 和 `verifiedEmail: true` 回答未通过 403 验证地址的已登录客户。[Read the current user](/security/authentication#read-the-current-user) 用它来下订单。

> info **Hint** `LogMailTransport` 在 `debug` 级别记录每封电子邮件的文本，包括链接，因此切勿在发送日志的地方使用它。在生产中，设置 `SMTP_URL`，或传递另一个传输，如 `ResendTransport`。[Mail](/application/mail) 教程涵盖了这些选项。

#### 重置忘记的密码

忘记密码的客户要求提供链接，并在打开的页面上选择新密码。发送链接的电子邮件是另一个模板：

```html
<p>Someone asked to reset the password of your store account.</p>
<p><a href="{{ url }}">Choose a new password</a></p>
<p>The link works once, for an hour. If it wasn't you, ignore this email: your password stays as it is.</p>
```

包拥有令牌；一个 `PasswordResetHandler` 查找帐户、发送电子邮件并存储新密码的哈希值：

```typescript
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, PasswordResetHandler, type PasswordResetLink } from '@nestjs/authentication';
import { Mailer, type Mailable } from '@nestjs/mail';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class PasswordResetMail implements Mailable<PasswordResetLink> {
  render({ url }: PasswordResetLink) {
    return {
      subject: 'Reset your password',
      template: 'password-reset',
      context: { url },
    };
  }
}

@Injectable()
export class PasswordResetMailer extends PasswordResetHandler {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly mailer: Mailer,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('passwordReset', this);
  }

  // The link goes to the address the account has stored, and works only while
  // the account keeps that address and this hash: any change invalidates it.
  async findUser(email: string) {
    const found = await this.usersRepository.findCredentials(email);
    return found && { id: found.user.id, email: found.user.email, passwordHash: found.passwordHash };
  }

  async send(link: PasswordResetLink) {
    await this.mailer.send(PasswordResetMail, { to: link.email, data: link });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.usersRepository.updatePasswordHash(userId, passwordHash);
  }
}
```

`findUser()` 返回帐户的 id、其存储的地址和其存储的密码散列，`null` 对于没有密码的帐户。链接指向存储的地址，而不是输入到表单中的地址：一个忽略重音符号或点的查找，就像 MySQL 的默认排序一样，否则会将一个客户的链接邮寄给任何输入类似地址的人。链接只有在地址和散列不变的情况下才能工作，因此，通过任何途径更改密码都会使之前发送的链接无效。遗漏地址或散列是一个错误，包会记录该错误，而不是发送链接。

在电子邮件验证旁边启用密码重置，处理程序在 `AuthModule` 以及选项中的页面：

```typescript
providers: [
  SessionAuth,
  CredentialsService,
  EmailVerificationMailer,
  PasswordResetMailer,
],
```

```typescript
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    // ...
    emailVerification: { url: `${process.env.APP_URL}/verify-email` },
    passwordReset: { url: `${process.env.APP_URL}/reset-password` },
  }),
}),
```

一个端点获取地址，另一个端点获取令牌和新密码，这遵循注册规则：

```typescript
// ...

export class EmailDto {
  @IsEmail()
  email: string;
}

/** The token from the reset link, and the new password, under the sign-up rules. */
export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
```

```typescript
export const emailSchema = z.object({
  email: z.email(),
});
export type EmailDto = z.infer<typeof emailSchema>;

/** The token from the reset link, and the new password, under the sign-up rules. */
export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(12).max(128),
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
```

```typescript
import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { PasswordResetService, Public } from '@nestjs/authentication';
import { EmailDto, ResetPasswordDto } from './auth.dto.js';

@Public()
@Controller('auth/password')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  // The same answer, as fast, whether or not the address has an account:
  // request() returns before it looks the address up.
  @Post('forgot')
  @HttpCode(202)
  forgot(@Body() body: EmailDto) {
    this.passwordResetService.request(body.email);
  }

  // Called by the page the link opens, with the token from its URL and the new password.
  @Post('reset')
  @HttpCode(200)
  async reset(@Body() body: ResetPasswordDto) {
    const result = await this.passwordResetService.reset(body.token, body.password, { signIn: true });
    if (!result) {
      throw new BadRequestException('Invalid or expired link');
    }
    return { mfaRequired: result.signedIn?.session.mfa === 'pending' };
  }
}
```

- `request()` 在它查找地址之前返回。查找帐户、存储令牌和发送电子邮件发生在响应之后，因此对无人注册的地址的请求会同时获得与客户相同的 202：路由不能告诉任何人谁有帐户。这就是为什么 `forgot` 没有 `await` 任何事情。响应后的故障（如邮件服务器关闭）将被记录。
- 链接工作一次，持续一小时（`passwordReset.ttl`)，并且仅当帐户仍然拥有发送链接时的地址和密码时。
- `reset()` 存储新密码的哈希值，使客户的其他重置链接失效，并在应用程序 [发行它们](/security/authentication#issue-tokens-to-the-mobile-app) 所以任何知道旧密码的人都会被注销。[API 钥匙](/security/authentication#issue-api-keys-to-partners) 住在你自己的表格中并保持有效：要切断它们，请在 `password-reset` 事件。密码 `PasswordHasher` 拒绝，为空或超过 4 KiB，获取 `null` 无需花费链接，因此客户可以再次尝试。和 `signIn: true` 然后，它通过以下方式在此浏览器上登录客户 `SignInService`，所以一个客户 [双因素认证](/security/authentication#add-two-factor-authentication) 仍然需要输入一个代码。
- 该链接也证明了地址，因此 `reset()` 通过您的 `markVerified()` 标记为已验证。这还可以挽救其他人使用客户地址注册的帐户：重置会替换陌生人的密码并注销他们。

使用 Zod 模式：

```typescript
import { emailSchema, resetPasswordSchema, type EmailDto, type ResetPasswordDto } from './auth.schemas.js';
// ...
@Post('forgot')
@HttpCode(202)
forgot(@Body({ schema: emailSchema }) body: EmailDto) {
  this.passwordResetService.request(body.email);
}

@Post('reset')
@HttpCode(200)
async reset(@Body({ schema: resetPasswordSchema }) body: ResetPasswordDto) {
  // ...
}
```

注册控制器：

```typescript
controllers: [
  AuthController,
  EmailVerificationController,
  PasswordResetController,
],
```

#### 读取当前用户

`@CurrentUser()` 向用户注入 `validate()` 已加载：

```typescript
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { User } from './user.js';

@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: User) {
    return user;
  }
}
```

`@CurrentUser('id')` 注入单个属性。`@CurrentSession()` 注入提供程序认为会话的内容：这里是存储的会话记录。

> info **Hint** 可选：告诉包一次您的用户类型，它的类型会跟随。增加 `AuthenticationTypes` 的接口 `@nestjs/authentication` 在一个 `declare module` 块，用 `user: User` （教程保留了它 `src/auth/auth-types.ts`).从那时起 `@CurrentUser('key')` 只接受 `User` 并键入以返回该属性，并且 `AuthenticationContext.user` 和 `.session` 也是打字的。一个 `sessionExtra` 关键类型 `SessionRecord.extra`，会话存储与每个会话一起读取的内容（导出为 `SessionExtra`, `unknown` 没有钥匙）。它不键入参数本身：参数装饰器对注释没有发言权，因此 `user: User` 停留在参数上。整个应用程序只有一个用户类型，因此具有两种主体的应用程序会保留注释。相同的接口需要 `refreshTokens: false` 对于应用程序 [关闭刷新令牌](/security/authentication#issue-tokens-to-the-mobile-app).

```typescript
@Module({
  controllers: [MeController],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
```

控制器不是唯一需要用户的代码。订单属于下订单的客户，并且 `OrdersService` 从 `AuthenticationContext`，因此控制器不会传递用户：

```typescript
export interface OrderItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  /** In cents. */
  total: number;
  status: 'pending' | 'paid' | 'shipped' | 'refunded';
}
```

```typescript
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthenticationContext } from '@nestjs/authentication';
import type { Order, OrderItem } from './order.js';

// Stand-in for the products table: product id → price in cents.
const PRICES = new Map([
  ['salmon-kibble-2kg', 2499],
  ['clumping-litter-10l', 1599],
]);

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = [];

  constructor(private readonly authenticationContext: AuthenticationContext) {}

  findMine(): Order[] {
    const { id } = this.authenticationContext.requireUser();
    return this.orders.filter((order) => order.userId === id);
  }

  place(items: OrderItem[]): Order {
    const { id: userId } = this.authenticationContext.requireUser();
    const total = items.reduce((sum, item) => sum + this.price(item.productId) * item.quantity, 0);
    const order: Order = { id: randomUUID(), userId, items, total, status: 'pending' };
    this.orders.push(order);
    return order;
  }

  private price(productId: string): number {
    const price = PRICES.get(productId);
    if (price === undefined) {
      throw new BadRequestException(`Unknown product ${productId}`);
    }
    return price;
  }
}
```

```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Authenticate } from '@nestjs/authentication';
import type { OrderItem } from './order.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findMine() {
    return this.ordersService.findMine();
  }

  // Receipts and shipping updates go to the customer's email address,
  // so it must be one they proved.
  @Authenticate({ verifiedEmail: true })
  @Post()
  place(@Body('items') items: OrderItem[]) {
    return this.ordersService.place(items);
  }
}
```

`@Authenticate()` 和 `verifiedEmail: true` 只允许拥有经过验证地址的客户下订单。任何其他登录的人都会得到一个 403 谁 `error` 是 `email_unverified`，它告诉 web 应用程序要求客户打开 [验证链接](/security/authentication#verify-email-addresses)，或者再次发送。这是 403 而不是 401：再次登录没有帮助。`GET /orders` 没有这样的要求。默认情况下，守卫读取 `emailVerified` 来自用户 `validate()` 丰富的；你的 `EmailVerificationHandler` 可以覆盖 `isVerified(user)` 如果您的用户类型不同地存储它。

```typescript
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
```

将 `OrdersModule` 添加到 `AppModule` 的 `imports` 中：

```typescript
UsersModule,
AuthModule,
OrdersModule,
```

`AuthenticationContext` 是单身。它从 `AsyncLocalStorage` 该模块围绕每个处理程序打开，因此无论处理程序调用或等待多少个请求同时运行，它都是正确的。`requireUser()` 返回用户，或抛出一个 `AuthenticationError`，该模块在任何传输上用 401 回答。在请求之外，在队列使用者或 cron 作业中，`AuthenticationContext` 是空的，它的 `run()` 方法作为给定用户运行函数。它在处理程序外部运行的中间件、防护和异常过滤器中也是空的。

#### 向移动应用程序发放令牌

商店的移动应用程序使用承载令牌而不是 cookies 进行身份验证。它发送一个短暂的 JWT 访问令牌 `Authorization` 头，并用长寿命刷新令牌更新它。

将签名秘密添加到 `.env`。它必须至少为 32 字节。没有它，应用程序将拒绝启动，命名选项：`accessToken.key` 是必需的。

```bash
# Generate with: openssl rand -base64 32
JWT_SECRET=
```

应用程序同时发布和验证访问令牌，因此描述一次它们，使用 `accessToken` 选项。密钥签署它们，发行者、受众和生命周期进入每个令牌，并在每个请求时进行检查：

```typescript
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    session: {
      // ...
    },
    accessToken: {
      key: process.env.JWT_SECRET!,
      issuer: 'https://api.example.com',
      audience: 'mobile-app',
      ttl: '15m',
    },
  }),
}),
```

以秘密为密钥，令牌用 HS256 签名。第二凭证提供者验证它们。`JwtBearerProvider` 读取 `Authorization` 标头，根据 `accessToken` 密钥以及 `exp`、`iss` 和 `aud` 检查签名，并将已验证的声明传递给您的 `validate()`：

```typescript
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class JwtAuth extends JwtBearerProvider<User> {
  constructor(
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    // The key, issuer and audience come from the `accessToken` options.
    super({ realm: 'store' });
    // Second in the chain, after SessionAuth (order 0).
    registry.registerProvider(this, { order: 1 });
  }

  // Called after the signature and claims checked out.
  // Returning null (the user was deleted) rejects the token.
  validate({ sub }: JwtClaims) {
    return sub ? this.usersRepository.findById(sub) : null;
  }
}
```

> info **Hint** HS256 共享的秘密套装 API 它既发行又验证其令牌。如果其他服务也验证了它们，则使 `accessToken` 钥匙 ES256 私钥： `JwtAuth` 然后向公众核实，他们也可以。要接受来自其他发行者的令牌，请传递 `super()` 它的 `jwks` URL，必须是 https（仅在本地主机上使用纯 http），或其公共 `key`，与 `issuer` 和 `audience`：两者都是必需的，因为身份提供者使用相同的密钥对每个客户端的令牌进行签名。对于没有受众的令牌，传递 `audience: false` 并检查将您的客户命名为 `validate()`.添加 `clockTolerance: '30s'` 另一个发行人的时钟。钥匙是 PEM 文本或 `KeyObject`;进口 a JWK 和 `createPublicKey()` 来自 `node:crypto`，通过 JWK 作为 `key` 和 `'jwk'` 作为 `format`.空的 `key` 或者 `jwks`，例如未设置的环境变量，在启动时失败，而不是返回到 `accessToken` 选项。只验证令牌的服务可以离开 `accessToken` 全力以赴 `super()` 它验证的内容：共享 `key`，或 `jwks` 和 `issuer` 和 `audience`.

在 `AuthModule` 中提供：

```typescript
providers: [
  SessionAuth,
  JwtAuth,
  CredentialsService,
],
```

对于每个请求，守卫都会询问提升中的提供者 `order`，第一个返回用户的用户获胜。 `SessionAuth` 以默认顺序注册， `0`，和 `JwtAuth` 要求 `1`，因此带有会话 cookie 的请求由 `SessionAuth`，以及一个没有 cookie 的带有承载令牌的请求 `null` 来自 `SessionAuth` 并由 `JwtAuth`.该顺序是在登记时发出的，而不是留给登记时的顺序 Nest 构建提供程序：该提供程序遵循模块图，并在提供程序移动到另一个模块或添加导入时发生变化。两个请求相同订单的提供者在启动时失败，两者都命名。不包含任何内容的请求将获得 401 `missing_credentials` 作为它的 `errorCode`;它的 `WWW-Authenticate` 标题列出了提供者接受的内容： `Bearer realm="store"`.验证失败的令牌会得到一个 401，说明为什么，如 RFC 6750 描述了例如 `error="invalid_token", error_description="token expired"`.这告诉移动应用程序刷新。

现在发出令牌的端点：

```typescript
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Public, TokenService } from '@nestjs/authentication';
import { SignInDto } from './auth.dto.js';
import { CredentialsService } from './credentials.service.js';

@Public()
@Controller('auth/token')
export class TokensController {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly tokenService: TokenService,
  ) {}

  @Post()
  @HttpCode(200)
  async issue(@Body() body: SignInDto) {
    const user = await this.credentialsService.verify(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.tokenService.issue(user.id, {
      method: 'password',
      // `amr` goes into this access token and into every refreshed one.
      claims: { amr: ['pwd'] },
    });
  }

  // An unknown, expired or reused refresh token gets a 401.
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.tokenService.refresh(refreshToken);
  }
}
```

`TokenService.issue()` 使用 `accessToken` 选项，启动刷新令牌，并返回两者，使用 `expiresIn` 访问令牌的生命周期（以秒为单位）。刷新令牌是不透明的，并存储为散列。每个工作一次：`refresh()` 使用它并返回其后继，并使用新的访问令牌。一个登录的继承者组成一个家族。如果一个用过的令牌回来了，有两方持有它，一个小偷和应用程序，所以服务撤销了整个家庭，双方都必须再次登录。未知、过期或重复使用的刷新令牌抛出 `RefreshTokenError`, 安 `AuthenticationError` 模块用 401 回答，所以 `refresh` 不需要自己的错误处理。

这个 `amr` 声明用户如何登录的记录，以及 [双因素认证](/security/authentication#add-two-factor-authentication) 依靠它。`issue()` 存储 `claims` 使用刷新令牌族，以及 `refresh()` 将它们放入它铸造的每个访问令牌中，因此刷新的令牌描述相同的登录。将角色等可能发生变化的事实排除在外 `claims` 只要这个家庭还活着，它们就会留在代币里。`validate()` 而是在每个请求上加载当前用户。

签署短期访问令牌并让其客户端再次登录的服务可以关闭刷新令牌。当 `refreshToken` 设置为 `false` 时，`issue()` 只返回 `accessToken` 和 `expiresIn`，不存储任何内容，因此应用程序不需要 `RefreshTokenStore`。令牌端点的响应没有刷新令牌：当访问令牌过期时，客户端再次登录。`refresh()` 和 `revoke()` 抛出，说刷新令牌被禁用，`revokeAll()` 什么也不做。第二个因素和 `amr` 权利要求像以前一样工作。在 `AuthenticationTypes` 上也声明 `refreshTokens: false`，因此键入 `issue()` 以返回 `AccessTokenResult` 而不是 `TokenPair`：

```typescript
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    accessToken: {
      key: process.env.JWT_SECRET!,
      // ...
    },
    refreshToken: false,
  }),
}),
```

```typescript
declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    // ...
    refreshTokens: false;
  }
}
```

选项是运行什么；声明只告诉编译器。在没有声明的情况下设置选项的应用程序在运行时不会获得刷新令牌，该令牌被键入为字符串，并且 `refresh()` 扔在上面。`refreshToken` 设置为 `false` 没有 `accessToken` 不更改任何内容，并在启动时记录警告。

注册控制器：

```typescript
controllers: [
  AuthController,
  EmailVerificationController,
  PasswordResetController,
  TokensController,
],
```

#### 添加双因素身份验证

客户可以使用身份验证器应用程序（基于时间的一次性密码，或 TOTP）来保护他们的帐户。在 `AppModule` 中配置 `mfa`：

```typescript
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    // ...
    mfa: {
      issuer: 'example.com',
      encryption: { keys: [process.env.TOTP_ENCRYPTION_KEY!] },
    },
  }),
}),
```

服务器必须读取 TOTP 秘密返回验证码，因此，与密码不同，它不能被散列。 `MfaService` 加密每个秘密 AES-256-GCM 在它到达存储之前，绑定到它的用户，并且解密它只是为了验证一个代码。任何持有数据库副本（但不是密钥）的人都不能生成代码。需要密钥：配置 `mfa` 没有 `encryption` 启动时抛出。（`encryption: false` 故意存储明文，用于测试。）短于 128 位的秘密永远不会验证： `enroll()` 使 160，但从另一个系统导入的秘密可能更短，他们的用户再次注册。

将密钥添加到 `.env`。字符串键必须至少包含 32 个字符的随机数据：

```bash
# Generate with: openssl rand -base64 32
TOTP_ENCRYPTION_KEY=
```

> info **Hint** 要旋转键，请先将一个新键放入 `keys` 把旧的留在后面。第一个密钥加密，每个列出的密钥解密，秘密在使用时用新密钥重新加密。一旦没有人使用旧钥匙，请将其移除。密钥不需要名称：每个加密的秘密记录一个从其密钥派生的 id。

双因素身份验证关闭，除非 `mfa` 已配置。没有它，`MfaService.isEnrolled()` 答案 `false` 不阅读商店，所以登录从不要求代码，每隔一段时间 `MfaService` 方法抛出 `MFA is not configured` 在接触存储之前。移除 `mfa` 从选项中关闭每个客户的双因素身份验证，包括那些已经注册了身份验证器的客户。

这个 MFA 端点注册身份验证器、确认身份验证器并完成登录：

```typescript
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Authenticate, CurrentUser, MfaService, Public, SignInService } from '@nestjs/authentication';
import type { User } from '../users/user.js';

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly signInService: SignInService,
  ) {}

  // Returns the otpauth:// URI for the web app to show as a QR code,
  // and the secret for people who type it in instead.
  @Post('enroll')
  enroll(@CurrentUser() user: User) {
    return this.mfaService.enroll(user.id, user.email);
  }

  // A new phone. The current authenticator keeps working until /confirm
  // receives a code from the new one.
  @Authenticate({ mfa: true })
  @Post('replace')
  replace(@CurrentUser() user: User) {
    return this.mfaService.enroll(user.id, user.email, { replace: true });
  }

  // The first code proves the authenticator works, and that this browser has
  // it: the session passes the second factor from here on, under a new cookie.
  // Recovery codes are shown once.
  @Post('confirm')
  @HttpCode(200)
  async confirm(@CurrentUser('id') userId: string, @Body('code') code: string) {
    if (!(await this.signInService.confirmMfa(userId, code))) {
      throw new UnauthorizedException('Invalid code');
    }
    return { recoveryCodes: await this.mfaService.generateRecoveryCodes(userId) };
  }

  // Second step of signing in. A pending session counts as signed in
  // nowhere, so the route is public: completeMfa() reads the session cookie.
  @Public()
  @Post('verify')
  @HttpCode(200)
  async verify(@Body('code') code: string | undefined, @Body('recoveryCode') recoveryCode: string | undefined) {
    const issued = await this.signInService.completeMfa({ code, recoveryCode });
    if (!issued) {
      throw new UnauthorizedException('Invalid code');
    }
    return { mfa: issued.session.mfa };
  }
}
```

- `enroll()` 存储一个新的、未经确认的秘密，并以 `otpauth://` URI web 应用程序显示为 QR 代码。一旦验证器被确认， `enroll()` 拒绝覆盖它并抛出 `MfaAlreadyEnrolledError` 模块用 409 回答， `Authenticator already enrolled`.覆盖它将关闭双因素身份验证，直到确认新的身份验证。
- `replace` 处理一部新手机。`enroll()` 和 `replace: true` 阶段第二个秘密，当前身份验证器继续工作，直到 `confirm()` 从新代码接收代码。`@Authenticate()` 和 `mfa: true` 使得路由需要经过验证的第二个因素，因此单独被盗密码不能替换其他人的身份验证器。
- `SignInService.confirmMfa()` 一旦身份验证器生成有效代码，就会激活它，因此输入错误的秘密不能将任何人锁定在外。该代码还证明该浏览器具有身份验证器，因此会话在新的 cookie 下得到验证：客户可以立即使用需要第二个因素的路由，而无需再次登录。使用没有会话的承载令牌发送的确认仅激活身份验证器。路由返回的 10 个恢复代码只显示一次，并存储在带有客户 id 的缓慢散列下，因此数据库的副本不会显示它们。
- 一旦验证器被确认， `SignInService.signIn()` 为该用户创建**挂起**会话。挂起的会话没有在任何地方签名：需要用户使用 401 和 `"errorCode": "mfa_required"`，它告诉 web 应用程序请求代码。这就是为什么 `verify` 是 `@Public()`. `completeMfa()` 从此浏览器的 cookie 中读取会话，检查代码或恢复代码，并将会话旋转到新的 id `mfa: 'verified'`，设置新的 cookie。挂起的会话将在 10 分钟后过期（`mfa.pendingTtl`），而不是在 14 天后 `session.absoluteTtl`：挂起的 cookie 是半个凭据。验证代码赋予会话完整的生命周期。
- `completeMfa()` 仅作用于会话 cookie。具有承载令牌但没有 cookie 的请求得到 401。
- 现在两边都接受代码 30 秒，每个代码工作一次。在 15 分钟内出现 5 个错误代码后，帐户会拒绝每个代码，包括正确的代码，直到窗口通过。每次尝试在被检查之前都会被计算在内，所以并行发送猜测不会绕过限制。

对于单个路由，也可能需要经过验证的第二个因素，这被称为升级身份验证。商店要求它更改电子邮件地址，因为这是恢复帐户的方法。新地址到达 [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords) 的 `EmailDto`。添加路由，使用 `@Authenticate()`：

```typescript
import { Body, ConflictException, Controller, Get, Patch } from '@nestjs/common';
import { Authenticate, CurrentUser, EmailVerificationService } from '@nestjs/authentication';
import { EmailDto } from '../auth/auth.dto.js';
import type { User } from './user.js';
import { UsersRepository } from './users.repository.js';

@Controller('me')
export class MeController {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Get()
  me(@CurrentUser() user: User) {
    return user;
  }

  // The email address is how an account is recovered: changing it needs a
  // session (or token) that passed the second factor.
  @Authenticate({ mfa: true })
  @Patch('email')
  async changeEmail(@CurrentUser('id') userId: string, @Body() body: EmailDto) {
    if (await this.usersRepository.findByEmail(body.email)) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.usersRepository.updateEmail(userId, body.email);
    if (user) {
      // The new address is unverified until the customer uses this link.
      await this.emailVerificationService.send(user);
    }
    return user;
  }
}
```

使用 Zod 模式：

```typescript
import { emailSchema, type EmailDto } from '../auth/auth.schemas.js';
// ...
@Authenticate({ mfa: true })
@Patch('email')
async changeEmail(@CurrentUser('id') userId: string, @Body({ schema: emailSchema }) body: EmailDto) {
  // ...
}
```

每条路线都需要一个登录用户；`@Authenticate()` 调整方式。和 `mfa: true`cookie 会话在验证后通过。没有注册身份验证器的客户无法通过，因此 web 应用程序要求他们先注册。

新地址未经验证，因此路由向其发送验证链接，客户在使用该地址之前无法下单。发送到旧地址的链接停止工作：它们只验证它们被发送到的地址。

移动应用程序绝不能成为绕过第二个因素的一种方式，也不能：喜欢 `signIn()`,`TokenService.issue()` 给具有已确认身份验证器的客户没有代码的令牌。它回答 401`"errorCode": "mfa_required"`，它告诉应用程序请求一个。然后，应用程序再次发送密码和代码。将代码添加到主体中：

```typescript
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// ...

/** The mobile app's sign-in: a password, and a code once the customer has an authenticator. */
export class TokenRequestDto extends SignInDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  recoveryCode?: string;
}
```

```typescript
/** The mobile app's sign-in: a password, and a code once the customer has an authenticator. */
export const tokenRequestSchema = signInSchema.extend({
  code: z.string().optional(),
  recoveryCode: z.string().optional(),
});
export type TokenRequestDto = z.infer<typeof tokenRequestSchema>;
```

并将其作为 `secondFactor` 传递：

```typescript
@Post()
@HttpCode(200)
async issue(@Body() body: TokenRequestDto) {
  const user = await this.credentialsService.verify(body.email, body.password);
  if (!user) {
    throw new UnauthorizedException('Invalid email or password');
  }
  return this.tokenService.issue(user.id, {
    method: 'password',
    // `amr` goes into this access token and into every refreshed one.
    claims: { amr: ['pwd'] },
    // Checked only for customers with an authenticator.
    secondFactor: { code: body.code, recoveryCode: body.recoveryCode },
  });
}
```

```typescript
import { tokenRequestSchema, type TokenRequestDto } from './auth.schemas.js';
// ...
@Post()
@HttpCode(200)
async issue(@Body({ schema: tokenRequestSchema }) body: TokenRequestDto) {
  // ...
}
```

没有代码的请求不被视为失败的尝试，因此应用程序可以确定它是否需要代码。经过验证的代码添加 `mfa` 到 `amr` 要求。`JwtBearerProvider` 处理一个令牌 `amr` 包含 `mfa`,`otp` 或者 `hwk` 已验证，因此通过 `mfa: true` 道路。刷新的令牌携带相同的 `amr` 作为开始他们家庭的登录，使用代码登录的移动应用程序将保持验证，直到其刷新令牌过期或被撤销。`issue()` 永远不要把这三个价值观从你自己身上夺走 `claims`：它会删除它们，并在日志中显示警告，然后添加 `mfa` 只有在验证了代码后，应用程序才不会意外生成经过验证的令牌。

注册控制器：

```typescript
controllers: [
  // ...
  TokensController,
  MfaController,
],
```

##### 关闭双因素身份验证

`MfaService.disable()` 删除客户的身份验证器及其恢复代码，并发出 `mfa-disabled`。将路由添加到 `MfaController`，并将 `SessionService` 和 `TokenService` 注入到其构造函数中：

```typescript
// Takes a verified session and a fresh code: a session left signed in on a
// shared computer isn't enough.
@Authenticate({ mfa: true })
@Post('disable')
@HttpCode(204)
async disable(
  @CurrentUser('id') userId: string,
  @CurrentSession() current: SessionRecord,
  @Body('code') code: string,
) {
  if (!(await this.mfaService.verifyTotp(userId, code))) {
    throw new UnauthorizedException('Invalid code');
  }
  await this.mfaService.disable(userId);
  // The other sessions and refresh tokens passed the second factor, and still would.
  await this.sessionService.revokeAll(userId, { except: current.id });
  await this.tokenService.revokeAll(userId);
}
```

- `@Authenticate()` 和 `mfa: true` 是最低限度：没有它，一个被盗的密码就可以关闭第二个因素。安 API 钥匙从不通过。不过，这并不能证明客户现在就在键盘前：一个会话在其整个生命周期内都会受到验证。所以路线也需要一个代码。`verifyTotp()` 决议 `false` 对于错误的代码，计入与登录相同的锁定，每个代码工作一次。
- `disable()` 删除每个恢复代码连同身份验证器，并删除由 `replace` 这从未得到证实。再次注册从头开始，使用新的一批恢复代码。
- `disable()` 不考虑会话和令牌。客户的其他已验证会话将继续通过 `mfa: true` 路线，以及他们的刷新令牌家族，其 `amr` 保持 `mfa` 每次刷新。路由结束它们，保留这个浏览器的会话。已发行的访问令牌在过期前一直有效。与承载令牌一起发送，请求没有要保留的会话 id：每个会话结束，并且 `TokenService.revokeAll()` 把那个客户也签了出去。
- 仍在等待第二个因素的会话无法完成它，因为没有身份验证器可以检查代码。`revokeAll()` 和其他人一起结束。
- 从未确认注册的客户没有经过验证的会话，因此此路由拒绝他们。要取消此类注册，请致电 `disable()` 从没有它的路线 `isEnrolled()` 是 `false`，或致电 `enroll()` 再一次。

#### 添加“使用 Google 登录”

在 Google Cloud 控制台中，创建 OAuth 客户端 ID 类型为**Web 应用程序**，并添加此授权重定向 URI（以及生产部署时）：

```bash
http://localhost:3000/auth/oidc/google/callback
```

将客户端的凭据添加到 `.env`，在 `APP_URL` 旁边：

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

当有人第一次使用 Google 登录时，您的应用程序必须决定 Google 帐户属于哪个本地帐户。将链接存储为（提供者、主题）对，其中主题是 Google 对帐户的稳定 id。电子邮件更改；受试者不会。将标识表添加到存储库中：

```typescript
@Injectable()
export class UsersRepository {
  private readonly rows = new Map<string, UserRow>();
  /** `provider:subject` → user id, e.g. `google:1098...` */
  private readonly identities = new Map<string, string>();

  // ...

  async findByIdentity(provider: string, subject: string): Promise<User | null> {
    const id = this.identities.get(`${provider}:${subject}`);
    return id ? this.findById(id) : null;
  }

  async linkIdentity(id: string, provider: string, subject: string): Promise<User | null> {
    this.identities.set(`${provider}:${subject}`, id);
    return this.findById(id);
  }
```

包裹要求 `OidcAccountResolver` 对于该决定：

```typescript
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  OidcAccountResolver,
  type OAuthTokens,
  type OidcProfile,
  type OidcResolveContext,
} from '@nestjs/authentication';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class AccountLinker extends OidcAccountResolver {
  constructor(
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('oidc', this);
  }

  async resolveUser(profile: OidcProfile, _tokens: OAuthTokens, { linkTo }: OidcResolveContext) {
    const linked = await this.usersRepository.findByIdentity(profile.provider, profile.subject);

    // "Connect Google" from the account page: link to the signed-in customer.
    if (linkTo) {
      if (linked && linked.id !== linkTo.id) {
        throw new ConflictException('This Google account belongs to another customer');
      }
      return this.usersRepository.linkIdentity(linkTo.id, profile.provider, profile.subject);
    }

    // A returning Google account: sign in the user it is linked to.
    if (linked) {
      return linked;
    }

    // First visit. Trust only an address Google verified, or anyone could
    // claim any account.
    if (!profile.email || !profile.emailVerified) {
      return null; // 403
    }
    const existing = await this.usersRepository.findByEmail(profile.email);
    if (!existing) {
      const user = await this.usersRepository.create(profile.email, { emailVerified: true });
      return this.usersRepository.linkIdentity(user.id, profile.provider, profile.subject);
    }
    // Link by email only if the account's owner proved the address to us too.
    // Otherwise whoever signed up with it, with a password of their choosing,
    // would share the account with the customer.
    if (!existing.emailVerified) {
      throw new ForbiddenException('Sign in with your password, then connect Google from your account');
    }
    return this.usersRepository.linkIdentity(existing.id, profile.provider, profile.subject);
  }
}
```

通过电子邮件链接需要双方验证地址：

- **谷歌必须验证过**（`profile.emailVerified`）。否则，任何人都可以用顾客的地址创建一个谷歌账户，并在商店接管他们的账户。返回 `null` 拒绝使用 403 登录。
- **商店账户也必须验证过**（`existing.emailVerified`）。否则，有人可以先用客户的地址和他们选择的密码注册，并在客户登录谷歌后保留访问权限。这叫做账户预劫持。使用密码创建的帐户在其所有者打开 [验证链接](/security/authentication#verify-email-addresses) 或 [重置密码](/security/authentication#reset-forgotten-passwords) 之前未经验证。在那之前，它会收到一个 403，要求客户用他们的密码登录，并从他们的帐户连接谷歌。

将谷歌连接到客户登录的帐户根本不需要电子邮件匹配。该软件包称之为链接流：web 应用程序的“连接谷歌”按钮指向 `GET /auth/oidc/google/login?link=true`。该软件包只在完全登录的会话中启动，而不是从另一个网站的页面启动，这个页面会得到一个 403：一个链接附加在这个浏览器上登录的任何谷歌帐户。在回调时，它会检查同一会话是否仍然有效，然后使用登录用户 `linkTo` 调用 `resolveUser()`。解析器将 Google 帐户链接到他们，除非它已经属于另一个客户。会话保持原样，浏览器被重定向到 `redirectTo`。

启用 OpenID 连接 `google()` 预设和 URL 谷歌将浏览器发送回。`:provider` 表示提供程序的名称，因此添加的每个提供程序都有一条回调路由：

```typescript
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    // ...
    oidc: {
      // The callback route of OidcController, registered with Google.
      callbackUrl: `${process.env.APP_URL}/auth/oidc/:provider/callback`,
      providers: {
        google: google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      },
    },
  }),
}),
```

路由是你的，所以它们和你的其他路由在你的前缀、版本和节流下。`OidcService.start()` 构建重定向到 Google 和 `finish()` 处理回调；控制器公开这两个：

```typescript
import { Controller, Get, Param, Query, Redirect } from '@nestjs/common';
import { OidcService, Public } from '@nestjs/authentication';

@Public()
@Controller('auth/oidc')
export class OidcController {
  constructor(private readonly oidcService: OidcService) {}

  // "Sign in with Google" links here. With ?link=true, "Connect Google"
  // links the Google account to the signed-in customer instead.
  @Get(':provider/login')
  @Redirect()
  login(@Param('provider') provider: string, @Query('redirectTo') redirectTo?: string, @Query('link') link?: string) {
    return this.oidcService.start(provider, { redirectTo, link: link === 'true' });
  }

  // Where Google sends the browser back.
  @Get(':provider/callback')
  @Redirect()
  callback(@Param('provider') provider: string, @Query() query: Record<string, string>) {
    return this.oidcService.finish(provider, query);
  }
}
```

- `GET /auth/oidc/google/login?redirectTo=/orders` 将浏览器重定向到谷歌。网络应用的“用谷歌登录”按钮是一个简单的链接。 `start()` 将授权代码流与 PKCE, a `state` 和一个 `nonce`.登录事务存储在服务器端 `state`，浏览器得到一个秘密 SHA-256 哈希是 `state`,在安 `HttpOnly` cookie 命名 `__Host-oidc_tx`，10 分钟。
- `GET /auth/oidc/google/callback` 是谷歌把浏览器送回去的地方。 `finish()` 检查 `state` 在查询中是浏览器 cookie 中的秘密的散列（所以没有人可以完成他们没有在这个浏览器中开始的登录，即使是回调 URL 从日志或浏览器历史记录中读取），交换代码，验证 ID 令牌的签名对照谷歌发布的密钥，并检查其发行者、受众、到期和随机。如果无法联系到 Google，或者用不是 https 的端点回答，答案是 502，而不是 401。然后它调用 `resolveUser()`，通过 `SignInService` （因此具有身份验证器的客户会得到一个挂起的会话），并将重定向返回到 `redirectTo`,或两个 `/`.仅接受相对路径作为 `redirectTo`，因此登录不能变成打开重定向。
- 两者都读取请求并设置他们的 cookies Nest's HTTP 适配器，并返回什么 `@Redirect()` 期望，因此控制器在 Express 和 Fastify 相似，没有 `@Req()` 或者 `@Res()`.

在 `AuthModule` 中注册控制器和旋转变压器：

```typescript
controllers: [
  // ...
  MfaController,
  OidcController,
],
providers: [
  // ...
  PasswordResetMailer,
  AccountLinker,
],
```

这个 `github()` 预设以同样的方式工作。 `microsoft()` 还将目录的租户 id 作为其 `tenant` 选项，旁边 `clientId` 和 `clientSecret`: a GUID 从 Microsoft Entra 管理中心的概述页面，例如 `process.env.ENTRA_TENANT_ID`.域，或多租户 `common`, `organizations` 和 `consumers` 启动时失败：对于这些，Microsoft 发布了一个与请求的发行者不同的发行者，并且每次登录都会失败。将它们添加到 `google` 在 `providers`，并注册回调 URL 每一个，用它的名字代替 `google`.

服务于多个域（例如每个客户一个域）的应用程序不能命名单个回调 URL: 在一个域上启动的登录必须返回到该域。将请求的函数作为 `callbackUrl` 反而。`start()` 在登录时调用它，并且 `finish()` 在回调时再次调用它，因此它必须返回相同的 URL 两者都有。将主机与您自己的域列表进行比较，而不是信任标头，并注册每个 URL 它可以返回每个提供者：

```typescript
oidc: {
  callbackUrl: ({ headers }) => {
    const host = CUSTOMER_DOMAINS.find((domain) => domain === headers.host);
    if (!host) {
      throw new NotFoundException();
    }
    return `https://${host}/auth/oidc/:provider/callback`;
  },
  providers: {
    // ...
  },
},
```

函数也可以是 `async`，在数据库中查找域。无论它抛出什么都是登录的答案，就像上面针对应用程序不服务的域的 404 一样，以及一个 URL 这不是绝对的，登录失败，并出现命名函数的错误。这个 `__Host-oidc_tx`cookie 属于设置它的域，因此登录在它开始的域上结束。如果函数曾经返回另一个 URL 在回调时，提供程序将拒绝代码，回调将得到 401。在重写主机的代理后面，读取它转发的头，例如 `X-Forwarded-Host` 而且只能通过你信任的代理人。

#### 添加 magic-link 登录

一个神奇的链接从客户的收件箱登录，没有密码。包创建并检查链接；交付它们取决于您，通过 `MagicLinkHandler`。商店会像验证链接一样通过电子邮件发送它们，并使用自己的模板和邮件类：

```html
<p><a href="{{ url }}">Sign in to the store</a></p>
<p>The link works once, for 15 minutes. If you didn't ask for it, ignore this email.</p>
```

```typescript
import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticationRegistry, MagicLinkHandler, type MagicLink } from '@nestjs/authentication';
import { Mailer, type Mailable } from '@nestjs/mail';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class MagicLinkMail implements Mailable<MagicLink> {
  render({ url }: MagicLink) {
    return {
      subject: 'Your sign-in link',
      template: 'magic-link',
      context: { url },
    };
  }
}

@Injectable()
export class MagicLinkMailer extends MagicLinkHandler {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly mailer: Mailer,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('magicLink', this);
  }

  async send(link: MagicLink) {
    await this.mailer.send(MagicLinkMail, { to: link.email, data: link });
  }

  // Runs when the link is used, which proves the address. The account returned
  // carries its stored `email`, and signs in only if the link went to that address.
  async resolveUser(email: string) {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      // Passwordless sign-up. Return null instead to refuse unknown addresses.
      return this.usersRepository.create(email, { emailVerified: true });
    }
    // A password account whose address nobody confirmed: whoever chose that
    // password may not own the address. Resetting the password proves both.
    if (!user.emailVerified) {
      throw new ForbiddenException('Sign in with your password, or reset it');
    }
    return user;
  }
}
```

启用魔法链接：中的处理程序 `AuthModule`，以及 URL 链接指向选项：

```typescript
providers: [
  // ...
  AccountLinker,
  MagicLinkMailer,
],
```

```typescript
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    // ...
    magicLink: { url: `${process.env.APP_URL}/sign-in/magic` },
  }),
}),
```

`MagicLinkService.create()` 创建一个随机的 256 位令牌，有效期为 15 分钟，可使用一次，并将链接传递给处理程序。它存储 SHA 令牌的-256 哈希值与只有此浏览器的事务 cookie 持有的秘密相结合（见下文），因此从日志读取或转发的链接不会找到任何内容，即使使用伪造的 cookie。和 `bindToBrowser: false`，它只存储令牌的散列。令牌被添加到 URL 作为一个 `token` 查询参数，否则您的代码永远不会看到它。

将链接指向 web 应用程序的页面，而不是 API.页面从其 URL 然后把它贴回去。电子邮件扫描器和链接预览跟踪电子邮件中的链接 GET 请求，并且会在客户点击之前用完令牌。页面必须与 API：请求链接会设置一个 cookie，浏览器会将该 cookie 连同令牌一起发送回来。

```typescript
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { MagicLinkService, Public } from '@nestjs/authentication';
import { EmailDto } from './auth.dto.js';

@Public()
@Controller('auth/magic-link')
export class MagicLinkController {
  constructor(private readonly magicLinkService: MagicLinkService) {}

  @Post()
  @HttpCode(202)
  async request(@Body() body: EmailDto, @Body('redirectTo') redirectTo?: string) {
    await this.magicLinkService.create(body.email, { redirectTo });
  }

  // Called by the page the link opens, which POSTs the token from its URL.
  @Post('consume')
  @HttpCode(200)
  async consume(@Body('token') token: string) {
    // A link opened in another browser throws MagicLinkError, which the module
    // answers: a 401 telling the customer to open it where they asked for it.
    const result = await this.magicLinkService.consume(token);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    return { redirectTo: result.redirectTo ?? '/', mfaRequired: result.session.mfa === 'pending' };
  }
}
```

- 请求路由回答 202 地址是否具有帐户，并且仅在使用链路时创建帐户。从另一个站点的页面发布的请求会得到 403，就像登录一样：否则，该页面可以将此浏览器的事务 cookie 设置为指向其作者地址的链接，然后让客户打开它（登录 CSRF).
- `consume()` 烧录令牌，调用 `resolveUser()`，并通过设置 cookie 的 `SignInService` 登录用户，因此双因素身份验证仍然适用。`resolveUser()` 返回帐户及其存储的 `email`，并且只有当链接发送到的地址是该地址时，链接才会在帐户上签名，比较修剪、小写和 UnicodeNFC。像 MySQL 的默认排序一样，忽略重音符号或点的查找不能将一个邮箱交给另一个客户的帐户：`consume()` 返回 `null`。
- 链接仅在请求链接的浏览器中有效。 `create()` 设置事务 cookie， `__Host-magic_link_tx`，和 `consume()` 在查找任何内容之前，拒绝没有它的令牌：它抛出一个 `MagicLinkError`，模块用 401 回答它 `error` 是 `not_this_browser` 其消息告诉客户在他们请求的浏览器中打开最新的链接，或者在这里请求一个新的链接。否则，任何人都可以请求自己地址的链接，并让客户打开它，这将使客户的浏览器登录到攻击者的帐户（登录 CSRF).被拒绝的链接在请求它的浏览器中保持有效，答案不会透露任何关于令牌的信息，因为一个虚构的链接也会得到它。cookie 保留浏览器请求的最后五个链接，因此单击“重新发送”然后打开第一封电子邮件的客户仍然登录；比这五个更老的链接得到相同的 401。因此，一个在笔记本电脑上请求链接并在手机上打开电子邮件的客户被告知在笔记本电脑上打开它，或者在手机上请求一个新的链接，然后在那里工作；一个宁愿让链接本身在手机上工作的应用程序 `bindToBrowser: false` 在 `magicLink` 选项。未知、已使用和过期的链接，并解决处理程序拒绝的问题，获取控制器的一个通用答案： `consume()` 回报 `null` 对他们所有人来说，只有那些 `magic-link-refused` 事件说明是哪一个。
- 使用链接可以证明地址，因此通过链接创建的帐户会得到验证。使用密码创建的帐户在其地址未经验证时是不同的：该链接证明了谁现在拥有该地址，而不是谁选择了该密码，因此处理程序使用 403 拒绝它，而不是将预先被劫持的帐户交给其所有者。一旦所有者使用 [验证链接](/security/authentication#verify-email-addresses), 或 [重置密码](/security/authentication#reset-forgotten-passwords) 魔法链接也适用于该帐户。
- 只有当 `/orders` 是相对路径时，`redirectTo` 才能在往返中存活。

使用 Zod 模式：

```typescript
import { emailSchema, type EmailDto } from './auth.schemas.js';
// ...
@Post()
@HttpCode(202)
async request(@Body({ schema: emailSchema }) body: EmailDto, @Body('redirectTo') redirectTo?: string) {
  // ...
}
```

注册控制器：

```typescript
controllers: [
  // ...
  OidcController,
  MagicLinkController,
],
```

#### 让客户管理他们的会话

会话实时存在于服务器上，因此客户可以看到他们在哪里登录并结束任何会话。要区分这些会话，请记录每个会话所属的浏览器。`session.metadata` 每当客户使用密码、Google 或 magic link 登录时运行，其返回的内容会存储在新会话中：

```typescript
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    session: {
      absoluteTtl: '14d', // signed out after 14 days, however active
      idleTtl: '3d', // or after 3 days without a request
      // Stored with every new session, whichever way the customer signed in.
      metadata: (request) => ({ userAgent: request.headers['user-agent'] }),
    },
    // ...
  }),
}),
```

然后列出会话，并结束它们：

```typescript
import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import {
  CurrentSession,
  CurrentUser,
  Public,
  SessionService,
  SignInService,
  type SessionRecord,
} from '@nestjs/authentication';

@Controller('auth')
export class SessionsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly signInService: SignInService,
  ) {}

  @Get('sessions')
  async list(@CurrentUser('id') userId: string, @CurrentSession() current: SessionRecord) {
    const sessions = await this.sessionService.list(userId);
    return sessions.map(({ id, createdAt, lastActiveAt, metadata }) => ({
      id,
      createdAt,
      lastActiveAt,
      userAgent: metadata?.userAgent ?? null,
      current: id === current.id,
    }));
  }

  // revoke() only ends a session of this user: another customer's id is a 404.
  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    if (!(await this.sessionService.revoke(id, { userId }))) {
      throw new NotFoundException();
    }
  }

  // Public, so that a session still waiting for its second factor can sign
  // out too. signOut() ends the session in this browser's cookie.
  @Public()
  @Post('sign-out')
  @HttpCode(204)
  async signOut() {
    if (!(await this.signInService.signOut())) {
      throw new UnauthorizedException(); // no session cookie, e.g. a bearer token
    }
  }

  @Post('sign-out-everywhere')
  @HttpCode(204)
  async signOutEverywhere(@CurrentUser('id') userId: string) {
    await this.signInService.signOutEverywhere(userId);
  }
}
```

- 会话 ID 是 SHA-256 个 cookie 令牌的散列。把它们展示给它们的主人是安全的，因为饼干不能从饼干中衍生出来。`revoke()` 获取用户和 id，并且只结束属于他们的会话，因此来自 URL 无法结束其他客户的会话。
- `sign-out` 是 `@Public()`,喜欢 `verify` 在 [双因素认证](/security/authentication#add-two-factor-authentication)，所以一个从来没有完成第二个因素的客户仍然可以退出。`signOut()` 结束此浏览器 cookie 中的会话并清除 cookie。它返回 `false` 当没有会话时，路由回答 401：这里的承载令牌没有显示任何内容。
- `signOutEverywhere()` 结束每个会话，当应用程序发布它们时，结束用户的每个刷新令牌，并清除此浏览器的 cookie。已经发放的访问令牌在过期前一直有效，这就是为什么它们只能持续 15 分钟。

移动应用程序通过撤销其刷新令牌注销一个设备。将路由添加到 `TokensController`。`TokenService.revoke()` 结束令牌的家族：令牌、其前身和后继者：

```typescript
// Signs the mobile app out on this device. Unknown tokens get the same
// answer, as in RFC 7009.
@Post('revoke')
@HttpCode(204)
async revoke(@Body('refreshToken') refreshToken: string) {
  await this.tokenService.revoke(refreshToken);
}
```

注册控制器。这是完成的模块，包含教程中的每个凭据提供程序和处理程序：

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AccountLinker } from './account-linker.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { EmailVerificationController } from './email-verification.controller.js';
import { EmailVerificationMailer } from './email-verification.mailer.js';
import { JwtAuth } from './jwt-auth.provider.js';
import { MagicLinkController } from './magic-link.controller.js';
import { MagicLinkMailer } from './magic-link.mailer.js';
import { MfaController } from './mfa.controller.js';
import { OidcController } from './oidc.controller.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetMailer } from './password-reset.mailer.js';
import { SessionAuth } from './session-auth.provider.js';
import { SessionsController } from './sessions.controller.js';
import { TokensController } from './tokens.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [
    AuthController,
    EmailVerificationController,
    PasswordResetController,
    TokensController,
    MfaController,
    OidcController,
    MagicLinkController,
    SessionsController,
  ],
  providers: [
    SessionAuth,
    JwtAuth,
    CredentialsService,
    EmailVerificationMailer,
    PasswordResetMailer,
    AccountLinker,
    MagicLinkMailer,
  ],
})
export class AuthModule {}
```

每当权限更改时，例如在密码更改后或客户成为员工时，旋转会话：`SignInService.rotateSession()` 给这个浏览器的会话一个新的 id，并设置新的 cookie；`completeMfa()` 已经这么做了。它解决了 `null` 当浏览器没有会话或同时丢失会话时，不设置 cookie：到处注销、密码重置或其他首先轮换它的请求。

#### 速率限制登录

`@nestjs/authentication` 不限制请求速率。这就是 `@nestjs/throttler`，单独的包：

```bash
$ npm i --save @nestjs/throttler
```

节流 IP 单独登录太粗糙了。它允许一个客户端尝试多个帐户的密码，并且同一网络地址后面的客户共享一个限制。跟踪电子邮件和 IP 在请求主体命名帐户的地方，一起寻址：

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Per IP everywhere; per (email, IP) where the request body names an account. */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = await super.getTracker(req);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().normalize('NFC').toLowerCase() : '';
    return email ? `${email}|${ip}` : ip;
  }
}
```

登记 `ThrottlerModule` 默认限制为每分钟 100 个请求，并且防护作为全局防护：

```typescript
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule, minutes } from '@nestjs/throttler';
import { AuthThrottlerGuard } from './auth/auth-throttler.guard.js';
// ...

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: minutes(1), limit: 100 }]),
    // ...
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true }) },
    { provide: APP_GUARD, useClass: AuthThrottlerGuard },
  ],
})
export class AppModule {}
```

防护在根模块中注册，因此它运行在身份验证防护之前。全局守卫按模块顺序运行，根模块排在第一位。这意味着猜测的持有者令牌也计入限制，而不仅仅是 401 被拒绝。

最后，收紧检查密码或发送电子邮件的路线限制。每个 `@Throttle()` 计数每个路由，每个电子邮件和 IP：

```typescript
@Throttle({ default: { limit: 5, ttl: minutes(15) } })
@Post('sign-in')
```

```typescript
@Throttle({ default: { limit: 5, ttl: minutes(15) } })
@Post()
```

```typescript
@Throttle({ default: { limit: 3, ttl: minutes(15) } })
@Post()
```

```typescript
@Throttle({ default: { limit: 3, ttl: minutes(15) } })
@Post('forgot')
```

`Throttle` 和 `minutes` 是从 `@nestjs/throttler` 对发送电子邮件的路径的限制也阻止了任何人从一个地址充斥客户的收件箱。双因素代码不需要自己的油门：该软件包会在 5 次失败后锁定帐户代码，从任何 IP 地址、路线或交通工具。也没有 `POST /auth/password/reset`：一个猜测的令牌需要一次查找，有 2^256 个。

> info **Hint** 在负载平衡器或反向代理后面，每个请求似乎都来自代理。使能够 `trust proxy` 如油门中所述 [Proxies](/security/rate-limiting#proxies) 节，因此跟踪器可以看到客户端地址。

#### 在数据库中保留会话和令牌

到目前为止，包存储的所有内容都存在于内存中：会话、刷新令牌、身份验证器和恢复代码，以及挂起的链接和登录。它在重新启动时丢失，第二个实例 API 不会看到的。该软件包不会与您的数据库本身对话。它描述了它存储的六个接口，`SessionStore`,`RefreshTokenStore`,`MfaStore`,`MagicLinkStore`,`OidcStateStore` 和 `EmailTokenStore` 应用程序使用它已经拥有的数据库访问权限来实现它们，然后注册实现。

此步骤显示了实现两次，对于家族教程使用的两个 orm：首先使用 Drizzle，这是教程的路径，然后，在步骤结束时的“使用 TypeORM”下，为 ORM 是 TypeORM 的应用程序存储相同的存储。取两个中的一个。

存储使用 PostgreSQL 和 Drizzle，到 [`@nestjs/drizzle`](/data/drizzle)，这一步假设您的应用程序已经有了。`DrizzleModule` 从数据库的 URL 打开一个 `pg` 池，并提供 Drizzle 数据库，当应用程序关闭时，在软件包完成了它仍然在运行中的工作（例如，在退出时的重置链接），它会关闭池。将 URL 添加到 `.env` 中，并在 `AppModule` 中注册模块：

```bash
DATABASE_URL=postgres://localhost:5432/store
```

```typescript
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
// ...
@Module({
  imports: [
    // The Drizzle database, on a pg pool the module closes when the application shuts down.
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL! }),
    }),
    // ...
  ],
})
export class AppModule {}
```

从桌子开始。他们很普通 Drizzle 应用程序架构中的表，在您自己的架构旁边：

```typescript
// The store's Drizzle tables. drizzle-kit generates the migrations from this file.
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

// Authentication state: what DrizzleAuthenticationStore (src/auth) keeps for @nestjs/authentication.
// Tokens, links and sessions are stored by their SHA-256; TOTP secrets arrive encrypted.

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    lastActiveAt: at('last_active_at').notNull(),
    mfa: text('mfa', { enum: ['pending', 'verified'] }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    familyExpiresAt: at('family_expires_at').notNull(),
    usedAt: at('used_at'),
    // A family is revoked when any of its tokens is: that covers a successor saved after the revocation.
    revoked: boolean('revoked').notNull().default(false),
    claims: jsonb('claims').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('refresh_tokens_family_id_idx').on(table.familyId),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_expires_at_idx').on(table.familyExpiresAt),
  ],
);

export const mfaAuthenticators = pgTable('mfa_authenticators', {
  userId: text('user_id').primaryKey(),
  secret: text('secret').notNull(),
  confirmed: boolean('confirmed').notNull(),
  pendingSecret: text('pending_secret'),
  lastUsedStep: integer('last_used_step'),
});

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    userId: text('user_id').notNull(),
    codeHash: text('code_hash').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.codeHash] })],
);

export const mfaFailures = pgTable(
  'mfa_failures',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull(),
    failedAt: at('failed_at').notNull(),
  },
  (table) => [
    index('mfa_failures_user_id_failed_at_idx').on(table.userId, table.failedAt),
    index('mfa_failures_failed_at_idx').on(table.failedAt),
  ],
);

export const magicLinks = pgTable(
  'magic_links',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    redirectTo: text('redirect_to'),
  },
  (table) => [index('magic_links_expires_at_idx').on(table.expiresAt)],
);

export const oidcLogins = pgTable(
  'oidc_logins',
  {
    state: text('state').primaryKey(),
    provider: text('provider').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    nonce: text('nonce'),
    redirectTo: text('redirect_to'),
    // Set for "connect your Google account" from a signed-in session.
    linkUserId: text('link_user_id'),
    linkSessionId: text('link_session_id'),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
  },
  (table) => [index('oidc_logins_expires_at_idx').on(table.expiresAt)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    purpose: text('purpose', { enum: ['password-reset', 'email-verification'] }).notNull(),
    userId: text('user_id').notNull(),
    email: text('email').notNull(),
    fingerprint: text('fingerprint'),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
  },
  (table) => [
    index('email_tokens_user_id_purpose_idx').on(table.userId, table.purpose),
    index('email_tokens_expires_at_idx').on(table.expiresAt),
  ],
);
```

- 会话、令牌和链接存储为 SHA-Cookie 和电子邮件中的值的 256 个散列，TOTP 机密将与您的密钥一起加密到达（请参阅 [双因素认证](/security/authentication#add-two-factor-authentication)），恢复代码到达时使用 scrypt 散列。这些表格中的任何内容都不能重放。
- `revoked` 在每个刷新令牌上，而不是在族表中：当一个族的任何令牌被撤销时，它被算作被撤销。这涵盖了在撤销后通过输掉比赛的刷新保存的令牌。

从架构生成迁移并应用它：

```bash
$ npx drizzle-kit generate --name=authentication
No config path provided, using default 'drizzle.config.ts'
Reading config file '/store/drizzle.config.ts'
8 tables
email_tokens 7 columns 2 indexes 0 fks
magic_links 5 columns 1 indexes 0 fks
mfa_authenticators 5 columns 0 indexes 0 fks
mfa_failures 3 columns 2 indexes 0 fks
mfa_recovery_codes 2 columns 0 indexes 0 fks
oidc_logins 9 columns 1 indexes 0 fks
refresh_tokens 9 columns 3 indexes 0 fks
sessions 7 columns 2 indexes 0 fks

[✓] Your SQL migration file ➜ drizzle/0000_authentication.sql 🚀
$ npx drizzle-kit migrate
No config path provided, using default 'drizzle.config.ts'
Reading config file '/store/drizzle.config.ts'
Using 'pg' driver for database querying
[✓] migrations applied successfully!
```

现在商店。它是一个和其他提供者一样的提供者：它注入 Drizzle 数据库，实现六个接口 Drizzle 的查询生成器，并向包的 `AuthenticationStorage` 从其构造函数：

```typescript
import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type EmailTokenPurpose,
  type EmailTokenRecord,
  type EmailTokenStore,
  type MagicLinkRecord,
  type MagicLinkStore,
  type MfaStore,
  type OidcStateStore,
  type OidcTransaction,
  type RefreshTokenRecord,
  type RefreshTokenStore,
  type SessionRecord,
  type SessionStore,
  type TotpRecord,
} from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  emailTokens,
  magicLinks,
  mfaAuthenticators,
  mfaFailures,
  mfaRecoveryCodes,
  oidcLogins,
  refreshTokens,
  sessions,
} from '../database/schema.js';

/**
 * Keeps sessions, refresh tokens, authenticators and pending links in
 * PostgreSQL, through Drizzle. Every method that decides whether something
 * works once is a single conditional statement, so the guarantees hold with
 * any number of API instances.
 */
@Injectable()
export class DrizzleAuthenticationStore
  implements SessionStore, RefreshTokenStore, MfaStore, MagicLinkStore, OidcStateStore, EmailTokenStore
{
  /** Pending links and logins kept per table: anyone can create them. */
  protected readonly maxPending: number = 100_000;

  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({
      sessions: this,
      refreshTokens: this,
      mfa: this,
      magicLinks: this,
      oidcStates: this,
      emailTokens: this,
    });
  }

  // Sessions

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id));
    return row && withoutNulls(row);
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.db.insert(sessions).values(record);
    await this.db.delete(sessions).where(lte(sessions.expiresAt, record.createdAt));
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    // Conditional: a session deleted by a sign-out stays deleted.
    await this.db
      .update(sessions)
      .set({ lastActiveAt })
      .where(and(eq(sessions.id, id), lt(sessions.lastActiveAt, lastActiveAt)));
  }

  // Whether this call deleted it: of two rotations of a session, or a rotation and a sign-out, one wins.
  async deleteSession(id: string): Promise<boolean> {
    const deleted = await this.db.delete(sessions).where(eq(sessions.id, id)).returning({ id: sessions.id });
    return deleted.length > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.userId, userId));
    return rows.map(withoutNulls);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  // Refresh tokens

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.id, id));
    if (!row) {
      return undefined;
    }
    const { revoked: _, ...token } = row;
    return withoutNulls(token);
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.db.insert(refreshTokens).values(record);
    await this.db.delete(refreshTokens).where(lte(refreshTokens.familyExpiresAt, record.createdAt));
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    // Conditional: of two refreshes with the same token, one updates the row.
    const updated = await this.db
      .update(refreshTokens)
      .set({ usedAt: at })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.usedAt)))
      .returning({ id: refreshTokens.id });
    return updated.length === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.familyId, familyId));
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    const revoked = await this.db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.familyId, familyId), eq(refreshTokens.revoked, true)))
      .limit(1);
    return revoked.length > 0;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await this.db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, userId));
  }

  // Authenticators, recovery codes and failed attempts

  async getTotp(userId: string): Promise<TotpRecord | undefined> {
    const [row] = await this.db.select().from(mfaAuthenticators).where(eq(mfaAuthenticators.userId, userId));
    if (!row) {
      return undefined;
    }
    const { userId: _, ...totp } = row;
    return withoutNulls(totp);
  }

  async saveTotp(userId: string, record: TotpRecord | null): Promise<void> {
    if (!record) {
      await this.db.delete(mfaAuthenticators).where(eq(mfaAuthenticators.userId, userId));
      return;
    }
    const values = { secret: record.secret, confirmed: record.confirmed, pendingSecret: record.pendingSecret ?? null };
    await this.db
      .insert(mfaAuthenticators)
      .values({ userId, ...values, lastUsedStep: record.lastUsedStep })
      .onConflictDoUpdate({
        target: mfaAuthenticators.userId,
        // Never lower the claimed step: the record may have been read before a claim.
        set: { ...values, lastUsedStep: sql`greatest(${mfaAuthenticators.lastUsedStep}, excluded.last_used_step)` },
      });
  }

  async claimTotpStep(userId: string, step: number): Promise<boolean> {
    // Conditional: a code's time step is accepted once.
    const claimed = await this.db
      .update(mfaAuthenticators)
      .set({ lastUsedStep: step })
      .where(
        and(
          eq(mfaAuthenticators.userId, userId),
          or(isNull(mfaAuthenticators.lastUsedStep), lt(mfaAuthenticators.lastUsedStep, step)),
        ),
      )
      .returning({ userId: mfaAuthenticators.userId });
    return claimed.length === 1;
  }

  async saveRecoveryCodes(userId: string, hashes: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
      if (hashes.length > 0) {
        await tx.insert(mfaRecoveryCodes).values([...new Set(hashes)].map((codeHash) => ({ userId, codeHash })));
      }
    });
  }

  async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    // Conditional: of two requests with the same code, one deletes the row.
    const consumed = await this.db
      .delete(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, hash)))
      .returning({ userId: mfaRecoveryCodes.userId });
    return consumed.length === 1;
  }

  countRecoveryCodes(userId: string): Promise<number> {
    return this.db.$count(mfaRecoveryCodes, eq(mfaRecoveryCodes.userId, userId));
  }

  async recordMfaFailure(userId: string, windowMs: number, now: number): Promise<number> {
    // Insert, then count, each committed on its own (no transaction): every attempt
    // counts itself and all those recorded before it.
    await this.db.insert(mfaFailures).values({ userId, failedAt: new Date(now) });
    const failures = await this.countMfaFailures(userId, windowMs, now);
    await this.db.delete(mfaFailures).where(lte(mfaFailures.failedAt, new Date(now - windowMs)));
    return failures;
  }

  countMfaFailures(userId: string, windowMs: number, now: number): Promise<number> {
    return this.db.$count(
      mfaFailures,
      and(eq(mfaFailures.userId, userId), gt(mfaFailures.failedAt, new Date(now - windowMs))),
    );
  }

  async clearMfaFailures(userId: string): Promise<void> {
    await this.db.delete(mfaFailures).where(eq(mfaFailures.userId, userId));
  }

  // Magic links

  async saveMagicLink(record: MagicLinkRecord): Promise<void> {
    await this.db.insert(magicLinks).values(record);
    await this.trim(magicLinks, record.createdAt);
  }

  async consumeMagicLink(id: string): Promise<MagicLinkRecord | undefined> {
    // DELETE … RETURNING: of two requests with the same link, one gets the row.
    const [row] = await this.db.delete(magicLinks).where(eq(magicLinks.id, id)).returning();
    return row && withoutNulls(row);
  }

  // Sign-ins with Google in progress

  async saveOidcState({ link, ...login }: OidcTransaction): Promise<void> {
    await this.db.insert(oidcLogins).values({ ...login, linkUserId: link?.userId, linkSessionId: link?.sessionId });
    await this.trim(oidcLogins, login.createdAt);
  }

  async consumeOidcState(state: string): Promise<OidcTransaction | undefined> {
    const [row] = await this.db.delete(oidcLogins).where(eq(oidcLogins.state, state)).returning();
    if (!row) {
      return undefined;
    }
    const { linkUserId, linkSessionId, ...login } = withoutNulls(row);
    return linkUserId && linkSessionId ? { ...login, link: { userId: linkUserId, sessionId: linkSessionId } } : login;
  }

  // Password reset and email verification links

  async saveEmailToken(record: EmailTokenRecord): Promise<void> {
    await this.db.insert(emailTokens).values(record);
    await this.trim(emailTokens, record.createdAt);
  }

  async consumeEmailToken(id: string, purpose: EmailTokenPurpose): Promise<EmailTokenRecord | undefined> {
    const [row] = await this.db
      .delete(emailTokens)
      .where(and(eq(emailTokens.id, id), eq(emailTokens.purpose, purpose)))
      .returning();
    return row && withoutNulls(row);
  }

  async deleteUserEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
    await this.db.delete(emailTokens).where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose)));
  }

  /** Deletes what expired, and past `maxPending`, what expires first. */
  private async trim(table: typeof magicLinks | typeof oidcLogins | typeof emailTokens, now: Date) {
    await this.db.delete(table).where(lte(table.expiresAt, now));
    const [cutoff] = await this.db
      .select({ expiresAt: table.expiresAt })
      .from(table)
      .orderBy(desc(table.expiresAt))
      .limit(1)
      .offset(this.maxPending);
    if (cutoff) {
      await this.db.delete(table).where(lte(table.expiresAt, cutoff.expiresAt));
    }
  }
}

/** A row without its NULL columns: the package's records leave optional fields out. */
type WithoutNulls<T> = { [K in keyof T as null extends T[K] ? never : K]: T[K] } & {
  [K in keyof T as null extends T[K] ? K : never]?: Exclude<T[K], null>;
};

function withoutNulls<T extends object>(row: T): WithoutNulls<T> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)) as WithoutNulls<T>;
}
```

将其添加到 `AuthModule`，如凭据提供程序和处理程序。只需在构造函数中注册：Nest 在启动时，在第一个请求之前创建提供程序。

```typescript
import { DrizzleAuthenticationStore } from './drizzle-authentication.store.js';
// ...
providers: [
  // ...
  MagicLinkMailer,
  DrizzleAuthenticationStore,
],
```

在启动时，在提供程序链和处理程序之后，模块记录每种状态的位置：

```bash
LOG [AuthenticationModule] AuthenticationRegistry: providers SessionAuth, JwtAuth; handlers EmailVerificationMailer (emailVerification), PasswordResetMailer (passwordReset), MagicLinkMailer (magicLink), AccountLinker (oidc)
LOG [AuthenticationModule] AuthenticationStorage: DrizzleAuthenticationStore
```

- **一个或多个提供者。**`registerSource()` 按名称获取接口，因此一个类可以实现所有六个接口，如这里所示，或者几个类可以拆分它们：a`RedisSessionStore` 注册 `sessions`，这个班注册了其他五个。同名的第二个存储在启动时失败，命名两个类。
- **有些方法必须是一个语句。**任何决定某个东西只起作用一次的东西都是一个单一的条件语句，而不是读取后写入。`touchSession()` 仅更新仍然存在的会话，因此请求注销无法恢复会话。`deleteSession()` 解决它是否删除了行，因此在一个会话的两次旋转中，或者一次旋转和一次注销中，正好有一个获胜。`markRefreshTokenUsed()`、`claimTotpStep()` 和 `consumeRecoveryCode()` 计算它们更改的行，三个 `consume` 方法是 `DELETE … RETURNING`。`saveTotp()` 与 `greatest()` 保持较大的时间步长，商店手写 SQL 的一个地方。`recordMfaFailure()` 首先插入，然后计数，在事务之外，所以一连串的平行猜测不可能都看到低计数。存储接口的每种方法都在它的 doc 注释中给出了它的规则和它阻止的竞争。
- **尽力记录活动。**如果 `touchSession()` 失败（锁超时，只读副本），请求和注销仍然成功。会话被保留，`lastActiveAt` 不会移动，并且会话在其上一个截止日期空闲，除非稍后的请求记录了活动。每次故障都会发出 `session-touch-failed` 事件；当失败开始时，日志会收到一个警告，当失败继续时什么也没有，还有一行记录下一次成功触摸的计数。
- **表保持有界。**任何人都可以请求魔法链接或重置链接，因此每次保存都会删除已过期的内容，并且当表中超过 100,000 行待处理时，会删除最先过期的内容。过期的会话和刷新令牌族会随着新会话的写入而消失。
- **密码重置和电子邮件验证保持不变。**他们的链接现在是 `email_tokens` 中的行，他们的邮件发送者仍然通过 `@nestjs/mail` 发送。
- **生产拒绝记忆。**`NODE_ENV` 设置为 `production`，当配置的功能使用的存储未注册时，模块不会启动，并命名要实现的接口。每个功能只需要它使用的存储：`MfaStore` 仅与 `mfa`，和 `RefreshTokenStore` 仅与 `accessToken` 当刷新令牌打开时。[The store contract](/security/authentication#the-store-contract) 列出它们。您配置的功能都不使用的存储会在第一次读取时失败。`allowInMemoryStorage: true` 在模块中，选项无论如何都在内存中运行，但是每次重新启动或部署都会注销所有人，并忘记注册的身份验证器，并且实例不会共享任何身份验证器。

如果您的用户生活在同一个数据库中，`getSession()` 可以在同一查询中读取每个会话的用户，并将其作为 `extra`，其中 `SessionAuth` 的 `validate()` 接收：每个请求读取一次，而不是两次。键入它 `sessionExtra` 键旁边 `user`(`users` 和 `toUser()` 代表您自己的表和省略密码哈希的映射）：

```typescript
import type { User } from '../users/user.js';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
    sessionExtra: { user: User };
  }
}
```

```typescript
async getSession(id: string): Promise<SessionRecord | undefined> {
  // Joined fresh on every read. A session whose user is gone reads as unknown.
  const [row] = await this.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  return row && { ...withoutNulls(row.session), extra: { user: toUser(row.user) } };
}
```

```typescript
validate(session: SessionRecord) {
  return session.extra?.user ?? null;
}
```

`extra` 从不存储：`createSession()` 永远不会收到它，旋转会把它留在外面，`listUserSessions()` 不该设置。也没有暴露：`@CurrentSession()`,`request.session` 和 `AuthenticationContext.session` 在没有它的情况下携带会话，因此处理程序需要的任何内容都会进入用户 `validate()` 回报。不要将用户复制到会话行，而是加入它：当用户更改时，副本会过时。

该软件包将其规则作为测试发送。`authenticationStoreContract()` 来自 `@nestjs/authentication/testing` 返回适用于任何测试运行程序的测试用例，以及 `concurrent: true` 添加竞争：一个令牌的并行刷新、一个代码或链接的并行使用、失败代码的突发、一个请求的注销竞争、一个会话的并行删除以及一个注销或另一个轮换的轮换竞争。在 PGlite 上运行它们，在调用真正竞争的地方，在 PostgreSQL 上运行它们：

```typescript
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { AuthenticationStorage } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { sql } from 'drizzle-orm';
import { drizzle as nodePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as pglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import { DrizzleAuthenticationStore } from '../src/auth/drizzle-authentication.store.js';
import { startPostgres } from './support/postgres.js';

type Database = NodePgDatabase;

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** The store with a cap of 3 pending entries per table, so the suite can check it. */
class CappedStore extends DrizzleAuthenticationStore {
  protected override readonly maxPending = 3;
}

/** The store on empty tables, registered nowhere: the suite builds its own registry. */
async function emptyStore(db: Database) {
  await db.execute(
    sql`TRUNCATE sessions, refresh_tokens, mfa_authenticators, mfa_recovery_codes, mfa_failures, magic_links, oidc_logins, email_tokens`,
  );
  const store = new CappedStore(db, new AuthenticationStorage());
  return { sessions: store, refreshTokens: store, mfa: store, magicLinks: store, oidcStates: store, emailTokens: store };
}

describe('DrizzleAuthenticationStore on PGlite', () => {
  const client = new PGlite();
  const db = pglite(client) as unknown as Database;
  beforeAll(() => migratePglite(pglite(client), { migrationsFolder }));
  afterAll(() => client.close());

  for (const c of authenticationStoreContract(() => emptyStore(db), { concurrent: true, maxPending: 3 })) {
    it(c.name, c.run);
  }
});

// PostgreSQL on a pool of connections: the concurrency cases race for real.
const { postgres, reason } = await startPostgres();

describe.skipIf(!postgres)(`DrizzleAuthenticationStore on PostgreSQL${reason ? ` (skipped: ${reason})` : ''}`, () => {
  let pool: Pool;
  let db: Database;
  beforeAll(async () => {
    pool = new Pool({ connectionString: await postgres!.createDatabase('authentication_tutorial_store'), max: 10 });
    db = nodePostgres(pool);
    await migrateNodePostgres(db, { migrationsFolder });
  });
  afterAll(async () => {
    await pool?.end();
    postgres!.stop();
  });

  for (const c of authenticationStoreContract(() => emptyStore(db), { concurrent: true, maxPending: 3 })) {
    it(c.name, c.run);
  }
});
```

`CappedStore` 降低挂起行的上限，以便 `maxPending: 3` 可以检查一下。`startPostgres()` 是一个测试助手，它在 PostgreSQL 服务器上创建一次性数据库，或者跳过没有一次性数据库的 PostgreSQL 实例。读取一行然后将其写回的存储通过了其他测试，但未通过这些测试。

**与 TypeORM.**应用程序的同一存储 ORM 是 TypeORM，在同样的八张桌子上。Drizzle 坚持教程的路径：选择这个商店，而不是上面的商店，而不是它旁边。表是实体，每列都声明其类型，以便 TypeORMCLI，它在没有 decorator 元数据的情况下加载它们，看到的模式与应用程序相同：

```typescript
import type { EmailTokenPurpose, MfaState } from '@nestjs/authentication';
import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

// The authentication tables, read and written by TypeOrmAuthenticationStore: the same
// tables as the Drizzle schema in src/database/schema.ts. Every column states its type, so
// the entities load the same with or without emitted decorator metadata (the TypeORM CLI
// runs them through tsx, which emits none). Tokens, links and sessions are stored by their
// SHA-256; TOTP secrets arrive encrypted.

/** What a `jsonb` column holds: a column typed `unknown` doesn't fit TypeORM's insert types. */
export type Json = object | string | number | boolean | null;

@Entity('sessions')
@Index('sessions_user_id_idx', ['userId'])
@Index('sessions_expires_at_idx', ['expiresAt'])
export class SessionEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'last_active_at' })
  lastActiveAt: Date;

  @Column({ type: 'text', nullable: true })
  mfa: MfaState | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, Json> | null;
}

@Entity('refresh_tokens')
@Index('refresh_tokens_family_id_idx', ['familyId'])
@Index('refresh_tokens_user_id_idx', ['userId'])
@Index('refresh_tokens_family_expires_at_idx', ['familyExpiresAt'])
export class RefreshTokenEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', name: 'family_id' })
  familyId: string;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'family_expires_at' })
  familyExpiresAt: Date;

  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt: Date | null;

  // A family is revoked when any of its tokens is: that covers a successor saved after the revocation.
  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @Column({ type: 'jsonb', nullable: true })
  claims: Record<string, Json> | null;
}

@Entity('mfa_authenticators')
export class MfaAuthenticatorEntity {
  @PrimaryColumn({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  secret: string;

  @Column({ type: 'boolean' })
  confirmed: boolean;

  @Column({ type: 'text', name: 'pending_secret', nullable: true })
  pendingSecret: string | null;

  @Column({ type: 'integer', name: 'last_used_step', nullable: true })
  lastUsedStep: number | null;
}

@Entity('mfa_recovery_codes')
export class MfaRecoveryCodeEntity {
  @PrimaryColumn({ type: 'text', name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'text', name: 'code_hash' })
  codeHash: string;
}

@Entity('mfa_failures')
@Index('mfa_failures_user_id_failed_at_idx', ['userId', 'failedAt'])
@Index('mfa_failures_failed_at_idx', ['failedAt'])
export class MfaFailureEntity {
  @PrimaryGeneratedColumn('identity', { type: 'integer', generatedIdentity: 'ALWAYS' })
  id: number;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'timestamptz', name: 'failed_at' })
  failedAt: Date;
}

@Entity('magic_links')
@Index('magic_links_expires_at_idx', ['expiresAt'])
export class MagicLinkEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'text', name: 'redirect_to', nullable: true })
  redirectTo: string | null;
}

@Entity('oidc_logins')
@Index('oidc_logins_expires_at_idx', ['expiresAt'])
export class OidcLoginEntity {
  @PrimaryColumn({ type: 'text' })
  state: string;

  @Column({ type: 'text' })
  provider: string;

  @Column({ type: 'text', name: 'code_verifier' })
  codeVerifier: string;

  @Column({ type: 'text', nullable: true })
  nonce: string | null;

  @Column({ type: 'text', name: 'redirect_to', nullable: true })
  redirectTo: string | null;

  // Set for "connect your Google account" from a signed-in session.
  @Column({ type: 'text', name: 'link_user_id', nullable: true })
  linkUserId: string | null;

  @Column({ type: 'text', name: 'link_session_id', nullable: true })
  linkSessionId: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}

@Entity('email_tokens')
@Index('email_tokens_user_id_purpose_idx', ['userId', 'purpose'])
@Index('email_tokens_expires_at_idx', ['expiresAt'])
export class EmailTokenEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  purpose: EmailTokenPurpose;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text', nullable: true })
  fingerprint: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}
```

这个 TypeORMCLI 和 `TypeOrmModule` 在数据源文件中共享一组选项：

```typescript
import { DataSource, type DataSourceOptions } from 'typeorm';
import {
  EmailTokenEntity,
  MagicLinkEntity,
  MfaAuthenticatorEntity,
  MfaFailureEntity,
  MfaRecoveryCodeEntity,
  OidcLoginEntity,
  RefreshTokenEntity,
  SessionEntity,
} from './authentication.entities.js';
import { Authentication1790235914534 } from './migrations/1790235914534-Authentication.js';

/** What the application's TypeOrmModule and the TypeORM CLI share. */
export const dataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    SessionEntity,
    RefreshTokenEntity,
    MfaAuthenticatorEntity,
    MfaRecoveryCodeEntity,
    MfaFailureEntity,
    MagicLinkEntity,
    OidcLoginEntity,
    EmailTokenEntity,
  ],
  migrations: [Authentication1790235914534],
} satisfies DataSourceOptions;

// The TypeORM CLI's data source: `migration:generate` compares the entities with this database.
export default new DataSource(dataSourceOptions);
```

根据应用了以前迁移的数据库，从实体生成迁移，应用它，并检查实体和数据库是否一致。CLI 需要一个 TypeScript 加载器来加载数据源文件；这使用 `tsx`：

```bash
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Authentication -d src/typeorm/data-source.ts --pretty
Migration /store/src/typeorm/migrations/1790235914534-Authentication.ts has been generated successfully.
$ npx tsx ./node_modules/typeorm/cli.js migration:run -d src/typeorm/data-source.ts
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Check -d src/typeorm/data-source.ts --check
No changes in database schema were found
```

它写的迁移，`1790235914534-Authentication.ts`，是 `CREATE TABLE` 和 `CREATE INDEX` 上述八个表格的陈述，以及 `migrations` 数据源中列出了它。现在商店，在相同的规则下 Drizzle 一：

```typescript
import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type EmailTokenPurpose,
  type EmailTokenRecord,
  type EmailTokenStore,
  type MagicLinkRecord,
  type MagicLinkStore,
  type MfaStore,
  type OidcStateStore,
  type OidcTransaction,
  type RefreshTokenRecord,
  type RefreshTokenStore,
  type SessionRecord,
  type SessionStore,
  type TotpRecord,
} from '@nestjs/authentication';
import {
  DataSource,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  Or,
  type EntityTarget,
  type FindOptionsWhere,
  type ObjectLiteral,
} from 'typeorm';
import {
  EmailTokenEntity,
  MagicLinkEntity,
  MfaAuthenticatorEntity,
  MfaFailureEntity,
  MfaRecoveryCodeEntity,
  OidcLoginEntity,
  RefreshTokenEntity,
  SessionEntity,
  type Json,
} from './authentication.entities.js';

/**
 * Keeps sessions, refresh tokens, authenticators and pending links in
 * PostgreSQL, through TypeORM: the Drizzle store above, on the same
 * tables. Every method that decides whether something works once is a
 * single conditional statement, so the guarantees hold with any number of
 * API instances.
 */
@Injectable()
export class TypeOrmAuthenticationStore
  implements SessionStore, RefreshTokenStore, MfaStore, MagicLinkStore, OidcStateStore, EmailTokenStore
{
  /** Pending links and logins kept per table: anyone can create them. */
  protected readonly maxPending: number = 100_000;

  constructor(
    private readonly dataSource: DataSource,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({
      sessions: this,
      refreshTokens: this,
      mfa: this,
      magicLinks: this,
      oidcStates: this,
      emailTokens: this,
    });
  }

  private get manager() {
    return this.dataSource.manager;
  }

  // Sessions

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const row = await this.manager.findOneBy(SessionEntity, { id });
    return row ? withoutNulls(row) : undefined;
  }

  async createSession(record: SessionRecord): Promise<void> {
    // JSON-safe: the package stores what `session.metadata` returned, as JSON.
    const metadata = (record.metadata ?? null) as Record<string, Json> | null;
    await this.manager.insert(SessionEntity, { ...record, mfa: record.mfa ?? null, metadata });
    await this.manager.delete(SessionEntity, { expiresAt: LessThanOrEqual(record.createdAt) });
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    // Conditional: a session deleted by a sign-out stays deleted.
    await this.manager.update(SessionEntity, { id, lastActiveAt: LessThan(lastActiveAt) }, { lastActiveAt });
  }

  // Whether this call deleted it: of two rotations of a session, or a rotation and a sign-out, one wins.
  async deleteSession(id: string): Promise<boolean> {
    const { affected } = await this.manager.delete(SessionEntity, { id });
    return (affected ?? 0) > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.manager.findBy(SessionEntity, { userId });
    return rows.map(withoutNulls);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.manager.delete(SessionEntity, { userId });
  }

  // Refresh tokens

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const row = await this.manager.findOneBy(RefreshTokenEntity, { id });
    if (!row) {
      return undefined;
    }
    const { revoked: _, ...token } = row;
    return withoutNulls(token);
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    const claims = (record.claims ?? null) as Record<string, Json> | null;
    await this.manager.insert(RefreshTokenEntity, { ...record, usedAt: record.usedAt ?? null, claims });
    await this.manager.delete(RefreshTokenEntity, { familyExpiresAt: LessThanOrEqual(record.createdAt) });
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    // Conditional: of two refreshes with the same token, one updates the row.
    const { affected } = await this.manager.update(RefreshTokenEntity, { id, usedAt: IsNull() }, { usedAt: at });
    return affected === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.manager.update(RefreshTokenEntity, { familyId }, { revoked: true });
  }

  isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    return this.manager.existsBy(RefreshTokenEntity, { familyId, revoked: true });
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await this.manager.update(RefreshTokenEntity, { userId }, { revoked: true });
  }

  // Authenticators, recovery codes and failed attempts

  async getTotp(userId: string): Promise<TotpRecord | undefined> {
    const row = await this.manager.findOneBy(MfaAuthenticatorEntity, { userId });
    if (!row) {
      return undefined;
    }
    const { userId: _, ...totp } = row;
    return withoutNulls(totp);
  }

  async saveTotp(userId: string, record: TotpRecord | null): Promise<void> {
    if (!record) {
      await this.manager.delete(MfaAuthenticatorEntity, { userId });
      return;
    }
    // An upsert that never lowers the claimed step: the record may have been read before a
    // claim. GREATEST() over the conflicting row is beyond the upsert API, so this one is SQL.
    await this.manager.query(
      `INSERT INTO mfa_authenticators (user_id, secret, confirmed, pending_secret, last_used_step)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         secret = EXCLUDED.secret,
         confirmed = EXCLUDED.confirmed,
         pending_secret = EXCLUDED.pending_secret,
         last_used_step = GREATEST(mfa_authenticators.last_used_step, EXCLUDED.last_used_step)`,
      [userId, record.secret, record.confirmed, record.pendingSecret ?? null, record.lastUsedStep ?? null],
    );
  }

  async claimTotpStep(userId: string, step: number): Promise<boolean> {
    // Conditional: a code's time step is accepted once.
    const { affected } = await this.manager.update(
      MfaAuthenticatorEntity,
      { userId, lastUsedStep: Or(IsNull(), LessThan(step)) },
      { lastUsedStep: step },
    );
    return affected === 1;
  }

  async saveRecoveryCodes(userId: string, hashes: string[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(MfaRecoveryCodeEntity, { userId });
      if (hashes.length > 0) {
        await manager.insert(MfaRecoveryCodeEntity, [...new Set(hashes)].map((codeHash) => ({ userId, codeHash })));
      }
    });
  }

  async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    // Conditional: of two requests with the same code, one deletes the row.
    const { affected } = await this.manager.delete(MfaRecoveryCodeEntity, { userId, codeHash: hash });
    return affected === 1;
  }

  countRecoveryCodes(userId: string): Promise<number> {
    return this.manager.countBy(MfaRecoveryCodeEntity, { userId });
  }

  async recordMfaFailure(userId: string, windowMs: number, now: number): Promise<number> {
    // Insert, then count, each committed on its own (no transaction): every attempt
    // counts itself and all those recorded before it.
    await this.manager.insert(MfaFailureEntity, { userId, failedAt: new Date(now) });
    const failures = await this.countMfaFailures(userId, windowMs, now);
    await this.manager.delete(MfaFailureEntity, { failedAt: LessThanOrEqual(new Date(now - windowMs)) });
    return failures;
  }

  countMfaFailures(userId: string, windowMs: number, now: number): Promise<number> {
    return this.manager.countBy(MfaFailureEntity, { userId, failedAt: MoreThan(new Date(now - windowMs)) });
  }

  async clearMfaFailures(userId: string): Promise<void> {
    await this.manager.delete(MfaFailureEntity, { userId });
  }

  // Magic links

  async saveMagicLink(record: MagicLinkRecord): Promise<void> {
    await this.manager.insert(MagicLinkEntity, { ...record, redirectTo: record.redirectTo ?? null });
    await this.trim(MagicLinkEntity, record.createdAt);
  }

  async consumeMagicLink(id: string): Promise<MagicLinkRecord | undefined> {
    // DELETE … RETURNING: of two requests with the same link, one gets the row.
    const [row] = await this.deleteReturning(MagicLinkEntity, { id });
    return row && withoutNulls(row);
  }

  // Sign-ins with Google in progress

  async saveOidcState({ link, ...login }: OidcTransaction): Promise<void> {
    await this.manager.insert(OidcLoginEntity, {
      ...login,
      nonce: login.nonce ?? null,
      redirectTo: login.redirectTo ?? null,
      linkUserId: link?.userId ?? null,
      linkSessionId: link?.sessionId ?? null,
    });
    await this.trim(OidcLoginEntity, login.createdAt);
  }

  async consumeOidcState(state: string): Promise<OidcTransaction | undefined> {
    const [row] = await this.deleteReturning(OidcLoginEntity, { state });
    if (!row) {
      return undefined;
    }
    const { linkUserId, linkSessionId, ...login } = withoutNulls(row);
    return linkUserId && linkSessionId ? { ...login, link: { userId: linkUserId, sessionId: linkSessionId } } : login;
  }

  // Password reset and email verification links

  async saveEmailToken(record: EmailTokenRecord): Promise<void> {
    await this.manager.insert(EmailTokenEntity, { ...record, fingerprint: record.fingerprint ?? null });
    await this.trim(EmailTokenEntity, record.createdAt);
  }

  async consumeEmailToken(id: string, purpose: EmailTokenPurpose): Promise<EmailTokenRecord | undefined> {
    const [row] = await this.deleteReturning(EmailTokenEntity, { id, purpose });
    return row && withoutNulls(row);
  }

  async deleteUserEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
    await this.manager.delete(EmailTokenEntity, { userId, purpose });
  }

  /** `DELETE … RETURNING *`, as rows of the entity: the query builder returns raw column names. */
  private async deleteReturning<T extends ObjectLiteral>(entity: EntityTarget<T>, where: FindOptionsWhere<T>): Promise<T[]> {
    const { raw } = await this.manager.createQueryBuilder().delete().from(entity).where(where).returning('*').execute();
    const columns = this.dataSource.getMetadata(entity).columns;
    return (raw as Record<string, unknown>[]).map(
      (row) => Object.fromEntries(columns.map((column) => [column.propertyName, row[column.databaseName]])) as T,
    );
  }

  /** Deletes what expired, and past `maxPending`, what expires first. */
  private async trim<T extends { expiresAt: Date }>(entity: EntityTarget<T>, now: Date) {
    await this.manager.delete(entity, { expiresAt: LessThanOrEqual(now) } as FindOptionsWhere<T>);
    const [cutoff] = await this.manager.find(entity, {
      select: { expiresAt: true } as never,
      order: { expiresAt: 'DESC' } as never,
      skip: this.maxPending,
      take: 1,
    });
    if (cutoff) {
      await this.manager.delete(entity, { expiresAt: LessThanOrEqual(cutoff.expiresAt) } as FindOptionsWhere<T>);
    }
  }
}

/** A row without its NULL columns: the package's records leave optional fields out. */
type WithoutNulls<T> = { [K in keyof T as null extends T[K] ? never : K]: T[K] } & {
  [K in keyof T as null extends T[K] ? K : never]?: Exclude<T[K], null>;
};

function withoutNulls<T extends object>(row: T): WithoutNulls<T> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)) as WithoutNulls<T>;
}
```

- **条件更新和删除**将条件置于 `update()` 和 `delete()`，与 `LessThan()`, `IsNull()` 和 `Or()`，并阅读 `affected`.从不 `save()`：它将写回注销刚刚删除的会话。
- **`saveTotp()`**在冲突行上与 `GREATEST()` 保持较大的时间步长，upsertAPI 无法表达，因此它是写成 SQL 的唯一语句，直到 `manager.query()`。
- **`consume` 方法**是带有 `returning('*')` 的删除查询生成器。它返回数据库列名下的原始行，因此 `deleteReturning()` 通过实体元数据将它们映射回实体属性。
- **`recordMfaFailure()`**是 `dataSource.manager` 上的两个语句，每个语句都单独提交，`saveRecoveryCodes()` 是 `dataSource.transaction()` 中的一个方法。
- **用它**代替 Drizzle 商店： `TypeOrmModule.forRoot(dataSourceOptions)` 在 `AppModule` 而不是 `DrizzleModule`，和 `TypeOrmAuthenticationStore` 在提供者中 `AuthModule` 而不是 `DrizzleAuthenticationStore`.它注入 `DataSource` 那个 `TypeOrmModule` 提供。

合同套件在其上运行不变。TypeORM 通过 `pg`，因此该套件需要一个 PostgreSQL 服务器，如果没有 PostgreSQL 服务器，将被跳过。另外两个案例检查实体和迁移是否一致（什么 `migration:generate --check` 检查），并且当在模块中提供时，商店注册了所有六份合同：

```typescript
/**
 * TypeOrmAuthenticationStore against the package's contract suite
 * (`@nestjs/authentication/testing`), on PostgreSQL (the server in
 * SQL_TEST_PG_URL, else a throwaway local cluster; see test/support/postgres.ts),
 * with the migration the TypeORM CLI generated. A pool, so the concurrency
 * cases race for real. Skipped, with the reason, without a server.
 */
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticationModule, AuthenticationStorage } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/typeorm/data-source.js';
import { TypeOrmAuthenticationStore } from '../src/typeorm/typeorm-authentication.store.js';
import { startPostgres } from './support/postgres.js';

/** The store with a cap of 3 pending entries per table, so the suite can check it. */
class CappedStore extends TypeOrmAuthenticationStore {
  protected override readonly maxPending = 3;
}

const { postgres, reason } = await startPostgres();

describe.skipIf(!postgres)(`TypeOrmAuthenticationStore on PostgreSQL${reason ? ` (skipped: ${reason})` : ''}`, () => {
  let dataSource: DataSource;
  let url: string;

  beforeAll(async () => {
    url = await postgres!.createDatabase('authentication_tutorial_typeorm_store');
    dataSource = await new DataSource({ ...dataSourceOptions, url, poolSize: 10 }).initialize();
    await dataSource.runMigrations();
  });
  afterAll(async () => {
    await dataSource?.destroy();
    postgres!.stop();
  });

  /** The store on empty tables, registered nowhere: the suite builds its own registry. */
  async function emptyStore() {
    await dataSource.query(
      'TRUNCATE sessions, refresh_tokens, mfa_authenticators, mfa_recovery_codes, mfa_failures, magic_links, oidc_logins, email_tokens',
    );
    const store = new CappedStore(dataSource, new AuthenticationStorage());
    return { sessions: store, refreshTokens: store, mfa: store, magicLinks: store, oidcStates: store, emailTokens: store };
  }

  for (const c of authenticationStoreContract(emptyStore, { concurrent: true, maxPending: 3 })) {
    it(c.name, c.run);
  }

  it('has a migration that matches the entities (what `migration:generate --check` checks)', async () => {
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
    expect(upQueries.map((query) => query.query)).toEqual([]);
  });

  it('registers itself for every contract when provided in a module', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const app = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot({ ...dataSourceOptions, url }), AuthenticationModule.forRoot()],
      providers: [TypeOrmAuthenticationStore],
    }).compile();
    await app.init();
    const storage = app.get(AuthenticationStorage);
    const store = app.get(TypeOrmAuthenticationStore);
    expect([storage.sessions, storage.refreshTokens, storage.mfa, storage.magicLinks, storage.oidcStates, storage.emailTokens]).toEqual(
      Array(6).fill(store),
    );
    expect(log).toHaveBeenCalledWith('AuthenticationStorage: TypeOrmAuthenticationStore');
    log.mockRestore();
    await app.close();
  });
});
```

> info **Hint** 使用 Prisma？[The store contract](/security/authentication#the-store-contract)，在教程之后，列出了每个合同必须保证的内容以及 Prisma 如何表达原子方法。针对相同的情况测试您的商店。

#### 发布 API 合作伙伴的钥匙

猫收容所和宠物店从他们自己的库存系统中大量进货，一些顾客用脚本重新订购。脚本不能填写登录表单，每次使用都会发生变化的刷新令牌不太适合夜间工作。给他们 API 相反，密钥：客户在 web 应用程序中创建并在不再需要时撤销的长期秘密。脚本将其密钥作为承载令牌发送，并充当创建它的客户。

包检查密钥，您的数据库保存它们。向架构添加表：

```typescript
// API keys (src/auth/api-key-auth.provider.ts): the SHA-256 of each key, never the key.
export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    hash: text('hash').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
  },
  (table) => [index('api_keys_user_id_idx').on(table.userId)],
);
```

生成其迁移，并应用它（输出被修剪）：

```bash
$ npx drizzle-kit generate --name=api_keys
...
9 tables
api_keys 5 columns 1 indexes 0 fks
...
[✓] Your SQL migration file ➜ drizzle/0001_api_keys.sql 🚀
$ npx drizzle-kit migrate
...
[✓] migrations applied successfully!
```

第三凭证提供者扩展 `ApiKeyProvider`，并做一件事：它通过它的 id 找到一个密钥。

```typescript
import { Injectable } from '@nestjs/common';
import { ApiKeyProvider, AuthenticationRegistry } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { apiKeys } from '../database/schema.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class ApiKeyAuth extends ApiKeyProvider<User> {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    // Keys look like cat_<id>_<secret>. The prefix tells secret scanners what they found.
    super({ prefix: 'cat', realm: 'store' });
    // Third in the chain, after SessionAuth and JwtAuth.
    registry.registerProvider(this, { order: 2 });
  }

  // Called with the id part of a key; the provider then checks the hash and the expiry.
  // Returning null (no such key, or its owner was deleted) rejects the key.
  async findKey(id: string) {
    const [key] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id));
    const user = key && (await this.usersRepository.findById(key.userId));
    return user ? { hash: key.hash, user, expiresAt: key.expiresAt } : null;
  }
}
```

密钥读取 `cat_<id>_<secret>`：前缀、16 个十六进制字符的公共 id 和 256 个随机位的秘密。`findKey()` 查找 id，提供程序完成剩下的工作。它比较 SHA-256 整个密钥与存储 `hash`，在恒定时间内，对不存在的 id 进行相同的工作，并拒绝从 `expiresAt` 在。像密码脚本这样的缓慢散列在这里不会添加任何东西，因为没有人猜测 256 位随机位，它会减慢每个请求的速度。错误、过期或被撤销的密钥将获得 401`error="invalid_token"` 就像一个坏的访问令牌。

`JwtAuth` 读起来一样 `Authorization` 头球。一个 JWT 总是包含两个点，而一个键不包含任何点，因此 `JwtAuth` 将钥匙留给 `ApiKeyAuth`，两者中的哪一个先运行。没有凭据的请求仍然会受到单一质询，`Bearer realm="store"`，因为两个提供程序使用相同的领域。

现在创建、列出和撤销密钥的端点：

```typescript
import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { apiKeys } from '../database/schema.js';
import { ApiKeyAuth } from './api-key-auth.provider.js';
import { SessionAuth } from './session-auth.provider.js';

const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

// Managed from the web app, signed in with a session: a key can't create or revoke keys.
@Authenticate({ providers: [SessionAuth] })
@Controller('auth/api-keys')
export class ApiKeysController {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly apiKeyAuth: ApiKeyAuth,
  ) {}

  // The only response that contains the key: the table keeps its hash.
  @Post()
  async create(@CurrentUser('id') userId: string) {
    const { key, id, hash } = this.apiKeyAuth.generate();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ONE_YEAR);
    await this.db.insert(apiKeys).values({ id, userId, hash, createdAt, expiresAt });
    return { id, key, createdAt, expiresAt };
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.db
      .select({ id: apiKeys.id, createdAt: apiKeys.createdAt, expiresAt: apiKeys.expiresAt })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));
  }

  // Revoked from the next request on. Another customer's key is a 404.
  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const revoked = await this.db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .returning();
    if (revoked.length === 0) {
      throw new NotFoundException();
    }
  }
}
```

- `generate()` 返回密钥、它的 id 和它的散列。表存储 id 和散列，因此 `create` 是唯一一次有人看到钥匙。丢失密钥的客户撤销它并创建另一个密钥。
- 控制器接受 `SessionAuth` 单独，因此密钥是从 web 应用程序管理的。在下面 `providers`，任何其他提供程序的凭据都算作无：泄露的密钥不能创建更多的密钥，也不能撤销其所有者的密钥。
- 钥匙会在一年后过期，所以忘记的钥匙不会永远有效。删除密钥行会从下一个请求中撤销它。

在 `AuthModule` 中注册两者：

```typescript
import { ApiKeyAuth } from './api-key-auth.provider.js';
import { ApiKeysController } from './api-keys.controller.js';
// ...
controllers: [
  // ...
  SessionsController,
  ApiKeysController,
],
providers: [
  // ...
  DrizzleAuthenticationStore,
  ApiKeyAuth,
],
```

在每条没有命名其提供者的路由上，一个密钥将其所有者登录， `POST /orders` 包括在内。它从来不算作第二个因素： `PATCH /me/email` 用 `mfa_required`，因为它响应尚未传递代码的会话。若要保留通往或远离密钥的路由，请列出该路由接受的提供程序 `@Authenticate()`.在处理程序中， `@CurrentSession()` 拿着钥匙 `keyId`，与 `method` 设置为 `api-key`，因此审计日志可以说明哪个键下了订单。只能读取或只能排序的键是一个权限问题，这是什么 [`@nestjs/authorization`](/security/authorization) 是为了。

**与 TypeORM.**表是一个实体，位于存储的实体旁边：

```typescript
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// The api_keys table of src/database/schema.ts, for an application on TypeORM.
@Entity('api_keys')
@Index('api_keys_user_id_idx', ['userId'])
export class ApiKeyEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  hash: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}
```

在数据源的 `entities` 中列出它，并在 `migrations` 中为存储的表生成它的迁移。`findKey()` 使用 `findOneBy()` 通过实体的存储库读取该行，控制器使用 `insert()` 和 `delete()` 写入该行。

#### 试试

应用 [迁移](/security/authentication#keep-sessions-and-tokens-in-your-database)，并使用 `.env` 上一节中的文件：

```bash
$ npm run start:dev -- --env-file .env
```

在另一个终端，注册。这个 `-c` 标志将会话 cookie 保存到文件中，并且 `-b` 将其与以后的请求一起发送。`--json`（curl 7.82 或更高版本）发送 `POST` 用一个 JSON 身体。此处和下方修剪了响应头：

```bash
$ curl -i localhost:3000/auth/sign-up -c ada.txt --json '{"email":"ada@example.com","password":"correct horse battery"}'
HTTP/1.1 201 Created
Set-Cookie: __Host-sid=q0L7c...; Max-Age=1209600; Path=/; HttpOnly; Secure; SameSite=Lax
{"id":"7b5d3c2e-...","email":"ada@example.com","emailVerified":false,"roles":["customer"]}
```

会话和挂起的验证链接现在是 PostgreSQL 中的行。会话的 id 是 SHA-256 cookie 的哈希值，并且根本不存储链接的令牌：

```bash
$ psql "$DATABASE_URL" -c "SELECT user_id, mfa, metadata FROM sessions" -c "SELECT purpose, email FROM email_tokens"
               user_id                | mfa |          metadata
--------------------------------------+-----+-----------------------------
 7b5d3c2e-...                         |     | {"userAgent": "curl/8.7.1"}
(1 row)

      purpose       |      email
--------------------+-----------------
 email-verification | ada@example.com
(1 row)
```

验证电子邮件出现在应用程序的日志中（`LogMailTransport` 打印每封电子邮件的文本）：

```bash
LOG [LogMailTransport] "Confirm your email address" to ada@example.com
DEBUG [LogMailTransport] Confirm the email address of your store account:

Confirm my address (http://localhost:3000/verify-email?token=Vb3x...)

If you didn't create an account, ignore this email.
```

cookie 登录了 Ada，但她的地址没有被验证，所以她还不能下订单。像验证页面那样发送令牌，订单就会通过。没有饼干，API 答案 401：

```bash
$ curl localhost:3000/me -b ada.txt
{"id":"7b5d3c2e-...","email":"ada@example.com","emailVerified":false,"roles":["customer"]}

$ curl localhost:3000/orders -b ada.txt --json '{"items":[{"productId":"salmon-kibble-2kg","quantity":1}]}'
{"message":"Email address not verified","error":"email_unverified","statusCode":403,"errorCode":"email_unverified"}

$ curl localhost:3000/auth/email/verify --json '{"token":"Vb3x..."}'
{"email":"ada@example.com","emailVerified":true}

$ curl localhost:3000/orders -b ada.txt --json '{"items":[{"productId":"salmon-kibble-2kg","quantity":1}]}'
{"id":"f3a1...","userId":"7b5d3c2e-...","items":[{"productId":"salmon-kibble-2kg","quantity":1}],"total":2499,"status":"pending"}

$ curl -i localhost:3000/orders
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="store"
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}
```

以移动应用程序的身份登录，并使用访问令牌。下面的命令使用 [jq](https://jqlang.org/) 要提取令牌：

```bash
$ TOKENS=$(curl -s localhost:3000/auth/token --json '{"email":"ada@example.com","password":"correct horse battery"}')
$ echo $TOKENS
{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","refreshToken":"Qm4x...","expiresIn":900}
$ ACCESS=$(echo $TOKENS | jq -r .accessToken) REFRESH=$(echo $TOKENS | jq -r .refreshToken)

$ curl localhost:3000/orders -H "Authorization: Bearer $ACCESS"
[{"id":"f3a1...","userId":"7b5d3c2e-...","items":[{"productId":"salmon-kibble-2kg","quantity":1}],"total":2499,"status":"pending"}]
```

刷新令牌工作一次。使用相同令牌的第二次尝试将被视为盗窃，并撤销整个家族：

```bash
$ curl localhost:3000/auth/token/refresh --json "{\"refreshToken\":\"$REFRESH\"}"
{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","refreshToken":"n8Vb...","expiresIn":900}

$ curl localhost:3000/auth/token/refresh --json "{\"refreshToken\":\"$REFRESH\"}"
{"message":"Refresh token reused","error":"Unauthorized","statusCode":401}
```

打开双因素身份验证。将秘密添加到身份验证器应用程序中，并用它显示的代码进行确认。代码证明此浏览器具有身份验证器，因此从这里开始，在一个新的 cookie 下验证会话（`-c` 保存它）：

```bash
$ curl -X POST localhost:3000/auth/mfa/enroll -b ada.txt
{"secret":"MZXW6YTBOI3DGNJS...","uri":"otpauth://totp/example.com:ada%40example.com?secret=MZXW6YTBOI3DGNJS...&issuer=example.com&algorithm=SHA1&digits=6&period=30"}

$ curl -i localhost:3000/auth/mfa/confirm -b ada.txt -c ada.txt --json '{"code":"492039"}'
HTTP/1.1 200 OK
Set-Cookie: __Host-sid=Kp4w...; Max-Age=1209571; Path=/; HttpOnly; Secure; SameSite=Lax
{"recoveryCodes":["7KQ2M-XR4PB","HT9WC-3MDNA","..."]}
```

> info **Hint** 和 [oath-toolkit](https://www.nongnu.org/oath-toolkit/) 已安装，`oathtool --totp -b` 随后秘密打印终端中的当前代码。

再次登录。新会话处于挂起状态，直到它通过第二个因素，验证将替换 cookie：

```bash
$ curl localhost:3000/auth/sign-in -b ada.txt -c ada.txt --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"mfaRequired":true}

$ curl localhost:3000/me -b ada.txt
{"message":"Second factor required","error":"mfa_required","statusCode":401,"errorCode":"mfa_required"}

$ curl localhost:3000/auth/mfa/verify -b ada.txt -c ada.txt --json '{"code":"815224"}'
{"mfa":"verified"}

$ curl -X PATCH localhost:3000/me/email -b ada.txt --json '{"email":"ada.lovelace@example.com"}'
{"id":"7b5d3c2e-...","email":"ada.lovelace@example.com","emailVerified":false,"roles":["customer"]}
```

新地址未经验证，验证电子邮件将发送到该地址：

```bash
LOG [LogMailTransport] "Confirm your email address" to ada.lovelace@example.com
```

移动应用程序也需要一个代码：

```bash
$ curl localhost:3000/auth/token --json '{"email":"ada.lovelace@example.com","password":"correct horse battery"}'
{"message":"Second factor required","error":"mfa_required","statusCode":401,"errorCode":"mfa_required"}
```

启动谷歌登录。卷曲显示重定向；打开相同的 URL 在浏览器中完成它，然后您登陆 `/orders`，已登录：

```bash
$ curl -i 'localhost:3000/auth/oidc/google/login?redirectTo=/orders'
HTTP/1.1 302 Found
Set-Cookie: __Host-oidc_tx=Zq8...; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax
Location: https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=...&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Foidc%2Fgoogle%2Fcallback&scope=openid+email+profile&state=pW4c...&code_challenge=...&code_challenge_method=S256&nonce=...
```

格蕾丝，给新客户要个神奇的链接。该链接仅在请求它的浏览器中有效，因此请保留 cookie 作为响应集。该电子邮件将出现在应用程序的日志中：

```bash
$ curl -i localhost:3000/auth/magic-link -c grace.txt --json '{"email":"grace@example.com"}'
HTTP/1.1 202 Accepted
Set-Cookie: __Host-magic_link_tx=Vn3p...; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=Lax
```

```bash
LOG [LogMailTransport] "Your sign-in link" to grace@example.com
DEBUG [LogMailTransport] Sign in to the store (http://localhost:3000/sign-in/magic?token=Hq2x...)

The link works once, for 15 minutes. If you didn't ask for it, ignore this email.
```

像页面一样用 cookie 发送令牌。Grace 获得一个帐户、一个经过验证的地址和一个会话：

```bash
$ curl localhost:3000/auth/magic-link/consume -b grace.txt -c grace.txt --json '{"token":"Hq2x..."}'
{"redirectTo":"/","mfaRequired":false}

$ curl localhost:3000/me -b grace.txt
{"id":"c41e9a07-...","email":"grace@example.com","emailVerified":true,"roles":["customer"]}
```

格蕾丝经营一家猫收容所，其库存系统重新排序猫砂。从她的会话中为它创建一个密钥，并使用该密钥下订单。密钥无法创建密钥，一旦 Grace 撤销它，它就会停止工作：

```bash
$ API_KEY=$(curl -s -X POST localhost:3000/auth/api-keys -b grace.txt)
$ echo $API_KEY
{"id":"d2cb7a64f3279c6b","key":"cat_d2cb7a64f3279c6b_QiBr...","createdAt":"2026-09-22T10:02:41.067Z","expiresAt":"2027-09-22T10:02:41.067Z"}
$ KEY=$(echo $API_KEY | jq -r .key) KEY_ID=$(echo $API_KEY | jq -r .id)

$ curl localhost:3000/orders -H "Authorization: Bearer $KEY" --json '{"items":[{"productId":"clumping-litter-10l","quantity":20}]}'
{"id":"db8a...","userId":"c41e9a07-...","items":[{"productId":"clumping-litter-10l","quantity":20}],"total":31980,"status":"pending"}

$ curl -X POST localhost:3000/auth/api-keys -H "Authorization: Bearer $KEY"
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}

$ curl -i -X DELETE localhost:3000/auth/api-keys/$KEY_ID -b grace.txt
HTTP/1.1 204 No Content

$ curl -i localhost:3000/orders -H "Authorization: Bearer $KEY"
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="store", error="invalid_token", error_description="invalid api key"
{"message":"invalid api key","error":"Unauthorized","statusCode":401}
```

列出艾达的疗程，然后在任何地方都给她签名。她的旧饼干停止工作了：

```bash
$ curl localhost:3000/auth/sessions -b ada.txt
[{"id":"eT0r...","createdAt":"2026-09-22T10:02:11.042Z","lastActiveAt":"2026-09-22T10:03:30.518Z","userAgent":"curl/8.7.1","current":true}]

$ curl -i -X POST localhost:3000/auth/sign-out-everywhere -b ada.txt
HTTP/1.1 204 No Content
Set-Cookie: __Host-sid=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax

$ curl localhost:3000/me -b ada.txt
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}
```

艾达忘记密码了。要求她的地址和没有人注册的地址的重置链接：两者都得到相同的空 202，只有 Ada 得到一封电子邮件：

```bash
$ curl -i localhost:3000/auth/password/forgot --json '{"email":"ada.lovelace@example.com"}'
HTTP/1.1 202 Accepted

$ curl -i localhost:3000/auth/password/forgot --json '{"email":"nobody@example.com"}'
HTTP/1.1 202 Accepted
```

```bash
LOG [LogMailTransport] "Reset your password" to ada.lovelace@example.com
DEBUG [LogMailTransport] Someone asked to reset the password of your store account.

Choose a new password (http://localhost:3000/reset-password?token=Rt7k...)

The link works once, for an hour. If it wasn't you, ignore this email: your password stays as it is.
```

选择带有令牌的新密码，就像重置页面一样。Ada 再次登录，等待她的第二个因素（一个待定会话持续十分钟，`mfa.pendingTtl`，因此 `Max-Age`），旧密码不再有效：

```bash
$ curl -i localhost:3000/auth/password/reset -c ada.txt --json '{"token":"Rt7k...","password":"a brand new passphrase"}'
HTTP/1.1 200 OK
Set-Cookie: __Host-sid=Yb2d...; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax
{"mfaRequired":true}

$ curl localhost:3000/auth/sign-in --json '{"email":"ada.lovelace@example.com","password":"correct horse battery"}'
{"message":"Invalid email or password","error":"Unauthorized","statusCode":401}
```

最后，猜猜格蕾丝的密码。15 分钟内的第六次尝试在检查密码之前被拒绝：

```bash
$ for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' localhost:3000/auth/sign-in --json '{"email":"grace@example.com","password":"password123"}'; done
401 401 401 401 401 429
```

#### GraphQL 和 WebSocket

全球卫士，`@Public()`,`@CurrentUser()` 和 `AuthenticationContext` 工作于 GraphQL 解析器和 WebSocket 网关也是如此。守卫从携带它们的请求中读取 cookie 和标头。

在 GraphQL 这就是 `req` 在 GraphQL 上下文，所以 `context` 选项必须是为每个请求构建上下文的函数。一个 `context` 给定一个对象，每个请求都有一个对象，应用程序在启动时失败。 Nest 仅在根解析器上运行全局防护和拦截器：也可以保护现场解析器，并给它们 `AuthenticationContext`,添加 `fieldResolverEnhancers: ['guards', 'interceptors']`.

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  subscriptions: { 'graphql-ws': true },
  // Over graphql-ws there is no request per operation: the upgrade request stands in for it.
  context: ({ req, res, extra }) => ({ req: req ?? extra?.request, res }),
  fieldResolverEnhancers: ['guards', 'interceptors'],
}),
```

超过 `graphql-ws` 套接字上的每个操作都共享升级请求，并且需要用户的每个操作都使用其 cookie 再次进行身份验证，因此到处注销会阻止下一个操作。`@CurrentUser()` 为每个操作提供自己的用户，以及 `null` 到一个 `@Public()` 一。`req.user`，该模块还为读取请求的代码设置，保存最后经过身份验证的操作：read`@CurrentUser()` 反而。

Nest 不会在网关的 `handleConnection()` 上运行保护，因此请使用 `WsAuthenticator` 验证握手：

```typescript
import type { IncomingMessage } from 'node:http';
import { WebSocketGateway, type OnGatewayConnection } from '@nestjs/websockets';
import { WsAuthenticator } from '@nestjs/authentication';
import type { WebSocket } from 'ws';

@WebSocketGateway()
export class OrdersGateway implements OnGatewayConnection {
  constructor(private readonly wsAuthenticator: WsAuthenticator) {}

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    await this.wsAuthenticator.authenticateConnection(client, request);
  }
}
```

它关闭无人登录的连接，代码为 1008，或 socket.io's `disconnect()`;为了留住客人，通过 `authenticateConnection()` 第三个论点 `required` 选项是 `false`.与 socket.io，它读取握手的头，所以 `request` 争论可以结束了。来自另一个网站页面的握手是匿名的，因为 [交叉原点写入](/security/authentication#add-sign-up-and-sign-in) 是。然后，守卫再次验证每条消息，因此被撤销的会话在连接中途停止工作。 `@CurrentUser()` 是每条消息， `null` 我们有 `@Public()` 一。 `client.user` 保存最后一个经过身份验证的消息的用户，并在消息的凭据被拒绝时被清除。

[`@nestjs/authorization`](/security/authorization) 支票 `@Can()` 针对每个消息和每个操作的用户，而不是套接字的用户。

#### 检测

端到端测试启动真实 `AppModule` 有三件事改变了。数据库是 [PGlite](https://pglite.dev)PostgreSQL 编译成 WebAssembly，应用了您的实际迁移，因此测试不需要服务器。邮件发送到 `InMemoryMailTransport`，使测试的每封电子邮件都保持可读状态。scrypt 故意很慢，默认成本为几百毫秒和 128 MiB 内存，因此测试覆盖 `PasswordHasher` 用便宜的。应用程序还在引导时读取其设置，因此测试需要它们的测试值：

```typescript
export default defineConfig({
  // ...
  test: {
    // ...
    env: {
      APP_URL: 'http://localhost:3000',
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
      TOTP_ENCRYPTION_KEY: 'test-only-totp-key-of-at-least-32-chars',
      GOOGLE_CLIENT_ID: 'store.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-only-google-secret',
    },
  },
});
```

```typescript
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerifyEmailMail } from '../src/auth/email-verification.mailer.js';
import { PasswordResetMail } from '../src/auth/password-reset.mailer.js';

describe('Authentication (e2e)', () => {
  const pglite = new PGlite(); // PostgreSQL in-process: no server to start
  const mailbox = new InMemoryMailTransport();
  let app: INestApplication;
  const ada = { email: 'ada@example.com', password: 'correct horse battery' };

  beforeAll(async () => {
    const db = drizzle(pglite);
    // The app's migrations, the authentication tables included.
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken()) // the database DrizzleModule provides
      .useValue(db)
      .overrideProvider(MailTransport)
      .useValue(mailbox)
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    await pglite.close();
  });

  it('signs up, verifies the address, then reads the profile with the session cookie', async () => {
    const res = await request(app.getHttpServer()).post('/auth/sign-up').send(ada).expect(201);
    const cookie = res.headers['set-cookie'][0].split(';')[0];

    const mail = mailbox.assertSent({ to: ada.email, mail: VerifyEmailMail });
    const token = mail.link('/verify-email').searchParams.get('token');
    await request(app.getHttpServer()).post('/auth/email/verify').send({ token }).expect(200);

    await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie)
      .expect(200, { id: res.body.id, email: ada.email, emailVerified: true, roles: ['customer'] });
  });

  it('issues bearer tokens to the mobile app', async () => {
    const res = await request(app.getHttpServer()).post('/auth/token').send(ada).expect(200);

    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200, []);
  });

  it('resets a forgotten password', async () => {
    await request(app.getHttpServer()).post('/auth/password/forgot').send({ email: ada.email }).expect(202);
    // The email goes out after the response, which doesn't wait for it.
    const mail = await vi.waitFor(() => mailbox.assertSent({ to: ada.email, mail: PasswordResetMail }));
    const token = mail.link('/reset-password').searchParams.get('token');

    await request(app.getHttpServer())
      .post('/auth/password/reset')
      .send({ token, password: 'a brand new passphrase' })
      .expect(200);
    await request(app.getHttpServer()).post('/auth/sign-in').send(ada).expect(401);
  });

  it('rejects anonymous requests and wrong passwords', async () => {
    await request(app.getHttpServer()).get('/orders').expect(401);
    await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ ...ada, password: 'not the password' })
      .expect(401);
  });
});
```

- `mailbox.assertSent()` 查找邮件类地址的最新电子邮件，`link()` 返回包含路径的第一个链接，作为 `URL`。这就是验证、重置和神奇链接的整个流程：发送、找到链接、跟随它。
- 重置电子邮件是在响应之后发送的（参见 [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords)），因此测试使用 `vi.waitFor()` 等待它。其他电子邮件在路由回复之前发送。
- `DrizzleAuthenticationStore` 在 PGlite 上运行，就像在 PostgreSQL 上一样。PGlite 只有一个连接，所以两个请求永远不会真正在那里竞争；商店的 [合同测试](/security/authentication#keep-sessions-and-tokens-in-your-database) 也可以在 PostgreSQL 上运行。

若要在不经过登录路由的情况下将测试用户登录，`SessionService.create()` 返回会话 cookie，以及 `TokenService.issue()` 承载令牌（对于没有身份验证器的用户）。测试代码读取 `AuthenticationContext` 没有 HTTP，以用户身份运行：`run()` 获取一个身份验证结果（用户，以及可选的会话）和一个函数来运行。

#### 生产检查表

- **为模块保存的所有内容注册一个存储**，如 [Keep sessions and tokens in your database](/security/authentication#keep-sessions-and-tokens-in-your-database)，并在迁移中应用其表。应用程序的每个实例都使用它们，因此重新启动不会让任何人退出。当配置功能使用的存储未注册时，模块拒绝启动，但仅当 `NODE_ENV` 是 `production`：设置它，或者一个部署忘记了它在内存中运行，除了启动日志行之外什么也没有。针对您的商店运行包的合同测试 `concurrent: true` 在 PostgreSQL 上：他们失败了一个存储，该存储在需要一个条件语句的地方读取然后写入。
- **在共享用户数据库的每个应用程序中配置相同的功能。**每个应用程序都从自己的选项中决定登录是否要求第二个因素，以及在任何地方注销是否结束刷新令牌。如果任何在配置中登录用户的应用程序 `mfa`，他们中的每一个都必须，或者通过一个注册的客户只用密码登录另一个。同样地配置 `accessToken` 在打开刷新令牌的情况下，在每个令牌中，如果到处注销或在一个令牌中重置密码，也应该注销其他令牌客户端。
- **通过真实的提供者发送电子邮件。**设置 `SMTP_URL`，或通过另一个传输。`LogMailTransport` 将每个链接写入日志，任何读取日志的人都可以作为客户登录。
- **将应用程序送达 HTTPS**，因为会话 cookie 是 `Secure`.如果 web 应用程序运行在除 API，列在 `session.trustedOrigins`，或者其登录和 magic-link 请求被拒绝，并且其 `POST` 请求和 WebSocket 连接是匿名的。在重写的代理后面 `Host` 也在那里列出公共来源。离开 `cookie.secure` 关于：a `SameSite=None` 没有它的 cookie 在启动时失败，因为浏览器会丢弃它。
- **在 Nest12.1 或之后**拨打 `app.enableCsrfProtection()`，使用相同的 `trustedOrigins`。它拒绝对每个路由的跨起源写，而不仅仅是那些使用会话 cookie 的路由。
- **在秘密管理器中保存秘密**：JWT 秘密、TOTP 加密密钥、Google 客户端秘密和 SMTP 凭据。如 [Add two-factor authentication](/security/authentication#add-two-factor-authentication) 中所述旋转 TOTP 键。
- **将验证和重置页面构建为 POST 令牌**，并从 `APP_URL`.电子邮件扫描器跟随链接 GET 请求；在加载时使用令牌的页面会让他们花掉它。
- **不要让 `forgot` 透露任何事情。**无论发生什么，都要像 [`forgot` route](/security/authentication#reset-forgotten-passwords) 那样回答，不要 `await``request()`。对于具有帐户的地址，注册仍然回答 409；如果这对你很重要，也用同样的方式回答注册，然后给所有者发电子邮件。
- **注册生产重定向 URI**使用谷歌，并设置 `APP_URL` 到应用程序的公共来源。
- **调整 scrypt 的服务器大小。**在 libuv 线程池上，默认成本下每个散列需要 128 MiB（除非设置 `UV_THREADPOOL_SIZE`，否则为四个线程）。签到一个接一个地突破队列；油门限制了它们。
- **为节流阀使用共享存储**，例如 Redis.它的默认存储计数在每个进程的内存中，因此每个实例都有自己的计数，重新启动或部署重置计数。使能够 `trust proxy` 在代理人后面。猜测传播到许多人 IP 地址，添加第二个节流器，其跟踪器仅是电子邮件；它还可以防止客户的收件箱充满重置链接。
- **使用 `SignInService.rotateSession()` 轮换权限更改会话**。在登录时更改密码后，或者当客户打开或关闭双因素身份验证时，也会结束他们的其他会话并刷新令牌：`SessionService.revokeAll()`，当前会话为 `except`，和 `TokenService.revokeAll()`。知道旧密码的人仍然可以登录。[密码重置](/security/authentication#reset-forgotten-passwords) 会为您执行此操作。
- **手柄 API 密钥是秘密。**该表只保留它们的散列，一个密钥在创建时显示一次：一个泄露的数据库不会给任何人一个密钥，一个丢失的密钥会被撤销和替换，再也不会显示了。密钥在一年后过期，所以提醒它们的所有者在旧的还能用的时候创建下一个。添加 `cat_` 将模式传递到您的秘密扫描器（GitHub 秘密扫描需要自定义模式）来查找提交给存储库的密钥，并撤销它们。使用密钥发出的请求不会发出任何事件：记录 `keyId` 来自 `@CurrentSession()` 你需要知道哪把钥匙做了什么。任何地方的密码重置或注销都会留下密钥：如果它们也应该切断密钥，请在这些事件中撤销它们。
- **保留审计跟踪。** `AuthenticationEvents` 在其上发布每次登录和注销、第二因素更改、重复使用的刷新令牌、密码重置和电子邮件验证 `events$` 流和开 `node:diagnostics_channel`.将它们存储在您的安全团队可以搜索它们的地方。重复警报 `mfa-failed` 事件 `locked: true` （有密码的人在猜代码），在许多 `password-reset-requested` 没有 a 的事件 `userId` 从一个来源（有人正在调查帐户），并在 `session-touch-failed` 事件，这意味着会话存储拒绝写入。
- **如果添加 `@nestjs/authorization`，则在 `AuthorizationModule`** 之前导入 `AuthenticationModule`。全局防护按导入顺序运行，授权需要设置身份验证的用户。另一个订单在启动时失败。`@nestjs/authorization` 拒绝声明无检查的处理程序，并将 `@Public()` 算作一个：公共路由不需要 `@Can.Anyone()`。

#### 商店合同

教程 [wrote the authentication store with Drizzle](/security/authentication#keep-sessions-and-tokens-in-your-database)。本节总结了六份合同对任何商店的要求，即与另一家商店签订一份合同 ORM。存储接口的每个方法都在它的 doc 注释中给出了它的规则，规则阻止了竞争，包的契约测试会检查它们。

**注册。**存储是一个普通的单例提供程序，它在其构造函数中注册自己 `registerSource()` 关于注射剂 `AuthenticationStorage`，按合同名称： `sessions`, `refreshTokens`, `mfa`, `magicLinks`, `oidcStates` 和 `emailTokens`.方法名不会在合同中重复，因此一个类可以实现所有六个，或者几个类可以拆分它们。注册表一次检查每个存储的形状，拒绝第二个存储的名称，除非它通过 `replace: true`，并在 `AuthenticationModule` 初始化，记录每种状态的所在位置。没有存储的合同使用其内存默认值，该默认值在重新启动时会丢失所有内容，并且不会在实例之间共享。

**生产警卫。**与 `NODE_ENV=production` 当配置功能使用的合约没有存储时，启动失败，命名每个缺失的接口：

| 配置 | 合同 |
| --- | --- |
| 一个 `SessionCookieProvider` | `sessions` |
| `accessToken`，打开刷新令牌 | `refreshTokens` |
| `accessToken`，与 `refreshToken` 设置为 `false` | 没有一个 |
| `mfa` | `mfa` |
| `magicLink` | `sessions`,`magicLinks` |
| `oidc` | `sessions`,`oidcStates` |
| `passwordReset` | `sessions`,`emailTokens` |
| `emailVerification` | `emailTokens` |

双因素身份验证关闭 `mfa`：登录不读 `mfa` 合同。刷新令牌仅存在于 `accessToken`，所以没有它，或者有 `refreshToken` 设置为 `false`，单独在任何地方注销和重置密码结束会话。您配置的功能都不使用的合同在第一次读取时失败，而不是在内存中运行。`allowInMemoryStorage: true` 在模块中，选项无论如何都接受内存中的存储，但每次重新启动或部署都会注销所有人，并忘记注册的身份验证器，实例不会共享任何身份验证器。

**方法必须是原子的。**任何决定某个东西只能工作一次的东西都是一个条件语句，而不是读取后写入。其他方法是简单的读取、插入和删除。没有人接受您的交易：身份验证状态是单独编写的，绝不是业务交易的一部分。

| 合同 | 方法 | 必须是 | 为什么 |
| --- | --- | --- | --- |
| `SessionStore` | `touchSession()` | 有条件的 `UPDATE` 现有行的移动 `lastActiveAt` 仅向前 | 在注销后写回会话的请求将返回会话 |
| `SessionStore` | `deleteSession()` | 一个 `DELETE` 确定它是否从行计数中删除了行 | 在一次会议的两次轮换中，或者一次轮换和一次退出，只有一次可以获胜 |
| `RefreshTokenStore` | `markRefreshTokenUsed()` | 安 `UPDATE ... WHERE used_at IS NULL`，计数行 | 小偷和主人同时刷新不能都赢 |
| `MfaStore` | `saveTotp()` | 保留较大部分的上部 `lastUsedStep` | 保存记录不得重新打开刚刚声明的步骤 |
| `MfaStore` | `claimTotpStep()`,`consumeRecoveryCode()` | 有条件的 `UPDATE`, 一个 `DELETE`，计数行 | 重放代码必须失败 |
| `MfaStore` | `recordMfaFailure()` | 一个插入，然后是一个计数，每个都是单独提交的 | 并行猜测的爆发不能都看到低计数 |
| `MfaStore` | `saveRecoveryCodes()` | 一个事务：删除，然后插入 | 读者绝对不能看到半批 |
| `MagicLinkStore`,`OidcStateStore`,`EmailTokenStore` | `consumeMagicLink()`,`consumeOidcState()`,`consumeEmailToken()` | 一个 `DELETE ... RETURNING` | 一个链接不得登录两个浏览器，或设置两个密码 |

当一个刷新令牌族的任何令牌被撤销时，它被算作被撤销，因此撤销后保存的后继也被撤销。以及待处理的条目（魔术链接，OIDC 登录、电子邮件令牌）保持有界：每个保存删除已经过期的内容，超过上限后，删除先过期的内容。

`touchSession()` 是尽力而为：当它失败时，请求将继续作为会话读取，并且 `session-touch-failed` 事件将报告它。`getSession()` 可以将 `extra` 设置为针对 `SessionCookieProvider.validate()` 的相同查询与会话（通常是其用户）一起读取的内容。`createSession()` 永远不会收到它，`listUserSessions()` 也不会设置它。

**与 Prisma.**教程中有商店 Drizzle 并与 TypeORM，在同一张桌子上。一个 Prisma 商店遵循相同的规则：

- **条件更新和删除**（`touchSession()`、`deleteSession()`、`markRefreshTokenUsed()`、`claimTotpStep()`、`consumeRecoveryCode()`）是 `updateMany()` 或 `deleteMany()`，条件在 `where` 中，其 `count`：`deleteSession()` 解决 `count > 0`。永远不要 `upsert()`for`touchSession()`：它可以回写刚刚删除的会话。
- **`saveTotp()`**在其 upsert 中需要 `GREATEST(..., excluded.last_used_step)`。Prisma 的 upsertAPI 不从冲突行中获取表达式，因此它是原始的 SQL，带有 `$executeRaw`。
- **`consume` 方法**是 `delete()`，每个条件都在 `where` 中（id 和 `consumeEmailToken()` 的目的），当没有匹配的内容时抛出 `P2025`：将其转换为 `undefined`。
- **`recordMfaFailure()`**是两个单独的陈述：a `create()`，然后一个 `count()`.不 `prisma.$transaction([create, count])`，它在计数后提交的事务中运行二合一。
- **`saveRecoveryCodes()`**是需要事务的唯一方法：`$transaction()`，其数组形式适合这里。

**使用套件进行测试**`@nestjs/authentication/testing`，就像教程一样。`authenticationStoreContract()` 为任何测试运行者返回工厂返回的合同返回案例。`concurrent: true` 添加竞争：一个令牌的并行刷新、一个代码或链接的并行使用、失败代码的突发、一个请求的注销竞争、一个会话的并行删除以及一个注销或另一个轮换的轮换竞争。针对带有连接池的 PostgreSQL 运行它，其中读取然后写入的存储会失败它们。`maxPending` 检查挂起条目的上限，并为测试配置一个小上限。套房忽略 `extra` 当它比较什么 `getSession()` 返回，因此加入用户的存储通过。

#### 参考

##### 模块选项

`AuthenticationModule.forRoot()` 采取这些选项，以及 `forRootAsync()` 工厂退货，除了 `isGlobal` 和 `globalGuard`，保持在最高水平。生命周期是毫秒，或字符串，如 `'30s'`,`'15m'` 和 `'14d'`，长达 100 年；较长的启动失败。每个有时钟的组也需要 `now`，返回历元毫秒的函数，用于测试。

| 选择 | 默认的 | 描述 |
| --- | --- | --- |
| `isGlobal` | `true` | 全局注册模块。 |
| `globalGuard` | `true` | 将 `AuthenticationGuard` 注册为全局警卫。使用 `false`，路由保持开放，直到它们使用 `@UseGuards(AuthenticationGuard)`。 |
| `allowInMemoryStorage` | `false` | 从 `NODE_ENV=production` 而功能使用的合同没有存储。看 [Keep sessions and tokens in your database](/security/authentication#keep-sessions-and-tokens-in-your-database). |
| `session.cookieName` | `__Host-sid` | 会话 cookie；`sid` 何时 `cookie` 排除 `__Host-` 前缀。 |
| `session.absoluteTtl` | `'7d'` | 会话的最大生存期，无论它有多活跃。 |
| `session.idleTtl` | `'1d'` | 空闲超时，由活动延长。`0` 关掉它。 |
| `session.touchInterval` | `'1m'` | 活动最多写入存储的频率。比 `idleTtl`，除非那是 `0`：较长的用户在启动时失败，因为活动用户将作为空闲用户注销。 |
| `session.cookie` | `secure: true`,`sameSite: 'lax'`,`path: '/'` | Cookie 属性：`secure`、`sameSite`、`path`、`domain`。`HttpOnly` 始终设置。 |
| `session.trustedOrigins` | 没有一个 | 其页面可能使用会话 cookie 进行写入和登录的其他来源。 |
| `session.metadata` | 没有一个 | 登录请求的函数，其结果与每个新会话一起存储。参见 [Let customers manage their sessions](/security/authentication#let-customers-manage-their-sessions)。 |
| `password.logN` | `17` | 脚本成本 N 的 2 底对数，一个从 10 到 22 的整数。`r`（默认 `8`，最多 32），`p`(`1`，最多 16），`keyLength`(`32`）和 `saltLength`(`16`，从 16 到 64）设置其他参数。散列最多可能占用 1 GiB 的内存（128·N·r 字节）和默认工作（N·r·p）的 16 倍，因此 `r`8 时，`logN`20 点停止。 |
| `accessToken.key` | 所需 | HS256 至少 32 字节的秘密，或 RS256、ES256 或 EdDSA 的私钥，作为 PEM 文本或 `KeyObject`。JWK 或 DER 键在启动时失败：用 `createPrivateKey()` 导入它。参见 [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app)。 |
| `accessToken.alg` | 从钥匙 | 签名算法：HS256 对于秘密，密钥是私钥的。 |
| `accessToken.issuer`,`audience` | 没有一个 | 这个 `iss` 和 `aud` 索赔，写入并检查每个令牌。 |
| `accessToken.ttl` | `'15m'` | 访问令牌生命周期。 |
| `accessToken.kid`,`type` | 无，`JWT` | 这个 `kid` 和 `typ` 标题。 |
| `refreshToken` | 继续 `accessToken` | `false` 只发放访问令牌，没有刷新令牌，也没有 `RefreshTokenStore`。参见 [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app)。 |
| `refreshToken.ttl` | `'30d'` | 一个刷新令牌的生命周期。 |
| `refreshToken.absoluteTtl` | `'90d'` | 刷新令牌族的最大生命周期，无论它旋转的频率如何。 |
| `mfa.encryption` | 所需 | `keys`，AES-256-GCM 键的列表，最新的在前，加上 `migratePlaintext`（默认 `false`）；或者 `false` 以明文形式存储秘密。参见 [Add two-factor authentication](/security/authentication#add-two-factor-authentication)。 |
| `mfa.issuer` | 没有一个 | 身份验证器应用程序显示的名称。 |
| `mfa.window` | `1` | 现在两边接受 30 秒的步长，从 0 到 10 的整数。 |
| `mfa.maxAttempts` | `5` | 允许失败的代码 `lockoutWindow` 在每个代码被拒绝之前，至少有一个整数 1。 |
| `mfa.lockoutWindow` | `'15m'` | 窗口故障代码被计算在内。 |
| `mfa.recoveryCodes` | `10` | 每个批次的回收代码，整数至少为 1。 |
| `mfa.pendingTtl` | `'10m'` | 一个会话可以等待它的第二个因素多长时间。 |
| `emailVerification.url` | 所需 | 页面验证链接打开。`ttl` 默认为 `'24h'`。参见 [Verify email addresses](/security/authentication#verify-email-addresses)。 |
| `passwordReset.url` | 所需 | 页面重置链接打开。`ttl` 默认为 `'1h'`。参见 [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords)。 |
| `magicLink.url` | 所需 | 页面魔术链接打开。`ttl` 默认为 `'15m'`。参见 [Add magic-link sign-in](/security/authentication#add-magic-link-sign-in)。 |
| `magicLink.bindToBrowser` | `true` | 仅在请求链接的浏览器中接受链接。 |
| `magicLink.cookie` | `secure: true` | 的属性 `__Host-magic_link_tx` 事务 cookie。 |
| `oidc.callbackUrl` | 所需 | 公开回调 URL，与 `:provider` 代替提供程序的名称，或返回它的请求的函数。看 [Add "Sign in with Google"](/security/authentication#add-sign-in-with-google). |
| `oidc.providers` | 所需 | 按名称分类的提供程序配置，例如 `google()`,`github()` 和 `microsoft()`，这也需要目录的 `tenant` 身份证。 |
| `oidc.redirectAfterLogin` | `/` | 登录没有 `redirectTo` 时在哪里着陆。 |
| `oidc.transactionTtl` | `'10m'` | 重定向和回调之间的登录可能需要多长时间。 |
| `oidc.cookie` | `secure: true` | 的属性 `__Host-oidc_tx` 事务 cookie。 |
| `oidc.discoveryTtl`,`clockTolerance` | `'1h'`,`'30s'` | 发现文档被信任的时间长短，以及 ID 象征性时间声明。 |

这个 `emailVerification`,`passwordReset`,`magicLink` 和 `oidc` 特性还需要一个同名的注册处理程序；一个没有另一个在启动时失败。上述范围之外的值也是如此，包括 `NaN` 那个 `Number()` 创建未设置的环境变量。

##### 路线选项

`@Authenticate()` 对类或方法采取以下选项：

| 选择 | 描述 |
| --- | --- |
| `optional` | 让匿名来电者通过 `null` 作为用户。不良凭证仍然会得到 401。 |
| `mfa` | 需要经过验证的第二个因素：经过验证的会话，或其 `amr` 包含 `mfa`、`otp` 或 `hwk` 的 JWT。API 钥匙永远不会满足它。参见 [Add two-factor authentication](/security/authentication#add-two-factor-authentication)。 |
| `verifiedEmail` | 需要经过验证的电子邮件地址，或回复 403 `email_unverified`.见 [Read the current user](/security/authentication#read-the-current-user). |
| `providers` | 只有这些提供程序类或其子类可以对路由进行身份验证。 |

##### API 钥匙

`ApiKeyProvider` 在 `super()` 中采用这些选项。参见 [Issue API keys to partners](/security/authentication#issue-api-keys-to-partners)。

| 选择 | 默认的 | 描述 |
| --- | --- | --- |
| `prefix` | 所需 | 启动每个键，如在 `cat_<id>_<secret>`：1 到 16 个小写字母和数字，以一个字母开头。 |
| `realm` | `api` | 境界 `WWW-Authenticate` 挑战。 |

您的子类实现 `findKey(id)`，返回存储的密钥 `hash`,它的 `user` 及其 `expiresAt`, 或 `null` 对于不存在、已被撤销或所有者已不在的密钥。 `generate()` 返回一个新键作为 `key` 显示一次，与 `id` 和 `hash` 两个商店。对于使用密钥发出的请求，会话是密钥的 `keyId` 和 `expiresAt`，与 `method` 设置为 `api-key`.

##### 事件

`AuthenticationEvents` 在其 `events$` 可观测值和 `nestjs:authentication:<type>` 诊断通道（如 `nestjs:authentication:sign-in`）上发布每个事件。

| 类型 | 有效载荷 | 何时 |
| --- | --- | --- |
| `sign-in` | `userId`,`sessionId` 或者 `tokenFamilyId`,`method`,`mfa`,`metadata` | `SignInService.signIn()` 或者 `TokenService.issue()` 已登录用户 |
| `sign-out` | `userId`,`sessionId`,`tokenFamilyId` 或者 `everywhere` | 会话、刷新令牌族或全部结束 |
| `mfa-verified` | `userId`, `method` (`totp` 或 `recovery-code`) | 已接受代码 |
| `mfa-failed` | `userId`,`method`,`failures`,`locked` | 代码被拒绝，包括在锁定期间 |
| `mfa-enabled` | `userId`,`replaced` | 已确认身份验证器 |
| `mfa-disabled` | `userId` | 身份验证器和恢复代码已被删除 |
| `recovery-codes-generated` | `userId`,`count` | 一批新的恢复代码取代了旧的 |
| `refresh-token-reused` | `userId`,`tokenFamilyId` | 一个用完的刷新令牌返回，其家族被撤销 |
| `password-reset-requested` | `email`,`userId`（地址不详） | 有人要求提供重置链接 |
| `password-reset` | `userId` | 重置链接设置新密码 |
| `email-verified` | `userId`,`email` | 使用了验证链接 |
| `magic-link-refused` | `reason`(`not-this-browser`,`unknown`,`expired` 或者 `refused`),`email` | 一个神奇的链接没有人登录 |
| `session-touch-failed` | `userId`,`sessionId`,`error` | `SessionStore.touchSession()` 失败；请求继续进行，会话的空闲截止日期没有改变 |

##### 错误

`AuthenticationError` 是包错误的基类。它携带 `status` 以及可选地 `code`, `details` 和 `challenge` （ `WWW-Authenticate` 标题）。从处理程序或它调用的任何东西中抛出，它变成 Nest 自己的 HTTP 例外， GraphQL `UNAUTHENTICATED`, a `WsException` 或者一个 `RpcException`.其 `code` 是 Nest's `errorCode`.完毕 HTTP 和 GraphQL 它是在异常上设置的，因此异常筛选器读取 `exception.errorCode`，和 Nest 把它放在身体里，或者 `extensions.originalError` 为了 GraphQL.ws 和 rpc 有效载荷携带相同的 `errorCode` 钥匙。带有消息的拒绝还会将代码发送为 `error` 一如既往。 `details`，一个普通对象，发送为 `details`，原样；没有其他错误（`cause`，堆栈）到达客户端。例如， `new AuthenticationError('Too many attempts', options)` 和 `too_many_attempts` 作为 `code` 和 `retryAfter: 30` 在 `details` 答案：

```json
{"message":"Too many attempts","error":"too_many_attempts","statusCode":401,"errorCode":"too_many_attempts","details":{"retryAfter":30}}
```

| 错误 | 状况 | `errorCode` | `error` | 何时 |
| --- | --- | --- | --- | --- |
| `AuthenticationError` | 401 | 它的 `code`，如果有 | 它的 `code`；else `Unauthorized` 带有消息，没有消息 | 不良凭据，或 `requireUser()` 没有用户（没有消息，没有代码） |
| `JwtError` | 401 | 没有一个 | `Unauthorized` | 令牌格式错误、签名错误、已过期或用于其他发行者或受众 |
| `RefreshTokenError` | 401 | 没有一个 | `Unauthorized` | 刷新令牌无效、过期或被重复使用；`reason` 说哪个 |
| `MagicLinkError` | 401 | `not_this_browser` | `not_this_browser` | 魔法链接是在请求链接的浏览器之外的另一个浏览器中打开的，或者是在该浏览器请求了五个新的链接之后打开的 |
| `MfaAlreadyEnrolledError` | 409 | 没有一个 | `Conflict` | `enroll()` 没有 `replace: true` 对于具有已确认身份验证器的用户 |

当没有提供者识别任何凭证时，守卫用 `missing_credentials` 回答 401，而不是 `error`：

```json
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}
```

这包括没有凭据的请求、过时或未知的会话 cookie（算作无，因此可选路由继续工作）以及路由的 `providers` 不接受的凭据。当第二个因素丢失时，守卫和 `TokenService.issue()` 还用 `mfa_required` 回答 401，并在 `verifiedEmail` 路由上用 `email_unverified` 回答 403，每个路由都是 `errorCode` 和 `error`。OIDC 路由响应 400 用于错误或伪造的回调，401 当提供者的响应未能通过验证或链接流没有登录会话时，403 当解析器拒绝帐户或链接流从另一个站点启动时，404 用于未配置的提供者名称，以及 502 当提供者无法访问或配置错误时，例如不是 https 的端点或无法加载的密钥集。`SignInService.signIn()` 和 `MagicLinkService.create()` 响应从另一来源发布的请求 403。
