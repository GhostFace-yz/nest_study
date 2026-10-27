# Quick start

Source: https://docs.nestjs.com/graphql/quick-start

## 利用 TypeScript&GraphQL

[GraphQL](https://graphql.org/) 是 API 的查询语言，也是使用现有数据完成这些查询的运行时。它解决了许多通常遇到的问题 REST 蜜蜂。有关背景信息，请参阅 [comparison of GraphQL and REST](https://www.apollographql.com/blog/graphql-vs-rest).结合 [TypeScript](https://www.typescriptlang.org/), GraphQL 为您的查询和端到端键入提供更好的键入安全性。

本章假设对 GraphQL 并专注于使用内置的 `@nestjs/graphql` 模块。这个 `GraphQLModule` 可以配置为使用 [Apollo](https://www.apollographql.com/) 服务器（使用 `@nestjs/apollo` 驱动程序）或 [Mercurius](https://github.com/mercurius-js/mercurius)（与 `@nestjs/mercurius` 驱动程序）。Nest 为这两个包提供官方集成（另请参阅 [第三方集成](/graphql/quick-start#third-party-integrations) 下面）。

您也可以构建自己的驱动程序（参见 [Creating a custom driver](/graphql/other-features#creating-a-custom-driver)）。

#### 安装

首先安装所需的软件包：

```bash
# For Express and Apollo (default)
$ npm i @nestjs/graphql @nestjs/apollo @apollo/server @as-integrations/express5 graphql

# For Fastify and Apollo
# npm i @nestjs/graphql @nestjs/apollo @apollo/server @as-integrations/fastify graphql

# For Fastify and Mercurius
# npm i @nestjs/graphql @nestjs/mercurius graphql mercurius
```

> warning **Warning** `@nestjs/apollo`v14 需要**Apollo Server v5**（`@apollo/server` 软件包）。如果您是从旧版本的 Apollo 服务器升级，请参阅 [Apollo Server migration guide](https://www.apollographql.com/docs/apollo-server/migration/)。

#### 概述

Nest 提供两种构建方式 GraphQL 应用：**代码优先**和**模式优先**。选择最适合你的。本书的大部分章节 GraphQL 本节分为两部分：一部分用于**代码优先**方法，另一部分用于**模式优先**方法。

在**代码优先**方法中，您使用装饰器和 TypeScript 类生成相应的 GraphQL 模式。如果您喜欢专门在 TypeScript 并避免在语言语法之间切换。

在**模式优先**方法中，真理的来源是一组 GraphQLSDL（模式定义语言）文件。SDL 是一种在平台之间共享模式文件的与语言无关的方式。Nest 生成您的 TypeScript 定义（如类或接口）GraphQL 模式，因此您不必编写冗余的样板代码。

<app-banner-courses-graphql-cf></app-banner-courses-graphql-cf>

#### 入门 GraphQL&TypeScript

> info **Hint** 以下章节使用 `@nestjs/apollo` 包。要使用 Mercurius，请参见 [Mercurius integration](/graphql/quick-start#mercurius-integration)。

安装软件包后，导入 `GraphQLModule` 并使用 `forRoot()` 静态方法。

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
    }),
  ],
})
export class AppModule {}
```

> info **Hint** 对于 Mercurius 集成，请使用 `MercuriusDriver` 和 `MercuriusDriverConfig` 反而。两者都从 `@nestjs/mercurius` 包装。

`forRoot()` 方法接受一个 options 对象，该对象被传递给底层驱动程序实例（参见 [Apollo](https://www.apollographql.com/docs/apollo-server/api/apollo-server) 和 [Mercurius](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options) 的可用设置）。例如，要禁用 GraphQL IDE，请传递以下选项：

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      graphiql: false,
    }),
  ],
})
export class AppModule {}
```

> warning **Warning** 这个 `graphql-playground`IDE 被移除 `@nestjs/graphql`v14。这个 `playground` 选项仅保留为**GraphiQL 已弃用的布尔别名**：`playground: false` 禁用登录页面和 `playground: true` 启用 GraphiQL。使用 `graphiql` 在新代码中。

使用 Apollo 驱动程序，这些选项将被转发给 `ApolloServer` 构造函数。

#### 访问请求和响应对象

