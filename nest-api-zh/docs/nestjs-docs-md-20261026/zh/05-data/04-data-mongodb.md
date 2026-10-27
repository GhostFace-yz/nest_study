# MongoDB

Source: https://docs.nestjs.com/data/mongodb

Nest 支持两种与 [MongoDB](https://www.mongodb.com/) 数据库。您可以使用 [TypeORM](https://github.com/typeorm/typeorm) 中描述的模块 [TypeORM chapter](/data/typeorm)，其具有用于 MongoDB，或使用 [Mongoose](https://mongoosejs.com)，最受欢迎 MongoDB 对象建模工具。本章描述后者，使用专用的 `@nestjs/mongoose` 包装。

首先安装所需的依赖项：

```bash
$ npm i @nestjs/mongoose mongoose
```

安装过程完成后，将 `MongooseModule` 导入到根 `AppModule` 中：

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost/nest')],
})
export class AppModule {}
```

`forRoot()` 方法从 Mongoose 包接受与 `mongoose.connect()` 相同的配置对象，如 [Mongoose connections guide](https://mongoosejs.com/docs/connections.html) 中所述。

#### 模型注入

有了猫鼬，一切都来源于一个 [Schema](https://mongoosejs.com/docs/guide.html)。每个模式映射到一个 MongoDB 集合，并定义该集合中文档的形状。模式用于定义 [Models](https://mongoosejs.com/docs/models.html)。模型负责从底层 MongoDB 数据库创建和读取文档。

您可以使用 NestJS 装饰师，或者手动用猫鼬本身。使用装饰器来创建模式大大减少了样板并提高了整体代码的可读性。

让我们定义 `CatSchema`：

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CatDocument = HydratedDocument<Cat>;

@Schema()
export class Cat {
  @Prop()
  name: string;

  @Prop()
  age: number;

  @Prop()
  breed: string;
}

export const CatSchema = SchemaFactory.createForClass(Cat);
```

> info **Hint** 还可以使用 `DefinitionsFactory` 类（来自 `@nestjs/mongoose` 包）。这允许您手动修改从您提供的元数据生成的模式定义，这对于可能很难用装饰器表示所有内容的边缘情况非常有用。

