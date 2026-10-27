# First steps

Source: https://docs.nestjs.com/first-steps

这组文章涵盖了 Nest 的**核心基础**。为了介绍 Nest 应用程序的基本组成部分，我们将构建一个基本的 CRUD 应用程序，其特性涵盖了入门级别的许多内容。

#### 语言

Nest 是用 [TypeScript](https://www.typescriptlang.org/) 编写的，在 [Node.js](https://nodejs.org/en/) 上运行，它支持 TypeScript 和普通 JavaScript。因为 Nest 依赖于最新的语言特性，所以将其与普通 JavaScript 一起使用需要 [Babel](https://babeljs.io/)。

本文档中的大多数示例使用 TypeScript，但您可以将任何代码片段**切换为普通代码片段 JavaScript 语法与代码片段右上角的语言切换。

#### 先决条件

确保 [Node.js](https://nodejs.org) 安装在您的操作系统上。运行一个 Nest 应用程序需要**v20.19 或更高版本**（或 22.x 行上的**v22.12+**）。这个 NestCLI 的生成器（例如 `nest new` 和 `nest generate`) 需要**v22.22.3+、v24.15+或 v26+**。我们推荐最新的活动 LTS 释放，满足这两个要求。

#### 设置

建立新项目的最快方法是使用 [Nest CLI](/cli/overview)。安装 [npm](https://www.npmjs.com/) 后，在终端中运行以下命令：

```bash
$ npm i -g @nestjs/cli
$ nest new project-name
```

CLI 询问使用哪个模块系统：ESM（默认值），它使用 Vitest 作为测试运行器，或者 CommonJS，它使用 Jest。

它还询问是否设置 [NestJS Observe](https://www.observe.nestjs.com/) 官方可观测性平台 Nest.如果回答是，则生成的项目包括 `@nestjs/observe` SDK，已经连接到 `AppModule` 和 `NestFactory.create()` 在交互式终端中，提示默认为是；在非交互式环境中，例如 CI，它被跳过，并且没有添加观察。通过 `--observe` 或者 `--no-observe` 以任何方式跳过提示。参见 [Observability](/observability/overview) 观察涵盖的章节。

如果设置 Observe， CLI 然后，一旦依赖项安装完毕，就会将新项目链接到它。接受打印代码以批准 [observe.nestjs.com/link](https://www.observe.nestjs.com/link) （如果您没有帐户，请先注册；免费计划不需要付款详情），以及 CLI 然后将应用程序密钥和秘密写入 `.env` 并使每一个 `nest start` 脚本（`start`, `start:dev`，和 `start:debug`) 加载它。下次启动应用程序时，请求、后台作业、错误和分布式跟踪开始报告。稍后链接，或者当 CLI 不提供（没有终端，或使用 `--skip-install`)，运行 `npx @nestjs/observe link` 在项目目录中 - 参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal).

> info **Hint** 新项目是在启用 TypeScript 的 [严格的](https://www.typescriptlang.org/tsconfig#strict) 模式的情况下生成的。要选择退出，请在生成的 `tsconfig.json` 中设置 `"strict": false`。

这个 CLI 创建一个 `project-name` 目录，安装依赖项，生成一些样板文件，并填充 `src/` 包含几个核心文件的目录。

<div class="file-tree">
  <div class="item">src</div>
  <div class="children">
    <div class="item">app.controller.spec.ts</div>
    <div class="item">app.controller.ts</div>
    <div class="item">app.module.ts</div>
    <div class="item">app.service.ts</div>
    <div class="item">main.ts</div>
  </div>
</div>

下表描述了这些核心文件：

| | |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `app.controller.ts` | 具有单一路由的基本控制器。 |
| `app.controller.spec.ts` | 控制器的单元测试。 |
| `app.module.ts` | 应用程序的根模块。 |
| `app.service.ts` | 具有单一方法的基本服务。 |
| `main.ts` | 应用程序的条目文件。它使用 `NestFactory` 创建一个 Nest 应用实例。 |

这个 `main.ts` 文件包含一个异步函数，可以**引导**应用程序：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

创建一个 Nest 应用程序实例，使用 `NestFactory` 来自 `@nestjs/core`，其中公开了一些用于此目的的方法。这个 `create()` 方法返回实现 `INestApplication` 接口。该对象的方法将在以下章节中描述。在 `main.ts` 在上面的示例中，应用程序启动 HTTP 监听并等待入站 HTTP 请求。

生成的项目结构 NestCLI 鼓励将每个模块保存在自己的专用目录中的惯例。

> info **Hint** 默认情况下，如果在创建应用程序时发生错误，进程将退出代码 `1`。要引发错误，请禁用 `abortOnError` 选项（例如，`NestFactory.create(AppModule, { abortOnError: false })`）。

#### 平台

Nest 被设计成与平台无关。平台独立性允许您创建可重用的逻辑部件，这些部件可以在几种不同类型的应用程序中使用。一旦为任何 Node.jsHTTP 框架创建了适配器，Nest 就可以与它一起工作。开箱即用支持两个 HTTP 平台：[Express](https://expressjs.com/) 和 [Fastify](https://www.fastify.io)。选择最适合你需求的。

| | |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform-express` | [Express](https://expressjs.com/) 是一个众所周知的极简 web 框架，用于 Node.js。这是一个久经考验的生产就绪库，拥有广泛的社区资源。Nest 默认使用 `@nestjs/platform-express` 包，因此不需要设置。 |
| `platform-fastify` | [Fastify](https://www.fastify.io/) 是一个高性能、低开销的框架，专注于效率和速度。要了解如何使用它，请参见 [Performance (Fastify)](/http/performance)。 |

每个平台都公开了自己的应用程序界面：`NestExpressApplication` 和 `NestFastifyApplication`，分别。

当您将类型传递给 `NestFactory.create()` 方法时，如下例所示，`app` 对象将公开仅在该平台上可用的方法。您不需要**指定类型，除非**您想要访问底层平台 API。

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
```

#### 运行应用程序

安装完成后，运行以下命令启动应用程序并监听入站 HTTP 请求：

```bash
$ npm run start
```

> info **Hint** 要加快开发构建速度，请通过将 `-b swc` 标志传递给 `start` 脚本：`npm run start -- -b swc` 来使用 [SWC 建造者](/recipes/swc)。

此命令启动 HTTP 中定义的端口上的服务器 `src/main.ts` 文件（`3000`，除非 `PORT` 环境变量已设置）。应用程序运行后，打开浏览器并导航到 `http://localhost:3000/`.你应该看到 `Hello World!` 消息。

若要监视文件的更改，请使用以下命令启动应用程序：

```bash
$ npm run start:dev
```

此命令监视您的文件，并在文件发生变化时重新编译并重新启动服务器。

#### 林分和格式化

这个 [Nest CLI](/cli/overview) 旨在构建可扩展的可靠开发工作流。对于快速默认工作流，生成 TypeScript 项目预装了一个代码**linter**和一个**formatter**：[奥克斯林特](https://oxc.rs/docs/guide/usage/linter.html) 和 [Prettier](https://prettier.io/)，分别。

> info **Hint** 不确定格式化程序和 linters 有什么不同？参见 Prettier 的 [比较](https://prettier.io/docs/en/comparison.html)。

对于不涉及 IDE 的无头环境（持续集成、Git 钩子等），该项目包括运行 [`oxlint`](https://www.npmjs.com/package/oxlint) 和 [`prettier`](https://www.npmjs.com/package/prettier) 的现成 `npm` 脚本：

```bash
# Lint with oxlint
$ npm run lint

# Format with prettier
$ npm run format
```
