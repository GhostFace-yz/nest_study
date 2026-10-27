# Authorization

Source: https://docs.nestjs.com/security/authorization

`@nestjs/authorization` 将权限表示为**策略**：其方法回答“此用户可以这样做吗？”的类。策略是一个普通的提供者，因此它可以注入服务，并且每个检查都是针对它调用的策略方法进行类型检查的。策略适用于任何数据形状，包括 Prisma,Drizzle 然后疑惑地回来。

在本教程中，您将向 API 猫粮和用品网上商店：

- 客人和客户浏览发布的产品。工作人员也可以看到草稿，只有工作人员编辑目录。
- 顾客只能看到自己的订单。工作人员看到了所有的。
- 只有员工退款订单，只有付款订单，并且只能在财务设定的每人限额内退款。没有人会退款已经发货的订单。
- 管理员不受限制地管理目录。

在此过程中，您将看到每种检查属于哪里（在路由上或在服务中），何时拒绝是 401，何时是 403，以及如何测试策略。

#### 先决条件

本教程继续 [Authentication](/security/authentication) 教程：商店使用 `@nestjs/authentication` 这个页面决定了他们可以做什么。安装软件包：

```bash
$ npm i --save @nestjs/authorization
```

如果您是新手，下面的文件是此页面所依赖的登录代码：身份验证教程的应用程序 [向移动应用程序发放令牌](/security/authentication#issue-tokens-to-the-mobile-app)，简化为移动应用程序的登录，承载令牌的密码。用户是同一个普通对象，与您的 ORM 会返回它：

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

四个演示帐户代表用户表：两个客户（Alice 和 Bob）、一个员工（Sam）和 Ada，他是员工和管理员。它们的 id 是固定的，因此演示订单和测试可以引用它们：

```typescript
import type { User } from './user.js';

/**
 * The demo accounts. They all sign in with the password "catnip4all", and the
 * seeded orders refer to their ids.
 */
export const alice: User = {
  id: '1f794c55-472e-42b9-8913-4114964ed6fb',
  email: 'alice@example.com',
  emailVerified: true,
  roles: ['customer'],
};

export const bob: User = {
  id: 'fc27b5c1-62b5-494e-9924-28a66d387fd1',
  email: 'bob@example.com',
  emailVerified: true,
  roles: ['customer'],
};

export const sam: User = {
  id: '208a223b-3503-4255-83e7-22d290e331c3',
  email: 'sam@example.com',
  emailVerified: true,
  roles: ['staff'],
};

export const ada: User = {
  id: 'ae34ca97-f82b-49ab-b332-8808f3b0e240',
  email: 'ada@example.com',
  emailVerified: true,
  roles: ['staff', 'admin'],
};

export const demoUsers = [alice, bob, sam, ada];
```

`UsersRepository` 是身份验证教程的，有这个页面需要的两种方法。它在启动时播种模拟帐户，并且只 `User` 对象离开它：密码散列留在里面。

```typescript
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { demoUsers } from './demo-users.js';
import type { User } from './user.js';

interface UserRow extends User {
  passwordHash: string | null;
}

/**
 * In-memory stand-in for your data layer (Prisma, Drizzle, TypeORM, ...).
 * Only `User` objects leave this class: password hashes stay inside.
 */
@Injectable()
export class UsersRepository implements OnModuleInit {
  private readonly rows = new Map<string, UserRow>();

  constructor(private readonly passwordHasher: PasswordHasher) {}

  async onModuleInit() {
    // Seeds the demo accounts, all with the password "catnip4all".
    const passwordHash = await this.passwordHasher.hash('catnip4all');
    for (const user of demoUsers) {
      this.rows.set(user.id, { ...user, passwordHash });
    }
  }

  async findById(id: string): Promise<User | null> {
    const row = this.rows.get(id);
    return row ? toUser(row) : null;
  }

  /** For password sign-in only. */
  async findCredentials(email: string): Promise<{ user: User; passwordHash: string | null } | null> {
    const row = this.findRow(email);
    return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
  }

  private findRow(email: string) {
    const normalized = normalize(email);
    return [...this.rows.values()].find((row) => row.email === normalized);
  }
}

const normalize = (email: string) => email.trim().toLowerCase();
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

这些令牌是身份验证教程发布到其移动应用程序的令牌：短命 JWT 访问令牌，由 `accessToken` 根模块传递到的选项 `AuthenticationModule` 以下。签名秘密是 `JWT_SECRET` 来自身份验证教程的 `.env` 文件，至少 32 字节：

```bash
# Generate with: openssl rand -base64 32
JWT_SECRET=
```

> info **Hint** 教程中写道 `process.env` 直接，长话短说。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 使用验证模式，因此缺少的秘密会在启动时停止应用程序，并从 `ConfigService`.

`JwtAuth` 使用 `accessToken` 选项，并加载令牌的用户。它注册到 `AuthenticationRegistry` 从它的构造函数，这就是守卫了解它的方式：

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
    // Adds this provider to the chain the guard runs for every request.
    registry.registerProvider(this);
  }

  // Called after the signature and claims checked out.
  // Returning null (the user was deleted) rejects the token.
  validate({ sub }: JwtClaims) {
    return sub ? this.usersRepository.findById(sub) : null;
  }
}
```

`CredentialsService` 根据存储的散列检查密码，使用包的 `PasswordHasher`，和答案 `null` 对于未知的电子邮件和错误的密码，同时：

```typescript
import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  /** The user, or `null` when the email or the password is wrong. */
  async verify(email: string, password: string): Promise<User | null> {
    const found = await this.usersRepository.findCredentials(email);
    // With no account (or no password), verify() checks a dummy hash, so the
    // response time does not reveal which emails are registered.
    const valid = await this.passwordHasher.verify(password, found?.passwordHash);
    if (!valid || !found?.passwordHash) {
      return null;
    }
    return found.user;
  }
}
```

`TokensController` 交换令牌的电子邮件和密码。它的请求主体会根据您的应用程序已经使用的任何内容进行验证。每一 DTO 这个页面出现了两次，作为一个带有装饰器的类和一个 Zod 模式，所以选择你有的样式并跳过其他列表：

```typescript
import { IsEmail, IsString } from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

```typescript
import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email(),
  password: z.string(),
});
export type SignInDto = z.infer<typeof signInSchema>;
```

`TokenService.issue()` 用相同的字符签署访问令牌 `accessToken` 选项，并返回一个刷新令牌：

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
}
```

对于 Zod 模式，body 参数声明其模式而不是类：

```typescript
import { signInSchema, type SignInDto } from './auth.schemas.js';
// ...
@Post()
@HttpCode(200)
async issue(@Body({ schema: signInSchema }) body: SignInDto) {
  // ...
}
```

