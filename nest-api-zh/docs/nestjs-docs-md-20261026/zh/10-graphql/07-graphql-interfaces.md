# Interfaces

Source: https://docs.nestjs.com/graphql/interfaces

像许多类型的系统一样，GraphQL 支持接口。**interface**是一种抽象类型，它定义了一组字段，类型必须包含这些字段才能实现接口（请参见 [接口](https://graphql.org/learn/schema/#interfaces) 在 GraphQL 文档）。

#### 代码优先

在代码优先方法中，定义 GraphQL 通过创建带有注释的抽象类来接口 `@InterfaceType()` 装饰器，从 `@nestjs/graphql` 包装。

```typescript
import { Field, ID, InterfaceType } from '@nestjs/graphql';

@InterfaceType()
export abstract class Character {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;
}
```

> warning **Warning** TypeScript 接口不能用于定义 GraphQL 接口。

这将在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
interface Character {
  id: ID!
  name: String!
}
```

实施 `Character` 接口，使用 `implements` 关键：

```typescript
@ObjectType({
  implements: () => [Character],
})
export class Human implements Character {
  id: string;
  name: string;
}
```

> info **Hint** 这个 `@ObjectType()` 装饰器是从 `@nestjs/graphql` 包装。

默认 `resolveType()` 库生成的函数根据解析器方法返回的值来确定类型。这意味着您必须返回类实例，而不是普通的 JavaScript 对象文字。

提供自定义 `resolveType()` 函数，传递 `resolveType` 选项对象中的属性 `@InterfaceType()` 装饰师：

```typescript
@InterfaceType({
  resolveType(book) {
    if (book.colors) {
      return ColoringBook;
    }
    return TextBook;
  },
})
export abstract class Book {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;
}
```

#### 接口解析器

到目前为止，接口只允许您与对象共享字段定义。要共享现场解析器实现，请创建专用接口解析器：

```typescript
import { Args, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';

@Resolver((type) => Character) // Reminder: Character is an interface
export class CharacterInterfaceResolver {
  @ResolveField(() => [Character])
  friends(
    @Parent() character, // Resolved object that implements Character
    @Info() { parentType }, // Type of the object that implements Character
    @Args('search', { type: () => String }) searchTerm: string,
  ) {
    // Get character's friends
    return [];
  }
}
```

这个 `friends` 字段解析器现在会为实现 `Character` 接口。

> warning **Warning** 这需要设置 `inheritResolversFromInterfaces` 财产至 `true` 在 `GraphQLModule` 配置。

#### 模式优先

若要在架构优先方法中定义接口，请使用 SDL 创建 GraphQL 接口：

```graphql
interface Character {
  id: ID!
  name: String!
}
```

然后，可以使用类型生成功能（如 [GraphQL quick start](/graphql/quick-start) 章）生成相应的 TypeScript 定义：

```typescript
export interface Character {
  id: string;
  name: string;
}
```

接口需要额外的 `__resolveType` 解析器映射中的字段，以确定接口解析到哪种类型。创建一个 `CharactersResolver` 类并定义 `__resolveType` 方法，它返回混凝土类型的名称：

```typescript
@Resolver('Character')
export class CharactersResolver {
  @ResolveField()
  __resolveType(value) {
    if ('age' in value) {
      return 'Person';
    }
    return null;
  }
}
```

> info **Hint** 所有装饰器都是从 `@nestjs/graphql` 包装。
