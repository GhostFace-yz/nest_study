# TypeORM

Source: https://docs.nestjs.com/data/typeorm

`@nestjs/typeorm` 包将 [TypeORM](https://github.com/typeorm/typeorm) 与 Nest 集成。TypeORM 是适用于 TypeScript 的最成熟的对象关系映射器（ORM）之一。因为是用 TypeScript 写的，所以和 Nest 结合得很好。

要开始，请安装所需的依赖项。本章使用 [MySQL](https://www.mysql.com/)，但 TypeORM 支持许多其他关系数据库，如 PostgreSQL、Oracle、MicrosoftSQLServer 和 SQLite，以及 NoSQL 数据库，如 MongoDB。本章中的步骤对于每个数据库 TypeORM 支持都是相同的；您只需要为数据库安装客户端库。

```bash
$ npm install --save @nestjs/typeorm typeorm mysql2
```

安装完成后，将 `TypeOrmModule` 导入到根 `AppModule` 中：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      entities: [],
      synchronize: true,
    }),
  ],
})
export class AppModule {}
```

> warning **Warning** 不要使用 `synchronize: true` 生产中；否则，您可能会丢失生产数据。

`forRoot()` 方法接受 TypeORM[`DataSource` constructor](https://typeorm.io/docs/data-source/data-source-options#common-data-source-options) 支持的所有配置属性。它还接受以下附加属性：

<table>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>Number of attempts to connect to the database (default: <code>10</code>)</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>Delay between connection retry attempts, in milliseconds (default: <code>3000</code>)</td>
  </tr>
  <tr>
    <td><code>toRetry</code></td>
    <td>Function that receives the connection error and returns whether to retry. By default, every error is retried</td>
  </tr>
  <tr>
    <td><code>verboseRetryLog</code></td>
    <td>If <code>true</code>, the error message is included in the log entry for each connection retry (default: <code>false</code>)</td>
  </tr>
  <tr>
    <td><code>autoLoadEntities</code></td>
    <td>If <code>true</code>, entities are loaded automatically (default: <code>false</code>). See <a href="/data/typeorm#auto-load-entities">Auto-load entities</a></td>
  </tr>
  <tr>
    <td><code>manualInitialization</code></td>
    <td>If <code>true</code>, the data source isn't initialized during module initialization, so no connection is established and no migrations run. You must call <code>DataSource.initialize()</code> yourself and handle retries if needed (default: <code>false</code>)</td>
  </tr>
</table>

> info **Hint** 了解有关中可用选项的更多信息 [TypeORM data source options](https://typeorm.io/docs/data-source/data-source-options) 文件。

完成后，您可以注入 TypeORM`DataSource` 和 `EntityManager` 对象在项目中的任何位置，无需导入任何模块。例如：

```typescript
import { DataSource } from 'typeorm';

@Module({
  imports: [TypeOrmModule.forRoot(), UsersModule],
})
export class AppModule {
  constructor(private dataSource: DataSource) {}
}
```

#### 存储库模式

[TypeORM](https://github.com/typeorm/typeorm) 支持**存储库设计模式**，因此每个实体都有自己的存储库。您从数据源获取这些存储库。

为了继续这个例子，我们至少需要一个实体。让我们定义 `User` 实体。

```typescript
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: true })
  isActive: boolean;
}
```

> info **Hint** 了解有关 [TypeORM documentation](https://typeorm.io/docs/entity/entities/) 中实体的更多信息。

`User` 实体文件位于 `users` 目录中，该目录包含与 `UsersModule` 相关的所有文件。您可以将模型文件保存在任何您喜欢的地方，但是我们建议将它们放在它们的**域**附近，在相应的模块目录中。

要开始使用 `User` 实体，让 TypeORM 通过将其添加到 `entities` 数组在 `forRoot()` 选项（除非使用静态球形路径）：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      entities: [User],
      synchronize: true,
    }),
  ],
})
export class AppModule {}
```

接下来，让我们看一下 `UsersModule`：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { User } from './user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
```

本模块使用 `forFeature()` 方法来定义在当前作用域中注册了哪些存储库。有了这个，你就可以注入 `User` 存储库到 `UsersService` 与 `@InjectRepository()` 装饰师：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  async remove(id: number): Promise<void> {
    await this.usersRepository.delete(id);
  }
}
```

> warning **Notice** 不要忘记将 `UsersModule` 导入到根 `AppModule` 中。