> info **Hint** DTO 仅由验证管道强制执行：bind `ValidationPipe` 在全球范围内，作为一个 `APP_PIPE` 提供者 `AppModule` 或与 `useGlobalPipes()` 在 `main.ts`.使用 Zod 模式，绑定 `StandardSchemaValidationPipe` 相反，同样的方法。应用程序使用其中之一。这个 [验证](/application/validation) 页面有每个选项。

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { CredentialsService } from './credentials.service.js';
import { JwtAuth } from './jwt-auth.provider.js';
import { TokensController } from './tokens.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [TokensController],
  providers: [JwtAuth, CredentialsService],
})
export class AuthModule {}
```

身份验证将登录 `User` 在 `request.user`，和 `@CurrentUser()` 将其注入处理程序。这就是它所需要的所有授权。

#### 注册授权模块

导入根模块中 `AuthenticationModule` 旁边的 `AuthorizationModule`。`AuthenticationModule` 按照身份验证教程中的方式注册，具有 `accessToken` 选项；`JwtAuth` 是 `AuthModule` 的提供者：

```typescript
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    // Authentication first: its guard sets request.user, which authorization reads.
    AuthenticationModule.forRootAsync({
      useFactory: () => ({
        accessToken: {
          key: process.env.JWT_SECRET!,
          issuer: 'https://api.example.com',
          audience: 'mobile-app',
          ttl: '15m',
        },
      }),
    }),
    AuthorizationModule.forRoot(),
    AuthModule,
  ],
})
export class AppModule {}
```

`forRoot()` 全局注册模块。它做三件事：

- 它提供 `AuthorizationService`，您可以在代码检查权限的任何地方注入它。
- It 注册 `AuthorizationGuard` 作为一名全球警卫。警卫强制执行 `@Can()` 您将在下一步添加装饰器，并且**默认拒绝**：处理程序仅在声明检查时才运行，使用 `@Can()`，与 `@Can.Anyone()`，或与 `@Public()` 来自 `@nestjs/authentication`，算作 `@Can.Anyone()`. `POST /auth/token` 是 `@Public()`，所以它继续工作。
- 它将拒绝服务报告转换为 401 或 403，如 [Tell guests from forbidden users, and expose permissions](/security/authorization#tell-guests-from-forbidden-users-and-expose-permissions) 解释道。

一条路线 `@Can()` 因此，被遗忘是封闭的，而不是开放的。在启动时，模块记录它将以这种方式拒绝的每个处理程序，因此列表是迁移开始的地方。这个 [参考](/security/authorization#what-a-route-declares) 有完整的规则。

这两个包都注册了一个全球卫士，**进口订单很重要**。Nest 按照扫描模块的顺序运行全局防护，因此 `AuthenticationModule` 必须先来。按照相反的顺序，授权守卫将在任何设置之前运行 `request.user`,所以每一个 `@Can()`check 将看到一名客人，一名已登录的工作人员将在仅限员工的路线上获得 401。`AuthorizationModule` 启动时检查订单：它识别 `AuthenticationGuard` 通过守卫携带的标记，当该守卫排在第二位时，应用程序拒绝启动，并出现一个错误，命名守卫和修复程序。

> warning **Warning** 其他身份验证防护，例如 Passport 的 `AuthGuard()`，不携带这样的标记，因此检查只能通过它们的类名。在错误的顺序中，它会记录一个错误，应用程序启动，每次 `@Can()`check 将登录用户视为客人。注册这样的警卫 `APP_GUARD`，不与 `app.useGlobalGuards()`:Nest 运行守卫在每次之后都这样添加 `APP_GUARD`，所以他们总是在授权卫士后面来，支票看不到他们。

> info **Hint** 守卫从 `request.user` 以及 WebSockets、微服务和 GraphQL 的等效位置读取用户。对于 `@nestjs/authentication`，在 WebSocket 或 `graphql-ws` 套接字上，它是每个消息或操作的用户，而不是套接字的用户，正如 [参考](/security/authorization#reference) 所解释的那样。如果您的身份验证将用户存储在其他地方，请将 `getUser` 函数传递给 `forRoot()`，或者在需要提供程序时从 `forRootAsync()` 工厂返回一个函数。如果使用 `@UseGuards()` 而不是全局保护进行身份验证，请传递 `globalGuard: false`，并在身份验证保护后列出 `AuthorizationGuard`。

#### 为产品编写政策

产品也是简单的物体，通过一个子弹来识别，并以美分为单位定价，如身份验证教程中所述：

```typescript
export interface Product {
  /** A slug, such as `salmon-kibble-2kg`. */
  id: string;
  name: string;
  /** In cents. */
  price: number;
  published: boolean;
}

export type ProductInput = Omit<Product, 'id'>;
```

策略是用 `@Policy()` 装饰的类。每个以用户为第一个参数并返回 `boolean` 或 `Promise<boolean>` 的方法都是一个**能力**。只有文字 `true` 允许。任何其他价值都否认，即使是真实的价值。

```typescript
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Product } from './product.js';

const isStaff = (user: User | null) => !!user?.roles.includes('staff');

@Policy()
export class ProductPolicy {
  // `null` is a guest. Everyone sees published products; staff also see drafts.
  view(user: User | null, product: Product) {
    return product.published || isStaff(user);
  }

  viewDrafts(user: User | null) {
    return isStaff(user);
  }

  create(user: User | null) {
    return isStaff(user);
  }

  update(user: User | null) {
    return isStaff(user);
  }
}
```

用户参数的类型是一个决定。 `User | null` 这意味着该能力也适用于客人，客人以 `null`.客人可以浏览目录，所以这里的每个能力都接受 `null`，和 `view` 和 `viewDrafts` 给客人一个真实的答案。

`ProductsService` 以两种方式使用策略。`can()` 解决为 `true` 或 `false`；在这里，它决定列表是否包括草稿。`authorize()` 当异能被拒绝时掷出，所以 `findOne()` 永远不会将草稿返回给可能看不到它的人。

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Product, ProductInput } from './product.js';
import { ProductPolicy } from './product.policy.js';

@Injectable()
export class ProductsService {
  // Stands in for your products table.
  private readonly products: Product[] = [
    { id: 'salmon-kibble-2kg', name: 'Salmon kibble, 2 kg', price: 2499, published: true },
    { id: 'clumping-litter-10l', name: 'Clumping litter, 10 l', price: 1599, published: true },
    { id: 'heated-cat-bed', name: 'Heated cat bed', price: 5499, published: false },
  ];

  constructor(private readonly authorizationService: AuthorizationService) {}

  async findAll(user: User | null) {
    const withDrafts = await this.authorizationService.can(ProductPolicy, 'viewDrafts', user);
    return withDrafts ? this.products : this.products.filter((product) => product.published);
  }

  async findOne(user: User | null, id: string) {
    const product = this.find(id);
    await this.authorizationService.authorize(ProductPolicy, 'view', user, product);
    return product;
  }

  create(input: ProductInput) {
    const product = { ...input, id: slug(input.name) };
    this.products.push(product);
    return product;
  }

  update(id: string, changes: Partial<ProductInput>) {
    return Object.assign(this.find(id), changes);
  }

  remove(id: string) {
    this.products.splice(this.products.indexOf(this.find(id)), 1);
  }

  private find(id: string) {
    const product = this.products.find((product) => product.id === id);
    if (!product) {
      throw new NotFoundException();
    }
    return product;
  }
}

/** `Sisal scratching post` → `sisal-scratching-post`. */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
```

