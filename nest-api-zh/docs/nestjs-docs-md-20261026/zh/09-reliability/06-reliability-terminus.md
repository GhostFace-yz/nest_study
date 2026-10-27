# Health checks

Source: https://docs.nestjs.com/reliability/terminus

终端集成提供**就绪/活跃**健康检查。健康检查在复杂的后端设置中至关重要。在 web 开发中，健康检查通常由一个专用地址组成，例如 `https://my-website.com/health/readiness`。
基础架构的服务或组件（例如，[Kubernetes](https://kubernetes.io/)）会持续检查此地址。根据从 `GET` 请求返回到该地址的 HTTP 状态代码，服务在收到“不健康”响应时采取行动。
因为“健康”或“不健康”的定义因您提供的服务类型而异，所以**Terminus**集成提供了一组**健康指标**。

例如，如果您的 web 服务器使用 MongoDB 来存储其数据，那么 MongoDB 是否仍在运行是至关重要的信息。
在这种情况下，您可以使用 `MongooseHealthIndicator`。配置完成后（如下所述），您的健康检查地址将返回
健康或不健康的 HTTP 状态代码，取决于 MongoDB 是否正在运行。

#### 入门

开始 `@nestjs/terminus`，安装所需的依赖项：

```bash
$ npm install --save @nestjs/terminus
```

#### 设置健康检查

健康检查代表**健康指标**的总结。健康指示器检查服务是处于健康状态还是不健康状态。如果所有指定的健康指标都已启动并运行，则健康检查为阳性。因为很多应用需要相似的健康指标，[`@nestjs/terminus`](https://github.com/nestjs/terminus) 提供一组预定义的指标：

- `HttpHealthIndicator`
- `TypeOrmHealthIndicator`
- `MongooseHealthIndicator`
- `SequelizeHealthIndicator`
- `MikroOrmHealthIndicator`
- `PrismaHealthIndicator`
- `MicroserviceHealthIndicator`
- `GRPCHealthIndicator`
- `MemoryHealthIndicator`
- `DiskHealthIndicator`

要开始我们的第一次健康检查，让我们创建 `HealthModule` 并添加 `TerminusModule` 对其 `imports` 阵列。

> info **Hint** 要使用 [Nest CLI](/cli/overview)，运行 `$ nest g module health` 命令。

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

@Module({
  imports: [TerminusModule]
})
export class HealthModule {}
```

健康检查由 [控制者](/controllers) 执行，您可以使用 [Nest CLI](/cli/overview) 生成。

```bash
$ nest g controller health
```

> info **Hint** 我们强烈建议在您的应用程序中启用关机挂钩。启用后，终端集成使用此生命周期事件来报告 `'shutting_down'` 状态并应用 [优雅关机超时](#graceful-shutdown-timeout)。在 [应用程序关闭](/fundamentals/lifecycle-events#application-shutdown) 部分了解更多信息。

#### HTTP 健康检查

安装后 `@nestjs/terminus`，导入 `TerminusModule`，并创建了一个新的控制器，就可以创建运行状况检查了。

这个 `HttpHealthIndicator` 需要 `@nestjs/axios` 包，因此请确保已安装：

```bash
$ npm i --save @nestjs/axios axios
```

现在设置 `HealthController`：

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HttpHealthIndicator, HealthCheck } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.http.pingCheck('nestjs-docs', 'https://docs.nestjs.com'),
    ]);
  }
}
```

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

健康检查现在会发送一个 `GET` 请求 `https://docs.nestjs.com` 地址。如果
该地址返回一个健康响应，路由在 `http://localhost:3000/health` 回报
以下对象具有 `200` 状态代码：

```json
{
  "status": "ok",
  "info": {
    "nestjs-docs": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "nestjs-docs": {
      "status": "up"
    }
  }
}
```

`@nestjs/terminus` 包将此响应对象的类型导出为 `HealthCheckResult`。

| | | |
|-----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------|
| `status` | 如果任何健康指标失败，则状态为 `'error'`。如果没有指示器失败，但至少有一个指示器是 `'degraded'`，则状态为 `'degraded'`。如果 Nest 应用程序正在关闭，但仍接受 HTTP 请求，则状态为 `'shutting_down'`。 | “错误” \ | '好的' \ | “降级”\ | '关闭_关闭' |
| `info` | 对象，包含有关每个健康指标的信息，其状态为 `'up'` 或者 `'degraded'` 换句话说，“仍在服役”。 | `object` |
| `error` | 对象，包含有关每个健康指标的信息，其状态为 `'down'` 换句话说，“不健康”。 | `object` |
| `details` | 对象包含有关每个健康指标的信息。 | `object` |

##### 检查具体 HTTP 响应代码

在某些情况下，您可能需要检查特定的标准并验证响应。例如，假设
`https://my-external-service.com` 返回一个 `204` 响应代码。和 `HttpHealthIndicator.responseCheck()`，你可以
专门检查该响应代码，并将所有其他代码视为不健康。

在下面的示例中，除 `204` 之外的任何响应代码都是不健康的。第三个参数是一个函数（同步或异步）
这返回一个布尔值，指示响应是健康的（`true`）还是不健康的（`false`）。

```typescript
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () =>
      this.http.responseCheck(
        'my-external-service',
        'https://my-external-service.com',
        (res) => res.status === 204,
      ),
  ]);
}
```

#### TypeOrm 健康指示器

Terminus 允许您将数据库检查添加到您的健康检查中。在使用此健康指示器之前，请阅读
[数据库](/data/typeorm) 章节，并确保您的应用程序的数据库连接已建立。

> info **Hint** 在后台，`TypeOrmHealthIndicator` 执行 `SELECT 1`SQL 命令，该命令通常用于验证数据库是否仍然活跃。对于 Oracle 数据库，它使用 `SELECT 1 FROM DUAL`，对于 SAP HANA、`SELECT now() FROM dummy`。

```typescript
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database').withTimeout(1000),
    ]);
  }
}
```

如果数据库是可访问的，`GET` 请求 `http://localhost:3000/health` 返回以下内容 JSON 结果：

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up",
      "responseTime": 12
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up",
      "responseTime": 12
    }
  }
}
```

如果应用程序使用 [多个数据库](/data/typeorm#multiple-databases)，则注入每个
数据源到您的 `HealthController`。然后，使用 `connection` 选项将数据源引用传递给 `TypeOrmHealthIndicator`。

```typescript
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    @InjectDataSource('albumsConnection')
    private albumsConnection: DataSource,
    @InjectDataSource()
    private defaultConnection: DataSource,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('albums-database', { connection: this.albumsConnection }).withTimeout(1000),
      () => this.db.pingCheck('database', { connection: this.defaultConnection }).withTimeout(1000),
    ]);
  }
}
```

#### 磁盘健康指示器

`DiskHealthIndicator` 检查正在使用的存储量。要开始，请注入 `DiskHealthIndicator`
进入你的 `HealthController`。以下示例检查路径 `/` 使用的存储（在 Windows 上，使用 `C:\\`）。
如果使用了超过 50%的总存储空间，则健康检查报告为不健康状态。

```typescript
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly disk: DiskHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.5 }),
    ]);
  }
}
```

这个 `DiskHealthIndicator.checkStorage()` 方法还可以检查固定的空间量。
如果路径使用的存储，下面的示例是不健康的 `/` 超过 250GB。

```typescript
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.disk.checkStorage('storage', {  path: '/', threshold: 250 * 1024 * 1024 * 1024, })
  ]);
}
```

#### 记忆健康指示器

使用 `MemoryHealthIndicator` 以确保您的进程不超过一定的内存限制。
下面的示例检查流程的堆。

> info **Hint** 堆是动态分配的内存所在的内存部分。`checkHeap()` 比较 `heapUsed` 报告值 `process.memoryUsage()`（当前使用的 V8 堆内存）相对于给定的字节阈值。

```typescript
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
    ]);
  }
}
```

您也可以使用 `MemoryHealthIndicator.checkRSS()` 验证流程的 RSS。以下示例
如果您的进程分配了超过 150MB，则返回不健康的响应代码。

> info **Hint** RSS（驻留集大小）显示分配给进程并保存在 RAM 中的内存量。
> 它不包括被交换的内存。它确实包括来自共享库的内存，只要页面来自
> 这些库实际上在内存中，以及所有堆栈和堆内存中。

```typescript
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024),
  ]);
}
```

#### 自定义健康指示器

在某些情况下，由 `@nestjs/terminus` 不要涵盖您所有的健康检查要求。在这种情况下，您可以创建自定义健康指示器。

大多数健康指标遵循相同的模式：运行一个操作，如果成功，则将指标标记为 `'up'`，如果失败，则将指标标记为 `'down'`。`HealthIndicatorService` 用 `attempt()` 实现了这种模式。为了展示指标的结构，我们将创建一个示例 `DogHealthIndicator`。只要外部狗 API 在一秒钟内响应，该服务就应该有状态 `'up'`。

```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class DogHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService
  ) {}

  isHealthy(key: string) {
    return this.healthIndicatorService
      .check(key)
      .attempt(async ({ signal }) => {
        const response = await fetch('https://dog.ceo/api/breeds/list', { signal });
        const { message: breeds } = await response.json();

        return { breeds: breeds.length };
      })
      .withTimeout(1000);
  }
}
```

`attempt()` 接受同步或异步函数，并将指示器标记为 `'up'` 一旦解决了。函数返回的任何数据都附加到结果中。如果函数抛出，则指示器标记为 `'down'` 并且错误消息被添加到结果中。在这两种情况下，函数花费的时间都报告为 `responseTime`. `withTimeout()` 将尝试限制为给定的毫秒数（请参见 [Timeouts and caching](#timeouts-and-caching)).

接下来，将健康指示器注册为提供者：

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DogHealthIndicator } from './dog.health.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  imports: [TerminusModule],
  providers: [DogHealthIndicator]
})
export class HealthModule { }
```

