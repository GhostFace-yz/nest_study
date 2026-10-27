# Overview

Source: https://docs.nestjs.com/observability/overview

[NestJS Observe](https://www.observe.nestjs.com/) 是官方的自动仪表应用程序性能监控（APM）和可观测性平台 NestJS 应用。安装 SDK, 添加 API 按下键，您的应用程序就会开始将请求、后台作业、错误、日志和跟踪流式传输到您的仪表板——无需手动跨度布线，无需运行收集器，无需设计模式，无需手动构建仪表板。

> info **Hint** 本章介绍了如何在 NestJS 与 `@nestjs/observe`SDK 以及仪器给你的东西。如果要查找仪表板本身，请转到 [observe.nestjs.com](https://www.observe.nestjs.com/)，或打开 [现场演示](https://www.observe-demo.nestjs.com/dashboard)- 繁忙服务数据上的完整仪表板，无需注册，也无需安装任何东西。

#### 它与仿制药有何不同 Node.jsAPM

通用的 Node.js APM 代理附加到 HTTP 服务器和数据库驱动程序，并将其间的所有内容作为黑盒保留。 NestJS 观察是围绕 Nest 自己的请求生命周期 - 控制器、防护装置、拦截器、管道、解析器、队列使用者 - 因此遥测是在您编写代码的词汇表中表示的： `OrdersService.recalculate`,不 `POST /orders` 这也是为什么它可以显示每次花费的时间 NestJS **类和方法**，不仅仅是每个路由，以及为什么来自未经修改的应用程序的跟踪瀑布读起来已经像一个调用图。

这个 SDK 通过 `instrument` 应用选项 `NestFactory.create()`（自 `@nestjs/core`v11.1.4），因此它将每个控制器、提供程序、解析器和队列使用者视为 Nest 将它们连接起来——没有进程范围的修补，也没有任何东西需要在代码的其余部分之前导入。

#### 它提供什么

一旦 SDK 运行时，每个计划 - 包括免费层 - 为您提供：

- **请求监控**HTTP,GraphQL,gRPC，和 `@nestjs/microservices` 传输：吞吐量、延迟（平均值和 p95）、每次操作的故障率以及每次执行的详细信息页面。
- **分布式跟踪**具有请求运行的每个跨度的瀑布，自时间排名以查找时间实际去了哪里，以及一旦跟踪 id 被传播，跨服务的相关性（参见 [Distributed tracing](/observability/distributed-tracing)）。
- **使用堆栈跟踪、故障帧周围的源代码线以及服务器端将事件分组为缺陷进行**错误监控**。
- **作业**-队列使用者和 cron 运行（例如 BullMQ）得到与请求相同的处理，加上队列等待时间和重试尝试。
- **服务** - 应用程序中每个类、每个方法的自有时间与总时间的明细。
- **运行时分析** -CPU、内存、事件循环延迟和利用率以及垃圾收集，从进程内部采样并对每个实例进行比较。
- **发布** - 每个请求和作业都会记录为其提供服务的版本，因此部署引入的回归立即可见。
- **自定义指标** - 从您自己的代码报告的计数器、仪表和汇总。
- **用户** - 当您的应用程序报告用户标识符时，按用户实际执行的操作分组。
- **复制代理提示** - 只需单击一下，即可将失败的请求、缓慢的作业或失败的跟踪转换为编码代理的独立提示。

付费计划添加**日志流**（与跟踪相关，默认情况下启用编辑）、**警报**（阈值、异常检测、缺勤检测、Slack/webhook/电子邮件通道）、**问题**、团队管理和**MCP 服务器** 类似 MCP-兼容代理可以直接查询您的遥测信息并设置新服务（请参阅 [MCP 服务器](/observability/mcp-server)).更高层次添加**SSO**和**SLOs**带有错误预算和燃烧率警报。

#### 如何组织

NestJSObserve 将您的遥测分为三层：

- **团队**是用户的集合。每个项目恰好属于一个团队，团队成员资格是您授予某人一次访问多个项目的方式。订阅由每个团队管理。
- **项目**是一起发布的应用程序的集合，通常每个产品或环境一个（例如 `storefront-production`, `storefront-staging`).项目是什么警报、问题、SLO 和 API 键的范围是。
- **应用程序**是一个单一的 NestJS 服务-aRESTAPI，一个工人，一个微服务——用 SDK 并向项目报告。一个项目通常有多个应用程序（webAPI 以及它后面的队列工作者，例如），因此您可以将它们视为一个系统，同时仍然过滤到其中一个系统。

<figure><img src="https://www.observe.nestjs.com/docs/overview/projects.webp" alt="Projects overview" /></figure>

每个项目成员都有三个访问级别之一 - **读**、**写**或**管理** - 控制他们是否可以查看遥测、创建警报规则、应用程序和 API 键，或管理成员和支出控制。

#### 订阅

