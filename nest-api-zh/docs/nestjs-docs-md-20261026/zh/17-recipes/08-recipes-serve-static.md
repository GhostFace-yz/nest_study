# Serve static

Source: https://docs.nestjs.com/recipes/serve-static

提供静态内容，例如单页应用程序（SPA），使用 `ServeStaticModule` 从 [`@nestjs/serve-static`](https://www.npmjs.com/package/@nestjs/serve-static) 包装。

#### 安装

首先，安装所需的软件包：

```bash
$ npm install --save @nestjs/serve-static
```

#### 引导

安装完成后，导入 `ServeStaticModule` 深入根源 `AppModule` 并通过将配置对象传递给 `forRoot()` 方法：

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(import.meta.dirname, '..', 'client'),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

完成此操作后，构建静态网站并将其内容放置在指定的位置 `rootPath` 财产。

#### 配置

这个 [`ServeStaticModule`](https://github.com/nestjs/serve-static) 接受各种选项来自定义其行为。例如，您可以设置静态应用程序的呈现路径，排除特定路径，或者启用或禁用 `Cache-Control` 响应头。参见 [`ServeStaticModuleOptions` interface](https://github.com/nestjs/serve-static/blob/master/lib/interfaces/serve-static-options.interface.ts) 查看完整的选项列表。

> warning **Notice** 默认情况下，`renderPath` 匹配所有路径，模块用 `index.html` 文件。这可以为您的客户端路由 SPA，而控制器中声明的路由仍然由服务器处理。您可以通过组合 `serveRoot` 和 `renderPath` 与其他选项的选项。与 Fastify 适配器，套件 `serveStaticOptions.fallthrough` 二 `true` 模仿 Express 直通行为，即发送 `index.html` 而不是不存在的路由的 404 错误。

#### 例子

工作示例可在 [静态采样](https://github.com/nestjs/nest/tree/master/sample/24-serve-static) 在 GitHub 上。
