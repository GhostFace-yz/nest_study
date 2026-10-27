# Generating SDL

Source: https://docs.nestjs.com/graphql/generating-sdl

> warning **Warning** 本章仅适用于代码优先的方法。

要手动生成 GraphQL SDL 模式（即，不运行应用程序、连接数据库、连接解析器等），请使用 `GraphQLSchemaBuilderModule`：

```typescript
async function generateSchema() {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule);
  await app.init();

  const gqlSchemaFactory = app.get(GraphQLSchemaFactory);
  const schema = await gqlSchemaFactory.create([RecipesResolver]);
  console.log(printSchema(schema));
}
```

> info **Hint** 这个 `GraphQLSchemaBuilderModule` 和 `GraphQLSchemaFactory` 是从 `@nestjs/graphql` 包装。这个 `printSchema` 函数是从 `graphql` 包装。

#### 使用

这个 `gqlSchemaFactory.create()` 方法获取解析器类引用数组。例如：

```typescript
const schema = await gqlSchemaFactory.create([
  RecipesResolver,
  AuthorsResolver,
  PostsResolver,
]);
```

它还接受一个可选的第二个参数，其中包含一个标量类数组：

```typescript
const schema = await gqlSchemaFactory.create(
  [RecipesResolver, AuthorsResolver, PostsResolver],
  [DurationScalar, DateScalar],
);
```

最后，可以传递 options 对象（相同 `BuildSchemaOptions` 被接受 `buildSchemaOptions` 财产 `GraphQLModule` 配置）：

```typescript
const schema = await gqlSchemaFactory.create([RecipesResolver], {
  skipCheck: true,
  orphanedTypes: [],
});
```

- `skipCheck`：跳过模式验证；布尔值，默认为 `false`
- `orphanedTypes`：要生成的类数组，即使它们没有被显式引用（即，不是对象图的一部分）。通常，已声明但未在图中任何位置引用的类会被省略。