注册于 [observe.nestjs.com](https://www.observe.nestjs.com/)**免费**计划不需要付款详细信息，并且已经包括错误监控、分布式跟踪和自动检测，因此您可以对应用程序进行检测并查看真实的跟踪，然后再决定是否需要更多。

使用情况在**可观察性事件（OEs）**中计量——每个请求、后台作业运行、错误、日志条目或应用程序报告跟踪一个事件。事件相加而不是合并：一个请求运行了您自己的三个方法，写入了两个日志行，并引发了一个错误，这就是七个事件。代理自己的数据库-查询和出站-HTTP 跨度不计数，因为它们是已经计数的方法跨度的详细信息。您的计划设置了包含活动的每月限额、保留窗口以及解锁的功能：

| 计划 | 包含事件/月 | 保留 | 日志和警报 | SSO&SLOs |
| ---------- | ----------------------: | ---------- | ------------- | ---------- |
| 自由的 | 30 万 | 3 天 | ✗ | ✗ |
| 支持者 | 25 米 | 30 天 | ✓ | ✗ |
| 比例 | 200 米 | 90 天 | ✓ | ✓ |
| 企业 | 协商 | 协商 | ✓ | ✓ |

免费有一个严格的每月限制——一旦达到，摄入将被拒绝，直到下一个周期。Pro 和 Scale 允许超额，而不是硬停止，每增加一百万个事件计费，因此繁忙的一个月并不意味着遥测丢失。年度账单相对于每月价格打折。有关当前价格、座位数和超额率，请参阅 [定价页面](https://www.observe.nestjs.com/).

要升级，请为拥有您的项目的团队打开**计费→管理订阅**。在同一区域，**使用**页面根据津贴跟踪您的可观察性事件，按项目细分，并允许您设置**配额通知**（最多五个阈值，例如 50%、80%、100%），以便在使用超过一个阈值时收到一封电子邮件。

> info **Hint** 通过每个项目**支出控制**，无需重新部署即可控制摄入量：跟踪一致跨度采样、每分钟速率上限以及针对已知噪声流量的下降过滤器，例如 `/health*`.这些控件从不对错误进行采样或丢弃。您还可以完全停止在 上生成遥测数据 SDK 侧视图 [Ignoring noisy operations](/observability/sdk#ignoring-noisy-operations).

#### 第一个项目

第一个项目的最快方式从您的终端开始。运行 `npx @nestjs/observe link` 在项目目录中，并批准其打印的代码 [observe.nestjs.com/link](https://www.observe.nestjs.com/link)，如果您没有帐户，请先注册。如果您还没有项目和应用程序，则批准将创建它们并发布一个 API 键，命令将其写入项目的 `.env`.如果应用程序不使用 [SDK](/observability/sdk) 然而，该命令还安装了它并将其连接到-参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal).由 `nest new` with Observe 在安装后提供了这一步。

相反，从仪表板开始，新帐户会提供一个简短的**设置指南**，该指南会穿过实际页面 - 它突出显示*创建项目*，然后带您进入新项目添加应用程序和 API 键，并在等待您的第一个事件的横幅上结束。手动相同的步骤：

1. **创建一个项目**并给它起一个名字。
2. **向其添加应用程序**。应用程序只需要一个名称——它服务的路由、它处理的作业以及它报告的度量都是从遥测中发现的。SDK 发送。
3. **生成一个 API 项目**中的密钥**API 钥匙**页面。每个键都有一个名称（一个用于本地开发，一个用于 CI，一个用于生产）和可选的有效期。密钥对（`appKey` 和 `appSecret`) 在创建时显示一次，因此请立即将其复制到您的秘密存储中。密钥是针对一个项目的：其遥测应该在该项目中着陆的每个应用程序都使用相同的密钥。
4. **通过遵循以下步骤来规范您的申请**[SDK](/observability/sdk) 篇章。在您的应用程序接收流量后不久，遥测就开始出现。

> info **Hint** 如果您使用编码代理进行设置，请使用显示新密钥秘密的对话框中的**复制设置提示**按钮。它将安装命令、三个代码编辑和凭据组合成一个提示符。连接到 [MCP 服务器](/observability/mcp-server#setting-up-a-service) 可以创建应用程序和密钥本身。

<figure><img src="https://www.observe.nestjs.com/docs/applications/api-keys.webp" alt="API keys" /></figure>

> warning **Warning** 治疗 `appKey` 和 `appSecret` 像任何其他凭证一样：从环境变量或秘密管理器中读取它们，永远不要将它们提交给源代码控制。您可以随时从同一页面撤销密钥；仍在使用它的应用程序不能再发送遥测。

#### 下一步去哪里

- [SDK](/observability/sdk)-安装、三线快速启动和每个配置选项。
- [Manual instrumentation](/observability/manual-instrumentation)-自定义跨度、处理错误、请求范围属性和自定义度量。
- [Distributed tracing](/observability/distributed-tracing)-跨 HTTP、gRPC、微服务传输和 GraphQL 传播跟踪 id。
- [Error monitoring](/observability/error-monitoring)-捕获什么，源上下文，将错误分组为缺陷，以及从错误到经过验证的修复。
- [Dashboard](/observability/dashboard)-遥测一旦流动，每个视图显示什么，以及警报、SLO 和问题如何建立在它的基础上。
- [MCP 服务器](/observability/mcp-server)-从 Claude 代码、光标、VS 代码，或者你自己的代理。
