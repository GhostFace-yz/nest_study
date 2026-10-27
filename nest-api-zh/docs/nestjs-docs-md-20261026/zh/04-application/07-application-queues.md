# Queues

Source: https://docs.nestjs.com/application/queues

队列是一种设计模式，可帮助您处理常见的应用程序扩展和性能挑战。队列可以帮助您解决的一些问题示例包括：

- 平滑处理峰值。例如，如果用户可以在任意时间启动资源密集型任务，则可以将这些任务添加到队列中，而不是同步执行它们。然后，工作进程以受控的方式从队列中提取任务。随着应用程序的增长，您可以添加队列使用者来扩展后端任务处理。
- 拆分可能会阻碍 Node.js 事件循环。例如，如果用户请求需要 CPU-音频转码等密集型工作，您可以将此任务委托给其他流程，以便面向用户的流程保持响应。
- 提供跨服务的可靠沟通渠道。例如，您可以在一个进程或服务中排队任务（作业），并在另一个进程或服务中使用它们。通过监听状态事件，可以通知任何流程或服务作业生命周期中的完成、错误或其他状态更改。当队列生产者或消费者失败时，它们的状态被保留，并且当节点重新启动时，任务处理可以自动恢复。

Nest 提供 `@nestjs/bullmq` 用于 BullMQ 集成和 `@nestjs/bull` 公牛集成包。这两个包都包装了各自的库，这些库是由同一个团队开发的。Bull 处于维护模式（团队只修复 bug），而 BullMQ 正在积极开发中，并提供了一个现代的 TypeScript 具有不同功能集的实现。如果公牛满足您的要求，它仍然是一个可靠的、经过实战考验的选择。

