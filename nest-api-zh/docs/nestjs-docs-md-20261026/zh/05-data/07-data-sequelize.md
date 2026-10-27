# Sequelize

Source: https://docs.nestjs.com/data/sequelize

`@nestjs/sequelize` 包将 [Sequelize](https://sequelize.org/)ORM 与 Nest 集成。它还使用 [sequelize-typescript](https://github.com/RobinBuschmann/sequelize-typescript) 包，该包提供装饰器来声明式定义模型。

要开始使用它，我们首先安装所需的依赖项。在本章中，我们将演示使用流行的 [MySQL](https://www.mysql.com/) 关系 DBMS，但 Sequelize 支持许多关系数据库，如 PostgreSQL、MySQL、MicrosoftSQL 服务器、SQLite 和 MariaDB。对于 Sequelize 支持的任何数据库，我们在本章中经历的过程都是相同的。您只需安装关联的客户端 API 所选数据库的库。

```bash
$ npm install --save @nestjs/sequelize sequelize sequelize-typescript mysql2
$ npm install --save-dev @types/sequelize
```

安装过程完成后，我们可以将 `SequelizeModule` 导入到根 `AppModule` 中。

```typescript
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      models: [],
    }),
  ],
})
export class AppModule {}
```

`forRoot()` 方法支持 Sequelize 构造函数([阅读更多](https://sequelize.org/docs/v6/getting-started/#connecting-to-a-database)) 公开的所有配置属性。此外，下面描述了几个额外的配置属性。

<table>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>Number of attempts to connect to the database (default: <code>10</code>)</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>Delay between connection retry attempts (ms) (default: <code>3000</code>)</td>
  </tr>
  <tr>
    <td><code>autoLoadModels</code></td>
    <td>If <code>true</code>, models will be loaded automatically (default: <code>false</code>)</td>
  </tr>
  <tr>
    <td><code>autoCloseConnection</code></td>
    <td>If <code>true</code>, the connection is closed when the application shuts down (default: <code>true</code>)</td>
  </tr>
  <tr>
    <td><code>synchronize</code></td>
    <td>If <code>true</code>, automatically loaded models will be synchronized (default: <code>true</code>)</td>
  </tr>
</table>

一旦完成，`Sequelize` 对象将可用于在整个项目中注入（无需导入任何模块），例如：

```typescript
import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

@Injectable()
export class AppService {
  constructor(private sequelize: Sequelize) {}
}
```

#### 模型

Sequelize 实现活动记录模式。使用这种模式，您可以直接使用模型类来与数据库交互。为了继续这个例子，我们至少需要一个模型。让我们定义 `User` 模型。

```typescript
import { Column, Model, Table } from 'sequelize-typescript';

@Table
export class User extends Model {
  @Column
  firstName: string;

  @Column
  lastName: string;

  @Column({ defaultValue: true })
  isActive: boolean;
}
```

> info **Hint** 了解有关可用装饰器的更多信息 [在这里](https://github.com/RobinBuschmann/sequelize-typescript#column)。

`User` 模型文件位于 `users` 目录中。此目录包含与 `UsersModule` 相关的所有文件。您可以决定将模型文件保存在哪里，但是，我们建议在它们的**域**附近，在相应的模块目录中创建它们。

开始使用 `User` 模型，我们需要通过将其插入到 `models` 模块中的数组 `forRoot()` 方法选项：

```typescript
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './users/user.model.js';

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      models: [User],
    }),
  ],
})
export class AppModule {}
```

接下来，让我们看一下 `UsersModule`：

```typescript
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './user.model.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [SequelizeModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
```

本模块使用 `forFeature()` 方法来定义在当前作用域中注册了哪些模型。有了这个，我们就可以注入 `UserModel` 进入 `UsersService` 使用 `@InjectModel()` 装饰师：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './user.model.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User)
    private userModel: typeof User,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userModel.findAll();
  }

  findOne(id: string): Promise<User> {
    return this.userModel.findOne({
      where: {
        id,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await user.destroy();
  }
}
```

> warning **Notice** 不要忘记将 `UsersModule` 导入到根 `AppModule` 中。

如果要在导入的模块之外使用模型 `SequelizeModule.forFeature`，您需要重新导出它生成的提供程序。
您可以通过导出整个模块来执行此操作，如下所示：

```typescript
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './user.entity.js';

@Module({
  imports: [SequelizeModule.forFeature([User])],
  exports: [SequelizeModule]
})
export class UsersModule {}
```

现在如果我们进口 `UsersModule` 在 `UserHttpModule`，我们可以使用 `@InjectModel(User)` 在后一个模块的提供者中。

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

关系是两个或多个表之间建立的关联。关系基于每个表中的公共字段，通常涉及主键和外键。

有三种类型的关系：

<table>
  <tr>
    <td><code>One-to-one</code></td>
    <td>Every row in the primary table has one and only one associated row in the foreign table</td>
  </tr>
  <tr>
    <td><code>One-to-many / Many-to-one</code></td>
    <td>Every row in the primary table has one or more related rows in the foreign table</td>
  </tr>
  <tr>
    <td><code>Many-to-many</code></td>
    <td>Every row in the primary table has many related rows in the foreign table, and every record in the foreign table has many related rows in the primary table</td>
  </tr>
</table>

若要定义模型中的关系，请使用相应的**装饰器**。例如，要定义每个 `User` 可以有多张照片，使用 `@HasMany()` 装修师。

```typescript
import { Column, Model, Table, HasMany } from 'sequelize-typescript';
import { Photo } from '../photos/photo.model.js';

@Table
export class User extends Model {
  @Column
  firstName: string;

  @Column
  lastName: string;

  @Column({ defaultValue: true })
  isActive: boolean;

  @HasMany(() => Photo)
  photos: Photo[];
}
```

> info **Hint** 要了解有关 Sequelize 中关联的更多信息，请阅读 [这个](https://github.com/RobinBuschmann/sequelize-typescript#model-association) 篇章。

#### 自动加载模型

手动添加模型到 `models` 连接选项的数组可能会很乏味。此外，从根模块引用模型会打破应用程序域边界，并导致实现细节泄漏到应用程序的其他部分。要解决此问题，请通过设置这两个选项来自动加载模型 `autoLoadModels` 和 `synchronize` 配置对象的属性（传递到 `forRoot()` 方法）到 `true`，如下所示：

```typescript
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [
    SequelizeModule.forRoot({
      ...
      autoLoadModels: true,
      synchronize: true,
    }),
  ],
})
export class AppModule {}
```

指定了该选项后，通过 `forFeature()` 方法将自动添加到 `models` 配置对象的数组。

> warning **Warning** 请注意，未通过 `forFeature()` 方法，但仅从模型中引用（通过关联），将不包括在内。

#### 后续交易

数据库事务象征着在数据库管理系统内针对数据库执行的工作单元，并且以独立于其他事务的一致和可靠的方式进行处理。事务通常表示数据库（[了解更多](https://en.wikipedia.org/wiki/Database_transaction)）中的任何更改。

有许多不同的策略来处理 [Sequelize transactions](https://sequelize.org/docs/v6/other-topics/transactions/)。下面是托管事务（自动回调）的示例实现。

首先，我们需要注入 `Sequelize` 以正常方式将对象转换为类：

```typescript
@Injectable()
export class UsersService {
  constructor(private sequelize: Sequelize) {}
}
```

> info **Hint** 这个 `Sequelize` 类是从 `sequelize-typescript` 包装。

现在，我们可以使用这个对象来创建一个事务。

```typescript
async createMany() {
  try {
    await this.sequelize.transaction(async t => {
      const transactionHost = { transaction: t };

      await this.userModel.create(
          { firstName: 'Abraham', lastName: 'Lincoln' },
          transactionHost,
      );
      await this.userModel.create(
          { firstName: 'John', lastName: 'Boothe' },
          transactionHost,
      );
    });
  } catch (err) {
    // Transaction has been rolled back
    // err is whatever rejected the promise chain returned to the transaction callback
  }
}
```

> info **Hint** 请注意 `Sequelize` 实例仅用于启动事务。但是，要测试这个类需要模拟整个类 `Sequelize` 对象（公开了几种方法）。因此，我们建议使用辅助工厂类（例如，`TransactionRunner`) 并定义一个具有维护事务所需的有限方法集的接口。这种技术使得嘲笑这些方法变得非常简单。

#### 迁移

[Migrations](https://sequelize.org/docs/v6/other-topics/migrations/) 提供一种增量更新数据库模式的方法，使其与应用程序的数据模型保持同步，同时保留数据库中的现有数据。为了生成、运行和恢复迁移，Sequelize 提供了一个专用的 [CLI](https://sequelize.org/docs/v6/other-topics/migrations/#installing-the-cli)。

迁移类与 Nest 应用程序源代码是分开的。它们的生命周期由 SequelizeCLI 维持。因此，您无法利用依赖注入和其他 Nest 特定功能进行迁移。要了解有关迁移的更多信息，请遵循 [Sequelize documentation](https://sequelize.org/docs/v6/other-topics/migrations/#installing-the-cli) 中的指南。

#### 多个数据库

有些项目需要多个数据库连接。这也可以用这个模块来实现。若要使用多个连接，请首先创建连接。在这种情况下，连接命名变成**强制**。

假设你有一个 `Album` 存储在自己数据库中的实体。

```typescript
const defaultOptions = {
  dialect: 'postgres',
  port: 5432,
  username: 'user',
  password: 'password',
  database: 'db',
  synchronize: true,
};

@Module({
  imports: [
    SequelizeModule.forRoot({
      ...defaultOptions,
      host: 'user_db_host',
      models: [User],
    }),
    SequelizeModule.forRoot({
      ...defaultOptions,
      name: 'albumsConnection',
      host: 'album_db_host',
      models: [Album],
    }),
  ],
})
export class AppModule {}
```

> warning **Notice** 如果未为连接设置 `name`，则其名称将设置为 `default`。请注意，您不应该有多个没有名称的连接，或者有相同名称的连接，否则它们将被覆盖。

在这一点上，你有 `User` 和 `Album` 用自己的连接注册的模型。使用此设置，您必须告诉您 `SequelizeModule.forFeature()` 方法和 `@InjectModel()` 应该使用哪个连接的装饰器。如果不传递任何连接名称，`default` 使用连接。

```typescript
@Module({
  imports: [
    SequelizeModule.forFeature([User]),
    SequelizeModule.forFeature([Album], 'albumsConnection'),
  ],
})
export class AppModule {}
```

您也可以注射 `Sequelize` 给定连接的实例：

```typescript
@Injectable()
export class AlbumsService {
  constructor(
    @InjectConnection('albumsConnection')
    private sequelize: Sequelize,
  ) {}
}
```

也可以注射任何 `Sequelize` 提供者的实例：

```typescript
@Module({
  providers: [
    {
      provide: AlbumsService,
      useFactory: (albumsSequelize: Sequelize) => {
        return new AlbumsService(albumsSequelize);
      },
      inject: [getConnectionToken('albumsConnection')],
    },
  ],
})
export class AlbumsModule {}
```

#### 检测

当涉及到对应用程序进行单元测试时，我们通常希望避免建立数据库连接，保持我们的测试套件的独立性，并且它们的执行过程尽可能快。但是我们的类可能依赖于从连接实例中提取的模型。我们如何处理？解决方案是创建模拟模型。为了实现这一点，我们设置了 [定制提供者](/fundamentals/custom-providers)。每个注册的模型都自动由 `<ModelName>Model` 令牌表示，其中 `ModelName` 是模型类的名称。

这个 `@nestjs/sequelize` 包暴露了 `getModelToken()` 函数，该函数根据给定的模型返回准备好的令牌。

```typescript
@Module({
  providers: [
    UsersService,
    {
      provide: getModelToken(User),
      useValue: mockModel,
    },
  ],
})
export class UsersModule {}
```

现在是替代品 `mockModel` 将用作 `UserModel`.每当任何班级要求 `UserModel` 使用 `@InjectModel()` 装修工， Nest 将使用注册的 `mockModel` 物体。

#### 异步配置

你可能想通过你的 `SequelizeModule` 选项异步而不是静态。在这种情况下，使用 `forRootAsync()` 方法，它提供了几种处理异步配置的方法。

一种方法是使用工厂函数：

```typescript
SequelizeModule.forRootAsync({
  useFactory: () => ({
    dialect: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'root',
    database: 'test',
    models: [],
  }),
});
```

我们的工厂和其他工厂一样 [异步提供程序](https://docs.nestjs.com/fundamentals/async-providers) （例如，它可以是 `async` 它能够通过 `inject`).

```typescript
SequelizeModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    dialect: 'mysql',
    host: configService.get('HOST'),
    port: +configService.get('PORT'),
    username: configService.get('USERNAME'),
    password: configService.get('PASSWORD'),
    database: configService.get('DATABASE'),
    models: [],
  }),
  inject: [ConfigService],
});
```

或者，您可以使用 `useClass` 语法：

```typescript
SequelizeModule.forRootAsync({
  useClass: SequelizeConfigService,
});
```

上面的构造将在 `SequelizeModule` 中实例化 `SequelizeConfigService`，并通过调用 `createSequelizeOptions()` 使用它来提供一个 options 对象。请注意，这意味着 `SequelizeConfigService` 必须实现 `SequelizeOptionsFactory` 接口，如下所示：

```typescript
@Injectable()
class SequelizeConfigService implements SequelizeOptionsFactory {
  createSequelizeOptions(): SequelizeModuleOptions {
    return {
      dialect: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      models: [],
    };
  }
}
```

为了防止产生 `SequelizeConfigService` 内部 `SequelizeModule` 并使用从不同模块导入的提供程序，可以使用 `useExisting` 句法。

```typescript
SequelizeModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});
```

这种构造的工作原理与 `useClass` 有一个关键的区别-`SequelizeModule` 将查找导入的模块以重用现有模块 `ConfigService` 而不是实例化一个新的。

#### 例子

有一个工作示例可用 [在这里](https://github.com/nestjs/nest/tree/master/sample/07-sequelize)。
