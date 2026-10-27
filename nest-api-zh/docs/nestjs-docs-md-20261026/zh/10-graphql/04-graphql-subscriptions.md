# Subscriptions

Source: https://docs.nestjs.com/graphql/subscriptions

除了通过查询获取数据和通过突变修改数据之外，GraphQL 规范还支持第三种操作类型，称为 `subscription`。GraphQL 订阅将数据从服务器推送到选择监听实时消息的客户端。与查询一样，订阅指定要传递给客户端的一组字段。然而，它们不是立即返回单个结果，而是打开一个通道，服务器在每次发生特定事件时都会向客户端发送一个结果。

订阅的一个常见用例是通知客户端特定事件，例如创建新对象或更新的字段（请参见 [Subscriptions](https://www.apollographql.com/docs/react/data/subscriptions) 在阿波罗文档中）。

#### 启用 Apollo driver 订阅

订阅通过 [graphql-ws](https://github.com/enisdenjo/graphql-ws) 包通过 WebSockets 传输。`@nestjs/graphql` 已经依赖于它，但是如果直接从它导入，也要在项目中安装它（例如，[Authentication over WebSockets](/graphql/subscriptions#authentication-over-websockets) 中使用的 `Context` 类型）：

```bash
$ npm i --save graphql-ws
```

然后启用传输：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
}),
```

> warning **Warning** 支持 `subscriptions-transport-ws` 被**移除**`@nestjs/graphql`v14。包不再是依赖项，并且 `'subscriptions-transport-ws'` 不再接受密钥 `subscriptions` 选项对象。如果正在升级，请将密钥替换为 `'graphql-ws'` 并将您的客户更新到更新的协议。这两个协议是有线不兼容的，因此客户端仍然使用 `subscriptions-transport-ws` 无法连接。这个 `onConnect` 回调签名也不同：`graphql-ws`，它接收连接上下文，额外的上下文值属于它 `extra` 字段（见 [Authentication over WebSockets](/graphql/subscriptions#authentication-over-websockets) 下面）。

#### 代码优先

若要使用代码优先方法创建订阅，请使用 `@Subscription()` 装饰器（从 `@nestjs/graphql` 包）和 `PubSub` 来自 `graphql-subscriptions` 包，它提供了一个简单的**发布/订阅 API**.

以下订阅处理程序通过调用来**订阅**事件 `PubSub#asyncIterableIterator`.此方法采用单个参数 `triggerName`，它对应于事件主题名称。

```typescript
const pubSub = new PubSub();

@Resolver(() => Author)
export class AuthorResolver {
  // ...
  @Subscription(() => Comment)
  commentAdded() {
    return pubSub.asyncIterableIterator('commentAdded');
  }
}
```

> info **Hint** 所有装饰器都从 `@nestjs/graphql` 包导出，而 `PubSub` 类是从 `graphql-subscriptions` 包（`npm i graphql-subscriptions`）导出。

