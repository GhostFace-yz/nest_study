# Drizzle

Source: https://docs.nestjs.com/data/drizzle

作为 TypeORM 的替代方案，您可以将 [Drizzle ORM](https://orm.drizzle.team/) 与 `@nestjs/drizzle` 包一起使用。Drizzle 是一个轻量级的，TypeScript-优先的 ORM。您使用普通函数声明表，并使用类似 SQL 的查询生成器（或用于嵌套读取的关系查询 API）编写查询，Drizzle 从模式中推断每个结果类型。没有实体类、装饰器或代码生成步骤。

要开始，请安装所需的依赖项。本章将 [PostgreSQL](https://www.postgresql.org/) 与 `node-postgres` 驱动程序一起使用，但 Drizzle 支持许多其他数据库，包括 MySQL、SQLite 和 MicrosoftSQL 服务器，以及无服务器数据库，如 Neon、Turso 和 Cloudflare D1。本章中的步骤对于 Drizzle 支持的每个数据库都是相同的：为您的数据库安装驱动程序，并从匹配的 [入口点](https://orm.drizzle.team/docs/connect-overview)（例如，`drizzle-orm/mysql2` 或 `drizzle-orm/libsql`）导入 `drizzle()`，而不是 `drizzle-orm/node-postgres`。

```bash
$ npm install --save @nestjs/drizzle drizzle-orm@rc pg
$ npm install --save-dev drizzle-kit@rc @types/pg
```

> info **Hint** 本章使用 DrizzleORMv1，目前在 `rc` 标签下发布。Drizzle 文档是为此版本编写的。`@nestjs/drizzle` 还支持 Drizzlev0.35 及更高版本。对于 v0.x，只有关系和关系查询的工作方式与本章不同（参见 [Upgrading to v1](https://orm.drizzle.team/docs/upgrade-v1)）。

#### 图式

使用 Drizzle，您可以在 TypeScript 中编写数据库模式。使用 `pgTable()` 等函数声明每个表，并从模式文件中导出它。让我们定义 `users` 表：

```typescript
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

这个 `$inferSelect` 和 `$inferInsert` 助手从表定义派生行类型，因此没有单独的模型类来与模式保持同步。有关可用的列类型，请参见 [Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration) 在 Drizzle 文件。

#### 注册数据库

安装依赖项并定义模式后，将 `DrizzleModule` 导入到根 `AppModule` 中：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';

@Module({
  imports: [
    DrizzleModule.forRoot({
      drizzle,
      connection: process.env.DATABASE_URL!,
    }),
  ],
})
export class AppModule {}
```

这个 `drizzle` 选项采用 `drizzle()` 驱动程序的功能。`DrizzleModule` 用 `connection` 还有另一个 Drizzle 每个应用程序实例一次的选项。因此，每个应用程序，包括您的 e2e 测试创建的每个应用程序，都有自己的连接池，当该应用程序关闭时，连接池就会关闭。因为你传递了函数，每个司机 Drizzle 支持的工作方式相同，并且 TypeScript 支票 `connection` 和其他选项相对于驾驶员 `drizzle()` 签名。

这个 `forRoot()` 方法支持以下选项：

<table>
  <tr>
    <td><code>drizzle</code></td>
    <td>The <code>drizzle()</code> function of your driver, e.g., the one exported by <code>drizzle-orm/node-postgres</code></td>
  </tr>
  <tr>
    <td><code>connection</code></td>
    <td>A connection string, or the driver's connection options (e.g., a <code>pg</code> pool configuration)</td>
  </tr>
  <tr>
    <td><code>db</code></td>
    <td>A database instance that you created, used instead of <code>drizzle</code> and <code>connection</code> (see below)</td>
  </tr>
  <tr>
    <td><code>autoCloseConnection</code></td>
    <td>If <code>true</code>, the database's client (<code>db.$client</code>) is closed when the application shuts down (default: <code>true</code>)</td>
  </tr>
</table>

其他选项，例如 `relations`,`logger`, 或 `casing`，被传递给 `drizzle()` 也是。

> info **Hint** 与任何模块的选项一样，`forRoot()` 选项在以下情况下进行评估 `AppModule` 文件已导入，因此 `process.env.DATABASE_URL` 必须在该点已经设置（例如，通过启动 Node.js 与 `--env-file=.env` 旗）。读取连接字符串 `ConfigService` 相反，使用 `forRootAsync()`，在下面的“异步配置”部分中描述。

> info **Hint** 呼叫时客户端已关闭 `app.close()`，或者当进程接收到终止信号时，如果 [关闭挂钩](/fundamentals/lifecycle-events#application-shutdown) 已启用。基于池的客户端（例如， `node-postgres`, `postgres.js`, `mysql2`）关闭 `end()` 和其他（例如， `better-sqlite3`, `libsql`, PGlite) 与 `close()`.对于使用 Drizzle's [`withReplicas()`](https://orm.drizzle.team/docs/read-replicas) 函数，主数据库和所有副本数据库的客户端都被关闭（使用 Drizzle v0.44.6 及更高版本；早期版本不公开副本，因此只有主的客户端是关闭的）。以多个名称注册的客户端只能关闭一次。

注册了模块后，您可以将数据库注入到项目中的任何位置（无需导入任何模块），使用 `@InjectDrizzle()` 装修师。例如：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class AppService {
  constructor(
    @InjectDrizzle()
    private readonly db: NodePgDatabase,
  ) {}
}
```

注册您自己创建的数据库，例如将读取路由到副本的数据库 Drizzle 的 `withReplicas()` 函数，将其传递为 `db` 反而。在 `forRootAsync()` 工厂，为每个应用程序运行一次：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { withReplicas } from 'drizzle-orm/pg-core';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({
        db: withReplicas(drizzle(process.env.DATABASE_URL!), [
          drizzle(process.env.REPLICA_DATABASE_URL!),
        ]),
      }),
    }),
  ],
})
export class AppModule {}
```

> warning **Warning** 您也可以通过 `db` 实例 `forRoot()`，例如，由 `db` 种子脚本也导入的文件。这样的实例在第一次导入其文件时创建一次。从 `AppModule` 共享它，第一个关闭的应用程序关闭它，这打破了为每个测试创建新应用程序的 e2e 测试套件。在这种情况下，设置 `autoCloseConnection` 二 `false` 自己关闭客户端。

#### 查询

与 TypeORM 集成不同，Drizzle 没有 `forFeature()` 步骤。Drizzle 表是简单的对象，您可以在构建查询的任何地方导入它，并且数据库是全局注册的，因此任何提供程序都可以注入它。让我们实现 `UsersService`：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users, type NewUser, type User } from '../db/schema.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectDrizzle()
    private readonly db: NodePgDatabase,
  ) {}

  findAll(): Promise<User[]> {
    return this.db.select().from(users);
  }

  async findOne(id: number): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async create(user: NewUser): Promise<User> {
    const [createdUser] = await this.db.insert(users).values(user).returning();
    return createdUser;
  }

  async remove(id: number): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }
}
```

一个 Drizzle 查询在等待（或从 `async` 函数），其结果类型是从它选择的列推断出来的。这个 Drizzle 文档封面 [选择](https://orm.drizzle.team/docs/select),[插入](https://orm.drizzle.team/docs/insert),[更新](https://orm.drizzle.team/docs/update)，和 [删除](https://orm.drizzle.team/docs/delete) 行的细节。

#### 关系

关系是两个或多个表之间的关联，基于公共字段，通常是主键和外键。Drizzle 的 [关系查询](https://orm.drizzle.team/docs/rqb-v2) 使用它们来获取嵌套数据，例如用户及其照片，而无需手动编写连接。

让我们添加一个 `photos` 桌子 `userId` 列引用 `users` 表：

```typescript
export const photos = pgTable('photos', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  url: text().notNull(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
});
```

您一次声明整个模式的关系，使用 `defineRelations()` 功能。例如，每个用户可以有多张照片，每张照片属于一个用户：

```typescript
import { defineRelations } from 'drizzle-orm';
import * as schema from './schema.js';

