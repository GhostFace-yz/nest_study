# Caching

Source: https://docs.nestjs.com/data/caching

缓存是提高应用程序性能的一种简单有效的**技术**。缓存充当临时存储层，提供对常用数据的快速访问，因此您不必重复获取或计算相同的信息。其结果是更快的响应时间和更好的整体效率。

#### 安装

开始缓存 Nest，安装 `@nestjs/cache-manager` 包装以及 `cache-manager` 包装：

```bash
$ npm install @nestjs/cache-manager cache-manager
```

默认情况下，所有内容都存储在内存中。因为 `cache-manager` 使用 [Keyv](https://keyv.org/docs/) 在底层，您可以切换到不同的存储解决方案，例如 Redis，通过安装适当的软件包。看 [Using alternative Cache stores](/data/caching#using-alternative-cache-stores) 以下。

#### 内存缓存

若要在应用程序中启用缓存，请导入 `CacheModule` 并使用 `register()` 方法：

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller.js';

@Module({
  imports: [CacheModule.register()],
  controllers: [AppController],
})
export class AppModule {}
```

此设置使用默认设置初始化内存缓存，因此您可以立即开始缓存数据。

#### 与缓存存储进行交互

若要与缓存管理器实例进行交互，请使用 `CACHE_MANAGER` 令牌，如下：

```typescript
constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}
```

> info **Hint** 这个 `Cache` 班级和 `CACHE_MANAGER` 令牌都是从 `@nestjs/cache-manager` 包装。

使用 `get()` 方法 `Cache` 实例（来自 `cache-manager` 包）从缓存中检索项目。如果该项不存在于缓存中，`get()` 回报 `undefined`(`cache-manager`v6 返回 `null` 相反）。迁移时，将两者都视为缓存未命中。

```typescript
const value = await this.cacheManager.get('key');
```

若要将项目添加到缓存，请使用 `set()` 方法：

```typescript
await this.cacheManager.set('key', 'value');
```

> warning **Note** 默认的内存存储保留对该值的引用，而不是副本：`get()` 返回传递到的相同对象 `set()`，因此之后更改该对象也会更改缓存条目。将缓存值视为只读值，或在更改值之前复制该值。Keyv 存储在 [Using alternative Cache stores](/data/caching#using-alternative-cache-stores) 将值序列化为 JSON 相反，类实例作为普通对象返回 `Date` 对象以字符串的形式返回。

您可以指定 TTL 特定密钥的过期时间（毫秒）如下：

```typescript
await this.cacheManager.set('key', 'value', 1000);
```

这里，缓存项在一秒钟后过期。

要存储永不过期的项，请传递 `0` 的 TTL：

```typescript
await this.cacheManager.set('key', 'value', 0);
```

若要从缓存中删除项，请使用 `del()` 方法：

```typescript
await this.cacheManager.del('key');
```

要清除整个缓存，请使用 `clear()` 方法：

```typescript
await this.cacheManager.clear();
```

#### 自动缓存响应

> warning **Warning** 在 [GraphQL](/graphql/quick-start) 应用程序，拦截器是为每个现场解析器单独执行的。结果，`CacheModule`（使用拦截器缓存响应）在那里不能正常工作。

若要自动缓存响应，请绑定 `CacheInterceptor` 要缓存数据的位置：

```typescript
@Controller()
@UseInterceptors(CacheInterceptor)
export class AppController {
  @Get()
  findAll(): string[] {
    return [];
  }
}
```

> warning **Warning** 默认情况下，仅 `GET` 端点被缓存（显式 `@CacheKey()` 在路由处理程序绕过此检查）。所以， HTTP 注入本机响应对象的路由（`@Res()`）不能使用 `CacheInterceptor`.见 [响应映射](/interceptors#response-mapping) 更多详情。

要减少样板，可以绑定 `CacheInterceptor` 到全球所有端点：

```typescript
import { Module } from '@nestjs/common';
import { CacheModule, CacheInterceptor } from '@nestjs/cache-manager';
import { AppController } from './app.controller.js';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [CacheModule.register()],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class AppModule {}
```

#### 生存时间(TTL)

默认情况下，`ttl` 未设置，因此缓存条目永远不会过期（与将其设置为 `0` 相同）。要指定自定义 [TTL](https://en.wikipedia.org/wiki/Time_to_live)，请将 `ttl` 选项传递给 `register()` 方法：

```typescript
CacheModule.register({
  ttl: 5000, // milliseconds
});
```

#### 全局使用模块

使用 `CacheModule` 在其他模块中，您需要导入它（与任何 Nest 模块）。或者，将其声明为 [全局模块](/modules#global-modules) 通过设置 `isGlobal` 购股权的性质反对 `true`，如下所示。在这种情况下，一旦 `CacheModule` 被加载到根模块中（例如，`AppModule`)，不需要在其他模块中导入。

```typescript
CacheModule.register({
  isGlobal: true,
});
```

#### 全局缓存覆盖

当 `CacheInterceptor` 被全局绑定时，缓存条目存储在从请求 URL 自动生成的密钥下。您可以在每个方法的基础上覆盖某些缓存设置（`@CacheKey()` 和 `@CacheTTL()`），以自定义各个控制器方法的缓存策略。这在使用 [不同的缓存存储](/data/caching#using-alternative-cache-stores) 时最为相关。

您也可以应用 `@CacheTTL()` 装饰器到控制器以设置 TTL 对于它的所有路线。当控制器级和方法级 TTL 定义了设置，方法级设置优先。

```typescript
@Controller()
@CacheTTL(5000)
export class AppController {
  @CacheKey('custom_key')
  @CacheTTL(2000)
  findAll(): string[] {
    return [];
  }
}
```

> info **Hint** 这个 `@CacheKey()` 和 `@CacheTTL()` 装饰器是从 `@nestjs/cache-manager` 包装。

您可以使用 `@CacheKey()` 装饰器，带或不带相应的 `@CacheTTL()` 装饰器，反之亦然，仅覆盖键或仅覆盖 TTL。未被装饰器覆盖的设置使用模块注册的默认设置（参见 [Time-to-live (TTL)](/data/caching#time-to-live-ttl)）。

#### WebSocket 和微服务

您也可以应用 `CacheInterceptor` 到 WebSocket 订户和微服务模式（无论使用何种传输）。

```typescript
@CacheKey('events')
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): string[] {
  return [];
}
```

在这些情况下，`@CacheKey()` 需要 decorator：它指定用于存储和检索缓存数据的键。没有它，响应就不会被缓存。另外，请记住，你**不应该缓存所有东西**。切勿缓存执行业务操作而不仅仅是查询数据的操作。

还可以使用 `@CacheTTL()` 装饰器指定缓存过期时间 (TTL)，该装饰器会覆盖默认值 TTL：

```typescript
@CacheKey('events')
@CacheTTL(1000)
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): string[] {
  return [];
}
```

> info **Hint** 在 HTTP 应用，`@CacheTTL()` 装饰器可以使用或不使用相应的 `@CacheKey()` 装修师。在 WebSocket 和微服务上下文中，没有 `@CacheKey()`，因为没有密钥就不会缓存任何内容。

#### 调整跟踪

默认情况下，Nest 使用请求 URL（在 HTTP 应用程序）或通过 `@CacheKey()`decorator（在 WebSocket 和 microservice 应用程序中）将缓存记录与端点相关联。有时您可能希望根据其他因素跟踪记录，例如，HTTP 标题（例如，`Authorization` 正确识别 `profile` 端点）。

为此，创建一个子类 `CacheInterceptor` 并覆盖 `trackBy()` 方法：

```typescript
@Injectable()
class HttpCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    return 'key';
  }
}
```

#### 使用备用缓存存储

要切换到不同的缓存存储，请先安装适当的软件包。例如，要使用 Redis，安装 `@keyv/redis` 包装。下面的示例还使用了来自 `cacheable` 包装：

```bash
$ npm install @keyv/redis cacheable
```

有了这个，您就可以注册 `CacheModule` 有多个商店，如下所示：

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller.js';
import { createKeyv } from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: async () => {
        return {
          stores: [
            new Keyv({
              store: new KeyvCacheableMemory({ ttl: 60000, lruSize: 5000 }),
            }),
            createKeyv('redis://localhost:6379'),
          ],
        };
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
```

