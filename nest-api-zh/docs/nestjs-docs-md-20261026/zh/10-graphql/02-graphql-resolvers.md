# Resolvers

Source: https://docs.nestjs.com/graphql/resolvers

解析器提供将 [GraphQL](https://graphql.org/) 操作（查询、变异或订阅）转换为数据的指令。它们以模式中指定的形状返回数据，要么同步，要么作为解析该形状结果的承诺。通常，您需要手动创建**解析器贴图**。另一方面，`@nestjs/graphql` 包从用于注释类的装饰器提供的元数据自动生成解析器映射。为了演示如何使用包创建一个 GraphQLAPI，我们将构建一个简单的 authorsAPI。

#### 代码优先

在代码优先的方法中，您不编写 GraphQL 方案中 SDL 用手。相反，您使用 TypeScript 装饰器生成 SDL 来自 TypeScript 类定义。这个 `@nestjs/graphql` 包读取通过装饰器定义的元数据，并为您生成模式。

#### 对象类型

a 中的大多数定义 GraphQL 模式是**对象类型**。您定义的每个对象类型都应该表示应用程序客户端可能需要与之交互的域对象。例如，我们的样本 API 需要获取作者及其帖子的列表，因此我们定义一个 `Author`A 型 `Post` 类型。

使用模式优先的方法，您将定义 `Author` 输入 SDL 像这样：

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post!]!
}
```

使用代码优先的方法，您可以使用 TypeScript 类并使用 TypeScript 装修人员。上述等效物 SDL 在代码中，第一种方法是：

```typescript
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Post } from '../../posts/models/post.model.js';

@ObjectType()
export class Author {
  @Field(type => Int)
  id: number;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field(type => [Post])
  posts: Post[];
}
```

> info **Hint** TypeScript 的元数据反映系统有几个局限性。例如，它不能确定一个类由哪些属性组成，也不能确定给定的属性是可选的还是必需的。由于这些限制，您必须使用 `@Field()` 模式定义类中的装饰器，以提供有关每个字段的元数据 GraphQL 类型和选项，或使用 [CLI 插件](/graphql/cli-plugin) 为您生成此元数据。

这个 `Author` 像任何类一样，对象类型由字段的集合组成，每个字段声明一个类型。字段类型对应于 [GraphQL type](https://graphql.org/learn/schema/)，它可以是另一种对象类型，也可以是标量类型。一个 GraphQL 标量类型是原语（如 `ID`,`String`,`Boolean`, 或 `Int`) 解析为单个值。

> info **Hint** 除了 GraphQL 的内置标量类型外，您还可以定义 [自定义标量类型](/graphql/scalars)。

这个 `Author` 对象类型定义以上原因 Nest**生成**SDL 前面显示：

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post!]!
}
```

这个 `@Field()` 装饰器接受可选类型函数（例如，`type => Int`)，以及可选的选项对象。

类型函数是必需的 TypeScript 类型系统和 GraphQL 类型系统是模糊的。具体而言，**不**要求 `string` 和 `boolean` 类型，但它**是**必需的 `number`，它可以映射到任何一个 GraphQL`Int` 或者 `Float`（没有类型函数，`number` 地图到 `Float` 默认情况下）。类型函数返回所需的 GraphQL 类型，如这些章节中的示例所示。

options 对象可以具有以下任何键/值对：

- `nullable`：字段是否为空（在 `@nestjs/graphql` 默认情况下，每个字段都是不可空的）；`boolean`
- `description`：字段描述；`string`
- `deprecationReason`：将字段标记为已弃用；`string`

例如：

```typescript
@Field({ description: `Book title`, deprecationReason: 'Not useful in v2 schema' })
title: string;
```

> info **Hint** 您还可以向整个对象类型添加描述或弃用它：`@ObjectType({ description: 'Author model' })`。同样，如果您的应用程序服务于 [multiple GraphQL endpoints](/graphql/quick-start#multiple-endpoints)，则可以将类型范围扩展到特定的模块：`@ObjectType({ registerIn: () => AuthorsModule })`。

如果字段是数组，则必须在 `@Field()` 装饰器的类型函数，如下所示：

```typescript
@Field(type => [Post])
posts: Post[];
```

> info **Hint** 数组括号表示法（`[ ]`) 表示数组的深度。例如，`[[Int]]` 表示整数矩阵。

