# Scalars

Source: https://docs.nestjs.com/graphql/scalars

A GraphQL 对象类型有一个名称和字段，但在某些时候这些字段必须解析为一些具体的数据。标量类型提供数据：它们表示查询叶（参见 [标量类型](https://graphql.org/learn/schema/#scalar-types) 在 GraphQL 文档）。 GraphQL 包括以下内置标量类型： `Int`, `Float`, `String`, `Boolean`，和 `ID`.除此之外，您可能还需要支持自定义原子数据类型（例如， `Date`).

#### 代码优先

代码首先使用五个标量接近船舶，其中三个是现有标量的别名 GraphQL 类型：

- `ID`（别名 `GraphQLID`)：唯一标识符，通常用于检索对象或作为缓存的键
- `Int`（别名 `GraphQLInt`)：有符号的 32 位整数
- `Float`（别名 `GraphQLFloat`)：有符号的双精度浮点值
- `GraphQLISODateTime` 中的日期时间字符串 UTC（默认情况下用于表示 `Date` 类型）
- `GraphQLTimestamp`: 一个有符号的整数，表示日期和时间，即自 Unix 时代开始以来的毫秒数

默认情况下，`GraphQLISODateTime`（例如，`2019-12-03T09:54:33Z`）表示 `Date` 类型。要改用 `GraphQLTimestamp`，请将 `buildSchemaOptions` 对象的 `dateScalarMode` 属性设置为 `'timestamp'`：

```typescript
GraphQLModule.forRoot({
  buildSchemaOptions: {
    dateScalarMode: 'timestamp',
  }
}),
```

同样，默认情况下，`GraphQLFloat` 表示 `number` 类型。要改用 `GraphQLInt`，请将 `buildSchemaOptions` 对象的 `numberScalarMode` 属性设置为 `'integer'`：

```typescript
GraphQLModule.forRoot({
  buildSchemaOptions: {
    numberScalarMode: 'integer',
  }
}),
```

您还可以创建自定义标量。

#### 覆盖默认标量

创建自定义实现 `Date` 标量，创建一个新类：

```typescript
import { Scalar, CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';

@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type';

  parseValue(value: unknown): Date {
    return new Date(value as number); // value from the client
  }

  serialize(value: unknown): number {
    return (value as Date).getTime(); // value sent to the client
  }

  parseLiteral(ast: ValueNode): Date | null {
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    return null;
  }
}
```

有了这个，注册 `DateScalar` 作为提供者：

```typescript
@Module({
  providers: [DateScalar],
})
export class CommonModule {}
```

现在您可以使用 `Date` 在您的课程中键入：

```typescript
@Field()
creationDate: Date;
```

#### 导入自定义标量

要使用自定义标量，请导入它并将其注册为解析器。出于演示目的，我们将使用 `graphql-type-json` 包，它定义了 `JSON`GraphQL 标量类型。

首先安装软件包：

```bash
$ npm i --save graphql-type-json
```

安装软件包后，将自定义解析器传递给 `forRoot()` 方法：

```typescript
import GraphQLJSON from 'graphql-type-json';

@Module({
  imports: [
    GraphQLModule.forRoot({
      resolvers: { JSON: GraphQLJSON },
    }),
  ],
})
export class AppModule {}
```

现在您可以使用 `JSON` 在您的课程中键入：

```typescript
@Field(() => GraphQLJSON)
info: JSON;
```

