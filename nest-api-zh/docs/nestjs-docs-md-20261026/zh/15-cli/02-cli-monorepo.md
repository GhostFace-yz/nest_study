# Workspaces

Source: https://docs.nestjs.com/cli/monorepo

Nest 有两种组织代码的模式：

- **标准模式**：适用于单个、以项目为中心的应用程序，这些应用程序有自己的依赖关系和设置，不需要针对共享模块或复杂的构建进行优化。这是默认模式。
- **monorepo 模式**：将代码工件视为轻量级**monorepo**的一部分，可能更适合开发人员团队和/或多项目环境。它自动化了构建过程的一部分，使创建和组装模块化组件变得容易。它促进了代码重用，使集成测试更容易，使共享项目范围的工件（如 lint 规则和其他配置策略）变得容易，并且比 Git 子模块等替代方案更容易使用。Monorepo 模式使用**工作区**的概念，如 `nest-cli.json` 文件，以协调 monorepo 组件之间的关系。

几乎所有 Nest 的功能与代码组织模式无关。这种选择的**唯一**影响是您的项目是如何组成的，以及如何生成构建工件。所有其他功能，从 CLI 从核心模块到附加模块，两种模式下的工作方式都相同。

您也可以随时从**标准模式**切换到**单一回购模式**，因此您可以推迟此决定，直到一种或另一种方法的好处变得更加明显。

#### 标准模式

当你跑步时 `nest new`,Nest 使用内置原理图创建新的**项目**。Nest 执行以下操作：

1. 创建一个以传递给 `nest new` 的 `name` 参数命名的新文件夹。
2. 用最小值的默认文件填充该文件夹 Nest 应用。您可以在 [typescript-starter](https://github.com/nestjs/typescript-starter) 仓库。
3. 添加文件，例如 `nest-cli.json`,`package.json`，和 `tsconfig.json` 配置用于编译、测试和服务应用程序的工具。

从那里，您可以修改启动器文件，添加新的组件和依赖项（例如，`npm install`)，并按照本文档其余部分所述开发应用程序。

#### 单存储模式

要启用 monorepo 模式，请从_standard mode_结构开始，然后添加**projects**。项目可以是完整的**应用程序**（使用 `nest generate app` 将其添加到工作区）或**库**（使用 `nest generate library` 添加）。我们将在下面讨论这些项目类型。现在的关键点是，将项目添加到现有标准模式结构中的行为将其转换为 monorepo 模式。我们来看一个例子。

如果我们运行：

```bash
$ nest new my-project
```

我们得到一个包含以下文件夹和文件的_standard mode_结构：

<div class="file-tree">
  <div class="item">node_modules</div>
  <div class="item">src</div>
  <div class="children">
    <div class="item">app.controller.ts</div>
    <div class="item">app.module.ts</div>
    <div class="item">app.service.ts</div>
    <div class="item">main.ts</div>
  </div>
  <div class="item">nest-cli.json</div>
  <div class="item">package.json</div>
  <div class="item">tsconfig.json</div>
  <div class="item">lint config</div>
</div>

我们可以将其转换为 monorepo 模式结构，如下所示：

```bash
$ cd my-project
$ nest generate app my-app
```

此时，`nest` 将现有结构转换为**单回购模式**结构，这导致了一些重要的更改。文件夹结构现在如下所示：

<div class="file-tree">
  <div class="item">apps</div>
    <div class="children">
      <div class="item">my-app</div>
      <div class="children">
        <div class="item">src</div>
        <div class="children">
          <div class="item">my-app.controller.ts</div>
          <div class="item">my-app.module.ts</div>
          <div class="item">my-app.service.ts</div>
          <div class="item">main.ts</div>
        </div>
        <div class="item">tsconfig.app.json</div>
      </div>
      <div class="item">my-project</div>
      <div class="children">
        <div class="item">src</div>
        <div class="children">
          <div class="item">app.controller.ts</div>
          <div class="item">app.module.ts</div>
          <div class="item">app.service.ts</div>
          <div class="item">main.ts</div>
        </div>
        <div class="item">tsconfig.app.json</div>
      </div>
    </div>
  <div class="item">nest-cli.json</div>
  <div class="item">package.json</div>
  <div class="item">tsconfig.json</div>
  <div class="item">lint config</div>
