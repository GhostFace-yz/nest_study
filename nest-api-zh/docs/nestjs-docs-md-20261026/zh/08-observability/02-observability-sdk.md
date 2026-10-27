# SDK

Source: https://docs.nestjs.com/observability/sdk

这个 `@nestjs/observe`SDK 是将应用程序的请求、作业、错误、日志和跟踪输入到您的 [NestJS Observe](https://www.observe.nestjs.com/) 仪表板。它钩住了 Nest 自己的请求生命周期——控制器、拦截器、解析器、队列使用者——而不是连接一个通用的 Node.js 代理到过程中，因此仪表板中显示的大部分内容不需要手动跨度布线。

> info **Hint** 不确定是否值得设置？这个 [现场演示](https://www.observe-demo.nestjs.com/dashboard) 显示该仪器在不安装任何东西的情况下产生的结果——跟踪、瀑布、错误和繁忙服务中的作业。

#### 安装

有两种方法可以设置 SDK：一个命令可以为您执行此操作，或者手动执行相同的步骤。

**使用一个命令。**在项目目录中运行以下内容：

```bash
$ npx @nestjs/observe link
```

该命令打印一个八个字母的代码。输入到 [observe.nestjs.com/link](https://www.observe.nestjs.com/link)，如果您没有帐户，请先注册，并批准。然后，该命令将项目的密钥对写入 `.env` 作为 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`, git 忽略 `.env`，并添加 `--env-file .env` 运行的每个脚本 `nest start`(`start`,`start:dev`，和 `start:debug` 在一个 `nest new` 项目）。

如果应用程序不使用 SDK 但是，该命令还安装 `@nestjs/observe` 使用您的包管理器，并从 [Quick start](#quick-start) 下面给你。在你批准之前它会告诉你。看 [Linking from the terminal](#linking-from-the-terminal) 到底发生了什么变化。

> warning **Warning** SDK 需要 `@nestjs/core`v11.1.4 或更高版本（它依赖于该版本中引入的 `instrument` 应用程序选项），如果您的应用程序使用 GraphQL，则需要 `@nestjs/graphql`v13.4.4 或更高版本。早期版本缺少 SDK 需要的钩子。

**手动安装 SDK：

```bash
$ npm i @nestjs/observe
```

然后从 [Quick start](#quick-start) 下面，生成一个 API 项目的**键 API 键**页（参见 [First project](/observability/overview#first-project)），并将密钥对设置为 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`.这也是命令将布线留给您的任何地方的方式。

#### 快速启动

集成需要三个步骤。首先，打电话 `createObserveModule()` 一次，通常在 `app.module.ts` 或者另一个根级文件。它返回一个匹配的对-aNest 模块和一个 `instrument` 钩子绑定到相同的配置：

```typescript
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY!,
      appSecret: process.env.OBSERVE_APP_SECRET!,
      serviceId: 'cats-app',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

第二，进口 `ObserveModule.forRoot()` 使用至少一个 `serviceId`（如上所示）。第三，通过 `ObserveInstrument` 二 `NestFactory.create()` 所以 SDK 在应用程序开始处理流量之前附加到应用程序：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

> warning **Fastify** 和 `FastifyAdapter` （或任何显式适配器），适配器接受第二个参数，因此应用程序选项-因此 `instrument` - 移动到**第三**：
>
> ``` 打字脚本
> const app=等待 NestFactory.create<NestFastify 应用>(
> 应用模块，
> 新的 FastifyAdapter(),
> {仪器：观察仪器}，
> );
> ```
>
> 将 options 对象作为第二个参数传递到适配器旁边会静默地删除它们，并且 SDK 从不附着。

这就完成了集成。一旦应用程序接收到流量，请求、错误和跟踪就会立即出现在项目的仪表板中，无需配置导出器，也无需设计模式。相同 `instrument` 选项由 `NestFactory.createMicroservice()` 和 `NestFactory.createApplicationContext()` 因此，工作程序和独立应用程序以相同的方式进行工具化。

> info **Hint** `createObserveModule()` 本身接受一个 options 对象，该对象控制如何生成跟踪 ID、如何捕获错误源上下文以及哪些提供程序被检测——参见下面的 [Trace correlation](#trace-correlation) 和 [Error source context](#error-source-context)。其他一切都是通过 `ObserveModule.forRoot()` 配置的。

#### 配置模块

除了快速启动中的凭据之外，这些选项还决定了如何 SDK 标识您的应用程序，它将记录的内容发送到哪里，以及它告诉您多少关于它自己的信息。

##### 验证和识别应用程序

```typescript
ObserveModule.forRoot({
  appKey: process.env.OBSERVE_APP_KEY!,
  appSecret: process.env.OBSERVE_APP_SECRET!,
  serviceId: 'cats-app',
  serviceVersion: process.env.GIT_SHA,
});
```

| 选择 | 类型 | 默认的 | 描述 |
| ---------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appKey` | `string` | 所需 | 由 `npx @nestjs/observe link` 写入 `.env` 为 `OBSERVE_APP_KEY`，或从项目的**APIKeys**页面生成-参见 [First project](/observability/overview#first-project)。让它不受源头控制。 |
| `appSecret` | `string` | 所需 | 以相同的方式与 `appKey` 一起发布，写作 `OBSERVE_APP_SECRET`。让它不受源头控制。 |
| `serviceId` | `string` | 所需 | 在仪表板中识别此应用程序。如果运行同一服务的多个实例，请使用每个实例唯一的值（主机名、容器 id）在探查器中区分它们。 |
| `serviceVersion` | `string` | - | 标识部署——语义版本、提交散列或任何其他标识符。每个请求和作业都记录了为它提供服务的版本，这是**发布**视图的动力。 |

`serviceVersion` 是可选的，但强烈推荐。它允许仪表板将应用程序的每个版本与其之前的版本进行比较（错误率、延迟和吞吐量并排），因此部署引入的回归可以立即看到，而不是埋在长达一周的图表中。

<figure><img src="https://www.observe.nestjs.com/docs/sdk/deployments.webp" alt="Releases" /></figure>

##### 从终端链接

`npx @nestjs/observe link` 在开发人员的机器上放置一个密钥对，而不从浏览器中复制一个秘密，并在尚未使用它的应用程序中设置 SDK。在项目的目录（带有 `package.json` 的目录）中运行它，或者用 `--cwd <dir>` 指向它：

1. 它打印一个八个字母的代码，例如 `BCDF-GHJK`，并打开 [observe.nestjs.com/link](https://www.observe.nestjs.com/link) 在您的浏览器中。和 `--no-browser`, 在 CI，或者没有终端，它只打印地址。代码将在 15 分钟后过期。如果应用程序不使用 SDK 然而，该命令还在代码下方说，一旦您批准，它将安装并接线。
2. 在该页上键入代码。如果你还没有账号，你先注册；如果您退出，您就登录。无论哪种方式，您稍后都会回到代码。
3. 检查请求：页面显示机器的主机名和命令发送的包名。然后选择钥匙放在哪里。该页面建议您的最新项目，并在其中以您的包命名的应用程序，或者如果还没有新的应用程序，则建议一个新的应用程序。您可以更改两者，包括更改到新项目。
4. 批准。仪表板发出新的 API 该应用程序的键，命令将其写入项目。

在每个项目中，该命令最多更改三个文件：

- **`.env`** 收据 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`，单引号，替换早期的一对，并保留每一行原样。一个新的 `.env` 创建为只能由您可读。引用是故意的：密钥或秘密可以包含 `$` 和 `&`，其中 `dotenv-expand`（或 `ConfigModule` 和 `expandVariables`) 将重写，此时从文件源的 shell 将停止。
- **`.gitignore`** 获取 `.env` 条目，除非该文件已被忽略（就像在 `nest new` 生成的项目中一样）。
- **`package.json`**：命令以 `nest start` 得到 `--env-file .env`: `start`, `start:dev`，和 `start:debug` 在由 `nest new` 以及 monorepo 的每个应用程序脚本。已经传递 env 文件的脚本将被单独保留，同样 `start:prod` (`node dist/main`). A `start` 或者 `start:dev` 以其他方式启动应用程序的脚本也被单独留下，但命令会命名它，因此您可以加载 `.env` 你自己（例如，用 `node --env-file=.env`).

在不使用 SDK 尚未（没有源文件导入 `@nestjs/observe`)，该命令还设置 SDK 向上，这边 `nest new` 确实：

- **这 SDK**安装在命令自己的版本上（`@nestjs/observe@^0.3.16` 从 0.3.16 开始）。该命令使用项目的锁文件所属的包管理器（pnpm、Yarn、Bun 或 npm），查找存储库的根，以便工作区中的包找到根的锁文件。如果没有锁文件，它将使用命名为 `packageManager` 领域 `package.json`，否则为 npm。安 `@nestjs/observe` 它已经安装，但比命令旧，以同样的方式升级。在这种情况下，运行 `npx @nestjs/observe@latest link`,因为平原 `npx` 运行项目中安装的版本。
- **根模块**，即 `main.ts` 传递到 `NestFactory.create()`（通过跟踪其导入找到），接收 `createObserveModule()` 调用，并将 `ObserveModule.forRoot()` 作为其 `imports` 的第一个条目。选项从 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 中读取键对，并将 `serviceId` 设置为您批准的应用程序的名称，小写，空格变成破折号，删除任何其他标点符号（`Cats API` 变成 `cats-api`）。
- **`main.ts`**通行证 `instrument: ObserveInstrument` 二 `NestFactory.create()`，在其 options 对象中，或者如果没有新的 options 参数，则作为新的 options 参数。

编辑遵循每个文件的引号、分号和缩进，两个文件要么改变，要么都不改变。该命令列出了它们，因此您可以使用 `git diff` 查看它们。

在某些项目中，该命令将布线留给您，并打印出原因；这个 [Quick start](#quick-start) 显示要进行的编辑。它在具有多个应用程序（密钥属于其中一个）的工作区中执行此操作 JavaScript 项目，以及它不能安全编辑代码的任何地方，例如当 `main.ts` 通过路径别名而不是相对路径导入根模块 `imports` 不是一个普通数组，或者当一个 `instrument` 选项已传递。如果安装失败，该命令会打印安装命令供您自己运行，并将布线留给您。

在请求代码之前，该命令会拒绝它必须安装的项目 SDK 但是没有 `@nestjs/core`，或者运行一个 NestJS 版本大于 11。

在密钥到达之前不会写入任何内容，因此被拒绝、过期或中断的链接会使项目保持不变。

> warning **Warning** 仅批准您自己启动的代码，并且仅当它与您的终端匹配时。代码是键入的，而不是携带在 URL 这样就没有人可以向您发送批准他们密钥的链接。

密钥出现在项目的**上 APIKeys** 页面与其他页面一样，名为 `CLI` 其次是发行时间，一年后到期；再次运行该命令以创建一个新命令。`.env` 停留在运行该命令的计算机上，以便每个队友（或每个附加计算机）运行 `npx @nestjs/observe link` 以及为同一应用程序获取自己的密钥。

##### 从环境中读取密钥对

何时 `appKey` 或者 `appSecret` 未设置或为空，或仍持有占位符 `nest new` 生成（`'YOUR_APP_KEY'` 和 `'YOUR_APP_SECRET'`), `ObserveModule` 阅读 `OBSERVE_APP_KEY` 或者 `OBSERVE_APP_SECRET` 而是来自环境。这使得使用 Observe 报告生成的项目在链接后无需对其进行任何更改 `AppModule`.您传递给自己的值总是获胜，同样的回退也适用于以下选项： `forRootAsync()` 解决。

解析选项时读取变量（对于 `forRoot()`，当 `AppModule` 文件已导入），因此它们必须已经在 `process.env` 在那个时候。这个 `--env-file` 在任何模块运行之前标记它们。

在生产中，设置 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 在环境（平台的机密或环境设置）中，而不是运输 `.env`.由 `nest new` 运行 `node dist/main` 为了 `start:prod`，不加载 `.env` 不管怎样，还有 `nest start` 跳到 `--env-file` 那是不存在的，所以一个新的克隆体或者一个 CI 运行没有 `.env` 还在开始。从项目的**中给生产一个自己的密钥 API Keys**页面，因此撤销开发密钥永远不会阻止它报告。

> info **Hint** 这个 `link` 命令和环境回退要求 `@nestjs/observe`0.3.15 或更高版本。安装和布线 SDK 进入尚未使用它的应用程序需要 0.3.16 或更高版本。

##### 异步配置

当凭据来自配置提供程序而不是直接来自 `process.env` 时，使用 `forRootAsync()`。它接受与所有其他 Nest 动态模块相同的 `useFactory`/`inject`、`useClass` 和 `useExisting` 形状（一个类使用 `createObserveOptions()` 方法实现 `ObserveOptionsFactory`），加上 `extraProviders` 和 `global`：

```typescript
ObserveModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    appKey: config.getOrThrow('OBSERVE_APP_KEY'),
    appSecret: config.getOrThrow('OBSERVE_APP_SECRET'),
    serviceId: config.get('SERVICE_ID', 'cats-app'),
    serviceVersion: config.get('GIT_SHA'),
  }),
});
```

##### 收集器端点

```typescript
ObserveModule.forRoot({
  // ...
  endpoint: 'https://observe-api.nestjs.com',
});
```

`endpoint`（默认 `'https://observe-api.nestjs.com'`) 是基数 URL 收藏家的。遥测和配置文件共享它，因此两者永远无法指向不同的位置。若要在不接触配置的情况下重写它，请设置 `OBSERVE_ENDPOINT` 环境变量。NestJSObserve 是一个托管服务，`observe-api.nestjs.com` 是它运行的唯一收集器；当您的流量必须通过转发代理离开时，或者将测试环境指向接受批处理的存根时，请更改端点。

##### 调试 SDK 本身

```typescript
ObserveModule.forRoot({
  // ...
  debug: true,
});
```

`debug`（默认 `false`) 记录来自 SDK 到控制台。在仪器工作时使用它，并在生产中关闭它。

#### 自动仪表

这一部分的所有内容都是记录的，没有任何你自己的代码；安装 SDK 够了。这些选项只能缩小范围或关闭它。

##### 数据库查询和出站 HTTP

自从 `@nestjs/observe`0.3.0，数据库查询和出站请求显示为没有配置的跨度，嵌套在创建它们的方法下。缓慢的存储库调用显示它正在等待的_which_语句。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/sql.webp" alt="A query opened in the waterfall" /></figure>

数据库是在驱动程序处而不是 ORM:`pg`,`mysql2` 和 `mongodb` 如果您的应用程序已经依赖于它们，则会检测到它们，这包括 TypeORM,微型蠕虫,Drizzle、猫鼬、Knex、Sequelize 和 Prisma 的驱动程序适配器，但没有命名其中任何一个。也可以处理发送自己的驱动程序嵌套副本的 ORM（MikroORM 和 Mongoose，每当版本不一致时）。驱动程序自己的内务（连接握手、身份验证、ping）不会被记录。查询跨度用其动词和表（`SELECT users`) 并携带**删除每个文字**的语句——字符串、数字，`IN (...)` 在跨度离开进程之前，列表和注释会被替换，并且绑定的参数根本不会被读取。一个父节点下的重复查询折叠到一个计数节点中，因此 N+1 读取为 `SELECT order_items ×47` 而不是 47 排。

出境 HTTP 是从 Node 自己的诊断渠道，所以 `fetch`,`undici` 以及建立在 `node:http`（axios，got，大多数 SDK）没有任何修补。跨度已标记 `GET api.example.com` 并携带 URL 隐藏了敏感的查询参数。这个 SDK 还将当前跟踪 id 发送为 `x-request-id`，这使得 [HTTP-to-HTTP tracing](/observability/distributed-tracing#http-to-http) 自动的。

```typescript
ObserveModule.forRoot({
  // ...
  outgoing: {
    database: true,
    http: {
      ignore: (url) => url.startsWith('https://internal-metrics.'),
      // Only forward the trace id to your own services
      propagateTraceId: (url) => url.includes('.svc.cluster.local'),
    },
  },
});
```

设置 `outgoing: false` 把它全部关掉，或者 `database: false`/`http: false` 个别地。

> info **Hint** 这些跨度是**未计费**。它们是您已经发送的方法跨度的详细信息，因此它们不计入您的可观察性事件或您的速率上限。运行十个查询的请求的成本与以前相同。

##### WebSocket 网关

在任何平台适配器上，由 `@SubscribeMessage()` 处理的消息都会报告为具有 `ws` 协议和操作 id 为 `GatewayClass:pattern` 的请求。`ws` 选项块采用与其他传输相同的 `ignore`、`tags`、`setAttributes` 和 `getUserId` 挂钩；每个人都收到 `{ gateway, pattern, client, data }`。连接和断开不是操作，不会报告。

##### 尾巴

`@nestjs/bullmq` 和原始的 `@nestjs/bull` 都是工具化的：每个处理器运行都被报告为一个作业，包括它的队列等待、尝试次数和结果。从跟踪操作内部添加的作业继承该操作的跟踪 id-参见 [Distributed tracing](/observability/distributed-tracing#queue-jobs-bullmq-and-bull)。

##### 运行时度量和分析

```typescript
ObserveModule.forRoot({
  // ...
  runtimeMetrics: true,
  runtimeMetricsInterval: 60000,
});
```

`runtimeMetrics`（默认 `true`) 存储器样本，CPU、垃圾收集和间隔内的事件循环延迟（`runtimeMetricsInterval`, 默认 `60000`ms) 并馈送**Profiler**。相同的样本是应用程序的心跳：当它们停止到达时，**遥测静音**警报会触发，这使您无需外部探头即可轻量级正常运行时间监控。

#### 错误和失败的请求

会自动捕获逃逸控制器、解析器或作业的错误。这些选项决定了随之而来的内容：失败帧周围的源代码，以及失败请求的头和正文。

##### 错误源上下文

会自动捕获从控制器、解析器、作业或跨度传播的错误。何时 `sourceContext` 启用（默认值），SDK 还会读取捕获错误的每个应用内堆栈帧周围的源代码行，并附加它们。这使得仪表板可以在堆栈跟踪旁边显示失败代码，即使是您尚未签出的版本上的生产失败。

```typescript
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  sourceContext: {
    linesOfContext: 5,
    maxFrames: 5,
    sourceMaps: false,
  },
});
```

这是 `createObserveModule()` 的选项，而不是 `forRoot()`。设置 `sourceContext: false` 以禁用它，或者传递一个对象来调整默认值：

| 选择 | 类型 | 默认的 | 描述 |
| ---------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linesOfContext` | `number` | `5` | 在帧的线的两侧读取的线。 |
| `maxFrames` | `number` | `5` | 从堆栈顶部开始计算，有多少个应用内帧附加了源。限制深堆栈上的有效载荷。 |
| `sourceMaps` | `boolean` | `false` | 在读取源之前，通过源映射解析编译的帧。仅当进程运行编译输出_without_Node 自己的源映射支持（`--enable-source-maps` 或 `process.setSourceMapsEnabled(true)`）时才需要；有了这个，帧已经携带了原始位置，这是多余的。第一次触摸时每个编译文件的地图解析成本，之后缓存。 |

> warning **Warning** 启用此功能会将应用程序源代码的片段（通常是错误周围的几行）发送到您的仪表板，并将它们存储在错误旁边。内部框架 `node_modules` 和 Node 从不读取内部文件，只读应用程序源。如果您的代码库不接受发送任何源代码，请将其关闭。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

##### 捕获失败和缓慢的请求

当 HTTP 请求**失败**时，SDK 会在其旁边记录一个小的、固定的允许列表——`user-agent`、`content-type`、`content-length`、`accept`、`host`、`origin` 和 `referer`。这些都不能认证或识别呼叫者。如果设置 `slowerThanMs`，运行至少那么长时间的请求都会以相同的方式捕获，无论是否失败。一个普通的请求什么都不记录。默认情况下，请求主体为**关闭**；如果需要，请显式打开它们：

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    capture: {
      headers: ['user-agent', 'x-tenant-id'],
      body: { maxBytes: 4096 }, // default 2048, at most 16384
      slowerThanMs: 2000,
    },
  },
});
```

捕获的一切都会通过 [`redaction`](/observability/sdk#logs) 在它离开进程之前：敏感键（`password`,`token`,`authorization`, ...) 被主体内部的名称掩盖，并命名敏感的头记录 `[REDACTED]` 而不是它的价值。`capture: false` 什么都没记录。捕获在请求的详细信息页面上显示为**请求**卡片。

#### 日志和轨迹相关性

每次执行都会得到一个跟踪 id。这些选项决定了您的日志行与它的关系：转发到仪表板，或者只标记 id，以便您自己的日志堆栈可以链接到跟踪。

##### 日志

```typescript
ObserveModule.forRoot({
  // ...
  forwardLogs: true,
  redaction: {
    enabled: true,
    keys: ['internalToken'],
    patterns: [/acct_[a-z0-9]{16}/gi],
  },
});
```

`forwardLogs`（默认 `false`）发送应用程序的日志行（任何写入的内容 Nest 的 `Logger`) 到仪表板，与每行写入时活动的跟踪相关联。在执行页面上，每一行都放在跟踪的时钟上，紧挨着编写时正在飞行的跨度。日志转发在 Pro 及以上版本上可用。

转发日志会将它们移动到您无法控制的基础架构上，因此默认情况下会启用编辑功能。同样的编辑还会擦除每个捕获的错误和任何捕获的请求数据的消息和堆栈，无论是否 `forwardLogs` 正在开启：

| `redaction` 领域 | 类型 | 默认的 | 描述 |
| -------------------- | ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled` | `boolean` | `true` | 是否有任何东西被擦洗过。 |
| `useDefaultPatterns` | `boolean` | `true` | 应用内置模式：承载令牌、JWT， AWS 密钥 ID， PEM 私钥， `key=value` 秘密和卢恩有效的卡号。仅当您用自己的批发替换它们时禁用 `patterns`;不支持未经编辑的转发日志。 |
| `patterns` | `RegExp[]` | - | 要屏蔽的额外模式，用于以只有您的代码库知道的方式形成的秘密（内部令牌前缀、客户标识符）。总是像全局一样应用，因此匹配永远不会局限于一行中的第一次出现。 |
| `keys` | `string[]` | - | 其值被完全屏蔽的额外键（在日志属性、捕获的标头和正文中，以及 URL 查询字符串），位于内置列表的顶部。比较不区分大小写和忽略 `-`/`_`,所以 `apiKey`,`api_key`，和 `API-KEY` 是一个条目。 |
| `replacement` | `string` | `'[REDACTED]'` | 替换任何匹配内容的文本。 |

