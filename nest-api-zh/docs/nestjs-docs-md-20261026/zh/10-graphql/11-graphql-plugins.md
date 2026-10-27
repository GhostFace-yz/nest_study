# Plugins

Source: https://docs.nestjs.com/graphql/plugins

插件允许您通过响应某些事件执行自定义操作来扩展 Apollo Server 的核心功能。这些事件对应于 GraphQL 请求生命周期，以及启动 Apollo 服务器本身（参见 [插件](https://www.apollographql.com/docs/apollo-server/integrations/plugins/) 在阿波罗文档中）。例如，一个基本的日志记录插件可能会记录 GraphQL 发送到 Apollo 服务器的每个请求的查询字符串。

#### 自定义插件

要创建插件，请声明一个用 `@Plugin()` 装饰器，从 `@nestjs/apollo` 包装。为了更好地实现代码自动完成，还可以实现 `ApolloServerPlugin` 接口来自 `@apollo/server` 包装。

```typescript
import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { Plugin } from '@nestjs/apollo';

@Plugin()
export class LoggingPlugin implements ApolloServerPlugin {
  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    console.log('Request started');
    return {
      async willSendResponse() {
        console.log('Will send response');
      },
    };
  }
}
```

有了这个，注册 `LoggingPlugin` 作为提供者：

```typescript
@Module({
  providers: [LoggingPlugin],
})
export class CommonModule {}
```

Nest 自动实例化插件并将其应用于 Apollo 服务器。

#### 使用外部插件

阿波罗服务器提供了几个开箱即用的插件。要使用现有插件，请导入它并将其添加到 `plugins` 数组：

```typescript
import { ApolloServerPluginCacheControl } from '@apollo/server/plugin/cacheControl';

GraphQLModule.forRoot({
  // ...
  plugins: [ApolloServerPluginCacheControl({ defaultMaxAge: 5 })],
}),
```

> info **Hint** 这个 `ApolloServerPluginCacheControl` 插件是从 `@apollo/server/plugin/cacheControl` 入口点 `@apollo/server` 包装。

#### Mercurius 插件

一些现有的汞特异性 Fastify 插件必须在插件树中的 Mercurius 插件之后加载（请参见 [插件](https://mercurius.dev/#/docs/plugins) 在 Mercurius 文档中）。

> warning **Warning** [mercurius-upload](https://github.com/mercurius-js/mercurius-upload) 是一个例外：在主文件中注册它。

为此， `MercuriusDriver` 公开一个可选的 `plugins` 配置选项。它接受具有两个属性的对象数组： `plugin` 及其 `options`.例如，注册 [缓存插件](https://github.com/mercurius-js/cache) 看起来像这样：

```typescript
GraphQLModule.forRoot({
  driver: MercuriusDriver,
  // ...
  plugins: [
    {
      plugin: cache,
      options: {
        ttl: 10,
        policy: {
          Query: {
            add: true
          }
        }
      },
    }
  ]
}),
```
