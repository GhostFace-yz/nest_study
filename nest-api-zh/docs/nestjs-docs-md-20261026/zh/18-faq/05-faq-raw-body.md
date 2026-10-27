# Raw body

Source: https://docs.nestjs.com/faq/raw-body

访问原始请求主体的最常见原因之一是 webhook 签名验证。验证 webhook 签名通常需要未解析的请求主体计算 HMAC 哈希。

> warning **Warning** 只有在启用了内置的全局正文解析器中间件时，此功能才有效，即，您不得通过 `bodyParser: false` 创建应用程序时。

#### 与 Express

首先，在创建 NestExpress 应用：

```typescript
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

// in the "bootstrap" function
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  rawBody: true,
});
await app.listen(process.env.PORT ?? 3000);
```

若要访问控制器中的原始请求主体，请使用 `RawBodyRequest` 方便界面，它公开了一个 `rawBody` 字段：

```typescript
import { Controller, Post, type RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('cats')
class CatsController {
  @Post()
  create(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody; // returns a `Buffer`.
  }
}
```

#### 注册不同的解析器

默认情况下，只有 `json` 和 `urlencoded` 解析器是注册的。要使用不同的解析器，请显式注册它。

例如，要注册 `text` 解析器：

```typescript
app.useBodyParser('text');
```

> warning **Warning** 确保将正确的应用程序类型传递给 `NestFactory.create()` 调用。对于 Express 应用程序，正确的类型是 `NestExpressApplication`；否则，将找不到 `useBodyParser()` 方法。

#### 正文解析器大小限制

如果应用程序需要解析大于 Express 默认 `100kb`，提高限制：

```typescript
app.useBodyParser('json', { limit: '10mb' });
```

这个 `useBodyParser()` 方法尊重 `rawBody` 在应用程序选项中传递的选项。

#### 与 Fastify

首先，在创建 NestFastify 应用：

```typescript
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

// in the "bootstrap" function
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
  {
    rawBody: true,
  },
);
await app.listen(process.env.PORT ?? 3000);
```

若要访问控制器中的原始请求主体，请使用 `RawBodyRequest` 方便界面，它公开了一个 `rawBody` 字段：

```typescript
import { Controller, Post, type RawBodyRequest, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

@Controller('cats')
class CatsController {
  @Post()
  create(@Req() req: RawBodyRequest<FastifyRequest>) {
    const raw = req.rawBody; // returns a `Buffer`.
  }
}
```

#### 注册不同的解析器

默认情况下，只有 `application/json` 和 `application/x-www-form-urlencoded` 解析器是注册的。要使用不同的解析器，请显式注册它。

例如，要注册 `text/plain` 解析器：

```typescript
app.useBodyParser('text/plain');
```

> warning **Warning** 确保将正确的应用程序类型传递给 `NestFactory.create()` 调用。对于 Fastify 应用程序，正确的类型是 `NestFastifyApplication`；否则，将找不到 `useBodyParser()` 方法。

#### 正文解析器大小限制

如果应用程序需要解析大于 Fastify 默认值为 1 MiB，提高限制：

```typescript
const bodyLimit = 10_485_760; // 10MiB
app.useBodyParser('application/json', { bodyLimit });
```

这个 `useBodyParser()` 方法尊重 `rawBody` 在应用程序选项中传递的选项。