> info **Hint** 在现实世界的应用程序中，`DogHealthIndicator` 应该在一个单独的模块中提供，例如 `DogModule`，然后由 `HealthModule` 导入。

最后一步是将新的健康指示器添加到健康检查端点。返回 `HealthController` 并将其添加到 `healthCheck()` 方法：

```typescript
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import { Controller, Get } from '@nestjs/common';
import { DogHealthIndicator } from './dog.health.js';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private dogHealthIndicator: DogHealthIndicator
  ) {}

  @Get()
  @HealthCheck()
  healthCheck() {
    return this.health.check([
      () => this.dogHealthIndicator.isHealthy('dog'),
    ])
  }
}
```

如果 API 及时响应，健康检查返回以下结果：

```json
{
  "status": "ok",
  "info": {
    "dog": {
      "status": "up",
      "breeds": 98,
      "responseTime": 143
    }
  },
  "error": {},
  "details": {
    "dog": {
      "status": "up",
      "breeds": 98,
      "responseTime": 143
    }
  }
}
```

> info **Hint** 终端本身执行尝试，因此您可以将尝试传递给 `health.check([...])` 直接（`this.dogHealthIndicator.isHealthy('dog')`) 或包装在函数中，如上例所示。

##### 显式控制 up() 和 down()

有时候“健康”不仅仅意味着“手术没有扔”。要自己决定状态，请返回 `up()` 或者 `down()` 直接而不是使用 `attempt()`.假设狗现在存放在本地，并且只有当每个 `Dog` 具有类型 `'goodboy'`.