> info **Hint** 即使有 `forwardLogs` 关闭， SDK 增加 `ConsoleLogger` 因此，在跟踪执行中写入的每一行都携带其跟踪 id（`attachTraceIdToLogs`,见 [Trace correlation](#trace-correlation)).这允许您将自己的日志聚合器与仪表板中的跟踪相关联，而无需将日志内容传输到任何地方。

##### 迹线相关性

这些也是 `createObserveModule()` 的选项。它们决定了请求获取跟踪 id 的方式以及该 id 在您自己的日志中的显示方式：

```typescript
import { randomUUID } from 'node:crypto';

export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdKey: 'traceId',
  traceIdGenerator: (req: any) => req.headers['x-request-id'] ?? randomUUID(),
  attachTraceIdToLogs: true,
});
```

| 选择 | 类型 | 默认的 | 描述 |
| --------------------- | -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `traceIdKey` | `string` | `'traceId'` | 用于在请求上下文中存储跟踪 id 的键，以便稍后通过 `TracerService` 检索。 |
| `traceIdGenerator` | `(req: unknown) => string` | 采用一种成型良好的 `x-request-id`(HTTP 标题，或 TCP/Redis 数据包元数据）如果存在，否则 aUUIDv7 | 生成每个请求的跟踪 id。用 HTTP 的请求对象调用；对于其他协议，它接收传输上下文。 |
| `attachTraceIdToLogs` | `boolean` | `true` | 增加 `ConsoleLogger` 以在日志消息中包含跟踪 id，因此即使没有 `forwardLogs`，日志也可以与跟踪相关联。在默认的文本格式中，id 在消息（` Trace ID: <id>`）之后结束行；对于 [JSON 伐木作业](/application/logger#json-logging)，它是一个 `traceId` 字段。在跟踪执行之外写入的行保持不变。 |

因为默认生成器采用传入 `x-request-id` 一连串的 HTTP 服务已经共享一个跟踪，无需额外配置。这同样适用于 TCP 和 Redis 微服务传输 `@nestjs/microservices` 12.0.4 或更高版本。传播 gRPC、其他微服务传输，以及 GraphQL 需要几行 - 参见 [Distributed tracing](/observability/distributed-tracing).

#### 塑造记录的内容

这些选项丰富了 SDK 记录（请求是给谁的，它涉及什么），并保留你不需要的。

##### 将用户与遥测相关联

`getUserId` 读取传入的请求，并返回系统用于人员的任何标识符：用户 id、帐户 id 或租户范围 id。设置一次，**用户**视图将自动填充：

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    getUserId: (req) => req.user?.id ?? 'anonymous',
  },
});
```

相同的选项存在于 `rpc`（接收传输 id 和 `BaseRpcContext`),`grpc`（接收呼叫对象），`graphql`（接收 GraphQL 上下文，对于没有封装的操作 HTTP 请求），以及 `ws`（接收网关消息），每个都读取传输自己的上下文，而不是 HTTP 请求。报告用户标识符是可选的：除了每个用户的视图之外，没有用户标识符的流量仍然会显示在任何地方。仪表板将标识符视为不透明的字符串，从不试图将其解析为姓名或电子邮件，因此更喜欢不透明的内部 id，而不是任何个人身份识别。

##### 标记和自定义属性

`http`,`rpc`,`grpc`,`graphql`，和 `jobs` 每个都接受相同的两个选项，将您自己的数据附加到它们涵盖的每个请求：

| 选择 | 适用 | 描述 |
| --------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tags` | 相同的静态 `Record<string, string>` 每个请求 | 对于每次调用不变的常量，例如 `project`、`env`、`region`。 |
| `setAttributes` | 请求/调用/作业的函数，返回键值对 | 对于每次调用不同的任何内容，例如特征标志、租户 id、队列名称。 |

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    tags: { project: 'cats-app', env: process.env.NODE_ENV ?? 'development' },
    setAttributes: (req) => ({
      'user-agent': req.headers['user-agent'],
      'client-ip': req.ip,
    }),
  },
  jobs: {
    setAttributes: (job) => ({ queueName: job.queueName, jobName: job.name }),
  },
});
```

两者都以标记的形式出现在生成的请求、作业或跨度上，并且可以在其详细信息页面上搜索和可见。该函数接收传输的任何内容：`http` 的请求、`rpc` 的传输 id 和 `BaseRpcContext`、`grpc` 的调用对象、`graphql` 的解析信息和 GraphQL 上下文，以及 `jobs` 的 `{ queueName, name, id }`。要从代码中标记单个跨度，而不是每个请求，请使用 `TracerService`（参见 [Manual instrumentation](/observability/manual-instrumentation)）。

> info **Hint** GraphQL 服务器通常是 HTTP 端点，因此它的请求已经受到 `http` 选项的约束：`http.ignore` 在 GraphQL 层看到请求之前放弃请求，`http.getUserId` 向用户提供通过 HTTP 进行查询。`graphql` 块调谐每个操作而不是每个解析器允许通过的请求中发生的事情，并且 `graphql.getUserId` 仅对尚未在 HTTP 跟踪中的操作进行咨询，例如通过 WebSocket 进行订阅。

##### 忽略噪声操作

每个入站传输块（`http`,`rpc`,`grpc`,`graphql`，和 `ws`) 有 `ignore` 完全跳过用于匹配调用的仪器的选项，例如运行状况检查端点、内部探头或任何其他不值得跟踪的内容：

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    ignore: ['/health', { method: 'GET', path: /^\/internal\// }],
  },
  rpc: {
    ignore: (transportId, ctx) =>
      ctx instanceof TcpContext && ctx.getPattern() === 'ping',
  },
  grpc: {
    ignore: (call) => call.path.endsWith('/Health/Check'),
  },
  graphql: {
    ignore: (info) => info.fieldName === 'healthcheck',
  },
});
```