BullMQ 和 Bull 使用 [Redis](https://redis.io/) 要持久化作业数据，因此需要运行 Redis 实例。因为他们是 Redis-支持，您的队列架构可以完全分布式且与平台无关。例如，您可以运行一些队列<a href="application/queues#producers">producers</a>、<a href="application/queues#consumers">consumers</a>和<a href="application/queues#event-listeners">listeners</a>Nest 在一个或多个节点上，以及在其他节点上的其他生产者、消费者和侦听器 Node.js 其他网络节点上的平台。

本章涵盖 `@nestjs/bullmq` 和 `@nestjs/bull` 包。有关更多背景和实现细节，请参见 [BullMQ documentation](https://docs.bullmq.io/) 和 [Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md)。

#### BullMQ 安装

要开始使用 BullMQ，请安装所需的依赖项。

```bash
$ npm install --save @nestjs/bullmq bullmq
```

安装过程完成后，将 `BullModule` 导入到根 `AppModule` 中。

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
})
export class AppModule {}
```

这个 `forRoot()` 方法寄存器 a`bullmq` 应用程序中注册的所有队列都使用的配置对象（除非另有说明）。以下是一些配置属性：

- `connection: ConnectionOptions`-配置的选项 Redis 联系。看 [Connections](https://docs.bullmq.io/guide/connections) 欲了解更多信息。
- `prefix: string`-所有队列键的前缀（默认值为 `bull`）。
- `defaultJobOptions: DefaultJobOptions`-新作业的默认设置。有关更多信息，请参见 [DefaultJobOptions](https://docs.bullmq.io/api/interfaces/v6.DefaultJobOptions.html)。这些不适用于通过 `FlowProducer` 添加的作业；有关解释，请参见 [bullmq#1034](https://github.com/taskforcesh/bullmq/issues/1034)。
- `settings: AdvancedRepeatOptions`-可重复作业的高级设置。这些通常不应该改变。看 [AdvancedRepeatOptions](https://docs.bullmq.io/api/interfaces/v6.AdvancedRepeatOptions.html) 欲了解更多信息。
- `extraOptions`-模块初始化的附加选项。参见 [Manual registration](/application/queues#manual-registration)。

所有选项都是可选的。除了 `extraOptions`，它们被直接传递给 BullMQ`Queue` 构造函数。参见 [QueueOptions API reference](https://docs.bullmq.io/api/interfaces/v6.QueueOptions.html) 完整的列表。

要注册队列，请导入 `BullModule.registerQueue()` 动态模块，如下：

```typescript
BullModule.registerQueue({
  name: 'audio',
});
```

> info **Hint** 通过将多个配置对象（作为单独的参数）传递给 `registerQueue()` 方法。

这个 `registerQueue()` 方法实例化和/或注册队列。队列在连接到相同底层的模块和进程之间共享 Redis 具有相同凭据的数据库。每个队列由其标识 `name` 财产。队列名称既充当注入令牌（用于将队列注入控制器和提供程序），也充当将消费者类和侦听器与队列相关联的装饰器的参数。

您还可以覆盖特定队列的某些预配置选项，如下所示：

```typescript
BullModule.registerQueue({
  name: 'audio',
  connection: {
    port: 6380,
  },
});
```

BullMQ 还支持作业之间的父子关系。这启用了流，其中作业是任意深度树的节点。看 [Flows](https://docs.bullmq.io/guide/flows) 在 BullMQ 文档中了解更多信息。

若要注册流生成器，请使用 `registerFlowProducer()` 方法：

```typescript
BullModule.registerFlowProducer({
  name: 'flowProducerName',
});
```

因为作业持久存在于 Redis，每次实例化命名队列时（例如，当应用程序启动或重新启动时），它都会尝试处理先前未完成会话遗留的任何旧作业。

每个队列可以具有一个或多个生产者、消费者和监听者。消费者按特定顺序从队列中检索作业：FIFO（默认值），LIFO，或根据优先级。<a href="application/queues#job-options">job options</a>部分解释了如何控制处理顺序。

#### 命名配置

如果您的队列连接到多个 Redis 实例，您可以使用一种名为**命名配置**的技术。此功能允许您在指定的键下注册几个配置，然后您可以在队列选项中引用这些配置。

例如，假设您有一个额外的 Redis 应用程序中的几个队列使用的实例（默认实例除外），您可以按如下方式注册其配置：

```typescript
BullModule.forRoot('alternative-config', {
  connection: {
    port: 6381,
  },
});
```

在上面的示例中，`'alternative-config'` 是一个配置键（它可以是任何字符串）。

现在，您可以在 `registerQueue()` 选项对象：

```typescript
BullModule.registerQueue({
  configKey: 'alternative-config',
  name: 'video',
});
```

#### 制片人

作业生产者将作业添加到队列中。生产者通常是应用服务（Nest[供应商](/providers)）。要将作业添加到队列中，首先将队列注入到服务中：

```typescript
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}
}
```

> info **Hint** `@InjectQueue()` 装饰器通过队列的名称标识队列，如 `registerQueue()` 方法调用中提供的（例如，`'audio'`）。

现在，通过调用队列的 `add()` 方法添加作业，传递作业名称和用户定义的数据对象。作业数据必须是可序列化的，因为作业存储在 Redis 中。数据形状是任意的；用它来表示你工作的语义。该名称允许<a href="application/queues#consumers">consumer</a>区分不同类型的作业。

```typescript
const job = await this.audioQueue.add('transcode', {
  foo: 'bar',
});
```

#### 工作选项

作业可以有与之相关联的其他选项。传递 options 对象作为第三个参数 `Queue.add()` 方法，在作业数据之后。一些工作选项包括：

- `priority`:`number`-优先级值，从 0 到 2,097,151。`0`（默认）意味着没有明确的优先级；没有优先级的作业在优先级作业之前处理，在优先级作业中，优先级较低的作业优先处理。使用优先级对性能的影响很小，因此仅在需要时使用它们。
- `delay`:`number`-等待时间（以毫秒为单位），直到可以处理此作业。为了准确的延迟，工人和生产者应该同步他们的时钟。
- `attempts`:`number`-尝试作业直到完成的总次数（默认为 1）。
- `backoff`:`number | BackoffOptions`-作业失败时自动重试的回退设置。参见 [BackoffOptions](https://docs.bullmq.io/api/interfaces/v6.BackoffOptions.html)。
- `lifo`:`boolean`-如果 `true`，将作业添加到队列的右端而不是左端（默认值 `false`）。
- `jobId`: `string` - 覆盖作业 ID。默认情况下，作业 ID 是唯一的整数。如果您使用此选项，则由您来确保 ID 是唯一的。不会添加已存在的带有 ID 的作业。
- `removeOnComplete`:`boolean | number | KeepJobs`- 如果 `true`，在作业成功完成时删除作业。一个数字指定要保留多少个作业，以及 `KeepJobs` 对象指定最大年龄和/或计数。默认情况下，作业保留在已完成的集合中。
- `removeOnFail`：`boolean | number | KeepJobs`-如果 `true`，当作业在所有尝试后失败时删除。数字或 `KeepJobs` 对象与 `removeOnComplete` 一样有效。默认情况下，作业保留在失败集合中。
- `stackTraceLimit`:`number`-限制为失败作业记录的堆栈跟踪行数。

> info **Hint** BullMQ 不再接受 `Queue.add()` 中的 `repeat` 选项。若要重复运行作业（例如，在 cron 模式上），请使用 `Queue#upsertJobScheduler()` 方法创建作业调度程序。请参见 BullMQ 文档中的 [Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)。

以下是使用作业选项自定义作业的几个示例。

若要延迟作业的开始，请使用 `delay` 财产。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { delay: 3000 }, // 3 seconds delayed
);
```

若要将作业添加到队列的右端（即，将其处理为**LIFO**，后进先出），请将 `lifo` 属性设置为 `true`。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { lifo: true },
);
```

若要确定作业的优先级，请使用 `priority` 财产。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { priority: 2 },
);
```

有关选项的完整列表，请参见 [JobsOptions](https://docs.bullmq.io/api/types/v6.JobsOptions.html) 和 [BaseJobOptions](https://docs.bullmq.io/api/interfaces/v6.BaseJobOptions.html)API 参考资料。

#### 消费者

消费者是一个**类**，它定义处理添加到队列中的作业、监听队列中的事件或两者兼而有之的方法。使用 `@Processor()` 装饰器如下：

```typescript
import { Processor } from '@nestjs/bullmq';

