# Guards

Source: https://docs.nestjs.com/guards

守卫是一个类，注释为 `@Injectable()` 实现 `CanActivate` 接口。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Guards_1.png" /></figure>

守卫有一个**单一的职责**：他们根据运行时存在的条件（如权限、角色或 ACL）来确定给定的请求是否将由路由处理程序处理。这通常被称为**授权**。在传统 Express 应用程序、授权（以及它通常与之协作的近亲**身份验证**）通常由 [中间件](/middleware).中间件非常适合进行身份验证，因为诸如验证令牌和将属性附加到 `request` 对象不绑定到特定的路由上下文（及其元数据）。

然而，中间件本质上是上下文盲的：它不知道在调用 `next()` 后将执行哪个处理程序。另一方面，**守卫**可以访问 `ExecutionContext` 实例，因此他们确切地知道接下来要执行什么。像异常过滤器、管道和拦截器一样，防护允许您在请求/响应周期的正确位置插入处理逻辑，并且可以声明地这样做。这有助于保留您的代码 DRY。

> info **Hint** 防护在所有中间件之后执行，但在任何拦截器或管道之前执行。

#### 授权卫士

如前所述，**授权**是守卫的常见用例，因为只有当调用者（通常是特定的经过身份验证的用户）具有足够的权限时，特定的路由才应该可用。这个 `AuthGuard` 我们现在将构建假设一个经过身份验证的用户，因此将一个令牌附加到请求头。它提取并验证令牌，并使用提取的信息来确定请求是否可以继续。

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    return validateRequest(request);
  }
}
```

> info **Hint** 有关身份验证机制的实际示例，请参见 [认证](/security/authentication) 篇章。有关更复杂的授权示例，请参见 [授权](/security/authorization) 篇章。

内部的逻辑 `validateRequest()` 功能可以根据需要简单或复杂。这个例子的目的是展示防护如何适应请求/响应周期。

每个守卫都必须实现一个 `canActivate()` 方法。它返回一个布尔值，指示当前请求是同步还是异步（通过 `Promise` 或 `Observable`）被允许。Nest 使用返回值决定下一步发生什么：

- 如果它返回 `true`，请求被处理。
- 如果它返回 `false`,Nest 拒绝请求。

#### 执行情境

这个 `canActivate()` 方法接受单个参数，`ExecutionContext` 实例。`ExecutionContext` 扩展 `ArgumentsHost` 我们在异常过滤器一章中介绍了这一点。上面的示例使用了在 `ArgumentsHost` 获取对 `Request` 物体。请参阅 **参数主机** 部分 [异常筛选器](/exception-filters#arguments-host) 关于这个主题的更多信息，请参见章节。

通过扩展 `ArgumentsHost`，`ExecutionContext` 添加了几个帮助方法，这些方法提供了有关当前执行过程的其他详细信息。这些细节有助于您构建更多通用的防护，这些防护可以跨广泛的控制器、方法和执行上下文工作。请参阅 [执行情境](/fundamentals/execution-context) 章节，了解有关 `ExecutionContext` 的更多信息。

#### 基于角色的认证

让我们构建一个功能更强大的防护，只允许具有特定角色的用户访问。我们将从一个基本的 guard 模板开始，并在下面的章节中对其进行构建。目前，它允许所有请求继续进行：

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return true;
  }
}
```

#### 绑定防护装置

与管道和异常筛选器一样，防护可以是控制器作用域、方法作用域或全局作用域。下面，我们使用 `@UseGuards()` 装修师。装饰器接受单个守卫或逗号分隔的守卫列表，因此您可以通过一个声明应用一整套守卫。

```typescript
@Controller('cats')
@UseGuards(RolesGuard)
export class CatsController {}
```

> info **Hint** 这个 `@UseGuards()` 装饰器是从 `@nestjs/common` 包装。

上面，我们通过了 `RolesGuard` 类（而不是实例），将实例化的责任留给框架并启用依赖注入。与管道和异常筛选器一样，您也可以传递一个就地实例：

```typescript
@Controller('cats')
@UseGuards(new RolesGuard())
export class CatsController {}
```

上面的构造将守卫附加到这个控制器声明的每个处理程序。若要仅将防护应用于单个方法，请使用 `@UseGuards()`**方法级别**的装饰师。

若要设置全局防护，请使用 `useGlobalGuards()` 方法 Nest 应用实例：

```typescript
const app = await NestFactory.create(AppModule);
app.useGlobalGuards(new RolesGuard());
```

