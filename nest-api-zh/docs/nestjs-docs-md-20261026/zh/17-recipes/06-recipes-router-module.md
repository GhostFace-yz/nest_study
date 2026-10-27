# Router module

Source: https://docs.nestjs.com/recipes/router-module

> info **Hint** 本章仅与 HTTP-基于的应用程序。

在 HTTP 应用程序（例如，RESTAPI）中，处理程序的路由路径是通过连接为控制器声明的（可选的）前缀（在 `@Controller()` 装饰器内部）和方法的装饰器中指定的任何路径（例如，`@Get('users')`）来确定的。您可以在控制器章节的 [路由](/controllers#routing) 部分了解更多信息。此外，您可以为应用程序中注册的所有路由定义 [全局前缀](/faq/global-prefix)，或者启用 [版本](/http/versioning)。

在某些情况下，在模块级别定义一个前缀很有用，然后该前缀应用于该模块内注册的所有控制器。例如，想象一个 REST 公开应用程序中称为“仪表板”的特定部分使用的几个端点的应用程序。而不是重复 `/dashboard` 在每个控制器中，可以使用 `RouterModule`，如下：

```typescript
@Module({
  imports: [
    DashboardModule,
    RouterModule.register([
      {
        path: 'dashboard',
        module: DashboardModule,
      },
    ]),
  ],
})
export class AppModule {}
```

> info **Hint** 这个 `RouterModule` 类是从 `@nestjs/core` 包装。

您还可以定义层次结构，其中每个模块有 `children` 个模块。子模块继承其父模块的前缀。在以下示例中，`AdminModule` 注册为 `DashboardModule` 和 `MetricsModule` 的父模块：

```typescript
@Module({
  imports: [
    AdminModule,
    DashboardModule,
    MetricsModule,
    RouterModule.register([
      {
        path: 'admin',
        module: AdminModule,
        children: [
          {
            path: 'dashboard',
            module: DashboardModule,
          },
          {
            path: 'metrics',
            module: MetricsModule,
          },
        ],
      },
    ]),
  ],
})
export class AppModule {}
```

> info **Hint** 小心使用此特性，因为过度使用它会使代码难以长期维护。

在上面的示例中，注册在 `DashboardModule` 获得额外的 `/admin/dashboard` 前缀，因为模块从上到下递归地连接路径，从父到子。同样，定义在 `MetricsModule` 获取附加模块级前缀 `/admin/metrics`.