@Processor('audio')
export class AudioConsumer {}
```

> info **Hint** 消费者必须注册为 `providers` 所以 `@nestjs/bullmq` 包裹可以接他们。

装饰器的字符串参数（例如，`'audio'`) 是要与类关联的队列的名称。消费阶层必须扩大 `WorkerHost` 并实施其 `process()` 方法：

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    let progress = 0;
    for (let i = 0; i < 100; i++) {
      await doSomething(job.data);
      progress += 1;
      await job.updateProgress(progress);
    }
    return {};
  }
}
```

这个 `process()` 每当工人空闲并且队列中有作业要处理时，就会调用方法。它接收 `job` 对象作为它唯一的论据。它返回的值存储在 job 对象中，稍后可以访问，例如，在 `completed` 事件。

`Job` 对象有多种方法，允许您与其状态进行交互。例如，上面的代码使用 `updateProgress()` 方法更新作业的进度。参见 [Job API reference](https://docs.bullmq.io/api/classes/v6.Job.html) 完整的列表。

在 Bull 中，您可以指定作业处理程序方法**只处理**某种类型的作业（具有特定 `name`）通过传递 `name` 到 `@Process()` 装饰器，如下图。

> warning **Warning** 这对 BullMQ 不起作用。请继续阅读 BullMQ 方法。

```typescript
@Process('transcode')
async transcode(job: Job<unknown>) { ... }
```

BullMQ 不支持这种行为，因为它会引起混乱。相反，使用 `switch` 作业名称上的语句，用于为每种类型的作业调用不同的服务或逻辑：

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'transcode': {
        let progress = 0;
        for (let i = 0; i < 100; i++) {
          await doSomething(job.data);
          progress += 1;
          await job.updateProgress(progress);
        }
        return {};
      }
      case 'concatenate': {
        await doSomeLogic2();
        break;
      }
    }
  }
}
```

这在 [命名处理器](https://docs.bullmq.io/patterns/named-processor)BullMQ 文档的一部分。

#### 请求范围消费者

当使用者被标记为请求范围时（请参见 [注射镜](/fundamentals/injection-scopes#provider-scope))，为每个作业专门创建该类的新实例。作业完成后，实例被垃圾回收。

```typescript
@Processor({
  name: 'audio',
  scope: Scope.REQUEST,
})
```

由于请求作用域的使用者类是动态实例化的，并且作用域应用于单个作业，因此可以使用 `JOB_REF` 代币。

```typescript
constructor(@Inject(JOB_REF) jobRef: Job) {
  console.log(jobRef);
}
```

> info **Hint** 这个 `JOB_REF` 令牌是从 `@nestjs/bullmq` 包装。

#### 事件监听器

当队列和/或作业状态发生变化时，BullMQ 会发出一组事件。您可以使用 `@OnWorkerEvent(event)` 装饰器，或者在队列级别具有专用侦听器类和 `@OnQueueEvent(event)` 装修师。

工作事件必须在 <a href="application/queues#consumers">consumer</a> 类中声明（即，在用 `@Processor()` 装饰师）。若要监听事件，请使用 `@OnWorkerEvent(event)` 您想要处理的事件的装饰器。例如，要监听作业进入活动状态时发出的事件 `audio` 队列，使用以下构造：

```typescript
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  @OnWorkerEvent('active')
  onActive(job: Job) {
    console.log(
      `Processing job ${job.id} of type ${job.name} with data ${job.data}...`,
    );
  }

  // ...
}
```

worker 事件及其参数的完整列表可作为 [WorkerListener](https://docs.bullmq.io/api/interfaces/v6.WorkerListener.html) 接口。

队列事件侦听器必须使用 `@QueueEventsListener(queue)` 装饰器并扩展 `@nestjs/bullmq` 提供的 `QueueEventsHost` 类。若要监听事件，请将 `@OnQueueEvent(event)` 装饰器与要处理事件一起使用。例如，若要监听作业在 `audio` 队列中进入活动状态时发出的事件，请使用以下构造：

```typescript
import {
  QueueEventsHost,
  QueueEventsListener,
  OnQueueEvent,
} from '@nestjs/bullmq';

@QueueEventsListener('audio')
export class AudioEventsListener extends QueueEventsHost {
  @OnQueueEvent('active')
  onActive(job: { jobId: string; prev?: string }) {
    console.log(`Processing job ${job.jobId}...`);
  }

