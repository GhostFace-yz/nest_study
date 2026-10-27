# Custom decorators

Source: https://docs.nestjs.com/custom-decorators

Nest 围绕一个名为**decorators**的语言特性构建。装饰器在许多编程语言中都很成熟，但对 JavaScript 要更深入地了解装饰人员的工作方式，请参见 [本文](https://medium.com/google-developers/exploring-es7-decorators-76ecb65fb841).下面是一个简单的定义：

<blockquote class="external">
  An ES2016 decorator is an expression which returns a function and can take a target, name and property descriptor as arguments.
  You apply it by prefixing the decorator with an <code>@</code> character and placing this at the very top of what
  you are trying to decorate. Decorators can be defined for either a class, a method or a property.
</blockquote>

#### 参数装饰器

Nest 提供一组**参数装饰器**，您可以在 HTTP 路由处理程序。下表列出了它们以及普通的 Express（或 Fastify）它们代表的对象：

<table>
  <tbody>
    <tr>
      <td><code>@Request(), @Req()</code></td>
      <td><code>req</code></td>
    </tr>
    <tr>
      <td><code>@Response(), @Res()</code></td>
      <td><code>res</code></td>
    </tr>
    <tr>
      <td><code>@Next()</code></td>
      <td><code>next</code></td>
    </tr>
    <tr>
      <td><code>@Session()</code></td>
      <td><code>req.session</code></td>
    </tr>
    <tr>
      <td><code>@Param(param?: string)</code></td>
      <td><code>req.params</code> / <code>req.params[param]</code></td>
    </tr>
    <tr>
      <td><code>@Body(param?: string)</code></td>
      <td><code>req.body</code> / <code>req.body[param]</code></td>
    </tr>
    <tr>
      <td><code>@Query(param?: string)</code></td>
      <td><code>req.query</code> / <code>req.query[param]</code></td>
    </tr>
    <tr>
      <td><code>@Headers(param?: string)</code></td>
      <td><code>req.headers</code> / <code>req.headers[param]</code></td>
    </tr>
    <tr>
      <td><code>@Ip()</code></td>
      <td><code>req.ip</code></td>
    </tr>
    <tr>
      <td><code>@HostParam(param?: string)</code></td>
      <td><code>req.hosts</code> / <code>req.hosts[param]</code></td>
    </tr>
  </tbody>
</table>

您也可以创建自己的**自定义装饰器**。要了解为什么这很有用，请考虑中的一个常见模式 Node.js 应用程序：属性附加到**request**对象，然后在每个路由处理程序中手动提取，代码如下：

```typescript
const user = req.user;
```

为了使代码更具可读性和透明性，可以创建一个 `@User()` 装饰器并在所有控制器中重复使用它：

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

然后，您可以在任何需要的地方使用它：

```typescript
@Get()
async findOne(@User() user: UserEntity) {
  console.log(user);
}
```

#### 传递数据

当装饰器的行为取决于某些条件时，请使用 `data` 参数，将参数传递给装饰器的工厂函数。一个用例是自定义装饰器，它通过键从请求对象中提取属性。例如，假设您的 [认证层](/security/authentication#read-the-current-user) 验证请求并将用户实体附加到请求对象。经过验证的请求的用户实体可能如下所示：

```json
{
  "id": 101,
  "firstName": "Alan",
  "lastName": "Turing",
  "email": "alan@email.com",
  "roles": ["admin"]
}
```

让我们定义一个装饰器，它将属性名称作为键，并在存在时返回关联的值（或 `undefined` 如果没有，或者如果 `user` 对象尚未创建）：

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
```

然后，您可以通过 `@User()` 控制器中的装饰器：

```typescript
@Get()
async findOne(@User('firstName') firstName: string) {
  console.log(`Hello ${firstName}`);
}
```

您可以使用带有不同密钥的相同装饰器来访问不同的属性。如果 `user` 对象是深的或复杂的，这使得路由处理程序实现更简单和更具可读性。

> info **Hint** `createParamDecorator<T>()` 是泛型的，因此您可以显式地强制执行类型安全性，例如，`createParamDecorator<string>((data, ctx) => ...)`。或者，在工厂函数中指定参数类型，例如 `createParamDecorator((data: string, ctx) => ...)`。如果省略两者，`data` 将被键入为 `any`。

#### 使用管道

Nest 对待自定义参数装饰器的方式与对待内置参数装饰器（`@Body()`、`@Param()` 和 `@Query()`）相同。这意味着管道也运行用自定义装饰器注释的参数（在我们的示例中，`user` 参数）。也可以将管道直接应用于自定义装饰器：

```typescript
@Get()
async findOne(
  @User(new ValidationPipe({ validateCustomDecorators: true }))
  user: UserEntity,
) {
  console.log(user);
}
```

> info **Hint** 默认情况下，`ValidationPipe` 不验证用自定义装饰器注释的参数。这就是为什么上面的示例将 `validateCustomDecorators` 选项设置为 `true`。

定制装饰师也接受 `schema` 内置参数装饰器的选项。通过 a[Standard Schema](https://standardschema.dev/) 兼容模式，例如 Zod 模式，以及 `StandardSchemaValidationPipe` 与 `validateCustomDecorators` 选项启用可根据其验证装饰器的值：

```typescript
@Get()
async findOne(@User('email', { schema: z.email() }) email: string) {
  console.log(email);
}
```

看 [Validating custom decorators](/application/validation#validating-custom-decorators) 详情。

#### 装饰剂组合物

Nest 提供 `applyDecorators()` 帮助组成多个装饰器。例如，假设要将所有与身份验证相关的装饰器合并为一个装饰器：

```typescript
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(AuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}
```

然后，您可以使用此自定义 `@Auth()` 装饰器如下：

```typescript
@Get('users')
@Auth('admin')
findAllUsers() {}
```

这适用于所有四个装饰者，只需一个声明。

> warning **Warning** 这个 `@ApiHideProperty()` 装饰师 `@nestjs/swagger` 包不可组合，无法与 `applyDecorators()` 功能。
