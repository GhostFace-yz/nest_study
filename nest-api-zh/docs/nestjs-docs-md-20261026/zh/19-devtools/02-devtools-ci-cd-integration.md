# CI/CD integration

Source: https://docs.nestjs.com/devtools/ci-cd-integration

> info **Hint** 本章涵盖 NestDevtools 与 Nest 框架。如果您正在查找 Devtools 应用程序，请访问 [Devtools](https://devtools.nestjs.com) 网站。CI/CD 可在**上集成 [Enterprise](https://devtools.nestjs.com/settings)**计划。

本地使用非常适合在构建应用程序时探索应用程序，但真正的回报是当 Devtools 成为交付管道的一部分时。CI/CD 集成会在每次构建时发布应用程序图表的快照。您可以获得体系结构如何演变的运行历史记录，更重要的是，每个拉取请求的自动报告，准确显示结构上发生了哪些变化。这就是希望重构不会破坏任何东西和知道它不会破坏的区别。

了解团队依赖的原因 CI/CD 集成以在发布之前捕捉架构漂移：

<figure>
  <iframe
    width="1000"
    height="565"
    src="https://www.youtube.com/embed/r5RXcBrnEQ8"
    title="YouTube video player"
    frameBorder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</figure>

#### 发布图表

首先，连接应用程序引导文件（`main.ts`）使用 `GraphPublisher` 类，从 `@nestjs/devtools-integration`（见 [Devtools overview](/devtools/overview) 如果您还没有安装它）：

```typescript
async function bootstrap() {
  const shouldPublishGraph = process.env.PUBLISH_GRAPH === 'true';

  const app = await NestFactory.create(AppModule, {
    snapshot: true,
    preview: shouldPublishGraph,
  });

  if (shouldPublishGraph) {
    await app.init();

    const publishOptions = { ... } // NOTE: this options object will vary depending on the CI/CD provider you're using
    const graphPublisher = new GraphPublisher(app);
    await graphPublisher.publish(publishOptions);

    await app.close();
  } else {
    await app.listen(3000);
  }
}
```

这里，`GraphPublisher` 将序列化图形推送到集中式注册表。`PUBLISH_GRAPH` 是一个自定义环境变量，用于区分 CI/CD 从常规应用程序引导程序发布运行。设置 `preview` 二 `true` 在预览模式下引导应用程序，这意味着控制器、增强器和提供程序的构造函数和生命周期挂钩不会执行。这不是**必需的**，但它保持 CI 运行快速简单（例如，不需要数据库连接）。

的形状 `publishOptions` 取决于你的 CI/CD 供应商。以下部分涵盖了最受欢迎的部分。如果没有列出您的提供者，底层字段在任何地方都是相同的，因此您可以在几分钟内调整配置。

成功发布图表后，您将在工作流日志中看到如下输出：

<figure><img src="https://docs.nestjs.com/assets/devtools/graph-published-terminal.png" /></figure>

每个发布的图表都会在项目页面上显示为新条目：

<figure><img src="https://docs.nestjs.com/assets/devtools/project.png" /></figure>

#### 报告

Devtools 会为每个构建生成一个报告，**只要**注册表中已经存在匹配的快照。如果您针对 `master` 和一个图 `master` 已经发布，Devtools 检测差异并自动生成报告。否则，还没有什么可以比较的。

在项目页面上找到您的报告（参见 [组织](https://devtools.nestjs.com/organizations)）。

<figure><img src="https://docs.nestjs.com/assets/devtools/report.png" /></figure>

这就是 Devtools 真正赢得它的地方：捕捉错过代码审查的更改。假设有人悄悄地更改了**深度嵌套提供程序**的范围。这在差异中很容易忽略，在报告中不可能忽略。从端点移除防护，它会立即显示为受影响的更改。如果集成或 e2e 测试没有涵盖这条路线，您可能直到为时已晚才注意到。相反，Devtools 会在审核时捕捉到它。

**大型代码库**也是如此：使一个模块成为全局的，你会立即看到有多少新边落在图上，这通常是一个强烈的信号，表明某些东西需要第二次查看。

报告也是一个很好的工具，可以链接到您的拉请求描述中。您可以向他们指出发生了变化的节点和边的确切集合，而不是要求审阅者相信“这只涉及计费模块”，将架构声明变成他们可以在几秒钟内验证的东西。

#### 构建预览

您可以重放每个发布的图表：单击**预览**以查看它在那个时间点的外观。当报告可用时，差异会直接在图表上突出显示：

- 绿色节点表示添加的元素
- 浅白色节点表示更新的元素
- 红色节点表示删除的元素

看起来像这样：

<figure><img src="https://docs.nestjs.com/assets/devtools/nodes-selection.png" /></figure>

能够倒带和比较图表使故障排除变得简单，无需再猜测发生了什么变化以及何时发生了变化。设置好以便每个拉请求（甚至每个提交）在注册表中都有自己的快照，并且您将始终有一个清晰的跟踪。把 Devtools 看作是一个版本控制，它理解如何 Nest 组装您的应用程序，并可以**向您展示**不同之处，而不仅仅是描述它。

#### 集成：GitHub 操作

中创建新的工作流文件 `.github/workflows`（例如，`publish-graph.yml`）具有以下内容：

```yaml
name: Devtools

on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - '*'

jobs:
  publish:
    if: github.actor != 'dependabot[bot]'
    name: Publish graph
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Setup Environment (PR)
        if: ${{ github.event_name == 'pull_request' }}
        shell: bash
        run: |
          echo "COMMIT_SHA=${{ github.event.pull_request.head.sha }}" >>\${GITHUB_ENV}
      - name: Setup Environment (Push)
        if: ${{ github.event_name == 'push' }}
        shell: bash
        run: |
          echo "COMMIT_SHA=\${GITHUB_SHA}" >> \${GITHUB_ENV}
      - name: Publish
        run: PUBLISH_GRAPH=true npm run start
        env:
          DEVTOOLS_API_KEY: CHANGE_THIS_TO_YOUR_API_KEY
          REPOSITORY_NAME: ${{ github.event.repository.name }}
          BRANCH_NAME: ${{ github.head_ref || github.ref_name }}
          TARGET_SHA: ${{ github.event.pull_request.base.sha }}
```

> info **Hint** 为了更好的安全性，将 `DEVTOOLS_API_KEY` 存储为 GitHub 秘密，而不是硬编码。参见 [Creating secrets for a repository](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository)。

此工作流在每个拉取请求和直接推送到 `master` 时运行。使其适应您的项目需求；一个要求是提供 `GraphPublisher` 所依赖的环境变量。

在工作流运行之前，请填写剩余的一个变量：`DEVTOOLS_API_KEY`。在**[API 关键字页面](https://devtools.nestjs.com/settings/manage-api-keys)**上为您的项目生成专用的 API 密钥。

最后，回到 `main.ts` 并填写 `publishOptions` 我们之前留空的对象：

```typescript
const publishOptions = {
  apiKey: process.env.DEVTOOLS_API_KEY,
  repository: process.env.REPOSITORY_NAME,
  owner: process.env.GITHUB_REPOSITORY_OWNER,
  sha: process.env.COMMIT_SHA,
  target: process.env.TARGET_SHA,
  trigger: process.env.GITHUB_BASE_REF ? 'pull' : 'push',
  branch: process.env.BRANCH_NAME,
};
```

为了获得最流畅的体验，我们还建议通过单击“集成 GitHub 应用程序”（见下文）为您的项目安装**GitHub 应用程序**。这是可选的，但非常值得。

<figure><img src="https://docs.nestjs.com/assets/devtools/integrate-github-app.png" /></figure>

安装应用程序后，您可以在拉取请求中看到预览和报告生成的状态：

<figure><img src="https://docs.nestjs.com/assets/devtools/actions-preview.png" /></figure>

#### 集成：Gitlab 管道

创建一个 `.gitlab-ci.yml` 在项目根目录中使用以下定义进行文件：

```yaml
image: node:22

stages:
  - build

cache:
  key:
    files:
      - package-lock.json
  paths:
    - node_modules/

workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: always
    - if: $CI_COMMIT_BRANCH == "master" && $CI_PIPELINE_SOURCE == "push"
      when: always
    - when: never

install_dependencies:
  stage: build
  script:
    - npm ci

publish_graph:
  stage: build
  needs:
    - install_dependencies
  script: npm run start
  variables:
    PUBLISH_GRAPH: 'true'
    DEVTOOLS_API_KEY: 'CHANGE_THIS_TO_YOUR_API_KEY'
```

> info **Hint** 与 GitHub 一样，我们建议存储 `DEVTOOLS_API_KEY` 作为一个 CI/CD 秘密而不是承诺。

此管道在每个合并请求和直接推送到 `master`.调整它以适应您的项目，但要确保环境变量 `GraphPublisher` 需求始终存在。

这个定义中的一个变量仍然需要一个实值：`DEVTOOLS_API_KEY`。在**[API 关键字页面](https://devtools.nestjs.com/settings/manage-api-keys)**上为您的项目生成专用的 API 密钥。

最后，回到 `main.ts` 并填写 `publishOptions` 我们之前留空的对象：

```typescript
const publishOptions = {
  apiKey: process.env.DEVTOOLS_API_KEY,
  repository: process.env.CI_PROJECT_NAME,
  owner: process.env.CI_PROJECT_ROOT_NAMESPACE,
  sha: process.env.CI_COMMIT_SHA,
  target: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA,
  trigger: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ? 'pull' : 'push',
  branch:
    process.env.CI_COMMIT_BRANCH ??
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME,
};
```

#### 其他的 CI/CD 工具

集成不依赖于 GitHub 或 GitLab。全部 `GraphPublisher`needs 是描述当前构建的几个值（什么触发了它，哪个提交，哪个分支），因此它可以与任何提供程序一起工作，包括 [Bitbucket Pipelines](https://bitbucket.org/product/features/pipelines),[CircleCI](https://circleci.com/)，等等。

这是完整的 `publishOptions` 形状和每个字段所代表的内容，以便您可以连接任何管道：

```typescript
const publishOptions = {
  apiKey: process.env.DEVTOOLS_API_KEY, // This is your Nest Devtools API key
  repository: '?', // This is your repository name, for example, "my-api-repository"
  owner: '?', // This is your organization/team name, for example, "nestjs" OR in case of personal projects - your username
  sha: '?', // This represents the "current" commit SHA that triggered the workflow/pipeline
  target: '?', // This represents the "target" commit SHA (e.g., the last commit SHA of the "master" branch)
  // New build will be compared to the "target" build to generate a report
  // NOTE: Some CI/CD tools don't provide you with this information so instead, you can use the "targetBranch" property.
  // NOTE: In this case, the "target" commit SHA will be automatically resolved to the last commit SHA of the "targetBranch" stored in the database.
  // targetBranch: "master",
  trigger: isPr ? 'pull' : 'push', // Depending on whether the pipeline is triggered by a pull request or a regular push commit, you should set "pull" or "push"
  branch: '?', // This is the current branch name, for example, "develop" OR "feat/my-new-feature"
};
```

这些值大多在您的 CI/CD 提供程序的内置环境变量。参见 [CircleCI built-in environment variables](https://circleci.com/docs/variables/#built-in-environment-variables) 和 [Bitbucket variables and secrets](https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/) 参考文献作为起点。

对于管道触发器，我们建议使用以下设置：

- `push`：仅适用于表示部署环境的分支，例如 `master`、`main`、`staging` 或 `production`。
- `pull request`：总是，或者至少当**目标分支**是部署环境时（见上文）。

此组合使注册表中填充每个可部署状态的快照 `master`，同时仍然生成针对它的每个拉请求的报告。这种配对是报告首先有用的原因。