创建和更新产品并不依赖于特定的记录，因此这些检查会顺利进行。这些路由的主体是 DTO，作为类或作为 Zod 模式；更新获取新产品字段的任何子集：

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsPositive()
  price: number;

  @IsBoolean()
  published: boolean;
}

/** Any subset of the fields above. */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
```

```typescript
import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  published: z.boolean(),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

/** Any subset of the fields above. */
export const updateProductSchema = createProductSchema.partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
```

`@Can(ProductPolicy, 'create')` 警卫打电话 `create(user)` 在处理程序运行之前：

```typescript
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import { ProductPolicy } from './product.policy.js';
import { CreateProductDto, UpdateProductDto } from './products.dto.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Authenticate({ optional: true })
  @Can.Anyone()
  findAll(@CurrentUser() user: User | null) {
    return this.productsService.findAll(user);
  }

  @Get(':id')
  @Authenticate({ optional: true })
  @Can.Anyone()
  findOne(@CurrentUser() user: User | null, @Param('id') id: string) {
    return this.productsService.findOne(user, id);
  }

  @Post()
  @Can(ProductPolicy, 'create')
  create(@Body() input: CreateProductDto) {
    return this.productsService.create(input);
  }

  @Patch(':id')
  @Can(ProductPolicy, 'update')
  update(@Param('id') id: string, @Body() changes: UpdateProductDto) {
    return this.productsService.update(id, changes);
  }
}
```

对于 Zod 模式，主体参数声明它们的模式而不是类：

```typescript
import { createProductSchema, updateProductSchema, type CreateProductDto, type UpdateProductDto } from './products.schemas.js';
// ...
@Post()
@Can(ProductPolicy, 'create')
create(@Body({ schema: createProductSchema }) input: CreateProductDto) {
  return this.productsService.create(input);
}

@Patch(':id')
@Can(ProductPolicy, 'update')
update(@Param('id') id: string, @Body({ schema: updateProductSchema }) changes: UpdateProductDto) {
  return this.productsService.update(id, changes);
}
```

路线是否允许客人是身份验证的决定，而不是策略的决定。读路由使用 `@Authenticate()` 和 `optional: true`：具有有效令牌的请求获取其用户，而没有有效令牌的请求继续使用 `null`，这是什么 `@CurrentUser()` 然后注射。如果没有装饰人员，客人将在任何保单运行之前获得 401。和 `@Public()` 相反，身份验证将完全忽略令牌，因此 Sam 将以访客身份浏览，永远不会看到草稿。

读取路由签入服务，因此它们声明 `@Can.Anyone()`：任何身份验证允许通过的人都可以呼叫他们，并且 `ProductsService` 决定每个呼叫者看到什么。没有它，警卫会拒绝他们。

`@Can()` 是类型检查的。拼写错误的能力不会编译：

```typescript
@Post()
@Can(ProductPolicy, 'craete')
// error TS2345: Argument of type '"craete"' is not assignable to parameter of type '"create" | "update" | "view" | "viewDrafts"'.
create(@Body() input: CreateProductDto) {}
```

错误列出了在路由上起作用的能力：那些用户参数接受的能力 `null`，因为守卫无法知道路由是否有用户。 `view` 是其中之一，但是 `@Can(ProductPolicy, 'view')` 仍然无法编译（`Expected 3 arguments, but got 2`): `view` 也拿了产品，守卫没有一个可以通过。需要记录的检查属于服务，如 `findOne()`.只需要来自 URL 可以留在路线上，因为 [Check a route parameter](/security/authorization#check-a-route-parameter) 显示。

最后，将策略注册为其功能模块的提供者：

```typescript
import { Module } from '@nestjs/common';
import { ProductPolicy } from './product.policy.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductPolicy],
})
export class ProductsModule {}
```

将 `ProductsModule` 添加到 `AppModule` 的 `imports` 中。`@Policy()` 还使类可注入，授权模块发现应用程序中的每个策略提供程序，无论它在哪里注册。或者，在 `AuthorizationModule.forRoot()` 的 `policies` 选项中列出策略。

> info **Hint** 如果一个 `@Can()` 指向无人注册的策略，应用程序拒绝启动，错误命名处理程序。

#### 逐条检查订单

订单是身份验证教程的：它属于客户，通过 `userId`，并经过几个状态：

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

Alice 是否可以查看 Bob 的订单取决于该订单，因此这些能力将订单作为第二个参数：

```typescript
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Order } from './order.js';

@Policy()
export class OrderPolicy {
  viewAll(user: User) {
    return user.roles.includes('staff');
  }

  // Customers see their own orders; staff see everyone's.
  view(user: User, order: Order) {
    return order.userId === user.id || user.roles.includes('staff');
  }

  // Staff refund paid orders. Pending, shipped and refunded orders
  // can't be refunded by anyone.
  refund(user: User, order: Order) {
    return user.roles.includes('staff') && order.status === 'paid';
  }
}
```

这些异能需要 `User`，而不是 `User | null`。每个订单路由都需要一个登录用户，只有服务调用才能这样说。然后，编译器会让调用者在检查之前排除丢失的用户。

订单表中有四个演示订单，具有与演示账户相同的固定 ID：Alice 有一个已付款订单和一个已发货订单，Bob 支付了五袋鲑鱼粗粮中的一袋（124.95，这很重要 [策略注入服务](/security/authorization#inject-a-service-into-a-policy)）和一个悬而未决的：

```typescript
import { alice, bob } from '../users/demo-users.js';
import type { Order } from './order.js';

/** The demo orders: Alice has a paid and a shipped one, Bob a paid and a pending one. */
export const alicePaid: Order = {
  id: 'b69f25e7-db50-4abe-86d3-2ef2bd148009',
  userId: alice.id,
  items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }],
  total: 2499,
  status: 'paid',
};

export const aliceShipped: Order = {
  id: 'd626a0c1-4122-4f83-ab7a-b009c26f35c7',
  userId: alice.id,
  items: [{ productId: 'clumping-litter-10l', quantity: 1 }],
  total: 1599,
  status: 'shipped',
};

export const bobPaid: Order = {
  id: '0ea8343b-879d-4b83-884b-6d5bb02f802f',
  userId: bob.id,
  items: [{ productId: 'salmon-kibble-2kg', quantity: 5 }],
  total: 12495,
  status: 'paid',
};

export const bobPending: Order = {
  id: '7e7023d3-cb2a-48d2-8c4e-20c07e6b8c06',
  userId: bob.id,
  items: [{ productId: 'clumping-litter-10l', quantity: 1 }],
  total: 1599,
  status: 'pending',
};

