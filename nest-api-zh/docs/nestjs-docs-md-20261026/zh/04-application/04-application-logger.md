# Logging

Source: https://docs.nestjs.com/application/logger

Nest 带有一个内置的记录器，用于应用程序引导期间和其他几种情况，如显示捕获的异常（即系统日志记录）。此功能由 `Logger` 班级 `@nestjs/common` 包装。您可以完全控制日志记录系统的行为，包括以下任意一项：

- 完全禁用日志记录
- 指定详细程度（例如，显示错误、警告、调试信息等）
- 配置日志消息的格式（raw，JSON 着色等）
- 覆盖默认记录器中的时间戳（例如，使用 ISO8601 标准为日期格式）
- 完全覆盖默认记录器
- 通过扩展默认记录器来自定义它
- 使用依赖注入简化应用程序的编写和测试

您还可以使用内置的记录器，或者创建自己的自定义实现，来记录自己的应用程序级事件和消息。

内置记录器不仅是开发的便利。结合 [JSON 产量](#json-logging),[结构化日志记录参数](#structured-logging-params) 和跟踪 id[NestJS Observe](#correlating-logs-with-requests) 附加到请求期间写入的每一行，它涵盖了大多数生产应用程序对记录器的需求：stdout 上的每一行一条机器可读记录、可查询字段、日志级别，以及将每一行绑定回写入它的请求的方法。容器平台和日志聚合器（CloudWatch、Cloud Logging、Datadog、Loki、Elasticsearch 等）按原样接收该输出，在您的应用程序中没有额外的依赖性。这个 [Logging in production](#logging-in-production) 下面的部分显示了完整的设置。

当您需要内置记录器故意省略的东西时，可以使用专用库，如 [Pino](https://github.com/pinojs/pino) 或 [Winston](https://github.com/winstonjs/winston)：从进程内部写入文件或其他传输、字段编辑或非常繁重的服务上的最后一位吞吐量。见 [Use external logger](#use-external-logger)。

#### 基本定制

若要禁用日志记录，请设置 `logger` 财产至 `false` 在（可选）Nest 应用程序选项对象，作为第二个参数传递给 `NestFactory.create()` 方法。

```typescript
const app = await NestFactory.create(AppModule, {
  logger: false,
});
await app.listen(process.env.PORT ?? 3000);
```

若要启用特定的日志级别，请设置 `logger` 属性到指定要显示的日志级别的字符串数组，如下所示：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn'],
});
await app.listen(process.env.PORT ?? 3000);
```

数组中的值可以是 `'log'`、`'fatal'`、`'error'`、`'warn'`、`'debug'` 和 `'verbose'` 的任意组合。

> info **Hint** 日志级别从数组中最严重的级别级联：至少与该级别一样严重的每个级别也被启用。`['log']` 因此也启用 `'warn'`、`'error'` 和 `'fatal'`。仅在列出时启用不太严重的级别，因此 `['debug', 'error']` 启用 `'debug'`、`'error'` 和 `'fatal'`，但不启用 `'log'` 或 `'warn'`。

要启用一个级别以及比它更严格的所有功能，请使用 `filterLogLevels()` 而不是手动列出级别。它需要一个字符串，这使得它非常适合环境变量：

```typescript
import { filterLogLevels } from '@nestjs/common';

const app = await NestFactory.create(AppModule, {
  logger: filterLogLevels(process.env.LOG_LEVEL ?? '>=warn'), // ['warn', 'error', 'fatal']
});
```

除了 `'>=warn'`，它接受 `'>warn'`（比 `warn` 仅），逗号分隔的列表，例如 `'log,error'`，或单个级别。空或未识别的字符串返回所有级别，之后返回未知级别 `>` 或者 `>=` 投掷。

要在创建应用程序后更改级别（例如，加载配置后），请将级别数组传递到 `app.useLogger()`。Nest 将其交给当前记录器的 `setLogLevels()` 方法：

```typescript
app.useLogger(['error', 'warn']);
```

若要禁用彩色输出，请传递 `ConsoleLogger` 实例 `colors` 属性设置为 `false` 作为 `logger` 属性：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    colors: false,
  }),
});
```

默认情况下，颜色也会关闭 `NO_COLOR` 环境变量被设置为任何非空值。

