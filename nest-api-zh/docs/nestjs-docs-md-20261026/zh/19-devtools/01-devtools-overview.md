# Overview

Source: https://docs.nestjs.com/devtools/overview

> info **Hint** 本章涵盖 NestDevtools 与 Nest 框架。如果您正在查找 Devtools 应用程序，请访问 [Devtools](https://devtools.nestjs.com) 网站。

NestDevtools 为您提供了应用程序内部的交互式、始终最新的视图：模块、提供程序、控制器以及将它们联系在一起的路由和事件。你可以得到一个可以搜索、筛选和点击的实时图表，而不是从导入和构造函数签名中拼凑图片。本章将引导您首次将本地应用程序连接到 Devtools。

开始只需不到五分钟。打开你的 `main.ts` 文件并设置 `snapshot` 归因于 `true` 在应用程序选项对象中：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    snapshot: true,
  });
  await app.listen(3000);
}
```

这说明 Nest 为了收集元数据，Devtools 需要重建和可视化应用程序的依赖图。

接下来，安装 Devtools 集成包：

```bash
$ npm i @nestjs/devtools-integration
```

安装软件包后，打开 `app.module.ts` 并导入 `DevtoolsModule`：

```typescript
@Module({
  imports: [
    DevtoolsModule.register({
      http: process.env.NODE_ENV !== 'production',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

> info **Note** 我们检查 `NODE_ENV` 这里是因为 `DevtoolsModule` 永远不应该投入生产。

这个 `http` 标志控制是否 `DevtoolsModule` 启动内省服务器。禁用标志后，模块不会暴露任何内容，如果这种配置意外通过了审查，这就是您想要的安全网。运行时开销可以忽略不计：`snapshot` 启用，Nest 在应用程序引导时收集一次图形元数据，因此应用程序的常规请求处理不受影响。

一次 `DevtoolsModule` 正在导入并且您的应用程序正在运行（`npm run start:dev`)，打开 [Devtools](https://devtools.nestjs.com) 看看你的自省图。

<figure><img src="https://docs.nestjs.com/assets/devtools/modules-graph.png" /></figure>

> info **Hint** 每个模块连接到 `InternalCoreModule`，一个全局模块 Nest 总是导入到根模块中。因为它是全球注册的，Nest 在它和应用程序中的每个其他模块之间画一条边。要清理视图，请选中侧边栏中的**隐藏全局模块**复选框。

在底层，`DevtoolsModule` 启动一个轻量级的 HTTP 服务器（默认情况下在端口 8000 上），仪表板使用该服务器实时内省您的应用程序。不需要额外的配置。如果端口 8000 被占用，请使用 `DevtoolsModule.register()` 的 `port` 选项传递另一个端口。

要确认所有内容都连接正确，请将图形视图切换到“类”。你应该看到这样的东西：

<figure><img src="https://docs.nestjs.com/assets/devtools/classes-graph.png" /></figure>

单击任何节点以打开带有**“焦点”**按钮的弹出窗口，该按钮将其隔离在图表上，或者使用侧边栏中的搜索栏跳转到特定节点。

> info **Hint** 单击**检查**将带您进入 `/debug` 预先选定节点的页面，这对于挖掘特定提供程序或控制器非常有用。

<figure><img src="https://docs.nestjs.com/assets/devtools/node-popup.png" /></figure>

> info **Hint** 需要文档快照或拉取请求？单击**导出为 PNG**在图表的右下角。

侧边栏控件允许您缩小边接近度，这有助于您放大应用程序的特定分支：

<figure><img src="https://docs.nestjs.com/assets/devtools/subtree-view.png" /></figure>

这是一个很好的方式来加入**新团队成员**，向他们展示应用程序是如何组合在一起的。当您提取模块时，它同样有用（例如，`TasksModule`）以及它的所有依赖项，然后再将大型应用程序拆分成较小的服务。

Graph Explorer 中的所有内容都与您正在运行的应用程序保持同步：刷新，您对模块或提供程序所做的任何更改都会立即反映出来。没有构建步骤或单独的文档来保持最新；图表**是**文档。

查看**图表资源管理器**的实际应用：

<figure>
  <iframe
    width="1000"
    height="565"
    src="https://www.youtube.com/embed/bW8V-ssfnvM"
    title="YouTube video player"
    frameBorder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</figure>

#### 调试“无法解析依赖关系”错误

> info **Note** 可用于 `@nestjs/core`9.3.10 及以上。

如果你和 Nest 有一段时间，您可能遇到了**“无法解析依赖关系”**错误。这通常是新团队成员看到的第一个错误，在大型应用程序上很难追踪到：堆栈跟踪会告诉您缺少什么，但不会告诉您原因，也不会告诉您在深度嵌套的提供者链中哪里断线。Devtools 将这从一个猜测游戏变成了一个快速、可视化的诊断。

首先更新 `main.ts` 中的 `bootstrap()` 调用：

```typescript
bootstrap().catch((err) => {
  writeFileSync('graph.json', PartialGraphHost.toString() ?? '');
  process.exit(1);
});
```

> info **Hint** `PartialGraphHost` 从 `@nestjs/core` 导出，`writeFileSync` 从 `node:fs` 导出。

您还需要将 `abortOnError` 设置为 `false`：

```typescript
const app = await NestFactory.create(AppModule, {
  snapshot: true,
  abortOnError: false, // <--- THIS
});
```

从现在开始，每当您的应用程序引导失败时，出现**“无法解析依赖关系”**错误，它就会写入一个 `graph.json` 将文件（局部图）文件到您的项目根。将文件拖放到 Devtools 中（首先从“交互式”切换到“预览”模式），以准确查看哪里出了问题：

<figure><img src="https://docs.nestjs.com/assets/devtools/drag-and-drop.png" /></figure>

上传后，您将看到图表以及总结所发生情况的对话框：

<figure><img src="https://docs.nestjs.com/assets/devtools/partial-graph-modules-view.png" /></figure>

突出显示 `TasksModule` 是要调查的问题，对话框会告诉你如何修复它。

切换到“类”视图说明了整个故事：

<figure><img src="https://docs.nestjs.com/assets/devtools/partial-graph-classes-view.png" /></figure>

该图清楚地表明：`TasksService` 所依赖的 `DiagnosticsService` 在 `TasksModule` 上下文中不可用。解决方法是将 `DiagnosticsModule` 导入到 `TasksModule` 中。

否则，手动跟踪几个文件的导入，希望你没有错过一个，这将是一个缓慢的过程，变成了几次点击。这是一个很小的工作流程变化，但它可以在包含几十个模块的代码库中快速累加。

#### 路线探索

**路由资源管理器**页面显示应用程序注册的每个入口点：

<figure><img src="https://docs.nestjs.com/assets/devtools/routes.png" /></figure>

> info **Hint** 此页面不限于 HTTP 道路。它还包括 WebSockets，gRPC,GraphQL 解析器等等。

入口点由其主机控制器分组，您可以使用搜索栏跳转到您要查找的入口点。

单击任何入口点以显示其完整执行路径的**流程图**：绑定到该路径的每个防护装置、拦截器和管道。这是了解请求如何在您的应用程序中传输的最快方法，或者找出为什么特定的防护、拦截器或管道在您期望的时候没有运行。

这种观点在有机增长的应用程序中最有价值，在这些应用程序中，相同的防护可能在一个地方的控制器级别上应用，而在另一个地方的每个路由上应用。您不必阅读分散在代码库中的装饰符，而是获得该路由的实际的、已解析的执行顺序。

#### 操场

要针对应用程序运行代码而不重新部署，请打开**Playground**页面：

<figure><img src="https://docs.nestjs.com/assets/devtools/sandbox.png" /></figure>

Playground 允许您**实时**测试和调试端点，因此您可以跟踪问题，而无需访问单独的端点 HTTP 客户。您可以完全绕过身份验证层，跳过额外的登录步骤或专用测试帐户。对于事件驱动的应用程序，您可以直接从操场上触发事件，以准确查看应用程序的响应方式。

你的任何代码日志都会被传输到游乐场的控制台，所以你总是知道底层发生了什么。

运行代码**即时**并立即看到结果，无需重建或服务器重启。

> info **Hint** 游乐场请求使用沙盒会话令牌进行身份验证。每次应用程序启动时，`DevtoolsModule` 都会生成一个新令牌，并将其打印到控制台（`Sandbox session token: ...`）。将此令牌提供给 Devtools，以便在操场上运行代码。

<figure><img src="https://docs.nestjs.com/assets/devtools/sandbox-table.png" /></figure>

> info **Hint** 使用 `console.table()`（或 `table()`) 来漂亮地打印一个对象数组。

观看**游乐场**的实际情况：

<figure>
  <iframe
    width="1000"
    height="565"
    src="https://www.youtube.com/embed/liSxEN_VXKM"
    title="YouTube video player"
    frameBorder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</figure>

#### 引导性能分析器

要了解是什么减慢了应用程序的启动速度，请打开**引导性能**页面。它列出了每个类节点（控制器、提供程序、增强器等）及其实例化时间：

<figure><img src="https://docs.nestjs.com/assets/devtools/bootstrap-performance.png" /></figure>

这是发现引导过程中最慢部分的最快方法。当启动时间处于关键路径时，这一点最为重要，例如在无服务器环境中，每一毫秒都很重要。

缓慢的引导通常有几个常见的原因：构造函数内部繁重的同步工作，提供程序等待缓慢的外部调用 `onModuleInit`，或者一个模块实例化的依赖关系远远超过它需要的。按实例化时间排序，此页面使那些异常值一目了然，而无需散布 `console.time()` 调用整个代码库。

#### 审计

Devtools 会自动分析您的序列化图表，并显示值得您注意的错误、警告和提示。您可以在**审核**页面上找到它们：

<figure><img src="https://docs.nestjs.com/assets/devtools/audit.png" /></figure>

> info **Hint** 上面的屏幕截图仅显示了可用审计规则的示例。

把它看作是应用程序体系结构的一个小工具：一种在问题抓住你之前抓住问题的快速方法。一些内置规则标记了您可能很难发现的问题：一个控制器携带的路由比它的邻居多得多，一个模块拉入了异常多的依赖项，一个提供者名为 `SomethingGuard` 从未注册为警卫或请求范围内的提供者，这是一个强有力的候选者 [持久供应商](/fundamentals/injection-scopes#durable-providers).您的测试套件不会捕捉到这些，但它们正是那种会随着时间的推移而减慢代码库速度的东西。

#### 预览静态文件

要将序列化图形保存到文件中，请使用以下代码：

```typescript
await app.listen(3000); // OR await app.init()
writeFileSync('./graph.json', app.get(SerializedGraph).toString());
```

> info **Hint** `SerializedGraph` 是从 `@nestjs/core` 导出的。

然后拖放（或上传）文件：

<figure><img src="https://docs.nestjs.com/assets/devtools/drag-and-drop.png" /></figure>

当您想与同事共享图表、将其附加到错误报告或在不运行应用程序的情况下离线分析图表时，这非常有用。