这个 `context` 选项是一个工厂 GraphQL 每个请求的执行上下文。使用它向解析器公开底层的请求和响应对象：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  context: ({ req, res }) => ({ req, res }),
}),
```

然后，您可以使用 `@Context()` 装饰师：

```typescript
@Query(() => String)
userAgent(@Context('req') req: Request): string {
  return req.headers['user-agent'] ?? '';
}
```

> info **Hint** 守卫、拦截器和其他在 GraphQL 上下文可以通过 `GqlExecutionContext.create(context).getContext()` （见 [Other features](/graphql/other-features)).

#### GraphQLIDE

[GraphiQL](https://github.com/graphql/graphiql) 是默认的图形、交互式、浏览器内 GraphQL IDE.它是在同一个 URL 作为 GraphQL 服务器本身，因此您需要一个基本的 GraphQL 服务器配置并运行以访问它。要立即尝试，请安装并构建 [代码第一个示例应用程序](https://github.com/nestjs/nest/tree/master/sample/23-graphql-code-first).如果您按照这些代码示例进行操作，那么一旦您完成了中的步骤，GraphiQL 就可以使用了 [Resolvers chapter](/graphql/resolvers).

在应用程序运行时，打开浏览器并导航到 `http://localhost:3000/graphql`（主机和端口可能因您的配置而异）。您将看到 GraphiQL，如下所示。

<figure>
  <img src="https://docs.nestjs.com/assets/playground.png" alt="" />
</figure>

> info **Note** 这个 `@nestjs/mercurius` 集成用途 [GraphiQL](https://github.com/graphql/graphiql) 也是。

##### 启用和禁用 GraphiQL

截至 `@nestjs/graphql`v14，GraphiQL 是唯一内置的 GraphQLIDE；旧的 `graphql-playground` 已被删除。使用 Apollo 驱动程序，只要 `NODE_ENV` 不是 `production`，GraphiQL 就会自动启用。在开发中，它无需任何配置即可工作；在生产中，登录页面默认是禁用的。

若要显式控制它，请使用 `graphiql` 选项：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  graphiql: true, // force it on, including in production
}),
```

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  graphiql: false, // disable the landing page entirely
}),
```

> warning **Warning** `playground` 选项仍然存在，但仅作为 `graphiql` 的**已弃用的布尔别名**。如果两者都设置了，则 `graphiql` 优先。将 `playground: false` 迁移到 `graphiql: false`，将 `playground: true` 迁移到 `graphiql: true`。

##### 配置 GraphiQL

要启用 GraphiQL 并同时配置它，请传递一个对象而不是布尔值：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  graphiql: {
    url: '/graphql',
    headers: {
      authorization: 'Bearer <token>',
    },
    shouldPersistHeaders: true,
    isHeadersEditorEnabled: true,
    inputValueDeprecation: false,
  },
}),
```

可用选项有：

<table>
  <tr>
    <td><code>url</code></td>
    <td>Endpoint the IDE sends operations to. Defaults to the driver's <code>path</code> option, so set it only when the IDE should target a different URL than the one it is served from.</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>Headers applied to every request, e.g., a preconfigured <code>authorization</code> header during development. If the headers editor is enabled and the user sets the same header, the user's value takes precedence.</td>
  </tr>
  <tr>
    <td><code>shouldPersistHeaders</code></td>
    <td>Whether the contents of the headers editor are persisted in browser storage. Default: <code>true</code>.</td>
  </tr>
  <tr>
    <td><code>isHeadersEditorEnabled</code></td>
    <td>Whether the headers editor is shown inside the editor tools. Set to <code>false</code> to prevent users from editing headers. Default: <code>true</code>.</td>
  </tr>
  <tr>
    <td><code>inputValueDeprecation</code></td>
    <td>If <code>true</code>, schema documentation includes deprecated input fields and argument values, and introspection returns them. Default: <code>false</code>.</td>
  </tr>
</table>

> info **Hint** 因为 GraphiQL 在生产之外默认启用，所以常见的设置是保留默认值并设置 `graphiql: false` 仅适用于可公开访问的非生产环境，其中 IDE 不应该暴露。

##### 订阅 IDE

如果您的应用程序使用 [订阅](/graphql/subscriptions)，请使用 `graphql-ws`。对 `subscriptions-transport-ws` 的支持已被**移除**：它不再被接受为 `subscriptions` 键，并且包不再是依赖项。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
}),
```

然后，GraphiQL 可以直接对您的服务器执行订阅操作。

#### 代码优先

在**代码优先**方法中，您使用装饰器和 TypeScript 类生成相应的 GraphQL 模式。

要使用代码优先的方法，首先添加 `autoSchemaFile` 选项对象的属性：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
}),
```

`autoSchemaFile` 属性值是自动生成的模式的写入路径。或者，模式可以在存储器中动态生成。为此，请将 `autoSchemaFile` 属性设置为 `true`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
}),
```