要为每个日志消息配置前缀，请传递 `ConsoleLogger` 实例 `prefix` 属性集：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    prefix: 'MyApp', // Default is "Nest"
  }),
});
```

下表列出了所有可用选项：

| 选择 | 描述 | 默认的 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `logLevels` | 启用日志级别。 | `['log', 'fatal', 'error', 'warn', 'debug', 'verbose']` |
| `timestamp` | 如果启用，将打印当前和以前的日志消息之间的时间戳（时间差）。注意：在以下情况下不使用此选项 `json` 已启用。 | `false` |
| `prefix` | 用于每个日志消息的前缀。注意：在以下情况下不使用此选项 `json` 已启用。 | `Nest` |
| `json` | 如果启用，将在 JSON 格式。 | `false` |
| `colors` | 如果启用，将以彩色打印日志消息。 | `true`(`false` 如果 `json` 已启用或 `NO_COLOR` 已设置） |
| `context` | 记录器的上下文。 | `undefined` |
| `forceConsole` | 如果启用，将使用 `console.log`/`console.error` 而不是 `process.stdout.write`/`process.stderr.write`。在缓冲区控制台调用的测试环境（如 Jest）中非常有用。 | `false` |
| `compact` | 如果启用，将在单行中打印日志消息，即使它是具有多个属性的对象。如果设置为数字，只要所有属性都适合 breakLength，最多 n 个内部元素就会合并在一条线上。短数组元素也被分组在一起。 | `false`(`true` 如果 `json` 已启用） |
| `maxArrayLength` | 指定格式化时要包含的 Array、TypedArray、Map、Set、WeakMap 和 WeakSet 元素的最大数量。设置为 null 或 Infinity 以显示所有元素。设置为 0 或负值以显示无元素。忽略时 `json` 启用，禁用颜色，并且 `compact` 设置为 true，因为它生成一个可解析的 JSON 产量。 | `100` |
| `maxStringLength` | 指定格式化时要包含的最大字符数。设置为 null 或 Infinity 以显示所有元素。设置为 0 或负值以不显示字符。忽略时 `json` 启用，禁用颜色，并且 `compact` 设置为 true，因为它生成一个可解析的 JSON 产量。 | `10000` |
| `sorted` | 如果启用，将在格式化对象时对键进行排序。也可以是自定义排序功能。忽略时 `json` 启用，禁用颜色，并且 `compact` 设置为 true，因为它生成一个可解析的 JSON 产量。 | `false` |
| `depth` | 指定格式化对象时要递归的次数。这对于检查大型物体很有用。要递归到最大调用堆栈大小，请传递无穷大或空。忽略时 `json` 启用，禁用颜色，并且 `compact` 设置为 true，因为它生成一个可解析的 JSON 产量。 | `5` |
| `showHidden` | 如果为真，对象的不可枚举符号和属性将包含在格式化结果中。还包括 WeakMap 和 WeakSet 条目以及用户定义的原型属性 | `false` |
| `breakLength` | 输入值在多行上分割的长度。设置为无穷大以将输入格式化为单行（结合设置为 true 的“紧凑”）。忽略时 `json` 启用，禁用颜色，并且 `compact` 设置为 true，因为它生成一个可解析的 JSON 产量。 | `Infinity` 当 `compact` 被启用时，或者当颜色关闭并且 `compact` 没有显式 `false` 时；`80` 否则 |

#### JSON 伐木作业

JSON 日志记录对于应用程序的可观察性以及与日志管理系统的集成至关重要。要启用它，请创建一个 `ConsoleLogger` 实例及其 `json` 属性设置为 `true`，并将其作为 `logger` 创建应用程序实例时的属性：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    json: true,
  }),
});
```

此配置以结构化 JSON 格式，这使得它更容易与日志聚合器和云平台等外部系统集成。比如**这样的平台 AWSECS**（弹性容器服务）本机支持 JSON 日志，启用以下功能：

- **日志筛选**：根据日志级别、时间戳或自定义元数据等字段缩小日志范围。
- **搜索和分析**：使用查询工具分析和跟踪应用程序行为的趋势。