`@Schema()` 装饰器将类标记为模式定义。它将 `Cat` 类映射到同名的 MongoDB 集合，但末尾多了一个“s”，所以最终的集合名称是 `cats`。这个装饰器接受一个可选参数，一个架构选项对象。把它想象成您通常会作为 `mongoose.Schema` 类构造函数的第二个参数传递的对象（例如，`new mongoose.Schema(_, options)`）。要了解有关可用模式选项的更多信息，请参见 [Mongoose schema options](https://mongoosejs.com/docs/guide.html#options) 文档。

`@Prop()` 装饰器在文档中定义属性。例如，上面的模式定义定义了三个属性：`name`、`age` 和 `breed`。由于 TypeScript 元数据（和反射）功能，这些属性的 [模式类型](https://mongoosejs.com/docs/schematypes.html) 是自动推断的。但是，在无法隐式反映类型的更复杂场景中（例如，数组或嵌套对象结构），必须显式地指示类型，如下所示：

```typescript
@Prop([String])
tags: string[];
```

或者，`@Prop()` 装饰器接受 options 对象参数（阅读有关 [可用架构类型选项](https://mongoosejs.com/docs/schematypes.html#schematype-options) 的更多信息）。使用它，您可以指示是否需要某个属性，指定默认值，或者将其标记为不可变。例如：

```typescript
@Prop({ required: true })
name: string;
```

若要指定与另一个模型的关系（用于稍后填充），请使用 `@Prop()` 装修师也是。例如，如果 `Cat` 有一个 `Owner` 存储在另一个名为 `owners`，该属性应具有 `type` 和 `ref` 选项：

```typescript
import mongoose from 'mongoose';
import { Owner } from '../owners/schemas/owner.schema.js';

// inside the class definition
@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' })
owner: Owner;
```

如果有多个所有者，您的属性配置应如下所示：

```typescript
@Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' }] })
owners: Owner[];
```

如果您不打算总是填充对另一个集合的引用，请考虑使用 `mongoose.Types.ObjectId` 作为类型：

```typescript
@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' })
// This ensures the field is not confused with a populated reference
owner: mongoose.Types.ObjectId;
```

然后，当您以后需要选择性地填充它时，请使用指定正确类型的存储库函数：

```typescript
import { Owner } from './schemas/owner.schema.js';

// e.g. inside a service or repository
async findAllPopulated() {
  return this.catModel.find().populate<{ owner: Owner }>("owner");
}
```

> info **Hint** 如果没有要填充的外部文档，则类型可以是 `Owner | null`，取决于你的 [Mongoose configuration](https://mongoosejs.com/docs/populate.html#doc-not-found) 或者，它可能会抛出一个错误，在这种情况下，类型是 `Owner`.

最后，您还可以将**raw**模式定义传递给装饰器。例如，当属性表示未定义为类的嵌套对象时，这非常有用。为此，请使用 `raw()` 函数来自 `@nestjs/mongoose` 包装，如下：

```typescript
@Prop(raw({
  firstName: { type: String },
  lastName: { type: String }
}))
details: Record<string, any>;
```

或者，如果您喜欢**不使用装饰器**，您可以手动定义模式。例如：

```typescript
export const CatSchema = new mongoose.Schema({
  name: String,
  age: Number,
  breed: String,
});
```

这个 `cat.schema` 文件驻留在 `schemas` 文件夹中 `cats` 目录，其中 `CatsModule` 也被定义。虽然您可以将模式文件存储在任何您喜欢的位置，但我们建议您将它们存储在相关的**domain**对象附近，在适当的模块目录中。

让我们看看 `CatsModule`：

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';
import { Cat, CatSchema } from './schemas/cat.schema.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }])],
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}
```

这个 `MongooseModule` 提供 `forFeature()` 配置模块的方法，包括定义哪些模型应该在当前范围中注册。若要在另一个模块中使用模型，请添加 `MongooseModule` 到 `exports` 数组 `CatsModule` 和进口 `CatsModule` 在另一个模块中。

注册模式后，可以注入 `Cat` 模型到 `CatsService` 使用 `@InjectModel()` 装饰师：

```typescript
import { Model } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cat } from './schemas/cat.schema.js';
import { CreateCatDto } from './dto/create-cat.dto.js';

@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name) private catModel: Model<Cat>) {}

  async create(createCatDto: CreateCatDto): Promise<Cat> {
    const createdCat = new this.catModel(createCatDto);
    return createdCat.save();
  }

  async findAll(): Promise<Cat[]> {
    return this.catModel.find().exec();
  }
}
```

#### 联系

有时，您可能需要访问本机 [Mongoose Connection](https://mongoosejs.com/docs/api.html#Connection) 对象，例如，使 nativeAPI 打电话给它。注入猫鼬连接 `@InjectConnection()` 装饰器如下：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection() private connection: Connection) {}
}
```

#### 会议

若要使用 Mongoose 启动会话，请使用 `@InjectConnection()` 而不是打电话 `mongoose.startSession()` 直接地。这与 Nest 依赖注入系统，并确保在连接上启动会话 Nest 管理。

以下是如何启动会话的示例：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async startTransaction() {
    const session = await this.connection.startSession();
    session.startTransaction();
    // Your transaction logic here
  }
}
```

在这个例子中，`@InjectConnection()` 将猫鼬连接注入服务。然后你可以打电话 `connection.startSession()` 开始新会话并使用它来管理数据库事务，确保跨多个查询的原子操作。启动事务后，请记住根据您的逻辑提交或中止它，并在完成后结束会话。

#### 多个数据库

有些项目需要多个数据库连接，本模块也支持这一点。若要使用多个连接，请首先创建连接。在这种情况下，命名连接是**强制**。

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost/test', {
      connectionName: 'cats',
    }),
    MongooseModule.forRoot('mongodb://localhost/users', {
      connectionName: 'users',
    }),
  ],
})
export class AppModule {}
```

