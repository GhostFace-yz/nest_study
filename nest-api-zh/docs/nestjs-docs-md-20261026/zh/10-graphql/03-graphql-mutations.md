# Mutations

Source: https://docs.nestjs.com/graphql/mutations

大多数讨论 GraphQL 专注于数据获取，但任何完整的数据平台也需要一种修改服务器端数据的方法。在 REST，任何请求都可能对服务器造成副作用，但最佳做法是不要修改中的数据 `GET` 请求。GraphQL 是相似的：从技术上讲，任何查询都可以实现来写入数据。然而，与 REST 约定是将任何导致写的操作显式作为突变发送（参见 [Mutations](https://graphql.org/learn/queries/#mutations) 在 GraphQL 文档）。

官方 [Apollo documentation](https://www.apollographql.com/docs/graphql-tools/generate-schema.html) 使用 `upvotePost()` 突变示例，增加帖子的 `votes` 财产。在中创建等效突变 Nest，使用 `@Mutation()` 装修师。

#### 代码优先

将另一个方法添加到 `AuthorsResolver` 从 [Resolvers](/graphql/resolvers) 篇章。

```typescript
@Mutation(() => Post)
async upvotePost(@Args({ name: 'postId', type: () => Int }) postId: number) {
  return this.postsService.upvoteById({ id: postId });
}
```

> info **Hint** 所有装饰者（例如，`@Resolver`,`@ResolveField`,`@Args` 等）是从 `@nestjs/graphql` 包装。

这将在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Mutation {
  upvotePost(postId: Int!): Post!
}
```

这个 `upvotePost()` 方法需要 `postId`(`Int`）作为参数并返回更新的 `Post` 实体。由于中解释的原因 [Resolvers](/graphql/resolvers) 章节，您必须显式设置期望的类型。

如果突变需要将对象作为参数，请创建一个**输入类型**。输入类型是一种特殊的对象类型，可以作为参数传递（请参见 [Input types](https://graphql.org/learn/schema/#input-types) 在 GraphQL 文档）。若要声明输入类型，请使用 `@InputType()` 装修师。

```typescript
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class UpvotePostInput {
  @Field()
  postId: number;
}
```

> info **Hint** `@InputType()` 装饰器将 options 对象作为参数，因此您可以指定输入类型的描述。由于 TypeScript 的元数据反映系统的限制，您必须使用 `@Field()` 装饰器来指示类型，或者使用 [CLI 插件](/graphql/cli-plugin)。

然后，您可以在解析器类中使用此类型：

```typescript
@Mutation(() => Post)
async upvotePost(
  @Args('upvotePostData') upvotePostData: UpvotePostInput,
) {}
```

#### 模式优先

扩展 `AuthorsResolver` 从 [Resolvers](/graphql/resolvers) 篇章。

```typescript
@Mutation()
async upvotePost(@Args('postId') postId: number) {
  return this.postsService.upvoteById({ id: postId });
}
```

此示例假设业务逻辑（查询帖子并递增其 `votes` 属性）位于 `PostsService` 中。这种逻辑可以根据需要简单或复杂。这个例子的目的是展示解析器如何与其他提供者交互。

最后一步是将突变添加到现有的类型定义中。

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

type Mutation {
  upvotePost(postId: Int!): Post
}
```

`upvotePost(postId: Int!): Post` 突变现在是应用程序 GraphQLAPI 的一部分。