export const demoOrders = [alicePaid, aliceShipped, bobPaid, bobPending];
```

`OrdersService` 加载订单，然后对其进行授权：

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import { demoOrders } from './demo-orders.js';
import type { Order } from './order.js';
import { OrderPolicy } from './order.policy.js';

@Injectable()
export class OrdersService {
  // Stands in for your orders table: copies, since a refund changes an order's status.
  private readonly orders: Order[] = demoOrders.map((order) => ({ ...order }));

  constructor(private readonly authorizationService: AuthorizationService) {}

  async findAll(user: User) {
    // Filter lists in the query; policies check one record at a time.
    return (await this.authorizationService.can(OrderPolicy, 'viewAll', user))
      ? this.orders
      : this.orders.filter((order) => order.userId === user.id);
  }

  async findOne(user: User, id: string) {
    const order = this.find(id);
    await this.authorizationService.authorize(OrderPolicy, 'view', user, order);
    return order;
  }

  async refund(user: User, id: string) {
    const order = this.find(id);
    await this.authorizationService.authorize(OrderPolicy, 'refund', user, order);
    // Refund the payment through the payment provider here, then record it.
    order.status = 'refunded';
    return order;
  }

  private find(id: string) {
    const order = this.orders.find((order) => order.id === id);
    if (!order) {
      throw new NotFoundException();
    }
    return order;
  }
}
```

策略类之后的所有内容都是从能力的签名中键入的：能力名称、用户和顺序。拼写错误的能力、缺少的顺序或不是 `Order` 的对象不会编译，可能是 `null` 的用户也不会编译：

```typescript
async show(user: User | null, order: Order) {
  await this.authorizationService.authorize(OrderPolicy, 'view', user, order);
  // error TS2345: Argument of type 'User | null' is not assignable to parameter of type 'User'.
}
```

列表不会逐一检查订单。它会问一个查询可以使用的问题（这个用户可以看到每个订单吗？）和数据库中的过滤器。在加载所有行后检查每一行会获取太多内容并破坏分页。

签入服务而不是控制器意味着每个调用者都得到相同的规则：一个控制器，一个 GraphQL 解析器，或处理退款请求的队列工作者。

控制器传递已登录的用户。认证教程的 `OrdersService` 改为从 `AuthenticationContext` 读取；这里是一个参数，所以服务的签名说明了检查是关于谁的权限，队列工作人员可以为给定的用户调用它。每个路由都会检查服务，因此每个路由都声明 `@Can.Anyone()`：

```typescript
import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Can.Anyone()
  findAll(@CurrentUser() user: User) {
    return this.ordersService.findAll(user);
  }

  @Get(':id')
  @Can.Anyone()
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ordersService.findOne(user, id);
  }

  @Post(':id/refund')
  @HttpCode(200)
  @Can.Anyone()
  refund(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ordersService.refund(user, id);
  }
}
```

```typescript
import { Module } from '@nestjs/common';
import { OrderPolicy } from './order.policy.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderPolicy],
})
export class OrdersModule {}
```

将 `OrdersModule` 添加到 `AppModule` 的 `imports` 中。Alice 现在从 `GET /orders` 获得了两个订单，从 `GET /orders/:id` 获得了一个 403 订单，用于 Bob 的一个订单。

> info **Hint** 403 确认订单存在。如果这很重要，例如当 id 是连续的和可猜测的时，请检查 `can()` 扔一个 `NotFoundException` 反而。

#### 检查路由参数

有些检查需要参数，但不需要记录。工作人员在以下位置查找客户的订单 `GET /customers/:customerId/orders` 客户也可以在那里列出他们自己的。爱丽丝是否可以调用它取决于 URL 单独，所以在检查之前没有任何东西需要加载。为它添加一个能力 `OrderPolicy`:

```typescript
// Customers list their own orders; staff list anyone's. A guest is denied.
viewOrdersOf(user: User | null, customerId: string) {
  return !!user && (user.id === customerId || user.roles.includes('staff'));
}
```

与其他能力不同 `OrderPolicy`，这个需要 `User | null`，因为一个路由能力必须接受一个客人。路由检查它 `@Can()`，其第三个参数从调用中读取用户之后的参数：

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { OrderPolicy } from './order.policy.js';
import { OrdersService } from './orders.service.js';

@Controller('customers/:customerId/orders')
export class CustomerOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Can(OrderPolicy, 'viewOrdersOf', (context) => [context.switchToHttp().getRequest().params.customerId])
  findAll(@Param('customerId') customerId: string) {
    return this.ordersService.findByCustomer(customerId);
  }
}
```

`OrdersService` 获取一个按客户过滤的方法，而不需要自己检查，因为路由有它：

```typescript
findByCustomer(customerId: string) {
  return this.orders.filter((order) => order.userId === customerId);
}
```

将控制器添加到 `controllers` 的 `OrdersModule` 爱丽丝现在从 `GET /customers/<Alice's id>/orders` 鲍勃的 403，山姆得到任何一个，客人得到 401。

该函数由能力本身的参数类型。当能力占用的时间超过用户时，省略它不会编译，返回错误的类型也不会编译：

```typescript
@Get()
@Can(OrderPolicy, 'viewOrdersOf')
// error TS2554: Expected 3 arguments, but got 2.
findAll() {}

@Get()
@Can(OrderPolicy, 'viewOrdersOf', () => [42])
// error TS2322: Type 'number' is not assignable to type 'string'.
findAll() {}
```

它运行在防护中，在任何管道之前，所以它在传输传递它们时获得值：路由参数是字符串，还没有任何东西被验证。一个 `ParseUUIDPipe` 在 `customerId` 在检查之后运行，用户可能看不到的 id 得到 403，而不是 400。函数抛出的错误，例如 `BadRequestException` 对于缺少的参数，将达到 HTTP 客户端。在 WebSocket 和微服务上， Nest 报告和 `HttpException` 从任何警卫，这个函数包括，作为一个内部错误，所以抛出一个 `WsException` 或者一个 `RpcException` 那里。拒绝事件携带函数在其 `args`.

传递标识符和作用域，而不是记录。在防护中加载订单将加载它两次，一次用于检查，一次在处理程序中，并且在处理程序可以回答 404 之前回答 403。这就是为什么 `GET /orders/:id` 而是在服务中签入。

声明的函数返回一个数组，而不是能力参数描述的元组，因此以 `as const` 结尾。这使得小助手可以跨路由重复使用：

```typescript
import type { ExecutionContext } from '@nestjs/common';

/** Reads one route param for `@Can()`. */
export const param = (name: string) => (context: ExecutionContext) =>
  [context.switchToHttp().getRequest().params[name] as string] as const;
```

```typescript
@Can(OrderPolicy, 'viewOrdersOf', param('customerId'))
```

对于其他传输，请从它们自己的上下文中阅读参数：`GqlExecutionContext.create(context).getArgs()` 对于一个 GraphQL 操作的参数，`context.switchToWs().getData()` 对于 WebSocket 消息，以及 `context.switchToRpc().getData()` 对于微服务消息。

#### 让管理员通过 `before()`

管理员可以对目录做任何事情，包括删除产品，这是其他人不能做的。不要为每个能力添加管理检查，而是给策略一个 `before()` 钩子：