> warning **Notice** 不要创建没有名称或同名的多个连接，否则它们会相互覆盖。

使用此设置，您必须告诉您 `MongooseModule.forFeature()` 使用哪个连接的方法：

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }], 'cats'),
  ],
})
export class CatsModule {}
```

您也可以注射 `Connection` 给定连接的对象：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection('cats') private connection: Connection) {}
}
```

注射给定的 `Connection` 在自定义提供程序（例如，工厂提供程序）中，使用 `getConnectionToken()` 函数，将连接的名称作为参数传递：

```typescript
{
  provide: CatsService,
  useFactory: (catsConnection: Connection) => {
    return new CatsService(catsConnection);
  },
  inject: [getConnectionToken('cats')],
}
```

若要从命名连接注入模型，请将连接名称作为第二个参数传递给 `@InjectModel()` 装饰师：

```typescript
@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name, 'cats') private catModel: Model<Cat>) {}
}
```

#### 钩子（中间件）

中间件（也称为前挂钩和后挂钩）是在异步函数执行期间传递控制的函数。中间件是在模式级别指定的，对于编写插件很有用（参见 [Mongoose middleware documentation](https://mongoosejs.com/docs/middleware.html)).呼叫 `pre()` 或者 `post()` 编译后模型在 Mongoose 中不起作用。若要在**模型注册之前**注册挂钩，请使用 `forFeatureAsync()` 方法 `MongooseModule` 以及工厂提供者（即， `useFactory`).使用此技术，您可以访问架构对象，然后使用其 `pre()` 或者 `post()` 方法在该模式上注册钩子。例如：

```typescript
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Cat.name,
        useFactory: () => {
          const schema = CatSchema;
          schema.pre('save', function () {
            console.log('Hello from pre save');
          });
          return schema;
        },
      },
    ]),
  ],
})
export class AppModule {}
```

与其他 [工厂供应商](/fundamentals/custom-providers#factory-providers-usefactory) 一样，工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖项。

```typescript
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Cat.name,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const schema = CatSchema;
          schema.pre('save', function() {
            console.log(
              `${configService.get('APP_NAME')}: Hello from pre save`,
            );
          });
          return schema;
        },
        inject: [ConfigService],
      },
    ]),
  ],
})
export class AppModule {}
```

#### 插件

注册一个 [插件](https://mongoosejs.com/docs/plugins.html) 对于给定的模式，使用 `forFeatureAsync()` 方法：

```typescript
import autopopulate from 'mongoose-autopopulate';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Cat.name,
        useFactory: () => {
          const schema = CatSchema;
          schema.plugin(autopopulate);
          return schema;
        },
      },
    ]),
  ],
})
export class AppModule {}
```

要一次性为所有模式注册插件，请调用 `.plugin()` 方法 `Connection` 物体。您必须在创建模型之前访问连接；为此，请使用 `connectionFactory` 选项：

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import autopopulate from 'mongoose-autopopulate';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost/test', {
      connectionFactory: (connection) => {
        connection.plugin(autopopulate);
        return connection;
      }
    }),
  ],
})
export class AppModule {}
```

#### 鉴别器

[Discriminators](https://mongoosejs.com/docs/discriminators.html) 是一种模式继承机制。它们使您能够在同一基础之上拥有具有重叠模式的多个模型 MongoDB 收集。

假设您想在单个集合中跟踪不同类型的事件。每个事件都有一个时间戳。

```typescript
@Schema({ discriminatorKey: 'kind' })
export class Event {
  @Prop({
    type: String,
    required: true,
    enum: [ClickedLinkEvent.name, SignUpEvent.name],
  })
  kind: string;

