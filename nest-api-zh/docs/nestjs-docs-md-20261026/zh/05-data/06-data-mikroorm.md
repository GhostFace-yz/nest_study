# MikroORM

Source: https://docs.nestjs.com/data/mikroorm

[MikroORM](https://mikro-orm.io) 是一个 TypeScriptORM 为了 Node.js 基于数据映射器、工作单元和身份映射模式。它支持 MongoDBMySQL、MariaDB、PostgreSQL、SQLite、微软 SQL 服务器和甲骨文。这个 `@mikro-orm/nestjs` 包将其与 Nest：它注册 ORM 及其 `EntityManager` 作为提供程序，提供存储库注入，为每个存储库创建请求上下文 HTTP 请求，并在应用程序关闭时关闭数据库连接。

本章涵盖 Nest-集成的具体部分。参见 [MikroORM documentation](https://mikro-orm.io/docs) 全面覆盖 ORM 本身。

> info **Note** `@mikro-orm/nestjs` 是第三方软件包，不由 NestJS 核心团队管理。在 [mikro-orm/nestjs repository](https://github.com/mikro-orm/nestjs) 中报告库的任何问题。

> info **Hint** 本章针对 MikroORM v7 和 `@mikro-orm/nestjs` v7。如果从 MikroORM v6 升级，请参阅 [MikroORM v6 to v7 upgrading guide](https://mikro-orm.io/docs/upgrading-v6-to-v7).

#### 安装

安装 Nest 模块以及 MikroORM、其装饰包和数据库驱动程序。本章使用 SQLite：

```bash
$ npm i @mikro-orm/nestjs @mikro-orm/core @mikro-orm/decorators @mikro-orm/sqlite
```

MikroORM 为每个支持的数据库提供驱动程序包，例如 `@mikro-orm/postgresql`、`@mikro-orm/mysql` 和 `@mikro-orm/mongodb`。有关完整列表，请参见 [MikroORM quick start guide](https://mikro-orm.io/docs/quick-start#installation)。

> info **Hint** 自 MikroORM v7 以来，装饰器不再从 `@mikro-orm/core` 导出。Nest 项目使用传统（实验）装饰器，因此从 `@mikro-orm/decorators/legacy` 导入装饰器，如 `@Entity()` 和 `@Property()`。从驱动程序包（例如，`@mikro-orm/sqlite`）导入 `EntityManager`、`EntityRepository` 和 `MikroORM`，并从 `@mikro-orm/core` 导入其他类型（例如，`EntityRepositoryType` 符号）。本章中的代码片段包括相关的导入语句。

安装完成后，将 `MikroOrmModule` 导入到根 `AppModule` 中：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { SqliteDriver } from '@mikro-orm/sqlite';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: SqliteDriver,
      dbName: 'my-db-name.sqlite3',
      entities: ['./dist/**/*.entity.js'],
      entitiesTs: ['./src/**/*.entity.ts'],
      metadataProvider: ReflectMetadataProvider,
    }),
  ],
})
export class AppModule {}
```

`forRoot()` 方法接受与 `MikroORM.init()` 相同的配置对象。有关选项的完整列表，请参见 [MikroORM configuration documentation](https://mikro-orm.io/docs/configuration)。`entities` 和 `entitiesTs`glob 模式告诉 MikroORM 在哪里可以找到您的实体文件：当它从 TypeScript 源运行时，它使用 `entitiesTs`，当它从编译的 JavaScript 运行时，它使用 `entities`（参见 [基于文件夹的发现](https://mikro-orm.io/docs/folder-based-discovery)）。

> info **Hint** 自 MikroORM v7 以来，`ReflectMetadataProvider` 不再是默认的元数据提供程序。显式设置它，如上所示，让 MikroORM 从元数据中推断属性类型 TypeScript 为传统装饰者排放。

此外，`forRoot()` 支持以下内容 Nest-具体选项，都将在本章后面描述：

<table>
  <tr>
    <td><code>autoLoadEntities</code></td>
    <td>If <code>true</code>, entities registered through <code>forFeature()</code> are added to the configuration automatically (default: <code>false</code>)</td>
  </tr>
  <tr>
    <td><code>registerRequestContext</code></td>
    <td>If <code>true</code>, registers a middleware that creates a request context for every HTTP request (default: <code>true</code>)</td>
  </tr>
  <tr>
    <td><code>forRoutesPath</code></td>
    <td>The route path that the request context middleware applies to (default: all routes)</td>
  </tr>
  <tr>
    <td><code>scope</code></td>
    <td>The <a href="/fundamentals/injection-scopes">injection scope</a> of the <code>EntityManager</code> provider (default: <code>Scope.DEFAULT</code>)</td>
  </tr>
  <tr>
    <td><code>contextName</code></td>
    <td>The name of the connection, required when you connect to <a href="/data/mikroorm#multiple-databases">multiple databases</a></td>
  </tr>
</table>

或者，您可以将配置保留在单独的 `mikro-orm.config.ts` 文件，其中 [MikroORM CLI](https://mikro-orm.io/docs/quick-start#setting-up-the-commandline-tool) 也使用。这个 `defineConfig()` 驱动程序包导出的助手设置 `driver` 您的选择：

```typescript
// mikro-orm.config.ts
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { defineConfig } from '@mikro-orm/sqlite';

