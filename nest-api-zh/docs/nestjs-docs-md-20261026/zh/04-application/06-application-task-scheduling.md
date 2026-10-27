# Task scheduling

Source: https://docs.nestjs.com/application/task-scheduling

任务调度允许您在固定的日期和时间、重复的间隔或在指定的延迟后运行任意代码（方法或函数）。在 Linux 世界中，这通常由 [克朗](https://en.wikipedia.org/wiki/Cron) 这样的工具在 OS 级别处理。对于 Node.js 应用程序，几个包模拟了类似 cron 的功能。Nest 提供了 `@nestjs/schedule` 包，该包与流行的 Node.js[克朗](https://github.com/kelektiv/node-cron) 包集成。本章涵盖 `@nestjs/schedule` 包。

#### 安装

要开始使用它，请安装所需的依赖项。

```bash
$ npm install --save @nestjs/schedule
```

要激活作业调度，请导入 `ScheduleModule` 深入根源 `AppModule` 并称之为 `forRoot()` 静态方法，如下所示：

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot()
  ],
})
export class AppModule {}
```

这个 `forRoot()` 调用初始化调度程序，并注册应用程序中存在的任何声明性<a href="application/task-scheduling#declarative-cron-jobs">cron jobs</a>、<a href="application/task-scheduling#declarative-timeouts">timeouts</a>和<a href="application/task-scheduling#declarative-intervals">intervals</a>。计划的作业从 `onApplicationBootstrap` 生命周期挂钩，它确保所有模块都已加载并声明了它们的计划作业。

> warning **Warning** 呼吁 `forRoot()` 仅在一个模块中。每个额外的导入注册每个 `@Cron()`,`@Interval()` 和 `@Timeout()` 处理程序再次在您的应用程序中，因此将其导入三个模块会使每个作业运行三次。

#### 声明式 cron 作业

cron 作业调度任意函数（方法调用）自动运行。Cron 作业可以运行：

- 一次，在指定的日期和时间。
- 在重复的基础上。重复作业可以在指定间隔内的指定时刻运行（例如，每小时一次、每周一次、每 5 分钟一次）。

通过应用 `@Cron()`decorator 到包含要执行的代码的方法，如下所示：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  @Cron('45 * * * * *')
  handleCron() {
    this.logger.debug('Called when the current second is 45');
  }
}
```

在这个例子中，每当当前秒是 `45` 时，都会调用 `handleCron()` 方法。换句话说，该方法每分钟运行一次，在 45 秒标记处。