  @Prop({ type: Date, required: true })
  time: Date;
}

export const EventSchema = SchemaFactory.createForClass(Event);
```

> info **Hint** Mongoose 通过“鉴别器键”来区分鉴别器模型，即 `__t` 默认。Mongoose 添加了一个名为 `__t` 到您的模式，并使用它来跟踪文档是哪个识别器的实例。
> 您也可以使用 `discriminatorKey` 定义歧视路径的选项。

`SignUpEvent` 和 `ClickedLinkEvent` 实例将与泛型事件存储在同一个集合中。

现在，让我们定义 `ClickedLinkEvent` 类，如下：

```typescript
@Schema()
export class ClickedLinkEvent {
  kind: string;
  time: Date;

  @Prop({ type: String, required: true })
  url: string;
}

export const ClickedLinkEventSchema = SchemaFactory.createForClass(ClickedLinkEvent);
```

和 `SignUpEvent` 班级：

```typescript
@Schema()
export class SignUpEvent {
  kind: string;
  time: Date;

  @Prop({ type: String, required: true })
  user: string;
}

export const SignUpEventSchema = SchemaFactory.createForClass(SignUpEvent);
```

完成此操作后，使用 `discriminators` 选项注册给定模式的鉴别器。它适用于 `MongooseModule.forFeature()` 和 `MongooseModule.forFeatureAsync()`：

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Event.name,
        schema: EventSchema,
        discriminators: [
          { name: ClickedLinkEvent.name, schema: ClickedLinkEventSchema },
          { name: SignUpEvent.name, schema: SignUpEventSchema },
        ],
      },
    ]),
  ]
})
export class EventsModule {}
```

#### 检测

当对应用程序进行单元测试时，您通常希望避免任何数据库连接，这使得测试套件的设置更简单，执行更快。但是，您的类可能依赖于从连接实例中提取的模型。要解决这些类，请创建模拟模型。

为了简化这一点，`@nestjs/mongoose` 包公开了一个 `getModelToken()` 函数，该函数根据模型名返回准备好的 [注入令牌](/fundamentals/custom-providers#di-fundamentals)。使用此令牌，您可以使用任何标准 [自定义提供者](/fundamentals/custom-providers) 技术提供模拟实现，包括 `useClass`、`useValue` 和 `useFactory`。例如：

```typescript
@Module({
  providers: [
    CatsService,
    {
      provide: getModelToken(Cat.name),
      useValue: catModel,
    },
  ],
})
export class CatsModule {}
```

在本例中，硬编码 `catModel`（对象实例）在任何使用者注入 `Model<Cat>` 使用 `@InjectModel()` 装修师。

#### 异步配置

当需要异步传递模块选项而不是静态传递时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供异步配置的几种技术。

一种技术是使用工厂函数：

```typescript
MongooseModule.forRootAsync({
  useFactory: () => ({
    uri: 'mongodb://localhost/nest',
  }),
});
```

与其他 [工厂供应商](/fundamentals/custom-providers#factory-providers-usefactory) 一样，工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖项。

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    uri: configService.get<string>('MONGODB_URI'),
  }),
  inject: [ConfigService],
});
```

或者，您可以配置 `MongooseModule` 使用类而不是工厂，如下所示：

```typescript
MongooseModule.forRootAsync({
  useClass: MongooseConfigService,
});
```

上面的构造实例化 `MongooseConfigService` 内部 `MongooseModule`，使用它创建所需的选项对象。在本例中，`MongooseConfigService` 必须实施 `MongooseOptionsFactory` 界面，如下所示。这个 `MongooseModule` 调用 `createMongooseOptions()` 方法对所提供类的实例化对象。

```typescript
@Injectable()
export class MongooseConfigService implements MongooseOptionsFactory {
  createMongooseOptions(): MongooseModuleOptions {
    return {
      uri: 'mongodb://localhost/nest',
    };
  }
}
```

重用现有选项提供程序，而不是在 `MongooseModule`，使用 `useExisting` 句法。提供程序必须实现 `MongooseOptionsFactory` 接口：

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});
```

