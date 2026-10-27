# Migration guide

Source: https://docs.nestjs.com/migration-guide

本文将向您介绍从 NestJS 版本 11 到版本 12。版本 12 以 ESM 更新的软件包 CLI 默认值，一流支持 [Standard Schema](https://standardschema.dev/)-基于验证和序列化，以及本机 [可观测性](/observability/overview) 支持。

#### 升级包

首先升级 NestCLI 它本身，因为下面使用的升级命令与它一起：

```bash
$ npm i -g @nestjs/cli@latest @nestjs/schematics@latest
```

如果您的项目保持 CLI 作为本地开发依赖项，也在那里更新它，以及 TypeScript. `@nestjs/schematics` v12 要求 TypeScript 6 作为对等依赖项，因此 npm 拒绝将其安装在 TypeScript 5:

```bash
$ npm i -D @nestjs/cli@latest @nestjs/schematics@latest typescript@^6
```

如果 npm 仍然报告对等依赖关系冲突，则您的锁文件很可能固定一个较旧的 `ts-jest` 或者 `typescript-eslint` 不接受的版本 TypeScript 6. 两者都带有 v11 生成的项目 CLI.运行 `npm update ts-jest typescript-eslint` 要将它们移动到当前范围内的较新版本，请再次运行上面的命令。

最新的 CLI 就位，运行 `nest upgrade` 从项目的根源：

```bash
$ nest upgrade
```

命令移动每个识别的 `@nestjs/*` 一次打包到其 v12 兼容的主要包，这样框架、平台适配器和配套包就会保持同步，然后安装它们。它还颠簸 TypeScript 到 v6，并应用本指南中描述的迁移的机械部分（`nest-cli.json`webpack 选项，GraphQL`playground` 和订阅传输更改，NATS 包交换，以及 `@nestjs/config` 验证选项）。最后，它会打印一份它所更改的所有内容的报告，以及它不能为您迁移的行为更改的注释。若要在不接触文件的情况下查看该报告，请使用 `--dry-run` 第一。看 [嵌套升级](/cli/usages#nest-upgrade) 有关步骤和选项的完整列表。

> info **Hint** `nest upgrade` 替换手册 [npm-check-updates (ncu)](https://npmjs.com/package/npm-check-updates) 之前在这里推荐的流程。如果您愿意，您仍然可以手动升级软件包；重要的是每一个 Nest 包一次移动到同一专业。该命令仅缓冲 CLI 项目内部的依赖关系，这就是为什么您首先升级全局二进制文件。

#### Node.js 要求

Node.js 要求因您是**运行**应用程序还是**生成**使用 CLI 的代码而异：

| 你在做什么 | 最低 Node.js |
| --- | --- |
| 运行一个 Nest12 应用 | **v20.19+**，或 22.x 行上的**v22.12+** |
| `nest new`,`nest generate`,`nest upgrade`(`@nestjs/schematics`) | **v22.22.3+**、**v24.15+**或**v26+** |

`@nestjs/core` 它自己仍然宣称 `>= 20`，但是 v12 包是 ESM-仅，并且从 CommonJS 应用程序使用它们依赖于 `require(esm)`，仅从 Node.js20.19 和 22.12 起。21.x 行从未收到，不受支持。`nest upgrade` 强制执行这一点，并拒绝在旧版本上运行。

AWSLambda 残疾人 `require(esm)` 默认情况下 Node.js20、22 和 24 个运行时，即使对应的上游 Node.js 释放启用它。运行 CommonJSNest12 这些 Lambda 运行时上的应用程序，通过函数的 `NODE_OPTIONS` 环境变量：

```text
NODE_OPTIONS=--experimental-require-module
```

如果 `NODE_OPTIONS` 已包含其他标志，请将此标志附加到现有值。参见 [AWS Lambda documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-experimental) 详细信息和实验功能的支持限制。

这个 CLI 的原理图有自己的较高楼层：`@nestjs/schematics` 要求**Node.jsv22.22.3+、v24.15+或 v26+**，继承自 Angular 它所建立的开发工具包。因此，脚手架和升级需要比运行框架更新的运行时。23.x 和 25.x 系列以及早期的 22.x 和 24.x 版本被排除在外。

> info **Hint** 满足每个要求的最简单方法是运行最新的活动 LTS 释放。只有当你有特定的理由留在那里时，才选择最低限度。如果你这样做，请记住 Node.js20.19 足以运行您的应用程序，但不能使用 CLI 的生成器。

#### ESM 包装

所有核心 Nest 包现在都作为 ESM 发货。对于大多数现有的应用程序来说，这比几年前的破坏性要小得多，因为现代的 Node.js 版本支持 `require(esm)`。

> info **Hint** 将**您自己的**应用程序迁移到 ESM 完全是可选的，**不是**升级到 v12 的一部分。因为 Nest 的 ESM 可以通过以下方式从 CommonJS 消费包 `require(esm)`CommonJS 应用程序可以升级到 v12，并在 CommonJS 上停留多长时间；`nest upgrade` 故意不管你的模块格式。是否转换是个人喜好问题。如果您决定，本指南的最后两节，[Switching your project to ESM](#switching-your-project-to-esm) 和 [Moving your own code to ESM](#moving-your-own-code-to-esm)，带你穿过它。

实际上，这意味着：

- 许多现有的 CommonJS 应用程序无需完全重写即可继续工作
- 如果自定义引导脚本、构建工具和测试运行程序对仅适用于 CommonJS 的包做出了假设，请审查它们
- 如果维护自定义捆绑程序或运行时配置，请确保它与项目实际使用的模块格式相匹配

对于新项目，CLI 现在允许您在 CommonJS 和 ESM 项目布局。

#### 新项目默认值

`nest new` 现在提示您选择是生成 CommonJS 还是生成 ESM 项目。

- ESM 项目默认使用 Vitest（CommonJS 项目使用 Jest）
- 默认情况下，所有生成的项目都使用 oxlint

这只会改变 CLI 给你的脚手架。现有项目可以保留当前的工具，并按照自己的计划进行迁移。

#### 测试堆栈

Nest 的测试实用程序保持不变。主要更改是生成使用的默认堆栈 ESM 项目以及框架自己的存储库和示例：Vitest 现在是 ESM 工作流程。

如果您的应用程序已经使用了不同的测试运行程序，则不需要立即迁移。`@nestjs/testing` 仍然是测试运行者不可知的。

> warning **Warning** 如果您停留在 Jest 上，请注意，它只能在 Node.jsv24.9 或更高版本上加载 ESM-仅 v12 软件包（旧版本在 `ERR_REQUIRE_ASYNC_MODULE` 下失败）。在 Node.jsv24.9+上运行您的测试套件，或者考虑迁移到 Vitest。`nest upgrade` 将 Jest 推到 v30，并就此发出警告。

当您决定迁移时：

- 更新您的 `test`,`test:watch`,`test:cov`，和 `test:e2e` 脚本
- 检查任何特定于跑步者的全局，并将其替换为 Vitest 需要时的等效物
- 检查您的 `supertest`E2E 测试中的导入 Vitest 安装程序需要默认导入

#### 林廷默认值

新生成的项目默认使用 oxlint。只有当您希望存储库与新存储库匹配时，才需要进行迁移 CLI 脚手架。

#### 路线装饰器方案

Nest 添加了一个新的 `schema` 选项来路由参数装饰器，例如 `@Body()`、`@Query()`、`@Param()` 和 `@RawBody()`。模式元数据是为 [Standard Schema](https://standardschema.dev/) 兼容的库设计的，如 Zod、Valibot 和 ArkType。

例如：

```typescript
@Post()
create(@Body({ schema: createUserSchema }) body: CreateUserDto) {
  return this.usersService.create(body);
}

@Get(':id')
findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {
  return this.usersService.findOne(id);
}
```

装饰器本身只附加模式元数据。要验证它，请注册内置的 `StandardSchemaValidationPipe`：

```typescript
app.useGlobalPipes(new StandardSchemaValidationPipe());
```

这是传统 `ValidationPipe` 加 `class-validator` 流的模式优先替代方案。相同的模式也可以馈送 OpenAPI 生成（参见 [Standard Schema (Zod, Valibot)](/openapi/introduction#standard-schema-zod-valibot)）。

现有的基于装饰器的方法仍然得到完全支持，并且没有计划删除它。这个 `schema` 对于喜欢模式优先库（如 Zod）的团队来说，option 是一个额外的选择。

#### 标准模式序列化

Nest 还介绍了 `StandardSchemaSerializerInterceptor`，它使用相同的标准模式生态系统来验证和转换输出响应。

```typescript
@UseInterceptors(StandardSchemaSerializerInterceptor)
@SerializeOptions({ schema: userResponseSchema })
@Get(':id')
findOne(@Param('id') id: string) {
  return this.usersService.findOne(id);
}
```

当需要模式时使用它，而不是 `class-transformer` 装饰器，以驱动响应塑造。

#### GraphQLIDE 配置

GraphiQL 现在是默认的 GraphQLIDE。如果您需要自定义它，请传递一个 `graphiql` 选项对象，而不是设置 `graphiql: true`。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  graphiql: {
    url: '/graphql',
    headers: {
      authorization: 'Bearer <token>',
    },
    shouldPersistHeaders: true,
    isHeadersEditorEnabled: true,
  },
});
```

这定制了 IDE 保持启用 GraphiQL 时的端点和编辑器行为。

#### GraphQL 订阅传输

最新的 `@nestjs/graphql` 版本移除了对 `subscriptions-transport-ws` 的支持。改为使用 `graphql-ws` 进行 GraphQL 订阅。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
});
```

如果您的应用程序仍然取决于 `subscriptions-transport-ws`，将迁移计划作为您计划一部分 GraphQL 套餐升级。

#### NATSv3

微服务包现在的目标是 NATS v3，其中包括一个破坏性的依赖项更改。如果您使用 NATS 运输，更换旧的 `nats` 包装 `@nats-io/transport-node`:

```bash
$ npm uninstall nats
$ npm install @nats-io/transport-node
```

如果您的应用程序直接导入 NATS 助手，请同时安装 `@nats-io/nats-core` 并更新这些导入。NATSv3 还放弃了 `StringCodec` 和 `JSONCodec` 助手。例如，`headers()` 助手现在来自 `@nats-io/nats-core`：

```typescript
import * as nats from '@nats-io/nats-core';
import { NatsRecordBuilder } from '@nestjs/microservices';

const headers = nats.headers();
headers.set('x-version', '1.0.0');

const record = new NatsRecordBuilder(payload).setHeaders(headers).build();
return this.client.send('record-builder-duplex', record);
```

还要查看任何自定义序列化程序或反序列化程序。Nest 现在将 NATS 数据包序列化为 JSON 字符串，自定义 NATS 反序列化程序接收完整的 NATS 消息对象，而不是原始的 `Uint8Array`。实际上，自定义反序列化程序应该使用 `msg.json()` 读取有效载荷，而不是手动解码字节。

#### 生命周期挂钩排序

生命周期挂钩现在由组件层次结构级别调用。这可以更改钩子的执行顺序，例如 `onModuleInit`,`onApplicationBootstrap` 以及当多个提供程序或模块相互依赖时关闭挂钩。

如果您的应用程序依赖于相关提供者之间的特定钩子顺序，请在升级期间查看该流程，并更新初始化逻辑、拆卸逻辑或测试中的任何假设。

#### `@Optional()` 不再由重新声明的构造函数继承

Nest 现在从声明构造函数的类中读取构造函数参数的可选标记。声明自己构造函数的子类不再继承其父构造函数的标记，因此 Nest 投掷 `UnknownDependenciesException` 其中 v11 解析了这样的参数 `undefined`.

这是故意的：一个真正缺失的依赖项用于解决 `undefined` 默默地。在子类的构造函数中再次声明标记：

```typescript
@Injectable()
class Child extends Base {
  constructor(@Optional() options?: Options) {
    super(options);
  }
}
```

从 NestJSv12.1，没有自己构造函数的子类保留其父构造函数的可选标记，就像 v11 一样。12.0.x 版本在这种情况下也删除了它们。

#### 类验证器和类转换器

现有的基于装饰器的工作流程在 v12 中仍然有效。`ValidationPipe` 和 `ClassSerializerInterceptor` 仍然受到支持，并且仍然非常适合基于类的 DTO 项目。

版本 12 扩展了内置选项，而不是替换现有选项：

- 使用 `ValidationPipe` 当您的 DTO 基于类并依赖于装饰器时
- 使用 `StandardSchemaValidationPipe` 当验证库已经公开了与标准模式兼容的模式时
- 使用 `ClassSerializerInterceptor` 当您的响应塑造基于 `class-transformer`
- 使用 `StandardSchemaSerializerInterceptor` 当您的响应形状应该从模式中派生

#### 配置模块

`@nestjs/config` 从特定于 Joi 的验证移动到 [Standard Schema](https://standardschema.dev/)。`validationSchema` 选项现在接受任何标准模式兼容模式，如 Zod、Valibot 或 ArkType。

```typescript
import { z } from 'zod';

ConfigModule.forRoot({
  validationSchema: z.object({
    NODE_ENV: z
      .enum(['development', 'production', 'test', 'provision'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
  }),
});
```

因为验证不再与单个库绑定，我们现在为新项目推荐使用现代标准模式库，如 Zod，以及 [Configuration chapter](/application/configuration#schema-validation) 已经被改写了。

现有的 Joi 模式仍然有效，但有两个注意事项：

- 您必须升级到 **Joi v18 或更高版本**，它实现了标准架构规范
- 以前直接传递到 `validationOptions` 现在下去 `validationOptions.libraryOptions`

```typescript
// Before
validationOptions: {
  allowUnknown: false,
  abortEarly: true,
},

// After
validationOptions: {
  libraryOptions: {
    allowUnknown: false,
    abortEarly: true,
  },
},
```

对于 Joi 模式，`@nestjs/config` 保持其历史默认值 `allowUnknown: true` 和 `abortEarly: false` 并合并您传递到它们之上的任何内容。

#### 终端模块

在版本 11 中弃用的传统健康指示器 API 已被删除。如果您的自定义健康指示器仍然扩展 `HealthIndicator` 或抛出 `HealthCheckError`，请将它们迁移到 `HealthIndicatorService`。

**以前的做法**

在版本 12 之前，自定义健康指示器可以通过抛出 `HealthCheckError` 来报告不健康状态：

```typescript
@Injectable()
export class DogHealthIndicator extends HealthIndicator {
  constructor(private readonly dogService: DogService) {
    super();
  }

  async isHealthy(key: string) {
    const badboys = await this.dogService.getBadboys();
    const isHealthy = badboys.length === 0;
    const result = this.getStatus(key, isHealthy, { badboys: badboys.length });

    if (!isHealthy) {
      throw new HealthCheckError('Dog check failed', result);
    }

    return result;
  }
}
```

**更新方法（NestJS 终点站 v12)**

在版本 12 中，健康指示器在两种情况下都返回其结果。投掷不再是报告不健康状态的一种方式。指示器要么返回 `up()`/`down()` 显式地，或将操作交给 `attempt()`，将指示器标记为 `'down'` 当操作抛出：

```typescript
@Injectable()
export class DogHealthIndicator {
  constructor(
    private readonly dogService: DogService,
    // Inject the `HealthIndicatorService` provided by the `TerminusModule`
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const badboys = await this.dogService.getBadboys();

    if (badboys.length > 0) {
      // Mark the indicator as "down" and add additional info to the response
      return indicator.down({ badboys: badboys.length });
    }

    // Mark the health indicator as "up"
    return indicator.up();
  }
}
```

如果指示器只需要知道操作是否成功（例如，狗服务是可到达的），`attempt()` 是较短的形式：

```typescript
isHealthy(key: string) {
  return this.healthIndicatorService
    .check(key)
    .attempt(() => this.dogService.ping())
    .withTimeout(1000);
}
```

这个 `timeout` 内置数据库、微服务和 gRPC 指标（例如，`db.pingCheck('database', { timeout: 1500 })`）被弃用。链条 `.withTimeout(1500)` 而是在返回的尝试上。参见 [Terminus chapter](/reliability/terminus#timeouts-and-caching) 详情。

#### Webpack 弃用 CLI 工作流程

v12 版本也标志着从以 webpack 为中心的 CLI 工作流的转变。Rspack 现在是 monorepos 的默认捆绑器，`--webpack`/`--webpackPath`CLI 标志（以及它们在 `nest-cli.json` 中的 `webpack`/`webpackConfigPath` 对应物）被弃用，取而代之的是 `--builder rspack`。如果您的项目生成或构建设置依赖于 webpack，请计划随着时间的推移迁移它。

这个 CLI 还添加 `bun` 作为受支持的包管理器，以及 `decorator` 示意图现在在 `Reflector.createDecorator()` 形式。这个 `angular` 原理图已被删除。

#### 新的 CLI 命令和标志

这个 CLI 增益 a`deploy` 命令转发到 [Mau](https://mau.nestjs.com/)，安装 `@nestjs/mau` 作为首次使用时的开发依赖项：

```bash
$ nest deploy
```

`nest build` 和 `nest start` 还可以选择几个新选项：

- `--rspackPath [path]`：Rspack 配置文件的路径，即不推荐的配置文件 `--webpackPath`
- `--emit-declarations`：使用 SWC 生成器时发出 `.d.ts` 文件（也可在 `nest-cli.json` 中作为 `emitDeclarations` 使用）
- `--no-type-check`：显式禁用 SWC 类型检查
- `--silent`: 抑制信息编译器日志

`nest build` 还支持 `--parallel [concurrency]`，当与 `--all` 结合时，它会并行构建 monorepo 项目。此外，`nest-cli.json` 获得一个 `includeLibraryAssets` 属性，用于将库资产复制到应用程序构建中。

#### 路由冲突诊断

Nest 按声明顺序注册路由。在区分顺序的适配器上，例如 Express，这意味着 `@Get(':id')` 可以默默地影子 `@Get('me')` 之后宣布。v12 增加了两个**选择加入**选项 `NestApplicationOptions` 为了解决这个问题：

```typescript
const app = await NestFactory.create(AppModule, {
  routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
  routeResolutionStrategy: 'specificity',
});
```

两者都默认为前面的行为，因此现有的应用程序不受影响，除非您设置它们。参见 [Controllers chapter](/controllers#route-conflicts-and-resolution-order) 完整的描述。

#### 机器可读错误代码

`HttpExceptionOptions` 接受新的 `errorCode` 财产。它被序列化到响应体中，因此客户端可以在稳定的标识符上分支，而不是解析消息字符串：

```typescript
throw new BadRequestException('Password is too weak', {
  errorCode: 'WEAK_PASSWORD',
});
```

看 [Machine-readable error codes](/exception-filters#machine-readable-error-codes) 在异常过滤器一章中。

#### 结构化日志记录参数

`ConsoleLogger` 现在将消息后传递的普通对象视为附加到同一日志条目的结构化参数，而不是将它们作为单独的记录发出：

```typescript
logger.log('User created', { userId: 1, email: 'foo@bar.com' });
```

在 JSON 模式下，它们嵌套在 `params` 键下，或者如果启用 `flattenParams`，则扩展到根对象中。此行为在 v12 中默认启用；设置 `structuredParams: false` 恢复以前的行为。请参见记录器章节中的 [Structured logging params](/application/logger#structured-logging-params)。

#### 原生可观测性支持

版本 12 通过官方 [`@nestjs/observe`](/observability/overview)SDK 增加了一流的可观测性支持。SDK 不是将通用 Node.jsAPM 代理附加到 HTTP 服务器，而是通过 `instrument` 应用程序选项插入到 Nest 自己的请求生命周期中。因此，会根据控制器、提供程序、解析器和队列使用者报告请求、作业、错误和跟踪。

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [ObserveModule.forRoot({ serviceId: 'cats-app' })],
})
export class AppModule {}
```

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});
```

这里没有什么需要迁移的：这是一个新的选择加入功能。参见 [Observability chapter](/observability/overview) 自动仪表涵盖的内容，以及 [SDK 参考](/observability/sdk) 配置选项。

#### 其他值得注意的版本变化

取决于哪一个 Nest 您使用的软件包，您可能还需要查看以下更改：

- **管道改造签名**经过改进，以增强类型安全性，并且 `ArgumentMetadata` 现在取一个通用参数。带有手写签名的自定义管道可能需要调整其类型。
- **`ValidationPipe` 错误格式**：新 `errorFormat` 选项（`'list'` 或者 `'grouped'`) 控制验证错误响应的形状。
- **gRPC 异常筛选器**：`GrpcExceptionFilter` 加上一系列特定于状态的异常，将错误映射到正确的 gRPC 状态代码，而不是 `UNKNOWN`。参见 [gRPC 篇章](/microservices/grpc#exception-handling)。
- **正则表达式 Kafka 模式**：`@MessagePattern()` 和 `@EventPattern()` 现在接受 Kafka 传输上的 `RegExp`。参见 [Kafka chapter](/microservices/kafka#regular-expression-patterns)。
- **请求范围的 WebSocket 网关**：网关现在支持请求范围的提供程序，套接字可通过 `REQUEST` 令牌注入。参见 [Gateways chapter](/websockets/gateways#request-scoped-gateways)。
- **WebSocket 断开原因**：`handleDisconnect` 现在可以接收断开连接的原因。
- **微服务预请求钩子**：在调用消息处理程序之前运行新钩子。
- **Express 优雅关闭**：Express 适配器现在在关机时耗尽飞行中的请求。
- **HTTP 适配器错误映射**已在整个内核中重新处理，Express，和 Fastify 适配器。

如果您依赖于这些领域之一，请在升级后用您的测试套件验证相应的行为。

#### 将项目切换到 ESM

> warning **Optional** 这一部分和下一部分**不是**升级到 v12 的一部分，这就是为什么它们排在最后。CommonJS 应用程序在 v12 上运行时保持不变：`nest upgrade` 不涉及您的模块格式，并且框架中没有任何内容需要您切换。仅当您*想要*将项目移动到 ESM 任何适合你的时间表。

切换本身发生在 `package.json`，而不是 `tsconfig.json`。添加设置为 `module` 的 `type` 字段：

```json
{
  "name": "my-app",
  "type": "module"
}
```

该字段告诉 Node.js（以及通过 `"module": "nodenext"`，TypeScript）将您的 `.js` 输出视为 ESM。

你是否也需要改变 `tsconfig.json` 取决于您的项目有多老：

- **使用最近的 v11 生成的项目 CLI** (`@nestjs/schematics` 11.0.6 或更高版本）已使用 `"module": "nodenext"` 和 `"moduleResolution": "nodenext"`.什么都没有 `tsconfig.json` 需要改变；添加 `"type": "module"` 够了。
- **使用较早版本**（v10 或早期 v11）生成的项目通常仍有 `"module": "commonjs"` 且没有 `moduleResolution` 条目。在添加 `"type": "module"` 之前更新两者：

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "target": "ES2023"
  }
}
```

作为参考，这是完整的 `compilerOptions` 设置由 ESM 投影 `nest new` 生成：

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "types": ["vitest/globals", "node"]
  }
}
```

> info **Hint** `nest-cli.json` 和 `tsconfig.build.json` 在共同点和 ESM 项目变体，所以都不需要改变。这个 `types` 上面的条目不同之处仅在于 ESM 项目默认为 Vitest;CommonJS 项目 Jest 使用 `["node", "jest"]` 反而。

> warning **Warning** `"module": "nodenext"` 从最近的 `package.json` 导出每个文件的模块格式。因此，添加 `"type": "module"` 会更改项目中**每个**`.ts` 文件的发送方式，并且 TypeScript 开始报告下述丢失的导入扩展名。期望在同一个过程中修复它们，而不是逐步修复。

#### 将您自己的代码移动到 ESM

配置到位后，您自己的代码中最需要注意的两件事是相对导入和仅 CommonJS 的全局。

相对导入必须带有文件扩展名：

```typescript
// Before
import { AppModule } from './app.module';

// After
import { AppModule } from './app.module.js';
```

扩展是 `.js` 即使源文件是 `.ts`，因为说明符引用发出的文件。

`__dirname` 和 `__filename` 在 ESM 中不存在。改用 `import.meta.dirname`（或在旧版本 Node.js 上使用 `import.meta.url` 和 `fileURLToPath`）：

```typescript
// Before
protoPath: join(__dirname, 'hero/hero.proto'),

// After
protoPath: join(import.meta.dirname, 'hero/hero.proto'),
```

同样，`require()` 也不可用。如果您需要它进行互操作，请使用 `createRequire(import.meta.url)` 从 `node:module` 显式创建它。

> info **Hint** 这些文档中的许多代码示例使用了上面的 ESM 约定。如果您的项目仍然是 CommonJS，请删除 `.js` 扩展，保留 `__dirname`，并调用 `bootstrap()` 而不使用 `await`。
