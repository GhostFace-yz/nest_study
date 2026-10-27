# Usage

Source: https://docs.nestjs.com/cli/usages

#### 嵌套新

创建新模式（标准模式）Nest 项目。

```bash
$ nest new <name> [options]
$ nest n <name> [options]
```

##### 描述

创建并初始化一个新的 Nest 项目。该命令会提示您不作为选项传递的任何信息：项目名称、包管理器、模块系统（ESM 或 CommonJS）以及是否设置 [NestJS Observe](/observability/overview)。

> info **Hint** 在非交互式环境（如 CI）中，传递项目名称和 `--package-manager`。然后，模块系统默认为 ESM，只有当您传递 `--observe` 时才设置 Observe。

> info **Hint** 选择**ESM**脚手架是使用 Vitest 进行测试的 ESM-第一个项目。选择**CommonJS**支架了使用 Jest 的传统布局。两种变体都使用 oxlint 进行脱绒。

命令：

- 使用给定的 `<name>`
- 用配置文件填充文件夹
- 为源代码(`/src`) 和端到端测试(`/test`) 创建子文件夹
- 用应用程序组件和测试的默认文件填充子文件夹
- 如果设置了 Observe，一旦依赖项安装完毕，就会将项目链接到它（仅在交互式终端中）。接受运行 `npx @nestjs/observe link`，它将应用程序密钥和秘密写入 `.env`- 见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)

##### 论据

| 论点 | 描述 |
| -------- | --------------------------- |
| `<name>` | 新项目的名称 |

##### 选项

| 选择 | 描述 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--directory [directory]` | 目标目录。 |
| `--dry-run` | 在不更改文件系统的情况下报告将要进行的更改。<br/>别名：`-d` |
| `--skip-git` | 跳过 git 存储库初始化。<br/>别名：`-g` |
| `--skip-install` | 跳过软件包安装。<br/>别名：`-s` |
| `--skip-tests` | 跳过为新项目生成测试文件。<br/>别名：`-t` |
| `--package-manager [package-manager]` | 要使用的包管理器：`npm`、`yarn`、`pnpm` 或 `bun`。包管理器必须全局安装。<br/>别名：`-p` |
| `--language [language]` | 编程语言：`TS`（默认）或 `JS`。该值不区分大小写，也接受 `typescript`/`javascript`。<br/>别名：`-l` |
| `--collection [collectionName]` | 要使用的原理图集合。传递包含原理图的已安装 npm 包的包名。<br/> 别名：`-c` |
| `--strict` | 在生成的 `tsconfig.json` 中启用 TypeScript 的 `strict` 模式（禁用 `strictPropertyInitialization`）。默认情况下启用，并且没有禁用它的标志：要选择退出，请在生成项目后在 `tsconfig.json` 中设置 `"strict": false`。 |
| `--format` | 使用 Prettier 格式化生成的文件。 |
| `--observe`/`--no-observe` | 设置 `@nestjs/observe`SDK，或者在没有提示的情况下跳过它。在交互式终端中省略这两个提示（提示默认为是）。如果没有终端，则无法设置 Observe。 |

#### 嵌套生成

基于原理图生成和/或修改文件。

```bash
$ nest generate <schematic> <name> [options]
$ nest g <schematic> <name> [options]
```

##### 论据

| 论点 | 描述 |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `<schematic>` | 这个 `schematic` 或者 `collection:schematic` 生成。有关可用原理图，请参见下表。 |
| `<name>` | 生成组件的名称。如果省略，示意图会提示它。 |

##### 示意图

| 名字 | 别名 | 描述 |
| ------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| `app` | | 在 monorepo 中生成新应用程序（将标准模式结构转换为 monorepo）。 |
| `library` | `lib` | 在 monorepo 中生成新库（将标准模式结构转换为 monorepo）。 |
| `class` | `cl` | 生成一个新类。 |
| `controller` | `co` | 生成控制器声明。 |
| `decorator` | `d` | 生成自定义装饰器。从 v12 开始，生成的装饰器使用 `Reflector.createDecorator()` 形式。 |
| `filter` | `f` | 生成筛选器声明。 |
| `gateway` | `ga` | 生成网关声明。 |
| `guard` | `gu` | 生成守卫声明。 |
| `interface` | `itf` | 生成接口。 |
| `interceptor` | `itc` | 生成拦截器声明。 |
| `middleware` | `mi` | 生成中间件声明。 |
| `module` | `mo` | 生成模块声明。 |
| `pipe` | `pi` | 生成管道声明。 |
| `provider` | `pr` | 生成提供者声明。 |
| `resolver` | `r` | 生成解析器声明。 |
| `resource` | `res` | 生成新的 CRUD 资源（仅限 TypeScript）。参见 [CRUD（资源）生成器](/recipes/crud-generator)。 |
| `service` | `s` | 生成服务声明。 |

##### 选项

| 选择 | 描述 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--dry-run` | 在不更改文件系统的情况下报告将要进行的更改。<br/>别名：`-d` |
| `--project [project]` | 元素应添加到的项目。<br/>别名：`-p` |
| `--flat` | 不要为元素生成文件夹。 |
| `--no-flat` | 为元素生成文件夹。 |
| `--collection [collectionName]` | 要使用的原理图集合。传递包含原理图的已安装 npm 包的包名。<br/> 别名：`-c` |
| `--spec` | 生成规范文件（默认）。 |
| `--no-spec` | 跳过生成规范文件。 |
| `--spec-file-suffix [suffix]` | 对规范文件使用自定义后缀。 |
| `--skip-import` | 跳过将生成的元素导入到其最近的模块中。 |
| `--format` | 使用 Prettier 格式化生成的文件。 |
| `--type <type>` | （仅限 `resource`）传输层：`rest`、`graphql-code-first`、`graphql-schema-first`、`microservice` 或 `ws`。 |
| `--crud [value]` | （仅限 `resource`）是否生成 CRUD 个入口点（`true` 或 `false`）。 |