默认情况下，生成的模式中的类型按照它们在包含的模块中定义的顺序出现。若要按字典排序模式，请将 `sortSchema` 属性设置为 `true`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
  sortSchema: true,
}),
```

#### 例子

完全工作的 [代码第一样本](https://github.com/nestjs/nest/tree/master/sample/23-graphql-code-first) 可在 NestJS 仓库。

#### 模式优先

要使用模式优先方法，首先添加 `typePaths`options 对象的属性。这个 `typePaths` 物业告诉 `GraphQLModule` 在哪里寻找 GraphQLSDL 您将编写的模式定义文件。这些文件在内存中合并，因此您可以将模式拆分成几个文件，并将它们保存在解析器旁边。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
}),
```

您通常还需要 TypeScript 对应于 GraphQL SDL 类型。手写它们是多余和乏味的，它给你留下了一个单一的真理来源：每一次改变 SDL 强制您更新 TypeScript 定义也是如此。为了解决这个问题， `@nestjs/graphql` 包可以**自动生成** TypeScript 抽象语法树中的定义（[AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree)).要启用此功能，请添加 `definitions` 配置时的属性 `GraphQLModule`.

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  definitions: {
    path: join(process.cwd(), 'src/graphql.ts'),
  },
}),
```

`definitions` 对象的 `path` 属性指定在何处保存生成的 TypeScript 输出。默认情况下，所有生成的 TypeScript 类型都是接口。要生成类，请将 `outputAs` 属性设置为 `'class'`。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  definitions: {
    path: join(process.cwd(), 'src/graphql.ts'),
    outputAs: 'class',
  },
}),
```

这种方法生成 TypeScript 每次应用程序启动时的定义。或者，您可以编写一个按需生成它们的脚本。例如，创建以下内容 `generate-typings.ts` 脚本：

```typescript
import { GraphQLDefinitionsFactory } from '@nestjs/graphql';
import { join } from 'node:path';

const definitionsFactory = new GraphQLDefinitionsFactory();
definitionsFactory.generate({
  typePaths: ['./src/**/*.graphql'],
  path: join(process.cwd(), 'src/graphql.ts'),
  outputAs: 'class',
});
```

现在您可以按需运行此脚本：

```bash
$ ts-node generate-typings
```

> info **Hint** 可以预先编译脚本（例如，使用 `tsc`）和使用 `node` 去执行它。

为脚本启用监视模式（每当 `.graphql` 文件更改），传递 `watch` 选项 `generate()` 方法。

```typescript
definitionsFactory.generate({
  typePaths: ['./src/**/*.graphql'],
  path: join(process.cwd(), 'src/graphql.ts'),
  outputAs: 'class',
  watch: true,
});
```

生成额外的 `__typename` 每个对象类型的字段，启用 `emitTypenameField` 选项：

```typescript
definitionsFactory.generate({
  // ...
  emitTypenameField: true,
});
```

若要将解析器（查询、突变、订阅）生成为不带参数的普通字段，请启用 `skipResolverArgs` 选项：

```typescript
definitionsFactory.generate({
  // ...
  skipResolverArgs: true,
});
```

要将枚举生成为 TypeScript 并类型，而不是常规的 TypeScript 枚举，请将 `enumsAsTypes` 选项设置为 `true`：

```typescript
definitionsFactory.generate({
  // ...
  enumsAsTypes: true,
});
```

#### 阿波罗沙盒

使用 [Apollo Sandbox](https://www.apollographql.com/blog/announcement/platform/apollo-sandbox-an-open-graphql-ide-for-local-development/) 而不是 GraphiQL 作为 GraphQLIDE 对于本地开发，请使用以下配置：

```typescript
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      graphiql: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
    }),
  ],
})
export class AppModule {}
```

#### 例子

完全工作的 [模式第一样本](https://github.com/nestjs/nest/tree/master/sample/12-graphql-schema-first) 可在 NestJS 仓库。

#### 访问生成的模式

在某些情况下，您可能希望引用生成的模式对象。例如，在端到端测试中，可以使用 `graphql` 直接包装，无需任何 HTTP 听众。

可以使用 `GraphQLSchemaHost` 班级：

```typescript
const { schema } = app.get(GraphQLSchemaHost);
```

> info **Hint** 你必须打电话 `GraphQLSchemaHost#schema` 应用程序初始化后（在 `onModuleInit` 钩子已由以下任一触发 `app.listen()` 或者 `app.init()` 方法）。

#### 异步配置

当需要异步传递模块选项而不是静态传递时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供异步配置的几种技术。

一种技术是使用工厂函数：

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: () => ({
    typePaths: ['./**/*.graphql'],
  }),
}),
```

与其他 [工厂供应商](/fundamentals/custom-providers#factory-providers-usefactory) 一样，工厂函数可以是异步的，并且可以通过 `inject` 注入依赖项。

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    typePaths: configService.get<string[]>('GRAPHQL_TYPE_PATHS'),
  }),
  inject: [ConfigService],
}),
```