  // ...
}
```

> info **Hint** 队列事件侦听器必须注册为 `providers` 所以 `@nestjs/bullmq` 包裹可以接他们。

队列事件及其参数的完整列表可作为 [QueueEventsListener](https://docs.bullmq.io/api/interfaces/v6.QueueEventsListener.html) 接口。

#### 队列管理

队列有一个 API 用于管理功能，如暂停和恢复，以及检索各种状态下的作业计数。有关完整的 API，请参见 [Queue API reference](https://docs.bullmq.io/api/classes/v6.Queue.html)。直接在 `Queue` 对象上调用这些方法，如下面的暂停和恢复示例所示。

暂停队列 `pause()` 方法。暂停的队列在恢复之前不会处理新作业，但已经处理的作业会继续处理，直到完成。

```typescript
await audioQueue.pause();
```

若要恢复暂停的队列，请使用 `resume()` 方法，如下：

```typescript
await audioQueue.resume();
```

#### 观察生产中的队列

队列失败的方式是 HTTP 端点不会。作业不会向不耐烦的用户返回状态代码。它悄悄地重试，三次，有后退，唯一的症状是下游的事情从未发生过。因此，两个重要的问题是*“这个队列保持不变吗？”*和*“那个作业运行过吗？”*，而消费者自己的日志无法回答这两个问题。

[NestJS Observe](https://www.observe.nestjs.com/) 仪器会自动对消费者进行排队，就像对控制器进行排队一样：`@Processor()` 类及其处理程序被识别为作业，因此不需要手动跨度布线：

- **队列等待时间与执行时间分开测量。**运行时间为 200 毫秒但在队列中停留四分钟的作业是容量问题，而不是处理程序速度慢。这两个数字是并排报告的，所以你可以分辨出你有哪一个。
- **每次运行都会记录尝试和失败原因。**您会看到作业在尝试 3 时成功，而不是只看到成功，这通常是“良好”和“悄然降级”之间的区别。
- **静默是可警报的。**当指定作业未报告的时间超过您选择的容差时，*作业静默*规则将触发。这就是您如何发现夜间计费消费者在停止运行的当晚停止运行，而不是在月底。

失败的作业携带与失败的请求相同的错误卡：解析的带有源行的堆栈跟踪、运行期间写入的日志，以及作业在抛出之前所做的事情的瀑布。参见 [Observability](/observability/overview) 设置章节。

#### 单独工艺

作业处理程序也可以在单独的（分叉的）进程中运行（请参见 [Sandboxed processors](https://docs.bullmq.io/guide/workers/sandboxed-processors) 在 BullMQ 文档中）。这有几个优点：

- 该过程是沙盒式的，因此如果它崩溃，工人不会受到影响。
- 您可以在不影响队列的情况下运行阻塞代码（作业不会停滞）。
- 更好地利用多核 CPU。
- 到 Redis 的连接较少。

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { join } from 'node:path';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audio',
      processors: [join(import.meta.dirname, 'processor.js')],
    }),
  ],
})
export class AppModule {}
```

> warning **Warning** 因为您的函数在分叉进程中运行，所以依赖注入（和 IoC 容器）不可用。处理器函数必须包含（或创建）它需要的所有外部依赖项实例。

#### 异步配置

你可能想通过 `bullmq` 选项异步而不是静态。在这种情况下，使用 `forRootAsync()` 方法，它提供了几种处理异步配置的方法。同样，若要异步传递队列选项，请使用 `registerQueueAsync()` 方法。

一种方法是使用工厂函数：

```typescript
BullModule.forRootAsync({
  useFactory: () => ({
    connection: {
      host: 'localhost',
      port: 6379,
    },
  }),
});
```

工厂的行为类似于任何其他 [异步提供程序](/fundamentals/async-providers)（例如，它可以是 `async`，并且可以通过 `inject` 注入依赖项）。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    connection: {
      host: configService.get('QUEUE_HOST'),
      port: configService.get('QUEUE_PORT'),
    },
  }),
  inject: [ConfigService],
});
```

或者，您可以使用 `useClass` 语法：

```typescript
BullModule.forRootAsync({
  useClass: BullConfigService,
});
```

上面的构造在 `BullModule` 中实例化了 `BullConfigService`，并通过调用 `createSharedConfiguration()` 使用它来提供一个 options 对象。这意味着 `BullConfigService` 必须实现 `SharedBullConfigurationFactory` 接口，如下所示：

```typescript
@Injectable()
class BullConfigService implements SharedBullConfigurationFactory {
  createSharedConfiguration(): BullRootModuleOptions {
    return {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    };
  }
}
```

重用从不同模块导入的提供程序，而不是创建 `BullConfigService` 内部 `BullModule`，使用 `useExisting` 句法。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});
```

这种构造的工作原理与 `useClass` 有一个关键的区别：`BullModule` 查找导入的模块以重用现有模块 `ConfigService` 而不是实例化一个新的。

同样，若要异步传递队列选项，请使用 `registerQueueAsync()` 方法。指定 `name` 工厂函数外部的属性。

```typescript
BullModule.registerQueueAsync({
  name: 'audio',
  useFactory: () => ({
    connection: {
      host: 'localhost',
      port: 6379,
    },
  }),
});
```

#### 手动登记