export default defineConfig({
  dbName: 'my-db-name.sqlite3',
  entities: ['./dist/**/*.entity.js'],
  entitiesTs: ['./src/**/*.entity.ts'],
  metadataProvider: ReflectMetadataProvider,
});
```

然后将配置传递到 `forRoot()`。由于 MikroORM v7，`forRoot()` 不再接受空参数列表，因此必须显式传递配置：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from './mikro-orm.config.js';

@Module({
  imports: [MikroOrmModule.forRoot(config)],
})
export class AppModule {}
```

之后，`MikroORM` 和 `EntityManager` 对象可以在整个项目中注入，而无需在其他地方导入任何模块：

```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager, MikroORM } from '@mikro-orm/sqlite';

@Injectable()
export class AppService {
  constructor(
    private readonly orm: MikroORM,
    private readonly em: EntityManager,
  ) {}
}
```

> info **Note** 从 `@mikro-orm/<driver>` 包导入 `EntityManager` 和 `MikroORM`，其中 `<driver>` 是 `sqlite`、`postgresql`、`mysql` 或您使用的任何驱动程序，以获得特定于驱动程序的 API。如果将 `@mikro-orm/sql` 安装为依赖项，也可以从那里导入 `EntityManager`。`@mikro-orm/core` 导出的泛型类也注册为注入令牌。

#### 存储库

