# Interceptors

Source: https://docs.nestjs.com/interceptors

拦截器是一个类，注释为 `@Injectable()` 实现 `NestInterceptor` 接口。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Interceptors_1.png" /></figure>

拦截器提供了一系列受以下启发的功能 [Aspect Oriented Programming](https://en.wikipedia.org/wiki/Aspect-oriented_programming)(AOP) 技术。它们使得：

- 在方法执行之前或之后绑定额外的逻辑
- 转换函数返回的结果
- 转换从函数引发的异常
- 扩展基本函数行为
- 根据特定条件完全覆盖函数（例如，用于缓存目的）

#### 基础

每个拦截器实现 `intercept()` 方法，该方法接受两个参数。第一个是 `ExecutionContext` 实例（与 [警卫](/guards) 完全相同的对象）。`ExecutionContext` 扩展了 `ArgumentsHost`，我们在异常过滤器一章中介绍了这一点。在那里，我们看到它是传递给原始处理程序的参数的包装器，并且根据应用程序的类型，它包含不同的参数数组。有关此主题的更多信息，请参见 [异常筛选器](/exception-filters#arguments-host) 章节。

#### 执行情境

通过扩展 `ArgumentsHost`，`ExecutionContext` 添加了几个帮助方法，这些方法提供了有关当前执行过程的其他详细信息。这些细节有助于您构建更通用的拦截器，这些拦截器可以跨广泛的控制器、方法和执行上下文工作。请参阅 [执行情境](/fundamentals/execution-context) 章节，了解有关 `ExecutionContext` 的更多信息。

#### 呼叫处理程序

第二个参数是 `CallHandler`。`CallHandler` 接口公开了一个 `handle()` 方法，您可以使用该方法在拦截器中的某个点调用路由处理程序方法。如果在实现 `intercept()` 方法时不调用 `handle()`，路由处理程序方法根本不会被执行。

这意味着 `intercept()` 方法有效地**包装**请求/响应流。因此，您可以在执行最终路由处理程序之前和之后实现自定义逻辑。运行代码**之前**处理程序很简单：将其放在 `handle()` 呼吁。要对之后发生的事情采取行动，请使用 `Observable` 那个 `handle()` 退货：您可以申请 [RxJS](https://github.com/ReactiveX/rxjs) 操作员对其进行进一步操纵响应。在面向方面的编程术语中，路由处理程序的调用（即，调用 `handle()`）称为 a[Pointcut](https://en.wikipedia.org/wiki/Pointcut)，表示这是插入我们的附加逻辑的点。

例如，考虑一个传入 `POST /cats` 请求。此请求发送给 `create()` 内部定义的处理程序 `CatsController`.如果拦截器不打电话 `handle()` 在路径的任何地方调用， `create()` 方法不会被执行。一次 `handle()` 被称为 `Observable` 它返回订阅到（Nest 订阅您的流 `intercept()` 方法返回）， `create()` 处理程序被触发。当处理程序的结果流经流时，您可以在最终结果返回给调用者之前对其应用其他操作。

#### 方位截取

我们将研究的第一个用例是使用拦截器来记录用户交互（例如，存储用户调用、异步调度事件或计算时间戳）。以下示例显示了一个简单的 `LoggingInterceptor`：

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('Before...');

    const now = Date.now();
    return next
      .handle()
      .pipe(
        tap(() => console.log(`After... ${Date.now() - now}ms`)),
      );
  }
}
```

> info **Hint** `NestInterceptor<T, R>` 是一个通用接口 `T` 是由 `Observable<T>` 那个 `next.handle()` 返回（响应流），以及 `R` 是由 `Observable<R>` 那个 `intercept()` 回报。

> warning **Notice** 拦截器，如控制器、提供程序、守卫等，可以通过它们的 `constructor`**注入依赖项**。

自从 `handle()` 返回 RxJS`Observable`，您可以从多种运算符中进行选择来操作流。上面的示例使用 `tap()` 运算符，当流发出路由处理程序的结果时，它调用我们的日志函数，而不会干扰响应周期。请注意，如果路由处理程序抛出，则不会调用此函数；要在这种情况下也运行逻辑，请用 `error` 回调至 `tap()`，或使用 `finalize()` 经营者。

> info **Hint** 如上所述，手动给处理程序计时是一个最小版本 APM 是的。[NestJS Observe](https://www.observe.nestjs.com/) 为每个控制器、提供程序和队列使用者记录相同的测量值，无需写入或绑定拦截器。它还记录了每个人花在自己身上的时间，减去了它等待的一切。参见 [Observability](/observability/overview) 篇章。

#### 绑定拦截器

要设置拦截器，请使用 `@UseInterceptors()` 装修师。喜欢 [管道](/pipes) 和 [警卫](/guards) 拦截器可以是控制器作用域、方法作用域或全局作用域。

```typescript
@UseInterceptors(LoggingInterceptor)
export class CatsController {}
```

> info **Hint** 这个 `@UseInterceptors()` 装饰器是从 `@nestjs/common` 包装。

使用上面的构造，`CatsController` 中定义的每个路由处理程序都使用 `LoggingInterceptor`。当客户端调用 `GET /cats` 端点时，您将在标准输出中看到以下内容：

```typescript
Before...
After... 1ms
```

请注意，我们通过了 `LoggingInterceptor` 类（而不是实例），将实例化的责任留给框架并启用依赖注入。与管道、防护和异常筛选器一样，您也可以传递一个就地实例：

```typescript
@UseInterceptors(new LoggingInterceptor())
export class CatsController {}
```

上面的构造将拦截器附加到该控制器声明的每个处理程序。若要将拦截器限制为单个方法，请在**方法级别**应用装饰器。

若要设置全局拦截器，请使用 `useGlobalInterceptors()` 方法 Nest 应用实例：

```typescript
const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(new LoggingInterceptor());
```

全局拦截器应用于应用程序中的每个控制器和每个路由处理程序。但是，在任何模块之外注册的全局拦截器（具有 `useGlobalInterceptors()`（如上面的示例）不能注入依赖项，因为注册发生在任何模块的上下文之外。要解决这个问题，请使用以下结构**直接从任何模块**注册拦截器：

```typescript
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
```

> info **Hint** 当您使用这种方法对拦截器执行依赖注入时，无论您在哪个模块中注册拦截器，拦截器都是全局的。我们建议将其注册到拦截器（`LoggingInterceptor` 在上面的示例中）被定义。所以，`useClass` 不是注册自定义提供者的唯一方法。看 [Custom providers](/fundamentals/custom-providers) 了解更多。

#### 响应映射

返回的流 `handle()` 包含来自路由处理程序的 **returned** 值，因此可以使用 RxJS 的 `map()` 经营者。

> warning **Warning** 响应映射不适用于特定于库的响应策略，即当路由处理程序用 `@Res()` 注入响应对象并发送响应本身时。要将两者结合起来，请启用 `passthrough` 选项（参见 [Library-specific approach](/controllers#library-specific-approach)）。

让我们创建一个 `TransformInterceptor` 这以一种微不足道的方式修改了每个响应，以演示该过程。它使用 RxJS 的 `map()` 将响应对象分配给 `data` 新创建对象的属性，并将新对象返回给客户端。

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(map(data => ({ data })));
  }
}
```

> info **Hint** 这个 `intercept()` 方法可以是同步的或异步的。申报 `async` 如果您在返回流之前需要等待。

有了这个拦截器，一个 `GET /cats` 请求其路由处理程序返回空数组 `[]` 产生以下响应：

```json
{
  "data": []
}
```

拦截器非常适合为跨越整个应用程序的需求构建可重用的解决方案。例如，假设您需要将每个 `null` 响应值替换为空字符串 `''`。您可以通过一行代码来实现这一点，并全局绑定拦截器，以便每个注册处理程序自动使用它。

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ExcludeNullInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(map(value => value === null ? '' : value ));
  }
}
```

#### 异常映射

另一个用例是用 RxJS 的 `catchError()` 操作员：

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  BadGatewayException,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(
        catchError(err => throwError(() => new BadGatewayException())),
      );
  }
}
```

