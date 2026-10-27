# Deployment

Source: https://docs.nestjs.com/deployment

当您准备好部署 NestJS 应用到生产中，您可以采取一些关键步骤来确保它尽可能高效地运行。本指南涵盖了部署 NestJS 申请成功。

如果您不想自己管理基础架构，[Mau](https://mau.nestjs.com/)，我们的官方部署平台，让您在 AWS 只需一个命令。直接跳转到 [Easy deployment with Mau](/deployment#easy-deployment-with-mau)，或者继续阅读适用于任何托管选择的基本概念。

#### 先决条件

在部署 NestJS 申请时，请确保您具备：

- 工作 NestJS 准备部署的应用程序。
- 访问可以托管应用程序的部署平台或服务器。
- 为应用程序设置所有必要的环境变量。
- 任何所需的服务，如数据库，都已设置并准备就绪。
- Node.js 安装在部署平台上的 20.19 或更高版本（22.x 线上为 22.12 或更高版本），如中所述 [Prerequisites](/first-steps#prerequisites).更喜欢 Node.js 仍处于活动状态的版本 LTS.

> info **Hint** 和 [Mau](https://mau.nestjs.com/) 上面列表的大部分都是为您处理的：它提供了应用程序需要的服务器、数据库和代理，以及环境变量，因此剩下的唯一先决条件就是应用程序本身。

#### 构建您的应用程序

要构建您的 NestJS 应用程序，请将您的 TypeScript 代码编译成 JavaScript。此过程生成包含编译文件的 `dist` 目录。运行以下命令构建应用程序：

```bash
$ npm run build
```

此命令通常运行 `nest build` 在底层，这是一个包裹 TypeScript 具有一些附加功能（如复制资产）的编译器。如果您有自定义构建脚本，您可以直接运行它。为了 Nest CLI monorepos，将要构建的项目的名称作为参数传递（`npm run build my-app`).

编译成功后，您应该会在项目根目录中看到一个包含编译文件的 `dist` 目录，其中以 `main.js` 为入口点。如果您在项目的根目录中有任何 `.ts` 文件（并且您的 `tsconfig.json` 配置为编译它们），它们也会被编译到 `dist` 目录中，这改变了目录结构：您得到的不是 `dist/main.js`，而是 `dist/src/main.js`。配置服务器时请记住这一点。

#### 生产环境

您的生产环境是外部用户可以访问您的应用程序的地方。这可以是基于云的平台，如 [AWS](https://aws.amazon.com/)（带有 EC2、ECS 等。）、[Azure](https://azure.microsoft.com/) 或 [Google Cloud](https://cloud.google.com/)，或者您管理的专用服务器，如 [Hetzner](https://www.hetzner.com/)。

为了简化部署过程并避免手动设置，您可以使用我们在 AWS 上部署 NestJS 应用程序的官方平台 [Mau](https://mau.nestjs.com/)。它为您提供了下面列出的 AWS 的好处，而不需要您自己配置任何好处。详见 [Easy deployment with Mau](/deployment#easy-deployment-with-mau)。

使用**基于云的平台**或服务的一些优点如下 [Mau](https://mau.nestjs.com/) 包括：

- 可伸缩性：随着用户群的增长，扩展您的应用程序。
- 安全性：受益于内置的安全功能和合规性认证。
- 监控：实时监控应用程序的性能和运行状况。
- 可靠性：确保您的应用程序始终可用，并保证高正常运行时间。

另一方面，基于云的平台通常比自托管更昂贵，而且您对底层基础架构的控制可能较少。一个简单的 VPS 如果您正在寻找一个更具成本效益的解决方案，并且拥有自己管理服务器的技术专长，这可能是一个不错的选择。请记住，您需要手动处理服务器维护、安全和备份等任务。

#### NODE_ENV=生产

虽然从技术上讲，开发和生产之间没有区别 Node.js 和 NestJS，设置 `NODE_ENV` 环境变量到 `production` 在生产环境中运行应用程序时，因为生态系统中的一些库根据此变量的行为不同（例如，启用或禁用调试输出）。

您可以设置 `NODE_ENV` 启动应用程序时的环境变量：

```bash
$ NODE_ENV=production node dist/main.js
```

或者，将其设置在您的云提供者或 Mau 的仪表板中。

#### 运行您的应用程序

运行您的 NestJS 在生产中应用，请使用以下命令：

```bash
$ node dist/main.js # Adjust this based on your entry point location
```

此命令启动应用程序，它侦听传递到的端口 `app.listen()`(`3000` 在新生成的项目中，除非 `PORT` 环境变量已设置）。确保您的部署平台将流量路由到该端口。

或者，您可以使用 `nest start` 命令。它是一个包装 `node dist/main.js` 有一个关键的区别：它运行 `nest build` 在启动应用程序之前，您不需要运行 `npm run build` 手动的。

#### 健康检查

健康检查对于监控您的健康状况至关重要 NestJS 生产中的应用。借助健康检查端点，您可以定期验证您的应用程序是否按预期运行，并在问题变得严重之前对其做出响应。

在 NestJS，您可以使用**实现运行状况检查@nestjs/terminus**包，支持检查数据库连接、外部服务和自定义指示器。

参见 [健康检查（终点站）](/reliability/terminus) 本章将学习如何在您的系统中实施健康检查 NestJS 应用。

#### 伐木作业

日志记录对于任何生产就绪的应用程序都是必不可少的。它可以帮助您跟踪错误、监控行为和解决问题。在 NestJS，您可以使用 [内置记录器](/application/logger)，或者如果需要更高级的功能，可以选择外部库。

日志记录的最佳实践：

- 记录错误，而不是异常：专注于记录详细的错误消息，以加快调试和问题解决。
- 避免敏感数据：切勿记录密码或令牌等敏感信息。
- 使用关联 ID：在分布式系统中，在日志中包含唯一标识符（如关联 ID），以跟踪跨服务的请求。
- 使用日志级别：按严重程度对日志进行分类（例如，`info`,`warn`,`error`），并在生产中禁用调试或详细日志，以减少噪声。

> info **Hint** 如果您正在使用 [AWS](https://aws.amazon.com/)（与 [Mau](https://mau.nestjs.com/) 或直接），考虑 JSON 日志记录使解析和分析您的日志变得更加容易。

对于分布式应用程序，集中式日志服务（如 Elasticsearch、Loggly 或 Datadog）非常有用。这些工具提供日志聚合、搜索和可视化，使监视和分析应用程序的性能和行为变得更加容易。

#### 可观测性

健康检查和日志告诉您应用程序是否启动；他们不会告诉你上次部署后哪条路线变慢了，哪个类在消耗时间，或者哪条线抛出了。为此，请使用 [NestJS Observe](https://www.observe.nestjs.com/) 我们的官方可观测性平台：安装 `@nestjs/observe`SDK,传给 API 键、请求、作业、错误、日志和跟踪开始流式传输到仪表板，无需手动跨度布线或收集器运行。

```typescript
const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});
```

参见 [Observability](/observability/overview) 章节介绍完整的设置，包括使用 `serviceVersion` 因此，每个版本都与之前的版本进行比较。

#### 放大或缩小

扩展您的 NestJS 有效的应用程序对于处理增加的流量和确保最佳性能至关重要。缩放有两种主要策略：**垂直缩放**和**水平缩放**。了解这两者有助于您设计应用程序以有效地管理负载。

**垂直扩展**，通常被称为“扩展”，涉及增加单个服务器的资源以提高其性能。这可能意味着增加更多 CPU,RAM，或存储到您现有的计算机。需要考虑的要点：

- 简单性：垂直扩展通常更容易实现，因为您只需要升级现有的服务器，而不是管理多个实例。
- 限制：单台机器的扩展范围有物理限制。一旦达到最大容量，您可能需要考虑其他选项。
- 成本效益：对于中等流量的应用程序，垂直扩展可能具有成本效益，因为它减少了对额外基础架构的需求。

例如：如果你的 NestJS 应用程序托管在虚拟机上，您注意到它在高峰时段运行缓慢，您可以升级 VM 到具有更多资源的更大实例，通常是通过在提供者的仪表板中选择更大的实例类型。

**水平扩展**或“扩展”涉及添加更多服务器或实例来分配负载。这种策略在云环境中广泛使用，对于期望高流量的应用程序来说是必不可少的。好处和注意事项：

- 容量增加：通过添加更多应用程序实例，您可以在不降低性能的情况下处理更多并发用户。
- 冗余：一台服务器的故障不会导致整个应用程序瘫痪，因为流量可以在其余服务器之间重新分配。
- 负载平衡：要有效地管理多个实例，请使用负载平衡器（如 Nginx 或 AWS 弹性负载平衡）将传入流量均匀分布在您的服务器上。

例如：对于一个 NestJS 应用程序遇到高流量，您可以在云环境中部署应用程序的多个实例，并使用负载平衡器来路由请求，确保没有单个实例成为瓶颈。

集装箱化技术如 [Docker](https://www.docker.com/) 以及容器编排平台，例如 [Kubernetes](https://kubernetes.io/) 让这个过程变得简单。您还可以使用特定于云的负载平衡器，例如 [AWS Elastic Load Balancing](https://aws.amazon.com/elasticloadbalancing/) 或者 [Azure Load Balancer](https://azure.microsoft.com/en-us/services/load-balancer/) 在应用程序实例之间分配流量。

> info **Hint** [Mau](https://mau.nestjs.com/) 提供对水平缩放的内置支持 AWS，以便您可以部署 NestJS 只需点击几下鼠标即可应用和管理它们。

#### 其他一些提示

部署时，请记住这些附加提示 NestJS 应用：

- **安全性**：保护您的应用程序免受常见威胁，如 SQL 注入和 XSS。有关详细信息，请参见“安全”类别中的章节，如 [Helmet](/security/helmet) 和 [CORS](/security/cors)。
- **监控**：使用 [Prometheus](https://prometheus.io/) 或 [New Relic](https://newrelic.com/) 等监控工具来跟踪应用程序的性能和运行状况。云提供者和 Mau 可能会提供内置的监控服务（如 [AWS CloudWatch](https://aws.amazon.com/cloudwatch/)）。
- **不要硬编码环境变量**：避免硬编码敏感信息，如 API 代码中的密钥、密码或令牌。使用环境变量或秘密管理器来安全地存储和访问这些值。
- **备份**：定期备份您的数据，以防止发生事故时数据丢失。
- **自动化部署**：使用 CI/CD 自动化部署流程并确保跨环境的一致性的管道。
- **速率限制**：实施速率限制以防止滥用并保护您的应用程序免受 DDoS 攻击。参见 [速率限制](/security/rate-limiting) 有关详细信息，或使用以下服务 [AWSWAF](https://aws.amazon.com/waf/) 用于高级保护。

#### Dockerization 您的应用程序

[Docker](https://www.docker.com/) 是一个使用容器化的平台，让开发人员将应用程序及其依赖项打包到一个称为容器的标准化单元中。容器重量轻、便携且隔离，这使得它们非常适合在从本地开发到生产的各种环境中部署应用程序。

码头化的好处 NestJS 应用：

- 一致性：Docker 确保您的应用程序在任何机器上都以相同的方式运行，消除了“它在我的机器上工作”的问题。
- 隔离：每个容器在自己的隔离环境中运行，防止依赖项之间的冲突。
- 可伸缩性：您可以通过在不同的机器或云实例上运行多个容器来扩展您的应用程序。
- 可移植性：容器在环境之间移动而无需更改，因此您可以在不同的平台上部署应用程序。

要安装 Docker，请按照 [Docker website](https://www.docker.com/get-started) 上的说明进行操作。安装 Docker 后，在您的 NestJS 项目中创建一个 `Dockerfile`。它是一个文本文件，包含 Docker 用于构建容器映像的说明。

这是一个样本 `Dockerfile` 对于一个 NestJS 应用：

```bash
# Use the official Node.js image as the base image
FROM node:24

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/main"]
```

> info **Hint** 将 `node:24` 替换为您的项目使用的 Node.js 版本（NestJSv12 需要 Node.js20.19 或更高版本，或 22.x 行上的 22.12 或更高版本）。您可以在 [official Docker Hub repository](https://hub.docker.com/_/node) 中找到可用的 Node.jsDocker 图像。

这个基本 `Dockerfile` 设置一个 Node.js 环境，安装应用程序依赖项，构建 NestJS 应用程序，并运行它。您可以根据项目需求对其进行定制（例如，使用不同的基础映像、优化构建过程或仅安装生产依赖项）。

接下来，创建 `.dockerignore` 项目根目录中的文件，以指定哪些文件和目录 Docker 构建映像时应忽略：

```bash
node_modules
dist
*.log
*.md
.git
```

该文件将不必要的文件排除在容器映像之外，使其保持轻量级。与 `Dockerfile` 到位后，您可以构建您的 Docker 图像。打开终端，导航到项目目录，然后运行以下命令：

```bash
docker build -t my-nestjs-app .
```

在此命令中：

- `-t my-nestjs-app`：用名称 `my-nestjs-app` 标记图像。
- `.`: 指示当前目录作为构建上下文。

构建映像后，将其作为容器运行：

```bash
docker run -p 3000:3000 my-nestjs-app
```

在此命令中：

- `-p 3000:3000`: 将主机上的端口 3000 映射到容器中的端口 3000。
- `my-nestjs-app`: 指定要运行的映像。

你的 NestJS 应用程序现在应该在 Docker 容器。

要将 Docker 映像部署到云提供者或与其他人共享，请将其推送到容器注册表（如 [Docker Hub](https://hub.docker.com/)、[Amazon ECR](https://aws.amazon.com/ecr/) 或 [Google Artifact Registry](https://cloud.google.com/artifact-registry)）。

选择注册表后，推送您的映像：

```bash
docker login # Log in to your Docker registry
docker tag my-nestjs-app your-dockerhub-username/my-nestjs-app # Tag your image
docker push your-dockerhub-username/my-nestjs-app # Push your image
```

将 `your-dockerhub-username` 替换为您的 Docker 集线器用户名或适当的注册表 URL。推送图像后，您可以将其拉到任何机器上，并将其作为容器运行。

云提供者喜欢 AWS、Azure 和 Google Cloud 提供托管容器服务，可简化大规模部署和管理容器。这些服务提供自动扩展、负载平衡和监控等功能 NestJS 生产中的应用。

#### 使用 Mau 轻松部署

[Mau](https://mau.nestjs.com/) 是我们部署的官方平台 NestJS 应用程序 [AWS](https://aws.amazon.com/).它处理前面几节中描述的所有事情（配置服务器、连接数据库和代理、管理环境变量、扩展、监视和 CI/CD)，这样就不用自己组装了。

##### 部署

作为 NestJSv12，NestCLI 船舶 a`deploy` 命令。从项目根目录运行它：

```bash
$ nest deploy
```

如果 Mau 尚未安装，该命令提供添加 `@nestjs/mau` 作为开发依赖项，然后继续。您传递的任何选项都将转发给 `mau deploy`.见 [嵌套部署](/cli/usages#nest-deploy) 详情。

您也可以安装 MauCLI 全局并直接调用它。这是正确的选择 CI 不可用交互式提示的环境：

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

部署完成后，您的应用程序即可上线 AWS 通常在您第一次运行后的几分钟内。

##### 为什么要

使用 Mau，配置和维护您的基础架构只需点击几下鼠标。在底层，Mau 使用**Amazon Web Services**为您提供了一个强大而可靠的平台，同时抽象了 AWS.您可以获得以下优势 AWS 无需学习和管理其细节，这使得 Mau 非常适合初创公司、中小型企业、大型企业以及任何宁愿发货也不愿配置基础设施的开发人员。

<figure><img src="https://www.mau.nestjs.com/docs/applications/dashboard.png" /></figure>

和 [Mau](https://mau.nestjs.com/)，您可以：

- 部署您的 NestJS 只需点击几下鼠标的应用程序（API、微服务等）。）.
- 提供**数据库**，例如：
 - PostgreSQL
 - MySQL
 - MongoDB（文档数据库）
 - Redis
 - 更多的
- 设置经纪人服务，例如：
 - RabbitMQ
 - Kafka
 - NATS
- 部署计划任务（**CRON 工作**）和背景工作者。
- 部署 lambda 函数和无服务器应用程序。
- 设置**CI/CD 用于自动部署的管道**。
- 还有更多。

##### Mau 如何映射到本指南

本章前面介绍的每个主题在 Mau 中都有一个托管的等价物：

<table>
  <tr>
    <td><a href="/deployment#node_envproduction">Environment variables</a></td>
    <td>Set <code>NODE_ENV</code> and your secrets in the Mau dashboard instead of managing them on the server.</td>
  </tr>
  <tr>
    <td><a href="/deployment#logging">Logging</a></td>
    <td>Logs are collected and viewable in the dashboard. JSON logging is especially useful here; see the <a href="/application/logger">Logger chapter</a>.</td>
  </tr>
  <tr>
    <td><a href="/deployment#scaling-up-or-out">Scaling</a></td>
    <td>Built-in support for horizontal scaling: run multiple instances of your application and manage them from the dashboard.</td>
  </tr>
  <tr>
    <td><a href="/deployment#health-checks">Health checks</a></td>
    <td>Point Mau at the endpoint you expose with <a href="/reliability/terminus">Terminus</a> and unhealthy instances are handled for you.</td>
  </tr>
  <tr>
    <td><a href="/deployment#some-other-tips">Monitoring and backups</a></td>
    <td>Metrics come from AWS CloudWatch, and managed databases are backed up automatically.</td>
  </tr>
</table>

立即注册 [deploy with Mau](https://mau.nestjs.com/) 为了得到你的 NestJS 启动和运行的应用程序 AWS 几分钟后。
