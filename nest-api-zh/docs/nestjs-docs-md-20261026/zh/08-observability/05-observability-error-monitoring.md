# Error monitoring

Source: https://docs.nestjs.com/observability/error-monitoring

错误监控包含在每个 [NestJS Observe](https://www.observe.nestjs.com/) 计划，包括免费，除了 [SDK](/observability/sdk).一旦您的应用程序被检测出来，每个逃离控制器、解析器或队列使用者的错误都会被捕获，同时捕获它中断的请求、抛出它的代码以及它进入的跟踪。本页涵盖了捕获的内容、事件如何被分组为缺陷、您如何被告知新的缺陷，以及错误如何变成经过验证的修复。

> info **Hint** 要在安装任何东西之前查看它，请打开 [现场演示](https://www.observe-demo.nestjs.com/dashboard)。它显示繁忙服务的错误、分组缺陷和带有源的堆栈跟踪，无需注册。

#### 捕获了什么

在 HTTP、GraphQL、gRPC 和 `@nestjs/microservices` 传输以及队列使用者和 cron 运行中，会自动记录从控制器、解析器、作业或跨度传播的错误。无需注册错误处理程序，也无需从您的 [异常筛选器](/exception-filters) 调用任何内容。过滤器仍然决定客户端看到什么，SDK 在到达那里的路上观察故障，所以两者并肩工作。

错误不会存储为独立的日志行。一个单独的错误_is_是失败的请求，因此它的详细信息页面是请求自己的页面，失败前导是：首先是错误类、消息、堆栈跟踪和源代码，然后是请求的上下文，然后是跟踪瀑布和在该请求期间写入的日志。当 HTTP 请求失败时，SDK 还会记录其标头的小允许列表，可选地记录其主体（参见 [Capturing failed and slow requests](/observability/sdk#capturing-failed-and-slow-requests)）。抛出的作业运行会在**Jobs**视图中记录为失败运行，并记录其失败原因和尝试次数。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/errors.webp" alt="Errors view" /></figure>

不是每个错误都是 bug。代码故意抛出的异常，例如 `NotFoundException` 或者一个失败的验证，仍然显示在**错误**视图中，因为它仍然是一个失败的请求，但它不算作警报的新缺陷。只有未处理的故障才会发生：请求回答为 5xx 的错误，或者在入口点上失败，回答为 noHTTP 任何状态，例如 RPC 处理程序或网关消息。

#### 源上下文

生产中的堆栈跟踪通常指向您尚未检出的编译输出。和 `sourceContext` 启用（默认值），SDK 读取捕获的错误的每个应用内帧周围的源代码行，并将其与之一起发送，以便仪表板在堆栈跟踪旁边显示失败代码：

```typescript
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  sourceContext: {
    linesOfContext: 5,
    maxFrames: 5,
  },
});
```

看看你的 TypeScript 而不是编译的 JavaScript,运行 Node 具有源映射支持（`--enable-source-maps`, 或 `process.setSourceMapsEnabled(true)`），或设置 `sourceContext.sourceMaps: true` 拥有 SDK 解析编译的帧本身。内部框架 `node_modules` 和 Node 内部文件从不被阅读。看 [Error source context](/observability/sdk#error-source-context) 对于每个选项。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

> warning **Warning** 源代码上下文将应用程序的几行源代码发送到您的仪表板，存储在错误旁边。设置 `sourceContext: false` 如果您的代码库不能接受发送任何源代码。

#### 处理错误

您捕获并从中恢复的错误永远不会传播，因此它永远不会自动捕获。如果您仍然希望它可见，请在 `TracerService` 上使用 `captureError()` 报告它：

```typescript
try {
  await this.billing.sync(accountId);
} catch (error) {
  await this.tracerService.captureError(error as Error, {
    accountId,
    retryable: 'true',
  });
}
```

该错误附加到当前跟踪，并在其旁边记录可选标记，并获得与任何其他捕获的错误相同的源上下文。参见 [Capturing handled errors](/observability/manual-instrumentation#capturing-handled-errors)。

#### 将错误分组为缺陷

峰值 3,140`TypeError`s 是一个 bug，不是 3140。错误页面上的**分组为缺陷**开关会将具有相同异常类和相同规范化堆栈形状的事件折叠成一个**错误组**，即服务器端的指纹识别，无论消息的措辞如何、移动了哪些行号，或者哪个部署生成了它。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/defects.webp" alt="Errors grouped into defects" /></figure>

一个组携带的是分类需求，而不是单个事件的详细信息：

| 领域 | 它告诉你什么 |
| ------------------------ | -------------------------------------------------------------------- |
| 类和示例消息 | 缺陷是什么，从它第一次出现开始 |
| 状况 | 打开、解决或忽略 |
| 第一次和最后一次见到 | 无论是新的、正在进行的还是已经消失的 |
| 介绍于 | 第一次发生时运行的版本，当它报告一个 |
| 事件 | 它在选定的窗口中触发的频率，而不是一直触发 |
| 发布 | 这个 [发布](/observability/dashboard#issues) 它被提升到，如果有的话 |

**Introduced in**来自应用程序报告的 `serviceVersion`（语义版本或提交散列，传递给 [`forRoot()`](/observability/sdk)）。没有它，一个团队就无法知道它是随哪个部署一起到达的。

这两个封闭状态是故意不对称的。**已解决**是关于代码的声明，因此一旦错误再次出现，已解决的组就会重新打开；一个不能保持表面的修复，而是保持安静的绿色。**忽略**是一个关于噪声的决定，并且保持忽略。

#### 收到通知

每个计划，包括免费的，都有一个内置的**新错误电子邮件**，没有规则设置：每个项目一封电子邮件，列出它从未见过的错误，每天最多六封。每个成员都可以在**设置→新建错误电子邮件**下自行关闭。

在付费计划中，[警报规则](/observability/dashboard#alerts) 继续：

- 当一个应用程序或整个项目首次出现缺陷时，**新错误组**规则将触发。它通过电子邮件、Slack、webhook 或应用内通知，或者通过打开问题进行通知。
- **错误率**规则根据固定阈值或根据其自身最近的异常检测基线监控应用程序或一个路由和方法的失败请求份额。
- **作业失败率**规则对队列使用者和 cron 运行也有同样的作用。

在更高层次上，可用性 [SLO](/observability/dashboard#slos)（没有未处理错误完成的请求份额）将相同的错误转换为带有燃烧率警报的错误预算。

#### 从错误到修复

因为每个错误已经携带了它的堆栈跟踪、源代码行、跟踪和日志，所以其页面上的**复制代理提示**将所有这些打包成一个独立的提示，用于编码代理，如 Claude Code、Cursor 或任何其他打开存储库的工具。连接到 [MCP 服务器](/observability/mcp-server) 可以自行更进一步：列出错误组及其引入版本，用它们的跟踪 id 提取最近发生的事件，判断错误是在增长还是在衰减，并查看它影响了哪些用户。

若要跟踪工作，请将错误组提升为 [发布](/observability/dashboard#issues) 只需点击一下；推广一个已经有一个公开问题的组会链接到它，而不是打开第二个。当您标记问题已解决（可选地将修复程序发送到的版本命名为版本）时，仪表板会根据事件前的基线监视受影响的操作，并在修复程序保持不变后关闭问题，或者使用破坏问题的读数重新打开问题。

部署后，**版本**视图会比较每个版本 `serviceVersion` 与之前的版本相比，包括错误率，因此回归显示为两个版本之间的差异，而不是一周图表中某个地方的凸起。