默认情况下，`BullModule` 会自动将 BullMQ 组件（队列、处理器和事件侦听器服务）注册到 `onModuleInit` 生命周期挂钩中。在某些情况下，这种行为不是你想要的。要防止自动注册，请在 `BullModule` 中启用 `manualRegistration`：

```typescript
BullModule.forRoot({
  extraOptions: {
    manualRegistration: true,
  },
});
```

要手动注册这些组件，请注入 `BullRegistrar` 并称之为 `register()` 方法，理想情况下在 `onModuleInit()` 或者 `onApplicationBootstrap()` 生命周期挂钩。

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { BullRegistrar } from '@nestjs/bullmq';

@Injectable()
export class AudioService implements OnModuleInit {
  constructor(private bullRegistrar: BullRegistrar) {}

  onModuleInit() {
    if (yourConditionHere) {
      this.bullRegistrar.register();
    }
  }
}
```

直到你打电话 `BullRegistrar#register()`，没有 BullMQ 组件工作，这意味着没有作业被处理。

#### 公牛安装

> info **Note** 如果您使用 BullMQ，请跳过本节和后面的部分。

要开始使用 Bull，请安装所需的依赖项。

```bash
$ npm install --save @nestjs/bull bull
```

安装过程完成后，将 `BullModule` 导入到根 `AppModule` 中。

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
})
export class AppModule {}
```

这个 `forRoot()` 方法寄存器 a`bull` 应用程序中注册的所有队列都使用的配置对象（除非另有说明）。配置对象由以下属性组成（均为可选）：

- `limiter: RateLimiter`-控制队列作业处理速度的选项。看 [RateLimiter](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue) 欲了解更多信息。
- `redis: RedisOpts`-配置的选项 Redis 联系。看 [RedisOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue) 欲了解更多信息。
- `prefix: string`-所有队列键的前缀。
- `defaultJobOptions: JobOpts`-控制新作业默认设置的选项。看 [JobOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd) 欲了解更多信息。
- `settings: AdvancedSettings`-高级队列配置设置。这些通常不应该改变。看 [AdvancedSettings](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue) 欲了解更多信息。

这些期权直接传递给多头 `Queue` 构造函数。参见 [Queue section of the Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue) 详情。

要注册队列，请导入 `BullModule.registerQueue()` 动态模块，如下：

```typescript
BullModule.registerQueue({
  name: 'audio',
});
```

> info **Hint** 通过将多个配置对象（作为单独的参数）传递给 `registerQueue()` 方法。

这个 `registerQueue()` 方法实例化和/或注册队列。队列在连接到相同底层的模块和进程之间共享 Redis 具有相同凭据的数据库。每个队列由其标识 `name` 财产。队列名称既充当注入令牌（用于将队列注入控制器和提供程序），也充当将消费者类和侦听器与队列相关联的装饰器的参数。

您还可以覆盖特定队列的某些预配置选项，如下所示：

```typescript
BullModule.registerQueue({
  name: 'audio',
  redis: {
    port: 6380,
  },
});
```

因为作业持久存在于 Redis，每次实例化命名队列时（例如，当应用程序启动或重新启动时），它都会尝试处理先前未完成会话遗留的任何旧作业。

每个队列可以具有一个或多个生产者、消费者和监听者。消费者按特定顺序从队列中检索作业：FIFO（默认值），LIFO，或根据优先级。<a href="application/queues#job-options">job options</a>部分解释了如何控制处理顺序。

#### 命名配置

如果您的队列连接到多个 Redis 实例，您可以使用一种名为**命名配置**的技术。此功能允许您在指定的键下注册几个配置，然后您可以在队列选项中引用这些配置。

例如，假设您有一个额外的 Redis 应用程序中的几个队列使用的实例（默认实例除外），您可以按如下方式注册其配置：

```typescript
BullModule.forRoot('alternative-config', {
  redis: {
    port: 6381,
  },
});
```

在上面的示例中，`'alternative-config'` 是一个配置键（它可以是任何字符串）。

现在，您可以在 `registerQueue()` 选项对象：

```typescript
BullModule.registerQueue({
  configKey: 'alternative-config',
  name: 'video',
});
```

#### 制片人

作业生产者将作业添加到队列中。生产者通常是应用服务（Nest[供应商](/providers)）。要将作业添加到队列中，首先将队列注入到服务中：

```typescript
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}
}
```

> info **Hint** `@InjectQueue()` 装饰器通过队列的名称标识队列，如 `registerQueue()` 方法调用中提供的（例如，`'audio'`）。

现在，通过调用队列的 `add()` 方法添加一个作业，传递一个用户定义的数据对象。作业数据必须是可序列化的，因为作业存储在 Redis 中。数据形状是任意的；用它来表示你工作的语义。

```typescript
const job = await this.audioQueue.add({
  foo: 'bar',
});
```

#### 命名作业

工作可以有名字。这允许您创建专门的<a href="application/queues#consumers">consumers</a>，这些</a>只处理具有给定名称的作业。

```typescript
const job = await this.audioQueue.add('transcode', {
  foo: 'bar',
});
```

> warning **Warning** 使用命名作业时，必须为添加到队列中的每个唯一名称创建一个处理器，否则队列会报告缺少给定作业的处理器。有关使用命名作业的详细信息，请参阅<a href="application/queues#consumers">consumers</a>。

#### 工作选项

作业可以有与之相关联的其他选项。在作业数据之后传递选项对象 `Queue.add()` 方法。工作选项有：

- `priority`:`number`-可选的优先级值。范围从 1（最高优先级）到 MAX_INT（最低优先级）。使用优先级对性能有轻微影响，因此请谨慎使用。
- `delay`:`number`-等待时间（以毫秒为单位），直到可以处理此作业。为了获得准确的延迟，服务器和客户端都应该同步它们的时钟。
- `attempts`:`number`-尝试作业直至完成的总次数。
- `repeat`:`RepeatOpts`-根据 cron 规范重复作业。参见 [RepeatOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `backoff`:`number | BackoffOpts`-作业失败时自动重试的回退设置。参见 [BackoffOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `lifo`:`boolean`-如果 `true`，将作业添加到队列的右端而不是左端（默认值 `false`）。
- `timeout`:`number`-作业失败并出现超时错误的毫秒数。
- `jobId`: `number | string` - 覆盖作业 ID。默认情况下，作业 ID 是唯一的整数。如果您使用此选项，则由您来确保 ID 是唯一的。不会添加已存在的带有 ID 的作业。
- `removeOnComplete`:`boolean | number`- 如果 `true`，在作业成功完成时删除作业。一个数字指定要保留多少工作。默认情况下，作业保留在已完成的集合中。
- `removeOnFail`:`boolean | number`- 如果 `true`，在所有尝试后都失败时删除作业。一个数字指定要保留多少工作。默认情况下，作业保留在失败集合中。
- `stackTraceLimit`:`number`-限制为失败作业记录的堆栈跟踪行数。

以下是使用作业选项自定义作业的几个示例。

若要延迟作业的开始，请使用 `delay` 财产。

```typescript
const job = await this.audioQueue.add(
  {
    foo: 'bar',
  },
  { delay: 3000 }, // 3 seconds delayed
);
```

若要将作业添加到队列的右端（即，将其处理为**LIFO**，后进先出），请将 `lifo` 属性设置为 `true`。

```typescript
const job = await this.audioQueue.add(
  {
    foo: 'bar',
  },
  { lifo: true },
);
```

若要确定作业的优先级，请使用 `priority` 财产。

```typescript
const job = await this.audioQueue.add(
  {
    foo: 'bar',
  },
  { priority: 2 },
);
```

#### 消费者

消费者是一个**类**，它定义处理添加到队列中的作业、监听队列中的事件或两者兼而有之的方法。使用 `@Processor()` 装饰器如下：

```typescript
import { Processor } from '@nestjs/bull';