若要声明数组的项（而不是数组本身）可为空，请设置 `nullable` 财产至 `'items'` 如下所示：

```typescript
@Field(type => [Post], { nullable: 'items' })
posts: Post[];
```

> info **Hint** 如果数组及其项都为空，则设置 `nullable` 二 `'itemsAndList'` 反而。

与 `Author` 对象类型就位，让我们定义 `Post` 对象类型。

```typescript
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Post {
  @Field(type => Int)
  id: number;

  @Field()
  title: string;

  @Field(type => Int, { nullable: true })
  votes?: number;
}
```

`Post` 对象类型在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Post {
  id: Int!
  title: String!
  votes: Int
}
```

#### 代码优先解析器

此时，我们已经定义了数据图中可以存在的对象（类型定义），但是客户端还没有与它们交互的方法。为了解决这个问题，我们需要一个解析器类。在代码优先的方法中，解析器类既定义解析器函数**又生成**查询类型**。下面的示例显示了如何：

```typescript
@Resolver(() => Author)
export class AuthorsResolver {
  constructor(
    private authorsService: AuthorsService,
    private postsService: PostsService,
  ) {}

  @Query(() => Author)
  async author(@Args('id', { type: () => Int }) id: number) {
    return this.authorsService.findOneById(id);
  }

  @ResolveField()
  async posts(@Parent() author: Author) {
    const { id } = author;
    return this.postsService.findAll({ authorId: id });
  }
}
```

> info **Hint** 所有装饰者（例如，`@Resolver`,`@ResolveField`,`@Args` 等）是从 `@nestjs/graphql` 包装。

可以定义多个解析器类，并且 Nest 在运行时合并它们。参见 [Module](/graphql/resolvers#module) 有关代码组织的更多信息，请参见下面的部分。

> warning **Note** 内部的逻辑 `AuthorsService` 和 `PostsService` 类可以根据需要简单或复杂。这个例子的目的是展示如何构建解析器，以及它们如何与其他提供者交互。

这个 `AuthorsResolver` 上面定义了一个查询解析器函数和一个字段解析器函数。若要创建解析器，请创建一个以解析器函数为方法的类，并使用 `@Resolver()` 装修师。

这个 `author()` 方法是一个查询处理程序，它返回 `id` 在请求中发送。若要将方法标记为查询处理程序，请使用 `@Query()` 装修师。

参数传递给 `@Resolver()` 装饰器是可选的，但是一旦你的图形变得不平凡，它就会发挥作用：它提供字段解析器函数在遍历对象图形时使用的父对象。

因为此类包含一个**字段解析器**函数（用于 `posts` 财产 `Author` 对象类型），您**必须**通过 `@Resolver()`decorator 一个值，该值指示父类型（即对应的 `ObjectType` 类）用于类中定义的所有字段解析器。字段解析器需要访问父对象（被解析字段所属的对象）。这里，字段解析器填充作者的 `posts` 通过使用作者的服务调用数组 `id`，这就是为什么必须在 `@Resolver()` 装修师。这个 `@Parent()` 方法参数装饰器然后在字段解析器中提取对父对象的引用。

您可以定义多个 `@Query()` 解析器函数（在此类和其他解析器类中）。它们聚合到生成的单个**查询类型**定义中 SDL，以及解析器映射中的相应条目。这使您可以定义接近它们使用的模型和服务的查询，并将它们很好地组织成模块。

> info **Hint** 这个 NestCLI 提供一个生成器（原理图），为您生成**所有样板代码**。参见 [CRUD 生成器](/recipes/crud-generator) 详情食谱。

#### 查询类型名称

在上面的示例中，`@Query()` 装饰器导出 GraphQL 方法名称中的查询名称。例如，考虑上面示例中的以下构造：

```typescript
@Query(() => Author)
async author(@Args('id', { type: () => Int }) id: number) {
  return this.authorsService.findOneById(id);
}
```

这将为架构中的 author 查询生成以下条目（查询使用与方法相同的名称）：

```graphql
type Query {
  author(id: Int!): Author!
}
```

> info **Hint** 了解有关 [GraphQL queries](https://graphql.org/learn/queries/) 的更多信息。

传统上，这些名称是解耦的。例如，您可能将查询处理程序方法命名为 `getAuthor()`，但仍然将查询公开为 `author`。这同样适用于现场旋转变压器。为此，请将映射名称作为参数传递给 `@Query()` 和 `@ResolveField()` 装饰器，如下所示：

```typescript
@Resolver(() => Author)
export class AuthorsResolver {
  constructor(
    private authorsService: AuthorsService,
    private postsService: PostsService,
  ) {}