export const relations = defineRelations(schema, (r) => ({
  users: {
    photos: r.many.photos(),
  },
  photos: {
    user: r.one.users({
      from: r.photos.userId,
      to: r.users.id,
    }),
  },
}));
```

若要使关系可用于关系查询，请将它们传递给 `drizzle()` 与 `relations` 选项：

```typescript
DrizzleModule.forRoot({
  drizzle,
  connection: process.env.DATABASE_URL!,
  relations,
}),
```

数据库类型现在依赖于关系，因此声明一次，然后在注入数据库的任何地方重复使用它：

```typescript
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { relations } from './relations.js';

export type Database = NodePgDatabase<typeof relations>;
```

有了这一点，`db.query`API 已完全键入：

```typescript
@Injectable()
export class UsersService {
  constructor(
    @InjectDrizzle()
    private readonly db: Database,
  ) {}

  findOneWithPhotos(id: number) {
    return this.db.query.users.findFirst({
      where: { id },
      with: { photos: true },
    });
  }
}
```

> info **Hint** 关系只驱动关系查询。外键约束来自 `references()` 在表定义中。要了解更多信息，请参阅 [Relations](https://orm.drizzle.team/docs/relations-v2) 在 Drizzle 文件。

#### Drizzle 交易

数据库事务是一个工作单元，数据库管理系统将其视为一个整体，独立于其他事务：要么应用其所有更改，要么不应用任何更改。要了解更多信息，请参阅 [Database transaction](https://en.wikipedia.org/wiki/Database_transaction) 在维基百科上。

开始 [Drizzle transaction](https://orm.drizzle.team/docs/transactions)，打电话给 `transaction()` 注入数据库的方法。回调接收事务对象（`tx`) 公开相同的查询 API 作为数据库：

```typescript
async deactivate(id: number) {
  await this.db.transaction(async (tx) => {
    await tx.update(users).set({ isActive: false }).where(eq(users.id, id));
    await tx.delete(photos).where(eq(photos.userId, id));
  });
}
```

如果回调抛出或调用 `tx.rollback()`，事务回滚，并且 `transaction()` 拒绝并出错。否则，事务被提交，并且 `transaction()` 使用回调返回的值进行解析。属于事务的查询必须通过 `tx`，而不是通过注入的数据库。

> info **Hint** 若要在一个事务中运行来自多个提供程序的代码而不传递 `tx`，请使用 `AsyncLocalStorage` 传播该事务。[`nestjs-cls`](/recipes/async-local-storage#nestjs-cls) 包提供了一个事务性插件，其中包含一个 [Drizzle adapter](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional/drizzle-orm-adapter)。

#### 自定义存储库

Drizzle 没有存储库层：您从注入的数据库和表定义构建查询。为了将表的查询保存在一个地方，并使使用它们的类易于单元测试，您可以自己编写一个存储库作为常规提供者：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { users, type User } from '../db/schema.js';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectDrizzle()
    private readonly db: Database,
  ) {}

  findActive(): Promise<User[]> {
    return this.db.select().from(users).where(eq(users.isActive, true));
  }

  async deactivate(id: number): Promise<void> {
    await this.db.update(users).set({ isActive: false }).where(eq(users.id, id));
  }
}
```