```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

export interface Dog {
  name: string;
  type: string;
}

@Injectable()
export class DogHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService
  ) {}

  private dogs: Dog[] = [
    { name: 'Fido', type: 'goodboy' },
    { name: 'Rex', type: 'badboy' },
  ];

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const badboys = this.dogs.filter(dog => dog.type === 'badboy');

    if (badboys.length > 0) {
      return indicator.down({ badboys: badboys.length });
    }

    return indicator.up();
  }
}
```

两个 `up()` 和 `down()` 接受附加到结果的具有附加数据的对象，或作为 `message` 财产。

##### 退化状态

并不是每个问题都有理由让应用程序退出轮换。例如，不可到达的缓存会降低应用程序的速度，但不会破坏应用程序。在这种情况下，指示器可以返回 `degraded()`.降级指示器不会通过健康检查：它列在 `info`，整体状态变为 `'degraded'`，以及 HTTP 状态代码停留 `200`.编排器保持路由流量，而状态在监控中保持可见。

```typescript
@Injectable()
export class CacheHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly cache: CacheService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const hasCache = await this.cache.isConnected();

    if (!hasCache) {
      return indicator.degraded('cache unreachable, serving without cache');
    }

    return indicator.up();
  }
}
```

```json
{
  "status": "degraded",
  "info": {
    "cache": {
      "status": "degraded",
      "message": "cache unreachable, serving without cache"
    }
  },
  "error": {},
  "details": {
    "cache": {
      "status": "degraded",
      "message": "cache unreachable, serving without cache"
    }
  }
}
```

