# REPL

Source: https://docs.nestjs.com/recipes/repl

一个 REPL 是一个交互式环境，它接受单个用户输入，执行它们，并将结果返回给用户。这个 REPL 功能允许您直接从终端检查依赖图并调用提供程序（和控制器）上的方法。

#### 使用

运行您的 NestJS 应用在 REPL 模式，创建新的 `repl.ts` 文件（与现有的 `main.ts` 文件）并添加以下代码：

```typescript
import { repl } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  await repl(AppModule);
}
await bootstrap();
```

然后开始 REPL 使用以下命令从您的终端：

```bash
$ npm run start -- --entryFile repl
```

> info **Hint** 这个 `repl()` 函数返回一个解析为 [Node.js REPL server](https://nodejs.org/api/repl.html) 物体。你可以通过 [Node.js REPL options](https://nodejs.org/api/repl.html#replstartoptions) 作为它的第二个论点。

运行后，您应该会在控制台中看到以下消息：

```bash
LOG [NestFactory] Starting Nest application...
LOG [InstanceLoader] AppModule dependencies initialized
LOG REPL initialized
```

现在，您可以与依赖关系图进行交互。例如，您可以检索 `AppService` 实例（本示例使用 starter 项目）并调用其 `getHello()` 方法：

```typescript
> get(AppService).getHello()
'Hello World!'
```

您可以执行任何 JavaScript 来自终端的代码。例如，您可以指定 `AppController` 局部变量的实例并使用 `await` 要调用异步方法：

```typescript
> appController = get(AppController)
AppController { appService: AppService {} }
> await appController.getHello()
'Hello World!'
```

若要显示给定提供程序或控制器上可用的所有公共方法，请使用 `methods()` 功能，如下：

```typescript
> methods(AppController)

Methods:
 ◻ getHello
```

要将所有注册模块及其控制器和提供程序打印为列表，请使用 `debug()`：

```typescript
> debug()

AppModule:
 - controllers:
  ◻ AppController
 - providers:
  ◻ AppService
```

下面是一个快速演示：

<figure><img src="https://docs.nestjs.com/assets/repl.gif" alt="REPL example" /></figure>

下一节将更详细地描述内置的本机函数。

#### 本机函数

内置的 NestJS REPL 自带一些本机函数，当您启动 REPL.呼叫 `help()` 列出它们。

如果您不记得函数的签名（即预期参数和返回类型），请使用 `<function_name>.help`。例如：

```text
> $.help
Retrieves an instance of either injectable or controller, otherwise, throws exception.
Interface: $(token: InjectionToken) => any
```

> info **Hint** 这些函数接口用 [TypeScript function type expression syntax](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-type-expressions) 编写。

| 功能 | 描述 | 签名 |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `debug` | 将所有注册的模块及其控制器和提供程序打印为列表。传递模块（例如，`debug(MyModule)`）仅打印该模块组件。 | ` 调试(moduleCls?: 类参考 \ | 字符串）=>空 ` |
| `get` 或者 `$` | 检索提供程序或控制器的实例；如果找不到异常，则抛出异常。 | `get(token: InjectionToken) => any` |
| `help` | 显示所有可用内容 REPL 本机函数。 | `help() => void` |
| `methods` | 显示给定提供程序或控制器上可用的所有公共方法。 | `methods(token: ClassRef \ | 字符串）=>空 ` |
| `resolve` | 解析提供程序或控制器的瞬态或请求作用域实例；如果找不到异常，则抛出异常。 | `resolve(token: InjectionToken, contextId: any) => Promise<any>` |
| `select` | 例如，浏览模块树，从选定的模块中提取特定实例。 | `select(token: DynamicModule \ | 类参考) => INestApplicationContext` |

#### 观看模式

在开发过程中，运行 REPL 在监视模式下，以便自动反映代码更改：

```bash
$ npm run start -- --watch --entryFile repl
```

缺点是 REPL 每次重新加载后都会丢弃命令历史记录。要保留它，请修改您的 `bootstrap()` 功能如下：

```typescript
async function bootstrap() {
  const replServer = await repl(AppModule);
  replServer.setupHistory(".nestjs_repl_history", (err) => {
    if (err) {
      console.error(err);
    }
  });
}
```

历史现在在运行和重新加载之间被保留。
