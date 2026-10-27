# Other features

Source: https://docs.nestjs.com/graphql/other-features

在 GraphQL 世界上，关于处理**身份验证**或操作的**副作用**等问题有很多争论。有些在业务逻辑中处理它们，有些使用更高阶的函数来增强授权逻辑的查询和变异，还有一些使用 [模式指令](https://www.apollographql.com/docs/apollo-server/schema/directives/).没有放之四海而皆准的答案。

Nest 通过其跨平台特性（如 [警卫](/guards) 和 [拦截器](/interceptors)）帮助解决这些问题。目标是减少冗余，并提供工具来帮助您创建结构良好、可读且一致的应用程序。

#### 概述

您可以使用标准 [警卫](/guards),[拦截器](/interceptors),[过滤器](/exception-filters)，和 [管道](/pipes) 和 GraphQL 与任何 RESTful 应用程序的方式相同。您还可以使用 [定制装饰器](/custom-decorators) 特征。考虑以下几点 GraphQL 查询处理程序：

```typescript
@Query('author')
@UseGuards(AuthGuard)
async getAuthor(@Args('id', ParseIntPipe) id: number) {
  return this.authorsService.findOneById(id);
}
```

GraphQL 处理防护装置和管道的方式与 HTTPREST 处理程序相同。这意味着您可以将身份验证逻辑移动到防护，甚至可以跨 REST 和 GraphQLAPI 重用相同的防护类。拦截器在两种类型的应用程序中的工作方式相同：

```typescript
@Mutation()
@UseInterceptors(EventsInterceptor)
async upvotePost(@Args('postId') postId: number) {
  return this.postsService.upvoteById({ id: postId });
}
```

#### 执行情境

自从 GraphQL 在传入的请求中接收不同类型的数据， [执行情境](/fundamentals/execution-context) 警卫和拦截器接收的差异 GraphQL 和 REST. GraphQL 解析器有一组独特的参数： `root`, `args`, `context`，和 `info` 因此，守卫和拦截器必须转换通用 `ExecutionContext` 进入一个 `GqlExecutionContext`:

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = GqlExecutionContext.create(context);
    return true;
  }
}
```

返回的对象 `GqlExecutionContext.create()` 公开每个的**get**方法 GraphQL 解析器参数（例如，`getArgs()`,`getContext()` 等）。一旦您转换了上下文，您就可以选择任何 GraphQL 当前请求的参数。

#### 异常筛选器

标准 Nest[异常筛选器](/exception-filters) 与 GraphQL 应用程序也是如此。和 `ExecutionContext`,GraphQL 应用程序应该改变 `ArgumentsHost` 对象变成 `GqlArgumentsHost` 对象：

```typescript
@Catch(HttpException)
export class HttpExceptionFilter implements GqlExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const gqlHost = GqlArgumentsHost.create(host);
    return exception;
  }
}
```

> info **Hint** 两个 `GqlExceptionFilter` 和 `GqlArgumentsHost` 是从 `@nestjs/graphql` 包装。

不像在 REST 案例，你不使用本机 `response` 对象生成响应。

#### 定制装饰器

如前所述，[定制装饰器](/custom-decorators) 功能按预期工作 GraphQL 解析器：

```typescript
export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) =>
    GqlExecutionContext.create(ctx).getContext().user,
);
```

使用 `@User()` 自定义装饰器如下：

```typescript
@Mutation()
async upvotePost(
  @User() user: UserEntity,
  @Args('postId') postId: number,
) {}
```

> info **Hint** 上面的例子假设 `user` 对象分配给您的上下文 GraphQL 应用。

#### 在现场解析器级别执行增强器

在 GraphQL 语境， Nest 默认情况下，不在字段级别运行**增强器**（拦截器、防护器和过滤器的通用名称）（请参见 [this GitHub issue](https://github.com/nestjs/graphql/issues/320#issuecomment-511193229)）：他们只为顶级而战 `@Query()`/`@Mutation()` 方法。使 Nest 为注释为的方法执行拦截器、保护或筛选器 `@ResolveField()`，设置 `fieldResolverEnhancers` 选项 `GqlModuleOptions`.给它一个列表 `'interceptors'`, `'guards'`，和/或 `'filters'` 酌情：

```typescript
GraphQLModule.forRoot({
  fieldResolverEnhancers: ['interceptors']
}),
```

> warning **Warning** 当您返回许多记录并且现场解析器运行数千次时，为现场解析器启用增强器可能会导致性能问题。因此，当您启用 `fieldResolverEnhancers`，跳过对现场解析器不是绝对必要的增强器。您可以使用以下 helper 函数执行此操作：

```typescript
export function isResolvingGraphQLField(context: ExecutionContext): boolean {
  if (context.getType<GqlContextType>() === 'graphql') {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();
    const parentType = info.parentType.name;
    return parentType !== 'Query' && parentType !== 'Mutation';
  }
  return false;
}
```

#### 创建自定义驱动程序

Nest 提供两个开箱即用的官方驱动程序，`@nestjs/apollo` 和 `@nestjs/mercurius`，以及一个 API 用于构建新的**自定义驱动程序**。使用自定义驱动程序，您可以集成任何 GraphQL 库，或使用附加功能扩展现有集成。

例如，要集成 [`graphql-http`](https://github.com/graphql/graphql-http) 包，您可以创建以下驱动程序类。到那个时候 `start()` 被称为，Nest 已生成模式并将其传递到 `schema` 期权对象的属性：

```typescript
import { AbstractGraphQLDriver, GqlModuleOptions } from '@nestjs/graphql';
import { createHandler } from 'graphql-http/lib/use/express';

class ExpressGraphQLDriver extends AbstractGraphQLDriver {
  async start(options: GqlModuleOptions<any>): Promise<void> {
    const { httpAdapter } = this.httpAdapterHost;
    httpAdapter.use('/graphql', createHandler({ schema: options.schema! }));
  }

  async stop() {}
}
```

然后按如下方式使用：

```typescript
GraphQLModule.forRoot({
  driver: ExpressGraphQLDriver,
});
```
