# HTTP client

Source: https://docs.nestjs.com/application/http-client

大多数应用程序调用其他服务 HTTP.这 `@nestjs/http-client` 包为此提供了一个客户端，建立在 `fetch` API 与 Node.js.它增加了什么 `fetch` 省略：基本 URL、默认标题， JSON 主体、路径和查询参数、类型化响应、超时、重试、拦截器和命名客户端。您将其配置为 Nest 模块并像任何其他提供者一样注入它。

除了 `@nestjs/common` 和 `@nestjs/core` 之外，该包没有依赖项。每个方法都返回一个承诺，因此您 `await` 请求并使用 `try`/`catch` 处理失败。如果您更喜欢可观测值，请参见 [Working with RxJS](/application/http-client#working-with-rxjs)。

> info **Hint** 这个包取代了基于 Axios 的 `HttpModule` 来自 `@nestjs/axios`，本章用来描述。`@nestjs/axios` 仍然可用。看 [Migrating from @nestjs/axios](/application/http-client#migrating-from-nestjsaxios) 转换。

#### 安装

要开始，请安装以下软件包：

```bash
$ npm i --save @nestjs/http-client
```

#### 入门

进口 `HttpClientModule` 进入发出请求的模块，并向 `register()` 方法：

```typescript
import { Module } from '@nestjs/common';
import { HttpClientModule } from '@nestjs/http-client';
import { CatsService } from './cats.service.js';

@Module({
  imports: [
    HttpClientModule.register({
      baseUrl: 'https://api.example.com/v1',
      timeout: '5s',
    }),
  ],
  providers: [CatsService],
})
export class CatsModule {}
```

然后注射 `HttpClient` 班级：

```typescript
import { Injectable } from '@nestjs/common';
import { HttpClient } from '@nestjs/http-client';
import type { Cat } from './interfaces/cat.interface.js';

@Injectable()
export class CatsService {
  constructor(private readonly http: HttpClient) {}

  async findAll(): Promise<Cat[]> {
    const { data } = await this.http.get<Cat[]>('/cats');
    return data;
  }
}
```

请求转到 `https://api.example.com/v1/cats`.一个亲戚 URL 附加到 `baseUrl` 正好有一个 `/` 在他们之间，所以 `/v1` 前缀被保留（不像 `new URL('/cats', base)`，这将丢弃它）。没有 `baseUrl` 需要绝对网址。

与其他 `register()` 方法一样，每个调用都会为导入它的模块创建一个客户端。要使客户端可注入到每个模块中，请设置 `isGlobal: true`。

#### 指定客户

应用程序通常与几个上游服务通信，每个服务都有自己的基 URL、凭据和超时。给每个客户端一个 `name`：

```typescript
@Module({
  imports: [
    HttpClientModule.register({
      name: 'github',
      baseUrl: 'https://api.github.com',
      headers: { accept: 'application/vnd.github+json' },
    }),
  ],
  providers: [ReposService],
})
export class ReposModule {}
```

并用 `@InjectHttpClient()` 装饰师：

```typescript
@Injectable()
export class ReposService {
  constructor(@InjectHttpClient('github') private readonly github: HttpClient) {}
}
```

没有名称注册的客户端是默认客户端，注入为 `HttpClient`。`getHttpClientToken(name)` 函数返回客户端的注入令牌，这在测试和自定义提供程序中非常有用。

#### 应用程序范围的默认值

每个客户端共享的设置，如 `user-agent` 标头、超时、重试策略或日志拦截器，都会进入 `HttpClientModule.forRoot()`。在根模块中导入一次。它总是全球性的：

```typescript
@Module({
  imports: [
    HttpClientModule.forRoot({
      headers: { 'user-agent': 'cats-service/1.0' },
      timeout: '10s',
    }),
    CatsModule,
    ReposModule,
  ],
})
export class AppModule {}
```

`forRoot()` 不注册客户端本身，也不需要 `baseUrl`.每个客户端自己的设置优于其默认设置，但有三个例外：合并标头（将标头设置为 `null` 在删除默认值的客户端中），逐字段合并重试设置，并且 `forRoot()` 拦截器跑在客户端的前面。

#### 异步配置

若要从其他提供程序（例如 [配置](/application/configuration#getting-started) 章中的 `ConfigService`）构建客户端选项，请使用 `registerAsync()`：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpClientModule, type Duration } from '@nestjs/http-client';
import { ReposService } from './repos.service.js';

@Module({
  imports: [
    HttpClientModule.registerAsync({
      name: 'github',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseUrl: config.getOrThrow<string>('GITHUB_API_URL'),
        headers: { authorization: `Bearer ${config.getOrThrow<string>('GITHUB_TOKEN')}` },
        timeout: config.get<Duration>('GITHUB_TIMEOUT', '5s'),
      }),
    }),
  ],
  providers: [ReposService],
})
export class ReposModule {}
```

工厂可以是 `async`.它返回与 `register()`, 类型 `HttpClientFactoryOptions`，除了 `name`, `isGlobal`, `imports` 和拦截器类： Nest 需要那些在工厂运行之前构建模块，所以他们去下一个 `useFactory`.返回其中一个的工厂会在启动时停止应用程序。

您可以传递一个实现 `HttpClientOptionsFactory` 接口。Nest 在客户端的模块中实例化它并调用它的 `createHttpClientOptions()` 方法：

```typescript
@Injectable()
export class GithubClientConfig implements HttpClientOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  createHttpClientOptions(): HttpClientFactoryOptions {
    return { baseUrl: this.config.getOrThrow<string>('GITHUB_API_URL') };
  }
}
```

```typescript
HttpClientModule.registerAsync({
  name: 'github',
  imports: [ConfigModule],
  useClass: GithubClientConfig,
});
```

若要重用已存在的提供程序而不是创建私有副本，请通过 `useExisting: GithubClientConfig`，以及将其导出到 `imports`. `forRootAsync()` 以同样的方式工作。它的 `useClass` 或者 `useExisting` 类实现 `HttpClientModuleOptionsFactory`，用一个 `createHttpClientModuleOptions()` 方法。

#### 提出请求

客户端对每个 HTTP 动词： `get()`, `post()`, `put()`, `patch()`, `delete()`, `head()`，和 `options()`.每个人都需要一个 URL 和可选的 options 对象，并解析为 `HttpResponse`.这 `request()` 方法将动词作为 `method` 选择。

```typescript
@Injectable()
export class ReposService {
  constructor(@InjectHttpClient('github') private readonly github: HttpClient) {}

