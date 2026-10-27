# Overview

Source: https://docs.nestjs.com/cli/overview

这个 [Nest CLI](https://github.com/nestjs/nest-cli) 是一个命令行工具，可帮助您初始化、开发和维护 Nest 应用。它支架项目，以开发模式为它们服务，并构建和捆绑它们用于生产。它还体现了最佳实践架构模式，以鼓励结构良好的应用程序。

#### 安装

**注**：本指南使用 [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) 要安装软件包，包括 Nest CLI 如果您愿意，可以使用另一个包管理器。npm 提供了几种方法来控制您的 OS 命令行解析 `nest` 二进制。在这里，我们使用 `-g` 选择。这很方便，也是文档其余部分假设的方法。请记住，当您在全球范围内安装**any**npm 软件包时，您有责任确保运行的是正确的版本。这也意味着您的所有项目都运行**相同**版本的 CLI 一个合理的替代方案是 [npx](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npx.md) npm 中内置的程序 CLI （其他包管理器也有类似的功能），这样可以确保您运行的是 Nest CLI 有关详细信息，请参阅 [npx 文档](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npx.md) 或者您的 DevOps 团队。

安装 CLI 全球使用 `npm install -g` 命令（有关全局安装的详细信息，请参见上面的**注释**）。

```bash
$ npm install -g @nestjs/cli
```

> info **Hint** 或者，运行 `npx @nestjs/cli@latest` 使用 CLI 无需在全球范围内安装。

#### 基本工作流程

一旦 CLI 安装后，您可以从 OS 命令行通过 `nest` 可执行的。要列出可用的命令，请运行：

```bash
$ nest --help
```

要获取有关单个命令的详细帮助，请通过 `--help` 给它。替换任何命令，例如 `new` 或者 `add`, 为了 `generate` 在下面的示例中：

```bash
$ nest generate --help
```

创建、构建和运行新 Nest 项目在开发模式下，转到应包含新项目的文件夹，然后运行以下命令：

```bash
$ nest new my-nest-project
$ cd my-nest-project
$ npm run start:dev
```

`new` 命令提示您选择一个模块系统：ESM（默认值），它使用 Vitest 进行测试，或者 CommonJS，它使用 Jest。两者都使用 oxlint 进行脱绒。有关其他提示和选项，请参见 [`nest new`](/cli/usages#nest-new)。

在浏览器中，打开 [http://localhost:3000](http://localhost:3000) 查看正在运行的新应用程序。每当您更改源文件时，应用程序都会自动重新编译和重新加载。

> info **Hint** 为了加快构建速度，我们建议 [SWC 建造者](/recipes/swc)，比默认值快 10 倍 TypeScript 编译器。

#### 项目结构

当你跑步时 `nest new`,Nest 创建一个新文件夹，并用样板应用程序填充它。您可以继续在此默认结构中工作，并按照本文档中所述添加新组件。我们指的是由 `nest new` 作为**标准模式**。Nest 还支持用于管理多个项目和库的替代结构，称为**monorepo 模式**。

这两种模式的区别仅在于**构建**过程的工作方式（monorepo 模式简化了 monorepo 风格的项目结构中可能出现的构建复杂性）和内置 [图书馆](/cli/libraries) 支持。所有其他 Nest 特性和本文档同样适用于两者。您可以随时从标准模式切换到单回购模式，因此您可以在学习期间安全地推迟此决定 Nest.

您可以使用任一模式来管理多个项目。下表总结了差异：

| 特征 | 标准模式 | 单存储模式 |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| 多个项目 | 独立文件系统结构 | 单文件系统结构 |
| `node_modules`&`package.json` | 单独的实例 | 跨 monorepo 共享 |
| 默认编译器 | `tsc` | rspack |
| 编译器设置 | 单独指定 | 每个项目可以覆盖的 Monorepo 默认值 |
| Lint 和格式化程序配置文件 | 单独指定 | 跨 monorepo 共享 |
| `nest build` 和 `nest start` 命令 | 目标自动默认为上下文中的（仅）项目 | 将默认目标设置为 monorepo 中的 **默认项目** |
| 文库 | 手动管理，通常通过 npm 打包 | 内置支持，包括路径管理和捆绑 |

看 [Workspaces](/cli/monorepo) 和 [Libraries](/cli/libraries) 了解更多详细信息，帮助您决定哪种模式最适合您。

#### CLI 命令语法

全部 `nest` 命令遵循相同的格式：

```bash
nest commandOrAlias requiredArg [optionalArg] [options]
```

例如：

```bash
$ nest new my-nest-project --dry-run
```

这里，`new` 是_commandOrAlias_；它的别名是 `n`。`my-nest-project` 是_requiredArg_。如果您没有在命令行上提供 _requiredArg_，`nest` 会提示它。`--dry-run` 选项的简称为 `-d`。因此，以下命令等同于上面的命令：

```bash
$ nest n my-nest-project -d
```

大多数命令和一些选项都有别名。运行 `nest new --help` 去看他们。

#### 命令概述

运行 `nest <command> --help` 对于以下任何命令，请查看其选项。参见 [CLI 命令参考](/cli/usages) 有关每个命令的详细描述。

| 命令 | 别名 | 描述 |
| ---------- | ----- | ---------------------------------------------------------------------------------------------- |
| `new` | `n` | 用运行所需的所有样板文件搭建一个新的_standard mode_应用程序。 |
| `generate` | `g` | 基于原理图生成和/或修改文件。 |
| `build` | | 将应用程序或工作区编译成输出文件夹。 |
| `start` | | 编译并运行应用程序（或工作区中的默认项目）。 |
| `add` | | 导入已打包为**嵌套库**的库，运行其安装原理图。 |
| `upgrade` | `update` | 将现有项目升级到最新项目 NestJS 主要版本。 |
| `deploy` | | 将您的应用程序部署到云，由 [Mau](https://mau.nestjs.com/) 提供支持。 |
| `info` | `i` | 显示有关已安装的信息 Nest 软件包和其他有用的系统信息。 |

#### 要求

这个 CLI 二进制文件本身在**上运行 Node.jsv20.11 或更高版本**，但后面的原理图 `nest new`,`nest generate`，和 `nest upgrade`(`@nestjs/schematics`) 要求**Node.jsv22.22.3+、v24.15+或 v26+**。运行一个 Nest 应用程序具有较低的楼层（参见 [Node.js requirements](/migration-guide#nodejs-requirements) 在迁移指南中）。如果在开发的计算机上生成代码，请使用最新的活动 LTS 释放。

NestCLI 还需要一个用 [国际化支持](https://nodejs.org/api/intl.html)（ICU）构建的 Node.js 二进制文件，如 [Node.js download page](https://nodejs.org/en/download) 中的官方二进制文件。如果遇到与 ICU 相关的错误，请检查您的二进制文件是否满足以下要求：

```bash
node -p process.versions.icu
```

如果命令打印 `undefined`，你的 Node.js 二进制没有国际化支持。