MikroORM 支持存储库设计模式，因此每个实体都有自己的存储库。参见 [MikroORM repositories documentation](https://mikro-orm.io/docs/repositories) 详情。要继续示例，定义一个 `Photo` 实体：

```typescript
// photo/photo.entity.ts
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

@Entity()
export class Photo {
  @PrimaryKey()
  id: number;

  @Property()
  name: string;
}
```

> info **Hint** 除了装饰器，MikroORM 还可以使用 `defineEntity()` 助手或 `EntitySchema` 类定义实体。在 [MikroORM defining entities guide](https://mikro-orm.io/docs/defining-entities) 中了解更多信息。

若要定义当前作用域中注册了哪些存储库，请使用 `forFeature()` 方法：

```typescript
// photo/photo.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Photo } from './photo.entity.js';
import { PhotoService } from './photo.service.js';
import { PhotoController } from './photo.controller.js';

@Module({
  imports: [MikroOrmModule.forFeature([Photo])],
  providers: [PhotoService],
  controllers: [PhotoController],
})
export class PhotoModule {}
```

> info **Note** 不要通过 `forFeature()` 注册您的基本实体，因为没有它们的存储库。但是，基本实体确实需要成为 ORM 配置的一部分（例如，`forRoot()` 的 `entities` 选项）。

然后将 `PhotoModule` 导入到根 `AppModule` 中：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from './mikro-orm.config.js';
import { PhotoModule } from './photo/photo.module.js';

@Module({
  imports: [MikroOrmModule.forRoot(config), PhotoModule],
})
export class AppModule {}
```

您现在可以注入 `Photo` 存储库到 `PhotoService` 使用 `@InjectRepository()` 装饰师：

```typescript
// photo/photo.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';

@Injectable()
export class PhotoService {
  constructor(
    @InjectRepository(Photo)
    private readonly photoRepository: EntityRepository<Photo>,
    private readonly em: EntityManager,
  ) {}

  findAll(): Promise<Photo[]> {
    return this.photoRepository.findAll();
  }

  findOne(id: number): Promise<Photo | null> {
    return this.photoRepository.findOne({ id });
  }

  async create(name: string): Promise<Photo> {
    const photo = this.photoRepository.create({ name });
    await this.em.flush();
    return photo;
  }

  async remove(id: number): Promise<void> {
    const photo = await this.photoRepository.findOneOrFail({ id });
    await this.em.remove(photo).flush();
  }
}
```

存储库没有 `persist()` 或者 `flush()` 方法，因此写操作要经过 `EntityManager`，实现了 [Unit of Work](https://mikro-orm.io/docs/unit-of-work) 模式。存储库的 `create()` 方法标记新实体以便持久性，并且 `em.flush()` 在单个事务中将所有挂起的更改写入数据库。

#### 使用自定义存储库

要添加您自己的查询方法，请展开 `EntityRepository` 并通过 `repository` 选项：

```typescript
// author/author.entity.ts
import { EntityRepositoryType } from '@mikro-orm/core';
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { AuthorRepository } from './author.repository.js';

@Entity({ repository: () => AuthorRepository })
export class Author {
  // enables type inference in `em.getRepository()`
  [EntityRepositoryType]?: AuthorRepository;

  @PrimaryKey()
  id: number;

  @Property()
  name: string;
}
```

```typescript
// author/author.repository.ts
import { EntityRepository } from '@mikro-orm/sqlite';
import { Author } from './author.entity.js';

export class AuthorRepository extends EntityRepository<Author> {
  findByName(name: string): Promise<Author | null> {
    return this.findOne({ name });
  }
}
```

当你通过 `Author` 实体 `forFeature()` 模块还将自定义存储库类本身注册为提供程序。因此，您可以通过它的类注入它，而无需 `@InjectRepository()` 装饰师：

```typescript
@Injectable()
export class AuthorService {
  constructor(private readonly authorRepository: AuthorRepository) {}
}
```

#### 自动加载实体

手动将实体添加到 `entities` 配置的数组可能会很乏味。此外，从根模块引用实体会打破应用程序域边界，并将实现细节泄露给应用程序的其他部分。全局路径解决了这个问题，但是当您捆绑应用程序时，它们不起作用（例如，在 [单存储库](/cli/monorepo))：MikroORM 在运行时查找匹配的文件，并且包中不包含它们作为单独的文件。

或者，您可以通过设置 `autoLoadEntities` 配置对象的属性（传递到 `forRoot()` 方法）到 `true`，如下所示：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { SqliteDriver } from '@mikro-orm/sqlite';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: SqliteDriver,
      dbName: 'my-db-name.sqlite3',
      metadataProvider: ReflectMetadataProvider,
      autoLoadEntities: true,
    }),
  ],
})
export class AppModule {}
```

启用此选项后，通过 `forFeature()` 方法会自动添加到 `entities` 配置对象的数组。

> info **Note** 未通过 `forFeature()` 方法，但仅从实体（通过关系）引用，不会被 `autoLoadEntities` 设置。

> info **Note** `autoLoadEntities` 对 MikroORM 没有影响 CLI 仍然需要一个 CLI 使用完整的实体列表进行配置。但是，您可以在那里使用 globs，作为 CLI 不运行您的包。

#### 请求语境

MikroORM 将加载的实体保留在 [身份映射](https://mikro-orm.io/docs/identity-map)，不得在并发请求之间共享。每个请求都需要自己的分叉 `EntityManager` 有一张干净的身份图。这个 `MikroOrmModule` 为您处理这个问题：它为运行每个路由的所有路由注册一个中间件 HTTP 请求内部 `RequestContext` 在这种情况下，全球 `EntityManager` 您注入的（以及依赖于它的每个存储库）透明地委托给请求的 fork。

在请求上下文之外，MikroORM 拒绝使用全局 `EntityManager` 对于依赖于标识映射的操作，例如 `find()` 或者 `flush()`，并抛出一个 `ValidationError`.这 [下一节](/data/mikroorm#request-scoped-handlers-in-queues) 演示如何为不作为代码的一部分运行的代码创建上下文 HTTP 请求。

若要仅将中间件应用于路由的子集，请设置 `forRoutesPath` 选择。若要禁用它，请设置 `registerRequestContext` 二 `false` 例如，您可以不使用中间件，而是让 Nest 创建一个 `EntityManager` 通过使 `EntityManager` 供应商 [request-scoped](/fundamentals/injection-scopes):

```typescript
// app.module.ts
import { Module, Scope } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from './mikro-orm.config.js';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      ...config,
      registerRequestContext: false,
      scope: Scope.REQUEST,
    }),
  ],
})
export class AppModule {}
```

> warning **Warning** 有了 `scope: Scope.REQUEST`，依赖于 `EntityManager` 的每个提供者（包括存储库）也变成了请求范围。这会影响性能，如 [注入范围章节](/fundamentals/injection-scopes#performance) 中所述。

#### 在队列中请求作用域处理程序

中间件仅运行 HTTP 请求。流程外部代码，例如 [队列](/application/queues) 消费者和 [预定任务](/application/task-scheduling)，没有请求上下文，因此您需要自己创建一个。

对于这些方法，请使用 `@CreateRequestContext()` 装修师。它分叉 `EntityManager` 并运行装饰 `async` 新上下文中的方法。装修人员查看 `EntityManager` 通过 `orm` 物业（a`MikroORM` 实例）或 `em` 属性（一个 `EntityManager`）的类，因此在该名称下注入其中一个：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { MikroORM } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';

@Injectable()
export class PhotoStatsService {
  private readonly logger = new Logger(PhotoStatsService.name);

  constructor(private readonly orm: MikroORM) {}

  @Cron(CronExpression.EVERY_HOUR)
  @CreateRequestContext()
  async logPhotoCount() {
    // runs in a separate context, with its own identity map
    const count = await this.orm.em.count(Photo);
    this.logger.log(`Found ${count} photos`);
  }
}
```

> warning **Warning** 将 `@CreateRequestContext()` 放在方法的正上方，放在其他方法装饰符（如 `@Cron()`）的下方。装饰器用包装器替换该方法。上面列出的装饰器将它们的元数据附加到该包装器，但是下面列出的装饰器将它们的元数据附加到原始方法，Nest 永远看不到这一点（在这个例子中，cron 作业不会被注册）。

> info **Note** 顾名思义，这个装饰器总是创建一个新的上下文，而不是它的替代 `@EnsureRequestContext()`，后者只有在方法还没有在另一个上下文中运行时才创建一个上下文。在 MikroORM v6 之前，`@CreateRequestContext()` 被称为 `@UseRequestContext()`，在 v7 之前，它是从 `@mikro-orm/core` 导出的。

#### 交易

MikroORM 将所有写操作排队，直到您调用 `em.flush()`，然后将它们包装在一个事务中。要自行控制事务边界，例如，要刷新多次或将更改与其他查询合并，请使用 `em.transactional()` 方法：

```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';

@Injectable()
export class PhotoService {
  constructor(private readonly em: EntityManager) {}

  async createMany(names: string[]): Promise<void> {
    await this.em.transactional(async (em) => {
      for (const name of names) {
        em.create(Photo, { name });
      }
    });
  }
}
```

回调收到分叉 `EntityManager` 这在交易中运行。当回调完成时，MikroORM 刷新分叉并提交事务。如果回调引发，MikroORM 会回滚事务并重新引发错误。

或者，使用 `@Transactional()` 装饰器，它将装饰的 `async` 方法包装在 `em.transactional()` 中：

```typescript
import { Injectable } from '@nestjs/common';
import { Transactional } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';

@Injectable()
export class PhotoService {
  constructor(private readonly em: EntityManager) {}

  @Transactional()
  async createMany(names: string[]): Promise<void> {
    for (const name of names) {
      this.em.create(Photo, { name });
    }
  }
}
```

喜欢 `@CreateRequestContext()` 装饰者发现 `EntityManager` 通过 `em` 或者 `orm` 类的属性，如果类都没有，则返回到当前上下文。在另一个事务中调用时，`em.transactional()` 启动嵌套事务（保存点），而 `@Transactional()` 默认情况下加入现有事务。参见 [MikroORM transactions documentation](https://mikro-orm.io/docs/transactions) 对于传播选项、隔离级别和锁定。

#### 序列化

MikroORM 实体具有 `toJSON()` 应用 MikroORM 的方法 [序列化规则](https://mikro-orm.io/docs/serializing)：它省略隐藏属性，应用自定义属性序列化程序，并将填充关系序列化为嵌套对象，将未填充关系序列化为其主键。当路由处理程序返回实体时，Nest 将其转换为 JSON，因此这些规则自动应用。

> warning **Warning** 不要使用 [Nest's built-in serializer](/application/serialization)（`ClassSerializerInterceptor`) 带有 MikroORM 实体。它依赖于 `class-transformer`，它不理解 MikroORM 用于关系的包装器：它序列化了一个 `Reference`，并穿过一个 `Collection` 导致无限递归（“超过最大调用堆栈大小”错误）。

相反，请使用 MikroORM 的选项配置实体上的序列化：

```typescript
// book/book.entity.ts
import { type Rel } from '@mikro-orm/core';
import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { Author } from '../author/author.entity.js';

@Entity()
export class Book {
  @PrimaryKey()
  id: number;

  @Property()
  title: string;

  @Property({ hidden: true }) // Equivalent of class-transformer's `@Exclude()`
  hiddenField: number = Date.now();

  @Property({ persist: false }) // Similar to class-transformer's `@Expose()`. Only exists in memory, but is serialized.
  count?: number;

  @ManyToOne(() => Author, {
    serializer: (author: Author) => author.name,
    serializedName: 'authorName',
  }) // Equivalent of class-transformer's `@Transform()`
  author: Rel<Author>;
}
```

> info **Hint** 当实体相互引用时，将关系的类型包装在 `Rel<T>`（或使用 `Ref<T>`）从 `@mikro-orm/core`，并将目标实体传递给关系装饰器，如上所示。否则，TypeScript 发出直接引用相关类的装饰器元数据。在 ESM 项目，实体文件之间的循环导入然后在启动时失败 `ReferenceError`（例如，“初始化前无法访问‘作者’”）。

要控制单个路由处理程序的序列化，请使用 `serialize()` 函数显式转换实体，该函数由驱动程序包和 `@mikro-orm/core` 导出。它接受 `populate`、`exclude`、`fields` 和 `groups` 等选项：

```typescript
@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  const book = await this.em.findOneOrFail(Book, { id }, { populate: ['author'] });
  return serialize(book, { fields: ['title', 'author'] }); // { title: '...', authorName: '...' }
}
```

若要获得应用了默认规则的普通对象，请调用 `wrap(entity).toObject()`。

#### 多个数据库

若要连接到多个数据库，请调用 `MikroOrmModule.forRoot()` 每个数据库一次，并给每个连接一个唯一的 `contextName`.在此设置中，设置 `registerRequestContext` 二 `false` 在每个连接上，因为默认中间件只适用于单个未命名的连接。相反，进口 `MikroOrmModule.forMiddleware()` 一次。它的中间件创建一个覆盖所有连接的请求上下文：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { Album } from './album/album.entity.js';
import { Photo } from './photo/photo.entity.js';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      contextName: 'photos',
      registerRequestContext: false,
      driver: SqliteDriver,
      dbName: 'photos.sqlite3',
      entities: [Photo],
      metadataProvider: ReflectMetadataProvider,
    }),
    MikroOrmModule.forRoot({
      contextName: 'albums',
      registerRequestContext: false,
      driver: SqliteDriver,
      dbName: 'albums.sqlite3',
      entities: [Album],
      metadataProvider: ReflectMetadataProvider,
    }),
    MikroOrmModule.forMiddleware(),
  ],
})
export class AppModule {}
```

> warning **Notice** 如果您使用 `MikroOrmModule.forRootAsync()`，设置 `contextName` 旁边 `useFactory`，而不是工厂返回的 options 对象中。

使用此设置，将上下文名称传递给 `forFeature()` 方法和 `@InjectRepository()` 装饰师：

```typescript
// album/album.module.ts
@Module({
  imports: [MikroOrmModule.forFeature([Album], 'albums')],
  providers: [AlbumService],
})
export class AlbumModule {}
```

注入 `MikroORM` 或者 `EntityManager` 对于特定连接，使用 `@InjectMikroORM()` 和 `@InjectEntityManager()` 装修人员：

```typescript
// album/album.service.ts
import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectMikroORM, InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/sqlite';
import { Album } from './album.entity.js';

@Injectable()
export class AlbumService {
  constructor(
    @InjectRepository(Album, 'albums')
    private readonly albumRepository: EntityRepository<Album>,
    @InjectEntityManager('albums')
    private readonly em: EntityManager,
    @InjectMikroORM('albums')
    private readonly orm: MikroORM,
  ) {}
}
```

注入所有注册 `MikroORM` 实例作为数组，使用 `@InjectMikroORMs()` 装修师。

#### 检测

单元测试应用程序时，您通常希望避免数据库连接，这样可以保持测试套件的独立性和速度。但是，您的类可能依赖于存储库和 `EntityManager`。要解析这些类，请使用 [定制提供者](/fundamentals/custom-providers) 提供模拟实现。

这个 `@mikro-orm/nestjs` 包暴露了一个 `getRepositoryToken()` 基于给定实体返回准备好的注入令牌的函数（例如，`'PhotoRepository'` 为了 `Photo` 实体），允许您模拟存储库。对于自定义存储库，使用其类作为令牌：

```typescript
import { Module } from '@nestjs/common';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';
import { PhotoService } from './photo.service.js';

@Module({
  providers: [
    PhotoService,
    {
      // or, for a custom repository: `provide: PhotoRepository`
      provide: getRepositoryToken(Photo),
      useValue: mockedRepository,
    },
    {
      provide: EntityManager,
      useValue: mockedEntityManager,
    },
  ],
})
export class PhotoModule {}
```

现在，`mockedRepository` 对象被注入到这个模块中的类使用 `@InjectRepository(Photo)` 装饰器请求 `Photo` 存储库的任何地方。对于 [多个数据库](/data/mikroorm#multiple-databases)，将上下文名称作为第二个参数传递，例如 `getRepositoryToken(Album, 'albums')`。

#### 异步配置

当需要异步传递模块选项而不是静态传递时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供异步配置的几种技术。

一种技术是使用工厂函数。与其他 [工厂供应商](/fundamentals/custom-providers#factory-providers-usefactory) 一样，工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖项：

```typescript
MikroOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    dbName: configService.getOrThrow<string>('DB_NAME'),
    autoLoadEntities: true,
    metadataProvider: ReflectMetadataProvider,
  }),
  inject: [ConfigService],
  driver: SqliteDriver,
});
```

> warning **Warning** 设置 `driver` 旁边的选项 `useFactory`，如上所示。模块在调用工厂之前需要知道驱动程序，以注册特定于驱动程序的 `EntityManager` 和 `MikroORM` 类作为注入令牌。如果没有它，注射 `EntityManager` 从您的驱动程序包失败，出现依赖关系解析错误。

或者，您可以配置 `MikroOrmModule` 使用类而不是工厂，如下所示：

```typescript
MikroOrmModule.forRootAsync({
  useClass: MikroOrmConfigService,
  driver: SqliteDriver,
});
```

上面的构造实例化 `MikroOrmConfigService` 内部 `MikroOrmModule`，使用它创建所需的选项对象。在本例中，`MikroOrmConfigService` 必须实施 `MikroOrmOptionsFactory` 界面，如下所示。这个 `MikroOrmModule` 调用 `createMikroOrmOptions()` 方法对所提供类的实例化对象。

```typescript
import { Injectable } from '@nestjs/common';
import { MikroOrmModuleOptions, MikroOrmOptionsFactory } from '@mikro-orm/nestjs';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';

@Injectable()
export class MikroOrmConfigService implements MikroOrmOptionsFactory {
  createMikroOrmOptions(): MikroOrmModuleOptions {
    return {
      dbName: 'my-db-name.sqlite3',
      autoLoadEntities: true,
      metadataProvider: ReflectMetadataProvider,
    };
  }
}
```

重用现有选项提供程序，而不是在 `MikroOrmModule`，使用 `useExisting` 句法。提供程序必须实现 `MikroOrmOptionsFactory` 接口和中列出的模块 `imports` 必须导出它：

```typescript
MikroOrmModule.forRootAsync({
  imports: [DatabaseConfigModule],
  useExisting: MikroOrmConfigService,
  driver: SqliteDriver,
});
```

#### 应用程序关闭

`MikroOrmModule` 关闭 ORM 及其在 `onApplicationShutdown()` 生命周期挂钩中的数据库连接，当您调用 `app.close()` 时，Nest 会调用该挂钩。但是，默认情况下，Nest 不监听 `SIGTERM` 等进程终止信号，因此当进程终止时，连接不会关闭。要在这种情况下关闭它，请启用 [关闭挂钩](/fundamentals/lifecycle-events#application-shutdown)：

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

#### 例子

对于使用 NestJS 使用 MikroORM，请参阅 [nestjs-realworld-example-app](https://github.com/mikro-orm/nestjs-realworld-example-app) 和 [nestjs-example-app](https://github.com/mikro-orm/nestjs-example-app) 存储库。