使用导入的模块外部的存储库 `TypeOrmModule.forFeature()`，重新导出它生成的提供程序。您可以通过导出整个模块来执行此操作：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  exports: [TypeOrmModule]
})
export class UsersModule {}
```

现在，如果您导入 `UsersModule` 进入 `UserHttpModule`，您可以使用 `@InjectRepository(User)` 在后一个模块的提供程序中：

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from './users.module.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [UsersModule],
  providers: [UsersService],
  controllers: [UsersController]
})
export class UserHttpModule {}
```

#### 关系

关系是两个或多个表之间的关联，基于每个表的公共字段，通常涉及主键和外键。

有三种类型的关系：

<table>
  <tr>
    <td><code>One-to-one</code></td>
    <td>Every row in the primary table has one and only one associated row in the foreign table. Use the <code>@OneToOne()</code> decorator to define this type of relation.</td>
  </tr>
  <tr>
    <td><code>One-to-many / Many-to-one</code></td>
    <td>Every row in the primary table has one or more related rows in the foreign table. Use the <code>@OneToMany()</code> and <code>@ManyToOne()</code> decorators to define this type of relation.</td>
  </tr>
  <tr>
    <td><code>Many-to-many</code></td>
    <td>Every row in the primary table has many related rows in the foreign table, and every row in the foreign table has many related rows in the primary table. Use the <code>@ManyToMany()</code> decorator to define this type of relation.</td>
  </tr>
</table>

要定义实体中的关系，请使用相应的**decorators**。例如，要定义每个 `User` 可以有多张照片，使用 `@OneToMany()` 装修师。

```typescript
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Photo } from '../photos/photo.entity.js';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(type => Photo, photo => photo.user)
  photos: Photo[];
}
```

> info **Hint** 要了解有关 TypeORM 中关系的更多信息，请访问 [TypeORM documentation](https://typeorm.io/docs/relations/relations)。

#### 自动加载实体

手动将实体添加到数据源选项的 `entities` 数组可能很繁琐。此外，从根模块引用实体会打破应用程序域边界，并将实现细节泄露给应用程序的其他部分。要避免这种情况，请将传递给 `forRoot()` 的 options 对象的 `autoLoadEntities` 属性设置为 `true`：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...
      autoLoadEntities: true,
    }),
  ],
})
export class AppModule {}
```

启用此选项后，通过 `forFeature()` 方法会自动添加到 `entities` 数据源选项数组。

> warning **Warning** 未通过 `forFeature()`，并且仅从另一个实体（通过关系）引用，不包含在 `autoLoadEntities` 设置。

#### 分离实体定义

您可以使用装饰器直接在模型类中定义实体及其列。或者，您可以使用 [实体模式](https://typeorm.io/docs/entity/separating-entity-definition) 在单独的文件中定义图元及其列。

```typescript
import { EntitySchema } from 'typeorm';
import { User } from './user.entity.js';

export const UserSchema = new EntitySchema<User>({
  name: 'User',
  target: User,
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: true,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  relations: {
    photos: {
      type: 'one-to-many',
      target: 'Photo', // the name of the PhotoSchema
    },
  },
});
```

> warning **Warning** 如果您提供 `target` 选项，`name` 选项必须与目标类的名称匹配。如果您不提供 `target`，你可以用任何名字。

Nest 让您使用 `EntitySchema` 实例，其中需要实体类。例如：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSchema } from './user.schema.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserSchema])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
```

#### TypeORM 交易

