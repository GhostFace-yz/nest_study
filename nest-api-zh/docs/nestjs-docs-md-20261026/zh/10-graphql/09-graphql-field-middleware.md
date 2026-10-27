# Field middleware

Source: https://docs.nestjs.com/graphql/field-middleware

> warning **Warning** 本章仅适用于代码优先的方法。

字段中间件允许您在字段解析之前或之后运行任意代码。您可以使用字段中间件转换字段的结果、验证字段的参数或检查字段级角色（例如，访问中间件函数运行的字段所需的角色）。

您可以将多个中间件函数连接到一个字段。在这种情况下，它们沿着链顺序调用，每个中间件决定是否调用下一个中间件。函数的顺序 `middleware` 阵列很重要。第一个是最外层，所以它先运行，最后完成（类似于 `graphql-middleware` 包）。第二个是下一层，所以它运行第二个，倒数第二个完成。

#### 入门

让我们首先创建一个简单的中间件，在将字段值发送回客户端之前记录它：

```typescript
import { FieldMiddleware, MiddlewareContext, NextFn } from '@nestjs/graphql';

const loggerMiddleware: FieldMiddleware = async (
  ctx: MiddlewareContext,
  next: NextFn,
) => {
  const value = await next();
  console.log(value);
  return value;
};
```

> info **Hint** `MiddlewareContext` 是一个对象，它由与 GraphQL 解析器功能通常接收（`{ source, args, context, info }`），而 `NextFn` 是执行堆栈（绑定到此字段）或实际字段解析器中的下一个中间件的函数。

> warning **Warning** 现场中间件函数不能注入依赖项或访问 Nest 的 DI 容器。它们被设计成轻量级的，不应该执行潜在的耗时操作（如从数据库中检索数据）。如果需要调用外部服务或查询数据源，请在绑定到根查询或突变处理程序的 guard 或 interceptor 中执行，并将结果分配给 `context` 物体。然后，您可以从字段中间件中访问它（通过 `MiddlewareContext` 对象）。

现场中间件必须与 `FieldMiddleware` 接口。在上面的例子中，我们首先调用 `next()` 函数（执行实际字段解析器并返回字段值），然后将该值记录到终端。从中间件函数返回的值替换字段值（如果中间件返回 `undefined` 的值来自 `next()` 被使用）。因为我们不想改变任何东西，所以我们返回原始值。

完成此操作后，将中间件直接注册到 `@Field()` 装饰师：

```typescript
@ObjectType()
export class Recipe {
  @Field({ middleware: [loggerMiddleware] })
  title: string;
}
```

现在，每当你要求 `title` 的领域 `Recipe` 对象类型，该字段的原始值被记录到控制台。

> info **Hint** 要了解如何使用 [扩展](/graphql/extensions) 功能实现字段级权限系统，请参见 [使用自定义元数据](/graphql/extensions#using-custom-metadata)。

> warning **Warning** 现场中间件只能应用于 `ObjectType` 类。有关更多详细信息，请参见 [this GitHub issue](https://github.com/nestjs/graphql/issues/2446)。

如上所述，您可以从中间件函数中控制字段的值。出于演示目的，让我们将食谱的标题（如果有的话）大写：

```typescript
const value = await next();
return value?.toUpperCase();
```

在这种情况下，每个标题在请求时都会自动大写。

同样，可以将字段中间件绑定到自定义字段解析器（用 `@ResolveField()` 装饰师）：

```typescript
@ResolveField(() => String, { middleware: [loggerMiddleware] })
title() {
  return 'Placeholder';
}
```

> warning **Warning** 如果在现场解析器级别启用了增强器（请参见 [在现场解析器级别执行增强器](/graphql/other-features#execute-enhancers-at-the-field-resolver-level))，字段中间件函数在任何拦截器、守卫等之前运行，**绑定到方法**（但在为查询或突变处理程序注册的根级增强器之后）。

#### 全局现场中间件

除了将中间件直接绑定到特定字段之外，您还可以全局注册一个或多个中间件函数。全局中间件会自动连接到对象类型的所有字段。

```typescript
GraphQLModule.forRoot({
  autoSchemaFile: 'schema.gql',
  buildSchemaOptions: {
    fieldMiddleware: [loggerMiddleware],
  },
}),
```

> info **Hint** 全局注册的字段中间件函数在本地注册的函数（直接绑定到特定字段的函数）之前运行**。
