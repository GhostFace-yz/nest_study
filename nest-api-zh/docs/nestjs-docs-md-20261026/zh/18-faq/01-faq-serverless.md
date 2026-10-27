# Serverless

Source: https://docs.nestjs.com/faq/serverless

无服务器计算是一种云计算执行模型，其中云提供者按需分配机器资源，代表其客户管理服务器。当应用程序未使用时，不会为其分配任何计算资源。定价基于应用程序消耗的实际资源量（[来源](https://en.wikipedia.org/wiki/Serverless_computing)）。

使用**无服务器架构**，您可以专注于应用程序代码中的单个功能。服务，例如 AWSLambda、Google Cloud 功能和 Microsoft Azure 功能管理物理硬件、虚拟机操作系统和 web 服务器软件。

> info **Hint** 本章没有涵盖无服务器功能的优缺点，也没有深入探讨任何云提供者的具体细节。

#### 冷启动

冷启动是指您的代码在一段时间内第一次运行。根据您的云提供者，它可能跨越几个操作，从下载代码和引导运行时到运行代码。
这个过程会增加**显著的延迟**，这取决于几个因素，如语言和应用程序所需的包数量。

其中一些因素是你无法控制的，但你仍然可以做很多事情来尽可能缩短冷启动期。

当 Nest 是一个为复杂的企业应用设计的成熟框架，它也**适用于更“简单”的应用**（或脚本）。例如，使用 [独立应用程序](/standalone-applications) 功能，您可以使用 Nest 的 DI 系统在简单的工人，CRON 作业、CLI 或无服务器功能。

#### 基准

为了更好地了解使用成本 Nest 或其他知名库（如 `express`）在无服务器函数中，让我们比较一下 Node.js 运行时需要运行以下脚本：

```typescript
// #1 Express
import express from 'express';

async function bootstrap() {
  const app = express();
  app.get('/', (req, res) => res.send('Hello world!'));
  await new Promise<void>((resolve) => app.listen(3000, resolve));
}
await bootstrap();

// #2 Nest (with @nestjs/platform-express)
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

// #3 Nest as a Standalone application (no HTTP server)
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppService } from './app.service.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  console.log(app.get(AppService).getHello());
}
await bootstrap();

// #4 Raw Node.js script
async function bootstrap() {
  console.log('Hello world!');
}
await bootstrap();
```

对于所有这些脚本，我们使用了 `tsc`(TypeScript）编译器，因此代码保持未捆绑（`webpack` 未使用）。

| | |
| ------------------------------------ | ----------------- |
| Express | 0.0079 秒（7.9 毫秒） |
| Nest 和 `@nestjs/platform-express` | 0.1974 秒（197.4 毫秒） |
| Nest（独立应用） | 0.1117 秒（111.7 毫秒） |
| 生的 Node.js 剧本 | 0.0071 秒（7.1 毫秒） |

> info **Note** 机器：MacBook Pro Mid 2014，2.5 GHz 四核英特尔酷睿 i7，16 GB 1600 MHz DDR3，SSD。

现在，让我们重复所有基准测试，这次使用 `webpack` 将应用程序捆绑到单个可执行文件中 JavaScript 文件（如果您有 [Nest CLI](/cli/overview) 已安装，运行 `nest build --webpack`).
而不是默认值 `webpack` 配置 Nest CLI 我们将捆绑所有依赖项（`node_modules`）一起，如下：

```javascript
module.exports = (options, webpack) => {
  const lazyImports = [
    '@nestjs/microservices/microservices-module',
    '@nestjs/websockets/socket-module',
  ];

  return {
    ...options,
    externals: [],
    plugins: [
      ...options.plugins,
      new webpack.IgnorePlugin({
        checkResource(resource) {
          if (lazyImports.includes(resource)) {
            try {
              require.resolve(resource);
            } catch (err) {
              return true;
            }
          }
          return false;
        },
      }),
    ],
  };
};
```

> info **Hint** 使 NestCLI 使用此配置，创建 `webpack.config.js` 项目根目录中的文件。

通过这种配置，我们得到了以下结果：

| | |
| ------------------------------------ | ---------------- |
| Express | 0.0068 秒（6.8 毫秒） |
| Nest 和 `@nestjs/platform-express` | 0.0815 秒（81.5 毫秒） |
| Nest（独立应用） | 0.0319 秒（31.9 毫秒） |
| 生的 Node.js 剧本 | 0.0066 秒（6.6 毫秒） |

> info **Note** 机器：MacBook Pro Mid 2014，2.5 GHz 四核英特尔酷睿 i7，16 GB 1600 MHz DDR3，SSD。

> info **Hint** 您可以使用其他代码缩小和优化技术（例如，使用 `webpack` 插件）。

编译代码的方式（以及是否捆绑代码）对整体启动时间有重大影响。和 `webpack`，您可以获得独立的引导时间 Nest 应用程序（包含一个模块、控制器和服务的入门项目）平均下降到约 32 毫秒，常规应用程序下降到约 81.5 毫秒 HTTP,Express-基于 NestJS 应用。

对于更复杂的 Nest 例如，一个具有 10 个资源的应用程序 `$ nest g resource` 原理图（10 个模块、10 个控制器、10 个服务、20 个 DTO 类，和 50HTTP 端点，加上 `AppModule`），在同一台机器上的整体启动大约需要 0.1298s（129.8ms）。无论如何，将单体应用程序作为无服务器功能运行很少有意义，因此请将此基准测试视为引导时间如何随着应用程序的增长而增加的示例。

#### 运行时优化

到目前为止，我们已经介绍了编译时的优化。这些与定义提供程序和加载方式无关 Nest 应用程序中的模块，随着应用程序的增长，模块起着至关重要的作用。

例如，假设数据库连接被定义为 [异步提供程序](/fundamentals/async-providers)。异步提供程序旨在延迟应用程序启动，直到一个或多个异步任务完成。
如果您的无服务器函数在引导时平均需要 2 秒才能连接到数据库，那么您的端点至少需要额外的两秒钟才能在冷启动时发送响应，因为它必须等到连接建立。

在**无服务器环境**中，引导时间很重要，您会略有不同地构建您的提供者。
例如，如果您使用 Redis 对于仅在某些情况下缓存，您可能不应该定义 Redis 作为异步提供程序的连接：即使对于不需要它的函数调用，它也会减慢引导速度。

还可以使用 `LazyModuleLoader` 类，如中所述 [延迟加载模块](/fundamentals/lazy-loading-modules) 篇章。缓存在这里也是一个很好的例子。
假设您的应用程序有一个 `CacheModule` 连接到 Redis 并出口 a`CacheService` 与 Redis 存储。如果不是每个函数调用都需要它，
你可以按需懒洋洋地加载它。这样，所有不需要缓存的调用在冷启动时都能获得更快的启动时间。

```typescript
if (request.method === RequestMethod[RequestMethod.GET]) {
  const { CacheModule } = await import('./cache.module.js');
  const moduleRef = await this.lazyModuleLoader.load(() => CacheModule);

  const { CacheService } = await import('./cache.service.js');
  const cacheService = moduleRef.get(CacheService);

  return cacheService.get(ENDPOINT_KEY);
}
```

另一个例子是 webhook 或 worker，它根据特定条件（例如，输入参数）执行不同的操作。
在这种情况下，您可以在路由处理程序中添加一个条件，该条件为特定函数调用延迟加载适当的模块，并延迟加载所有其他模块。

```typescript
if (workerType === WorkerType.A) {
  const { WorkerAModule } = await import('./worker-a.module.js');
  const moduleRef = await this.lazyModuleLoader.load(() => WorkerAModule);
  // ...
} else if (workerType === WorkerType.B) {
  const { WorkerBModule } = await import('./worker-b.module.js');
  const moduleRef = await this.lazyModuleLoader.load(() => WorkerBModule);
  // ...
}
```

#### 示例集成

应用程序的条目文件（通常是 `main.ts`）应该看起来像**取决于几个因素**，所以**没有单一的模板**适用于每个场景。
例如，启动无服务器功能所需的初始化文件因云提供者而异（AWS,蔚蓝,GCP 等）。
此外，应用程序的代码看起来也不同，这取决于您是否要运行一个典型的 HTTP 具有多个路由/端点的应用程序或提供单个路由（或执行代码的特定部分）。
例如，对于每个函数端点方法，可以使用 `NestFactory.createApplicationContext()` 而不是启动 HTTP 服务器、设置中间件等。

为了说明的目的，我们将集成 Nest（使用 `@nestjs/platform-express`，因此旋转整个，完全功能 HTTP 路由器）
与 [Serverless](https://www.serverless.com/) 框架（在这种情况下，目标是 AWSλ）。如前所述，您的代码将根据您选择的云提供者以及许多其他因素而有所不同。

首先，安装所需的软件包：

```bash
$ npm i @codegenie/serverless-express
$ npm i -D @types/aws-lambda serverless-offline
```

> info **Hint** 为了加快开发周期，我们安装了 `serverless-offline` 插件，它模拟 AWSλ和 API 本地网关。

安装完成后，创建 `serverless.yml` 配置无服务器框架的文件：

```yaml
service: serverless-example

plugins:
  - serverless-offline

provider:
  name: aws
  runtime: nodejs22.x

functions:
  main:
    handler: dist/main.handler
    events:
      - http:
          method: ANY
          path: /
      - http:
          method: ANY
          path: '{proxy+}'
```

> info **Hint** 要了解有关无服务器框架的更多信息，请访问 [官方文件](https://www.serverless.com/framework/docs/)。

有了这个，打开 `main.ts` 使用所需的样板文件并更新引导代码：

```typescript
import { NestFactory } from '@nestjs/core';
import serverlessExpress from '@codegenie/serverless-express';
import type { Callback, Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module.js';

let server: Handler;

async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule);
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  server = server ?? (await bootstrap());
  return server(event, context, callback);
};
```

> info **Hint** 要创建共享公共模块的多个无服务器函数，我们建议使用 [CLI 单存储模式](/cli/monorepo#monorepo-mode)。

> warning **Warning** 如果您使用 `@nestjs/swagger` 包，从无服务器函数提供 SwaggerUI 服务需要一个额外的步骤。在 API 网关之后，请求的 `originalUrl` 可能缺少 SwaggerUI 预期的尾随斜杠，这会导致无休止的重定向循环。在调用 `SwaggerModule.setup()` 之前**注册一个中间件来还原它：
>
> ``` 打字脚本
> app.use((req, res, next) => {
> 如果 (req.originalUrl === '/招摇') {
> req.originalUrl = '/招摇/';
> }
> next();
> });
> ```

接下来，确保 `esModuleInterop` 选项在您的 `tsconfig.json` 文件，以便 `@codegenie/serverless-express` 包加载正确（使用 `nest new` 默认启用）。

```json
{
  "compilerOptions": {
    ...
    "esModuleInterop": true
  }
}
```

现在构建应用程序（使用 `nest build` 或者 `tsc`）并使用 `serverless`CLI 要在本地启动 Lambda 函数：

```bash
$ npm run build
$ npx serverless offline
```

应用程序运行后，打开浏览器并导航到 `http://localhost:3000/dev/[ANY_ROUTE]`，其中 `[ANY_ROUTE]` 是否在应用程序中注册了任何端点。

以上部分显示了将应用程序与 `webpack` 会对整体引导时间产生重大影响。
要使其与此示例一起工作，包必须公开导出的 `handler` 功能。从 `@nestjs/cli` v12.0.8，默认值 `webpack` 配置通过设置 `output.library.type` 二 `commonjs2`,只要你的 `webpack.config.js` 保持 `...options.output` 当它覆盖时 `output`.
使用旧版本 CLI，或使用不扩展的配置 `options.output`，向您的 `webpack.config.js` 文件。特别是，设置 `output.libraryTarget` 财产至 `commonjs2`.

```javascript
return {
  ...options,
  externals: [],
  output: {
    ...options.output,
    libraryTarget: 'commonjs2',
  },
  // ... the rest of the configuration
};
```

有了这个，运行 `$ nest build --webpack` 编译函数的代码（然后 `$ npx serverless offline` 来测试它）。

我们还建议（但**不需要**，因为这会降低构建速度）安装 `terser-webpack-plugin` 打包并覆盖其配置，以在缩小生产构建时保持类名不变。否则，`class-validator` 可能在您的应用程序中表现不正确。

```javascript
const TerserPlugin = require('terser-webpack-plugin');

return {
  ...options,
  externals: [],
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
        },
      }),
    ],
  },
  output: {
    ...options.output,
    libraryTarget: 'commonjs2',
  },
  // ... the rest of the configuration
};
```

#### 使用独立应用程序功能

或者，如果您希望保持函数的轻量级，并且不需要任何 HTTP-相关特征（路由，还有防护装置、拦截器、管道等），
使用 `NestFactory.createApplicationContext()`（如前所述）而不是运行整个 HTTP 服务器（和 `express` 底层）：

```typescript
import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Callback, Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module.js';
import { AppService } from './app.service.js';

export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const appService = appContext.get(AppService);

  return {
    body: appService.getHello(),
    statusCode: HttpStatus.OK,
  };
};
```

> info **Hint** `NestFactory.createApplicationContext()` 不会用增强器（守卫、拦截器等）包装控制器方法。）.如果需要增强剂，请使用 `NestFactory.create()` 方法。

您也可以通过 `event` 对提供者的反对，例如 `EventsService` 处理它并返回相应的值（取决于输入和您的业务逻辑）。

```typescript
export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const eventsService = appContext.get(EventsService);
  return eventsService.process(event);
};
```
