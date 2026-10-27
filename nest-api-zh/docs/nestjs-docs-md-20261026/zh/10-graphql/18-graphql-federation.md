# Federation

Source: https://docs.nestjs.com/graphql/federation

联邦可以让你拆分一个整体 GraphQL 服务器转换为独立的微服务。它由两个组件组成：网关和一个或多个联合微服务。每个微服务都持有模式的一部分，网关将模式合并到客户端使用的单个模式中。

如中所述 [Apollo's introduction to federation](https://blog.apollographql.com/apollo-federation-f260cf525d21) 联邦是围绕以下核心原则设计的：

- 构建一个图应该是**声明性的。**使用 federation，您可以在模式中声明性地组成一个图，而不是编写命令式的模式拼接代码。
- 代码应该用**关注**分隔，而不是按类型分隔。通常没有一个团队控制像用户或产品这样的重要类型的每个方面，因此这些类型的定义应该分布在团队和代码库之间，而不是集中的。
- 图表应该很容易让客户消费。联合服务可以一起形成一个完整的、以产品为中心的图表，准确地反映客户端如何使用它。
- 只是**GraphQL**，仅使用符合规范的语言特性。任何语言，不只是 JavaScript，可以实现联邦。

> warning **Warning** Federation 目前不支持订阅。

在下面的章节中，我们将设置一个演示应用程序，它由一个网关和两个联合端点组成：一个用户服务和一个 Posts 服务。

#### 与阿波罗结盟

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/subgraph
```

#### 模式优先

用户服务提供了一个简单的模式。`@key` 指令告诉 Apollo 查询规划器，可以通过其 `id` 获取 `User` 的特定实例。还要注意，模式扩展了 `Query` 类型。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

extend type Query {
  getUser(id: ID!): User
}
```

解析器提供了一个名为 `resolveReference()` 的附加方法。每当相关资源需要 `User` 实例时，Apollo gateway 都会调用此方法。稍后您将在帖子服务中看到一个例子。该方法必须使用 `@ResolveReference()` 装饰器进行注释。

```typescript
import { Args, Query, Resolver, ResolveReference } from '@nestjs/graphql';
import { UsersService } from './users.service.js';

@Resolver('User')
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query()
  getUser(@Args('id') id: string) {
    return this.usersService.findById(id);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }) {
    return this.usersService.findById(reference.id);
  }
}
```

最后，通过注册 `GraphQLModule` 与 `ApolloFederationDriver` 配置对象中的驱动程序：

```typescript
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersResolver } from './users.resolver.js';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      typePaths: ['**/*.graphql'],
    }),
  ],
  providers: [UsersResolver],
})
export class AppModule {}
```

#### 代码优先

首先向 `User` 实体：

```ts
import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;
}
```

解析器提供了一个名为 `resolveReference()` 的附加方法。每当相关资源需要 `User` 实例时，Apollo gateway 都会调用此方法。稍后您将在帖子服务中看到一个例子。该方法必须使用 `@ResolveReference()` 装饰器进行注释。

```ts
import { Args, Query, Resolver, ResolveReference } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query(() => User)
  getUser(@Args('id') id: number): User {
    return this.usersService.findById(id);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: number }): User {
    return this.usersService.findById(reference.id);
  }
}
```

最后，通过注册 `GraphQLModule` 与 `ApolloFederationDriver` 配置对象中的驱动程序：

```typescript
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: true,
    }),
  ],
  providers: [UsersResolver, UsersService],
})
export class AppModule {}
```

工作示例可用于 [代码优先](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/users-application) 和 [模式优先](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/users-application) 方法。

#### 联合示例：帖子

员额处通过 `getPosts` 查询，并扩展 `User` 键入 a`user.posts` 领域。

#### 模式优先

邮政处提到 `User` 在其架构中使用 `extend` 关键词。它还在 `User` 类型（`posts`).注意 `@key` 指令，用于匹配 `User` 实例，以及 `@external` 指令，表明 `id` 字段在其他地方管理。

```graphql
type Post @key(fields: "id") {
  id: ID!
  title: String!
  body: String!
  user: User
}

extend type User @key(fields: "id") {
  id: ID! @external
  posts: [Post]
}

extend type Query {
  getPosts: [Post]
}
```