`@Cron()` 装饰器支持以下标准 [cron 模式](http://crontab.org/)：

- 星号（例如，`*`）
- 范围和列表（例如，`1-3,5`）
- 步骤（例如，`*/2`）

在上面的例子中，我们通过了 `45 * * * * *` 给装修师。以下键显示了如何解释 cron 模式字符串中的每个位置：

<pre class="language-javascript"><code class="language-javascript">
* * * * * *
| | | | | |
| | | | | day of week
| | | | months
| | | day of month
| | hours
| minutes
seconds (optional)
</code></pre>

一些示例 cron 模式是：

<table>
  <tbody>
    <tr>
      <td><code>* * * * * *</code></td>
      <td>every second</td>
    </tr>
    <tr>
      <td><code>45 * * * * *</code></td>
      <td>every minute, on the 45th second</td>
    </tr>
    <tr>
      <td><code>0 10 * * * *</code></td>
      <td>every hour, at the start of the 10th minute</td>
    </tr>
    <tr>
      <td><code>0 */30 9-17 * * *</code></td>
      <td>every 30 minutes between 9am and 5pm</td>
    </tr>
   <tr>
      <td><code>0 30 11 * * 1-5</code></td>
      <td>Monday to Friday at 11:30am</td>
    </tr>
  </tbody>
</table>

这个 `@nestjs/schedule` 包提供 `CronExpression` 具有常用 cron 模式的枚举。您可以按如下方式使用此枚举：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  @Cron(CronExpression.EVERY_30_SECONDS)
  handleCron() {
    this.logger.debug('Called every 30 seconds');
  }
}
```

在本例中，`handleCron()` 方法被调用为每个 `30` 秒。每个方法都注释了 `@Cron()` 自动包装在 `try-catch` 块，所以如果发生异常，它会被记录到控制台。

或者，您可以提供 JavaScript`Date` 反对 `@Cron()` 装修师。这会导致作业在指定日期恰好执行一次。

> info **Hint** 使用 JavaScript 相对于当前日期安排作业的日期算术。例如，`@Cron(new Date(Date.now() + 10 * 1000))` 安排作业在应用程序启动后 10 秒运行。

还可以将其他选项作为第二个参数提供给 `@Cron()` 装修师。

<table>
  <tbody>
    <tr>
      <td><code>name</code></td>
      <td>
        Lets you access and control a cron job after it's been declared.
      </td>
    </tr>
    <tr>
      <td><code>timeZone</code></td>
      <td>
        Specifies the time zone for the execution. This modifies the actual time relative to your time zone. If the time zone is invalid, an error is thrown. You can check all available time zones on the <a href="http://momentjs.com/timezone/">Moment Timezone</a> website.
      </td>
    </tr>
    <tr>
      <td><code>utcOffset</code></td>
      <td>
        Specifies the offset of your time zone instead of using the <code>timeZone</code> option. Don't combine it with <code>timeZone</code>.
      </td>
    </tr>
    <tr>
      <td><code>waitForCompletion</code></td>
      <td>
        If <code>true</code>, no additional instances of the cron job run until the current <code>onTick</code> callback completes. Any new scheduled executions that occur while the current cron job is running are skipped entirely.
      </td>
    </tr>
    <tr>
      <td><code>disabled</code></td>
      <td>
        If <code>true</code>, the job is not executed at all (defaults to <code>false</code>).
      </td>
    </tr>
  </tbody>
</table>

```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotificationService {
  @Cron('* * 0 * * *', {
    name: 'notifications',
    timeZone: 'Europe/Paris',
  })
  triggerNotifications() {}
}
```

使用<a href="/application/task-scheduling#dynamic-schedule-module-api">动态 API</a>，您可以在 cron 作业声明后访问和控制它，或者动态创建 cron 作业（在运行时定义其 cron 模式）。要通过 API，必须通过传递 `name`options 对象中的属性（装饰器的可选第二个参数）。

#### 声明性区间

若要声明方法应以指定的（循环）间隔运行，请在方法定义前面加上 `@Interval()` 装修师。将间隔值作为以毫秒为单位的数字传递给装饰器，如下所示：

```typescript
@Interval(10000)
handleInterval() {
  this.logger.debug('Called every 10 seconds');
}
```

> info **Hint** 该机制使用 JavaScript`setInterval()` 底层的功能。您还可以使用 cron 作业来安排重复作业。

通过<a href="/application/task-scheduling#dynamic-schedule-module-api">从声明类外部控制声明间隔 API</a>，使用以下构造将间隔与名称相关联：

```typescript
@Interval('notifications', 2500)
handleInterval() {}
```

每个方法都注释了 `@Interval()` 自动包装在 `try-catch` 块，所以如果发生异常，它会被记录到控制台。

<a href="application/task-scheduling#dynamic-intervals">动态 API</a>还支持**创建**动态间隔，其中间隔的属性在运行时定义，并**列出和删除**它们。

#### 声明性超时

若要声明方法应在指定超时后运行一次，请在方法定义前面加上 `@Timeout()` 装修师。将应用程序启动后的时间偏移（以毫秒为单位）传递给装饰器，如下所示：

```typescript
@Timeout(5000)
handleTimeout() {
  this.logger.debug('Called once after 5 seconds');
}
```

> info **Hint** 该机制使用 JavaScript`setTimeout()` 底层的功能。

每个方法都注释了 `@Timeout()` 自动包装在 `try-catch` 块，所以如果发生异常，它会被记录到控制台。

通过<a href="/application/task-scheduling#dynamic-schedule-module-api">从声明类外部控制声明超时 API</a>，使用以下构造将超时与名称相关联：

```typescript
@Timeout('notifications', 2500)
handleTimeout() {}
```

<a href="应用程序/任务调度#动态超时">动态 API</a>还支持**创建**动态超时，超时的属性在运行时定义，并**列出和删除**它们。

#### 动态调度模块 API

这个 `@nestjs/schedule` 模块提供动态 API 用于管理声明性<a href="application/task-scheduling#declarative-cron-jobs">cron jobs</a>、<a href="application/task-scheduling#declarative-timeouts">timeouts</a>和<a href="application/task-scheduling#declarative-intervals">intervals</a>。这个 API 还允许您创建和管理**动态**cron 作业、超时和间隔，其属性是在运行时定义的。

#### 动态 cron 作业

使用 `SchedulerRegistry`API 从代码中的任何位置按名称获取对 `CronJob` 实例的引用。首先，使用标准构造函数注入注入 `SchedulerRegistry`：

```typescript
constructor(private schedulerRegistry: SchedulerRegistry) {}
```

> info **Hint** 导入 `SchedulerRegistry` 从 `@nestjs/schedule` 包装。

然后在课堂上使用它。假设使用以下声明创建了 cron 作业：

```typescript
@Cron('* * 8 * * *', {
  name: 'notifications',
})
triggerNotifications() {}
```

使用以下方法访问此作业：

```typescript
const job = this.schedulerRegistry.getCronJob('notifications');