  async findAll(org: string): Promise<Repo[]> {
    const { data } = await this.github.get<Repo[]>('/orgs/:org/repos', {
      params: { org },
      query: { type: 'public', sort: 'updated', topic: ['nest', 'typescript'] },
    });
    return data;
  }

  async createIssue(owner: string, repo: string, issue: CreateIssueDto): Promise<Issue> {
    const { data } = await this.github.post<Issue>('/repos/:owner/:repo/issues', {
      params: { owner, repo },
      json: issue,
    });
    return data;
  }
}
```

选项反映了什么 Nest 控制器从请求中读取：

- `params` 填充路径的 `:name` 段，URI 编码。即使省略了 `params`，没有值的段也会抛出，不匹配段的键也会抛出，或者会将请求移动到另一个端点的值（空字符串、`.` 或 `..`）也会抛出。
- `query` 是一个对象还是一个 `URLSearchParams` 实例，附加到已经在 URL.数组重复键（`topic=nest&topic=typescript`), `Date` 价值观变得 ISO 字符串，以及 `null` 和 `undefined` 值被跳过。上面的第一个请求转到 `https://api.github.com/orgs/nestjs/repos?type=public&sort=updated&topic=nest&topic=typescript`.
- `json` 序列化为 `JSON.stringify()`，并设置 `content-type: application/json` 除非你设置了一个标题。
- `body` 被传递给 `fetch` 因为：一个字符串，`Buffer`,`FormData`,`URLSearchParams`,`Blob`、网络或 Node.js 流，或异步迭代。要么通过 `json` 或者 `body` 不是两者都有。一个 `GET` 或者 `HEAD` 在发送任何东西之前，带有身体投掷的请求。
- `headers` 在客户端的标题上合并。一个 `null` 值删除标题。
- `timeout`,`retry`,`signal`,`throwOnHttpError`,`redirect`，和 `dispatcher` 覆盖一个请求的客户端设置，如下所述。
- `context` 是一个自由形式的对象 [拦截器](/application/http-client#interceptors) 可以阅读。

类型参数（如 `Repo[]`）描述 `data`。在运行时没有任何东西检查它，所以验证来自您无法控制的 API 的响应。`responseType` 选项控制正文的读取方式：

| `responseType` | `data` |
| --- | --- |
| `'auto'`（默认） | 解析 JSON 当 `content-type` 是 JSON （包括 `+json` 类型），否则为字符串。 `undefined` 当主体为空时，对于 `204` 和 `205` 响应，以及 `HEAD` 请求。一个 `304` 默认情况下，响应抛掷，就像任何非 2xx 一样；和 `throwOnHttpError: false`,它的 `data` 是 `undefined`. |
| `'json'` | 解析 JSON，无论内容类型如何。 |
| `'text'` | 一根绳子。 |
| `'arrayBuffer'` | 在 `ArrayBuffer`。 |
| `'stream'` | 和 Node.js`Readable`。参见 [Streaming responses](/application/http-client#streaming-responses)。 |
| `'response'` | 网络 `Response`，其主体未读。 |

类型 `data` 跟随 `responseType`,所以 `responseType: 'text'` 决心 `HttpResponse<string>` 正文无效的成功响应 JSON，虽然预计会，但拒绝了 `HttpParseError`.响应对象具有以下形状：

```typescript
interface HttpResponse<T> {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers; // a web Headers object: headers.get('etag')
  data: T;
  url: string; // the final URL, after redirects
  request: HttpRequest; // the request that was sent, after interceptors ran
}
```

#### 超时和取消

`fetch` 没有自己的超时，除了 Node.js 内的 HTTP 客户端 undici 的 5 分钟限制。在每个客户端上设置一个 `timeout`，单位可以是毫秒，也可以是持续时间字符串，如 `'500ms'`、`'5s'` 或 `'2m'`。一个无效的值在启动时失败，会出现命名选项的错误。`0` 表示没有超时，这是默认值。

超时适用于**每次尝试**，而不是整个呼叫。它涵盖了企图的拦截器和读取响应体。为了 `responseType: 'stream'` 和 `'response'`，一旦标头到达，它就会停止，因此长时间的下载不会中断。当它过去时，尝试会失败 `HttpTimeoutError`，并像在任何其他请求之后一样重试该请求 [瞬态失效](/application/http-client#retries).

若要取消请求，请传递 `AbortSignal` 作为 `signal` 选择。它与超时相结合。取消的请求被拒绝，信号为 `reason`,作为 `fetch` 即使在两次尝试之间等待，也不会重试。

由于重试，一个呼叫最多可能需要 `attempts × timeout`，加上尝试之间的等待。要限制整个通话，请通过一个截止日期作为信号：

```typescript
const { data } = await this.github.get<Repo>('/repos/:owner/:repo', {
  params: { owner, repo },
  signal: AbortSignal.timeout(10_000),
});
```

截止日期被拒绝 `DOMException` 命名 `TimeoutError`，其中 `toHttpException()` 地图到 `504 Gateway Timeout`,像一个 `HttpTimeoutError`.要将其与另一个信号组合，请使用 `AbortSignal.any([signal, AbortSignal.timeout(10_000)])`.

#### 重试

重试是**默认打开**。在没有任何配置的情况下，客户端最多可以尝试 3 次 `GET`,`HEAD`,`OPTIONS`,`PUT`，和 `DELETE`，方法 HTTP 定义为幂等。它在之后重试：

- 连接错误，例如拒绝或重置连接（包括读取主体时的重置），
- 每次尝试超时，
- `408`,`429`,`500`,`502`,`503`，和 `504` 答案。

在尝试之间，客户端以指数后退和完全抖动等待：第一次尝试后高达 200 ms 的随机延迟，第二次尝试后高达 400 ms，以此类推，上限为 30 秒。一个 `Retry-After` 响应头，以秒为单位或作为 HTTP 日期，替换回退。当它要求超过上限时，客户端根本不会等待，而是返回（或抛出）`429` 或者 `503` 马上回应。主体为流的请求永远不会重试，因为第一次尝试就消耗了它。

这个 `retry` 选项需要多次尝试，`false` 对于单次尝试或对象：

```typescript
HttpClientModule.register({
  name: 'github',
  baseUrl: 'https://api.github.com',
  retry: {
    attempts: 4, // in total, including the first request
    backoff: { delay: '500ms', factor: 2, maxDelay: '5s', jitter: 'full' },
    retryIf: (error, attempt) => !(error instanceof HttpNetworkError),
    methods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
}),
```

您省略的每个字段都保留其默认值。`backoff` 也可以是一个函数，它接收失败的尝试次数及其错误，并返回一个持续时间。`jitter` 可以是 `'full'`、`'equal'`（计算的延迟的至少一半）或 `'none'`。`retryIf` 只询问客户端无论如何都会重试的失败，因此它可以缩小默认值，但不能扩大默认值；为此，请使用 `methods` 和 `statusCodes`。它接收失败尝试的 `HttpResponseError`（及其 `body`）、`HttpTimeoutError` 或 `HttpNetworkError`。

重试设置是分层的：`forRoot()`，然后是客户端，然后是请求。每个层只覆盖它设置的字段，后面的层可以在早期的 `false` 之后重新打开重试。但是，`methods` 和 `statusCodes` 会**替换**默认列表，而不是添加到默认列表中。

`POST` 和 `PATCH` 不会重试，因为重复它们可能会向客户收取两次费用。当上游 API 支持幂等密钥，发送一个并选择加入该请求：

```typescript
const { data } = await this.payments.post<Charge>('/charges', {
  json: charge,
  headers: { 'idempotency-key': `charge-${order.id}` },
  retry: { methods: ['POST'] },
});
```

密钥标识操作，因此每次尝试都会发送相同的操作，上游返回原始结果，而不是创建第二次收费。设置 `methods: ['POST']` 在客户端上也会停止 `GET` 重试，因为该列表替换了默认列表。

> warning **Warning** 重试沿着服务链成倍增加。如果服务 A 调用 B，B 调用 C，并且每跳进行 3 次尝试，那么对 C 的一次失败请求变成了对 C 的 9 次调用，这些调用恰好在 C 已经在挣扎的时候到达。仅在一层重试，通常是调用外部依赖项的服务，并设置 `retry: false` 打电话给你自己服务的客户。

#### 处理错误

请求因以下错误之一而被拒绝，所有这些错误都会扩展 `HttpClientError` 班级：

| 错误 | 何时 | 字段 |
| --- | --- | --- |
| `HttpResponseError` | 上游以非 2xx 状态回复。 | `status`,`statusText`,`headers`,`body`（解析 JSON，否则文本），`method`,`url` |
| `HttpTimeoutError` | 这个 `timeout` 在最后一次尝试中失败了。 | `timeoutMs`,`method`,`url` |
| `HttpNetworkError` | 连接失败：DNS、被拒绝或重置连接、TLS 或被拒绝的客户端重定向（到另一个源，或使用 `redirect: 'error'`）。 | `cause`（例如，使用 `cause.code` 设置为 `ECONNREFUSED`),`method`,`url` |
| `HttpParseError` | 成功响应无效 JSON，尽管预计会。 | `status`,`statusText`,`headers`,`body`（原始文本），`method`,`url` |

取消的请求会因为信号的原因而被拒绝，拦截器抛出的错误会保持不变地传播。客户端拒绝发送的请求，例如无效的请求 `params` 值，拒绝 `TypeError`.要接收非 2xx 响应作为值，请设置 `throwOnHttpError: false` 在客户端或根据请求，并检查 `ok` 或者 `status` 你自己。

如果其中一个错误逃过路由处理程序，Nest 将响应 `500 Internal Server Error`。然而，对于您的 API 呼叫者来说，上游故障通常是 `502 Bad Gateway`，没有及时响应的是 `504 Gateway Timeout`。`toHttpException()` 函数相应地映射误差：

| 错误 | 变成 |
| --- | --- |
| `HttpResponseError` | `502 Bad Gateway`，或者当状态列在中时，上游状态和主体 `forward` |
| `HttpTimeoutError`，或 `TimeoutError` 的 `AbortSignal.timeout()` 最后期限 | `504 Gateway Timeout` |
| `HttpNetworkError`,`HttpParseError` | `502 Bad Gateway` |
| 其他任何东西，包括 `HttpException` | 返回时没有改变，所以 Nest 照常处理 |

```typescript
async findOne(owner: string, repo: string): Promise<Repo> {
  try {
    const { data } = await this.github.get<Repo>('/repos/:owner/:repo', {
      params: { owner, repo },
    });
    return data;
  } catch (error) {
    if (error instanceof HttpResponseError && error.status === 404) {
      throw new NotFoundException(`Repository ${owner}/${repo} not found`);
    }
    throw toHttpException(error);
  }
}
```

默认情况下，上游主体不会传递给调用者，因为它可能描述上游的内部。若要使用正文传递选定的状态，例如正文告诉调用者要修复什么的 `422`，请使用 `toHttpException(error, options)`，并将 `forward` 设置为 `[422]`，或 `true` 作为每个状态。原始错误保留为异常的 `cause`。

Nest 内置异常筛选器 [不登录](/exception-filters#exceptions-logging) 安 `HttpException`,所以一个 `502` 或者 `504` 不会留下任何痕迹。`toHttpException()` 因此，记录每一个故障，它变成 `5xx`，与 `HttpClient` 背景：

```text
ERROR [HttpClient] GET https://api.github.com/repos/nestjs/nest failed with 503 Service Unavailable; answering 502 Bad Gateway
```

设置 `log` 选项 `false` 当其他东西（例如您自己的异常过滤器）已经记录上游故障时。

您可以让它们保持处理程序不变，并将它们映射到 [异常过滤器](/exception-filters#binding-filters) 中，而不是在每个服务中映射错误。这使得呼叫站点没有 `try`/`catch`，更远的拦截器仍然会看到原始错误：

```typescript
import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { HttpClientError, toHttpException } from '@nestjs/http-client';

@Catch(HttpClientError)
export class HttpClientErrorFilter extends BaseExceptionFilter {
  catch(error: HttpClientError, host: ArgumentsHost) {
    super.catch(toHttpException(error), host);
  }
}
```

安 `AbortSignal.timeout()` 截止日期不是 `HttpClientError`，所以加 `DOMException` 二 `@Catch()` 如果你使用截止日期。`toHttpException()` 返回一个 `HttpException`，因此在微服务或 WebSocket 处理程序中，将错误转换为 `RpcException` 或者 `WsException` 你自己。

> info **Hint** 错误消息和对象最终会出现在日志中，因此客户端会对它们保密。消息从不包含响应正文，其中的 URL 会屏蔽查询值，如 `GET https://api.example.com/users?email=***` 所示。`url`、`headers` 和 `body` 字段是不可枚举的：您的代码可以读取它们，但记录器和 `JSON.stringify()` 将它们排除在外。

#### 拦截器

拦截器包装客户端发送的每个请求。它接收请求和发送请求的 `next` 函数，并返回结果 web`Response`。最简单的形式是函数：

```typescript
import type { HttpClientInterceptorFn } from '@nestjs/http-client';

export function apiKeyInterceptor(apiKey: string): HttpClientInterceptorFn {
  return (request, next) => {
    request.headers.set('x-api-key', apiKey);
    return next(request);
  };
}
```

这个 `HttpRequest` 对象保存 `method`，这个 `url` (a `URL` 实例）， `headers` (a `Headers` 实例）， `body`，这个 `signal`，这个 `attempt` 号码，以及请求的 `context`.您可以就地更改它，或者将修改后的副本传递给 `next()`.拦截器在**状态检查之前**看到响应，所以 a `4xx` 或者 `5xx` 他们也会得到回应。拦截器必须返回什么 `next()` 决心，或 `Response` 它自己的。

当拦截器需要其他提供程序时，将其编写为实现 `HttpClientInterceptor` 接口：

```typescript
import { Injectable } from '@nestjs/common';
import type { HttpClientInterceptor, HttpHandler, HttpRequest } from '@nestjs/http-client';
import { GithubTokenService } from './github-token.service.js';

@Injectable()
export class GithubAuthInterceptor implements HttpClientInterceptor {
  constructor(private readonly tokens: GithubTokenService) {}

  async intercept(request: HttpRequest, next: HttpHandler): Promise<Response> {
    request.headers.set('authorization', `Bearer ${await this.tokens.getToken()}`);
    return next(request);
  }
}
```

通过拦截器 `interceptors` 数组 `register()` 或者 `forRoot()`，或旁边 `useFactory` 在异步变体中：

```typescript
@Module({
  imports: [
    HttpClientModule.register({
      name: 'github',
      baseUrl: 'https://api.github.com',
      interceptors: [GithubAuthInterceptor],
    }),
  ],
  providers: [GithubTokenService, GithubAuthInterceptor, ReposService],
})
export class ReposModule {}
```

Nest 在应用程序初始化时解析拦截器类，因此拦截器甚至可能依赖于注入相同客户端的服务。如果类是应用程序中任何位置的提供程序，则作为 `GithubAuthInterceptor` 如上所示，使用该实例。否则， Nest 在客户端自己的模块中创建它，该模块可以看到全局提供程序和您在 `imports` 选择 `register()`.异步工厂也可以在其选项中返回拦截器，但只能返回函数和实例，例如 `apiKeyInterceptor(config.getOrThrow('API_KEY'))`.

拦截器按照它们列出的顺序运行，第一个最外面，`forRoot()` 拦截器跑在客户端的前面。它们每次尝试运行一次**，因此重试将获得一个新的令牌，并且 `request.attempt` 告诉他们是哪次尝试。当尝试失败时，`next()` 拒绝 `HttpNetworkError` 或者 `HttpTimeoutError`，或以中止为由。这使得拦截器成为记录上游流量的好地方：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import type { HttpClientInterceptor, HttpHandler, HttpRequest } from '@nestjs/http-client';

@Injectable()
export class HttpLoggingInterceptor implements HttpClientInterceptor {
  private readonly logger = new Logger('HttpClient');

  async intercept(request: HttpRequest, next: HttpHandler): Promise<Response> {
    const target = `${request.method} ${request.url.origin}${request.url.pathname}`;
    const start = performance.now();
    try {
      const response = await next(request);
      const ms = Math.round(performance.now() - start);
      this.logger.log(`${target} ${response.status} ${ms}ms (attempt ${request.attempt})`);
      return response;
    } catch (error) {
      this.logger.warn(`${target} failed: ${(error as Error).name} (attempt ${request.attempt})`);
      throw error;
    }
  }
}
```

注册于 `HttpClientModule.forRoot()` 和 `interceptors: [HttpLoggingInterceptor]`，它记录每个客户端的请求。它记录没有查询字符串的路径，查询字符串通常携带个人数据或密钥。

> info **Hint** 对于追踪，你不需要拦截器。[NestJS Observe](/observability/distributed-tracing#http-to-http) 记录每次出站 `fetch` 作为跨度调用，并将跟踪 id 传播给其他 Nest 服务。

#### 流响应

若要传递大响应而不在内存中缓冲，请设置 `responseType: 'stream'`。`data` 是一个 Node.js`Readable`，您可以从 [`StreamableFile`](/http/file-upload#streaming-files) 中的路由处理程序返回：

```typescript
@Get(':id/pdf')
async download(@Param('id') id: string): Promise<StreamableFile> {
  const { data, headers } = await this.billing.get('/invoices/:id/pdf', {
    params: { id },
    responseType: 'stream',
  });
  return new StreamableFile(data, {
    type: headers.get('content-type') ?? 'application/pdf',
  });
}
```

一旦报头到达，超时就停止，同时取消 `signal` 仍然停止下载。非 2xx 响应被读取并作为 `HttpResponseError`，照常。不要通过上游的 `content-length` 标题为 `length` 选项： `fetch` 解压缩 gzip 和 brotli 主体，因此流可以比标题所说的更长。对于网络 `ReadableStream`, 使用 `responseType: 'response'` 并阅读 `data.body`.

#### 代理，TLS，并重定向

Node.js 的 `fetch` 在 undici 上运行，undici 的默认调度器保留了一个保持活跃的连接池，因此常见情况不需要配置。要更改池大小，请通过代理进行路由，或使用自定义 TLS 设置（私有 CA，或客户端证书），传递 undici 调度器作为 `dispatcher` 选项：

```typescript
import { readFileSync } from 'node:fs';
import { Agent } from 'undici';

@Module({
  imports: [
    HttpClientModule.register({
      name: 'partner',
      baseUrl: 'https://partner.example.com',
      dispatcher: new Agent({
        connections: 20,
        connect: {
          ca: readFileSync('certs/partner-ca.pem'),
          cert: readFileSync('certs/client.pem'),
          key: readFileSync('certs/client-key.pem'),
        },
      }),
    }),
  ],
})
export class PartnerModule {}
```

对于代理，传递 `new ProxyAgent('http://proxy.internal:3128')`. Node.js 不会从内置模块公开这些类，因此请安装 `undici` 自己打包（`@nestjs/http-client` 不依赖于它），最好是使用您的主要版本 Node.js 发布包。一个 Node.js `http.Agent`Axios 接受为 `httpsAgent`，不适用于 `fetch`，并且无法编译。将每个客户端路由到 `HTTP_PROXY`, `HTTPS_PROXY`，和 `NO_PROXY` 环境变量相反，开始 Node.js 和 `--use-env-proxy` （或设置 `NODE_USE_ENV_PROXY=1`) 在支持它的版本上。

这个 `redirect` 选项控制如何 `3xx` 处理响应。一个客户 `baseUrl` 仅在其自身的源上跟随重定向，并在一个主机之间失败 `HttpNetworkError`，因为它的头携带上游凭据（参见 [Security](/application/http-client#security)).没有 `baseUrl` 让 `fetch` 跟随重定向到任何地方，删除 `authorization` 和 `cookie` 原点更改时的标题，但其他标题不会。

设置 `redirect` 二 `'follow'` 跟随重定向到任何地方 `baseUrl` 对于一个 API 故意重定向到另一个主机，`'error'` 每次重定向都失败，或者 `'manual'` 接收 `3xx` 答案就是这样。一个 `3xx` 响应不是成功的，所以结合 `'manual'` 和 `throwOnHttpError: false` 阅读它 `location` 头球。

#### 安全

客户端要防范一些常见的错误：

- **客户 `baseUrl` 只向其源发送请求。**绝对 URL 在同一来源上，如分页链接，可以工作，但在发送任何内容之前，另一个主机上的一个会抛出。在请求在那里重复之前，重定向到另一个主机也会失败。客户端报头和拦截器携带上游凭据，URL 取自用户输入或上游响应不得接收它们。使用没有 `baseUrl` 调用任意主机，或 `redirect: 'follow'` 对于一个 API 故意重定向到另一个主机。
- **路径参数已编码。**将请求值放入 `params` 和 `query` 而不是用字符串插值来构建路径。他们是 URI-编码，以及 `params` 值，例如 `..` 抛出而不是将请求移动到另一个端点。
- **URL 中的凭据被拒绝。**A`baseUrl` 或请求 URL 如 `https://user:pass@example.com` 投掷。在 `authorization` 而是标题。抛出带有换行符的标头值，但不引用消息中的值。
- **错误可以安全记录**，如 [Handling errors](/application/http-client#handling-errors) 中所述。

#### 检测

存根 `fetch` 是测试调用外部代码的最简单方法 API.传递给 `HttpClientModule.forRoot()`，每个客户端都使用它，同时保持其基础 URL、头、重试策略和拦截器。存根只需返回一个标准 `Response`:

```typescript
import { Test } from '@nestjs/testing';
import { HttpClientModule } from '@nestjs/http-client';
import { vi } from 'vitest';
import { ReposModule } from './repos.module.js';
import { ReposService } from './repos.service.js';

describe('ReposService', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  let repos: ReposService;

  beforeEach(async () => {
    fetch.mockReset();
    const moduleRef = await Test.createTestingModule({
      imports: [HttpClientModule.forRoot({ fetch }), ReposModule],
    }).compile();
    await moduleRef.init();
    repos = moduleRef.get(ReposService);
  });

  it('lists the public repositories of an organization', async () => {
    fetch.mockResolvedValueOnce(Response.json([{ name: 'nest' }]));

    await expect(repos.findAll('nestjs')).resolves.toEqual([{ name: 'nest' }]);
    const [url] = fetch.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.github.com/orgs/nestjs/repos?type=public&sort=updated&topic=nest&topic=typescript',
    );
  });

  it('retries a 503', async () => {
    fetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json([]));

    await expect(repos.findAll('nestjs')).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
```

每个电话都有自己的特点 `Response`,作为 `mockResolvedValueOnce()` 如上所述：响应体只能读取一次，因此 `mockResolvedValue()` 会将已经读取的响应传递给重试。设置自己的客户端 `fetch` 选项保留它，因为客户端的设置胜过 `forRoot()` 默认值。没有一个电话的客户 `globalThis.fetch` 每个请求，所以 `vi.stubGlobal('fetch', stub)` 也管用。

对于已经调用的应用程序的端到端测试 `forRoot()`，而是覆盖其选项。这取代了每个 `forRoot()` 选项，但拦截器直接传递给 `forRoot()` 或旁边 `useFactory`，继续运行：

```typescript
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(HTTP_CLIENT_MODULE_OPTIONS)
  .useValue({ fetch })
  .compile();
```

要将 HTTP 完全排除在测试之外，请将客户端本身替换为 `overrideProvider(getHttpClientToken('github'))`。在 Nest 之外，例如在脚本中，使用 `new HttpClient(options)` 创建客户端。

#### 使用 RxJS

若要使用 RxJS 运算符编写请求，请将其包装在可观察的范围内。`defer()` 当可观察对象被订阅时启动请求，而 `from()` 立即启动：

```typescript
import { defer } from 'rxjs';

const cats$ = defer(() => this.http.get<Cat[]>('/cats'));
```

两者都不会取消取消订阅的请求。当您需要时，例如使用 `switchMap()`，将取消订阅连接到 `AbortController`：

```typescript
import { Observable } from 'rxjs';

function fromRequest<T>(send: (signal: AbortSignal) => Promise<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    send(controller.signal).then(
      (value) => {
        subscriber.next(value);
        subscriber.complete();
      },
      (error) => subscriber.error(error),
    );
    return () => controller.abort();
  });
}

const cats$ = fromRequest((signal) => this.http.get<Cat[]>('/cats', { signal }));
```

#### 从 `@nestjs/axios`

`@nestjs/axios` 包仍然可用，并且在迁移时可以并排安装这两个包。下表将其特征映射到 `@nestjs/http-client`：

| `@nestjs/axios` | `@nestjs/http-client` |
| --- | --- |
| `HttpModule.register()` 和 `baseURL` | `HttpClientModule.register()` 和 `baseUrl` |
| `HttpModule.registerAsync()` | `HttpClientModule.registerAsync()`，这也需要一个 `name` |
| `HttpModuleOptionsFactory` 和 `createHttpOptions()` | `HttpClientOptionsFactory` 和 `createHttpClientOptions()` |
| `extraProviders` 在 `registerAsync()` | 导出提供程序的模块，传入 `imports` |
| 一 `HttpService` 每个导入模块 | 命名客户端，注入 `@InjectHttpClient(name)` |
| `HttpService` 返回可观测值的方法 | `HttpClient` 方法，返回承诺 |
| `firstValueFrom(this.httpService.get(url))` | `await this.http.get(url)` |
| `post(url, data)` | `post(url, options)`，数据在 `json`（或 `body`）中 |
| `params` 在请求配置中 | `query`.数组重复键，其中 Axios 写入 `key[]=`.在 `@nestjs/http-client`, `params` 填充物 `:name` 路径段，并抛出不匹配的键。 |
| `response.headers['etag']` | `response.headers.get('etag')` |
| `AxiosError` 和 `error.response?.status` | `HttpResponseError` 和 `error.status` 和 `error.body` |
| `error.code === 'ECONNABORTED'` | `HttpTimeoutError` |
| `validateStatus: () => true` | `throwOnHttpError: false` |
| `axiosRef`（Axios 实例） | 没有底层实例。使用客户端的选项，或将自定义函数传递为 `fetch`。 |
| `axiosRef.interceptors.request.use()` 和 `response.use()` | `interceptors`，请求和响应都有一个函数 |
| `httpsAgent` 或者 `proxy` | `dispatcher`,十一年 `Agent` 或者 `ProxyAgent` |
| `maxRedirects: 0` | `redirect: 'manual'` |
| 除非添加，否则不会重试 `axios-retry` | 对于幂等方法，默认情况下重试。`retry: false` 恢复 Axios 行为。 |
| `timeout` 对于整个请求 | `timeout` 每次尝试，也可以作为字符串，例如 `'5s'` |
| `onUploadProgress`,`onDownloadProgress` | 没有等效物。相反，计算流的字节。 |