`http.ignore` 接受路径数组，`{ method, path }` 对（`path` 可以是字符串或 `RegExp`），和普通 `RegExp`s 或请求上的单个谓词函数。`rpc.ignore`,`grpc.ignore`，和 `graphql.ignore` 是传输自身上下文的谓词（`@nestjs/microservices` 运输 id 和 `BaseRpcContext`，这个 gRPC 调用对象，以及 GraphQL 分别解析信息）。匹配一个 GraphQL 字段名跳过字段引导的整个操作，而不仅仅是该字段：操作是端到端测量的，因此它要么被跟踪，要么不被跟踪。

`ignore` 完全阻止遥测生成。仪表板的支出控制下降过滤器是一个不同的工具：它们在摄入时丢弃已经生成的事件，以减少计费量。使用 `ignore` 当您不希望跟踪存在时，当您想要调整数据成本时，请删除过滤器 SDK 已经在生产了。

`http` 另外需要 `queryParamsObfuscateRegex`, 一个 `RegExp` 这将在发送敏感的查询字符串值之前屏蔽它们。它应用在内置编辑的顶部，内置编辑总是屏蔽众所周知的敏感参数（`token`,`password`,`code`,`signature`，等等）。

##### 痕量取样和配料

```typescript
ObserveModule.forRoot({
  // ...
  tracesSampleRate: 0.25,
  maxTracesPerBatch: 1000,
  flushInterval: 5000,
});
```