在 `UsersModule` 的 `providers` 数组中注册 `UsersRepository`，并将其注入到 `UsersService` 中，而不是数据库中。在单元测试中，将其替换为 [自定义提供者](/fundamentals/custom-providers)，其 `useValue` 是实现服务调用的方法的对象，如 `findActive()`。

> warning **Warning** 存储库方法查询注入的数据库，而不是事务的 `tx`。对于连接池，它们运行在与使用 `db.transaction()` 在其他地方启动的事务不同的连接上，因此它们不是其中的一部分。要在事务中运行它们，请接受 `tx` 作为参数，或者如上所述使用 `nestjs-cls` 传播事务。

#### 迁移

[Migrations](https://orm.drizzle.team/docs/migrations) 增量更新数据库模式，使其与应用程序的数据模型保持同步，同时保留现有数据。要生成和运行迁移，Drizzle 提供专用的 CLI,[Drizzle Kit](https://orm.drizzle.team/docs/kit-overview)，它从 `drizzle.config.ts` 项目根目录中的文件：

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

有了那个文件，`npx drizzle-kit generate` 创建 SQL 从架构更改迁移文件，以及 `npx drizzle-kit migrate` 将它们应用于数据库。

Drizzle 套件在你的外面运行 Nest 应用程序，因此迁移不能使用依赖注入或其他 Nest-具体特征。 Drizzle 套件加载 `.env` 运行它的目录中的文件，因此 `process.env.DATABASE_URL` 可在 `drizzle.config.ts` 没有 `ConfigModule`.环境中已设置的变量优先于文件。

要在应用程序启动时应用挂起的迁移，请在 `forRootAsync()` 工厂并在那里应用它们。工厂可以是 `async`，和 Nest 在解决以下问题之前，不会创建注入数据库的提供程序：

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

DrizzleModule.forRootAsync({
  useFactory: async () => {
    const db = drizzle(process.env.DATABASE_URL!, { relations });
    await migrate(db, { migrationsFolder: './drizzle' });
    return { db };
  },
}),
```

> warning **Warning** 当应用程序的多个实例同时启动时，每个实例都会尝试应用迁移。在此类部署中，运行 `drizzle-kit migrate` 相反，作为发布过程的一个单独步骤。

#### 多个数据库

有些项目需要多个数据库连接，并且 `DrizzleModule` 也支持这一点。用自己的数据库注册每个数据库 `DrizzleModule` 进口。在这种情况下，除一个数据库外，每个数据库都必须有一个名称：

```typescript
@Module({
  imports: [
    DrizzleModule.forRoot({
      drizzle,
      connection: process.env.DATABASE_URL!,
      relations,
    }),
    DrizzleModule.forRoot({
      name: 'analytics',
      drizzle,
      connection: process.env.ANALYTICS_DATABASE_URL!,
    }),
  ],
})
export class AppModule {}
```

> warning **Notice** 没有 `name` 注册的数据库被命名为 `default`。不要注册没有名称或同名的多个数据库：它们将共享一个注入令牌，并且只会注入其中一个。

数据库不必共享驱动程序：`analytics` 也可以是使用 `drizzle-orm/better-sqlite3` 中的 `drizzle()` 函数打开的 SQLite 文件。要注入默认数据库以外的数据库，请将其名称传递给 `@InjectDrizzle()` 装饰器：

```typescript
@Injectable()
export class ReportsService {
  constructor(
    @InjectDrizzle('analytics')
    private readonly analyticsDb: NodePgDatabase,
  ) {}
}
```

也可以将任何数据库注入工厂提供程序 `getDrizzleToken()` 函数，它返回具有给定名称的数据库的注入令牌：

```typescript
@Module({
  providers: [
    {
      provide: ReportsService,
      useFactory: (analyticsDb: NodePgDatabase) => {
        return new ReportsService(analyticsDb);
      },
      inject: [getDrizzleToken('analytics')],
    },
  ],
})
export class ReportsModule {}
```

#### 检测

当对应用程序进行单元测试时，您通常希望避免连接到数据库，以保持测试套件的独立和快速。但是，您的类依赖于注入了 `@InjectDrizzle()` 的数据库。要解决这个问题，请使用 [自定义提供者](/fundamentals/custom-providers) 将数据库替换为模拟。`getDrizzleToken()` 函数返回默认数据库（或您传递名称的数据库）的注入令牌：

```typescript
@Module({
  providers: [
    UsersService,
    {
      provide: getDrizzleToken(),
      useValue: mockDb,
    },
  ],
})
export class UsersModule {}
```

Nest 现在注入 `mockDb` 对象，无论类在哪里请求数据库 `@InjectDrizzle()` 装修师。Drizzle 的查询生成器是可链接的（例如，`select().from().where()`)，因此模拟必须实现代码调用的链中的每个方法。对于简单查询以外的任何内容，请将查询移至 [自定义存储库](/data/drizzle#custom-repositories) 并嘲笑这些，或者对真实的数据库运行这些测试。

#### 异步配置

通过 `DrizzleModule` 异步选项而不是静态选项，请使用 `forRootAsync()` 方法。它支持几种提供选项的方式。

一种方法是工厂函数。这家工厂的行为和其他工厂一样 [异步提供程序](/fundamentals/async-providers)：可以是 `async`，并且它可以通过 `inject`.它返回与 `forRoot()` （除了 `name`），要么 `drizzle` 和 `connection` 或者一个 `db` 实例：

```typescript
DrizzleModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    drizzle,
    connection: configService.getOrThrow<string>('DATABASE_URL'),
    relations,
  }),
  inject: [ConfigService],
});
```

或者，您可以使用 `useClass` 语法：

```typescript
DrizzleModule.forRootAsync({
  imports: [ConfigModule],
  useClass: DrizzleConfigService,
});
```

有了这个结构，`DrizzleModule` 实例化 `DrizzleConfigService`，解决其对中模块的依赖关系 `imports`，并称之为 `createDrizzleOptions()` 获取选项的方法。`DrizzleConfigService` 因此，必须实施 `DrizzleOptionsFactory` 接口：

```typescript
@Injectable()
class DrizzleConfigService implements DrizzleOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createDrizzleOptions(): DrizzleModuleFactoryOptions {
    return {
      drizzle,
      connection: this.configService.getOrThrow<string>('DATABASE_URL'),
      relations,
    };
  }
}
```

> info **Hint** `createDrizzleOptions()` 获取要注册的数据库的名称（`undefined` 对于默认值），因此单个类可以配置多个数据库。

从另一个模块重用提供程序，而不是实例化 `DrizzleConfigService` 内部 `DrizzleModule`，使用 `useExisting` 语法：

```typescript
DrizzleModule.forRootAsync({
  imports: [DatabaseConfigModule],
  useExisting: DrizzleConfigService,
});
```

这就像 `useClass` 有一个关键的区别：`DrizzleModule` 重复使用 `DrizzleConfigService` 导入模块导出的实例（这里，`DatabaseConfigModule`）而不是创建一个新的。