一个 [数据库事务](https://en.wikipedia.org/wiki/Database_transaction) 是针对数据库执行的工作单元，并以一致和可靠的方式处理，独立于其他事务。事务通常表示数据库中的任何更改。

有几种处理 [TypeORM transactions](https://typeorm.io/docs/advanced-topics/transactions/) 的策略。我们推荐 `QueryRunner` 类，因为它让您可以完全控制事务。

首先，注入 `DataSource` 像往常一样将对象转换成类：

```typescript
@Injectable()
export class UsersService {
  constructor(private dataSource: DataSource) {}
}
```

> info **Hint** 这个 `DataSource` 类是从 `typeorm` 包装。

然后使用它来创建事务：

```typescript
async createMany(users: User[]) {
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.manager.save(users[0]);
    await queryRunner.manager.save(users[1]);

    await queryRunner.commitTransaction();
  } catch (err) {
    // since we have errors, roll back the changes we made
    await queryRunner.rollbackTransaction();
  } finally {
    // you need to release a manually instantiated query runner
    await queryRunner.release();
  }
}
```

> info **Hint** `dataSource` 仅用于创建 `QueryRunner`。然而，测试这个类需要模拟整个 `DataSource` 对象，这暴露了许多方法。相反，我们推荐一个助手工厂类（例如，`QueryRunnerFactory`），它实现一个接口，只包含管理事务所需的方法。这使得这些方法很容易被嘲笑。

或者，您可以使用回调样式 `transaction()` 方法 `DataSource` 对象（参见 [Creating and using transactions](https://typeorm.io/docs/advanced-topics/transactions/#creating-and-using-transactions) 在 TypeORM 文件）：

```typescript
async createMany(users: User[]) {
  await this.dataSource.transaction(async manager => {
    await manager.save(users[0]);
    await manager.save(users[1]);
  });
}
```

#### 订户

和 TypeORM[订户](https://typeorm.io/docs/advanced-topics/listeners-and-subscribers#what-is-a-subscriber)，您可以监听特定的实体事件。

```typescript
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { User } from './user.entity.js';

@EventSubscriber()
export class UserSubscriber implements EntitySubscriberInterface<User> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return User;
  }

  beforeInsert(event: InsertEvent<User>) {
    console.log(`BEFORE USER INSERTED: `, event.entity);
  }
}
```

> info 错误**警告**事件订阅者不能是 [request-scoped](/fundamentals/injection-scopes)。

现在，添加 `UserSubscriber` 班级到 `providers` 数组：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { UserSubscriber } from './user.subscriber.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, UserSubscriber],
  controllers: [UsersController],
})
export class UsersModule {}
```

#### 迁移

[Migrations](https://typeorm.io/docs/advanced-topics/migrations/) 提供一种增量更新数据库模式的方法，使其与应用程序的数据模型保持同步，同时保留数据库中的现有数据。要生成、运行和还原迁移，TypeORM 提供了一个专用的 [CLI](https://typeorm.io/docs/advanced-topics/migrations/#creating-a-new-migration)。

迁移类与 Nest 应用程序源代码，以及 TypeORM 管理它们的生命周期。因此，不能使用依赖注入或其他 Nest-迁移中的特定功能。要了解更多信息，请参阅 [迁移指南](https://typeorm.io/docs/advanced-topics/migrations/) 在 TypeORM 文件。

#### 多个数据库

有些项目需要多个数据库连接，本模块也支持这一点。若要使用多个连接，请先创建它们。在这种情况下，除默认数据源之外的每个数据源都必须有一个唯一的**名称**。

假设你有一个 `Album` 存储在自己数据库中的实体。

```typescript
const defaultOptions = {
  type: 'postgres' as const,
  port: 5432,
  username: 'user',
  password: 'password',
  database: 'db',
  synchronize: true,
};

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...defaultOptions,
      host: 'user_db_host',
      entities: [User],
    }),
    TypeOrmModule.forRoot({
      ...defaultOptions,
      name: 'albumsConnection',
      host: 'album_db_host',
      entities: [Album],
    }),
  ],
})
export class AppModule {}
```

> warning **Notice** 如果没有为数据源设置 `name`，则其名称为 `default`。不要注册多个没有名称的数据源，或者名称相同的数据源；否则，它们会相互覆盖。

> warning **Notice** 如果使用 `TypeOrmModule.forRootAsync()`，则必须**还**将数据源名称设置在 `useFactory` 之外。例如：
>
> ``` 打字脚本
> TypeOrmModule.forRootAsync({
> 名称：'albumsConnection'，
> useFactory:...,
> 注射：...，
> }),
> ```
>
> 有关更多详细信息，请参见 [nestjs/typeorm issue #86](https://github.com/nestjs/typeorm/issues/86)。

此时，`User` 和 `Album` 每个实体都注册到自己的数据源。使用此设置，您必须告诉您 `TypeOrmModule.forFeature()` 方法和 `@InjectRepository()` 使用哪个数据源的装饰器。如果不传递数据源名称，`default` 使用数据源。

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([Album], 'albumsConnection'),
  ],
})
export class AppModule {}
```

您也可以注射 `DataSource` 或者 `EntityManager` 对于给定的数据源：

```typescript
@Injectable()
export class AlbumsService {
  constructor(
    @InjectDataSource('albumsConnection')
    private dataSource: DataSource,
    @InjectEntityManager('albumsConnection')
    private entityManager: EntityManager,
  ) {}
}
```

您也可以注射任何 `DataSource` 通过使用 `getDataSourceToken()` 功能：

