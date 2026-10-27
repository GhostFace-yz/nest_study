# Common errors

Source: https://docs.nestjs.com/faq/common-errors

在学习和工作时 NestJS，您可能会遇到本页所述的错误。

#### “无法解析依赖关系”错误

> info **Hint** [NestJS Devtools](/devtools/overview#debugging-cannot-resolve-dependency-errors) 可以帮助您解决“无法解决依赖项”错误。

最常见的错误信息是 Nest 无法解析提供程序的依赖项。它通常看起来像这样：

```bash
Nest can't resolve dependencies of the <provider> (?). Please make sure that the argument <unknown_token> at index [<index>] is available in the <module> module.

Potential solutions:
- Is <module> a valid NestJS module?
- If <unknown_token> is a provider, is it part of the current <module>?
- If <unknown_token> is exported from a separate @Module, is that module imported within <module>?
  @Module({
    imports: [ /* the Module containing <unknown_token> */ ]
  })

For more common dependency resolution issues, see: https://docs.nestjs.com/faq/common-errors
```

最常见的原因是 `<unknown_token>` 在 `<module>` 中不可用：它既没有列在模块的 `providers` 数组中，也没有由其中一个模块在其 `imports` 数组中导出。确保提供程序已注册并遵循 [standard NestJS provider practices](/fundamentals/custom-providers#di-fundamentals)。

另一个常见的错误是将提供程序放在模块的 `imports` 阵列。如果班级装饰有 `@Injectable()`,Nest 在启动时检测到这一点，并抛出一个错误，说明该类不能出现在“imports”数组中；将其移动到 `providers` 而是数组。

当您遇到此错误时，请打开错误消息中命名的模块并查看其 `providers`。对于 `providers` 数组中的每个提供程序，确保模块可以访问其所有依赖项。提供程序经常在特征模块和根模块中复制，这使得 Nest 尝试两次实例化提供程序。在大多数情况下，您应该删除重复项，并将包含 `<provider>` 的模块添加到根模块的 `imports` 数组中。

还要确保您没有将提供程序注入自身：NestJS 中不允许自我注入。当发生这种情况时，`<unknown_token>` 通常等于 `<provider>`。

如果报告索引处的依赖关系解析为 `undefined` 或者 `Object` 在运行时，错误消息会省略令牌名称，引用**当前**模块，并列出一组不同的潜在解决方案：

```bash
Nest can't resolve dependencies of the <provider> (?). Please make sure that the argument at index [<index>] is available in the current module.

Potential solutions:
- The dependency at index [<index>] appears to be undefined at runtime
- This commonly occurs when using 'import type' instead of 'import' for injectable classes
...
```

这通常有以下原因之一：

1. **循环文件导入。**与 [循环依赖性](/faq/common-errors#circular-dependency-error) 如下所述，提供者在他们的构造函数中并不相互依赖；两个文件最终会相互导入。例如，模块文件声明一个令牌并导入一个提供程序，而提供程序从模块文件导入该令牌常量。如果使用桶文件，请确保您的桶导入不会创建此类循环导入。
2. **通过类型或接口进行注入。**类型和接口在运行时不存在，因此 Nest 不能将它们用作注入标记。改为注入类引用，或者使用带有 `@Inject()` 装饰器的自定义令牌（参见 [定制提供者](/fundamentals/custom-providers)）。
3. **仅导入类型。**对于基于类的提供程序，使用 [`import type ...`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export) 句法。

在**monorepo 设置**中，您可能会看到核心 `ModuleRef` 提供程序与 `<unknown_token>` 相同的错误：

```bash
Nest can't resolve dependencies of the <provider> (?).
Please make sure that the argument ModuleRef at index [<index>] is available in the <module> module.
...
```

当项目加载两个副本时，通常会发生这种情况 `@nestjs/core` 包，如下所示：

```text
.
├── package.json
├── apps
│   └── api
│       └── node_modules
│           └── @nestjs/bull
│               └── node_modules
│                   └── @nestjs/core
└── node_modules
    ├── (other packages)
    └── @nestjs/core
```

解决方案：

- 对于**Yarn**工作区，请使用 [nohoist 功能](https://classic.yarnpkg.com/blog/2018/02/15/nohoist) 防止吊装 `@nestjs/core` 包装。
- 对于**pnpm**工作区，声明 `@nestjs/core` 作为其他模块中的对等依赖项，并设置 `"dependenciesMeta": {"other-module-name": {"injected": true &#125;&#125;` 在 package.json 导入模块的应用程序。看 [dependenciesMeta.injected](https://pnpm.io/package_json#dependenciesmetainjected) 在 pnpm 文档中。

#### “循环依赖”错误

偶尔，你会发现很难避免 [循环依赖关系](/fundamentals/circular-dependency) 在您的应用程序中，您需要帮助 Nest 解决它们。由循环依赖项引起的错误如下所示：

```bash
Nest cannot create the <module> instance.
The module at index [<index>] of the <module> "imports" array is undefined.

Potential causes:
- A circular dependency between modules. Use forwardRef() to avoid it. Read more: https://docs.nestjs.com/fundamentals/circular-dependency
- The module at index [<index>] is of type "undefined". Check your import statements and the type of the module.

Scope [<module_import_chain>]
# example chain AppModule -> FooModule
```

循环依赖关系可以来自相互依赖的提供程序，也可以来自相互依赖常量的 TypeScript 文件（例如，模块文件导出服务文件导入的常量）。在后一种情况下，将常量移动到单独的文件中。在前一种情况下，请遵循 [循环依赖性](/fundamentals/circular-dependency) 指南，并确保模块**和**提供程序都用 `forwardRef()` 包装。

#### 调试相关性错误

除了手动验证依赖项之外，还可以设置 `NEST_DEBUG` 将环境变量转换为任何非空字符串以获取额外的日志记录 Nest 解析应用程序的依赖项。

<figure><img src="https://docs.nestjs.com/assets/injector_logs.png" /></figure>

在上图中，黄色字符串是被注入依赖项的主机类，蓝色字符串是被注入依赖项的名称（或注入令牌），紫色字符串是其中 Nest 搜索依赖项。有了这个输出，您通常可以跟踪依赖解析，并找出注入失败的原因。

#### “检测到文件更改”无休止地循环

Windows 用户开启 TypeScript4.9 或更高版本可能会遇到此问题。当您在监视模式下运行应用程序时（例如，`npm run start:dev`)，您将看到以下日志消息的无尽循环：

```bash
XX:XX:XX AM - File change detected. Starting incremental compilation...
XX:XX:XX AM - Found 0 errors. Watching for file changes.
```

当您使用 NestCLI 在监视模式下启动应用程序时，它会在监视模式下运行 TypeScript 编译器（相当于 `tsc --watch`）。TypeScript4.9 引入了一个 [新战略](https://devblogs.microsoft.com/typescript/announcing-typescript-4-9/#file-watching-now-uses-file-system-events) 来检测文件更改，这可能是这个问题的原因。
要解决此问题，请在 `"compilerOptions"` 选项之后添加以下设置到 `tsconfig.json` 文件中：

```json
  "watchOptions": {
    "watchFile": "fixedPollingInterval"
  }
```

这说明 TypeScript 轮询文件更改，而不是使用文件系统事件（自 4.9 以来的默认设置），这可能会在某些计算机上导致问题。
要了解更多信息，请参阅 [`watchFile` option](https://www.typescriptlang.org/tsconfig#watch-watchFile) 在 TypeScript 文件。