```typescript
import { Policy, type PolicyBefore } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Product } from './product.js';

const isStaff = (user: User | null) => !!user?.roles.includes('staff');

@Policy()
export class ProductPolicy implements PolicyBefore<User> {
  // Admins pass every check below, including abilities added later.
  before(user: User | null) {
    if (user?.roles.includes('admin')) {
      return true;
    }
  }

  // `null` is a guest. Everyone sees published products; staff also see drafts.
  view(user: User | null, product: Product) {
    return product.published || isStaff(user);
  }

  viewDrafts(user: User | null) {
    return isStaff(user);
  }

  create(user: User | null) {
    return isStaff(user);
  }

  update(user: User | null) {
    return isStaff(user);
  }

  // Nobody but admins, who get through in before().
  delete(_user: User | null) {
    return false;
  }
}
```

`before()` 运行在其策略的每个功能之前，无论是路由检查还是服务检查。它接收用户、能力名称和能力参数。返回 `true` 允许， `false` 否认，或者什么都不让能力来决定。客人到达 `before()` 也是，所以它的用户参数必须接受 `null`. `before(user: User)` 不编译，无论类是否实现 `PolicyBefore<User>`.

将使用新能力的路由添加到 `ProductsController`，并从 `@nestjs/common` 导入 `Delete` 和 `HttpCode`：

```typescript
@Delete(':id')
@HttpCode(204)
@Can(ProductPolicy, 'delete')
remove(@Param('id') id: string) {
  this.productsService.remove(id);
}
```

山姆现在从 `DELETE /products/clumping-litter-10l` 艾达得了 204。

> warning **Warning** `before()` 跳过其策略的每一个功能，包括应该约束每个人的规则。这就是为什么 `OrderPolicy` 没有管理旁路：“没有人退款已发货的订单”也必须为 Ada 保留。如果策略同时需要这两种功能，请检查该功能名称 `before()` 接收，并且不返回它不得跳过的异能。实施 `PolicyBefore<User, Ability<OrderPolicy>>` 并键入名称为 `Ability<OrderPolicy>`，因此拼写错误的排除不会编译。

#### 将服务注入策略

财务限制了每个员工可以自己退款的金额：默认为 100.00，有些人甚至更多。限制存在于策略之外，存在于读取表或配置服务的服务中：

```typescript
import { Injectable } from '@nestjs/common';
import { ada } from '../users/demo-users.js';
import type { User } from '../users/user.js';

@Injectable()
export class RefundLimitsService {
  // Per-person limits set by finance, in cents, by user id. Stands in for a table or a config service.
  private readonly limits = new Map<string, number>([[ada.id, 100_000]]);

  async maxRefundFor(user: User): Promise<number> {
    return this.limits.get(user.id) ?? 10_000;
  }
}
```

因为策略是提供程序，所以它通过其构造函数注入服务。`refund` 异能变为 `async`：

```typescript
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Order } from './order.js';
import { RefundLimitsService } from './refund-limits.service.js';

@Policy()
export class OrderPolicy {
  constructor(private readonly refundLimitsService: RefundLimitsService) {}

  viewAll(user: User) {
    return user.roles.includes('staff');
  }

  // Customers see their own orders; staff see everyone's.
  view(user: User, order: Order) {
    return order.userId === user.id || user.roles.includes('staff');
  }

  // Customers list their own orders; staff list anyone's. A guest is denied.
  viewOrdersOf(user: User | null, customerId: string) {
    return !!user && (user.id === customerId || user.roles.includes('staff'));
  }

  // Staff refund paid orders up to their limit. Pending, shipped and
  // refunded orders can't be refunded by anyone.
  async refund(user: User, order: Order) {
    if (!user.roles.includes('staff') || order.status !== 'paid') {
      return false;
    }
    return order.total <= (await this.refundLimitsService.maxRefundFor(user));
  }
}
```

`authorize()`,`can()` 守卫都在等待异步能力，所以 `OrdersService` 不会改变。在策略旁边注册服务：

```typescript
import { Module } from '@nestjs/common';
import { CustomerOrdersController } from './customer-orders.controller.js';
import { OrderPolicy } from './order.policy.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { RefundLimitsService } from './refund-limits.service.js';

@Module({
  controllers: [OrdersController, CustomerOrdersController],
  providers: [OrdersService, OrderPolicy, RefundLimitsService],
})
export class OrdersModule {}
```

自从 `OrderPolicy` 注册于 `OrdersModule`，它可以注入该模块的提供程序。列于 `policies` 选择 `forRoot()` 而是生活在授权模块中，并且需要 `imports` 到达其依赖项的选项。

鲍勃的付费订单达到 124.95。Sam（限额 100.00）现在在试图退款时得到 403，Ada（限额 1,000.00）成功了。

> warning **Warning** 策略必须是单例的。请求作用域或瞬态策略，或者依赖于请求作用域提供程序的策略，会导致启动。将每个请求状态排除在策略之外，并将能力需要的作为参数传递。

#### 告知客人禁止使用的用户，并暴露权限

被拒绝的请求会得到 401 或 403，具体取决于请求人和请求地点：

| 打电话的人 | 路线 | 状况 | 来自 |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------- |
| 客人 | 需要登录（默认值），例如 `POST /products` 或者 `GET /orders` | 401，与 `WWW-Authenticate: Bearer realm="store"` | 在运行任何策略之前进行身份验证 |
| 客人 | 可选身份验证，策略拒绝 `null`，如草稿产品 | 401 | 授权 |
| 登录用户 | 政策否认，比如爱丽丝 `POST /products` 或者是鲍勃的命令 | 403 | 授权 |

授权从不决定一条路由是否需要用户；这就是身份验证的工作。当策略拒绝访客时，包会回答 401（“登录并重试”）而不是 403（“从不”），因为登录可能会更改答案。

`authorize()` 它本身抛出一个 `AuthorizationError`，谁的 `reason` 是 `unauthenticated` 或者 `forbidden`，以及谁的 `status` 是匹配 401 或 403。这不是一个 HTTP 例外，因为相同的服务也在队列工作器和 WebSocket 网关中运行。当错误离开处理程序时， `AuthorizationModule` 把它变成 `UnauthorizedException` 或者 `ForbiddenException` 使用相同的主体，因此异常过滤器和客户端可以像其他任何人一样处理这两者 HTTP 错误。在 WebSocket 网关和微服务处理程序中，它成为 `WsException` 或者一个 `RpcException`.403 机构没有说出这个能力的名字。

`can()` 永远不要拒绝。它决心 `false` 对于访客和被禁止的用户来说，这使它成为塑造响应的工具。给每个订单一个 `canRefund` 标志，因此前端显示退款按钮，而不会复制规则：

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import { demoOrders } from './demo-orders.js';
import type { Order } from './order.js';
import { OrderPolicy } from './order.policy.js';

export type OrderView = Order & { canRefund: boolean };

@Injectable()
export class OrdersService {
  // Stands in for your orders table: copies, since a refund changes an order's status.
  private readonly orders: Order[] = demoOrders.map((order) => ({ ...order }));

  constructor(private readonly authorizationService: AuthorizationService) {}

  async findAll(user: User): Promise<OrderView[]> {
    // Filter lists in the query; policies check one record at a time.
    const orders = (await this.authorizationService.can(OrderPolicy, 'viewAll', user))
      ? this.orders
      : this.orders.filter((order) => order.userId === user.id);
    return Promise.all(orders.map((order) => this.toView(user, order)));
  }

