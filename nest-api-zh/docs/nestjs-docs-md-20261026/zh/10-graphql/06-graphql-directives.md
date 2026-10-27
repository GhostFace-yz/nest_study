# Directives

Source: https://docs.nestjs.com/graphql/directives

指令可以附加到字段或片段包含，并且可以以服务器希望的任何方式影响查询的执行（请参见 [指令](https://graphql.org/learn/queries/#directives) 在 GraphQL 文档）。这个 GraphQL 规范提供了几个默认指令：

- `@include(if: Boolean)`：仅当参数为 `true`
- `@skip(if: Boolean)`：如果参数为 `true`
- `@deprecated(reason: String)`：将字段标记为已弃用，并显示一条消息

指令是一个标识符，前面有一个 `@` 字符，可选地后跟命名参数列表。指令几乎可以出现在 GraphQL 查询语言和模式语言。

#### 自定义指令

要定义当阿波罗或水星遇到您的指令时会发生什么，请创建一个 transformer 函数。此函数使用 `mapSchema` 函数来迭代模式中的位置（字段定义、类型定义等）。）并应用相应的转换。

```typescript
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLSchema } from 'graphql';

export function upperDirectiveTransformer(
  schema: GraphQLSchema,
  directiveName: string,
) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const upperDirective = getDirective(
        schema,
        fieldConfig,
        directiveName,
      )?.[0];

      if (upperDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;

        // Replace the original resolver with a function that *first* calls
        // the original resolver, then converts its result to upper case
        fieldConfig.resolve = async function (source, args, context, info) {
          const result = await resolve(source, args, context, info);
          if (typeof result === 'string') {
            return result.toUpperCase();
          }
          return result;
        };
        return fieldConfig;
      }
    },
  });
}
```

下一步，应用 `upperDirectiveTransformer` 中的函数 `GraphQLModule#forRoot()` 方法使用 `transformSchema` 选项：

```typescript
GraphQLModule.forRoot({
  // ...
  transformSchema: (schema) => upperDirectiveTransformer(schema, 'upper'),
});
```

一旦注册，`@upper` 指令可以在您的模式中使用。如何应用该指令取决于您使用的方法（代码优先或模式优先）。

#### 代码优先

在代码优先方法中，使用 `@Directive()` 要应用该指令的装饰器：

```typescript
@Directive('@upper')
@Field()
title: string;
```

> info **Hint** 这个 `@Directive()` 装饰器是从 `@nestjs/graphql` 包装。

指令可以应用于字段、字段解析器、输入和对象类型，以及查询、变异和订阅。以下示例在查询处理程序级别应用指令：

```typescript
@Directive('@deprecated(reason: "This query will be removed in the next version")')
@Query(() => Author, { name: 'author' })
async getAuthor(@Args({ name: 'id', type: () => Int }) id: number) {
  return this.authorsService.findOneById(id);
}
```

> warning **Warning** 通过以下方式应用的指令 `@Directive()`decorator 不会反映在生成的模式定义文件中。

最后，在 `GraphQLModule` 配置：

```typescript
GraphQLModule.forRoot({
  // ...,
  transformSchema: schema => upperDirectiveTransformer(schema, 'upper'),
  buildSchemaOptions: {
    directives: [
      new GraphQLDirective({
        name: 'upper',
        locations: [DirectiveLocation.FIELD_DEFINITION],
      }),
    ],
  },
}),
```

> info **Hint** 两个 `GraphQLDirective` 和 `DirectiveLocation` 是从 `graphql` 包装。

#### 模式优先

在模式优先方法中，直接在 SDL 中应用指令：

```graphql
directive @upper on FIELD_DEFINITION

type Post {
  id: Int!
  title: String! @upper
  votes: Int
}
```