@Processor('audio')
export class AudioConsumer {}
```

> info **Hint** 消费者必须注册为 `providers` 所以 `@nestjs/bull` 包裹可以接他们。

装饰器的字符串参数（例如，`'audio'`) 是要与类方法关联的队列的名称。

在消费者类中，通过使用 `@Process()` 装修师。

```typescript
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('audio')
export class AudioConsumer {
  @Process()
  async transcode(job: Job<unknown>) {
    let progress = 0;
    for (let i = 0; i < 100; i++) {
      await doSomething(job.data);
      progress += 1;
      await job.progress(progress);
    }
    return {};
  }
}
```

修饰方法(例如，`transcode()`) 每当工人空闲并且队列中有作业要处理时调用。它接收 `job` 对象作为它唯一的论据。它返回的值存储在 job 对象中，稍后可以访问，例如，在 `completed` 事件。

`Job` 对象具有多种方法，允许您与其状态进行交互。例如，上面的代码使用 `progress()` 方法来更新作业的进度。有关完整的 `Job`API，请参见 [Job section of the Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#job)。

可以指定作业处理程序方法**仅**处理某种类型的作业（具有特定 `name`）通过传递 `name` 到 `@Process()` 装饰器，如下图。消费者类可以有多个 `@Process()` 处理程序，每个作业类型一个（`name`).使用命名作业时，请确保每个名称都有一个处理程序。

```typescript
@Process('transcode')
async transcode(job: Job<unknown>) { ... }
```

> warning **Warning** 为同一队列定义多个使用者时，`concurrency` 选项 `@Process({ concurrency: 1 })` 不生效。最小值 `concurrency` 匹配定义的消费者数量。即使 `@Process()` 处理程序使用不同的名称来处理命名作业。

#### 请求范围消费者

当使用者被标记为请求范围时（请参见 [注射镜](/fundamentals/injection-scopes#provider-scope))，为每个作业专门创建该类的新实例。作业完成后，实例被垃圾回收。

```typescript
@Processor({
  name: 'audio',
  scope: Scope.REQUEST,
})
```

由于请求作用域的使用者类是动态实例化的，并且作用域应用于单个作业，因此可以使用 `JOB_REF` 代币。

```typescript
constructor(@Inject(JOB_REF) jobRef: Job) {
  console.log(jobRef);
}
```

> info **Hint** 这个 `JOB_REF` 令牌是从 `@nestjs/bull` 包装。

#### 事件监听器

当队列和/或作业状态发生变化时，Bull 会发出一组事件。这个 `@nestjs/bull` 包导出一组装饰器，允许您订阅一组核心的标准事件。

事件侦听器必须在<a href="application/queues#consumers">consumer</a>类中声明（即，在用 `@Processor()` 装饰师）。若要监听事件，请使用下表中的一个装饰器来声明事件的处理程序。例如，要监听作业进入活动状态时发出的事件 `audio` 队列，使用以下构造：

```typescript
import { Processor, Process, OnQueueActive } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('audio')
export class AudioConsumer {