> warning **Note** `PubSub` 是一个公开一个简单的 `publish` 和 `subscribe`API 的类。在 [graphql-订阅设置指南](https://www.apollographql.com/docs/graphql-subscriptions/setup.html) 中了解更多信息。阿波罗医生警告说 [默认实现](https://github.com/apollographql/graphql-subscriptions#getting-started-with-your-first-subscription) 不适合生产。生产应用程序应该使用由外部存储支持的 `PubSub` 实现（参见 [PubSub implementations](https://github.com/apollographql/graphql-subscriptions#pubsub-implementations) 列表）。

这将在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Subscription {
  commentAdded: Comment!
}
```

根据定义，订阅返回一个带有单个顶级属性的对象，其键是订阅的名称。该名称继承自订阅处理程序方法的名称（即，`commentAdded` 以上），或通过 `name` 第二个参数中的选项 `@Subscription()` 装饰器，如下图。

```typescript
@Subscription(() => Comment, {
  name: 'commentAdded',
})
subscribeToCommentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

这个构造产生相同的 SDL 如前面的代码示例，但将方法名与订阅名解耦。

#### 出版业

若要发布事件，请使用 `PubSub#publish` 方法。当对象图的一部分发生变化时，通常在突变中调用它来触发客户端更新。例如：

```typescript
@Mutation(() => Comment)
async addComment(
  @Args('postId', { type: () => Int }) postId: number,
  @Args('comment', { type: () => CommentInput }) comment: CommentInput,
) {
  const newComment = this.commentsService.addComment({ id: postId, comment });
  pubSub.publish('commentAdded', { commentAdded: newComment });
  return newComment;
}
```

这个 `PubSub#publish` 方法采用 `triggerName`（同样，将其视为事件主题名称）作为第一个参数，事件有效载荷作为第二个参数。如前所述，根据定义，订阅返回一个值，并且该值有一个形状。再看看生成的 SDL 为了 `commentAdded` 订阅：

```graphql
type Subscription {
  commentAdded: Comment!
}
```

这告诉我们，订阅必须返回一个具有名为 `commentAdded` 其值为 a`Comment` 物体。发射的事件有效载荷的形状 `PubSub#publish` 方法必须与订阅预期返回值的形状相匹配。在上面的例子中，`pubSub.publish('commentAdded', { commentAdded: newComment })` 语句发布 `commentAdded` 具有适当形状的有效载荷的事件。如果形状不匹配，则在事件解决时订阅失败。

#### 筛选订阅

若要筛选出特定事件，请设置 `filter` 过滤器函数的属性。这个函数的工作方式类似于传递给数组的回调 `filter()` 方法。它有两个论点：`payload`，包含事件有效载荷（由事件发布者发送），以及 `variables`，包含随订阅请求传入的任何参数。它返回一个布尔值，用于确定事件是否应发布给客户端侦听器。

```typescript
@Subscription(() => Comment, {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded(@Args('title') title: string) {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

#### 改变订阅有效载荷

若要转换已发布的事件有效载荷，请设置 `resolve` 函数的属性。该函数接收事件有效载荷（由事件发布者发送）并返回适当的值。

```typescript
@Subscription(() => Comment, {
  resolve: value => value,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

> warning **Note** 如果您使用 `resolve` 选项，返回未包装的有效载荷（在我们的示例中，返回 `newComment` 直接对象，而不是 `{ commentAdded: newComment }` 对象）。

要访问注入的提供程序（例如，使用外部服务验证数据），请使用以下结构。

```typescript
@Subscription(() => Comment, {
  resolve(this: AuthorResolver, value) {
    // "this" refers to an instance of "AuthorResolver"
    return value;
  }
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

相同的结构适用于过滤器：

```typescript
@Subscription(() => Comment, {
  filter(this: AuthorResolver, payload, variables) {
    // "this" refers to an instance of "AuthorResolver"
    return payload.commentAdded.title === variables.title;
  }
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

#### 模式优先

中创建等效订阅的步骤 Nest，使用 `@Subscription()` 装修师。

```typescript
const pubSub = new PubSub();

@Resolver('Author')
export class AuthorResolver {
  // ...
  @Subscription()
  commentAdded() {
    return pubSub.asyncIterableIterator('commentAdded');
  }
}
```

若要根据上下文和参数筛选出特定事件，请设置 `filter` 财产。

```typescript
@Subscription('commentAdded', {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

要转换已发布的有效载荷，请使用 `resolve` 功能。

```typescript
@Subscription('commentAdded', {
  resolve: value => value,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

要访问注入的提供程序（例如，使用外部服务验证数据），请使用以下结构：

```typescript
@Subscription('commentAdded', {
  resolve(this: AuthorResolver, value) {
    // "this" refers to an instance of "AuthorResolver"
    return value;
  }
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

相同的结构适用于过滤器：

```typescript
@Subscription('commentAdded', {
  filter(this: AuthorResolver, payload, variables) {
    // "this" refers to an instance of "AuthorResolver"
    return payload.commentAdded.title === variables.title;
  }
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}
```

最后一步是更新类型定义文件。

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post]
}

type Post {
  id: Int!
  title: String
  votes: Int
}

type Query {
  author(id: Int!): Author
}

type Comment {
  id: String
  content: String
}

type Subscription {
  commentAdded(title: String!): Comment
}
```

有了这个，我们就创建了一个 `commentAdded(title: String!): Comment` 订阅。完整的 [模式第一样本](https://github.com/nestjs/nest/blob/master/sample/12-graphql-schema-first) 可在 NestJS 仓库。

#### 酒吧

上面的示例实例化了一个本地 `PubSub` 实例。首选方法是定义 `PubSub` 作为一个 [供应商](/fundamentals/custom-providers) 并通过构造函数注入它（使用 `@Inject()`decorator），以便在整个应用程序中重用相同的实例。例如，如下定义提供程序，然后注入 `'PUB_SUB'` 需要的地方。

```typescript
{
  provide: 'PUB_SUB',
  useValue: new PubSub(),
}
```

#### 自定义订阅服务器

自定义订阅服务器（例如，更改其路径，默认为 GraphQL 端点路径），将选项对象传递给 `graphql-ws` 在 `subscriptions` 属性：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': {
      path: '/graphql',
    },
  },
});
```

#### 通过 WebSockets 进行身份验证

若要检查用户是否经过身份验证，请使用 `onConnect` 回调函数，可以在 `subscriptions` 选项。

使用 `graphql-ws`，`onConnect` 回调接收连接上下文，包括 `connectionParams`。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': {
      onConnect: (context: Context<any>) => {
        const { connectionParams, extra } = context;
        const authToken = connectionParams.authToken;
        if (!isValid(authToken)) {
          throw new Error('Token is not valid');
        }
        // when using graphql-ws, additional context values should be stored in the extra field
        extra.user = { user: {} };
      },
    },
  },
  context: ({ extra }) => {
    // you can now access your additional context value through the extra field
  },
});
```

#### 使用 Mercurius driver 启用订阅

若要启用订阅，请将 `subscription` 属性设置为 `true`。

```typescript
GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  subscription: true,
}),
```

> info **Hint** 您还可以传递选项对象来设置自定义发射器、验证传入连接等。请参见 [Mercurius plugin options](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options) 中的 `subscription` 选项。

#### 代码优先

若要使用代码优先方法创建订阅，请使用 `@Subscription()` 装饰器（从 `@nestjs/graphql` 包）和 `PubSub` 来自 `mercurius` 包，它提供了一个简单的**发布/订阅 API**.

以下订阅处理程序通过调用来**订阅**事件 `PubSub#subscribe`.此方法将主题名称作为其参数。

```typescript
@Resolver(() => Author)
export class AuthorResolver {
  // ...
  @Subscription(() => Comment)
  commentAdded(@Context('pubsub') pubSub: PubSub) {
    return pubSub.subscribe('commentAdded');
  }
}
```

> info **Hint** 上面示例中使用的所有装饰器都是从 `@nestjs/graphql` 包，而 `PubSub` 类是从 `mercurius` 包装。

> warning **Note** `PubSub` 是一个公开一个简单的 `publish` 和 `subscribe`API 的类。要注册自定义 `PubSub` 类，请参见 Mercurius 文档中的 [Subscriptions with custom PubSub](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md#subscriptions-with-custom-pubsub)。

这将在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Subscription {
  commentAdded: Comment!
}
```

根据定义，订阅返回一个带有单个顶级属性的对象，其键是订阅的名称。该名称继承自订阅处理程序方法的名称（即，`commentAdded` 以上），或通过 `name` 第二个参数中的选项 `@Subscription()` 装饰器，如下图。

```typescript
@Subscription(() => Comment, {
  name: 'commentAdded',
})
subscribeToCommentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}
```

这个构造产生相同的 SDL 如前面的代码示例，但将方法名与订阅名解耦。

#### 出版业

若要发布事件，请使用 `PubSub#publish` 方法。当对象图的一部分发生变化时，通常在突变中调用它来触发客户端更新。例如：

```typescript
@Mutation(() => Comment)
async addComment(
  @Args('postId', { type: () => Int }) postId: number,
  @Args('comment', { type: () => CommentInput }) comment: CommentInput,
  @Context('pubsub') pubSub: PubSub,
) {
  const newComment = this.commentsService.addComment({ id: postId, comment });
  await pubSub.publish({
    topic: 'commentAdded',
    payload: {
      commentAdded: newComment
    }
  });
  return newComment;
}
```

如前所述，根据定义，订阅返回一个值，并且该值有一个形状。再看看生成的 SDL 为了 `commentAdded` 订阅：

```graphql
type Subscription {
  commentAdded: Comment!
}
```

这告诉我们，订阅必须返回一个具有名为 `commentAdded` 其值为 a`Comment` 物体。发射的事件有效载荷的形状 `PubSub#publish` 方法必须与订阅预期返回值的形状相匹配。在上面的例子中，`pubSub.publish({ topic: 'commentAdded', payload: { commentAdded: newComment } })` 语句发布 `commentAdded` 具有适当形状的有效载荷的事件。如果形状不匹配，则在事件解决时订阅失败。

#### 筛选订阅

若要筛选出特定事件，请设置 `filter` 过滤器函数的属性。这个函数的工作方式类似于传递给数组的回调 `filter()` 方法。它有两个论点：`payload`，包含事件有效载荷（由事件发布者发送），以及 `variables`，包含随订阅请求传入的任何参数。它返回一个布尔值，用于确定事件是否应发布给客户端侦听器。

```typescript
@Subscription(() => Comment, {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded(@Args('title') title: string, @Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}
```

要访问注入的提供程序（例如，使用外部服务验证数据），请使用以下结构。

```typescript
@Subscription(() => Comment, {
  filter(this: AuthorResolver, payload, variables) {
    // "this" refers to an instance of "AuthorResolver"
    return payload.commentAdded.title === variables.title;
  }
})
commentAdded(@Args('title') title: string, @Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}
```

#### 模式优先

中创建等效订阅的步骤 Nest，使用 `@Subscription()` 装修师。

```typescript
@Resolver('Author')
export class AuthorResolver {
  // ...
  @Subscription()
  commentAdded(@Context('pubsub') pubSub: PubSub) {
    return pubSub.subscribe('commentAdded');
  }
}
```

若要根据上下文和参数筛选出特定事件，请设置 `filter` 财产。

```typescript
@Subscription('commentAdded', {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}
```

要访问注入的提供程序（例如，使用外部服务验证数据），请使用以下结构：

```typescript
@Subscription('commentAdded', {
  filter(this: AuthorResolver, payload, variables) {
    // "this" refers to an instance of "AuthorResolver"
    return payload.commentAdded.title === variables.title;
  }
})
commentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}
```

最后一步是更新类型定义文件。

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post]
}

type Post {
  id: Int!
  title: String
  votes: Int
}

type Query {
  author(id: Int!): Author
}

type Comment {
  id: String
  content: String
}

type Subscription {
  commentAdded(title: String!): Comment
}
```

有了这个，我们就创建了一个 `commentAdded(title: String!): Comment` 订阅。

#### 酒吧

上面的示例使用默认的 `PubSub` 发射器（[发射器](https://github.com/mcollina/mqemitter)）。对于生产，首选方法是使用 `mqemitter-redis`。或者，您可以提供自定义 `PubSub` 实现（参见 Mercurius 文档中的 [Subscriptions](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md)）。

```typescript
import mqemitterRedis from 'mqemitter-redis';

GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  subscription: {
    emitter: mqemitterRedis({
      port: 6579,
      host: '127.0.0.1',
    }),
  },
});
```

#### 通过 WebSockets 进行身份验证

若要检查用户是否经过身份验证，请使用 `verifyClient` 回调函数，可以在 `subscription` 选项。

这个 `verifyClient` 回调接收 `info` 对象作为其第一个参数，您可以使用它来读取请求的头。

```typescript
GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  subscription: {
    verifyClient: (info, next) => {
      const authorization = info.req.headers?.authorization as string;
      if (!authorization?.startsWith('Bearer ')) {
        return next(false);
      }
      next(true);
    },
  }
}),
```