  async findOne(user: User, id: string): Promise<OrderView> {
    const order = this.find(id);
    await this.authorizationService.authorize(OrderPolicy, 'view', user, order);
    return this.toView(user, order);
  }

  async refund(user: User, id: string): Promise<OrderView> {
    const order = this.find(id);
    await this.authorizationService.authorize(OrderPolicy, 'refund', user, order);
    // Refund the payment through the payment provider here, then record it.
    order.status = 'refunded';
    return this.toView(user, order);
  }

  private async toView(user: User, order: Order): Promise<OrderView> {
    return { ...order, canRefund: await this.authorizationService.can(OrderPolicy, 'refund', user, order) };
  }

  private find(id: string) {
    const order = this.orders.find((order) => order.id === id);
    if (!order) {
      throw new NotFoundException();
    }
    return order;
  }
}
```

旗帜来自同一个 `refund` 能力 `POST /orders/:id/refund` 强制执行，因此按钮和端点不能不一致。山姆看到 `canRefund: true` 根据爱丽丝的付费订单和 `false` 在鲍勃家，这超出了他的极限。艾达看到了 `true` 两者都有。

#### 试试

使用 `.env` 保存签名秘密的文件：

```bash
$ npm run start:dev -- --env-file .env
```

在另一个终端，以 Alice、Sam 和 Ada 的身份登录。`--json`（curl 7.82 或更高版本）发送 `POST` 用一个 JSON 身体，以及 `token` 助手使用 [jq](https://jqlang.org/) 要提取访问令牌，请执行以下操作：

```bash
$ token() { curl -s localhost:3000/auth/token --json "{\"email\":\"$1@example.com\",\"password\":\"catnip4all\"}" | jq -r .accessToken; }
$ ALICE=$(token alice) SAM=$(token sam) ADA=$(token ada)
```

客人查看已发布的产品。工作人员也看到了草案：

```bash
$ curl localhost:3000/products
[{"id":"salmon-kibble-2kg","name":"Salmon kibble, 2 kg","price":2499,"published":true},{"id":"clumping-litter-10l","name":"Clumping litter, 10 l","price":1599,"published":true}]

$ curl -s localhost:3000/products -H "Authorization: Bearer $SAM" | jq -c '.[] | {id, published}'
{"id":"salmon-kibble-2kg","published":true}
{"id":"clumping-litter-10l","published":true}
{"id":"heated-cat-bed","published":false}
```

草案本身对客人来说是 401，对客户来说是 403。此处和下方修剪了响应头：

```bash
$ curl -i localhost:3000/products/heated-cat-bed
HTTP/1.1 401 Unauthorized
{"message":"Unauthorized","statusCode":401}

$ curl -i localhost:3000/products/heated-cat-bed -H "Authorization: Bearer $ALICE"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}
```

只有员工添加产品。身份验证停止来宾，并且 `@Can()` 阻止爱丽丝：

```bash
$ curl -i localhost:3000/products --json '{"name":"Sisal scratching post","price":3999,"published":false}'
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="store"
{"message":"Unauthorized","statusCode":401}

$ curl -i localhost:3000/products -H "Authorization: Bearer $ALICE" --json '{"name":"Sisal scratching post","price":3999,"published":false}'
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl localhost:3000/products -H "Authorization: Bearer $SAM" --json '{"name":"Sisal scratching post","price":3999,"published":false}'
{"name":"Sisal scratching post","price":3999,"published":false,"id":"sisal-scratching-post"}
```

爱丽丝看到自己的订单，也不能退款。山姆看到了每一个订单，他自己 `canRefund` 旗帜。鲍勃的付费订单对爱丽丝来说是禁区：

```bash
$ curl -s localhost:3000/orders -H "Authorization: Bearer $ALICE" | jq -c '.[] | {id, status, canRefund}'
{"id":"b69f25e7-db50-4abe-86d3-2ef2bd148009","status":"paid","canRefund":false}
{"id":"d626a0c1-4122-4f83-ab7a-b009c26f35c7","status":"shipped","canRefund":false}

$ curl -s localhost:3000/orders -H "Authorization: Bearer $SAM" | jq -c '.[] | {id, status, total, canRefund}'
{"id":"b69f25e7-db50-4abe-86d3-2ef2bd148009","status":"paid","total":2499,"canRefund":true}
{"id":"d626a0c1-4122-4f83-ab7a-b009c26f35c7","status":"shipped","total":1599,"canRefund":false}
{"id":"0ea8343b-879d-4b83-884b-6d5bb02f802f","status":"paid","total":12495,"canRefund":false}
{"id":"7e7023d3-cb2a-48d2-8c4e-20c07e6b8c06","status":"pending","total":1599,"canRefund":false}

$ curl -i localhost:3000/orders/0ea8343b-879d-4b83-884b-6d5bb02f802f -H "Authorization: Bearer $ALICE"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}
```

山姆退还了爱丽丝的付款订单，但不是她发货的，也不是鲍勃的，这超出了他的限额。Ada 也无法退还已发货的订单，但 Bob 的订单在她的限额内：

```bash
$ curl -s -X POST localhost:3000/orders/b69f25e7-db50-4abe-86d3-2ef2bd148009/refund -H "Authorization: Bearer $SAM" | jq -c '{id, status, canRefund}'
{"id":"b69f25e7-db50-4abe-86d3-2ef2bd148009","status":"refunded","canRefund":false}

$ curl -i -X POST localhost:3000/orders/d626a0c1-4122-4f83-ab7a-b009c26f35c7/refund -H "Authorization: Bearer $SAM"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl -i -X POST localhost:3000/orders/0ea8343b-879d-4b83-884b-6d5bb02f802f/refund -H "Authorization: Bearer $SAM"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl -i -X POST localhost:3000/orders/d626a0c1-4122-4f83-ab7a-b009c26f35c7/refund -H "Authorization: Bearer $ADA"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl -s -X POST localhost:3000/orders/0ea8343b-879d-4b83-884b-6d5bb02f802f/refund -H "Authorization: Bearer $ADA" | jq -c '{id, status, canRefund}'
{"id":"0ea8343b-879d-4b83-884b-6d5bb02f802f","status":"refunded","canRefund":false}
```

只有管理员删除产品：

```bash
$ curl -i -X DELETE localhost:3000/products/clumping-litter-10l -H "Authorization: Bearer $SAM"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl -i -X DELETE localhost:3000/products/clumping-litter-10l -H "Authorization: Bearer $ADA"
HTTP/1.1 204 No Content
```

#### 检测

端到端测试启动整个应用程序，通过真正的端点登录，并检查规则 HTTP.就像在身份验证教程中一样，脚本故意很慢，所以测试会覆盖 `PasswordHasher` 使用更便宜的，应用程序显示 `JWT_SECRET` 在引导下，因此测试配置提供了一个：

```typescript
export default defineConfig({
  // ...
  test: {
    // ...
    env: {
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
    },
  },
});
```

```typescript
import type { INestApplication } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { alicePaid, aliceShipped, bobPaid } from '../src/orders/demo-orders.js';