</div>

这个 `generate app`schematic 重新组织了代码：它将每个**应用程序**项目移动到 `apps` 文件夹并添加了特定于项目的 `tsconfig.app.json` 文件到每个项目的根文件夹。我们的原创 `my-project`app 已成为 monorepo 的**默认项目**，现在是新添加的对等项目 `my-app`，在 `apps` 文件夹。我们在下面介绍默认项目。

> info 错误**警告**将标准模式结构转换为单回购仅适用于遵循规范的项目 Nest 项目结构。在转换过程中，原理图会移动项目的 `src` 和 `test` 将文件夹放入根目录下的项目文件夹 `apps` 文件夹。如果项目不使用这种结构，转换将失败或产生不可靠的结果。

#### 工作区项目

monorepo 使用工作区的概念来管理其成员。工作区由**项目**组成。项目要么是：

- **申请**：一份完整的 Nest 应用，包括 `main.ts` 引导它的文件。除了编译和构建方面的考虑之外，工作区中的应用程序类型项目在功能上与 _standard mode_ 结构中的应用程序相同。
- **库**：其他项目可以使用的通用特性（模块、提供程序、控制器等）包。库不能自行运行，并且没有 `main.ts` 文件。看 [Libraries](/cli/libraries) 详情。

每个工作区都有一个**默认项目**，应该是应用程序类型的项目。它由 `nest-cli.json` 文件中的顶级 `"root"` 属性定义，该属性指向默认项目的根（参见下面的 [CLI 属性](/cli/monorepo#cli-properties)）。通常，这是您开始使用的**标准模式**应用程序，后来使用 `nest generate app` 转换为 monorepo。在这种情况下，将自动填充该属性。

`nest` 诸如 `nest build` 和 `nest start` 不提供项目名称时，请使用默认项目。

例如，在上面的 monorepo 结构中，运行

```bash
$ nest start
```

启动 `my-project` 应用。开始 `my-app`，运行：

```bash
$ nest start my-app
```

#### 应用

应用程序类型的项目，非正式地称为“应用程序”，是您可以运行和部署的完整的 Nest 应用程序。您可以用 `nest generate app` 生成一个。

此命令生成项目骨架，包括来自 [typescript 启动器](https://github.com/nestjs/typescript-starter) 的标准 `src` 和 `test` 文件夹。与标准模式不同，monorepo 中的应用程序项目没有包依赖文件（`package.json`），也没有其他项目配置工件，如 `.prettierrc` 或 lint 配置文件。相反，它使用 monorepo 范围的依赖项和配置文件。

但是，原理图确实生成了一个特定于项目的 `tsconfig.app.json` 项目根文件夹中的文件。该文件设置适当的构建选项，包括编译输出文件夹。它扩展了顶层（monorepo）`tsconfig.json` 文件，因此您可以在 monorepo 范围内管理全局设置，并在需要时在项目级别覆盖它们。

#### 文库

库类型的项目，或简称为“库”，是 Nest 组件的包，必须组合成应用程序才能运行。您可以使用 `nest generate library` 生成一个。决定什么属于图书馆是一个建筑设计决定。我们在 [Libraries](/cli/libraries) 章中深入讨论了库。

#### CLI 属性

Nest 保留组织、构建和部署标准和单回购项目所需的元数据 `nest-cli.json` 文件。Nest 添加项目时自动更新此文件，因此通常不必编辑它。但是，您可能希望手动更改某些设置，因此这有助于了解文件的结构。

在上述步骤之后，`nest-cli.json` 文件如下所示：

```javascript
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/my-project/src",
  "compilerOptions": {
    "deleteOutDir": true,
    "builder": "rspack",
    "tsConfigPath": "apps/my-project/tsconfig.app.json"
  },
  "monorepo": true,
  "root": "apps/my-project",
  "projects": {
    "my-app": {
      "type": "application",
      "root": "apps/my-app",
      "entryFile": "main",
      "sourceRoot": "apps/my-app/src",
      "compilerOptions": {
        "tsConfigPath": "apps/my-app/tsconfig.app.json"
      }
    },
    "my-project": {
      "type": "application",
      "root": "apps/my-project",
      "entryFile": "main",
      "sourceRoot": "apps/my-project/src",
      "compilerOptions": {
        "tsConfigPath": "apps/my-project/tsconfig.app.json"
      }
    }
  }
}
```

该文件分为几个部分：

- 全局部分，具有控制标准和单一回购范围设置的顶级属性
- 顶级属性（`"projects"`) 以及关于每个项目的元数据。本节仅存在于单回购模式结构中。

顶级属性如下：

- `"collection"`：用于生成组件的原理图集合处的点；通常不应更改此值
- `"sourceRoot"`: 标准模式结构中单个项目的源代码根部的点，或 monorepo 模式结构中 _default project_ 的点
- `"compilerOptions"`：具有指定编译器选项的键和指定选项设置的值的映射；详情请见下文
- `"generateOptions"`：具有指定全局生成选项的键和指定选项设置的值的映射；详情请见下文
- `"monorepo"`：（仅限 monorepo）始终 `true` 对于单回购模式结构
- `"root"`: （仅限 monorepo） _默认项目_ 的项目根点

#### 全局编译器选项

这些属性指定要使用的编译器，以及影响**任何**编译步骤的选项，无论它是作为 `nest build` 或者 `nest start`，以及您使用的编译器（`tsc`,`swc`，或 Rspack）。

| 属性名称 | 属性值类型 | 描述 |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webpack` | 布尔 | 基于 webpack 的编译已弃用的遗留标志。使用 `builder` 反而。 |
| `tsConfigPath` | 细绳 | （**仅限 monorepo**）指向包含 `tsconfig.json` 将在以下情况下使用的设置 `nest build` 或者 `nest start` 被称为没有 `project` 选项（例如，在构建或启动默认项目时）。 |
| `webpackConfigPath` | 细绳 | 已弃用 webpack 选项的旧有路径。使用 `builder.options.configPath` 反而。 |
| `deleteOutDir` | 布尔 | 如果 `true` 中，编译器首先删除编译输出目录（如中配置的 `tsconfig.json`；默认值是 `./dist`) 每次调用时。 |
| `assets` | 阵列 | 启用自动分发非 TypeScript 每当编译步骤开始时，资产（资产**不**分布在增量编译上 `--watch` 模式）。详情请见下文。 |
| `watchAssets` | 布尔 | 如果 `true`，在观看模式下运行，观看**全部**非-TypeScript 资产。（要更精细地控制要监视哪些资产，请参见 [Assets](/cli/monorepo#assets) 下面的部分。） |
| `manualRestart` | 布尔 | 如果 `true`，则启用 `rs` 快捷方式手动重新启动服务器。默认值为 `false`。 |
| `builder` | 字符串/对象 | CLI 用于编译项目的生成器（`tsc`、`swc` 或 `rspack`）。要自定义生成器的行为，请传递一个具有两个属性的对象：`type`（`tsc`、`swc` 或 `rspack`）和 `options`。 |
| `typeCheck` | 布尔 | 如果为 `true`，则为 SWC 驱动的项目启用类型检查（当 `builder` 为 `swc` 时）。默认值为 `false`。 |
| `emitDeclarations` | 布尔 | 如果 `true`，则在使用 SWC 生成器时发出声明文件（`.d.ts`）。默认值为 `false`。 |
| `includeLibraryAssets` | 阵列 | （**仅限 monorepo**）构建此应用程序时还应复制其资产的库项目名称列表。 |

> warning **Warning** 在 monorepo 模式下，项目的 `compilerOptions` 未与顶层合并 `compilerOptions` 例如，项目级 `assets` 数组替换顶层 `assets` 数组，而不是添加到它。若要在构建应用程序时复制库的资产，请在 `includeLibraryAssets`.

#### 全局生成选项

这些属性指定默认选项 `nest generate` 命令。

| 属性名称 | 属性值类型 | 描述 |
| ------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec` | 布尔_or_对象 | 如果值是布尔值，`true` 启用 `spec` 默认生成和 `false` 禁用它。命令行上传递的标志会覆盖此设置，项目特定的标志也会覆盖此设置 `generateOptions` 设置（见下文）。如果该值是一个对象，则每个键都是一个原理图名称，其布尔值启用或禁用该原理图的默认规范生成。 |
| `flat` | 布尔 | 如果 `true` 所有生成命令都会生成一个扁平结构。 |

默认情况下，以下示例使用布尔值禁用所有项目的规范文件生成：

```javascript
{
  "generateOptions": {
    "spec": false
  },
  ...
}
```

以下示例使用布尔值将平面文件生成设为所有项目的默认值：

```javascript
{
  "generateOptions": {
    "flat": true
  },
  ...
}
```

在以下示例中，仅针对 `service` 原理图（例如，`nest generate service...`）禁用 `spec` 文件生成：

```javascript
{
  "generateOptions": {
    "spec": {
      "service": false
    }
  },
  ...
}
```

> warning **Warning** 将 `spec` 指定为对象时，示意图键不支持别名。例如，如果您设置 `service: false`，然后通过其别名 `s` 生成服务，则仍然会生成规范文件。要涵盖原理图名称及其别名，请指定这两个名称，如下所示。
>
> javascript
> {
> "generateOptions":{
> "规格": {
> “服务”：false，
> "s": false
> }
> },
> ...
> }
> ```

#### 特定于项目的生成选项

除了全局生成选项外，还可以指定特定于项目的生成选项。它们使用与全局选项相同的格式，但您可以直接在每个项目上设置它们。

特定于项目的生成选项会覆盖全局生成选项。

```javascript
{
  "projects": {
    "cats-project": {
      "generateOptions": {
        "spec": {
          "service": false
        }
      },
      ...
    }
  },
  ...
}
```

> warning **Warning** 生成选项按以下优先顺序应用：通过命令行传递的选项优先于特定于项目的选项，而特定于项目的选项又会覆盖全局选项。

#### 指定编译器

标准模式和 monorepo 模式使用不同的默认编译器，因为对于较大的项目（monorepo 中更典型），Rspack 可以显著减少构建时间，并生成一个将所有项目组件捆绑在一起的单个文件。要生成单个文件，请将生成器设置为 `tsc` 或 `swc`。

#### 资产

TypeScript 编译自动分发编译器输出（`.js` 和 `.d.ts` 文件）到指定的输出目录。还可以方便地分发非 TypeScript 文件，例如 `.graphql` 文件、图像、`.html` 文件和其他资产。这可以让你治疗 `nest build`（以及任何初始编译步骤）作为一个轻量级的**开发构建**步骤，其中您可以编辑非-TypeScript 文件并迭代编译和测试。
资产必须位于 `src` 文件夹；否则，它们不会被复制。

的值 `assets` 键是指定要分发的文件的元素数组。元素可以是带有 `glob`-喜欢文件规格，例如：

```typescript
"assets": ["**/*.graphql"],
"watchAssets": true,
```

为了进行更精细的控制，元素可以是具有以下键的对象：

- `"include"`:`glob`-要分发的资产的类似文件规范
- `"exclude"`:`glob`-类似于要**排除**的资产的文件规范 `include` 名单
- `"outDir"`：将资产分发到的路径（相对于根文件夹）。为编译器输出配置的输出目录的默认值。
- `"watchAssets"`：布尔值；如果 `true`，在监视模式下运行，监视指定的资产

例如：

```typescript
"assets": [
  { "include": "**/*.graphql", "exclude": "**/omitted.graphql", "watchAssets": true },
]
```

> warning **Warning** 设置 `watchAssets` 在顶层 `compilerOptions` 属性覆盖任何 `watchAssets` 中的设置 `assets` 财产。

#### 项目物业

此元素仅存在于 monorepo 模式结构中。通常不应编辑这些属性，因为 Nest 使用它们在 monorepo 中定位项目及其配置选项。
