# Scripts

Source: https://docs.nestjs.com/cli/scripts

本节解释如何 `nest` 命令与编译器和脚本交互，以帮助 DevOps 人员管理开发环境。

一个 Nest 应用是**标准**TypeScript 必须编译成 JavaScript 在它运行之前。有多种方法可以处理编译步骤，开发人员和团队可以自由选择最适合他们的方法。考虑到这一点，Nest 提供一套开箱即用的工具，旨在：

- 提供一个标准的构建/执行过程，可在命令行上使用，该过程使用合理的默认值。
- 保持构建/执行过程**开放**，以便开发人员可以直接访问底层工具，并使用其原生特性和选项对其进行定制。
- 保持完全标准 TypeScript/Node.js 框架，以便团队选择的任何外部工具都可以管理整个编译/部署/执行管道。

Nest 通过结合 `nest` 命令，本地安装 TypeScript 编译器，以及 `package.json` 脚本。下面的部分描述了这些部分如何协同工作，在构建/执行过程的每一步会发生什么，以及如何定制该行为。

#### 嵌套二进制

`nest` 命令是一个 OS 级二进制文件（即，它从 OS 命令行运行）。它涵盖三个不同的领域，如下所述。我们建议通过构建项目时生成的 `package.json` 脚本运行构建(`nest build`) 和执行(`nest start`) 子命令（如果您喜欢从克隆存储库开始而不是运行 `nest new`，请参见 [typescript 启动器](https://github.com/nestjs/typescript-starter)）。

#### 建立

`nest build` 是标准的包装 `tsc` 或者 `swc` 编译器（用于 [标准项目](/cli/overview#project-structure)）或 Rspack 捆绑器（用于 [单一存储](/cli/overview#project-structure)).除了处理 `tsconfig-paths` 并运行任何启用的 CLI 插件，它没有添加自己的编译特性或步骤。它的存在是因为大多数开发人员，尤其是在刚开始使用 Nest，不需要调整编译器选项（例如，在 `tsconfig.json` 文件），这可能很棘手。

参见 [筑巢](/cli/usages#nest-build) 更多详细信息的文档。

#### 执行

`nest start` 确保项目已构建（与 `nest build`），然后调用 `node` 以可移植方式执行编译后的应用程序的命令。与构建一样，您可以通过 `nest start` 命令及其选项，或完全替换它。整个过程是一个标准 TypeScript 构建和执行管道，您可以对其进行管理。

参见 [巢穴开始](/cli/usages#nest-start) 更多详细信息的文档。

#### 代

`nest generate` 命令在工作区中生成新组件或新应用程序和库。（要创建新项目，请使用 `nest new`。）

#### 包脚本

跑步 `nest` 命令 OS 命令级别要求 `nest` 将在全球范围内安装二进制文件。这是一个标准的 npm 功能，外部 Nest 的直接控制。一个后果是全球安装的 `nest` 二进制文件**不**作为项目依赖项进行管理 `package.json` 因此，两个开发人员可以运行两个不同的版本。标准的解决方案是使用包脚本，这样您就可以将构建和执行步骤中使用的工具视为开发依赖项。

运行 `nest new` 或克隆 [typescript 启动器](https://github.com/nestjs/typescript-starter) 时，Nest 会使用 `build` 和 `start` 等命令填充新项目的 `package.json` 脚本。它还将底层编译器工具（如 `typescript`）安装为**dev 依赖项**。

您可以使用以下命令运行构建和执行脚本：

```bash
$ npm run build
```

和

```bash
$ npm run start
```

这些命令使用 npm 的脚本运行程序来执行 `nest build` 或者 `nest start` 使用**本地安装**`nest` 二进制。通过使用这些内置的包脚本，您可以在 NestCLI 命令\*。通过遵循此**推荐**用法，组织中的所有成员都运行相同版本的命令。

\*这适用于 `build` 和 `start` 命令。这个 `nest new` 和 `nest generate` 命令不是构建/执行管道的一部分，因此它们在不同的上下文中运行，并且没有内置的 `package.json` 脚本。

我们建议大多数开发人员和团队使用包脚本来构建和运行他们的 Nest 项目。您可以通过这些脚本的选项自定义这些脚本的行为，并根据需要自定义 `tsc`、`swc` 或 Rspack 配置文件（例如，`tsconfig.json`）。您还可以自由运行完全自定义的构建过程来编译 TypeScript（甚至直接使用 `ts-node` 执行 TypeScript）。

#### 向后兼容性

因为 Nest 应用是纯粹的 TypeScript 应用程序，以前版本的 Nest 构建/执行脚本继续工作。您不需要升级它们。您可以采用 `nest build` 和 `nest start` 准备就绪时命令，或者继续运行以前的或自定义的脚本。

#### 迁移

您不需要进行任何更改，但您可能希望切换到 CLI 命令，而不是 `tsc-watch` 或 `ts-node` 等工具。为此，请在全局和本地安装最新版本的 `@nestjs/cli`：

```bash
$ npm install -g @nestjs/cli
$ cd /some/project/root/folder
$ npm install -D @nestjs/cli
```

然后替换 `scripts` 定义于 `package.json` 具有以下内容：

```typescript
"build": "nest build",
"start": "nest start",
"start:dev": "nest start --watch",
"start:debug": "nest start --debug --watch",
```
