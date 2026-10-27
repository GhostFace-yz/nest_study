# Prisma

Source: https://docs.nestjs.com/data/prisma

[Prisma](https://www.prisma.io) 是一个 [open-source](https://github.com/prisma/prisma) ORM 为了 Node.js 和 TypeScript.你可以用它作为普通书写的**替代品** SQL 或其他数据库访问工具，例如 SQL 查询生成器（如 [knex.js](https://knexjs.org/)）或其他 ORM（如 [TypeORM](https://typeorm.io/) 和 [Sequelize](https://sequelize.org/)). Prisma 支持 PostgreSQL、MySQL， SQL 服务器、SQLite、CockroachDB 和 MongoDB （见 [支持的数据库](https://www.prisma.io/docs/orm/reference/supported-databases)).本章使用 Prisma ORM 7，它与 SQL 数据库； MongoDB 项目继续进行 Prisma ORM 暂时 6 个。

虽然您可以使用 Prisma 普通 JavaScript，它拥抱 TypeScript 并提供了超出其他 ORM 保证的类型安全级别 TypeScript 生态系统。参见 [comparison of the type safety guarantees of Prisma and TypeORM](https://www.prisma.io/docs/orm/more/comparisons/prisma-and-typeorm#type-safety) 详情。

Prisma 没有 Nest-特定包装。相反，您将生成一个类型安全的客户端（Prisma 客户）来自您的 Prisma 模式，将其包装在提供程序中，并将该提供程序注入到需要数据库访问的任何位置。本章通过 [SQLite](https://sqlite.org/) 数据库，不需要数据库服务器，并注意 PostgreSQL、MySQL 和 SQL 一路上的服务器。

> info **Note** 有关 Prisma 如何工作的概述，请遵循 [Quickstart](https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/prisma-postgres) 或阅读 [Prisma documentation](https://www.prisma.io/docs) 中的 [Introduction](https://www.prisma.io/docs/orm/overview/introduction/what-is-prisma)。要将 Prisma 添加到已经有数据库的项目中，请遵循 [adding Prisma to an existing project](https://www.prisma.io/docs/getting-started/setup-prisma/add-to-existing-project-typescript-postgres) 的指南。如果您是从 TypeORM 迁移，请阅读 [Migrating from TypeORM to Prisma](https://www.prisma.io/docs/guides/migrate-from-typeorm)。

#### 安装

安装 [Prisma CLI](https://www.prisma.io/docs/orm/tools/prisma-cli) 和 `dotenv` 作为开发依赖项，然后安装 Prisma 数据库的客户端和驱动程序适配器。对于 SQLite，`@prisma/adapter-better-sqlite3` 适配器还安装 `better-sqlite3` 司机：

```bash
$ npm install prisma@7 dotenv --save-dev
$ npm install @prisma/client@7 @prisma/adapter-better-sqlite3
```

> warning **Warning** 安装 PrismaORM7 显式，如上所示。在撰写本文时，`latest` 的标签 `prisma`npm 上的包指向 aPrisma8 预发布，这是一个不同的 CLI 这并没有提供 `prisma migrate` 和 `prisma generate` 本章中使用的命令。保持 `prisma` 和 `@prisma/client` 在同一个主要版本上。

<details><summary>Expand if you're using PostgreSQL, MySQL, SQL Server, or Azure SQL</summary>

为数据库安装适配器，而不是 `@prisma/adapter-better-sqlite3`。每个适配器包都包括其数据库驱动程序。

-对于 PostgreSQL：

巴什
$ npm 安装 @prisma/adapter-pg
```

-对于 MySQL（和 MariaDB）：

巴什
$ npm 安装 @prisma/adapter-mariadb
```

-对于 SQL 服务器和 AzureSQL：

巴什
$ npm 安装 @prisma/adapter-mssql
```

</details>

接下来，创建初始 Prisma 使用 `init` 命令。前缀 PrismaCLI 命令 `npx` 以便它们运行项目中安装的版本：

```bash
$ npx prisma init --datasource-provider sqlite --output ../src/generated/prisma
```

此命令创建以下文件：

- `prisma/schema.prisma`：包含数据库架构，包括数据源提供程序和 Prisma 客户端生成器
- `prisma7.config.ts`：Prisma 在项目根目录中创建的配置文件。它设置模式和迁移的位置，并读取数据库连接 URL 从 `DATABASE_URL` 环境变量。PrismaORM7.10 之前的版本命名此文件 `prisma.config.ts`，其中 Prisma 还认得。
- `.env`：一个 [多滕夫](https://github.com/motdotla/dotenv) 存储数据库连接的文件 URL 在 `DATABASE_URL` 环境变量

它还增加了 `.env` 以及生成的客户端目录到您的 `.gitignore` 文件。

#### 设置发生器输出路径

Prisma 客户端生成到由 `output` 的领域 `generator` 块，相对于模式文件。这个 `--output` 上面的选项将客户端放置在 `src`，以便将其与应用程序的其余部分一起编译。如果没有选项， `prisma init` 将路径设置为 `../generated/prisma`，它在 `src`.您也可以直接在 Prisma 方案：

```groovy
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

因为生成的客户端被排除在版本控制之外，所以在新签出或 CI 中构建应用程序之前，请运行 `npx prisma generate`。

#### 配置模块格式

Prisma 从您的 `tsconfig.json` 文件。一个 NestJS 项目使用 ES 模块（新项目的默认值）得到一个 ES 模块客户端，因此不需要额外的配置。

如果您的项目使用 CommonJS，请将生成器中的 `moduleFormat` 设置为 `cjs`：

```groovy
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}
```

> info **Note** 生成的 ESM 客户依赖 `import.meta`，在 CommonJS 中不可用。之前发布 PrismaORM7.10 生成 ES 模块随时 `tsconfig.json` 集合 `module` 二 `nodenext`，即使在 CommonJS 项目中，也是如此 `moduleFormat` 明确而不是依赖于推理。

#### 设置数据库连接

`schema.prisma` 文件中的 `datasource` 块定义了您使用的数据库。使用 `--datasource-provider sqlite` 选项，`prisma init` 将其 `provider` 字段设置为 `sqlite`（默认值为 `postgresql`）：

```groovy
datasource db {
  provider = "sqlite"
}
```

连接 URL 本身不是模式的一部分：Prisma 配置文件从 `DATABASE_URL` 环境变量读取它，`prisma init` 设置在 `.env` 中：

```bash
DATABASE_URL="file:./dev.db"
```

SQLite 数据库是一个纯文件，因此连接不是_host_和_port_URL 在本例中，指向本地文件 `dev.db` 在项目根中。Prisma 运行第一次迁移时创建文件。

PrismaCLI 通过 Prisma 配置文件顶部的 `dotenv/config` 导入加载 `.env`。但是，您的 NestJS 应用程序不会自动加载 `.env`。安装 `@nestjs/config` 包并在 `AppModule` 中全局注册 [`ConfigModule`](/application/configuration)，以便 `PrismaService` 可以读取 `DATABASE_URL` 到 `ConfigService`：

```bash
$ npm install @nestjs/config
```

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

<details><summary>Expand if you're using PostgreSQL, MySQL, SQL Server, or Azure SQL</summary>

使用 PostgreSQL、MySQL 和 SQL 服务器，连接 URL 指向_数据库服务器_。将匹配的提供程序传递给 `prisma init` (e.g., `--datasource-provider postgresql`），或更改 `provider` 的领域 `datasource` 块，并设置 `DATABASE_URL` 在 `.env`.参见 [联系 URL 参考](https://www.prisma.io/docs/orm/reference/connection-urls) 对于所需的格式。

**邮政 QL**

古怪的
数据源数据库 {
provider = "postgresql"
}
```

巴什
数据库网址=“postgresql://USER:PASSWORD@HOST:PORT/DATABASE?模式=SCHEMA"
```

用数据库凭据替换大写占位符。如果您不确定为 `SCHEMA` 占位符，很可能是默认值 `public`.如果您还没有 PostgreSQL 服务器，请运行 `npx prisma dev` 启动本地 Prisma 终端中的 Postgres 数据库。

**MySQL**

古怪的
数据源数据库 {
provider = "mysql"
}
```

巴什
数据库网址="mysql://USER:PASSWORD@HOST:PORT/DATABASE"
```

用数据库凭据替换大写占位符。

**微软 SQL 服务器/Azure SQL 服务器**

古怪的
数据源数据库 {
provider = "sqlserver"
}
```

巴什
数据库网址="sqlserver://HOST:PORT;数据库=DATABASE;用户=USER;密码=PASSWORD;加密=真”
```

用数据库凭据替换大写占位符。如果您不确定为 `encrypt` 选项，很可能是默认值 `true`.

</details>

#### 模型和迁移

[Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate/getting-started) 生成 SQL 从声明性数据模型迁移文件 Prisma 模式。这些迁移文件是完全可定制的，因此您可以配置底层数据库的附加功能或包含附加命令（例如，用于播种）。

本章使用了两个模型。将它们添加到您的 `schema.prisma` 文件：

```groovy
model User {
  id    Int     @default(autoincrement()) @id
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id        Int      @default(autoincrement()) @id
  title     String
  content   String?
  published Boolean? @default(false)
  author    User?    @relation(fields: [authorId], references: [id])
  authorId  Int?
}
```

然后生成第一个迁移并对数据库运行：

```bash
$ npx prisma migrate dev --name init
```

这个 `prisma migrate dev` 命令生成 SQL 文件并直接对数据库运行它们。因为数据库还不存在，所以它还创建了 `dev.db` 文件。迁移文件是在 `prisma` 目录：

```bash
$ tree prisma
prisma
├── migrations
│   ├── 20201207100915_init
│   │   └── migration.sql
│   └── migration_lock.toml
└── schema.prisma
```

<details><summary>Expand to view the generated SQL statements</summary>

在 SQLite 数据库中创建了以下表：

````sql
-- 创建表
CREATE TABLE “用户”（
“id”INTEGERNOTNULLPRIMARYKEYAUTOINCREMENT，
“电子邮件”TEXTNOTNULL，
“姓名”TEXT
);

-- 创建表
CREATE TABLE “帖子”（
“id”INTEGERNOTNULLPRIMARYKEYAUTOINCREMENT，
“标题”TEXT NOT NULL，
“内容”TEXT，
“已发布” BOOLEAN DEFAULT 错误，
"authorId"INTEGER,
CONSTRAINT “Post_authorId_fkey” FOREIGN KEY（“authorId”） REFERENCES “用户”（“id”） ON DELETE SET NULL ON UPDATE CASCADE
);

-- 创建索引
CREATE UNIQUE INDEX “用户电子邮件密钥” ON “用户”（“电子邮件”）；
```

</details>

#### 产生 Prisma 客户

Prisma 客户端是一个类型安全的数据库客户端，它从您的 Prisma 模式。这种方法让 Prisma 客户端暴露 [CRUD](https://www.prisma.io/docs/orm/prisma-client/queries/crud) 专门为您的模型量身定制的操作。使用 `generate` 命令：

```bash
$ npx prisma generate
```

`prisma migrate dev` 不为您运行此命令。每当您更改架构时，请重新运行 `prisma generate` 使客户端及其类型保持同步。

生成的 `client.ts` 文件是客户端的入口点。它导出 `PrismaClient` 类，每个模型的类型（例如，`User` 和 `Post`），以及 `Prisma` 命名空间，其中包含查询的输入类型（例如，`Prisma.UserCreateInput`）。与 ESM 项目中的任何其他相对导入一样，使用 `.js` 扩展（`./generated/prisma/client.js`）导入它。

#### 棱镜服务

在一个 NestJS 应用，你暴露 Prisma 通过提供者的客户。创建一个 `PrismaService` 扩展的类 `PrismaClient`，以便服务具有完整的 Prisma 客户 API，并将数据库的驱动程序适配器传递给 `PrismaClient` 构造函数。PrismaORM7 需要驱动程序适配器（或 Prisma 加快 URL) 来创建客户端。

创建一个 `prisma.service.ts` 文件在 `src/prisma` 目录：

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaBetterSqlite3({
      url: configService.getOrThrow<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

构造函数读取 `DATABASE_URL` 通过 `ConfigService` 在它打电话之前 `super()`.这 `getOrThrow()` 如果变量未设置，方法将抛出一个错误，因此缺少连接 URL 启动时停止应用程序。这个 `onModuleInit()` 和 `onModuleDestroy()` 钩子管理连接，如 [Connection lifecycle](#connection-lifecycle).

> info **Hint** 如果你不使用 `@nestjs/config`,开始 Node.js 与 `--env-file=.env` 标记并读取 `process.env.DATABASE_URL` 而是在构造函数中。

<details><summary>Expand if you're using PostgreSQL, MySQL, SQL Server, or Azure SQL</summary>

将 `PrismaBetterSqlite3` 替换为数据库的适配器类（`PrismaPg`、`PrismaMariaDb` 或 `PrismaMssql`），并将其驱动程序期望的连接设置传递给它。这些适配器中的每一个也接受连接字符串。例如，使用 PostgreSQL：

``` 打字脚本
从'@prisma/adapter-pg'导入{PrismaPg}；

// 在 PrismaService 构造函数中
const adapter = new PrismaPg({
connectionString: configService.getOrThrow<string>('DATABASE_URL'),
});
超级（{适配器}）；
```

</details>

#### 连接生命周期

Prisma 当客户端发送第一个查询时，它会延迟连接。呼叫 `$connect()` 在 `onModuleInit()` 相反，钩子连接是在应用程序引导期间进行的，因此配置错误的连接会在启动时失败，而不是在第一次请求时失败。

在 `onModuleDestroy()` 挂钩中调用 `$disconnect()` 会在应用程序关闭时关闭连接。它还处理驱动程序适配器，该适配器关闭底层驱动程序连接（例如，它结束 `PrismaPg` 创建的连接池）。当您调用 `app.close()` 时，Nest 调用 `onModuleDestroy()`。要在进程接收到终止信号（例如 `SIGTERM`）时调用它，请在 `main.ts` 文件中启用关机挂钩：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

看 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown) 了解有关关闭挂钩的更多信息。

> info **Hint** PrismaORM7 不支持 `beforeExit` 事件（`$on('beforeExit', ...)`）那个老的 Prisma 用于关闭应用程序的集成。使用 Nest 取而代之的是上面显示的生命周期挂钩。

#### 棱镜模块

登记 `PrismaService` 在导出它的专用模块中。创建一个 `prisma.module.ts` 服务旁边的文件：

```typescript
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

进口 `PrismaModule` 进入每个需要数据库访问的模块。默认情况下，提供程序是单例的，因此所有导入模块共享相同的内容 `PrismaService` 实例及其连接。

> info **Hint** 如果您的大多数模块都需要数据库访问，您可以装饰 `PrismaModule` 和 `@Global()` 并且只在根模块中导入一次。看 [Global modules](/modules#global-modules) 为了权衡。

#### 从服务查询

有了 `PrismaModule`，将 `PrismaService` 注入到您的提供程序中，并通过其模型属性（如 `this.prisma.user`）查询数据库。以下 `UsersService` 包装了 `User` 模型的 CRUD 查询：

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, User } from '../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async user(where: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return this.prisma.user.findUnique({ where });
  }

  async users(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.user.findMany({ skip, take, cursor, where, orderBy });
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async updateUser(params: {
    where: Prisma.UserWhereUniqueInput;
    data: Prisma.UserUpdateInput;
  }): Promise<User> {
    const { where, data } = params;
    return this.prisma.user.update({ data, where });
  }

  async deleteUser(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return this.prisma.user.delete({ where });
  }
}
```

该服务使用生成的类型作为其参数和返回值，因此您不需要为模型编写单独的接口。在现实世界的应用程序中，服务也是您的业务逻辑的位置。例如，一个 `UsersService` 可以有一个 `updatePassword()` 方法负责更新用户的密码。

然后，控制器通过路由处理程序公开服务：

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User as UserModel } from '../generated/prisma/client.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Query('search') search?: string): Promise<UserModel[]> {
    return this.usersService.users({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { id: 'asc' },
    });
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserModel | null> {
    return this.usersService.user({ id });
  }

  @Post()
  async create(
    @Body() userData: { name?: string; email: string },
  ): Promise<UserModel> {
    return this.usersService.createUser(userData);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<UserModel> {
    return this.usersService.deleteUser({ id });
  }
}
```

> info **Hint** 生成的类型仅在编译时存在，因此 `ValidationPipe` 不能使用它们来验证请求有效载荷。要验证请求主体，请声明一个 DTO 类，如 [Validation](/application/validation) 中所述。

最后，在导入 `PrismaModule` 的 `UsersModule` 中注册控制器和服务，并将 `UsersModule` 导入到 `AppModule` 中：

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

#### 交易

Prisma 客户端提供了几种在事务中运行查询的方法（参见 [Transactions and batch queries](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)）：

- **嵌套写入**在单个查询中创建或更新记录以及相关记录，在事务中自动运行。
- **顺序操作**：将查询数组传递给 `$transaction()`。Prisma 在一个事务中按顺序运行它们，并将它们的结果解析为一个数组。
- **交互式事务**：将异步函数传递给 `$transaction()`。Prisma 在函数解析时提交事务，并在抛出时回滚事务。

以下方法显示了 `UsersService` 中的最后两个表单：

```typescript
async publishedPosts(skip: number, take: number) {
  const [posts, total] = await this.prisma.$transaction([
    this.prisma.post.findMany({ where: { published: true }, skip, take }),
    this.prisma.post.count({ where: { published: true } }),
  ]);
  return { posts, total };
}

async deleteUserWithPosts(id: number): Promise<User> {
  return this.prisma.$transaction(async (tx) => {
    await tx.post.deleteMany({ where: { authorId: id } });
    return tx.user.delete({ where: { id } });
  });
}
```

在交互式事务中，通过事务客户端发送每个查询（`tx`）那个 Prisma 传递给函数。查询通过 `this.prisma` 在事务外部运行。两种形式的 `$transaction()` 接受 options 对象作为第二个参数，其中 `maxWait`,`timeout`，和 `isolationLevel` 属性。

通过 `tx` 通过参与事务的每一种方法，您的服务相互耦合。要使用装饰器声明事务边界，请使用 [`nestjs-cls`](/recipes/async-local-storage#nestjs-cls) 包装及其 [Prisma adapter](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional/prisma-adapter) (`@nestjs-cls/transactional-adapter-prisma`).它将活动事务客户端保留在异步本地存储中，并提供 `@Transactional()` 装饰剂和注射剂 `TransactionHost`.

#### 检测

当您对依赖于 `PrismaService` 的提供程序进行单元测试时，您通常希望避免数据库连接。由于 `PrismaService` 是一个常规类提供程序，因此可以使用类本身作为注入令牌和任何标准 [自定义提供者](/fundamentals/custom-providers) 技术（例如 `useValue`），将其替换为模拟：

```typescript
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let usersService: UsersService;
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    usersService = moduleRef.get(UsersService);
  });

  it('returns a user by id', async () => {
    const user = { id: 1, email: 'alice@prisma.io', name: 'Alice' };
    prismaMock.user.findUnique.mockResolvedValue(user);

    expect(await usersService.user({ id: 1 })).toEqual(user);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });
});
```

模拟替换 `PrismaService` 完全，所以它 `onModuleInit()` 钩子不会运行，测试也不会打开数据库连接。当您测试导入的模块时 `PrismaModule`，将提供程序替换为 `overrideProvider(PrismaService)` 反而。看 [Testing](/fundamentals/testing) 获取更多测试实用程序。

#### 例子

准备运行的示例项目 [REST](https://github.com/prisma/prisma-examples/tree/b53fad046a6d55f0090ddce9fd17ec3f9b95cab3/orm/nest) 和 [GraphQL](https://github.com/prisma/prisma-examples/tree/b53fad046a6d55f0090ddce9fd17ec3f9b95cab3/orm/nest-graphql) 可在 [`prisma-examples`](https://github.com/prisma/prisma-examples/) 仓库。有关更多资源，请参见 [NestJS & Prisma](https://www.prisma.io/nestjs) 在 Prisma 网站。
