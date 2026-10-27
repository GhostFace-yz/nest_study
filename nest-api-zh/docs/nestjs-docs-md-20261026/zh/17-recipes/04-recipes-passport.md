# Passport (auth)

Source: https://docs.nestjs.com/recipes/passport

[Passport](https://github.com/jaredhanson/passport) 是最受欢迎的 Node.js 认证库，在社区中广为人知，并在许多生产应用程序中使用。您可以将其与**集成 Nest**使用 `@nestjs/passport` 模块。在高水平上，Passport 执行一系列步骤以：

- 通过验证用户的“凭据”（如用户名/密码，JSONWeb 令牌（[JWT](https://jwt.io/))，或来自身份提供者的身份令牌)
- 管理身份验证状态（通过发布可移植令牌，如 JWT 或创建 [Express session](https://github.com/expressjs/session)）
- 将有关经过身份验证的用户的信息附加到 `Request` 进一步用于路由处理程序的对象

Passport 拥有丰富的生态系统 [策略](http://www.passportjs.org/) 实现各种认证机制。虽然概念简单，Passport 可供选择的策略多种多样。Passport 将这些不同的步骤抽象成一个标准模式，并且 `@nestjs/passport` 模块将此模式包装在熟悉的 Nest 构造。

在本章中，我们将为 RESTful 实现一个完整的端到端身份验证解决方案 API 使用这些模块的服务器。您可以按照本章中的步骤来构建完整的示例，并应用相同的概念来实现任何 Passport 策略并自定义您的身份验证方案。

#### 认证要求

对于这个用例，客户端首先使用用户名和密码进行身份验证。经过身份验证后，服务器会发出一个 JWT，客户端可以在后续请求时将其作为 [授权头中的承载令牌](https://tools.ietf.org/html/rfc6750) 发送，以证明身份验证。我们还将创建一个受保护的路由，只有包含有效 JWT 的请求才能访问该路由。

我们将从第一个要求开始：对用户进行身份验证。然后，我们将通过发布一个 JWT.最后，我们将创建一个受保护的路由，检查是否有效 JWT 应要求。

首先，安装所需的软件包。Passport 提供了一个名为 [passport-local](https://github.com/jaredhanson/passport-local) 它实现了用户名/密码身份验证机制，这适合我们用例的这一部分。

```bash
$ npm install --save @nestjs/passport passport passport-local
$ npm install --save-dev @types/passport-local
```

> warning **Notice** 对于**任何**Passport 你选择的策略，你总是需要 `@nestjs/passport` 和 `passport` 包裹。您还需要特定于策略的软件包（例如，`passport-jwt` 或者 `passport-local`) 实现您正在构建的身份验证策略。还可以安装策略的类型定义，如上所示 `@types/passport-local`，以在编写时获得类型检查和编辑器帮助 TypeScript 代码。

#### 实施 Passport 策略

我们现在准备实现身份验证功能。我们将首先概述用于**any**的流程 Passport 战略。想想很有帮助 Passport 作为一个迷你框架本身。它将身份验证过程抽象为几个基本步骤，您可以根据正在实施的策略进行定制。它就像一个框架，因为您可以通过提供自定义参数来配置它（就像普通的 JSON 对象）和回调函数形式的自定义代码，Passport 在适当的时间打电话。这个 `@nestjs/passport` 模块将此框架包装在 Nest-风格包，使其自然地集成到一个 Nest 应用。我们将使用 `@nestjs/passport` 下面，但首先，让我们考虑如何**香草 Passport**作品。

香草 Passport 您可以通过提供以下两件事来配置策略：

1. 特定于该策略的一组选项。例如，在 JWT 策略，你可以提供一个秘密来签署令牌。
2. “验证回调”，即您告诉 Passport 如何与您的用户商店（您管理用户帐户的地方）交互。在这里，您验证用户是否存在（和/或创建新用户），以及他们的凭据是否有效。Passport 如果验证成功，则期望此回调返回一个完整的用户，或者 `null` 如果失败（失败意味着找不到用户，或者在 passport-local 的情况下，密码不匹配）。

和 `@nestjs/passport`，您配置 Passport 通过扩展 `PassportStrategy` 班级。您通过调用来传递策略选项（上面的第 1 项）`super()` 在子类的构造函数中，可选地使用 options 对象。您通过实现 `validate()` 子类中的方法。

我们将首先生成一个 `AuthModule`，并在其中生成一个 `AuthService`：

```bash
$ nest g module auth
$ nest g service auth
```

这个 `AuthService` 将依赖于 `UsersService` 它封装了用户操作，因此现在也生成该模块和服务：

```bash
$ nest g module users
$ nest g service users
```

替换这些生成文件的默认内容，如下所示。在这个示例应用程序中，`UsersService` 保持硬编码的内存中用户列表，并公开 `findOne()` 按用户名查找用户的方法。在实际的应用程序中，这是您使用您选择的库（例如，TypeORM，Sequelize，猫鼬）。

```typescript
import { Injectable } from '@nestjs/common';

// This should be a real class/interface representing a user entity
export type User = any;

@Injectable()
export class UsersService {
  private readonly users = [
    {
      userId: 1,
      username: 'john',
      password: 'changeme',
    },
    {
      userId: 2,
      username: 'maria',
      password: 'guess',
    },
  ];

  async findOne(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username === username);
  }
}
```

在 `UsersModule`，唯一需要的更改是添加 `UsersService` 到 `exports` 的数组 `@Module()` 装饰器，以便它在这个模块外部可见（我们将在我们的 `AuthService` 不久）。

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

我们的 `AuthService` 检索用户并验证密码。我们创建一个 `validateUser()` 为此目的的方法。在下面的代码中，我们使用对象 rest 语法来剥离 `password` 返回用户对象之前的属性。我们的 Passport 本地策略将调用 `validateUser()` 方法在一瞬间。

```typescript
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user && user.password === pass) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }
}
```

> warning **Warning** 在实际应用程序中，切勿以纯文本存储密码。相反，使用类似的库 [bcrypt](https://github.com/kelektiv/node.bcrypt.js#readme) 用加盐的单向散列算法。使用这种方法，您只存储哈希密码，并将存储的哈希与**传入**密码的哈希版本进行比较，因此用户密码永远不会以纯文本存储或公开。为了保持我们的示例应用程序简单，我们违反了这一规则，使用纯文本。**请勿在实际应用中执行此操作。**

现在，更新 `AuthModule` 以导入 `UsersModule`。

```typescript
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [UsersModule],
  providers: [AuthService],
})
export class AuthModule {}
```

#### 实施 Passport 当地的

现在我们可以实现我们的 Passport**本地认证策略**。创建一个名为 `local.strategy.ts` 在 `auth` 文件夹并添加以下代码：

```typescript
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(username: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
```

我们遵循了前面描述的食谱 Passport 策略。我们使用 passport-local 不需要配置选项，因此构造函数调用 `super()` 没有选项对象。

> info **Hint** 可以将调用中的 options 对象传递给 `super()` 自定义 Passport 战略。在此示例中，passport-local 策略默认期望名为 `username` 和 `password` 在请求主体中。传递选项对象以指定不同的属性名称，例如： `super({ usernameField: 'email' })`.参见 [Passport documentation](http://www.passportjs.org/docs/configure/) 欲了解更多信息。

我们还实现了 `validate()` 方法。对于每个策略，Passport 用一组特定于策略的参数调用验证函数（用 `@nestjs/passport` 中的 `validate()` 方法实现）。对于局部策略，Passport 期望具有以下签名的 `validate()` 方法：`validate(username: string, password: string): any`。

大部分验证工作是在我们的 `AuthService`（在我们的帮助下 `UsersService`），所以这个方法很短。这个 `validate()`**任何**的方法 Passport 策略遵循类似的模式，仅在凭据的表示方式上有所不同。如果找到用户并且凭据有效，则该方法返回用户，以便 Passport 可以完成其任务（例如，创建 `user` 上的属性 `Request` 对象），并且请求处理流水线可以继续。如果没有，它会抛出一个异常，让我们 [异常层](/exception-filters) 处理它。

通常，唯一显著的区别是 `validate()` 每个策略的方法是**如何**确定用户是否存在且有效。例如，在 JWT 策略，根据要求，我们可能会检查是否 `userId` 解码令牌中携带的与我们的用户数据库中的记录相匹配，或者出现在已撤销令牌的列表中。这种子类和实现特定于策略的验证的模式是一致的和可扩展的。

接下来，配置 `AuthModule` 使用 Passport 我们刚刚定义的特征。更新 `auth.module.ts` 看起来像这样：

```typescript
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './local.strategy.js';

@Module({
  imports: [UsersModule, PassportModule],
  providers: [AuthService, LocalStrategy],
})
export class AuthModule {}
```

#### 内置的 Passport 警卫

这个 [Guards](/guards) 章节描述了守卫的主要功能：确定路由处理程序是否会处理请求。这仍然是正确的，我们将很快使用该标准功能。然而，`@nestjs/passport` 模块还引入了一个新的皱纹，一开始可能会让人困惑，所以现在让我们讨论一下。从身份验证的角度来看，您的应用程序可以处于以下两种状态之一：

1. 用户/客户端**未**登录（未经过身份验证）
2. 用户/客户端**已**登录（已进行身份验证）

在第一种情况下（用户未登录），我们需要执行两个不同的功能：

- 限制未经身份验证的用户可以访问的路由（即，拒绝访问受限制的路由）。我们将使用警卫以他们熟悉的能力来处理这一功能，通过在受保护的路线上放置一名警卫。此警卫检查是否存在有效的 JWT，所以我们稍后会构建它，一旦我们发布了 JWTs。

- 当先前未经身份验证的用户试图登录时，启动**身份验证步骤**本身。这是我们将**发布**一个的步骤 JWT 给有效用户。客户需要 `POST` 用户名/密码凭据来启动身份验证，因此我们将设置一个 `POST /auth/login` 路线来处理这个问题。剩下的问题是如何在这条路线上调用护照本地策略。

答案是另一种略有不同的警卫。这个 `@nestjs/passport` 模块提供了一个内置的防护，它调用 Passport 策略并启动上述步骤（检索凭据、运行验证函数、创建 `user` 财产等）.

第二种情况（登录用户）依赖于上面讨论的标准类型的防护来允许访问受保护的路由。

<app-banner-courses-auth></app-banner-courses-auth>

#### 登录路径

有了这个战略，我们现在就可以实施一个基本的 `/auth/login` 路由并应用内置保护来启动护照-本地流。

打开 `app.controller.ts` 文件并用以下内容替换其内容：

```typescript
import { Controller, Request, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller()
export class AppController {
  @UseGuards(AuthGuard('local'))
  @Post('auth/login')
  async login(@Request() req: any) {
    return req.user;
  }
}
```

`AuthGuard('local')` 创建一个警卫，该警卫调用注册在名称 `'local'` 下的 Passport 策略。当我们扩展 passport-local 策略时，`@nestjs/passport` 用 Passport 注册了我们的 `LocalStrategy`，默认名称来自 `passport-local` 包。该名称告诉守卫当应用程序有多个 Passport 策略时调用哪个策略。到目前为止，我们只有一个策略，但我们很快会添加第二个策略。

为了测试路由，我们现在将有 `/auth/login` 返回用户。这也演示了另一个特性：守卫获取从 `validate()` 方法返回的值，并将其作为 `req.user` 分配给 `Request` 对象。稍后，我们将用创建并返回 JWT 的代码替换它。

因为这些是 API 路线，我们将使用广泛可用的 [cURL](https://curl.se/) 命令行工具。您可以使用任何 `user` 中硬编码的对象 `UsersService`.

```bash
$ # POST to /auth/login
$ curl -X POST http://localhost:3000/auth/login -d '{"username": "john", "password": "changeme"}' -H "Content-Type: application/json"
$ # result -> {"userId":1,"username":"john"}
```

在此过程中，将策略名称直接传递给 `AuthGuard()` 在代码库中引入魔法字符串。相反，我们建议创建自己的类，如下所示：

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

现在，更新 `/auth/login` 路由处理程序使用 `LocalAuthGuard` 相反：

```typescript
@UseGuards(LocalAuthGuard)
@Post('auth/login')
async login(@Request() req: any) {
  return req.user;
}
```

#### 注销路由

若要注销，可以创建一个附加路由，该路由调用 `req.logout()` 清除用户的会话。这种方法对于基于会话的身份验证是典型的，但它不适用于 JWTs。它需要 Passport 的会话支持（`express-session` 连同 `passport.initialize()` 和 `passport.session()` 中间件），这个配方没有设置。自从 Passport0.6,`req.logout()` 是异步的，需要回调，因此将其包装在 promise 中：

```typescript
@UseGuards(LocalAuthGuard)
@Post('auth/logout')
async logout(@Request() req: any) {
  await new Promise<void>((resolve, reject) =>
    req.logout((err: any) => (err ? reject(err) : resolve())),
  );
}
```

#### JWT 功能性

我们准备继续 JWT 我们认证系统的一部分。让我们回顾并完善我们的需求：

- 允许用户使用用户名/密码进行身份验证，返回 JWT，以便在后续对受保护的 API 端点的调用中使用。我们正在顺利满足这一要求。要完成它，我们需要编写发出 JWT 的代码。
- 创造 API 基于有效 JWT 作为承载令牌。

再安装几个软件包来支持 JWT 要求：

```bash
$ npm install --save @nestjs/jwt passport-jwt
$ npm install --save-dev @types/passport-jwt
```

这个 [`@nestjs/jwt`](https://github.com/nestjs/jwt) 包是一个实用程序包，有助于 JWT 操纵。这个 `passport-jwt` 包是 Passport 实现 JWT 策略，以及 `@types/passport-jwt` 提供其 TypeScript 类型定义。

让我们仔细看看如何 `POST /auth/login` 请求已被处理。我们用 `LocalAuthGuard`，这调用了护照本地策略。这意味着：

1. 路由处理程序**只有在用户经过验证时才会被调用**
2. 这个 `req` 参数将包含 `user` 属性（填充者 Passport 在护照-本地认证流程中）

考虑到这一点，我们现在可以生成一个真正的 JWT，并从这个路径返回它。为了保持我们的服务干净地模块化，我们将在 `AuthService` 中生成 JWT。打开 `auth` 文件夹中的 `auth.service.ts` 文件，注入 `JwtService`，添加 `login()` 方法，如图所示：

```typescript
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user && user.password === pass) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { username: user.username, sub: user.userId };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
```

这个 `JwtService` 来自 `@nestjs/jwt` 供应 a`sign()` 生成我们的 JWT 从子集 `user` 对象属性。我们将令牌作为一个简单的对象返回，只有一个 `access_token` 财产。我们使用 `sub` 声称持有我们的 `userId` 值，与 JWT 标准。

接下来，更新 `AuthModule` 以导入新的依赖项并配置 `JwtModule`。

首先，创建 `constants.ts` 在 `auth` 文件夹并添加以下代码：

```typescript
export const jwtConstants = {
  secret: 'DO NOT USE THIS VALUE. INSTEAD, CREATE A COMPLEX SECRET AND KEEP IT SAFE OUTSIDE OF THE SOURCE CODE.',
};
```

我们将使用它在 JWT 签名和验证步骤。

> warning **Warning** **请勿公开此密钥**。我们在这里这样做是为了清楚代码在做什么，但是在生产系统中，**您必须使用适当的措施来保护这个密钥**，例如秘密库、环境变量或配置服务。

现在，打开 `auth.module.ts` 在 `auth` 文件夹并将其更新为如下所示：

```typescript
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './local.strategy.js';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constants.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '60s' },
    }),
  ],
  providers: [AuthService, LocalStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

我们配置 `JwtModule` 使用 `register()`，传入配置对象。参见 [`@nestjs/jwt` README](https://github.com/nestjs/jwt/blob/master/README.md) 有关更多信息 Nest`JwtModule`，以及 [`jsonwebtoken` usage documentation](https://github.com/auth0/node-jsonwebtoken#usage) 有关可用配置选项的详细信息。

现在我们可以更新 `/auth/login` 路由以返回 JWT。

```typescript
import { Controller, Request, Post, UseGuards } from '@nestjs/common';
import { LocalAuthGuard } from './auth/local-auth.guard.js';
import { AuthService } from './auth/auth.service.js';

@Controller()
export class AppController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }
}
```

再次使用 cURL 测试路由。您可以使用 `UsersService` 中硬编码的任何 `user` 对象。

```bash
$ # POST to /auth/login
$ curl -X POST http://localhost:3000/auth/login -d '{"username": "john", "password": "changeme"}' -H "Content-Type: application/json"
$ # result -> {"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
$ # Note: above JWT truncated
```

#### 实施 PassportJWT

我们现在可以解决我们的最终要求：通过要求有效的 JWT 应要求。Passport 在这里也有帮助 [passport-jwt](https://github.com/mikenicholson/passport-jwt) 保护 RESTful 端点的策略 JSON 网络令牌。首先创建一个名为 `jwt.strategy.ts` 在 `auth` 文件夹并添加以下代码：

```typescript
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { jwtConstants } from './constants.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, username: payload.username };
  }
}
```

与我们的 `JwtStrategy` 我们遵循了前面描述的相同配方 Passport 策略。此策略需要一些初始化，因此我们在 `super()` 呼吁。参见 [passport-jwt 策略选项](https://github.com/mikenicholson/passport-jwt#configure-strategy) 完整的列表。在我们的例子中，这些选项是：

- `jwtFromRequest`：提供从 `Request` 中提取 JWT 的方法。我们使用在 API 请求的 `Authorization` 头中提供承载令牌的标准方法。有关其他选项，请参见 [提取 JWT 从请求](https://github.com/mikenicholson/passport-jwt#extracting-the-jwt-from-the-request)。
- `ignoreExpiration`：为了明确起见，我们设置默认值 `false` 值，它委派了确保 JWT 尚未过期 Passport 模块。如果我们的路由收到过期 JWT，请求被拒绝 `401 Unauthorized` 回应。
- `secretOrKey`：我们使用提供对称秘密来签署令牌的权宜之计。其他选项，例如 PEM-编码的公钥，可能更适合生产应用程序（参见 [passport-jwt 策略选项](https://github.com/mikenicholson/passport-jwt#configure-strategy) 欲了解更多信息）。无论如何，如前所述，**不要公开泄露这个秘密**。

这个 `validate()` 方法值得讨论。为了 JWT 战略， Passport 首先验证 JWT 的签名并解码 JSON.然后调用我们的 `validate()` 方法，将解码后的 JSON 作为其单个参数。基于方式 JWT 签名有效，**我们保证收到我们之前签名并发放给有效用户的有效令牌**。

因此，我们的 `validate()` 回调是微不足道的：它返回一个包含 `userId` 和 `username` 属性。回想一下从 `validate()` 成为 `user` 财产 `Request` 物体。

您也可以返回一个数组，其中第一个值成为 `user` 对象，第二个值成为 `authInfo` 对象(`req.authInfo`)。

这种方法还为将其他业务逻辑注入流程留下了空间（称为“钩子”）。例如，我们可以在 `validate()` 方法以提取关于用户的更多信息，从而产生更丰富的 `user` 对象在我们的 `Request`.这也是我们可能决定进行进一步令牌验证的地方，例如查找 `userId` 在已撤销的令牌列表中，使我们能够执行令牌撤销。我们在示例代码中实现的模型是一个快速的“无状态 JWT 模型，其中每个 API 基于存在有效的呼叫立即授权 JWT，以及关于请求者的一小部分信息（其 `userId` 和 `username`) 在我们的请求管道中可用。

在 `AuthModule` 中添加新的 `JwtStrategy` 作为提供程序：

```typescript
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './local.strategy.js';
import { JwtStrategy } from './jwt.strategy.js';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constants.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '60s' },
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

通过导入我们签署时使用的相同秘密 JWT，我们确保**验证**阶段由 Passport 以及在我们的 `AuthService` 使用一个共同的秘密。

最后，我们定义扩展内置 `AuthGuard` 的 `JwtAuthGuard` 类：

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

#### 实施受保护的路线和 JWT 战略守卫

我们现在可以实现我们的受保护路由及其关联的守卫。

打开 `app.controller.ts` 文件并更新它，如下所示：

```typescript
import { Controller, Get, Request, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { LocalAuthGuard } from './auth/local-auth.guard.js';
import { AuthService } from './auth/auth.service.js';

@Controller()
export class AppController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return req.user;
  }
}
```

我们再次申请 `AuthGuard`，这次是调用在 passport-jwt 默认名下注册的策略， `jwt`.当我们的 `GET /profile` 路由被命中，警卫调用我们自定义配置的 passport-jwt 策略，验证 JWT，并分配 `user` 财产 `Request` 物体。

确保应用程序正在运行，并使用 cURL 测试路由。

```bash
$ # GET /profile
$ curl http://localhost:3000/profile
$ # result -> {"message":"Unauthorized","statusCode":401}

$ # POST /auth/login
$ curl -X POST http://localhost:3000/auth/login -d '{"username": "john", "password": "changeme"}' -H "Content-Type: application/json"
$ # result -> {"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2Vybm... }

$ # GET /profile using access_token returned from previous step as bearer code
$ curl http://localhost:3000/profile -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2Vybm..."
$ # result -> {"userId":1,"username":"john"}
```

在 `AuthModule`，我们配置了 JWT60 秒后过期。对于实际应用程序来说，这可能太短了，令牌过期和刷新的细节超出了本文的范围。我们选择它是为了演示 JWTs 和 passport-jwt 策略的一个重要特性：如果您在认证后等待 60 秒再发送 `GET /profile` 请求，您将收到一个 `401 Unauthorized` 回应。Passport 检查 JWT 的到期时间自动，因此您的应用程序不必。

这就完成了我们的 JWT 身份验证实现。JavaScript 客户（如 Angular,React, 或 Vue 应用程序）和其他客户端现在可以进行身份验证并与我们的 API 服务器。

#### 延伸防护装置

在大多数情况下，使用提供的 `AuthGuard` 上课就够了。但是，您可能希望扩展默认的错误处理或身份验证逻辑。为此，请扩展内置类并在子类中重写其方法。

```typescript
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Add your custom authentication logic here
    // for example, call super.logIn(request) to establish a session.
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
```

除了扩展默认的错误处理和身份验证逻辑之外，您还可以让身份验证通过一系列策略。成功、重定向或错误的第一个策略会停止链条。身份验证失败会在每个策略中串联进行，只有当所有策略都失败时，身份验证才会失败。

```typescript
export class JwtAuthGuard extends AuthGuard(['strategy_jwt_1', 'strategy_jwt_2', '...']) { ... }
```

#### 启用全局身份验证

如果默认情况下应该保护大多数端点，则可以将身份验证卫士注册为 [全球卫士](/guards#binding-guards).而不是使用 `@UseGuards()` 装饰器在每个控制器上，然后标记应该公开的路由。

首先，注册 `JwtAuthGuard` 作为全局防护，使用以下结构（在任何模块中）：

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },
],
```

有了这个，Nest 将自动绑定 `JwtAuthGuard` 到所有端点。

接下来，提供一个将路由声明为公共的机制。为此，请使用 `SetMetadata` 装饰工厂功能。

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

上面的文件导出两个常量：我们的元数据键，名为 `IS_PUBLIC_KEY` 以及新的装饰器本身，命名为 `Public`（你可以命名它 `SkipAuth`,`AllowAnon`，或任何适合您的项目的东西）。

定制 `@Public()` 装饰器到位，你可以用它来装饰任何方法，如下所示：

```typescript
@Public()
@Get()
findAll() {
  return [];
}
```

最后，`JwtAuthGuard` 需要返回 `true` 当 `"isPublic"` 找到元数据。为此，请使用 `Reflector` 类（见 [把这一切放在一起](/guards#putting-it-all-together) 在警卫一章）。

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
```

#### 请求范围策略

这个 PassportAPI 是基于向库的全局实例注册策略。因此，策略不是设计成具有依赖于请求的选项，也不是为每个请求动态实例化（请参见 [注射镜](/fundamentals/injection-scopes) 了解有关请求范围提供程序的更多信息）。如果将策略配置为请求作用域，Nest 永远不要实例化它，因为它不绑定到任何特定的路由，也没有办法确定哪些“请求范围”策略应该为给定的请求运行。

但是，您可以在策略中动态解析请求范围内的提供程序。为此，请使用 [模块参考](/fundamentals/module-ref) 特征。

首先，打开 `local.strategy.ts` 文件并注入 `ModuleRef` 以通常的方式：

```typescript
constructor(private moduleRef: ModuleRef) {
  super({
    passReqToCallback: true,
  });
}
```

> info **Hint** 这个 `ModuleRef` 类是从 `@nestjs/core` 包装。

请务必设置 `passReqToCallback` 配置属性到 `true`，如上所示。

在下一步中，请求实例用于获取当前上下文标识符，而不是生成新的上下文标识符（请参见 [获取当前子树](/fundamentals/module-ref#getting-current-sub-tree) 了解有关请求上下文的更多信息）。

现在，在 `validate()` 方法 `LocalStrategy` 类，使用 `getByRequest()` 方法 `ContextIdFactory` 类，根据请求对象创建上下文 id，并将其传递给 `resolve()` 呼叫：

```typescript
async validate(
  request: Request,
  username: string,
  password: string,
) {
  const contextId = ContextIdFactory.getByRequest(request);
  // "AuthService" is a request-scoped provider
  const authService = await this.moduleRef.resolve(AuthService, contextId);
  ...
}
```

在上面的例子中，`resolve()` 方法异步返回 `AuthService` 提供者（假设 `AuthService` 被标记为请求范围提供程序）。

#### 定制 Passport

自定义警卫的呼叫方式 Passport，将选项传递给 `PassportModule.register()` 方法。除了 `defaultStrategy` 和 `property`，其中 `@nestjs/passport` 使用本身，这些选项被传递给 Passport 的 `authenticate()` 调用，因此可用的选项取决于正在实现的策略。例如：

```typescript
PassportModule.register({ session: true });
```

还可以通过将选项对象传递给 `super()` 在它的构造函数中。例如，对于本地策略：

```typescript
constructor(private authService: AuthService) {
  super({
    usernameField: 'email',
    passwordField: 'password',
  });
}
```

见官方 [Passport website](http://www.passportjs.org/docs/oauth/) 对于可用的属性名称。

#### 命名策略

实现策略时，可以通过将第二个参数传递给 `PassportStrategy()` 功能。否则，每个策略使用其默认名称（例如，`'jwt'` 为了 JWT 策略）：

```typescript
export class JwtStrategy extends PassportStrategy(Strategy, 'myjwt')
```

然后用像 `@UseGuards(AuthGuard('myjwt'))` 这样的装饰器引用它。

#### GraphQL

使用 `AuthGuard` 和 [GraphQL](/graphql/quick-start)，扩展内置 `AuthGuard` 类并覆盖 `getRequest()` 方法。

```typescript
@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req;
  }
}
```

获取当前经过身份验证的用户 GraphQL 求解器，定义一个 `@CurrentUser()` 装饰师：

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext) => {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req.user;
  },
);
```

要在解析器中使用装饰器，请将其作为查询或变异的参数：

```typescript
@Query(() => User)
@UseGuards(GqlAuthGuard)
whoAmI(@CurrentUser() user: User) {
  return this.usersService.findById(user.id);
}
```

对于护照本地策略，还需要添加 GraphQL 上下文对请求主体的参数，以便 Passport 可以访问它们进行验证。否则，你会得到一个 `Unauthorized` 错误。

```typescript
@Injectable()
export class GqlLocalAuthGuard extends AuthGuard('local') {
  getRequest(context: ExecutionContext) {
    const gqlExecutionContext = GqlExecutionContext.create(context);
    const gqlContext = gqlExecutionContext.getContext();
    const gqlArgs = gqlExecutionContext.getArgs();

    gqlContext.req.body = { ...gqlContext.req.body, ...gqlArgs };
    return gqlContext.req;
  }
}
```