有关一组现成的标量，请参见 [graphql-scalars](https://www.npmjs.com/package/graphql-scalars) 包装。

#### 创建自定义标量

若要定义自定义标量，请创建一个新标量 `GraphQLScalarType` 实例。以下示例创建自定义 `UUID` 标量：

```typescript
import { GraphQLScalarType, Kind } from 'graphql';

const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(uuid: unknown): string | never {
  if (typeof uuid !== 'string' || !regex.test(uuid)) {
    throw new Error('invalid uuid');
  }
  return uuid;
}

export const CustomUuidScalar = new GraphQLScalarType({
  name: 'UUID',
  description: 'A simple UUID parser',
  serialize: (value) => validate(value),
  parseValue: (value) => validate(value),
  parseLiteral: (ast) =>
    validate(ast.kind === Kind.STRING ? ast.value : undefined),
});
```

然后将自定义解析器传递给 `forRoot()` 方法：

```typescript
@Module({
  imports: [
    GraphQLModule.forRoot({
      resolvers: { UUID: CustomUuidScalar },
    }),
  ],
})
export class AppModule {}
```

现在您可以使用 `UUID` 在您的课程中键入：

```typescript
@Field(() => CustomUuidScalar)
uuid: string;
```

#### 模式优先

要定义自定义标量（请参见 [自定义标量](https://www.apollographql.com/docs/graphql-tools/scalars.html) 在 GraphQL 工具文档），创建类型定义和专用解析器。如官方文档所示，我们将使用 `graphql-type-json` 包，它定义了 `JSON`GraphQL 标量类型。

首先安装软件包：

```bash
$ npm i --save graphql-type-json
```

安装软件包后，将自定义解析器传递给 `forRoot()` 方法：

```typescript
import GraphQLJSON from 'graphql-type-json';

@Module({
  imports: [
    GraphQLModule.forRoot({
      typePaths: ['./**/*.graphql'],
      resolvers: { JSON: GraphQLJSON },
    }),
  ],
})
export class AppModule {}
```

现在我们可以使用 `JSON` 标量在我们的类型定义中：

```graphql
scalar JSON

type Foo {
  field: JSON
}
```

定义标量类型的另一种方法是创建一个类。假设您想添加一个 `Date` 键入架构：

```typescript
import { Scalar, CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';

@Scalar('Date')
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type';

  parseValue(value: unknown): Date {
    return new Date(value as number); // value from the client
  }

  serialize(value: unknown): number {
    return (value as Date).getTime(); // value sent to the client
  }

  parseLiteral(ast: ValueNode): Date | null {
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    return null;
  }
}
```

有了这个，注册 `DateScalar` 作为提供者：

```typescript
@Module({
  providers: [DateScalar],
})
export class CommonModule {}
```

现在您可以使用 `Date` 类型定义中的标量：

```graphql
scalar Date
```

默认情况下，生成的 TypeScript 每个自定义标量的定义是 `any`，这不是类型安全的。您可以配置如何 Nest 指定如何生成类型时，为自定义标量生成类型：

```typescript
import { GraphQLDefinitionsFactory } from '@nestjs/graphql';
import { join } from 'node:path';

const definitionsFactory = new GraphQLDefinitionsFactory();

definitionsFactory.generate({
  typePaths: ['./src/**/*.graphql'],
  path: join(process.cwd(), 'src/graphql.ts'),
  outputAs: 'class',
  defaultScalarType: 'unknown',
  customScalarTypeMapping: {
    DateTime: 'Date',
    BigNumber: '_BigNumber',
  },
  additionalHeader: "import _BigNumber from 'bignumber.js'",
});
```

> info **Hint** 或者，您可以使用类型引用，例如 `DateTime: Date`。在这种情况下，`GraphQLDefinitionsFactory` 使用指定类型（`Date.name`）的 `name` 属性来生成 TypeScript 定义。对于自定义（非内置）类型，还必须添加导入语句。

现在，鉴于以下几点 GraphQL 自定义标量类型：

```graphql
scalar DateTime
scalar BigNumber
scalar Payload
```

Nest 在 `src/graphql.ts` 中生成以下 TypeScript 定义：

```typescript
import _BigNumber from 'bignumber.js';

export type DateTime = Date;
export type BigNumber = _BigNumber;
export type Payload = unknown;
```

这里，`customScalarTypeMapping` 属性将每个自定义标量映射到 TypeScript 键入以声明它。这个 `additionalHeader` 属性添加这些类型定义所需的任何导入。最后，设置 `defaultScalarType` 二 `'unknown'` 别名任何未列出的自定义标量 `customScalarTypeMapping` 二 `unknown` 而不是 `any`，其中 [TypeScript recommends](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type) 自 3.0 版本以来，增加了类型安全性。

> info **Hint** 该示例以别名从 `bignumber.js` 导入 `_BigNumber`，以避免 [圆形型基准](https://github.com/Microsoft/TypeScript/issues/12525#issuecomment-263166239)。
