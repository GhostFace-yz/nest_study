# Unions and Enums

Source: https://docs.nestjs.com/graphql/unions-and-enums

联合类型类似于接口，但它们不指定类型之间的任何公共字段（请参见 [联合类型](https://graphql.org/learn/schema/#union-types) 在 GraphQL 文档）。联合对于从单个字段返回不相交的数据类型非常有用。

#### 代码优先

定义一个 GraphQL 联合类型，首先定义组成联合的类。跟随 [联合类型示例](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#union-type) 从 Apollo 文档中，我们将创建两个类。首先， `Book`:

```typescript
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Book {
  @Field()
  title: string;
}
```

然后 `Author`：

```typescript
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Author {
  @Field()
  name: string;
}
```

有了这个，注册 `ResultUnion` 工会使用 `createUnionType` 从 `@nestjs/graphql` 包装：

```typescript
export const ResultUnion = createUnionType({
  name: 'ResultUnion',
  types: () => [Author, Book] as const,
});
```

> warning **Warning** 添加常量断言（`as const`）返回的数组 `types` 财产 `createUnionType` 功能。没有它，TypeScript 在编译时生成不正确的声明文件，并且使用另一个项目的联合会失败，并出现错误。

现在您可以参考 `ResultUnion` 在查询中：

```typescript
@Query(() => [ResultUnion])
search(): Array<typeof ResultUnion> {
  return [new Author(), new Book()];
}
```

这将在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Author {
  name: String!
}

type Book {
  title: String!
}

union ResultUnion = Author | Book

type Query {
  search: [ResultUnion!]!
}
```

默认 `resolveType()` 库生成的函数根据解析器方法返回的值来确定类型。这意味着您必须返回类实例，而不是普通的 JavaScript 对象文字。

提供自定义 `resolveType()` 函数，传递 `resolveType` 选项对象中的属性 `createUnionType()` 功能：

```typescript
export const ResultUnion = createUnionType({
  name: 'ResultUnion',
  types: () => [Author, Book] as const,
  resolveType(value) {
    if (value.name) {
      return Author;
    }
    if (value.title) {
      return Book;
    }
    return null;
  },
});
```

#### 模式优先

若要在架构优先方法中定义联合，请使用 SDL 创建 GraphQL 联合：

```graphql
type Author {
  name: String!
}

type Book {
  title: String!
}

union ResultUnion = Author | Book
```

然后，可以使用类型生成功能（如 [GraphQL quick start](/graphql/quick-start) 章）生成相应的 TypeScript 定义：

```typescript
export class Author {
  name: string;
}

export class Book {
  title: string;
}

export type ResultUnion = Author | Book;
```

工会需要额外的 `__resolveType` 解析器映射中的字段，以确定并解析到哪种类型。创建一个 `ResultUnionResolver` 类并定义 `__resolveType` 方法，返回混凝土类型的名称。记得登记 `ResultUnionResolver` 作为模块中的提供者。

```typescript
@Resolver('ResultUnion')
export class ResultUnionResolver {
  @ResolveField()
  __resolveType(value) {
    if (value.name) {
      return 'Author';
    }
    if (value.title) {
      return 'Book';
    }
    return null;
  }
}
```

> info **Hint** 所有装饰器都是从 `@nestjs/graphql` 包装。

### 枚举

枚举类型是一种特殊的标量，仅限于一组特定的允许值（请参见 [枚举类型](https://graphql.org/learn/schema/#enumeration-types) 在 GraphQL 文档）。它们允许您：

- 验证此类参数是否为允许的值之一
- 通过类型系统传达字段将始终是有限值集合中的一个

#### 代码优先

在代码优先方法中，定义 GraphQL 枚举类型通过创建 TypeScript 枚举：

```typescript
export enum AllowedColor {
  RED,
  GREEN,
  BLUE,
}
```

有了这个，注册 `AllowedColor` 枚举使用 `registerEnumType` 从 `@nestjs/graphql` 包装：

```typescript
registerEnumType(AllowedColor, {
  name: 'AllowedColor',
});
```

现在您可以参考 `AllowedColor` 在您的类型中：

```typescript
@Field(type => AllowedColor)
favoriteColor: AllowedColor;
```

这将在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
enum AllowedColor {
  RED
  GREEN
  BLUE
}
```

若要提供枚举的描述，请传递 `description` 财产 `registerEnumType()` 功能：

```typescript
registerEnumType(AllowedColor, {
  name: 'AllowedColor',
  description: 'The supported colors.',
});
```

若要提供枚举值的说明，或将值标记为已弃用，请传递 `valuesMap` 属性：

```typescript
registerEnumType(AllowedColor, {
  name: 'AllowedColor',
  description: 'The supported colors.',
  valuesMap: {
    RED: {
      description: 'The default color.',
    },
    BLUE: {
      deprecationReason: 'Too blue.',
    },
  },
});
```

这将在 SDL 中生成以下 GraphQL 模式：

```graphql
"""
The supported colors.
"""
enum AllowedColor {
  """
  The default color.
  """
  RED
  GREEN
  BLUE @deprecated(reason: "Too blue.")
}
```

#### 模式优先

若要在模式优先方法中定义枚举，请使用 SDL 创建 GraphQL 枚举：

```graphql
enum AllowedColor {
  RED
  GREEN
  BLUE
}
```

然后可以使用类型生成功能（如 [GraphQL quick start](/graphql/quick-start) 章）生成相应的 TypeScript 定义：

```typescript
export enum AllowedColor {
  RED = "RED",
  GREEN = "GREEN",
  BLUE = "BLUE"
}
```

有时，后端对枚举使用的内部值不同于公共 API 中公开的值。在本例中，API 包含 `RED`，但解析器使用 `#f00`（参见 Apollo 文档中的 [内部值](https://www.apollographql.com/docs/apollo-server/schema/scalars-enums/#internal-values)）。为此，请为 `AllowedColor` 枚举声明一个解析器对象：

```typescript
export const allowedColorResolver: Partial<Record<keyof typeof AllowedColor, any>> = {
  RED: '#f00',
};
```

> info **Hint** 所有装饰器都是从 `@nestjs/graphql` 包装。

然后将此解析器对象传递到 `resolvers` 财产 `GraphQLModule#forRoot()` 方法：

```typescript
GraphQLModule.forRoot({
  resolvers: {
    AllowedColor: allowedColorResolver,
  },
});
```