如果您正在使用 [NestJS Mau](https://mau.nestjs.com),JSON 日志记录还允许您以组织良好、结构化的格式查看日志，这对于调试和性能监视尤其有用。

> info **Note** 何时 `json` 设置为 `true`，这个 `ConsoleLogger` 默认值 `colors` 二 `false` 和 `compact` 二 `true` 使用这两个值，每个条目都序列化为 `JSON.stringify()`，因此输出有效 JSON，没有格式化工件。对于开发，可以显式设置 `colors` 二 `true` （或 `compact` 二 `false`).然后使用 Node's `util.inspect()`，这在本地调试期间更容易读取，但不再严格 JSON.

何时 JSON 日志记录已启用，日志输出如下所示（在一行上）：

```json
{
  "level": "log",
  "pid": 19096,
  "timestamp": 1607370779834,
  "message": "Starting Nest application...",
  "context": "NestFactory"
}
```

每个条目都有以下字段：

- `level`：日志级别。
- `pid`：进程 id。
- `timestamp`：写入条目的时间，以毫秒为单位，自 Unix 时代以来。这个 `timestamp` 和 `prefix` 选项，以及 [自定义时间戳格式](#extend-built-in-logger)，仅适用于文本输出。
- `message`：传递给记录器的消息。
- `context`：记录器上下文，如果有的话。
- `stack`：传递到的堆栈跟踪 `error()`，当有一个。
- `params`：[结构化日志记录参数](#structured-logging-params)，当任何通过时。

与文本模式一样，`error` 条目写入 stderr，所有其他级别写入 stdout。

#### 结构化日志记录参数

日志消息通常需要携带元数据：用户 id、请求持续时间、相关性 id。从 NestJSv12，在**第一个消息参数之后**传递的纯对象被视为结构化参数，并附加到同一个日志条目，而不是作为单独的日志记录发出。

```typescript
const logger = new Logger('UserService');
logger.log('User created', { userId: 1, email: 'foo@bar.com' });
```

在文本模式下，参数内联附加到相同的格式行：

```plaintext
[Nest] 3785  - 02/26/2026, 10:04:41 AM     LOG [UserService] User created { userId: 1, email: 'foo@bar.com' }
```

当传递几个普通对象时，它们会合并到一组参数中：

```typescript
logger.log('Request handled', { method: 'GET' }, { path: '/api', duration: 42 });
```

```plaintext
[Nest] 3785  - 02/26/2026, 10:04:41 AM     LOG [UserService] Request handled { method: 'GET', path: '/api', duration: 42 }
```

在 JSON 模式，参数嵌套在 `params` 默认密钥：

```json
{
  "level": "log",
  "pid": 3785,
  "timestamp": 1772089691769,
  "message": "User created",
  "context": "UserService",
  "params": { "userId": 1, "email": "foo@bar.com" }
}
```

要将它们扩展到 JSON 对象的根目录（某些日志聚合器更喜欢这样），请启用 `flattenParams`：

```typescript
new ConsoleLogger({ json: true, flattenParams: true });
```

```json
{
  "level": "log",
  "pid": 3785,
  "timestamp": 1772089691769,
  "message": "User created",
  "context": "UserService",
  "userId": 1,
  "email": "foo@bar.com"
}
```

相关 `ConsoleLogger` 选项有：

| 选择 | 描述 | 默认的 |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------- |
| `structuredParams` | 如果启用，消息后记录的普通对象将附加到与参数相同的条目。 | `true` |
| `flattenParams` | 如果启用，参数将传播到 JSON 记录而不是嵌套在 `params`.记录已使用其键的参数（例如 `message` 或者 `level`）被丢弃。 JSON 仅模式；要求 `structuredParams`. | `false` |

> info **Hint** 只有**普通对象**被视为参数。数组、字符串、数字、类实例和 `null` 仍然被记录为单独的消息（作为*last*参数传递的字符串仍然被视为上下文），作为*first*参数传递的普通对象仍然被视为消息本身。设置 `structuredParams: false` 恢复 v12 之前的行为。

#### 登录生产

放在一起，JSON 输出参数和结构化参数仅从内置记录器提供生产级日志：

```typescript
// main.ts
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    json: true,
    logLevels: ['log', 'warn', 'error', 'fatal'],
  }),
});
```

```typescript
// orders.service.ts
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  async capture(order: Order) {
    // ...
    this.logger.log('Payment captured', { orderId: order.id, amount: order.total });
  }
}
```

和 [NestJS Observe](#correlating-logs-with-requests) 安装后，请求期间写入的每一行也携带该请求的跟踪 id，而不会更改单个日志调用：

```json
{"level":"log","pid":66803,"timestamp":1789978166281,"message":"Payment captured","context":"OrdersService","params":{"orderId":"ord_8f2a","amount":4200},"traceId":"0199a3f2-7c1e-7b40-9d2a-5e8f1c3b7a64"}
```

单行可按级别和上下文过滤，可按以下方式查询 `orderId`，并且可以连接到来自同一请求的每一个其他行，这是大多数团队安装第三方记录器要做的工作。像这样将日志写入 stdout，让平台（Docker,Kubernetes,ECS、云运行等）收集并发货。这样可以避免应用程序流程中的轮换、缓冲和交付。

> info **Hint** 如果您的聚合器仅索引顶级字段，则设置 `flattenParams: true`，因此 `orderId` 将成为根级字段，而不是 `params.orderId`。

#### 使用记录器进行应用程序日志记录

您可以将上述几种技术结合起来，以便在两者中提供一致的行为和格式 Nest 系统日志和您自己的应用程序事件/消息日志。

一个好的做法是实例化 `Logger` 类来自 `@nestjs/common` 在您的每个服务中，提供服务名称作为 `context` 的论点 `Logger` 构造函数：

```typescript
import { Logger, Injectable } from '@nestjs/common';

@Injectable()
class MyService {
  private readonly logger = new Logger(MyService.name);

  doSomething() {
    this.logger.log('Doing something...');
  }
}
```

在默认的记录器实现中，`context` 打印在方括号中，如 `NestFactory` 在下面的示例中：

```bash
[Nest] 19096  - 12/08/2019, 7:12:59 AM     LOG [NestFactory] Starting Nest application...
```

如果一条消息的构建成本很高，请传递一个返回它的函数。在默认文本格式中，内置 `ConsoleLogger` 仅在启用级别时才调用函数，因此禁用 `debug` 行不需要任何费用：

```typescript
this.logger.debug(() => `Cache state: ${JSON.stringify(this.cache.dump())}`);
```

如果您通过 `app.useLogger()` 提供自定义记录器，Nest 将在内部使用它，通过 `Logger` 实例进行的调用将委托给它。您的代码保持与实现无关，您可以通过调用 `app.useLogger()` 将默认记录器替换为自己的记录器。

例如，如果您按照下面<a href="application/logger#dependency-injection">dependency injection</a>部分中的步骤操作，并调用 `app.useLogger(app.get(MyLogger))`，后续调用至 `this.logger.log()` 来自 `MyService` 导致调用 `log()` 方法 `MyLogger` 实例。

这适用于大多数情况。如果您需要更多的自定义（如添加和调用自定义方法），请参阅<a href="application/logger#injecting-a-custom-logger">注入自定义记录器</a>部分。

#### 带有时间戳的日志

若要为每个记录的消息打印时间戳差异，请传递可选的 `timestamp: true` 创建记录器实例时的设置：

```typescript
import { Logger, Injectable } from '@nestjs/common';

@Injectable()
class MyService {
  private readonly logger = new Logger(MyService.name, { timestamp: true });

  doSomething() {
    this.logger.log('Doing something with timestamp here ->');
  }
}
```

这将产生以下格式的输出：

```bash
[Nest] 19096  - 04/19/2024, 7:12:59 AM     LOG [MyService] Doing something with timestamp here -> +5ms
```

注意 `+5ms` 在队伍的尽头。这是自从任何人写上一行以来经过的时间 `ConsoleLogger` 在这个过程中，不仅仅是这个记录器。

#### 定制实施

您可以为 Nest 通过设置用于系统日志记录 `logger` 对象的属性，该对象满足 `LoggerService` 接口。例如，你可以告诉 Nest 使用全局 JavaScript`console` 对象（实现 `LoggerService` 接口），如下所示：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: console,
});
await app.listen(process.env.PORT ?? 3000);
```

要实现您自己的自定义记录器，请实现 `LoggerService` 接口，如下所示：

```typescript
import { LoggerService, LogLevel, Injectable } from '@nestjs/common';

@Injectable()
export class MyLogger implements LoggerService {
  /**
   * Write a 'log' level log.
   */
  log(message: any, ...optionalParams: any[]) {}

  /**
   * Write a 'fatal' level log.
   */
  fatal(message: any, ...optionalParams: any[]) {}

  /**
   * Write an 'error' level log.
   */
  error(message: any, ...optionalParams: any[]) {}

  /**
   * Write a 'warn' level log.
   */
  warn(message: any, ...optionalParams: any[]) {}

  /**
   * Write a 'debug' level log.
   */
  debug?(message: any, ...optionalParams: any[]) {}

  /**
   * Write a 'verbose' level log.
   */
  verbose?(message: any, ...optionalParams: any[]) {}

  /**
   * Set the enabled log levels. Called by `app.useLogger()`
   * when it's given an array of levels.
   */
  setLogLevels?(levels: LogLevel[]) {}
}
```

然后，您可以提供 `MyLogger` 通过 `logger` 财产 Nest 应用程序选项对象：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new MyLogger(),
});
await app.listen(process.env.PORT ?? 3000);
```

这种技术虽然简单，但不对 `MyLogger` 类使用依赖注入。这可能会带来挑战，特别是对于测试而言，并限制了 `MyLogger` 的可重用性。有关更好的解决方案，请参阅下面的<a href="application/logger#dependency-injection">dependency injection</a>部分。

#### 扩展内置记录器

与其从头开始编写一个记录器，不如通过扩展内置的 `ConsoleLogger` 类并覆盖默认实现的选定行为：

```typescript
import { ConsoleLogger } from '@nestjs/common';

export class MyLogger extends ConsoleLogger {
  error(message: any, stack?: string, context?: string) {
    // add your tailored logic here
    super.error(...arguments);
  }
}
```

相同的方法会改变时间戳格式。例如，要打印 ISO8601 时间戳代替区域设置格式的日期，覆盖受保护的日期 `getTimestamp()` 方法：

```typescript
import { ConsoleLogger } from '@nestjs/common';

export class IsoTimestampLogger extends ConsoleLogger {
  protected getTimestamp() {
    return new Date().toISOString();
  }
}
```

```bash
[Nest] 19096  - 2026-09-28T06:46:17.869Z     LOG [NestFactory] Starting Nest application...
```

这仅适用于文本输出。和 [JSON 伐木作业](#json-logging)，这个 `timestamp` 自 Unix 时代以来，字段一直是毫秒。

您可以在功能模块中使用这种扩展记录器，如上文<a href="application/logger#using-the-logger-for-application-logging">使用记录器进行应用程序日志记录</a>一节中所述。

你可以看出来 Nest 若要使用扩展记录器进行系统日志记录，请将扩展记录器的实例通过 `logger`application options 对象的属性（如上文 <a href="application/logger#custom-implementation">自定义实现</a> 部分所示），或使用下文 <a href="application/logger#dependency-injection">依赖注入</a> 部分所示的技术。如果您这样做，请致电 `super`，如上面的示例代码所示，将日志方法调用委托给父（内置）类，以便 Nest 可以依赖它期望的内置功能。

#### 依赖注入

对于更高级的日志记录功能，请利用依赖注入。例如，您可能希望注入 `ConfigService` 到您的记录器中进行自定义，然后将您的自定义记录器注入到其他控制器和/或提供程序中。若要为自定义记录器启用依赖注入，请创建一个实现 `LoggerService` 并将该类注册为模块中的提供者。例如，您可以：

1. 定义一个 `MyLogger` 类扩展了内置 `ConsoleLogger` 或者完全覆盖它，如前面几节所示。务必实施 `LoggerService` 接口。
2. 创建一个 `LoggerModule` 如下所示，并提供 `MyLogger` 从那个模块。

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}
```

有了这种结构，您的自定义记录器可用于任何其他模块。因为您的 `MyLogger` 类是模块的一部分，它可以使用依赖注入（例如，注入 `ConfigService`）。Nest 还需要一个步骤来使用这个自定义记录器进行系统日志记录（例如，用于引导和错误处理）。

因为应用程序实例化（`NestFactory.create()`) 发生在任何模块的上下文之外，它不参与初始化的正常依赖注入阶段。因此，您必须确保至少有一个应用程序模块导入 `LoggerModule`，触发 Nest 实例化 `MyLogger` 班级。

然后您可以指示 Nest 使用相同的单例实例 `MyLogger` 具有以下结构：

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(MyLogger));
await app.listen(process.env.PORT ?? 3000);
```

> info **Note** 在上面的示例中， `bufferLogs` 设置为 `true` 以便所有日志都保存在缓冲区中，直到自定义日志记录器（`MyLogger` 在这种情况下）是附加的。和 `autoFlushLogs` 已启用（默认值）， Nest 自行刷新缓冲区： HTTP 应用程序（或微服务）在开始侦听时刷新它 `app.listen()` 和一个独立的 [应用上下文](/standalone-applications) 打电话时刷新 `app.useLogger()`.如果初始化失败， Nest 马上冲洗。何时 Nest 无法创建提供程序（例如，因为它的工厂抛出），它会回落到原来的 `ConsoleLogger` 打印缓冲区和错误。当生命周期挂钩时，例如 `onModuleInit()` 拒绝， Nest 通过附加的记录器（如果还没有附加，则通过原始记录器）打印缓冲区，但不记录错误：启动初始化的调用，例如 `app.listen()`，用它拒绝。设置 `autoFlushLogs` 二 `false` 自己冲洗缓冲区 `app.flushLogs()` （或静态 `Logger.flush()`).