  @OnQueueActive()
  onActive(job: Job) {
    console.log(
      `Processing job ${job.id} of type ${job.name} with data ${job.data}...`,
    );
  }
  ...
```

因为 Bull 在分布式（多节点）环境中运行，所以它定义了事件局部性的概念。事件可以完全在单个进程内触发，也可以在来自不同进程的共享队列上触发。当在本地进程中的队列上触发操作或状态更改时，会产生**local**事件。换句话说，当您的事件生产者和消费者是单个进程的本地用户时，队列上发生的所有事件都是本地用户。

当多个进程共享队列时，**全局**事件就会发挥作用。一个进程中的侦听器要接收由另一个进程触发的事件通知，它必须注册一个全局事件。

每当发出相应的事件时，事件处理程序都会被调用。每个处理程序都使用下表所示的签名进行调用，该签名提供了对与事件相关的信息的访问。下表讨论了本地和全局事件处理程序签名之间的一个关键区别。

<table>
  <tr>
    <th>Local event listeners</th>
    <th>Global event listeners</th>
    <th>Handler method signature / When fired</th>
  </tr>
  <tr>
    <td><code>@OnQueueError()</code></td><td><code>@OnGlobalQueueError()</code></td><td><code>handler(error: Error)</code> - An error occurred. <code>error</code> contains the triggering error.</td>
  </tr>
  <tr>
    <td><code>@OnQueueWaiting()</code></td><td><code>@OnGlobalQueueWaiting()</code></td><td><code>handler(jobId: number | string)</code> - A job is waiting to be processed as soon as a worker is idle. <code>jobId</code> contains the ID of the job that has entered this state.</td>
  </tr>
  <tr>
    <td><code>@OnQueueActive()</code></td><td><code>@OnGlobalQueueActive()</code></td><td><code>handler(job: Job)</code> - Job <code>job</code> has started.</td>
  </tr>
  <tr>
    <td><code>@OnQueueStalled()</code></td><td><code>@OnGlobalQueueStalled()</code></td><td><code>handler(job: Job)</code> - Job <code>job</code> has been marked as stalled. This is useful for debugging job workers that crash or pause the event loop.</td>
  </tr>
  <tr>
    <td><code>@OnQueueProgress()</code></td><td><code>@OnGlobalQueueProgress()</code></td><td><code>handler(job: Job, progress: number)</code> - Job <code>job</code>'s progress was updated to value <code>progress</code>.</td>
  </tr>
  <tr>
    <td><code>@OnQueueCompleted()</code></td><td><code>@OnGlobalQueueCompleted()</code></td><td><code>handler(job: Job, result: any)</code> - Job <code>job</code> successfully completed with a result <code>result</code>.</td>
  </tr>
  <tr>
    <td><code>@OnQueueFailed()</code></td><td><code>@OnGlobalQueueFailed()</code></td><td><code>handler(job: Job, err: Error)</code> - Job <code>job</code> failed with reason <code>err</code>.</td>
  </tr>
  <tr>
    <td><code>@OnQueuePaused()</code></td><td><code>@OnGlobalQueuePaused()</code></td><td><code>handler()</code> - The queue has been paused.</td>
  </tr>
  <tr>
    <td><code>@OnQueueResumed()</code></td><td><code>@OnGlobalQueueResumed()</code></td><td><code>handler()</code> - The queue has been resumed.</td>
  </tr>
  <tr>
    <td><code>@OnQueueCleaned()</code></td><td><code>@OnGlobalQueueCleaned()</code></td><td><code>handler(jobs: Job[], type: string)</code> - Old jobs have been cleaned from the queue. <code>jobs</code> is an array of cleaned jobs, and <code>type</code> is the type of jobs cleaned.</td>
  </tr>
  <tr>
    <td><code>@OnQueueDrained()</code></td><td><code>@OnGlobalQueueDrained()</code></td><td><code>handler()</code> - Emitted whenever the queue has processed all the waiting jobs (even if some delayed jobs are not yet processed).</td>
  </tr>
  <tr>
    <td><code>@OnQueueRemoved()</code></td><td><code>@OnGlobalQueueRemoved()</code></td><td><code>handler(job: Job)</code> - Job <code>job</code> was successfully removed.</td>
  </tr>
</table>

监听全局事件时，方法签名可能与其本地对应的方法签名略有不同。具体来说，任何接收到 `job` 本地版本中的对象接收 `jobId`(`number | string`）在全局版本中。获取对实际的参考 `job` 对象在这种情况下，使用 `Queue#getJob()` 方法。此调用返回一个 promise，因此声明处理程序 `async` 等待它。例如：

```typescript
@OnGlobalQueueCompleted()
async onGlobalCompleted(jobId: number, result: any) {
  const job = await this.immediateQueue.getJob(jobId);
  console.log('(Global) on completed: job ', job.id, ' -> result: ', result);
}
```

> info **Hint** 访问 `Queue` 对象（使 `getJob()` 呼叫），你必须注射。队列还必须在注入它的模块中注册。

除了特定的事件侦听器装饰符外，还可以使用泛型 `@OnQueueEvent()` 装饰师与 `BullQueueEvents` 或者 `BullQueueGlobalEvents` 枚举。参见 [Events section of the Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#events) 了解更多关于活动的信息。

#### 队列管理

队列有一个 API 用于管理功能，如暂停和恢复，以及检索各种状态下的作业计数。有关完整的 API，请参见 [Queue section of the Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。直接在 `Queue` 对象上调用这些方法，如下面的暂停和恢复示例所示。

暂停队列 `pause()` 方法。暂停的队列在恢复之前不会处理新作业，但已经处理的作业会继续处理，直到完成。

```typescript
await audioQueue.pause();
```

若要恢复暂停的队列，请使用 `resume()` 方法，如下：

```typescript
await audioQueue.resume();
```

#### 单独工艺

作业处理程序也可以在单独的（分叉的）进程中运行（请参见 [Separate processes](https://github.com/OptimalBits/bull#separate-processes) 在公牛文档中）。这有几个优点：

- 该过程是沙盒式的，因此如果它崩溃，工人不会受到影响。
- 您可以在不影响队列的情况下运行阻塞代码（作业不会停滞）。
- 更好地利用多核 CPU。
- 到 Redis 的连接较少。

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { join } from 'node:path';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audio',
      processors: [join(import.meta.dirname, 'processor.js')],
    }),
  ],
})
export class AppModule {}
```

因为您的函数在分叉进程中运行，所以依赖注入（和 IoC 容器）不可用。处理器函数必须包含（或创建）它需要的所有外部依赖项实例。

```ts
import { Job, DoneCallback } from 'bull';

