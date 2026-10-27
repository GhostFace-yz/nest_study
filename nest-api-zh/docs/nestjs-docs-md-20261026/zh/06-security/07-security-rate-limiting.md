# Rate limiting

Source: https://docs.nestjs.com/security/rate-limiting

保护应用程序免受暴力攻击的常用技术是**速率限制**。要开始，请安装 `@nestjs/throttler` 包装。

```bash
$ npm i --save @nestjs/throttler
```

安装完成后，配置 `ThrottlerModule` 和其他人一样 Nest 包，带有 `forRoot()` 或者 `forRootAsync()` 方法。

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
  ],
})
export class AppModule {}
```

这将设置应用程序受保护路由的全局选项：`ttl`（以毫秒为单位的生存时间）和 `limit`（`ttl` 内的最大请求数）。

导入模块后，选择如何绑定 `ThrottlerGuard`。[警卫](/guards#binding-guards) 章中描述的任何类型的绑定都有效。例如，要全局绑定 guard，请将此提供程序添加到任何模块：

```typescript
{
  provide: APP_GUARD,
  useClass: ThrottlerGuard
}
```

#### 多个节气门定义

有时您需要多个节流定义，例如每秒不超过 3 个呼叫、每 10 秒 20 个呼叫和每分钟 100 个呼叫。为此，请在带有命名选项的数组中定义它们。您可以稍后在 `@SkipThrottle()` 和 `@Throttle()` 装饰器更改每个路由或控制器的选项。

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100
      }
    ]),
  ],
})
export class AppModule {}
```

#### 定制

您可能希望将防护绑定到控制器或全局绑定，但禁用一个或多个端点的速率限制。为此，请使用 `@SkipThrottle()` 装饰器禁用整个类或单个路由的节流阀。`@SkipThrottle()` 装饰器还接受带有字符串键（节流阀名称）和布尔值的对象。当您想要排除控制器的 _most_（但不是每条路线）时，这非常有用，如果您有多个节流阀集，则可以配置每个节流阀集的跳过。如果不传递对象，默认值为 `{ default: true }`。

```typescript
@SkipThrottle()
@Controller('users')
export class UsersController {}
```

这个 `@SkipThrottle()` 装饰器可以跳过路由或类，或者在跳过的类中否定路由的跳过。

```typescript
@SkipThrottle()
@Controller('users')
export class UsersController {
  // Rate limiting is applied to this route.
  @SkipThrottle({ default: false })
  dontSkip() {
    return 'List users work with Rate limiting.';
  }
  // This route will skip rate limiting.
  doSkip() {
    return 'List users work without Rate limiting.';
  }
}
```

这个 `@Throttle()` 装饰器覆盖 `limit` 和 `ttl` 在根模块中设置，以提供更严格或更宽松的安全选项。您可以将其应用于类或方法。从版本 5 开始，装饰器获取一个对象，其键是节流阀集名称，其值是具有 `limit` 和 `ttl` 键（以及可选地， `blockDuration`)，类似于传递给根模块的选项。如果没有在根选项中设置名称，请使用键 `default`:

```typescript
// Override default configuration for Rate limiting and duration.
@Throttle({ default: { limit: 3, ttl: 60000 } })
@Get()
findAll() {
  return "List users works with custom rate limiting.";
}
```

#### 代理

如果您的应用程序运行在代理服务器后面，请将 HTTP 适配器配置为信任代理。请参见 [Express](http://expressjs.com/en/guide/behind-proxies.html) 和 [Fastify](https://www.fastify.io/docs/latest/Reference/Server/#trustproxy) 的 `trust proxy` 选项。

以下示例启用 `trust proxy` 为了 Express 适配器：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 'loopback'); // Trust requests from the loopback address
  await app.listen(3000);
}

await bootstrap();
```

为了 Fastify 适配器，通过 `trustProxy` 替代选项：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy: 'loopback' }), // Trust requests from the loopback address
);
```

> warning **Warning** 在 Fastifyv5.12.1 及更高版本，其中 `@nestjs/platform-fastify`v12 安装，传递的编号为 `trustProxy`（跳数，例如 `1`) 使 Fastify 根本不信任代理人。`request.ip` 是代理的地址，节流阀将代理后面的每个客户端都算作一个。传递代理的地址或范围，如上例所示。