> warning **Notice** 在混合应用中，`useGlobalGuards()` 默认情况下不为已连接的微服务设置保护（请参见 [Hybrid application](/faq/hybrid-application) 改变这种行为）。在标准（非混合）微服务应用中，`useGlobalGuards()` 确实在全球范围内设立了警卫。

全局保护应用于应用程序中的每个控制器和每个路由处理程序。但是，在任何模块之外注册的全局卫士（具有 `useGlobalGuards()`（如上面的示例）不能注入依赖项，因为注册发生在任何模块的上下文之外。要解决此问题，请使用以下结构直接从任何模块注册 guard：

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
```

> info **Hint** 当您使用此方法对防护执行依赖注入时，无论您在哪个模块中注册防护，防护都是全局的。我们建议将其注册到防卫（`RolesGuard` 在上面的示例中）被定义。所以，`useClass` 不是注册自定义提供者的唯一方法。看 [Custom providers](/fundamentals/custom-providers) 了解更多。

> info **Hint** 您可以注册 `APP_GUARD` 令牌多次（在相同或不同的模块中）；每个注册警卫按照注册顺序为每个请求奔跑。`APP_GUARD`（像另一个 `APP_*`tokens）是框架在引导期间消耗的伪提供程序：以后无法使用 `app.get()` 或者注射到别处。

#### 设置每个处理程序的角色

我们的 `RolesGuard` 可以工作，但它还不是很聪明：它没有利用最重要的防护功能 [执行情境](/fundamentals/execution-context)。它不知道角色，也不知道每个处理程序允许哪些角色。例如，`CatsController` 可以对不同的路由有不同的许可方案。有些路由可能只对管理员用户开放，而其他路由对所有人开放。如何以灵活且可重用的方式将角色与路由匹配？

这就是**自定义元数据**发挥作用的地方（参见 [Reflection and metadata](/fundamentals/execution-context#reflection-and-metadata)）。Nest 允许您通过使用静态 `Reflector.createDecorator()` 方法创建的装饰器或内置的 `@SetMetadata()` 装饰器将自定义**元数据**附加到路由处理程序。

例如，让我们创建一个 `@Roles()` 装饰用 `Reflector.createDecorator()` 将元数据附加到处理程序的方法。`Reflector` 由开箱即用的框架提供，并从 `@nestjs/core` 包装。

```ts
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();
```

`Roles` 装饰器是一个接受 `string[]` 类型的单个参数的函数。

若要使用此装饰器，请使用它注释处理程序：

```typescript
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

这里我们附上了 `Roles` 装饰器元数据到 `create()` 方法，指示只有具有 `admin` 应允许角色访问此路由。

或者，代替使用 `Reflector.createDecorator()` 方法，可以使用内置的 `@SetMetadata()` 装修师。参见 [低层次方法](/fundamentals/execution-context#low-level-approach) 了解更多。

#### 把这一切放在一起

现在让我们把这个和我们的 `RolesGuard`.当前，它返回 `true` 在所有情况下，允许每个请求继续进行。我们希望使返回值有条件，基于将**分配给当前用户的角色**与正在处理的路由所需的角色进行比较。要访问路由的角色（自定义元数据），我们使用 `Reflector` 再次上课，如下：

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get(Roles, context.getHandler());
    if (!roles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    return matchRoles(roles, user.roles);
  }
}
```

> info **Hint** 在 Node.js 应用程序，通常的做法是将授权用户附加到 `request` 物体。因此，上面的样本假设 `request.user` 包含用户实例及其角色。在您的应用程序中，您可能会在自定义**身份验证卫士**（或中间件）中进行关联。参见 [认证](/security/authentication) 有关此主题的更多信息，请参见章节。

> warning **Warning** `matchRoles()` 不提供 Nest 函数。它的逻辑可以根据您的应用程序的需要简单或复杂；这个例子的目的是展示防护如何适应请求/响应周期。

参见 [Reflection and metadata](/fundamentals/execution-context#reflection-and-metadata) 有关使用的更多详细信息，请参阅**执行上下文**章节 `Reflector` 以上下文敏感的方式。

当权限不足的用户请求端点时，Nest 自动返回以下响应：

```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

在幕后，当一个守卫返回 `false` 时，框架抛出一个 `ForbiddenException`。要返回不同的错误响应，请抛出您自己的异常。例如：

```typescript
throw new UnauthorizedException();
```

警卫引发的任何异常都由 [异常层](/exception-filters)（全局异常筛选器和应用于当前上下文的任何异常筛选器）。

> info **Hint** 有关如何实现授权的实际示例，请参见 [授权](/security/authorization) 篇章。