在下面的示例中， `PostsResolver` 提供 `getUser()` 方法，该方法返回包含 `__typename` 加上应用程序解析引用所需的任何附加属性，在本例中 `id`.网关使用 `__typename` 确定负责以下操作的微服务 `User` 键入并检索相应的实例。为了解析引用，网关向上述用户服务发送请求，该用户服务执行其 `resolveReference()` 方法。

```typescript
import { Query, Resolver, Parent, ResolveField } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import type { Post } from './posts.interfaces.js';

@Resolver('Post')
export class PostsResolver {
  constructor(private postsService: PostsService) {}

  @Query('getPosts')
  getPosts() {
    return this.postsService.findAll();
  }

  @ResolveField('user')
  getUser(@Parent() post: Post) {
    return { __typename: 'User', id: post.userId };
  }
}
```

最后，注册 `GraphQLModule` 如在用户服务中。

```typescript
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { PostsResolver } from './posts.resolver.js';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      typePaths: ['**/*.graphql'],
    }),
  ],
  providers: [PostsResolver],
})
export class AppModule {}
```

#### 代码优先

首先，声明一个表示 `User` 实体。虽然实体本身存在于另一个服务中，但该服务使用它（并扩展其定义）。注意 `@extends` 和 `@external` 指令。

```ts
import { Directive, ObjectType, Field, ID } from '@nestjs/graphql';
import { Post } from './post.entity.js';

@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  @Directive('@external')
  id: number;

  @Field(() => [Post])
  posts?: Post[];
}
```

接下来，为扩展创建解析器 `User` 实体：

```ts
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly postsService: PostsService) {}

  @ResolveField(() => [Post])
  public posts(@Parent() user: User): Post[] {
    return this.postsService.forAuthor(user.id);
  }
}
```

然后定义 `Post` 实体类：

```ts
import { Directive, Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { User } from './user.entity.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class Post {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field(() => Int)
  authorId: number;

  @Field(() => User)
  user?: User;
}
```

及其解析器：

```ts
import { Query, Args, ResolveField, Resolver, Parent } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Query(() => Post)
  findPost(@Args('id') id: number): Post {
    return this.postsService.findOne(id);
  }

  @Query(() => [Post])
  getPosts(): Post[] {
    return this.postsService.all();
  }

  @ResolveField(() => User)
  user(@Parent() post: Post): any {
    return { __typename: 'User', id: post.authorId };
  }
}
```

最后，把所有东西绑在一个模块里。请注意架构构建选项，其中指定 `User` 是孤立（外部）类型。

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolver.js';
import { UsersResolver } from './users.resolver.js';
import { PostsService } from './posts.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: true,
      buildSchemaOptions: {
        orphanedTypes: [User],
      },
    }),
  ],
  providers: [PostsResolver, UsersResolver, PostsService],
})
export class AppModule {}
```

工作示例可用于 [代码优先](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/posts-application) 和 [模式优先](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/posts-application) 方法。

#### 联合示例：网关

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/gateway
```

网关需要一个端点列表，它会自动发现相应的模式。因此，代码优先和模式优先方法的网关实现是相同的。

```typescript
import { IntrospectAndCompose } from '@apollo/gateway';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      server: {
        // ... Apollo Server options
      },
      gateway: {
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: [
            { name: 'users', url: 'http://user-service/graphql' },
            { name: 'posts', url: 'http://post-service/graphql' },
          ],
        }),
      },
    }),
  ],
})
export class AppModule {}
```

工作示例可用于 [代码优先](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/gateway) 和 [模式优先](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/gateway) 方法。

#### 与水星的联邦

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/subgraph @nestjs/mercurius
```

> info **Note** 这个 `@apollo/subgraph` 包需要构建子图模式（`buildSubgraphSchema` 和 `printSubgraphSchema` 函数）。

#### 模式优先

用户服务提供了一个简单的模式。`@key` 指令告诉 Mercurius 查询规划器，可以通过其 `id` 获取 `User` 的特定实例。还要注意，模式扩展了 `Query` 类型。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

extend type Query {
  getUser(id: ID!): User
}
```

