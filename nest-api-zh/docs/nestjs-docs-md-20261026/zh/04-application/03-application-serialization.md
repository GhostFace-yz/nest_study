# Serialization

Source: https://docs.nestjs.com/application/serialization

序列化发生在网络响应中返回对象之前。这是定义转换和清理发送给客户端的数据的规则的正确位置。例如，必须始终从响应中排除密码等敏感数据，并且某些属性可能需要进一步转换，例如仅返回实体属性的子集。在每个处理程序中手动执行这些转换既繁琐又容易出错，并且很难确保每个情况都被覆盖。

#### 概述

Nest 提供两个内置拦截器，以声明方式应用这些规则：

- `ClassSerializerInterceptor` 使用 [class-transformer](https://github.com/typestack/class-transformer) 包装。它接受路由处理程序返回的值并应用 `instanceToPlain()` 它的功能，这尊重 `class-transformer` 在实体上声明的装饰者或 DTO 班级。本章的第一部分介绍了这种方法。

- `StandardSchemaSerializerInterceptor` 使用在 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/)、[ArkType](https://arktype.io/) 或任何其他 [Standard Schema](https://standardschema.dev/) 兼容库中编写的模式来验证和转换响应。见 [Schema-based serialization](#schema-based-serialization)。

> info **Hint** 拦截器均未序列化 [StreamableFile](/http/file-upload#streaming-files) 答案。

#### 排除属性

假设您想排除 `password` 来自每个响应的用户实体的属性。按如下方式注释实体：

```typescript
import { Exclude } from 'class-transformer';

export class UserEntity {
  id: number;
  firstName: string;
  lastName: string;

  @Exclude()
  password: string;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
```

现在考虑一个带有返回此类实例的路由处理程序的控制器：

```typescript
@UseInterceptors(ClassSerializerInterceptor)
@Get()
findOne(): UserEntity {
  return new UserEntity({
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    password: 'password',
  });
}
```

> warning **Warning** 处理程序必须返回类的一个实例。普通 JavaScript 对象（例如 `{ user: new UserEntity() }`）的序列化不正确。要序列化普通对象，请参见 [Transform plain objects](#transform-plain-objects)。

> info **Hint** `ClassSerializerInterceptor` 是从 `@nestjs/common` 导入的。

当请求此端点时，客户端会收到以下响应：

```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe"
}
```

拦截器也可以在应用程序范围内进行绑定（参见 [Binding interceptors](/interceptors#binding-interceptors)）。拦截器和实体类声明一起确保每个返回 `UserEntity` 的路由处理程序都省略了 `password` 属性，该属性在一个地方强制执行此规则。

#### 暴露属性

使用 `@Expose()`decorator 为属性提供别名，或使用函数（类似于**getter**）计算属性值，如下所示。

```typescript
@Expose()
get fullName(): string {
  return `${this.firstName} ${this.lastName}`;
}
```

#### 改造

使用 `@Transform()` 用于附加数据转换的装饰器。例如，下面的构造返回 `name` 财产 `RoleEntity` 而不是整个物体。

```typescript
@Transform(({ value }) => value.name)
role: RoleEntity;
```

#### 传递选项

要覆盖转换函数的默认行为，请将选项传递给 `@SerializeOptions()` 装修师。

```typescript
@SerializeOptions({
  excludePrefixes: ['_'],
})
@Get()
findOne(): UserEntity {
  return new UserEntity();
}
```

> info **Hint** `@SerializeOptions()` 装饰器是从 `@nestjs/common` 导入的。

传递给的选项 `@SerializeOptions()` 作为基础的第二个参数转发 `instanceToPlain()` 功能。在本例中，所有以 `_` 排除前缀。

#### 变换普通对象

这个 `type` 选择 `@SerializeOptions()` 在序列化响应之前将其转换为指定类的实例，因此类的 `class-transformer` 即使处理程序返回一个普通对象，装饰符也会应用。这样就不需要实例化类或调用 `plainToInstance()` 在每个处理程序中。

在下面的示例中，两个条件分支都返回平面 JavaScript 对象，它们被转换为 `UserEntity` 应用相关装饰剂的实例：

```typescript
@UseInterceptors(ClassSerializerInterceptor)
@SerializeOptions({ type: UserEntity })
@Get()
findOne(@Query() { id }: { id: number }): UserEntity {
  if (id === 1) {
    return {
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      password: 'password',
    };
  }

  return {
    id: 2,
    firstName: 'Kamil',
    lastName: 'Mysliwiec',
    password: 'password2',
  };
}
```

> info **Hint** 声明处理程序的返回类型让 TypeScript 检查返回的普通对象是否与 DTO 或实体。这个 `plainToInstance()` 函数不提供这种类型的检查，因此不匹配的对象可能会被忽视。

> warning **Warning** 响应是由 `type` 类，而不是返回值的类。不是 `type` 类，例如另一个实体的实例，像普通对象一样进行转换：它自己类的装饰器，例如 `@Exclude()`，被忽略，以及 `type` 类不声明是原样复制的。只发送 `type` 类，用 `@Expose()` 并添加 `excludeExtraneousValues: true` 相同的选项 `@SerializeOptions()` 装修师。

#### 基于模式的序列化

这个 `StandardSchemaSerializerInterceptor` 使用模式而不是类装饰符来塑造响应。模式准确地描述了 API：拦截器通过模式运行路由处理程序返回的值，并将模式的输出发送到客户端。它接受任何实现 [Standard Schema](https://standardschema.dev/) 规格。本节中的示例使用 Zod。

因为 `z.object()` 剥离模式没有声明的属性，响应模式也是一个允许列表。以下模式保证用户的 `password` 即使服务返回完整的数据库行，也永远不会发送：

```typescript
import { z } from 'zod';

export const userResponseSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
```

绑定拦截器并使用 `schema` 选择权 `@SerializeOptions()` 装饰师：

```typescript
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { userResponseSchema } from './user-response.schema.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @SerializeOptions({ schema: userResponseSchema })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Get()
  @SerializeOptions({ schema: userResponseSchema })
  findAll() {
    return this.usersService.findAll();
  }
}
```

服务返回用户记录，其中包括 `password` 属性，但客户端只接收声明的属性：

```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe"
}
```

当处理程序返回数组时，如 `findAll()` 是的，拦截器将模式应用于**每个元素**。传递单个项目的模式，而不是数组模式。

`null`,`undefined`、基元值和 `StreamableFile` 响应是原样发送的，没有模式的处理程序的响应也是如此。

#### 使用模式转换响应

模式转换涵盖哪些内容 `@Expose()` 和 `@Transform()` 上课做。下面的架构添加一个计算的 `fullName` 属性并替换嵌套的 `role` 对象及其名称：

```typescript
import { z } from 'zod';

export const userResponseSchema = z
  .object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.object({ id: z.number(), name: z.string() }),
  })
  .transform((user) => ({
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`,
    role: user.role.name,
  }));
```

对于具有 `admin` 角色，客户端收到：

```json
{
  "id": 1,
  "fullName": "John Doe",
  "role": "admin"
}
```

用 Valibot 编写的相同模式使用 `v.pipe()` 和 `v.transform()`：

```typescript
import * as v from 'valibot';

export const userResponseSchema = v.pipe(
  v.object({
    id: v.number(),
    firstName: v.string(),
    lastName: v.string(),
    role: v.object({ id: v.number(), name: v.string() }),
  }),
  v.transform((user) => ({
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`,
    role: user.role.name,
  })),
);
```

#### 绑定模式序列化程序

`@SerializeOptions()` 可以装饰控制器类以及路由处理程序。类上设置的模式应用于其所有处理程序，处理程序上设置的模式优先：

```typescript
@Controller('users')
@UseInterceptors(StandardSchemaSerializerInterceptor)
@SerializeOptions({ schema: userResponseSchema })
export class UsersController {}
```

若要在应用程序范围内绑定拦截器，请将 `Reflector` 实例，拦截器用它来读取 `@SerializeOptions()` 元数据：

```typescript
const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(
  new StandardSchemaSerializerInterceptor(app.get(Reflector)),
);
```

或者，将其注册到 `APP_INTERCEPTOR` 令牌，如中所述 [Binding interceptors](/interceptors#binding-interceptors)，和 Nest 注入 `Reflector` 为了你。没有模式的处理程序不受全局拦截器的影响。

拦截器构造函数还接受默认选项，当处理程序及其控制器都没有设置架构时，这些选项适用：

<table>
  <tr>
    <td><code>schema</code></td>
    <td>The default schema used when <code>@SerializeOptions()</code> doesn't provide one.</td>
  </tr>
  <tr>
    <td><code>validateOptions</code></td>
    <td>Options forwarded to the schema's <code>~standard.validate()</code> method, for libraries that support them. A handler can override them with the <code>validateOptions</code> option of <code>@SerializeOptions()</code>.</td>
  </tr>
</table>

#### 序列化错误

与其模式不匹配的响应，如属性缺失或键入错误的记录，表明服务器上存在错误，而不是请求的问题。在这种情况下，拦截器会抛出一个列出模式问题的错误，客户端会收到一个 `500 Internal Server Error` 响应而不是部分序列化数据。包括问题在内的错误信息由默认异常筛选器记录。

使用 Valibot 的工作示例可用 [在这里](https://github.com/nestjs/nest/tree/master/sample/36-valibot-serializer)。

#### 例子

`ClassSerializerInterceptor` 的工作示例是可用的 [在这里](https://github.com/nestjs/nest/tree/master/sample/21-serializer)。

#### WebSocket 和微服务

本章展示了使用 HTTP 应用（例如，Express 或者 Fastify），两者 `ClassSerializerInterceptor` 和 `StandardSchemaSerializerInterceptor` 无论传输方式如何，WebSockets 和微服务的工作方式都一样。

#### 了解更多

阅读有关可用装饰器和选项的更多信息 [class-transformer](https://github.com/typestack/class-transformer) 仓库。有关模式库，请参见 [Zod](https://zod.dev/),[Valibot](https://valibot.dev/)，和 [ArkType](https://arktype.io/) 文件。
