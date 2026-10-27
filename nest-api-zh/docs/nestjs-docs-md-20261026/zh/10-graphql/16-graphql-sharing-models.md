# Sharing models

Source: https://docs.nestjs.com/graphql/sharing-models

> warning **Warning** 本章仅适用于代码优先的方法。

使用的最大优点之一 TypeScript 对于项目的后端，能够在一个 TypeScript-基于前端应用程序通过公共 TypeScript 包装。

但是，使用代码优先方法创建的模型需要大量注释 GraphQL-相关装修人员。那些装饰器在前端无关紧要，损害了它的性能。

#### 使用模型垫片

为了解决这个问题，Nest 提供一个“垫片”，用惰性代码替换原来的装饰符。这个 `@nestjs/graphql` 封装通过 `browser` 导出条件，因此为浏览器构建解析该条件的捆绑程序（例如，带有 `web` 目标）自动拾取。

如果您的捆绑程序没有解析 `browser` 条件，在 `@nestjs/graphql` 包装和垫片。例如，使用 webpack：

```typescript
resolve: { // see: https://webpack.js.org/configuration/resolve/
  alias: {
      "@nestjs/graphql": path.resolve(__dirname, "../node_modules/@nestjs/graphql/dist/extra/graphql-model-shim")
  }
}
```

> info **Hint** [TypeORM](/data/typeorm) 包提供了类似的 [模型垫片](https://github.com/typeorm/typeorm/blob/master/extra/typeorm-model-shim.js)。