解析器提供了一个名为 `resolveReference()` 的附加方法。每当相关资源需要 `User` 实例时，Mercurius 网关都会调用此方法。稍后您将在帖子服务中看到一个例子。该方法必须使用 `@ResolveReference()` 装饰器进行注释。

```typescript
import { Args, Query, Resolver, ResolveReference } from '@nestjs/graphql';
import { UsersService } from './users.service.js';

@Resolver('User')
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query()
  getUser(@Args('id') id: string) {
    return this.usersService.findById(id);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }) {
    return this.usersService.findById(reference.id);
  }
}
```

最后，通过注册 `GraphQLModule` 与 `MercuriusFederationDriver` 配置对象中的驱动程序：

```typescript
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersResolver } from './users.resolver.js';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      typePaths: ['**/*.graphql'],
    }),
  ],
  providers: [UsersResolver],
})
export class AppModule {}
```

#### 代码优先

首先向 `User` 实体：

```ts
import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;
}
```

解析器提供了一个名为 `resolveReference()` 的附加方法。每当相关资源需要 `User` 实例时，Mercurius 网关都会调用此方法。稍后您将在帖子服务中看到一个例子。该方法必须使用 `@ResolveReference()` 装饰器进行注释。

```ts
import { Args, Query, Resolver, ResolveReference } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query(() => User)
  getUser(@Args('id') id: number): User {
    return this.usersService.findById(id);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: number }): User {
    return this.usersService.findById(reference.id);
  }
}
```

最后，通过注册 `GraphQLModule` 与 `MercuriusFederationDriver` 配置对象中的驱动程序：

```typescript
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      autoSchemaFile: true,
    }),
  ],
  providers: [UsersResolver, UsersService],
})
export class AppModule {}
```

#### 联合示例：帖子

员额处通过 `getPosts` 查询，并扩展 `User` 键入 a`user.posts` 领域。

#### 模式优先

邮政处提到 `User` 在其架构中使用 `extend` 关键词。它还在 `User` 类型（`posts`).注意 `@key` 指令，用于匹配 `User` 实例，以及 `@external` 指令，表明 `id` 字段在其他地方管理。

```graphql
type Post @key(fields: "id") {
  id: ID!
  title: String!
  body: String!
  user: User
}

extend type User @key(fields: "id") {
  id: ID! @external
  posts: [Post]
}

extend type Query {
  getPosts: [Post]
}
```

在下面的示例中， `PostsResolver` 提供 `getUser()` 方法，该方法返回包含 `__typename` 加上应用程序解析引用所需的任何附加属性，在本例中 `id`.网关使用 `__typename` 确定负责以下操作的微服务 `User` 键入并检索相应的实例。为了解析引用，网关向上述用户服务发送请求，该用户服务执行其 `resolveReference()` 方法。

```typescript
import { Query, Resolver, Parent, ResolveField } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import type { Post } from './posts.interfaces.js';

@Resolver('Post')
export class PostsResolver {
  constructor(private postsService: PostsService) {}

  @Query('getPosts')
  getPosts() {
    return this.postsService.findAll();
  }

  @ResolveField('user')
  getUser(@Parent() post: Post) {
    return { __typename: 'User', id: post.userId };
  }
}
```

最后，注册 `GraphQLModule` 如在用户服务中。

```typescript
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { PostsResolver } from './posts.resolver.js';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      typePaths: ['**/*.graphql'],
    }),
  ],
  providers: [PostsResolver],
})
export class AppModule {}
```

#### 代码优先

首先，声明一个表示 `User` 实体。虽然实体本身存在于另一个服务中，但该服务使用它（并扩展其定义）。注意 `@extends` 和 `@external` 指令。

```ts
import { Directive, ObjectType, Field, ID } from '@nestjs/graphql';
import { Post } from './post.entity.js';

@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  @Directive('@external')
  id: number;

  @Field(() => [Post])
  posts?: Post[];
}
```

接下来，为扩展创建解析器 `User` 实体：

```ts
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly postsService: PostsService) {}

  @ResolveField(() => [Post])
  public posts(@Parent() user: User): Post[] {
    return this.postsService.forAuthor(user.id);
  }
}
```

然后定义 `Post` 实体类：

