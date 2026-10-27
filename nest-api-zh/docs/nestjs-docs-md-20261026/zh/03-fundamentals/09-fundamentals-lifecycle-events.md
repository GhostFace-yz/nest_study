# Lifecycle events

Source: https://docs.nestjs.com/fundamentals/lifecycle-events

Nest 应用程序以及每个应用程序元素都有一个由 Nest 管理的生命周期。Nest 提供**生命周期挂钩**，让您可以看到关键的生命周期事件，并允许您在这些事件发生时采取行动（在模块、提供程序或控制器上运行注册代码）。

#### 生命周期序列

下图描述了关键应用程序生命周期事件的顺序，从引导应用程序到 Node.js 进程退出。整个生命周期分为三个阶段：**初始化**、**运行**、**终止**。考虑到这个生命周期，您可以计划模块和服务的适当初始化，管理活动连接，并在应用程序收到终止信号时优雅地关闭它。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/lifecycle-events.png" /></figure>

#### 生命周期事件

生命周期事件发生在应用程序引导和关闭期间。Nest 在以下每个生命周期事件中调用模块、提供程序和控制器上注册的生命周期挂钩方法（必须首先启用**关闭挂钩**，如 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown) 所述）。如上图所示，Nest 还调用适当的底层方法来开始和停止侦听连接。

在下表中，`onModuleInit()` 和 `onApplicationBootstrap()` 仅在应用程序初始化时触发：当您调用 `app.init()` 或者 `app.listen()` 显式地，或者在使用 `NestFactory.createApplicationContext()`，它为您初始化它。

这个 `onModuleDestroy()`,`beforeApplicationShutdown()`，和 `onApplicationShutdown()` 挂钩仅在您调用时触发 `app.close()` 显式地，或者当进程接收到系统信号时（例如 `SIGTERM`）你打电话来了 `enableShutdownHooks()` 在应用程序引导（参见 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown) 下面）。

| 生命周期挂钩法 | 触发钩子方法调用的生命周期事件 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onModuleInit()` | 一旦解决了主机模块的依赖关系，就会调用。 |
| `onApplicationBootstrap()` | 一旦所有模块都已初始化，但在侦听连接之前调用。 |
| `onModuleDestroy()`\* | 在终止信号之后调用（例如，`SIGTERM`）已收到。 |
| `beforeApplicationShutdown()`\* | 毕竟叫 `onModuleDestroy()` 处理程序已完成（承诺已解决或拒绝）；<br />一旦完成（承诺被解决或拒绝），所有现有连接将被关闭（`app.close()` 叫）。 |
| `onApplicationShutdown()`\* | 在连接关闭后调用，作为 `app.close()` 的最后一步。 |

\* 对于这些事件，如果您没有显式调用 `app.close()`，则必须选择加入，以使它们与 `SIGTERM` 等系统信号一起工作。请参见下面的 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown)。

> warning **Warning** 上面列出的生命周期挂钩不会为**请求范围**类触发。请求作用域类与应用程序生命周期无关，它们的生命周期是不可预测的。它们是专门为每个请求创建的，并在发送响应后进行垃圾收集。

> info **Hint** Nest 呼叫 `onModuleInit()` 和 `onApplicationBootstrap()` 一个模块一个模块，按照每个模块与导入图中根模块的距离排序：导入最深的模块（和全局模块）先，根模块最后。每个模块的挂钩在 Nest 进入下一个模块。关机挂钩以相反的顺序运行。

#### 使用

每个生命周期挂钩由一个接口表示。接口在技术上是可选的，因为它们在 TypeScript 编译。尽管如此，使用它们从强大的键入和编辑工具中受益是一个很好的做法。要注册生命周期挂钩，请实现适当的接口。例如，要在特定类（例如，控制器、提供程序或模块）上注册模块初始化期间要调用的方法，实现 `OnModuleInit` 接口通过提供 `onModuleInit()` 方法：

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class UsersService implements OnModuleInit {
  onModuleInit() {
    console.log(`The module has been initialized.`);
  }
}
```

#### 异步初始化

两者 `OnModuleInit` 和 `OnApplicationBootstrap` 钩子允许您推迟应用程序初始化过程。返回 a`Promise`，或将方法标记为 `async` 和 `await` 方法体中异步操作的完成。

```typescript
async onModuleInit(): Promise<void> {
  await this.fetch();
}
```

#### 应用程序关闭

`onModuleDestroy()`、`beforeApplicationShutdown()` 和 `onApplicationShutdown()` 挂钩在终止阶段被调用，以响应对 `app.close()` 的显式调用，或者，如果您选择加入，则在接收到 `SIGTERM` 等系统信号时被调用。此功能通常与 [Kubernetes](https://kubernetes.io/) 一起用于管理容器生命周期、[Heroku](https://www.heroku.com/) 测功机以及类似的服务。

关机挂钩侦听器会消耗系统资源，因此默认情况下会禁用它们。要使用关机挂钩，**必须通过调用 `enableShutdownHooks()` 来启用侦听器**：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Starts listening for shutdown hooks
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

> warning **Warning** 由于固有的平台限制，NestJS 对 Windows 上的应用程序关闭挂钩的支持有限。您可以期待 `SIGINT` 以及 `SIGBREAK` 在某种程度上 `SIGHUP` 都能工作。但是，`SIGTERM` 永远不会在 Windows 上工作，因为在任务管理器中终止一个进程是无条件的（应用程序没有办法检测或阻止它）。要详细了解 Windows 上如何处理 `SIGINT`、`SIGBREAK` 和其他信号，请参阅 [信号事件](https://nodejs.org/api/process.html#process_signal_events) 上的 [libuv 信号处理文档](https://docs.libuv.org/en/v1.x/signal.html) 和 Node.js 文档。

> info **Hint** `enableShutdownHooks()` 通过启动侦听器来消耗内存。当您运行多个 Nest 应用程序合二为一 Node.js 过程（例如，在并行测试运行期间），Node.js 可能会警告过多的听众。因此，默认情况下不启用关闭挂钩。在单个实例中运行多个实例时，请记住这一点 Node.js 过程。

当应用程序收到终止信号时，它会调用任何注册的 `onModuleDestroy()`,`beforeApplicationShutdown()`，和 `onApplicationShutdown()` 方法，按此顺序。`beforeApplicationShutdown()` 和 `onApplicationShutdown()` 接收相应的信号作为它们的第一个参数（`onModuleDestroy()` 不需要争论）。如果注册方法返回 promise，Nest 在承诺被解析或拒绝之前，不会继续该序列。

```typescript
@Injectable()
class UsersService implements OnApplicationShutdown {
  onApplicationShutdown(signal: string) {
    console.log(signal); // e.g., "SIGINT"
  }
}
```

> info **Hint** 呼叫 `app.close()` 不会终止 Node.js 过程。它只运行关机序列（`onModuleDestroy()`,`beforeApplicationShutdown()`，和 `onApplicationShutdown()` 钩子，加上关闭底层服务器）。如果有活动间隔、长时间运行的后台任务等，进程不会自行退出。