#### 连接事件

你可以听猫鼬 [连接事件](https://mongoosejs.com/docs/connections.html#connection-events) 使用 `onConnectionCreate` 配置选项。Nest 在连接打开之前，一旦创建了每个连接就调用此函数，这样您就可以为 `connected`,`open`,`disconnected`,`reconnected`，和 `disconnecting` 事件如下所示：

```typescript
MongooseModule.forRoot('mongodb://localhost/test', {
  onConnectionCreate: (connection: Connection) => {
    connection.on('connected', () => console.log('connected'));
    connection.on('open', () => console.log('open'));
    connection.on('disconnected', () => console.log('disconnected'));
    connection.on('reconnected', () => console.log('reconnected'));
    connection.on('disconnecting', () => console.log('disconnecting'));

    return connection;
  },
}),
```

此代码片段在 `mongodb://localhost/test` 建立到 MongoDB 数据库的连接。`onConnectionCreate` 选项设置事件侦听器以监视连接的状态：

- `connected`：连接成功建立时触发。
- `open`：当连接完全打开并准备好操作时触发。
- `disconnected`：连接丢失时调用。
- `reconnected`：断开连接后重新建立连接时调用。
- `disconnecting`：在连接处于关闭过程中时发生。

还可以在使用 `MongooseModule.forRootAsync()` 创建的异步配置中使用 `onConnectionCreate` 属性：

```typescript
MongooseModule.forRootAsync({
  useFactory: () => ({
    uri: 'mongodb://localhost/test',
    onConnectionCreate: (connection: Connection) => {
      // Register event listeners here
      return connection;
    },
  }),
}),
```

#### 子文件

若要在父文档中嵌套子文档，请按如下方式定义架构：

```typescript
@Schema()
export class Name {
  @Prop()
  firstName: string;

  @Prop()
  lastName: string;
}

export const NameSchema = SchemaFactory.createForClass(Name);
```

然后引用父模式中的子文档：

```typescript
@Schema()
export class Person {
  @Prop(NameSchema)
  name: Name;
}

export const PersonSchema = SchemaFactory.createForClass(Person);

export type PersonDocumentOverride = {
  name: Types.Subdocument<Types.ObjectId> & Name;
};

export type PersonDocument = HydratedDocument<Person, PersonDocumentOverride>;
```

若要包含多个子文档，请使用子文档数组。确保相应地覆盖属性的类型：

```typescript
@Schema()
export class Person {
  @Prop([NameSchema])
  name: Name[];
}

export const PersonSchema = SchemaFactory.createForClass(Person);

export type PersonDocumentOverride = {
  name: Types.DocumentArray<Name>;
};

export type PersonDocument = HydratedDocument<Person, PersonDocumentOverride>;
```

#### 虚拟

在 Mongoose 中，**虚拟**是存在于文档上但不会持久化的属性 MongoDB 相反，每当访问它时，它都是动态计算的。虚拟通常用于派生或计算值，如组合字段（例如，创建 `fullName` 连接属性 `firstName` 和 `lastName`)，或用于创建依赖于文档中现有数据的属性。

```ts
class Person {
  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Virtual({
    get: function (this: Person) {
      return `${this.firstName} ${this.lastName}`;
    },
  })
  fullName: string;
}
```

> info **Hint** 这个 `@Virtual()` 装饰器是从 `@nestjs/mongoose` 包装。

在本例中， `fullName` 虚拟源自 `firstName` 和 `lastName`.尽管它在访问时表现得像一个普通属性，但它永远不会保存到 MongoDB 文档。

#### 例子

[nestjs/nest repository](https://github.com/nestjs/nest/tree/master/sample/06-mongoose) 中提供了一个工作示例。