job.stop();
console.log(job.lastDate());
```

这个 `getCronJob()` 方法返回命名的 cron 作业。返回的 `CronJob` 对象具有以下方法：

- `stop()`- 停止计划运行的作业。
- `start()`- 重新启动已停止的作业。
- `setTime(time: CronTime)`- 停止作业，为其设置新的时间，然后开始作业。
- `lastDate()`-返回 aJavaScript`Date` 表示作业的最后一次执行，或 `null` 如果它还没有运行。
- `nextDate()`-返回 a`DateTime` 计划作业的下一次执行日期的表示。
- `nextDates(count: number)`-返回一个数组（大小为 `count`）的 `DateTime` 将触发作业执行的下一组日期的表示。`count` 默认值为 0，这将返回一个空数组。

> info **Hint** 在 `DateTime` 对象（[Luxon](https://moment.github.io/luxon/) 类型）上调用 `toJSDate()` 将其转换为等效的 JavaScript`Date`。

**使用 `SchedulerRegistry#addCronJob` 方法，如下：

```typescript
addCronJob(name: string, seconds: string) {
  const job = new CronJob(`${seconds} * * * * *`, () => {
    this.logger.warn(`time (${seconds}) for job ${name} to run!`);
  });

  this.schedulerRegistry.addCronJob(name, job);
  job.start();

  this.logger.warn(
    `job ${name} added for each minute at ${seconds} seconds!`,
  );
}
```

此代码使用 `CronJob` 来自 `cron` 创建 cron 作业的包。这个 `CronJob` 构造函数采用 cron 模式（如 `@Cron()`<a href="application/task-scheduling#declarative-cron-jobs">decorator</a>) 作为其第一个参数，并在 cron 计时器触发时执行回调作为其第二个参数。这个 `SchedulerRegistry#addCronJob` 方法接受两个参数：`CronJob`，以及 `CronJob` 对象本身。

> warning **Warning** 记得注射 `SchedulerRegistry` 在访问它之前。进口 `CronJob` 从 `cron` 包装。

**删除**使用 `SchedulerRegistry#deleteCronJob` 方法，如下：

```typescript
deleteCron(name: string) {
  this.schedulerRegistry.deleteCronJob(name);
  this.logger.warn(`job ${name} deleted!`);
}
```

**列出**使用的所有 cron 作业 `SchedulerRegistry#getCronJobs` 方法，如下：

```typescript
getCrons() {
  const jobs = this.schedulerRegistry.getCronJobs();
  jobs.forEach((value, key, map) => {
    let next;
    try {
      next = value.nextDate().toJSDate();
    } catch (e) {
      next = 'error: next fire date is in the past!';
    }
    this.logger.log(`job: ${key} -> next: ${next}`);
  });
}
```

这个 `getCronJobs()` 方法返回 `Map`.此代码遍历映射并调用 `nextDate()` 每种方法 `CronJob`.在 `CronJob` API, `nextDate()` 如果作业已经解雇且没有将来的解雇日期，则引发异常。

#### 动态间隔

获取对区间的引用 `SchedulerRegistry#getInterval` 方法。如上所述，注射 `SchedulerRegistry` 使用标准构造函数注入：

```typescript
constructor(private schedulerRegistry: SchedulerRegistry) {}
```

然后按如下方式使用：

```typescript
const interval = this.schedulerRegistry.getInterval('notifications');
clearInterval(interval);
```

**使用 `SchedulerRegistry#addInterval` 方法，如下：

```typescript
addInterval(name: string, milliseconds: number) {
  const callback = () => {
    this.logger.warn(`Interval ${name} executing at time (${milliseconds})!`);
  };

  const interval = setInterval(callback, milliseconds);
  this.schedulerRegistry.addInterval(name, interval);
}
```

这段代码创建了一个标准 JavaScript 间隔，然后将其传递给 `SchedulerRegistry#addInterval` 方法。
该方法接受两个参数：间隔的名称和间隔本身。

**删除**使用 `SchedulerRegistry#deleteInterval` 方法，如下：

```typescript
deleteInterval(name: string) {
  this.schedulerRegistry.deleteInterval(name);
  this.logger.warn(`Interval ${name} deleted!`);
}
```

**列出**使用 `SchedulerRegistry#getIntervals` 方法，如下：