此示例注册两个存储：`CacheableMemory` 和一个 Redis 存储。`CacheableMemory` 是使用 `KeyvCacheableMemory` 存储适配器创建的内存中存储，而 Redis 存储是使用 `@keyv/redis` 中的 `createKeyv()` 助手创建的。`stores` 数组指定要使用的存储。数组中的第一个存储是默认存储，其余的是备用存储。

参见 [Keyv documentation](https://keyv.org/docs/) 有关可用商店的更多信息。

#### 异步配置

您可能希望在编译时异步传递模块选项，而不是静态传递。在这种情况下，使用 `registerAsync()` 方法，它提供了几种处理异步配置的方法。

一种方法是使用工厂函数：

```typescript
CacheModule.registerAsync({
  useFactory: () => ({
    ttl: 5000,
  }),
});
```

该工厂的行为类似于所有其他异步模块工厂：它可以是 `async`，并且可以通过 `inject` 注入依赖项。

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    ttl: configService.get('CACHE_TTL'),
  }),
  inject: [ConfigService],
});
```

或者，您可以使用 `useClass` 语法：

```typescript
CacheModule.registerAsync({
  useClass: CacheConfigService,
});
```

此构造实例化 `CacheConfigService` 内部 `CacheModule` 并用它来获取 options 对象。`CacheConfigService` 必须实施 `CacheOptionsFactory` 提供配置选项的接口：

```typescript
@Injectable()
class CacheConfigService implements CacheOptionsFactory {
  createCacheOptions(): CacheModuleOptions {
    return {
      ttl: 5000,
    };
  }
}
```

若要使用从不同模块导入的现有配置提供程序，请使用 `useExisting` 语法：

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});
```

这与 `useClass` 有一个关键的区别：`CacheModule` 查找导入的模块以重用已创建的模块 `ConfigService` 而不是实例化自己。

> info **Hint** `CacheModule#register`,`CacheModule#registerAsync`，和 `CacheOptionsFactory` 接受一个可选的泛型（类型参数），它缩小了特定于商店的配置选项的范围，使它们具有类型安全。

你也可以通过 `extraProviders` 到 `registerAsync()` 方法。这些提供程序与模块的提供程序合并：

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useClass: ConfigService,
  extraProviders: [MyAdditionalProvider],
});
```

当您想要为工厂函数或类构造函数提供额外的依赖项时，这非常有用。

#### 例子

[缓存样本](https://github.com/nestjs/nest/tree/master/sample/20-cache) 中提供了一个工作示例。
