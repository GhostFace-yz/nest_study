# Performance (Fastify)

Source: https://docs.nestjs.com/http/performance

默认情况下，Nest 使用 [Express](https://expressjs.com/) 框架。Nest 也与其他库兼容，如 [Fastify](https://github.com/fastify/fastify)。它通过框架适配器实现这种框架独立性，框架适配器的主要工作是将中间件和处理程序代理到适当的特定于库的实现。

> info **Hint** 框架适配器只能用于提供类似于 Express 的请求/响应管道处理的库。

[Fastify](https://github.com/fastify/fastify) 是 Nest 的一个很好的替代框架，因为它以类似于 Express 的方式解决设计问题。然而，Fastify 明显**快**于 Express，达到了基准结果的近两倍。Nest 仍然使用 Express 作为默认的 HTTP 提供程序，因为 Express 被广泛使用，众所周知，并且有一组巨大的兼容中间件，Nest 用户开箱即用。

因为 Nest 是框架独立的，您可以在两者之间迁移。Fastify 当原始速度是优先事项时，可能是一个更好的选择。使用 Fastify，选择内置 `FastifyAdapter`，如本章所示。

#### 安装

首先，安装所需的软件包：

```bash
$ npm i --save @nestjs/platform-fastify
```

#### 适配器

安装 Fastify 平台后，您可以使用 `FastifyAdapter`。

```typescript
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

默认情况下，Fastify 仅在 `localhost` 接口上侦听（参见 [Fastify getting started guide](https://fastify.dev/docs/latest/Guides/Getting-Started/#your-first-server)）。要接受其他主机上的连接，请在 `listen()` 调用中指定 `'0.0.0.0'`：

```typescript
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.listen(3000, '0.0.0.0');
}
```

#### 平台特定软件包

当您使用 `FastifyAdapter`,Nest 使用 Fastify 作为**HTTP 提供者**。这意味着食谱依赖于 Express 可能行不通。使用 Fastify-替代等效包。

#### 重定向响应

Fastify 处理重定向响应的方式与 Express 略有不同。若要使用 Fastify 重定向，请使用 `status()` 设置状态码，然后使用 URL 调用 `redirect()`：

```typescript
@Get()
index(@Res() res) {
  res.status(302).redirect('/login');
}
```

#### Fastify 选项

您可以将选项传递给 Fastify 实例通过 `FastifyAdapter` 构造函数。例如：

```typescript
new FastifyAdapter({ logger: true });
```

#### 中间件

中间件函数接收原始数据 `req` 和 `res` 对象而不是 Fastify 包装纸。这就是 `@fastify/middie` 包，其中 Nest 在底层使用，工作。参见 [Fastify middleware documentation](https://fastify.dev/docs/latest/Reference/Middleware/) 欲了解更多信息。

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    console.log('Request...');
    next();
  }
}
```

#### 路由配置

使用 `@RouteConfig()` 装饰器应用 Fastify 的 [路由配置](https://fastify.dev/docs/latest/Reference/Routes/#config) 特征。

```typescript
@RouteConfig({ output: 'hello world' })
@Get()
index(@Req() req) {
  return req.routeConfig.output;
}
```

#### 路线约束

使用 `@RouteConstraints()` 装饰器应用 Fastify 的 [路线约束](https://fastify.dev/docs/latest/Reference/Routes/#constraints) 特征。

```typescript
@RouteConstraints({ version: '1.2.x' })
newFeature() {
  return 'This works only for version >= 1.2.x';
}
```

> info **Hint** `@RouteConfig()` 和 `@RouteConstraints()` 是从 `@nestjs/platform-fastify` 导入的。

#### 例子

[nestjs/nest repository](https://github.com/nestjs/nest/tree/master/sample/10-fastify) 中提供了一个工作示例。
