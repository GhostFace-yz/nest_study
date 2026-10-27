# Keep-Alive connections

Source: https://docs.nestjs.com/faq/keep-alive-connections

默认情况下，NestJSHTTP 适配器会等到响应完成后再关闭应用程序。有时这种行为是不需要的或出乎意料的：有些请求使用 `Connection: Keep-Alive` 头并保持它们的连接长时间打开。

如果希望应用程序总是退出，而不必等待这些连接结束，请启用 `forceCloseConnections` 创建您的 NestJS 应用。

> info **Hint** 大多数用户不需要这个选项。您遇到的典型症状是应用程序不会在您期望的时候退出，通常启用了 `app.enableShutdownHooks()`，最常见的是在使用 `--watch` 运行的开发过程中。

#### 使用

在你的 `main.ts` 创建文件时启用该选项 NestJS 应用：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    forceCloseConnections: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
```

> info **Note** 两者 Express 和 Fastify 适配器实现 `forceCloseConnections` 应用选项。和 Fastify，这需要 NestJSv12.1 或更高版本。在早期版本中，通过 Fastify 自己的 `forceCloseConnections` 服务器选项到 `FastifyAdapter` 而是构造函数。
