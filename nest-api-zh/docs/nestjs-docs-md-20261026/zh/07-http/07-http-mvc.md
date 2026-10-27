# Model-View-Controller

Source: https://docs.nestjs.com/http/mvc

默认情况下，Nest 使用 [Express](https://github.com/expressjs/express) 底层的图书馆。因此，每种使用 MVC（模型视图控制器）模式 Express 适用于 Nest 也是。

首先，搭建一个新的 Nest 使用 [CLI](https://github.com/nestjs/nest-cli) 工具：

```bash
$ npm i -g @nestjs/cli
$ nest new project
```

创建一个 MVC 应用程序，您还需要一个 [模板引擎](https://expressjs.com/en/guide/using-template-engines.html) 渲染 HTML 观点：

```bash
$ npm install --save hbs
```

本示例使用 `hbs`([Handlebars](https://github.com/pillarjs/hbs#readme)) 引擎，但您可以使用任何适合您要求的引擎。安装过程完成后，配置 Express 使用以下代码的实例：

```typescript
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );

  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));
  app.setBaseViewsDir(join(import.meta.dirname, '..', 'views'));
  app.setViewEngine('hbs');

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

这说明 Express 那个 `public` 目录存储静态资产，`views` 目录包含模板，并且 `hbs` 模板引擎渲染 HTML 产量。

#### 模板渲染

现在，创建一个 `views` 带有 `index.hbs` 里面的模板。模板打印 `message` 从控制器传递：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>App</title>
  </head>
  <body>
    {{ "{{ message }\}" }}
  </body>
</html>
```

接下来，打开 `app.controller` 文件并用以下代码替换其内容：

```typescript
import { Get, Controller, Render } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  @Render('index')
  root() {
    return { message: 'Hello world!' };
  }
}
```

此代码指定要在 `@Render()` 装饰器，并将路由处理程序方法的返回值传递给模板进行渲染。返回值是一个对象 `message` 属性，匹配 `message` 模板中的占位符。

当应用程序运行时，打开浏览器并导航到 `http://localhost:3000`。您应该会看到 `Hello world!` 消息。

#### 添加布局

`hbs` 引擎支持布局：呈现单个视图的共享包装模板。要使用一个，请使用 `setLocal()` 方法设置 `layout` 局部变量（Nest 围绕 Express 的 [app.locals](https://expressjs.com/en/5x/api.html#app.locals) 的包装）。修改前面的代码如下：

```typescript
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );

  app.setLocal('layout', 'layouts/app');
  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));
  app.setBaseViewsDir(join(import.meta.dirname, '..', 'views'));
  app.setViewEngine('hbs');

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

接下来，创建 `layouts` 文件夹内部 `views` 并添加一个 `app.hbs` 包含以下内容的文件：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>App</title>
  </head>
  <body>
    {{{body}}}
  </body>
</html>
```

然后，更新 `index.hbs` 归档至：

```html
{{ "{{ message }\}" }}
```

生成的文件结构如下所示：

<div class="file-tree">
  <div class="item">views</div>
  <div class="children">
    <div class="item">layouts</div>
    <div class="children">
      <div class="item">app.hbs</div>
    </div>
    <div class="item">index.hbs</div>
  </div>
</div>

#### 动态模板渲染

如果应用程序逻辑必须动态决定要呈现哪个模板，请使用 `@Res()` 装饰器并在路由处理程序中提供视图名称，而不是在 `@Render()` 装饰师：

> info **Hint** 何时 Nest 检测 `@Res()` 装饰器，它注入特定于库的 `response` 对象，您可以使用它来动态呈现模板。参见 [Express API reference](https://expressjs.com/en/api.html) 了解更多关于 `response` 物体。

```typescript
import { Get, Controller, Res, Render } from '@nestjs/common';
import { Response } from 'express';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private appService: AppService) {}

  @Get()
  root(@Res() res: Response) {
    return res.render(
      this.appService.getViewName(),
      { message: 'Hello world!' },
    );
  }
}
```

#### 例子

[15-mvc 样品](https://github.com/nestjs/nest/tree/master/sample/15-mvc) 中提供了一个工作示例。

#### Fastify

如 [Performance (Fastify)](/http/performance) 章节所述，您可以将任何兼容的 HTTP 提供程序与 Nest 一起使用。一个这样的库是 [Fastify](https://github.com/fastify/fastify)。要使用 Fastify 创建 MVC 应用程序，请安装以下软件包：

```bash
$ npm i --save @fastify/static @fastify/view handlebars
```

接下来的步骤几乎遵循与 Express，具有微小的平台特定差异。安装过程完成后，打开 `main.ts` 文件并更新其内容：

```typescript
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { join } from 'node:path';
import Handlebars from 'handlebars';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.useStaticAssets({
    root: join(import.meta.dirname, '..', 'public'),
    prefix: '/public/',
  });
  app.setViewEngine({
    engine: {
      handlebars: Handlebars,
    },
    templates: join(import.meta.dirname, '..', 'views'),
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

这个 FastifyAPI 有一些差异，但这些方法调用的最终结果是相同的。一个显著的区别是 Fastify，传递给 `@Render()` 装饰器必须包含文件扩展名：

```typescript
import { Get, Controller, Render } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  @Render('index.hbs')
  root() {
    return { message: 'Hello world!' };
  }
}
```

或者，您可以使用 `@Res()` 直接注入响应并指定要渲染的视图的装饰器，如下所示：

```typescript
import { Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';

@Get()
root(@Res() res: FastifyReply) {
  return res.view('index.hbs', { message: 'Hello world!' });
}
```

当应用程序运行时，打开浏览器并导航到 `http://localhost:3000`。您应该会看到 `Hello world!` 消息。

#### 例子

[17-mvc-fastify 样本](https://github.com/nestjs/nest/tree/master/sample/17-mvc-fastify) 中提供了一个工作示例。