这里，`NestApplication` 实例的 `get()` 方法检索 `MyLogger` 的单例实例。这种技术本质上是一种“注入”记录器实例供 Nest 使用的方法。`app.get()` 调用依赖于首先通过模块导入实例化的实例，如上所述。

你也可以注射这个 `MyLogger` 提供程序到您的功能类中，确保两个功能类中的日志记录行为一致 Nest 系统日志和应用程序日志。有关详细信息，请参阅下面的<a href="application/logger#using-the-logger-for-application-logging">使用记录器进行应用程序日志记录</a>和<a href="application/logger#injecting-a-custom-logger">注入自定义记录器</a>。

> warning **Warning** 如果提供者工厂或生命周期挂钩调用 `process.exit()` 本身（例如，在失败的连接检查之后），或者启动步骤从未解决（例如，不断重试的连接），缓冲区中不会打印任何内容，即使您使用 `Ctrl+C`.而是抛出一个错误，使得初始化失败，并且 Nest 刷新缓冲区。

当启动日志必须始终可见时，即使进程退出或停止，也不要缓冲它们：传递一个记录器实例作为 `logger` 选择 `NestFactory.create()`，如所示 [Custom implementation](#custom-implementation)，这样 Nest 记录完每一行后，立即将其交给它。该实例是在依赖注入系统外部创建的，因此它不能注入提供程序，例如 `ConfigService`.

#### 注入自定义记录器

首先，使用如下代码扩展内置记录器。这个 `scope` 选项，作为配置元数据提供 `ConsoleLogger` 子类，指定 [短暂的](/fundamentals/injection-scopes) 作用域，以便每个使用者都能获得自己的记录器实例。这一点很重要，因为每个模块通过以下方式在其记录器上设置唯一的上下文 `setContext()`— 对于单例，该调用将覆盖整个应用程序的上下文。在本例中，我们不扩展个体 `ConsoleLogger` 方法（如 `log()`,`warn()` 等），尽管您可以选择这样做。

```typescript
import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class MyLogger extends ConsoleLogger {
  customLog() {
    this.log('Please feed the cat!');
  }
}
```

接下来，创建 `LoggerModule` 有了这样的结构：

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}
```

下一步，导入 `LoggerModule` 进入您的功能模块。因为 `MyLogger` 扩展 `ConsoleLogger`，你可以用它 `setContext()` 方法并开始使用上下文感知自定义记录器，如下所示：

```typescript
import { Injectable } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  constructor(private myLogger: MyLogger) {
    // Due to transient scope, CatsService has its own unique instance of MyLogger,
    // so setting context here will not affect other instances in other services
    this.myLogger.setContext('CatsService');
  }

  findAll(): Cat[] {
    // You can call all the default methods
    this.myLogger.warn('About to return cats!');
    // And your custom methods
    this.myLogger.customLog();
    return this.cats;
  }
}
```

`MyLogger` 继承其余部分 `ConsoleLogger`API 也：`resetContext()` 恢复传递给构造函数的上下文，以及 `isLevelEnabled('debug')` 告诉您当前是否启用某个级别，以便您可以跳过为将被丢弃的行准备数据。

最后，指示 Nest 要在您的 `main.ts` 文件，如下所示。此示例不自定义记录器行为（通过重写 `ConsoleLogger` 方法如 `log()`,`warn()` 等），所以这里不严格需要这一步。如果您向这些方法添加自定义逻辑并希望 Nest 使用相同的实现。

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(new MyLogger());
await app.listen(process.env.PORT ?? 3000);
```