describe('Orders (e2e)', () => {
  let app: INestApplication;

  const signIn = async (email: string) => {
    const { body } = await request(app.getHttpServer())
      .post('/auth/token')
      .send({ email, password: 'catnip4all' })
      .expect(200);
    return `Bearer ${body.accessToken}`;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // scrypt is slow on purpose; the tests don't need it to be.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 11 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(() => app.close());

  it('asks guests to sign in', async () => {
    await request(app.getHttpServer()).get('/orders').expect(401);
  });

  it('shows customers only their own orders', async () => {
    const alice = await signIn('alice@example.com');
    const { body } = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', alice)
      .expect(200);
    expect(body.map((order: { id: string }) => order.id)).toEqual([alicePaid.id, aliceShipped.id]);

    await request(app.getHttpServer()).get(`/orders/${bobPaid.id}`).set('Authorization', alice).expect(403);
  });

  it('lets staff refund a paid order once, within their limit', async () => {
    const sam = await signIn('sam@example.com');
    const refund = (id: string) =>
      request(app.getHttpServer()).post(`/orders/${id}/refund`).set('Authorization', sam);

    await refund(alicePaid.id).expect(200);
    await refund(alicePaid.id).expect(403); // already refunded
    await refund(aliceShipped.id).expect(403); // shipped
    await refund(bobPaid.id).expect(403); // over Sam's limit
  });
});
```

策略是一个普通类，因此它的规则很容易在没有 Nest 的情况下进行单元测试。自己构建策略并控制其依赖关系；模拟账户和订单兼作固定装置：

```typescript
import { vi } from 'vitest';
import { alice, sam } from '../users/demo-users.js';
import { alicePaid, bobPaid } from './demo-orders.js';
import { OrderPolicy } from './order.policy.js';
import { RefundLimitsService } from './refund-limits.service.js';

describe('OrderPolicy', () => {
  // No Nest here: a policy is a class, so construct it yourself.
  const refundLimits = new RefundLimitsService();
  const policy = new OrderPolicy(refundLimits);

  it('shows customers only their own orders', () => {
    expect(policy.view(alice, alicePaid)).toBe(true);
    expect(policy.view(alice, bobPaid)).toBe(false);
    expect(policy.view(sam, bobPaid)).toBe(true);
  });

  it('lets staff refund paid orders up to their limit', async () => {
    vi.spyOn(refundLimits, 'maxRefundFor').mockResolvedValue(5000);

    expect(await policy.refund(sam, { ...alicePaid, total: 5000 })).toBe(true);
    expect(await policy.refund(sam, { ...alicePaid, total: 5001 })).toBe(false);
    expect(await policy.refund(alice, alicePaid)).toBe(false);
  });

  it('refuses refunds on orders that are not paid', async () => {
    for (const status of ['pending', 'shipped', 'refunded'] as const) {
      expect(await policy.refund(sam, { ...alicePaid, status })).toBe(false);
    }
  });
});
```

调用异能直接跳过 `before()`.钩子只是另一种方法，所以用同样的方法测试它，例如 `expect(new ProductPolicy().before(ada)).toBe(true)`.要同时测试钩子和能力，请执行 `AuthorizationService` 要测试 401/403 映射，请执行 HTTP 就像端到端测试一样。

服务测试介于两者之间：真实策略和 `AuthorizationModule`, 没有 HTTP 或者登录。在处理程序之外，拒绝仍然是 `AuthorizationError`:

```typescript
import { Test } from '@nestjs/testing';
import { AuthorizationError, AuthorizationModule } from '@nestjs/authorization';
import { alice, sam } from '../users/demo-users.js';
import { alicePaid, bobPaid } from './demo-orders.js';
import { OrderPolicy } from './order.policy.js';
import { OrdersService } from './orders.service.js';
import { RefundLimitsService } from './refund-limits.service.js';

describe('OrdersService', () => {
  let orders: OrdersService;

  beforeEach(async () => {
    // The real policy and module, no HTTP and no sign-in.
    const moduleRef = await Test.createTestingModule({
      imports: [AuthorizationModule.forRoot()],
      providers: [OrdersService, OrderPolicy, RefundLimitsService],
    }).compile();
    orders = moduleRef.get(OrdersService);
  });

  it("keeps Bob's order from Alice", async () => {
    await expect(orders.findOne(alice, bobPaid.id)).rejects.toThrow(AuthorizationError);
  });

  it('refunds within the limit only', async () => {
    await expect(orders.refund(sam, bobPaid.id)).rejects.toMatchObject({ reason: 'forbidden', ability: 'refund' });
    expect((await orders.refund(sam, alicePaid.id)).status).toBe('refunded');
  });
});
```

例如，要在更大的测试中替换策略，请像任何提供程序一样覆盖它 `.overrideProvider(OrderPolicy).useValue(...)`：路由和服务中的每次检查都与覆盖相反。

#### 生产检查表

- **将身份验证置于授权之前。** `AuthenticationModule`，错误的导入顺序会在启动时停止应用程序。对于另一个身份验证保护，它只记录一个错误，因此请进行端到端测试登录并调用 `@Can()` 路线。无论导入顺序如何，始终在授权守卫之后运行两个注册：请求范围 `APP_GUARD` （启动检查是这样说的）和 `app.useGlobalGuards()` （它不能）。将身份验证注册为单例 `APP_GUARD`.
- **回顾每一个 `@Can.Anyone()`.**守卫拒绝声明无检查的处理程序，并在启动时记录每个检查，因此被遗忘的处理程序 `@Can()` 关闭路径。`@Can.Anyone()` 向身份验证允许的所有人开放：检查其服务是否授权，或者路由是否不需要权限。检查中的 idURL 可以走这条路，带着 `@Can()` 的第三个参数，其中以后对处理程序的编辑不能删除它。
- **将微服务与 `inheritAppConfig: true`.**在混合应用程序中，Nest 仅在以下情况下在消息处理程序上运行应用程序的全局防护和拦截器 `connectMicroservice()` 获得该选项。没有它，`@Can()` 未强制执行消息处理程序，并且拒绝来自 `authorize()` 作为内部错误而不是 401 或 403 到达客户端。
- **在加载记录后，将记录检查放入服务中**，以便控制器、解析器和队列工作者共享它们。
- **不要在检查记录的路由上缓存 URL 的响应。**在处理程序运行之前，缓存 Nest 的 `CacheInterceptor` 响应，因此它会将 Bob 的命令传递给 Alice，而无需询问 `OrderPolicy`。缓存在检查下方，或每个用户。
- **使用查询可以使用的问题筛选查询中的列表**，例如 `viewAll`，而不是加载每一行并检查每一行。
- **写入时重新检查状态。**授权在退款前读取订单，两个并发请求都可以看到 `paid`.使写成为有条件的（仅在状态仍然存在的地方更新 `paid`），并向支付提供者发送幂等密钥，因此重试永远不会退款两次。
- **在 403 和 404** 之间选择对存在敏感的记录，例如 ID 为顺序时的其他客户订单。
- **保持策略无状态。**它们是所有请求共享的单例。
- **观察成本 `can()` 标志。**每个标志每行运行一次能力，包括任何异步工作。缓存慢速查找，如退款限额，或每个请求加载一次。
- **从配置加载机密。**阅读 JWT 来自秘密管理器的秘密（至少 32 字节）或 `ConfigService`，不是来自代码。
- **检查 `can()` 在您自己的守卫和中间件中。**它们运行在任何处理程序之前，因此一个 `AuthorizationError` 扔在那里不会变成 401 或 403。它变成了 500。
- **审计拒绝。**响应没有说明哪张支票拒绝了呼叫者。订阅 `AuthorizationEvents` 记录策略、能力和用户的 ID 每一次否认。每个事件都携带策略看到的用户和记录，因此记录您需要的字段，而不是整个事件。

#### 参考

##### 模块选项

`AuthorizationModule.forRoot()` 接受这些选项。`forRootAsync()` 在顶层取 `policies`、`imports`、`globalGuard` 和 `isGlobal`，紧邻 `useFactory`，其工厂返回 `getUser`。

| 选择 | 默认的 | 描述 |
| --- | --- | --- |
| `getUser` | `defaultGetUser` | 接收 `ExecutionContext` 并返回当前用户或其承诺的函数。参见 [Register the authorization module](/security/authorization#register-the-authorization-module)。 |
| `policies` | 没有一个 | 在授权模块本身中注册的策略。一个 `@Policy()` 找到任何模块的提供者，但没有列出。 |
| `imports` | 没有一个 | 导出提供程序的模块 `policies` 注射。 |
| `globalGuard` | `true` | 登记 `AuthorizationGuard` 作为一名全球警卫。和 `false`，用 `@UseGuards()` 在你的身份验证警卫之后。 |
| `isGlobal` | `true` | 全局注册模块。 |

`defaultGetUser` 从这些地方读取用户。`null`,`undefined` 和 `false` 都意味着客人。

| 上下文 | 来源 |
| --- | --- |
| HTTP | `request.user` |
| GraphQL | 为此操作记录的用户身份验证，否则 `req.user` 在 GraphQL 上下文 |
| Web 套接字 | 为此消息记录的用户身份验证，否则 `client.user`,然后 `client.data.user` |
| 微服务 | `user` 在传输上下文中，绝不是消息有效载荷 |

WebSocket 客户端是连接，而不是消息 `graphql-ws` 这个 `req` 在 GraphQL 上下文是套接字的升级请求，套接字上的每个操作都共享该请求。所以 `client.user` 和 `req.user` 保存最后经过身份验证的任何消息或操作。`@nestjs/authentication` 还会在客户端和 `req`,下 `Symbol.for('nestjs.authentication.userOf')`，这需要 `ExecutionContext` 以及该消息或操作的用户的答案：`null` 对于一个匿名的人来说，就像每个 `@Public()` 一个是，或者 `undefined` 当它没有答案时。`defaultGetUser` 先问一下。一个 `@Public()` 因此，消息或操作是 `@Can()` 即使在握手登录的套接字上，以及任何地方的注销撤销的会话也不再计算。一个 `getUser` 你自己的 `client.user` 或者 `req.user` 在这些传输上看到套接字的最后一个用户；其他身份验证包可以将相同的功能留待查询。

##### 路由声明什么

守卫根据处理程序及其类声明的内容来决定：

| 宣言 | 守卫 |
| --- | --- |
| `@Can()` | 运行类的每个需求，然后运行方法的每个需求。一切都必须过去。 |
| `@Can.Anyone()` | 让任何人通过身份验证让通过。 |
| `@Public()` 来自 `@nestjs/authentication`（0.1.0 或更高版本） | 与 `@Can.Anyone()` 相同。 |
| 没有 | 拒绝：用户 403，客人 401。启动日志命名处理程序。 |

在方法上，`@Can.Anyone()` 或 `@Public()` 会移除类的 `@Can()`，就像 `@Public()` 会移除类的身份验证一样。方法本身上的 `@Can()` 仍然适用，因此带有 `@Can()` 的 `@Public()` 方法为访客运行检查。在类上，两者都不会提升方法的 `@Can()`。`@Authenticate()` 在 `@Public()` 类中放回身份验证的方法不是公共的，需要自己的声明。

如果 Nest 不运行全局保护，则不会拒绝任何内容：在 GraphQL 字段解析器上，除非 `fieldResolverEnhancers` 包括 `'guards'`，以及在没有 `inheritAppConfig: true` 连接的混合应用程序的消息处理程序上。有了增强器，每个 `@ResolveField()` 也需要一个声明。一级涵盖了他们。

##### 事件

`AuthorizationEvents` 揭露了它的每一个否认 `events$` 可观察，并在诊断频道上发布。`can()` 决心 `false` 不是否认，也不发出任何东西。

| 事件类型 | 渠道 | 何时 |
| --- | --- | --- |
| `denied` | `nestjs:authorization:denied` | `@Can()` 或者 `authorize()` 拒绝来电者 |

这个 `AuthorizationDeniedEvent` 有效载荷具有以下字段：

- `type`:`'denied'`.
- `policy` 和 `ability`：策略类名称和被拒绝的能力，例如 `OrderPolicy` 和 `refund`.两者都是 `null` 当守卫拒绝声明不检查的处理程序时。
- `reason`:`'unauthenticated'` 对于客人来说，`'forbidden'` 对于已登录的用户。
- `user`：策略看到的用户，`null` 给客人。
- `args`：用户后面的能力参数，如记录。为了 `@Can()`，它的第三个参数读什么，或者没有一个是空的。
- `handler`：处理程序 `@Can()` 保护，如 `ProductsController.create`。`authorize()` 缺席。

##### 错误

`authorize()` 抛出一个 `AuthorizationError` 与 `reason`、`status`、`policy` 和 `ability`。守卫对声明无检查的处理程序的拒绝携带相同的错误，`policy` 和 `ability` 设置为 `null`。当它离开处理程序时，或者当 `@Can()` 拒绝时，调用者会得到传输自己的错误，其主体永远不会命名策略或能力。参见 [Tell guests from forbidden users, and expose permissions](/security/authorization#tell-guests-from-forbidden-users-and-expose-permissions)。

| `reason` | `status` | HTTP | GraphQL`extensions.code` | WebSocket 和微服务 |
| --- | --- | --- | --- | --- |
| `unauthenticated` | 401 | `UnauthorizedException` | `UNAUTHENTICATED` | `WsException` 或者 `RpcException` 和 `statusCode: 401` |
| `forbidden` | 403 | `ForbiddenException` | `FORBIDDEN` | `WsException` 或者 `RpcException` 和 `statusCode: 403` |

超过 `graphql-ws`，客户端收到错误消息，`Unauthorized` 或者 `Forbidden`, 没有 `extensions.code`：Apollo 驱动程序在其错误格式中添加代码，该格式不会在该传输上运行。

安 `AuthorizationError` 抛出处理程序之外，例如在您自己的防护或中间件中，不会被映射并变成 500。