```ts
import { Directive, Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { User } from './user.entity.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class Post {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field(() => Int)
  authorId: number;

  @Field(() => User)
  user?: User;
}
```

及其解析器：

```ts
import { Query, Args, ResolveField, Resolver, Parent } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Query(() => Post)
  findPost(@Args('id') id: number): Post {
    return this.postsService.findOne(id);
  }

  @Query(() => [Post])
  getPosts(): Post[] {
    return this.postsService.all();
  }

  @ResolveField(() => User)
  user(@Parent() post: Post): any {
    return { __typename: 'User', id: post.authorId };
  }
}
```

最后，把所有东西绑在一个模块里。请注意架构构建选项，其中指定 `User` 是孤立（外部）类型。

```ts
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolver.js';
import { UsersResolver } from './users.resolver.js';
import { PostsService } from './posts.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      autoSchemaFile: true,
      buildSchemaOptions: {
        orphanedTypes: [User],
      },
    }),
  ],
  providers: [PostsResolver, UsersResolver, PostsService],
})
export class AppModule {}
```

#### 联合示例：网关

首先安装所需的依赖项：

```bash
$ npm install --save @mercuriusjs/gateway
```

网关需要一个端点列表，它会自动发现相应的模式。因此，代码优先和模式优先方法的网关实现是相同的。

```typescript
import {
  MercuriusGatewayDriver,
  MercuriusGatewayDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusGatewayDriverConfig>({
      driver: MercuriusGatewayDriver,
      gateway: {
        services: [
          { name: 'users', url: 'http://user-service/graphql' },
          { name: 'posts', url: 'http://post-service/graphql' },
        ],
      },
    }),
  ],
})
export class AppModule {}
```

### 联邦 2

根据 [Apollo docs](https://www.apollographql.com/docs/federation/federation-2/new-in-federation-2)，Federation 2 改善了原始 Apollo Federation（本节称为 Federation 1）的开发者体验，并且向后兼容大多数原始超图。

> warning **Warning** 水星并不完全支持联邦 2。参见阿波罗的 [subgraph libraries that support Federation 2](https://www.apollographql.com/docs/federation/supported-subgraphs#javascript--typescript) 列表。

在下面的章节中，我们将把前面的示例升级到 Federation 2。

#### 联合示例：用户

在联邦 2 中，实体没有起始子图，因此您不再需要扩展 `Query`。有关更多详细信息，请参见阿波罗联邦 2 文档中的 [实体主题](https://www.apollographql.com/docs/federation/federation-2/new-in-federation-2#entities)。

#### 模式优先

移除 `extend` 模式中的关键字。要选择加入联邦 2，架构还必须导入它与 `@link` 指令：

```graphql
extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

type User @key(fields: "id") {
  id: ID!
  name: String!
}

type Query {
  getUser(id: ID!): User
}
```

#### 代码优先

若要使用联邦 2，请在 `autoSchemaFile` 选择。Nest 然后添加 `@link` 为您生成的模式的指令。

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: 2,
      },
    }),
  ],
  providers: [UsersResolver, UsersService],
})
export class AppModule {}
```

#### 联合示例：帖子

出于同样的原因，您不再需要扩展 `User` 和 `Query`。

#### 模式优先

移除 `extend` 关键字和 `@external` 模式中的指令，并添加 `@link` 指令：

```graphql
extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

type Post @key(fields: "id") {
  id: ID!
  title: String!
  body: String!
  user: User
}

type User @key(fields: "id") {
  id: ID!
  posts: [Post]
}

type Query {
  getPosts: [Post]
}
```

#### 代码优先

由于 `User` 实体不再扩展，请从 `User` 中删除 `@extends` 和 `@external` 指令：

```ts
import { Directive, ObjectType, Field, ID } from '@nestjs/graphql';
import { Post } from './post.entity.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  id: number;

  @Field(() => [Post])
  posts?: Post[];
}
```

与在用户服务中一样，配置 `GraphQLModule` 要使用联邦 2：

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolver.js';
import { UsersResolver } from './users.resolver.js';
import { PostsService } from './posts.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: 2,
      },
      buildSchemaOptions: {
        orphanedTypes: [User],
      },
    }),
  ],
  providers: [PostsResolver, UsersResolver, PostsService],
})
export class AppModule {}
```