> info **Hint** 或者，代替设置 `bufferLogs` 二 `true`，您可以使用 `logger: false` 选择。请注意，如果您通过 `logger: false` 二 `NestFactory.create()`，在您调用之前不会记录任何内容 `useLogger()`，因此您可能会错过重要的初始化错误。如果您不介意使用默认记录器记录一些初始消息，请省略 `logger: false` 选择。

#### 将日志与请求相关联

集中日志解决的是存储，而不是调查。一旦每个实例都发送到同一个地方，困难的部分就变成了从数千个交织行中重建一个*单个*请求。这就是为什么这么多的生产调试实际上是发明一个相关 id，在每个日志调用中穿过它，并希望路径上没有任何东西忘记传递它。

[NestJS Observe](https://www.observe.nestjs.com/) 删除了记账。打开 `forwardLogs` 每一行都被写下来 Nest 的 `Logger` 捕获了已附加的跟踪：

```typescript
ObserveModule.forRoot({
  serviceId: 'orders-api',
  forwardLogs: true,
});
```

你一直打电话 `this.logger.log()` 用一个 `orderId` 参数和以前一模一样：不需要生成相关 id，不需要穿过服务层的上下文对象。在执行页面上，该请求的日志被放置在跟踪自己的时钟上，每一行都位于编写时正在飞行的跨度旁边，因此“重试警告是在超时之前发出的，而不是之后发出的”是您可以看到的，而不是从三个日志流的时间戳中推断出来的。

结构化日志参数也会继续执行，因此 `orderId` 保留一个可查询的字段，而不是被展平成消息文本。日志行本身也是可警报的，例如：“告诉我何时 `payment declined`15 分钟内出现 10 次以上”。

如果您希望将日志内容保留在自己的聚合器中，则不必转发任何内容。即使有 `forwardLogs` 关闭，SDK 增加 `ConsoleLogger` 因此，在请求期间写入的每一行都以默认格式在行尾携带该请求的跟踪 id：（` Trace ID: <id>`，在消息之后），并且作为 `traceId` 字段 [JSON 伐木作业](#json-logging) 启用：

```json
{"level":"log","pid":66803,"timestamp":1789978166281,"message":"Payment captured","context":"OrdersService","traceId":"0199a3f2-7c1e-7b40-9d2a-5e8f1c3b7a64"}
```

该 id 足以从现有堆栈中的一行跳转到仪表板中的完整跟踪。默认情况下，它是打开的，由 `attachTraceIdToLogs` 选项控制（参见 [Trace correlation](/observability/sdk#trace-correlation)）。在请求外部写入的行（例如，在引导期间）保持原样。该扩展仅适用于 Nest 的内置 `ConsoleLogger`，因此如果您用 [外部记录器](#use-external-logger) 替换它，请自己用 `TracerService.currentTraceId()` 读取 id。有关转发及其编辑设置，请参见 [SDK 参考](/observability/sdk#logs)。

跟踪 id 并不是唯一在请求长度内有效的东西。SDK 为每个请求、作业和消息 it 工具保留一个 `AsyncLocalStorage` 存储，`TracerService` 通过 `setAttribute()` 和 `getAttribute()` 公开它。这是请求所针对的用户或租户的自然位置，可以从下游的任何地方读取，而无需通过每个调用。请参阅 [Request-scoped attributes](/observability/manual-instrumentation#request-scoped-attributes) 和 [Async local storage](/recipes/async-local-storage) 食谱，了解它与您自己建立的商店的比较。

#### 使用外部记录器

作为 [Logging in production](#logging-in-production) 如图所示，内置记录器已经涵盖了大多数应用程序的结构化、集中式日志记录。有些需求仍然需要专用库，例如 [Pino](https://github.com/pinojs/pino) 或者 [Winston](https://github.com/winstonjs/winston)：多个进程内传输（文件、系统日志、HTTP)、敏感字段的编辑、自定义序列化程序或以非常高的卷记录服务的最低可能开销。与任何标准一样 Node.js 应用程序，您可以充分利用这些模块 Nest：实施 `LoggerService` 中所述的接口 [Custom implementation](#custom-implementation)，或使用社区集成。