  @Query(() => Author, { name: 'author' })
  async getAuthor(@Args('id', { type: () => Int }) id: number) {
    return this.authorsService.findOneById(id);
  }

  @ResolveField('posts', () => [Post])
  async getPosts(@Parent() author: Author) {
    const { id } = author;
    return this.postsService.findAll({ authorId: id });
  }
}
```

上面的 `getAuthor()` 处理程序方法生成 SDL 中 GraphQL 模式的以下部分：

```graphql
type Query {
  author(id: Int!): Author!
}
```

#### 查询装饰器选项

这个 `@Query()` 装饰器的选项对象（我们传递 `{name: 'author'}` 上面）接受多个键/值对：

- `name`：查询的名称；一个 `string`
- `description`：用于生成 GraphQL 模式文档（例如，在 GraphiQL 中）；一个 `string`
- `deprecationReason`：在模式元数据中将查询标记为已弃用（例如，如 GraphiQL 所示）；一个 `string`
- `nullable`：查询是否可以返回空数据响应；`boolean`、`'items'` 或 `'itemsAndList'`（有关 `'items'` 和 `'itemsAndList'` 的详细信息，请参见上文）

#### Args 装饰器选项

使用 `@Args()` 装饰器从请求中提取参数以用于处理程序方法。这很像 [REST 路径参数提取](/controllers#route-parameters)。

通常，`@Args()` 装饰器不需要选项对象。例如，如果标识符是一个字符串，下面的构造就足够了：它从入站中提取命名字段 GraphQL 请求用作方法参数。

```typescript
@Args('id') id: string
```

`getAuthor()` 方法使用 `number` 类型，这带来了一个挑战：TypeScript`number` 类型没有携带关于预期 GraphQL 表示的足够信息（例如，`Int` 与 `Float`）。因此，您必须**显式地**传递选项对象中的类型引用，作为第二个参数传递给 `@Args()` 装饰器：

```typescript
@Query(() => Author, { name: 'author' })
async getAuthor(@Args('id', { type: () => Int }) id: number) {
  return this.authorsService.findOneById(id);
}
```

options 对象接受下列可选键/值对：

- `type`：返回 GraphQL 类型
- `defaultValue`：默认值；`any`
- `description`：元数据描述；`string`
- `deprecationReason`：弃用字段并提供描述原因的元数据；`string`
- `nullable`: 字段是否为空

查询处理程序方法可以接受多个参数。例如，要通过 `firstName` 和 `lastName`, 呼叫 `@Args()` 两次：

```typescript
getAuthor(
  @Args('firstName', { nullable: true }) firstName?: string,
  @Args('lastName', { defaultValue: '' }) lastName?: string,
) {}
```

> info **Hint** 对于一个 GraphQL 可为空字段 `firstName`，您不需要添加 `null` 或者 `undefined` 到现场 TypeScript 类型。但是，请注意，可为空字段会将这些值传递给解析器，因此您需要在那里防范它们。

#### 专用参数类

内联 `@Args()` 调用，像上面的例子这样的代码很快就会变得臃肿。相反，您可以创建一个专用 `GetAuthorArgs` 参数类并在处理程序方法中访问它，如下所示：

```typescript
@Args() args: GetAuthorArgs
```

创建 `GetAuthorArgs` 类使用 `@ArgsType()` 如下所示：

```typescript
import { MinLength } from 'class-validator';
import { Field, ArgsType } from '@nestjs/graphql';

@ArgsType()
export class GetAuthorArgs {
  @Field({ nullable: true })
  firstName?: string;