```typescript
getIntervals() {
  const intervals = this.schedulerRegistry.getIntervals();
  intervals.forEach(key => this.logger.log(`Interval: ${key}`));
}
```

#### 动态超时

获取对超时的引用 `SchedulerRegistry#getTimeout` 方法。如上所述，注射 `SchedulerRegistry` 使用标准构造函数注入：

```typescript
constructor(private readonly schedulerRegistry: SchedulerRegistry) {}
```

然后按如下方式使用：

```typescript
const timeout = this.schedulerRegistry.getTimeout('notifications');
clearTimeout(timeout);
```

**使用 `SchedulerRegistry#addTimeout` 方法，如下：

```typescript
addTimeout(name: string, milliseconds: number) {
  const callback = () => {
    this.logger.warn(`Timeout ${name} executing after (${milliseconds})!`);
  };

  const timeout = setTimeout(callback, milliseconds);
  this.schedulerRegistry.addTimeout(name, timeout);
}
```

这段代码创建了一个标准 JavaScript 超时，然后将其传递给 `SchedulerRegistry#addTimeout` 方法。
该方法接受两个参数：超时的名称和超时本身。

**删除**使用 `SchedulerRegistry#deleteTimeout` 方法，如下：

```typescript
deleteTimeout(name: string) {
  this.schedulerRegistry.deleteTimeout(name);
  this.logger.warn(`Timeout ${name} deleted!`);
}
```

**列出**使用 `SchedulerRegistry#getTimeouts` 方法，如下：

```typescript
getTimeouts() {
  const timeouts = this.schedulerRegistry.getTimeouts();
  timeouts.forEach(key => this.logger.log(`Timeout: ${key}`));
}
```

#### 在多个实例上运行

调度程序运行应用程序每个进程中的每个作业。负载平衡器后面有三个实例，调度的作业 `@Cron('0 2 * * *')` 每晚运行三次：三次发票导出，三批提醒邮件。

若要每次在一个实例上运行作业，请添加 `@OnOneInstance()` 来自 [`@nestjs/locks`](/reliability/locks) 在它旁边 `@Cron()`,`@Interval()` 或者 `@Timeout()` 装饰师：

```typescript
import { Injectable } from '@nestjs/common';
import { OnOneInstance } from '@nestjs/locks';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class InvoicesJob {
  @Cron('0 2 * * *')
  @OnOneInstance({ key: 'invoices:nightly-export' })
  async exportInvoices() {
    // ...
  }
}
```

实例通过它们共享的锁存储进行协调，例如 PostgreSQL 数据库或 Redis.第一个触发作业的实例会租用它，并在作业启动时不断更新它，而其他实例则会跳过它们的勾号，而不是排队。如果所有者停止，另一个实例将在下一个时刻接管作业。一个可能花费超过其间隔时间的作业也会得到 `@WithoutOverlapping()`，当上一个运行仍在进行时，它会跳过一个刻度。 [Distributed locks](/reliability/locks) 显示如何注册模块和存储。

#### 知道 cron 作业实际运行

一个计划中的工作抛出是一个你会听说的问题。静默*停止调度*的调度作业（进程崩溃、容器取消调度、部署发送 `@Cron()` 带有错别字的表达式）是一个没有人听说过的问题，直到它生成的报告丢失。

这是 cron 监控存在的故障模式，并且 [NestJS Observe](https://www.observe.nestjs.com/) 无需第三方 ping 服务或心跳即可覆盖 URL 让工作在结束时呼叫。计划运行与队列使用者一起报告为**作业**，每个作业都有其持续时间、结果和失败原因。当指定作业未在您设置的容差范围内报告时（从 2 分钟到 7 天不等），**作业静默**警报规则将触发：*"如果出现以下情况，请提醒我 `daily-invoices` 在过去 26 小时内没有报告”*。

两个细节让它实用而不是嘈杂。从未报告过任何内容的作用域不会触发，因此您可以在作业发布之前添加规则，而无需分页尚未集成的内容。规则有一个重复的静音时间表，所以一份在周末不运行的工作不会在周六叫醒任何人。

需要报告自身进度的处理程序可以注入 `TracerService` 以及运行内部的记录跨度或自定义指标。特别是指标不绑定到跟踪，因此它们可以从 cron 作业和生命周期挂钩中报告。看 [Manual instrumentation](/observability/manual-instrumentation) 为此，以及 [Observability](/observability/overview) 设置章节。

#### 例子

[27-调度样本](https://github.com/nestjs/nest/tree/master/sample/27-scheduling) 中提供了一个工作示例。
