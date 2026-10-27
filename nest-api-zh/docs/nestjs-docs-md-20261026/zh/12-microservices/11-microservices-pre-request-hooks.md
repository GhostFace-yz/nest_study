# Pre-request hooks

Source: https://docs.nestjs.com/microservices/pre-request-hooks

预请求钩子是在每次调用模式处理程序时运行在所有增强器（防护、拦截器和管道）之前的函数。它们相当于微服务 HTTP 中间件：建立每个请求上下文的地方，该上下文必须对守卫和管道的其余部分可见。

> info **Hint** 这个 `PreRequestHook` 接口从 `@nestjs/common` 包装。

钩子在以下序列的开头运行：

```
Incoming message
  └─ Pre-request hooks  (registration order)
       └─ Guards
            └─ Interceptors
                 └─ Pipes
                      └─ Handler
```

抛入钩子中的异常会被覆盖管道其余部分的相同包装器捕获，因此您现有的 [异常筛选器](/microservices/exception-filters) 无需额外配置即可处理它们。

#### 捆扎钩

在微服务初始化之前（即，在调用 `app.listen()` 或 `app.init()` 之前），使用 `registerPreRequestHook()` 方法在微服务实例上注册挂钩。初始化后注册的钩子将被忽略，Nest 会记录警告。多个调用按注册顺序累积挂钩。

每个钩子接收一个 `ExecutionContext` 和一个 `next` 功能。呼叫 `next()` 前进到下一个挂钩，或者当没有挂钩时，前进到防护→拦截器→管道→处理器管道。钩子必须返回一个 `Observable`：由 `next()` 或者包裹它的。

> warning **Warning** 如果钩子不叫 `next()` 处理程序从不运行。这是同一份合同 HTTP 中间件。

> info **Note** 在一个 [混合应用](/faq/hybrid-application),`connectMicroservice()` 立即初始化连接的微服务（除非通过 `deferInitialization: true` 在它的第二个参数中），因此不应用随后在返回的实例上注册的钩子。

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    { transport: Transport.TCP },
  );

  app.registerPreRequestHook((ctx, next) => {
    return next();
  });

  await app.listen();
}
await bootstrap();
```

#### 异步存储传播

常见用例正在初始化 `AsyncLocalStorage` 在守卫运行之前，这使得存储在整个管道中可用：

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module.js';

export const als = new AsyncLocalStorage<{ correlationId: string }>();

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    { transport: Transport.TCP },
  );

  app.registerPreRequestHook((ctx, next) => {
    return new Observable(subscriber => {
      als.run({ correlationId: randomUUID() }, () => {
        next().subscribe(subscriber);
      });
    });
  });

  await app.listen();
}
await bootstrap();
```

因为钩子跑在守卫前面，`als.getStore()` 返回任何防护、拦截器或处理程序中的初始化存储：

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { als } from './main.js';

@Injectable()
export class CorrelationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { correlationId } = als.getStore()!;
    return true;
  }
}
```

#### 日志记录和指标

可以将 RxJS 运算符应用于 `Observable` 返回者 `next()` 要观察完整的处理程序生命周期：

```typescript
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

app.registerPreRequestHook((ctx, next) => {
  const handler = ctx.getHandler().name;
  const start = Date.now();

  return next().pipe(
    tap(() => console.log(`[${handler}] completed in ${Date.now() - start}ms`)),
    catchError(err => {
      console.error(`[${handler}] failed:`, err.message);
      return throwError(() => err);
    }),
  );
});
```

> info **Hint** 预请求挂钩是全局的：您不能为单个模式注册它们。当没有注册挂钩时，Nest 完全跳过钩子链，因此该特性不会增加开销。预请求挂钩不适用于 WebSocket 网关。