  @Field({ defaultValue: '' })
  @MinLength(3)
  lastName: string;
}
```

> info **Hint** 同样，由于 TypeScript 的元数据反映系统的限制，您必须使用 `@Field()` 装饰器来指示类型和可选性，或者使用 [CLI 插件](/graphql/cli-plugin)。与以前一样，您不需要将 `null` 或 `undefined` 添加到可为空的 `firstName` 字段的类型中，但您确实需要在解析器中防范这些值。

这将在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Query {
  author(firstName: String, lastName: String! = ""): Author!
}
```

> info **Hint** 像 `GetAuthorArgs` 这样的参数类可以很好地与 `ValidationPipe` 配合使用（参见 [Validation](/application/validation)）。

#### 类继承

您可以使用标准 TypeScript 类继承以创建具有通用实用程序特性（字段和字段属性、验证等）的可扩展基类。）.例如，您可能有一组与分页相关的参数，这些参数总是包含标准 `offset` 和 `limit` 字段，以及其他特定于类型的索引字段。您可以设置如下所示的类层次结构。

基地 `@ArgsType()` 班级：

```typescript
@ArgsType()
class PaginationArgs {
  @Field(() => Int)
  offset: number = 0;

  @Field(() => Int)
  limit: number = 10;
}
```

基的特定类型子类 `@ArgsType()` 班级：

```typescript
@ArgsType()
class GetAuthorArgs extends PaginationArgs {
  @Field({ nullable: true })
  firstName?: string;

  @Field({ defaultValue: '' })
  @MinLength(3)
  lastName: string;
}
```

可以采用相同的方法 `@ObjectType()` 对象。在基类上定义泛型属性：

```typescript
@ObjectType()
class Character {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;
}
```

在子类上添加特定于类型的属性：

```typescript
@ObjectType()
class Warrior extends Character {
  @Field()
  level: number;
}
```

也可以将继承与解析器一起使用，并将其与 TypeScript 保持类型安全的泛型。例如，要使用泛型创建基类 `findAll` 查询，使用如下结构：

```typescript
function BaseResolver<T extends Type<unknown>>(classRef: T): any {
  @Resolver({ isAbstract: true })
  abstract class BaseResolverHost {
    @Query(() => [classRef], { name: `findAll${classRef.name}` })
    async findAll(): Promise<T[]> {
      return [];
    }
  }
  return BaseResolverHost;
}
```

请注意以下内容：

- 显式返回类型（`any` 以上）是必需的；否则， TypeScript 抱怨使用私有类定义。我们建议定义一个接口，而不是使用 `any`.
- `Type` 是从 `@nestjs/common` 包装。
- 这个 `isAbstract: true` 属性指示 SDL（模式定义语言语句）不应为此类生成。也可以在其他类型上设置此属性以抑制 SDL 代。

以下是如何创建 `BaseResolver` 的具体子类：

```typescript
@Resolver(() => Recipe)
export class RecipesResolver extends BaseResolver(Recipe) {
  constructor(private recipesService: RecipesService) {
    super();
  }
}
```

此构造将生成以下 SDL：

```graphql
type Query {
  findAllRecipe: [Recipe!]!
}
```

#### 仿制药

我们在上面看到了泛型的一个用法。泛型允许您构建可重用的抽象。例如，下面是一个基于 [GraphQL pagination guide](https://graphql.org/learn/pagination/#pagination-and-edges) 的基于光标的分页实现：

```typescript
import { Field, ObjectType, Int } from '@nestjs/graphql';
import { Type } from '@nestjs/common';

interface IEdgeType<T> {
  cursor: string;
  node: T;
}

export interface IPaginatedType<T> {
  edges: IEdgeType<T>[];
  nodes: T[];
  totalCount: number;
  hasNextPage: boolean;
}

export function Paginated<T>(classRef: Type<T>): Type<IPaginatedType<T>> {
  @ObjectType(`${classRef.name}Edge`)
  abstract class EdgeType {
    @Field(() => String)
    cursor: string;

    @Field(() => classRef)
    node: T;
  }

  @ObjectType({ isAbstract: true })
  abstract class PaginatedType implements IPaginatedType<T> {
    @Field(() => [EdgeType], { nullable: true })
    edges: EdgeType[];

    @Field(() => [classRef], { nullable: true })
    nodes: T[];

    @Field(() => Int)
    totalCount: number;

    @Field()
    hasNextPage: boolean;
  }
  return PaginatedType as Type<IPaginatedType<T>>;
}
```

定义了这个基类后，您可以创建继承其行为的专用类型。例如：

```typescript
@ObjectType()
class PaginatedAuthor extends Paginated(Author) {}
```

#### 模式优先

正如在 [Quick start](/graphql/quick-start) 章节中提到的，在模式优先的方法中，您首先在 SDL 中手动定义模式类型（参见 [GraphQL type language](https://graphql.org/learn/schema/#type-language)）。考虑以下 SDL 类型定义。

> info **Hint** 为了方便起见，本章保留了所有 SDL 在一个位置（例如，一个 `.graphql` 文件，如下所示）。实际上，您可能更喜欢模块化组织。例如，您可以创建个人 SDL 包含每个域实体的类型定义的文件，并将其与相关服务、解析器代码和 Nest 该实体专用目录中的模块类。Nest 在运行时聚合所有单独的模式类型定义。

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post]
}

