# Commander

Source: https://docs.nestjs.com/recipes/nest-commander

扩展 [独立应用程序](/standalone-applications) 章节，[nest-commander](https://nest-commander.jaymcdoniel.dev) 包允许您编写结构类似于典型的命令行应用程序 Nest 应用。

> info **Note** `nest-commander` 是第三方软件包，不由 NestJS 核心团队管理。请在 [嵌套命令官存储库](https://github.com/jmcdo29/nest-commander/issues/new/choose) 中报告库的任何问题。

#### 安装

首先，安装软件包：

```bash
$ npm i nest-commander
```

#### 命令文件

`nest-commander` 允许您使用 [装饰师](https://www.typescriptlang.org/docs/handbook/decorators.html)：`@Command()` 类的装饰器 `@Option()` 这些类方法的装饰器。每个命令类都应该扩展 `CommandRunner` 抽象类并用 `@Command()` 装修师。

Nest 将每个命令视为 `@Injectable()`，因此依赖注入照常工作。`CommandRunner` 抽象类确保每个命令都有一个 `run()` 方法，该方法返回 `Promise<void>` 并接受参数 `string[], Record<string, any>`。`run()` 方法是命令逻辑开始的地方。它的第一个参数是一个不匹配选项标志的所有参数的数组，以防您需要处理多个参数。在第二个参数 options 对象中，属性名称与赋予 `@Option()` 装饰器的 `name` 属性匹配，它们的值是相应 options 处理程序的返回值。为了获得更好的类型安全性，您还可以为您的选项创建一个界面。

#### 运行命令

在 NestJS 应用程序中，您使用 `NestFactory` 创建服务器并使用 `listen()` 运行它。类似地，`nest-commander` 包公开了一个 API 来运行您的命令行应用程序：导入 `CommandFactory`，调用其静态 `run()` 方法，并传入应用程序的根模块：

```ts
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';

async function bootstrap() {
  await CommandFactory.run(AppModule);
}

await bootstrap();
```

默认情况下，当使用 `CommandFactory` 时，Nest 的记录器是禁用的。要启用它，请将记录器作为第二个参数传递给 `run()` 方法。您可以提供自定义 NestJS 记录器或要保留的日志级别数组。例如，传递 `['error']` 仅打印 Nest 的错误日志。

```ts
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';
import { LogService } from './log.service.js';

async function bootstrap() {
  await CommandFactory.run(AppModule, new LogService());

  // or, if you only want to print Nest's warnings and errors
  await CommandFactory.run(AppModule, ['warn', 'error']);
}

await bootstrap();
```

在底层，`CommandFactory` 呼叫 `NestFactory` 为了你和电话 `app.close()` 当命令完成时，所以你不需要担心内存泄漏。若要添加错误处理，请将 `run()` 呼叫 `try/catch` 块或链 a`.catch()` 打电话给 `bootstrap()` 呼吁。

#### 检测

`nest-commander` 提供与其他部分相匹配的测试实用程序 NestJS 生态系统。而不是使用 `CommandFactory` 若要在测试模式下构建命令，请使用 `CommandTestFactory` 从 `nest-commander-testing` 打包并传入模块元数据，类似于如何 `Test.createTestingModule()` 来自 `@nestjs/testing` 工作。事实上，它使用 `@nestjs/testing` 底层。你仍然可以锁链 `overrideProvider()` 呼叫前呼叫 `compile()` 在测试中交换提供程序。

#### 把这一切放在一起

以下类定义了一个 CLI 可以接受子命令的命令 `basic` 或者直接打电话。它支持 `-n`,`-s`，和 `-b` 标志（及其长形式），每个选项都有一个自定义解析器。这个 `--help` 也支持标志，这是命令官的惯例。

```ts
import { Command, CommandRunner, Option } from 'nest-commander';
import { LogService } from './log.service.js';

interface BasicCommandOptions {
  string?: string;
  boolean?: boolean;
  number?: number;
}

@Command({ name: 'basic', description: 'A parameter parse' })
export class BasicCommand extends CommandRunner {
  constructor(private readonly logService: LogService) {
    super();
  }

  async run(
    passedParam: string[],
    options?: BasicCommandOptions,
  ): Promise<void> {
    if (options?.boolean !== undefined && options?.boolean !== null) {
      this.runWithBoolean(passedParam, options.boolean);
    } else if (options?.number) {
      this.runWithNumber(passedParam, options.number);
    } else if (options?.string) {
      this.runWithString(passedParam, options.string);
    } else {
      this.runWithNone(passedParam);
    }
  }

  @Option({
    flags: '-n, --number [number]',
    description: 'A basic number parser',
  })
  parseNumber(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '-s, --string [string]',
    description: 'A string return',
  })
  parseString(val: string): string {
    return val;
  }

  @Option({
    flags: '-b, --boolean [boolean]',
    description: 'A boolean parser',
  })
  parseBoolean(val: string): boolean {
    return JSON.parse(val);
  }

  runWithString(param: string[], option: string): void {
    this.logService.log({ param, string: option });
  }

  runWithNumber(param: string[], option: number): void {
    this.logService.log({ param, number: option });
  }

  runWithBoolean(param: string[], option: boolean): void {
    this.logService.log({ param, boolean: option });
  }

  runWithNone(param: string[]): void {
    this.logService.log({ param });
  }
}
```

确保将命令类添加到模块中：

```ts
@Module({
  providers: [LogService, BasicCommand],
})
export class AppModule {}
```

然后，运行 CLI，将以下内容添加到 `main.ts` 文件：

```ts
async function bootstrap() {
  await CommandFactory.run(AppModule);
}

await bootstrap();
```

您现在有了一个命令行应用程序。

#### 更多信息

参观 [nest-commander 文档站点](https://nest-commander.jaymcdoniel.dev) 有关更多信息、示例和 API 文件。