```typescript
@Module({
  providers: [
    {
      provide: AlbumsService,
      useFactory: (albumsConnection: DataSource) => {
        return new AlbumsService(albumsConnection);
      },
      inject: [getDataSourceToken('albumsConnection')],
    },
  ],
})
export class AlbumsModule {}
```

#### 检测

当对应用程序进行单元测试时，您通常希望避免连接到数据库，以保持测试套件的独立和尽可能快。但是，您的类可能依赖于从数据源实例获得的存储库。解决方案是使用 [定制提供者](/fundamentals/custom-providers).每个注册存储库都自动由一个 `<EntityName>Repository` 令牌，其中 `EntityName` 是实体类的名称。

这个 `@nestjs/typeorm` 包导出 `getRepositoryToken()` 函数，它返回给定实体的此令牌。对于命名数据源，将数据源名称作为第二个参数传递。

```typescript
@Module({
  providers: [
    UsersService,
    {
      provide: getRepositoryToken(User),
      useValue: mockRepository,
    },
  ],
})
export class UsersModule {}
```

现在 `mockRepository` 用作 `User` 仓库。每当一个类向它注入 `@InjectRepository(User)`,Nest 提供注册 `mockRepository` 物体。

#### 异步配置

您可能希望异步传递模块选项，而不是静态传递。在这种情况下，使用 `forRootAsync()` 方法，它支持几种提供异步配置的方式。

一种方法是使用工厂函数：

```typescript
TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'root',
    database: 'test',
    entities: [],
    synchronize: true,
  }),
});
```

工厂的行为类似于任何其他 [异步提供程序](/fundamentals/async-providers)（例如，它可以是 `async`，并且它可以通过 `inject` 注入依赖项）。

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    type: 'mysql',
    host: configService.get('HOST'),
    port: +configService.get('PORT'),
    username: configService.get('USERNAME'),
    password: configService.get('PASSWORD'),
    database: configService.get('DATABASE'),
    entities: [],
    synchronize: true,
  }),
  inject: [ConfigService],
});
```

或者，您可以使用 `useClass` 语法：

```typescript
TypeOrmModule.forRootAsync({
  useClass: TypeOrmConfigService,
});
```

上面的构造实例化 `TypeOrmConfigService` 内部 `TypeOrmModule` 并使用它通过调用创建 options 对象 `createTypeOrmOptions()`.这意味着 `TypeOrmConfigService` 必须实施 `TypeOrmOptionsFactory` 接口：

```typescript
@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      entities: [],
      synchronize: true,
    };
  }
}
```

重用从不同模块导入的提供程序，而不是创建 `TypeOrmConfigService` 内部 `TypeOrmModule`，使用 `useExisting` 语法：

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});
```

这与 `useClass` 有一个关键的区别：`TypeOrmModule` 查找导入的模块以重用现有模块 `ConfigService` 而不是实例化一个新的。

> info **Hint** 定义 `name` 与 `useFactory`,`useClass`, 或 `useExisting` 财产。这让 Nest 在适当的注入令牌下注册数据源。

#### 自定义数据源工厂

与异步配置一起（`useFactory`,`useClass`, 或 `useExisting`），您可以选择指定 `dataSourceFactory` 功能提供您自己的 TypeORM 数据源而不是出租 `TypeOrmModule` 创造它。

`dataSourceFactory` 接收由异步配置解析的 TypeORM`DataSourceOptions`，并返回解析为 TypeORM`DataSource` 的 `Promise`。如果返回的数据源尚未初始化，`TypeOrmModule` 将初始化它（除非设置了 `manualInitialization`）。

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  // Use useFactory, useClass, or useExisting
  // to configure the DataSourceOptions.
  useFactory: (configService: ConfigService) => ({
    type: 'mysql',
    host: configService.get('HOST'),
    port: +configService.get('PORT'),
    username: configService.get('USERNAME'),
    password: configService.get('PASSWORD'),
    database: configService.get('DATABASE'),
    entities: [],
    synchronize: true,
  }),
  // dataSourceFactory receives the configured DataSourceOptions
  // and returns a Promise<DataSource>.
  dataSourceFactory: async (options) => {
    const dataSource = await new DataSource(options!).initialize();
    return dataSource;
  },
});
```

> info **Hint** 这个 `DataSource` 类是从 `typeorm` 包装。

#### 例子

工作示例可在 [TypeORM sample application](https://github.com/nestjs/nest/tree/master/sample/05-sql-typeorm) 在 NestJS 仓库。