type Post {
  id: Int!
  title: String!
  votes: Int
}

type Query {
  author(id: Int!): Author
}
```

#### 模式优先解析器

上面的模式公开了一个查询：`author(id: Int!): Author`。

> info **Hint** 了解有关 [GraphQL queries](https://graphql.org/learn/queries/) 的更多信息。

现在创建一个 `AuthorsResolver` 解析作者查询的类：

```typescript
@Resolver('Author')
export class AuthorsResolver {
  constructor(
    private authorsService: AuthorsService,
    private postsService: PostsService,
  ) {}

  @Query()
  async author(@Args('id') id: number) {
    return this.authorsService.findOneById(id);
  }

  @ResolveField()
  async posts(@Parent() author) {
    const { id } = author;
    return this.postsService.findAll({ authorId: id });
  }
}
```

> info **Hint** 所有装饰者（例如，`@Resolver`,`@ResolveField`,`@Args` 等）是从 `@nestjs/graphql` 包装。

> warning **Note** 内部的逻辑 `AuthorsService` 和 `PostsService` 类可以根据需要简单或复杂。这个例子的目的是展示如何构建解析器，以及它们如何与其他提供者交互。

这个 `@Resolver()` 需要装修工。它接受一个带有类型名称的可选字符串参数。每当类包含 `@ResolveField()` 装修人员，告诉 Nest 装饰方法与哪个父类型相关联（`Author` 在本例中键入）。或者，不是应用 `@Resolver()` 对于类，您可以将其应用于每个方法：

```typescript
@Resolver('Author')
@ResolveField()
async posts(@Parent() author) {
  const { id } = author;
  return this.postsService.findAll({ authorId: id });
}
```

在这种情况下（`@Resolver()` 在方法级别），如果一个类有多个 `@ResolveField()` 方法，必须添加 `@Resolver()` 给他们每个人。这不被认为是最佳实践，因为它会增加开销。

> info **Hint** 传递给的任何类名参数 `@Resolver()`**不**影响查询（`@Query()` 修饰子）或突变（`@Mutation()` 装饰师）。

> warning **Warning** 使用 `@Resolver`**代码优先**方法不支持方法级别的装饰器。

在上面的示例中，`@Query()` 和 `@ResolveField()` 装饰者与 GraphQL 基于方法名的架构字段。例如，考虑上面示例中的以下构造：

```typescript
@Query()
async author(@Args('id') id: number) {
  return this.authorsService.findOneById(id);
}
```

这将为架构中的 author 查询生成以下条目（查询使用与方法相同的名称）：

```graphql
type Query {
  author(id: Int!): Author
}
```

通常，这些名称是解耦的，使用的名称如下 `getAuthor()` 或者 `getPosts()` 对于解析器方法。为此，将映射名称作为参数传递给装饰器，如下所示：

```typescript
@Resolver('Author')
export class AuthorsResolver {
  constructor(
    private authorsService: AuthorsService,
    private postsService: PostsService,
  ) {}

  @Query('author')
  async getAuthor(@Args('id') id: number) {
    return this.authorsService.findOneById(id);
  }