#### 流覆盖

有时，您可能希望完全跳过调用处理程序，而是返回一个不同的值。一个典型的例子是提高响应时间的缓存。让我们看一个简单的**缓存拦截器**，它从缓存返回响应。现实的实施还需要考虑以下因素：TTL、缓存失效和缓存大小，这些超出了本讨论的范围。下面的基本示例演示了主要概念。

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of } from 'rxjs';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isCached = true;
    if (isCached) {
      return of([]);
    }
    return next.handle();
  }
}
```

我们的 `CacheInterceptor` 有一个硬编码 `isCached` 变量和硬编码响应 `[]`.关键是它返回一个新流，由 RxJS 创建 `of()` 函数，所以根本不会调用路由处理程序。当有人调用使用 `CacheInterceptor` 立即返回响应（硬编码的空数组）。若要构建通用解决方案，请使用 `Reflector` 与自定义装饰器一起，如 [警卫](/guards) 篇章。

#### 更多操作员

使用 RxJS 运算符操作流打开了许多可能性。考虑另一个常见用例：处理路由请求的**超时**。如果端点在给定的时间段内没有返回任何内容，您希望以错误响应终止请求。以下构造实现了这一点：

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(5000),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
```

如果路由处理程序在 5 秒内没有发出结果，`timeout()` 用 `TimeoutError` 使流失败，拦截器将其映射到 `RequestTimeoutException`。取消订阅处理程序的流不会中止处理程序已经开始的工作（例如挂起的数据库查询），因此如果需要释放资源，请在抛出 `RequestTimeoutException` 之前添加自定义逻辑。
