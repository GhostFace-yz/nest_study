# Lazy-loading modules

Source: https://docs.nestjs.com/fundamentals/lazy-loading-modules

默认情况下，模块会急切地加载：一旦应用程序加载，所有模块都会加载，无论是否立即需要它们。这对于大多数应用程序来说都很好，但对于在**无服务器环境**中运行的应用程序和工作人员来说，这可能会成为一个瓶颈，其中启动延迟（“冷启动”）至关重要。

延迟加载可以通过只加载特定无服务器函数调用所需的模块来减少引导时间。一旦无服务器函数“升温”，您也可以异步加载其他模块，以进一步加快后续调用的引导时间（延迟模块注册）。

> info **Hint** 如果你熟悉**[Angular](https://angular.dev/)**框架，您可能见过术语“[延迟加载模块](https://angular.dev/guide/ngmodules/lazy-loading#lazy-loading-basics)“以前。这项技术在功能上有所不同 Nest，所以把它看作是一个完全不同的特性，恰好共享相似的名称。

> warning **Warning** [Lifecycle hook methods](/fundamentals/lifecycle-events) 不会在延迟加载的模块和服务中调用。

#### 入门

要按需加载模块，Nest 提供 `LazyModuleLoader` 类，您将其注入类中，就像任何其他依赖项一样：

```typescript
@Injectable()
export class CatsService {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}
}
```

> info **Hint** 这个 `LazyModuleLoader` 类是从 `@nestjs/core` 包装。

或者，您可以从应用程序引导文件（`main.ts`）中获取对 `LazyModuleLoader` 提供程序的引用：

```typescript
// "app" represents a Nest application instance
const lazyModuleLoader = app.get(LazyModuleLoader);
```

完成此操作后，您可以使用以下结构加载任何模块：

```typescript
const { LazyModule } = await import('./lazy.module.js');
const moduleRef = await this.lazyModuleLoader.load(() => LazyModule);
```

> info **Hint** 延迟加载的模块在第一个模块上被**缓存**`LazyModuleLoader#load` 方法调用。每次后续尝试加载 `LazyModule` 因此**非常快**，并返回一个缓存的实例，而不是再次加载模块。
>
> 巴什
> 加载“LazyModule”尝试：1
> 时间：2.379 毫秒
> 加载“LazyModule”尝试：2
> 时间：0.294 毫秒
> 加载“LazyModule”尝试：3
> 时间：0.303 毫秒
> ```
>
> 此外，延迟加载的模块与应用程序引导上急切加载的模块共享相同的模块图，以及稍后在应用程序中注册的任何其他延迟模块。

这里，`lazy.module.ts` 是一个 TypeScript 导出**常规 Nest 模块**（无需额外更改）。

这个 `LazyModuleLoader#load` 方法返回 [模块参考](/fundamentals/module-ref)（的 `LazyModule`)，它允许您浏览提供程序的内部列表并获取对任何提供程序的引用，使用其注入令牌作为查找键。

> info **Hint** 这个 `load()` 方法接受可选的第二个参数，即 options 对象。设置其 `logger` 财产至 `false` 抑制日志 Nest 在加载模块时生成。

例如，假设我们有一个 `LazyModule` 具有以下定义：

```typescript
@Module({
  providers: [LazyService],
  exports: [LazyService],
})
export class LazyModule {}
```

> info **Hint** 延迟加载的模块不能注册为**全局模块**，因为在所有静态注册的模块都已实例化之后，它们是按需延迟注册的。同样，注册的**全局增强器**（守卫、拦截器等）**也无法正常工作**。

有了这个，我们可以获得对 `LazyService` 供应商：

```typescript
const { LazyModule } = await import('./lazy.module.js');
const moduleRef = await this.lazyModuleLoader.load(() => LazyModule);

const { LazyService } = await import('./lazy.service.js');
const lazyService = moduleRef.get(LazyService);
```

> warning **Warning** 如果您使用**webpack**，请更新您的 `tsconfig.json` 文件：将 `compilerOptions.module` 设置为 `"esnext"`，并添加 `compilerOptions.moduleResolution` 属性，其值为 `"node"`：
>
> ```json
> {
> "compilerOptions":{
> "模块": "esnext",
> "moduleResolution": "节点",
> ...
> }
> }
> ```
>
> 设置这些选项后，您可以使用 webpack 的 [代码分割](https://webpack.js.org/guides/code-splitting/) 特性。

#### 延迟加载控制器、网关和解析器

因为控制器（或解析器，在 GraphQL 应用）在 Nest 表示路由、路径或主题（或查询和突变）的集合，您**不能使用 `LazyModuleLoader` 班级。

> info 错误**警告**控制器，[旋转变压器](/graphql/resolvers)，和 [网关](/websockets/gateways) 在延迟加载的模块中注册将不会按预期运行。同样，您也不能注册中间件（通过实现 `NestModule` 界面的 `configure()` 方法 `MiddlewareConsumer`）我们问。

例如，假设您正在构建一个 RESTAPI(HTTP 应用）与 Fastify 在底层（使用 `@nestjs/platform-fastify` 包）。Fastify 在应用程序准备就绪并监听后，不允许您注册路由。所以即使 Nest 分析了在模块控制器中注册的路由映射，延迟加载的路由将无法访问，因为没有办法在运行时注册它们。

同样，由 `@nestjs/microservices` 包装（包括 Kafka,gRPC，和 RabbitMQ) 必须在建立连接之前订阅特定的主题或频道。一旦您的应用程序开始监听消息，框架就无法订阅新主题。

最后，`@nestjs/graphql` 启用代码优先方法的包生成 GraphQL 基于元数据的动态模式。这需要预先加载所有类；否则，它无法创建有效的模式。

#### 常见用例

当 worker、cron job、lambda 或其他无服务器函数或 webhook 必须根据其输入参数（路由路径、日期、查询参数等）触发不同的服务（不同的逻辑）时，延迟加载模块是最常见的。）.对于单片应用程序来说，延迟加载模块的意义不大，因为在单片应用程序中，启动时间基本上无关紧要。