喜欢 `up()` 和 `down()`,`degraded()` 接受具有附加数据的对象或消息字符串。一旦有任何指标 `'down'`，总体状态是 `'error'` 无论指标退化。

> warning **Warning** 建立在 `up()`, `down()`，和 `degraded()` 通过返回其中一个来报告其状态。这种指示器引发的错误被视为 bug，而不是不健康状态：它会中止整个运行状况检查并导致 `500` 响应而不是 `503`.如果指示器包装了可能抛出的操作，请使用 `attempt()`，它将抛出的错误转换为 `'down'` 状态。

#### 超时和缓存

每个用 `attempt()` 构建的检查都返回一个 `HealthCheckAttempt`。这包括您的自定义指标以及内置数据库、微服务和 gRPC 指标。在执行尝试之前，您可以通过链接 `withTimeout()` 和 `cacheFor()` 来配置它。

##### 超时

`withTimeout()` 将尝试限制在给定的毫秒数。一旦时间到了，指示器就被标记为 `'down'` 和 `AbortSignal` 传递给您的函数被中止。通过那个 `signal` 到底层操作，以便它也被取消，而不是停留在后台。

```typescript
// Within the `HealthController`-class
@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.db.pingCheck('database').withTimeout(1500),
    () => this.dogHealthIndicator.isHealthy('dog'),
  ]);
}
```

如果狗 API 由于自定义指示器在一秒钟内没有响应，运行状况检查响应如下结果：

```json
{
  "status": "error",
  "info": {
    "database": {
      "status": "up",
      "responseTime": 12
    }
  },
  "error": {
    "dog": {
      "status": "down",
      "message": "timeout of 1000ms exceeded",
      "responseTime": 1001
    }
  },
  "details": {
    "database": {
      "status": "up",
      "responseTime": 12
    },
    "dog": {
      "status": "down",
      "message": "timeout of 1000ms exceeded",
      "responseTime": 1001
    }
  }
}
```

> warning **Warning** 这个 `timeout` 内置指示器的选项（例如，`this.db.pingCheck('database', { timeout: 1500 })`）被弃用。链条 `.withTimeout()` 而是在返回的尝试上。

##### 缓存

编排器通常每隔几秒钟轮询一次运行状况检查，有些检查过于昂贵，无法在每个请求上运行。`cacheFor()` 将尝试的结果缓存给定毫秒数。当新结果存在时，该函数不会再次执行，并且并发运行状况检查共享一个飞行中执行。高速缓存跨请求共享，并由指示符键加密。

```typescript
// Within the `HealthController`-class
@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.db.pingCheck('database').withTimeout(1500).cacheFor(5000),
  ]);
}
```