  @ResolveField('posts')
  async getPosts(@Parent() author) {
    const { id } = author;
    return this.postsService.findAll({ authorId: id });
  }
}
```

> info **Hint** 这个 NestCLI 提供一个生成器（原理图），为您生成**所有样板代码**。参见 [CRUD 生成器](/recipes/crud-generator) 详情食谱。

#### 生成类型

如果使用模式优先方法并启用了类型生成（使用 `outputAs: 'class'`，如 [Quick start](/graphql/quick-start) 章节所示），则运行应用程序将在 `GraphQLModule.forRoot()` 方法中指定的位置生成以下文件，例如 `src/graphql.ts`：

```typescript
export class Author {
  id: number;
  firstName?: string;
  lastName?: string;
  posts?: Post[];
}
export class Post {
  id: number;
  title: string;
  votes?: number;
}

export abstract class IQuery {
  abstract author(id: number): Author | Promise<Author>;
}
```

生成类（而不是默认接口）允许您将声明性验证**decorators**与模式优先方法结合起来（参见 [Validation](/application/validation)）。例如，您可以将 `class-validator` 装饰器添加到生成的 `CreatePostInput` 类中，如下所示，以在 `title` 字段上强制执行最小和最大字符串长度：

```typescript
import { MinLength, MaxLength } from 'class-validator';

export class CreatePostInput {
  @MinLength(3)
  @MaxLength(50)
  title: string;
}
```

> warning **Notice** 要启用自动验证您的输入（和参数），请使用 `ValidationPipe`。在 [Validation](/application/validation) 和 [Pipes](/pipes) 章节中了解更多信息。

但是，每次重新生成文件时，直接添加到生成文件中的装饰符都会被**覆盖**。相反，创建一个单独的文件并扩展生成的类。

```typescript
import { MinLength, MaxLength } from 'class-validator';
import { Post } from '../../graphql.js';

export class CreatePostInput extends Post {
  @MinLength(3)
  @MaxLength(50)
  title: string;
}
```

#### GraphQL 参数修饰器

您可以访问标准 GraphQL 与专用装饰器的解析器参数。下表映射了 Nest 他们所代表的普通阿波罗参数的装饰者。

<table>
  <tbody>
    <tr>
      <td><code>@Root()</code> and <code>@Parent()</code></td>
      <td><code>root</code>/<code>parent</code></td>
    </tr>
    <tr>
      <td><code>@Context(param?: string)</code></td>
      <td><code>context</code> / <code>context[param]</code></td>
    </tr>
    <tr>
      <td><code>@Info(param?: string)</code></td>
      <td><code>info</code> / <code>info[param]</code></td>
    </tr>
    <tr>
      <td><code>@Args(param?: string)</code></td>
      <td><code>args</code> / <code>args[param]</code></td>
    </tr>
  </tbody>
</table>

这些论点有以下含义：

- `root`：一个对象，它包含从父字段上的解析器返回的结果，或者，如果是顶级字段 `Query` 领域，`rootValue` 从服务器配置传递。
- `context`：特定查询中所有解析器共享的对象；通常用于包含每个请求状态。
- `info`：包含有关查询执行状态的信息的对象。
- `args`：一个对象，其参数传递到查询中的字段中。

#### 模块

通过上述步骤，我们已经声明地指定了所有信息 `GraphQLModule` 需要生成解析器映射。这个 `GraphQLModule` 使用反射来反省通过装饰器提供的元数据，并自动将类转换为正确的解析器映射。

您唯一需要做的另一件事是**提供**解析器类（`AuthorsResolver`），即将其列为模块中的提供者，并导入该模块（`AuthorsModule`）某个地方 Nest 可以使用它。

例如，您可以在 `AuthorsModule`，其还可以提供在此上下文中需要的其他服务。务必导入 `AuthorsModule` 某处（例如，在根模块中，或在由根模块导入的另一个模块中）。

```typescript
@Module({
  imports: [PostsModule],
  providers: [AuthorsService, AuthorsResolver],
})
export class AuthorsModule {}
```

> info **Hint** 它有助于按**域模型**组织代码（类似于在 REST API).在这种方法中，保留模型（`ObjectType` 类）、解析器和服务一起在一个 Nest 表示域模型的模块，每个模块在一个文件夹中。当你这样做并使用 [Nest CLI](/cli/overview) 要生成每个元素， CLI 为您将这些部分连接起来（将文件放在适当的文件夹中，将条目添加到 `providers` 和 `imports` 数组等）。