#### 筑巢

将应用程序或工作区编译成输出文件夹。

这个 `build` 命令还负责：

- 映射路径（如果使用路径别名）通过 `tsconfig-paths`
- 使用 OpenAPI 装饰器注释 DTO（如果 `@nestjs/swagger`CLI 插件已启用）
- 注释 DTOGraphQL 装饰者（如果 `@nestjs/graphql`CLI 插件已启用）

```bash
$ nest build [name...] [options]
```

##### 论据

| 论点 | 描述 |
| ----------- | -------------------------------------------------------------------------------------------- |
| `[name...]` | 要构建的项目的名称。传递多个名称以构建多个项目。如果省略，将构建默认项目。 |

##### 选项

| 选择 | 描述 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--path [path]` | 路径 `tsconfig` 文件。<br/>别名 `-p` |
| `--config [path]` | 路径 `nest-cli` 配置文件。<br/>别名 `-c` |
| `--watch` | 在监视模式下运行（实时重新加载）。<br />使用 `tsc` 编译器，您可以键入 `rs` 来重新启动应用程序（当 `manualRestart` 选项设置为 `true` 时）。<br/>别名 `-w` |
| `--builder [name]` | 用于编译的生成器（`tsc`、`swc` 或 `rspack`）。<br/>别名 `-b` |
| `--webpack` | 基于 webpack 的编译已弃用的遗留标志。使用 `--builder rspack` 或者另一个显式生成器。 |
| `--webpackPath [path]` | 已弃用 webpack 配置文件的传统路径。改用所选生成器支持的配置。 |
| `--rspackPath [path]` | Rspack 配置文件的路径。 |
| `--tsc` | 强制使用 `tsc` 用于编译。 |
| `--watchAssets` | 观看非-TS 文件（资产，例如 `.graphql` 文件）。看 [Assets](/cli/monorepo#assets) 更多详情。 |
| `--type-check` | 启用类型检查（当 SWC 被使用）。 |
| `--no-type-check` | 禁用类型检查（当 SWC 被使用）。 |
| `--emit-declarations` | 发出声明文件（`.d.ts`）使用时 SWC 建造者。 |
| `--all` | 在 monorepo 中构建所有项目。 |
| `--parallel [concurrency]` | 并行构建项目（与 `--all` 一起使用）。传递一个正整数来限制并发，或者省略无限并发的值。 |
| `--silent` | 抑制信息编译器日志。 |
| `--preserveWatchOutput` | 在观看模式下保持过时的控制台输出，而不是清除屏幕。（`tsc` 仅限观看模式） |

#### 巢穴开始

编译并运行应用程序（或工作区中的默认项目）。

```bash
$ nest start [name] [options]
```

##### 论据

| 论点 | 描述 |
| -------- | -------------------------------------------------------------------- |
| `[name]` | 要运行的项目的名称。如果省略，则运行默认项目。 |

##### 选项

| 选择 | 描述 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `--path [path]` | 路径 `tsconfig` 文件。<br/>别名 `-p` |
| `--config [path]` | 路径 `nest-cli` 配置文件。<br/>别名 `-c` |
| `--watch` | 在观看模式下运行（实时重新加载）。<br/>别名 `-w` |
| `--builder [name]` | 用于编译的生成器（`tsc`、`swc` 或 `rspack`）。<br/>别名 `-b` |
| `--preserveWatchOutput` | 在观看模式下保持过时的控制台输出，而不是清除屏幕。（`tsc` 仅限观看模式） |
| `--watchAssets` | 在观看模式下运行（实时重新加载），观看非-TS 文件（资产）。看 [Assets](/cli/monorepo#assets) 更多细节。 |
| `--debug [hostport]` | 在调试模式下运行（使用 `--inspect` 旗）。<br/>别名 `-d` |
| `--webpack` | 基于 webpack 的编译已弃用的遗留标志。使用 `--builder rspack` 或者另一个显式生成器。 |
| `--webpackPath [path]` | 已弃用 webpack 配置文件的传统路径。改用所选生成器支持的配置。 |
| `--rspackPath [path]` | Rspack 配置文件的路径。 |
| `--tsc` | 强制使用 `tsc` 用于编译。 |
| `--type-check` | 启用类型检查（当 SWC 被使用）。 |
| `--no-type-check` | 禁用类型检查（当 SWC 被使用）。 |
| `--emit-declarations` | 发出声明文件（`.d.ts`）使用时 SWC 建造者。 |
| `--silent` | 抑制信息编译器日志。 |
| `--sourceRoot [sourceRoot]` | 源代码的根（覆盖 `nest-cli.json` 中的 `sourceRoot` 设置）。 |
| `--entryFile [entryFile]` | 要运行的条目文件（覆盖 `nest-cli.json` 中的 `entryFile` 设置）。 |
| `--exec [binary]` | 要运行的二进制文件（默认值：`node`）。<br/>别名 `-e` |
| `--no-shell` | 不要在 shell 中生成子进程（请参见 Node.js`child_process.spawn()` 文档）。 |
| `--env-file [path]` | 相对于当前目录从文件加载环境变量，并将它们公开给 `process.env` 上的应用程序。重复该选项以加载多个文件。不存在的文件会被跳过，并会发出通知。 |
| `-- [key=value]` | 应用程序可以从 `process.argv` 读取的命令行参数。 |

#### 嵌套添加

导入已打包为**嵌套库**的库，运行其安装原理图。

```bash
$ nest add <name> [options]
```

##### 论据

| 论点 | 描述 |
| -------- | ---------------------------------- |
| `<name>` | 要导入的库的名称。 |

##### 选项

| 选择 | 描述 |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `--dry-run` | 在不更改文件系统的情况下报告将要进行的更改。<br/>别名：`-d` |
| `--skip-install` | 跳过软件包安装。<br/>别名：`-s` |
| `--project [project]` | 应将库添加到的项目。<br/>别名：`-p` |

#### 嵌套升级

将现有项目升级到最新项目 NestJS 主要版本。

```bash
$ nest upgrade [options]
$ nest update [options]
```

##### 描述

从 a 的根运行 NestJSv11 项目，`nest upgrade` 将依赖项更新到 v12 并应用迁移的机械部分：

- 拒绝运行 Node.js 缺少的释放 `require(esm)`（任何早于 v20.19 或 v22.x 早于 v22.12）
- 每个识别的凸起 `@nestjs/*` 打包到其与 v12 兼容的主要发动机（`@nestjs/graphql`,`@nestjs/apollo`，和 `@nestjs/mercurius` 转到 v14），并报告任何其他 `@nestjs/*` 它无法识别的包，因此您可以自行查看
- 凸起 TypeScript 到 v6（v12 要求 CLI 和示意图），并提出 `engines.node` 在 `package.json` 二 `>=20.19.0` 如果它声明楼层较低
- 迁移 `nest-cli.json` 脱离陈旧的 `webpack`/`webpackConfigPath` 选项和 onto`--builder rspack`，更新匹配 `package.json` 脚本
- 重命名 GraphQL`playground` 选项 `graphiql`，将订阅从 `subscriptions-transport-ws` 二 `graphql-ws`，并相应地交换包
- 替换遗留 `nats` 包装 `@nats-io/transport-node`/`@nats-io/nats-core` 并重写 `nats` 进口
- 移动特定于库 `@nestjs/config` 下的设置 `validationOptions.libraryOptions` 并将 Joi 提升到 v18（实现标准模式的第一个版本）
- 凸起 Jest 到 v30（和 `@types/jest`/`ts-jest` 匹配版本）如果存在，并警告 Jest 可以 `require()` 这个 ESM-仅 v12 软件包 Node.jsv24.9+
- 可选地安装并连接 [`@nestjs/observe`](/observability/overview)。它会提示，除非您传递 `--observe` 或 `--no-observe`
- 支票 `tsconfig.json` 和 `tsconfig.build.json` 对于设置 TypeScript6 或 ESM-仅不再支持的包，如旧版 `moduleResolution` 或者失踪 `rootDir`
- 扫描源并打印有关已更改但无法自动迁移的行为的注释，例如生命周期挂钩排序、细化管道签名和结构化日志记录参数

该命令通过安装更新的依赖项结束（除非 `--skip-install` 通过）并打印一份报告，记录它所更改的、警告的以及留给您的所有内容。

> warning **Warning** `nest upgrade` 只会撞击**本地** `@nestjs/cli` 依赖。更新全局安装 CLI 你自己 `npm i -g @nestjs/cli@latest`，并在运行升级之前执行此操作，因为命令本身随 CLI.

> info **Hint** 命令故意不将项目迁移到 ESM,Vitest，或者奥克斯林特。这些是新生成的 v12 项目的默认值，但现有项目可以按照自己的计划采用它们。参见 [迁移指南](/migration-guide) 为了完整的画面。

##### 选项

| 选择 | 描述 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--dry-run` | 在不更改文件系统的情况下报告将要进行的更改。<br/>别名：`-d` |
| `--skip-install` | 跳过软件包安装。<br/>别名：`-s` |
| `--observe`/`--no-observe` | 设置 `@nestjs/observe`，或跳过设置，而不会提示。在交互式终端中省略这两个提示（提示默认为否）。如果没有终端，则无法设置 Observe。 |
| `--tag [tag]` | 使用 npm dist-tag（例如，`next`) 而不是默认版本范围。<br/>别名：`-t` |
| `--collection [collectionName]` | 要使用的原理图集合。传递包含原理图的已安装 npm 包的包名。<br/> 别名：`-c` |

#### 嵌套部署

将您的应用程序部署到云，由 [Mau](https://mau.nestjs.com/) 提供支持。

```bash
$ nest deploy [mau-options]
```

##### 描述

`nest deploy` 是 Mau 周围的薄包装纸 CLI.它定位 Mau 二进制文件，并将传递给 `mau deploy`，所以 Mau 支持的任何选项在这里都不变。

如果项目中未安装 Mau，则该命令提供添加 `@nestjs/mau` 作为开发依赖项，然后继续。在非交互式环境中（例如，CI），命令失败而不是提示，因此首先显式安装 Mau：

```bash
$ npm install --save-dev @nestjs/mau
```

一旦 Mau 启动，它就拥有终端，因此它的输出和提示直接到达您手中。参见 [Deployment chapter](/deployment#easy-deployment-with-mau)Mau 做什么以及如何配置它。

#### 嵌套信息

显示有关已安装的信息 Nest 软件包和其他有用的系统信息。例如：

```bash
$ nest info
```

```bash
 _   _             _      ___  _____  _____  _     _____
| \ | |           | |    |_  |/  ___|/  __ \| |   |_   _|
|  \| |  ___  ___ | |_     | |\ `--. | /  \/| |     | |
| . ` | / _ \/ __|| __|    | | `--. \| |    | |     | |
| |\  ||  __/\__ \| |_ /\__/ //\__/ /| \__/\| |_____| |_
\_| \_/ \___||___/ \__|\____/ \____/  \____/\_____/\___/

[System Information]
OS Version     : macOS Sequoia 24.6.0
NodeJS Version : v22.12.0
NPM Version    : 10.9.0

[Nest CLI]
Nest CLI Version : 12.0.3

[Nest Platform Information]
platform-express version : 12.0.4
schematics version       : 12.0.4
testing version          : 12.0.4
common version           : 12.0.4
core version             : 12.0.4
cli version              : 12.0.3
```