从缓存提供的结果用 `cachedResponse: true` 标记：

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up",
      "responseTime": 12,
      "cachedResponse": true
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up",
      "responseTime": 12,
      "cachedResponse": true
    }
  }
}
```

#### 伐木作业

默认情况下，当运行状况检查失败时，Terminus 会记录错误。当配置了优雅的关机超时时，它还会记录关机的进度。这个 `TerminusModule.forRoot()` 方法使您能够更好地控制如何记录错误，并允许您完全接管记录。

本节将指导您创建自定义记录器 `TerminusLogger`。这个记录器扩展了内置的 `ConsoleLogger`，
因此，您可以选择要覆盖记录器的哪些部分。

> info **Hint** 要了解有关 Nest 中自定义记录器的更多信息，请参见 [注入自定义记录器](/application/logger#injecting-a-custom-logger)。

```typescript
import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class TerminusLogger extends ConsoleLogger {
  error(message: any, stack?: string, context?: string): void;
  error(message: any, ...optionalParams: any[]): void;
  error(
    message: unknown,
    stack?: unknown,
    context?: unknown,
    ...rest: unknown[]
  ): void {
    // Override how error messages are logged here
  }
}
```

创建自定义记录器后，将其传递到 `TerminusModule.forRoot()`：

```typescript
@Module({
imports: [
  TerminusModule.forRoot({
    logger: TerminusLogger,
  }),
],
})
export class HealthModule {}
```

要抑制来自终端的所有日志消息（包括错误消息），请将 `logger` 选项设置为 `false`：

```typescript
@Module({
imports: [
  TerminusModule.forRoot({
    logger: false,
  }),
],
})
export class HealthModule {}
```

您还可以配置如何在日志中显示健康检查错误。

| 错误日志样式 | 描述 | 例子 |
|:------------------|:-----------------------------------------------------------------------------------------------------------------------------------|:---------------------------------------------------------------------|
| `json`（默认） | 将健康检查结果摘要打印为 JSON 检查失败时的对象 | <图><img src="https://docs.nestjs.com/assets/Terminus_Error_Log_Json.png" /></图> |
| `pretty` | 检查失败时，在格式化框中打印运行状况检查结果摘要，突出显示成功和失败的结果 | <图><img src="https://docs.nestjs.com/assets/Terminus_Error_Log_Pretty.png" /></图> |

要更改日志样式，请使用 `errorLogStyle` 配置选项：

```typescript
@Module({
  imports: [
    TerminusModule.forRoot({
      errorLogStyle: 'pretty',
    }),
  ]
})
export class HealthModule {}
```

#### 优雅关机超时

如果您的应用程序需要延迟关闭，Terminus 可以使用 `gracefulShutdownTimeoutMs` 选项（单位为毫秒， `0` 默认情况下）。
此设置对于编排器特别有用，例如 Kubernetes.
通过设置稍长于就绪检查间隔的延迟，您可以在关闭容器时实现零停机时间：一旦收到终止信号，健康检查就会报告 `'shutting_down'` 用一个 `503` 状态代码，因此当应用程序在延迟期间完成飞行中请求时，编排器停止路由新流量。

```typescript
@Module({
  imports: [
    TerminusModule.forRoot({
      gracefulShutdownTimeoutMs: 1000,
    }),
  ]
})
export class HealthModule {}
```

> warning **Warning** 延迟仅适用于 `SIGTERM`，即信号编排器，例如 Kubernetes 停止容器时发送。其他信号（例如 `SIGINT` 来自 `Ctrl+C`) 仍然将健康检查切换到 `'shutting_down'` 但是立即关闭应用程序。确保 [关闭挂钩](/fundamentals/lifecycle-events#application-shutdown) 已启用；否则，终端永远不会接收到信号。

#### 更多示例

[Terminus samples directory](https://github.com/nestjs/terminus/tree/master/sample) 中有更多的工作示例。