启用 `trust proxy` 可让您从 `X-Forwarded-For` 头检索原始 IP 地址。您也可以重写 `getTracker()` 方法从这个标头中提取 IP 地址，而不是依赖 `req.ip`。以下示例适用于 Express：

```typescript
import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ips.length ? req.ips[0] : req.ip; // individualize IP extraction to meet your own needs
  }
}
```

> info **Hint** 在 Fastify, `request.ips` 是从最近的地址到最远的地址排序的，所以它的第一个条目是代理的地址，这个守卫会把代理后面的每个客户端都算作一个。将默认跟踪器保留在那里，它使用 `request.ip`.查看请求对象 API 为了 [Express](https://expressjs.com/en/api.html#req.ips) 和 [Fastify](https://www.fastify.io/docs/latest/Reference/Request/).

#### Web 套接字

该模块与 WebSockets 一起工作，但它需要扩展 `ThrottlerGuard` 类并覆盖其 `handleRequest()` 方法，如下：

```typescript
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, generateKey } =
      requestProps;

    const client = context.switchToWs().getClient();
    const tracker = client._socket.remoteAddress;
    const key = generateKey(context, tracker, throttler.name);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttler.name,
      );

    // Throw an error when the user reached their limit.
    if (isBlocked) {
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    return true;
  }
}
```

> info **Hint** 上面的示例从 `client._socket` 读取客户端地址，它与 `@nestjs/platform-ws` 包一起工作。如果使用 `@nestjs/platform-socket.io`，请将 `client._socket` 替换为 `client.conn`。

使用 WebSockets 时，请记住以下几点：

- 请勿将此警卫注册为 `APP_GUARD` 或者 `app.useGlobalGuards()`.全球警卫也竞选 HTTP 路由，并且此防护只处理 WebSocket 上下文。
- 当达到极限时，Nest 发出 `exception` 事件，所以要确保听众准备好了。

> info **Hint** 配置时 [多个节气门定义](/security/rate-limiting#multiple-throttler-definitions),`handleRequest()` 每个油门组运行一次。通过 `throttler.name` 从 `ThrottlerRequest` 生成存储密钥时和调用时 `storageService.increment()`，如上所示，使得每个命名节流阀跟踪其自己的极限。

#### GraphQL

这个 `ThrottlerGuard` 也适用于 GraphQL 请求。再次扩展防护，但这次覆盖 `getRequestResponse()` 方法：

```typescript
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();
    return { req: ctx.req, res: ctx.res };
  }
}
```

#### 配置

以下选项对传递到 `ThrottlerModule` 的数组中的每个对象有效：

<table>
  <tr>
    <td><code>name</code></td>
    <td>the name used internally to track which throttler set is in use. Defaults to <code>default</code> if not passed. For named throttlers, the name is also appended to the rate limit response headers (e.g., <code>X-RateLimit-Remaining-long</code>)</td>
  </tr>
  <tr>
    <td><code>ttl</code></td>
    <td>the number of milliseconds that each request is kept in storage</td>
  </tr>
  <tr>
    <td><code>limit</code></td>
    <td>the maximum number of requests within the TTL</td>
  </tr>
  <tr>
    <td><code>blockDuration</code></td>
    <td>the number of milliseconds for which requests are blocked once the limit is reached. Defaults to the <code>ttl</code> value</td>
  </tr>
  <tr>
    <td><code>ignoreUserAgents</code></td>
    <td>an array of regular expressions matching user agents to ignore when throttling requests</td>
  </tr>
  <tr>
    <td><code>skipIf</code></td>
    <td>a function that takes the <code>ExecutionContext</code> and returns a <code>boolean</code> to short-circuit the throttler logic. Like <code>@SkipThrottle()</code>, but based on the request</td>
  </tr>
  <tr>
    <td><code>getTracker</code></td>
    <td>a function that overrides the default tracker logic for this throttler set (see the table below)</td>
  </tr>
  <tr>
    <td><code>generateKey</code></td>
    <td>a function that overrides the default key generation logic for this throttler set (see the table below)</td>
  </tr>
  <tr>
    <td><code>setHeaders</code></td>
    <td>whether to add the rate limit headers to the response. Defaults to <code>true</code></td>
  </tr>
</table>

若要设置自定义存储，或将上述某些选项全局应用于每个节气门集，请传递选项对象而不是数组。在其中定义节气门组 `throttlers` 属性，并使用下表中的选项：

<table>
  <tr>
    <td><code>storage</code></td>
    <td>a custom storage service that keeps track of the throttling. See <a href="/security/rate-limiting#storages">Storages</a></td>
  </tr>
  <tr>
    <td><code>ignoreUserAgents</code></td>
    <td>an array of regular expressions matching user agents to ignore when throttling requests</td>
  </tr>
  <tr>
    <td><code>skipIf</code></td>
    <td>a function that takes the <code>ExecutionContext</code> and returns a <code>boolean</code> to short-circuit the throttler logic. Like <code>@SkipThrottle()</code>, but based on the request</td>
  </tr>
  <tr>
    <td><code>throttlers</code></td>
    <td>an array of throttler sets, defined using the table above</td>
  </tr>
  <tr>
    <td><code>errorMessage</code></td>
    <td>a <code>string</code>, or a function that takes the <code>ExecutionContext</code> and the <code>ThrottlerLimitDetail</code> and returns a <code>string</code>, which overrides the default throttler error message</td>
  </tr>
  <tr>
    <td><code>getTracker</code></td>
    <td>a function that takes the request and the <code>ExecutionContext</code> and returns a <code>string</code> (or a <code>Promise</code> of one), overriding the default logic of the <code>getTracker()</code> method</td>
  </tr>
  <tr>
    <td><code>generateKey</code></td>
    <td>a function that takes the <code>ExecutionContext</code>, the tracker <code>string</code>, and the throttler name as a <code>string</code>, and returns the <code>string</code> used as the storage key for the rate limit value. This overrides the default logic of the <code>generateKey()</code> method</td>
  </tr>
  <tr>
    <td><code>setHeaders</code></td>
    <td>whether to add the rate limit headers to the response. Defaults to <code>true</code></td>
  </tr>
  <tr>
    <td><code>ipv6SubnetPrefix</code></td>
    <td>the prefix length used to group IPv6 addresses into a single tracker, so that a client cannot evade the limit by rotating through the addresses of its subnet. Applies only to the built-in tracker (not to a custom <code>getTracker</code>). Defaults to <code>64</code></td>
  </tr>
</table>

#### 异步配置

您可能希望异步加载速率限制配置。使用 `forRootAsync()` 方法，它支持依赖注入和 `async` 方法。

一种方法是使用工厂函数：

```typescript
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('THROTTLE_TTL'),
          limit: config.get('THROTTLE_LIMIT'),
        },
      ],
    }),
  ],
})
export class AppModule {}
```

您也可以使用 `useClass` 语法：

```typescript
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useClass: ThrottlerConfigService,
    }),
  ],
})
export class AppModule {}
```

只要 `ThrottlerConfigService` 实现 `ThrottlerOptionsFactory` 接口。

#### 存储

内置存储是一个内存缓存，用于跟踪请求，直到它们 TTL 已经过去了。您可以将自己的存储传递给 `storage` 选择权 `ThrottlerModule`，只要类实现了 `ThrottlerStorage` 接口。

对于分布式服务器，可以使用社区存储提供程序 [Redis](https://github.com/jmcdo29/nest-lab/tree/main/packages/throttler-storage-redis) 拥有单一的真理来源。

> info **Note** `ThrottlerStorage` 可以从 `@nestjs/throttler` 导入。

#### 时间帮手

`@nestjs/throttler` 导出五个辅助函数，使计时比原始毫秒值更具可读性：`seconds`、`minutes`、`hours`、`days` 和 `weeks`。每个都返回等效的毫秒数。例如，`seconds(5)` 返回 `5000`。

#### 迁移指南

迁移到版本 5 或更高版本时，对于大多数应用程序来说，将选项包装在数组中就足够了。

如果使用自定义存储，请将 `ttl` 和 `limit` 在数组中并将其分配给 `throttlers`options 对象的属性。

`@SkipThrottle()` 装饰器现在接受一个带有字符串键（节流阀名称）和布尔值的可选对象，默认为 `{ default: true }`。

这个 `@Throttle()`decorator 现在获取一个带有字符串键的对象，节流阀集的名称（同样，`'default'` 如果没有设置名称），以及作为对象的值 `limit` 和 `ttl` 钥匙。

> warning **Warning** 这个 `ttl` 现在是**毫秒**。为了保持你的 `ttl` 为了提高可读性，请使用 `seconds` 这个包中的助手，它将值乘以 1000。

有关更多信息，请参见 [5.0 changelog entry](https://github.com/nestjs/throttler/blob/master/CHANGELOG.md#501)。
