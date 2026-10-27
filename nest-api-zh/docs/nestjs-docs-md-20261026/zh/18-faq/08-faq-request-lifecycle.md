# Request lifecycle

Source: https://docs.nestjs.com/faq/request-lifecycle

Nest 应用程序按照称为**请求生命周期**的顺序处理请求并生成响应。在使用中间件、管道、防护和拦截器的情况下，跟踪特定代码在请求生命周期中的运行位置可能具有挑战性，尤其是当组合了全局、控制器级和路由级组件时。一般来说，请求流经中间件，然后是防护，然后是拦截器，然后是管道，最后在返回路径上通过拦截器返回（生成响应时）。

#### 中间件

中间件以特定的顺序运行。首先， Nest 运行全局绑定的中间件（例如与 `app.use()`），然后它运行 [模块绑定中间件](/middleware)，由路径匹配。中间件按照绑定的顺序顺序运行，就像中间件一样 Express.对于绑定在不同模块中的中间件，来自全局模块的中间件（用 `@Global()`）首先运行，然后是绑定在根模块中的中间件，然后是来自其他模块的中间件，按照它们在导入图中与根模块的距离排序。

#### 警卫

防护执行从全局防护开始，到控制器防护，到路由防护结束。与中间件一样，防护按照绑定的顺序运行。例如：

```typescript
@UseGuards(Guard1, Guard2)
@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @UseGuards(Guard3)
  @Get()
  getCats(): Cats[] {
    return this.catsService.getCats();
  }
}
```

`Guard1` 将在 `Guard2` 之前执行，两者都将在 `Guard3` 之前执行。

> info **Hint** “全局”、“控制器”和“路由”是指防护（或其他组件）的绑定位置。注册的组件 `app.useGlobalGuards()`（或类似方法），或通过具有 `APP_GUARD` 令牌（或类似的令牌）是全局绑定的。否则，如果装饰器位于控制器类之前，则绑定到控制器；如果装饰器位于路由处理程序之前，则绑定到路由。

#### 拦截器

拦截器大多遵循与后卫相同的模式，只有一个不同：因为拦截器返回 [RxJS Observables](https://github.com/ReactiveX/rxjs)，可观测值以先进后出的方式解决。入站请求经过标准的全局、控制器、路由顺序，但是响应端（即，在路由处理程序返回之后）从路由到控制器再到全局进行解析。此外，管道、控制器或服务引发的任何错误都可以在拦截器中读取 `catchError` 经营者。

#### 管道

管道遵循标准全局、控制器、路由顺序和传递到的管道 `@UsePipes()` 先进先出。但是，在路由参数级别，当几个参数具有管道时，管道首先处理最后一个参数，最后处理第一个参数。这也适用于路由级和控制器级管道。例如，考虑以下控制器：

```typescript
@UsePipes(GeneralValidationPipe)
@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @UsePipes(RouteSpecificPipe)
  @Patch(':id')
  updateCat(
    @Body() body: UpdateCatDTO,
    @Param() params: UpdateCatParams,
    @Query() query: UpdateCatQuery,
  ) {
    return this.catsService.updateCat(body, params, query);
  }
}
```

这里，`GeneralValidationPipe` 为 `query`，然后 `params`，然后 `body` 在移动到 `RouteSpecificPipe`，遵循相同的顺序。任何特定于参数的管道都将在控制器级和路由级管道之后运行（同样，从最后一个参数到第一个参数）。

#### 过滤器

过滤器是唯一不首先解析全局的组件。相反，过滤器从可能的最低级别进行解析：Nest 首先检查路由绑定过滤器，然后检查控制器级过滤器，最后检查全局过滤器。异常不能从过滤器传递到过滤器；如果路由级筛选器捕获异常，则控制器级或全局筛选器无法捕获相同的异常。要达到类似的效果，请在过滤器之间使用继承。

> info **Hint** 过滤器仅在请求处理过程中发生未捕获的异常时才运行。您发现自己的例外（例如，`try/catch`) 不触发异常筛选器。一旦遇到未捕获的异常，生命周期的其余部分将被跳过，请求将直接进入过滤器。从 [中间件](/middleware#error-handling) 也由异常层处理，但只有**全局**异常过滤器适用，因为中间件在选择路由处理程序之前运行。

#### 总结

一般来说，请求生命周期如下所示：

1. 传入请求
2. 中间件
 - 2.1.全局绑定中间件
 - 2.2.模块绑定中间件
3. 警卫
 - 3.1 全球卫士
 - 3.2 控制器防护装置
 - 3.3 路线警卫
4. 拦截器（预控制器）
 - 4.1 全球拦截器
 - 4.2 控制器拦截器
 - 4.3 路由拦截器
5. 管道
 - 5.1 全球管道
 - 5.2 控制器管道
 - 5.3 路由管道
 - 5.4 路径参数管道
6. 控制器（方法处理程序）
7. 服务（如有）
8. 拦截器（请求后）
 - 8.1 路由拦截器
 - 8.2 控制器拦截器
 - 8.3 全球拦截器
9. 异常筛选器
 - 9.1 路径过滤器
 - 9.2 控制器滤波器
 - 9.3 全局过滤器
10. 服务器响应