export default function (job: Job, cb: DoneCallback) {
  console.log(`[${process.pid}] ${JSON.stringify(job.data)}`);
  cb(null, 'It works');
}
```

#### 异步配置

你可能想通过 `bull` 选项异步而不是静态。在这种情况下，使用 `forRootAsync()` 方法，它提供了几种处理异步配置的方法。

一种方法是使用工厂函数：

```typescript
BullModule.forRootAsync({
  useFactory: () => ({
    redis: {
      host: 'localhost',
      port: 6379,
    },
  }),
});
```

工厂的行为类似于任何其他 [异步提供程序](/fundamentals/async-providers)（例如，它可以是 `async`，并且可以通过 `inject` 注入依赖项）。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    redis: {
      host: configService.get('QUEUE_HOST'),
      port: configService.get('QUEUE_PORT'),
    },
  }),
  inject: [ConfigService],
});
```

或者，您可以使用 `useClass` 语法：

```typescript
BullModule.forRootAsync({
  useClass: BullConfigService,
});
```

上面的构造在 `BullModule` 中实例化了 `BullConfigService`，并通过调用 `createSharedConfiguration()` 使用它来提供一个 options 对象。这意味着 `BullConfigService` 必须实现 `SharedBullConfigurationFactory` 接口，如下所示：

```typescript
@Injectable()
class BullConfigService implements SharedBullConfigurationFactory {
  createSharedConfiguration(): BullRootModuleOptions {
    return {
      redis: {
        host: 'localhost',
        port: 6379,
      },
    };
  }
}
```

重用从不同模块导入的提供程序，而不是创建 `BullConfigService` 内部 `BullModule`，使用 `useExisting` 句法。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});
```

这种构造的工作原理与 `useClass` 有一个关键的区别：`BullModule` 查找导入的模块以重用现有模块 `ConfigService` 而不是实例化一个新的。

同样，若要异步传递队列选项，请使用 `registerQueueAsync()` 方法。指定 `name` 工厂函数外部的属性。

```typescript
BullModule.registerQueueAsync({
  name: 'audio',
  useFactory: () => ({
    redis: {
      host: 'localhost',
      port: 6379,
    },
  }),
});
```

#### 例子

[26 尾样品](https://github.com/nestjs/nest/tree/master/sample/26-queues) 中提供了一个工作示例。
