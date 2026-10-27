# Introduction

Source: https://docs.nestjs.com/index

Nest(NestJS）是构建高效、可扩展的框架 [Node.js](https://nodejs.org/) 服务器端应用程序。它使用渐进式 JavaScript，内置并完全支持 [TypeScript](https://www.typescriptlang.org/)（同时仍然让你用简单的方式写作 JavaScript），并结合了 OOP（面向对象编程），FP（函数式编程），以及 FRP（函数式反应编程）。

在底层，Nest 使用稳健 HTTP 服务器框架，例如 [Express](https://expressjs.com/)（默认值），并且可以可选地配置为使用 [Fastify](https://github.com/fastify/fastify) 反而。

Nest 提供了高于这些常见的抽象级别 Node.js 框架（Express 和 Fastify），但也将它们的 API 直接暴露给开发人员。这使您可以自由地使用底层平台可用的无数第三方模块。

#### 哲学

近年来，得益于 Node.js,JavaScript 已经成为前端和后端应用程序的 web“通用语言”。这催生了诸如 [Angular](https://angular.dev/),[React](https://github.com/facebook/react)，和 [Vue](https://github.com/vuejs/core) 这提高了开发人员的工作效率，并支持创建快速、可测试和可扩展的前端应用程序。然而，尽管存在大量优秀的库、助手和工具 Node.js（和服务器端 JavaScript)，都没有有效解决**架构**的主要问题。

Nest 提供了一个开箱即用的应用程序架构，允许开发人员和团队创建高度可测试、可伸缩、松耦合和可维护的应用程序。该建筑深受 Angular 的启发。

#### 安装

要开始，您可以使用 [Nest CLI](/cli/overview) 或 [克隆初始项目](#alternatives) 搭建项目。两者产生相同的结果。

用脚手架搭建项目 NestCLI，运行以下命令。他们创建一个新的项目目录，并用初始核心填充它 Nest 文件和支持模块，为您的项目提供传统的基本结构。我们推荐**NestCLI**对于首次使用的用户，以及 [First steps](/first-steps) 第二章继续采用这种方法。

```bash
$ npm i -g @nestjs/cli
$ nest new project-name
```

#### 替代品

或者，您可以安装 TypeScript 使用**Git**启动项目：

```bash
$ git clone https://github.com/nestjs/typescript-starter.git project
$ cd project
$ npm install
$ npm run start
```

> info **Hint** 要在没有 Git 历史记录的情况下克隆存储库，请使用 [德吉特](https://github.com/Rich-Harris/degit)。

打开浏览器并导航到 [`http://localhost:3000/`](http://localhost:3000/)。

要安装 JavaScript 初学者项目的味道，使用 `javascript-starter.git` 在上面的命令序列中。

您也可以通过自己安装核心和支持包来从头开始一个新项目。在这种情况下，您需要自己设置项目样板文件。至少，您需要以下依赖项：`@nestjs/core`、`@nestjs/common`、`rxjs` 和 `reflect-metadata`。有关以这种方式创建完整项目的演练，请参见 [5 steps to create a bare minimum NestJS app from scratch](https://dev.to/micalevisk/5-steps-to-create-a-bare-minimum-nestjs-app-from-scratch-5c3b)。
