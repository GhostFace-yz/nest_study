# Exception filters

Source: https://docs.nestjs.com/microservices/exception-filters

HTTP[异常过滤器](/exception-filters) 层和相应的微服务层之间的唯一区别是，微服务应该抛出 `RpcException` 而不是 `HttpException`。

```typescript
throw new RpcException('Invalid credentials.');
```

> info **Hint** 这个 `RpcException` 类是从 `@nestjs/microservices` 包装。

Nest 处理引发的异常并返回一个 `error` 具有以下结构的对象：

```json
{
  "status": "error",
  "message": "Invalid credentials."
}
```

如果将对象传递给 `RpcException` 构造函数而不是字符串，Nest 按原样返回该对象。

> warning **Warning** 事件处理程序没有响应流。过滤器为 `@EventPattern()` 处理程序永远不会到达生产者，所以处理过滤器内部的错误。

#### 过滤器

微服务异常筛选器的行为类似于 HTTP 异常过滤器，有一个区别： `catch()` 方法必须返回一个 `Observable`.

```typescript
import { Catch, RpcExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

@Catch(RpcException)
export class ExceptionFilter implements RpcExceptionFilter<RpcException> {
  catch(exception: RpcException, host: ArgumentsHost): Observable<any> {
    return throwError(() => exception.getError());
  }
}
```

> warning **Warning** 除非设置了 `inheritAppConfig` 选项，否则在主 HTTP 应用程序上注册的全局异常筛选器不适用于连接到 [混合应用](/faq/hybrid-application) 的微服务。见 [共享配置](/faq/hybrid-application#sharing-configuration)。

以下示例使用手动实例化的方法范围过滤器。和 HTTP 基于-的应用程序，还可以使用控制器作用域过滤器（即，在控制器类前缀为 `@UseFilters()` 装饰师）。

```typescript
@UseFilters(new ExceptionFilter())
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}
```

#### 遗产

通常，您将根据应用程序的要求创建完全定制的异常筛选器。但是，在某些情况下，您可能希望扩展**核心异常筛选器**并根据某些因素覆盖其行为。

若要将异常处理委托给基本筛选器，请展开 `BaseRpcExceptionFilter` 并调用继承的 `catch()` 方法。

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';

@Catch()
export class AllExceptionsFilter extends BaseRpcExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    return super.catch(exception, host);
  }
}
```

上面的实现只是演示该方法的一个外壳。您实现的扩展异常过滤器将包括您自己的**业务逻辑**（例如，处理各种条件）。