| 选择 | 类型 | 默认的 | 描述 |
| ------------------- | -------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `tracesSampleRate` | ` 编号 \ | （协议：'http' \ | 'rpc' \ | 'grpc' \ | “图形 QL” \ | 'ws'，属性）=>布尔值）` | `1.0` | 发送的跟踪分数，或每个跟踪决策的谓词。`1.0` 发送一切；`0.1` 送 10%。 |
| `maxTracesPerBatch` | `number` | `1000` | 在高流量应用程序上限制每批输出的跟踪数量。 |
| `flushInterval` | `number`（毫秒） | `5000` | 多久 SDK 批量并发送收集到的跟踪。 |

遥测在进程中被缓冲，并在刷新间隔发送，而不是与每个请求内联。这里的采样决定了 SDK_生产_。仪表板的每个项目支出控制（跨度采样、速率上限、下降过滤器）作用于它已经发送的内容，您可以在不重新部署的情况下更改它们。

#### 完整配置参考

所有选项一目了然。`createObserveModule()` 下列出的选项必须设置在那里；其他的都去 `forRoot()`/`forRootAsync()`。

| 哪里 | 选择 | 目的 |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `createObserveModule()` | `sourceContext` | 将源线附加到错误堆栈帧 |
| `createObserveModule()` | `traceIdKey` | 上下文键跟踪 id 存储在 |
| `createObserveModule()` | `traceIdGenerator` | 每个请求如何获取其跟踪 id |
| `createObserveModule()` | `attachTraceIdToLogs` | 将跟踪 id 添加到 `ConsoleLogger` 产量 |
| `createObserveModule()` | `skipInstrumentation` | 将提供程序实例排除在检测之外的谓词 |
| `forRoot()` | `appKey`,`appSecret` | 项目 API 密钥对（或 `OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET`） |
| `forRoot()` | `endpoint` | 收集器底座 URL（或 `OBSERVE_ENDPOINT`） |
| `forRoot()` | `serviceId`,`serviceVersion` | 应用和发布标识 |
| `forRoot()` | `http`,`rpc`,`grpc`,`graphql` | 每次运输 `tags`,`setAttributes`,`getUserId`,`ignore` |
| `forRoot()` | `jobs` | `tags` 和 `setAttributes` 对于队列和计划作业 |
| `forRoot()` | `http.queryParamsObfuscateRegex` | 屏蔽敏感查询字符串值 |
| `forRoot()` | `http.capture` | 为失败和缓慢的请求记录的标头（以及可选的正文） |
| `forRoot()` | `outgoing` | 数据库查询和出站 HTTP 跨度 |
| `forRoot()` | `ws` | WebSocket 网关 `tags`,`setAttributes`,`getUserId`,`ignore` |
| `forRoot()` | `runtimeMetrics`,`runtimeMetricsInterval` | 剖析器样本和心跳 |
| `forRoot()` | `forwardLogs`,`redaction` | 日志流和擦除 |
| `forRoot()` | `tracesSampleRate` | 要发送的跟踪分数（或谓词） |
| `forRoot()` | `maxTracesPerBatch`,`flushInterval` | 配料 |
| `forRoot()` | `spanCollapse` | 折叠重复的同级跨度（默认阈值 `20`，保持最慢 `3`） |
| `forRoot()` | `debug` | SDK 诊断 |

#### 下一步去哪里

- [Manual instrumentation](/observability/manual-instrumentation)-添加您自己的跨度、捕获处理错误、附加请求范围内的属性以及报告自定义指标。
- [Distributed tracing](/observability/distributed-tracing)-在 HTTP、gRPC、微服务传输和 GraphQL 中保持一个跟踪。
- [Dashboard](/observability/dashboard)-一旦出现什么 SDK 正在运行，以及视图之间的关系。