或者，您可以配置 `GraphQLModule` 使用类而不是工厂，如下所示：

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useClass: GqlConfigService,
}),
```

上面的构造实例化 `GqlConfigService` 内部 `GraphQLModule` 并使用它创建 options 对象。`GqlConfigService` 必须实施 `GqlOptionsFactory` 界面，如下所示。这个 `GraphQLModule` 调用 `createGqlOptions()` 方法对所提供类的实例化对象。

```typescript
@Injectable()
class GqlConfigService implements GqlOptionsFactory {
  createGqlOptions(): ApolloDriverConfig {
    return {
      typePaths: ['./**/*.graphql'],
    };
  }
}
```

重用现有选项提供程序，而不是在 `GraphQLModule`，使用 `useExisting` 句法。

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [ConfigModule],
  useExisting: ConfigService,
}),
```

#### Mercurius 集成

而不是阿波罗，[Fastify](/http/performance) 用户可以使用 `@nestjs/mercurius` 司机。

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, MercuriusDriverConfig } from '@nestjs/mercurius';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      graphiql: true,
    }),
  ],
})
export class AppModule {}
```

> info **Hint** 应用程序运行后，打开浏览器并导航到 `http://localhost:3000/graphiql` 以查看 [GraphiQL IDE](https://github.com/graphql/graphiql)。

这个 `forRoot()` 方法获取一个 options 对象，该对象被传递给底层驱动程序实例。参见 [Mercurius plugin options](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options) 对于可用的设置。

#### 多个端点

这个 `@nestjs/graphql` 模块还可以同时服务于多个端点，您可以决定哪些模块包含在哪个端点中。默认情况下，`GraphQLModule` 在整个应用程序中搜索解析器。若要将此扫描限制在模块的子集，请使用 `include` 财产。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  include: [CatsModule],
}),
```

在**代码优先**方法中，`include` 选项仅确定扫描哪些模块以寻找解析器。装饰类型 `@ObjectType()`,`@InputType()`,`@InterfaceType()`,`@ArgsType()`，或通过 `registerEnumType()`/`createUnionType()` 仍然在每个生成的模式中结束。若要将类型扩展到特定模块，请使用 `registerIn` 选项：

```typescript
@ObjectType({ registerIn: () => CatsModule })
export class Cat {
  @Field()
  name: string;
}
```

当构建模式时 `include: [CatsModule]`，仅分配给 `CatsModule` 成为它的一部分，分配给其他模块的类型被省略。类型不带 `registerIn` 保留默认行为，并在引用它们的每个模式中可用。

`registerIn` 选项可在 `@InputType()`、`@InterfaceType()` 和 `@ArgsType()` 以及 `registerEnumType()` 和 `createUnionType()` 上使用：

```typescript
@InputType({ registerIn: () => CatsModule })
export class CreateCatInput {
  @Field()
  name: string;
}

registerEnumType(CatBreed, {
  name: 'CatBreed',
  registerIn: () => CatsModule,
});

export const CatsUnion = createUnionType({
  name: 'CatsUnion',
  types: () => [Lion, Tiger] as const,
  registerIn: () => CatsModule,
});
```

> info **Hint** 您可以传递模块类本身，也可以传递返回它的工厂函数。首选工厂形式（`() => CatsModule`) 每当类型和模块相互引用时：它推迟了模块解析，并避免了循环导入引起的错误。

> warning **Warning** 如果您使用 `@apollo/server` 与 `@as-integrations/fastify` 打包并提供多种服务 GraphQL 单个应用程序中的端点，启用 `disableHealthCheck` 设置在 `GraphQLModule` 配置。

#### 第三方集成

- [GraphQL Yoga](https://github.com/dotansimha/graphql-yoga)

#### 例子

工作 [Mercurius sample](https://github.com/nestjs/nest/tree/master/sample/33-graphql-mercurius) 可在 NestJS 仓库。
