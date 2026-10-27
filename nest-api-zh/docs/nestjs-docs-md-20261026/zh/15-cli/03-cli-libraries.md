# Libraries

Source: https://docs.nestjs.com/cli/libraries

许多应用程序需要解决相同的一般问题，或者在几个上下文中重用模块化组件。Nest 提供了一些解决这个问题的方法。每个都在不同的层次上工作，并有助于满足不同的架构和组织目标。

Nest[模块](/modules) 提供一个执行上下文，允许在单个应用程序中共享组件。您还可以使用 [npm](https://npmjs.com) 创建不同项目可以安装的可重用库。这是将可配置的、可重用的库分发给松散连接的组织或无关组织的有效方式（例如，通过分发和安装第三方库）。

对于在组织紧密的组内（例如，在公司或项目边界内）共享代码，更轻量级的方法可能会很有用。Monorepos 的出现就是为了实现这一点，在 monorepo 中，**库**提供了一种轻量级的代码共享方式。在一个 Nestmonorepo，库使得组装共享组件的应用程序变得简单。这也鼓励您分解单片应用程序，并将开发重点放在构建和组成模块化组件上。

#### Nest 文库

一个 Nest 图书馆是 Nest 与应用程序不同，不能自行运行的项目。库必须导入到包含应用程序中，才能执行其代码。本节中描述的对库的内置支持仅适用于**monorepos**（标准模式项目可以使用 npm 包实现类似的功能）。

例如，一个组织可以开发一个 `AuthModule` 它通过实施管理所有内部应用程序的公司策略来管理身份验证。monorepo 可以将模块定义为一个库，而不是为每个应用程序单独构建该模块，或者用 npm 打包代码并要求每个项目安装它。通过这种方式组织，库模块的所有使用者都会看到一个最新版本的 `AuthModule` 一旦提交。这可以极大地帮助协调组件开发和组装，并简化端到端测试。

#### 创建库

任何适合重用的功能都是库的候选功能。决定什么应该是库，什么应该是应用程序的一部分，是一个架构设计决策。创建库不仅仅是将代码从现有应用程序复制到其中：库代码必须与应用程序分离。这可能会预先花费**更多**时间，并迫使设计决策，而您在更紧密耦合的代码中不会面临这些决策。当该库允许您更快地组装多个应用程序时，这种努力就会得到回报。

要创建库，请运行以下命令：

```bash
$ nest g library my-library
```

运行该命令时，`library` 示意图会提示您输入库的前缀（也称为别名）：

```bash
What prefix would you like to use for the library (default: @app or 'defaultLibraryPrefix' setting value)?
```

默认前缀是 `@app` 除非你的 `nest-cli.json` 文件集 a`defaultLibraryPrefix` 财产。

命令创建一个名为 `my-library` 在你的工作区。类似于应用程序类型的项目，库类型的项目通过原理图生成到命名文件夹中。图书馆生活在 `libs`monorepo 根的文件夹。Nest 创建 `libs` 创建第一个库时的文件夹。

为库生成的文件与为应用程序生成的文件略有不同。以下是 `libs` 运行上述命令后的文件夹：

<div class="file-tree">
  <div class="item">libs</div>
  <div class="children">
    <div class="item">my-library</div>
    <div class="children">
      <div class="item">src</div>
      <div class="children">
        <div class="item">index.ts</div>
        <div class="item">my-library.module.ts</div>
        <div class="item">my-library.service.ts</div>
      </div>
      <div class="item">tsconfig.lib.json</div>
    </div>
  </div>
</div>

这个 `nest-cli.json` 文件现在在 `"projects"` 关键：

```javascript
...
{
    "my-library": {
      "type": "library",
      "root": "libs/my-library",
      "entryFile": "index",
      "sourceRoot": "libs/my-library/src",
      "compilerOptions": {
        "tsConfigPath": "libs/my-library/tsconfig.lib.json"
      }
}
...
```

有两个区别 `nest-cli.json` 库和应用程序之间的元数据：

- 这个 `"type"` 属性设置为 `"library"` 而不是 `"application"`
- 这个 `"entryFile"` 属性设置为 `"index"` 而不是 `"main"`

这些差异告诉构建过程适当地处理库。例如，库通过 `index.js` 文件。

与应用程序类型的项目一样，每个库都有自己的 `tsconfig.lib.json` 扩展根文件（monorepo-wide）`tsconfig.json` 文件。您可以修改此文件以提供特定于库的编译器选项。

要构建库，请运行：

```bash
$ nest build my-library
```

#### 使用图书馆

生成的配置文件就位后，使用库非常简单。假设您想使用 `MyLibraryService` 从 `my-library` 图书馆 `my-project` 应用。

使用库模块与使用任何其他 Nest 模块相同。monorepo 管理路径，以便导入库和生成版本是透明的。要使用 `MyLibraryService`，请导入其声明模块。按如下方式修改 `my-project/src/app.module.ts` 以导入 `MyLibraryModule`：

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MyLibraryModule } from '@app/my-library';

@Module({
  imports: [MyLibraryModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

这个 `import` 上面的语句使用 `@app` 路径别名，即 `prefix` 我们供应给 `nest g library` 命令。Nest 通过 tsconfig 路径映射实现这一点。添加库时，Nest 更新 `"paths"` 全球钥匙（单一回购）`tsconfig.json` 文件如下：

```javascript
"paths": {
    "@app/my-library": [
        "./libs/my-library/src"
    ],
    "@app/my-library/*": [
        "./libs/my-library/src/*"
    ]
}
```

在 ESM 项目中，第一个条目指向库的条目文件（`./libs/my-library/src/index.ts`）。

> warning **Warning** `paths` 映射仅由 TypeScript 编译器理解。测试运行者自己解析模块。如果使用 Jest 运行应用程序的端到端测试，请在该应用程序的 e2eJest 配置 `moduleNameMapper` 选项中镜像每个别名，例如：`"moduleNameMapper": { "^@app/my-library(|/.*)$": "<rootDir>/../../libs/my-library/src/$1" }`。否则，即使项目编译，通过别名导入也会在测试运行时失败。

monorepo 和库特性一起使得在应用程序中包含库模块变得简单。

相同的机制允许您构建和部署组成库的应用程序。导入 `MyLibraryModule` 后，`nest build` 会自动处理模块解析，并捆绑应用程序以及任何库依赖项以供部署。monorepo 的默认编译器是**Rspack**，因此输出是一个捆绑所有 transpiledJavaScript 的文件。您可以切换到 `tsc`，如 [Global compiler options](/cli/monorepo#global-compiler-options) 中所述。
