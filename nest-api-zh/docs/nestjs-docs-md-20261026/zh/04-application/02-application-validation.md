# Validation

Source: https://docs.nestjs.com/application/validation

在对 web 应用程序进行操作之前，验证它接收到的每一条数据。Nest 提供几个自动验证传入请求的管道：

- `ValidationPipe` 验证用 [class-validator](https://github.com/typestack/class-validator) 规则。
- `StandardSchemaValidationPipe` 验证使用 [Zod](https://zod.dev/),[Valibot](https://valibot.dev/),[ArkType](https://arktype.io/)，或任何其他 [Standard Schema](https://standardschema.dev/) 兼容库。
- `ParseIntPipe`,`ParseBoolPipe`,`ParseArrayPipe`，和 `ParseUUIDPipe` 验证和转换单个值。

#### 概述

这个 [Pipes](/pipes) 第 章解释了管道的工作原理，以及如何将管道绑定到参数、路由处理程序、控制器或整个应用程序。本章以此为基础，介绍了两个验证管道的实际使用。

管道在验证规则所在的位置有所不同：

- 和 `ValidationPipe` 规则是**上的装饰品 DTOclass**，class 也是参数的 TypeScript 类型。这种方法与 [映射类型](#mapped-types) 公用事业和 SwaggerCLI 插件。
- 和 `StandardSchemaValidationPipe` 规则是一个**模式对象**，参数的 TypeScript 类型是从模式推断出来的。模式与其库的方法组成，不涉及类或反射元数据。

两个管道可以同时注册。`ValidationPipe` 仅验证用类键入的参数，并且 `StandardSchemaValidationPipe` 仅验证声明架构的参数，因此可以在现有应用程序中增量采用架构。

#### 使用内置的 ValidationPipe

要开始使用它，首先安装所需的依赖项。

```bash
$ npm i --save class-validator class-transformer
```

> info **Hint** 这个 `ValidationPipe` 是从 `@nestjs/common` 包装。

因为这个管道使用 [`class-validator`](https://github.com/typestack/class-validator) 和 [`class-transformer`](https://github.com/typestack/class-transformer) 库，它支持许多选项。将它们在配置对象中传递给管道的构造函数。管道本身的选项是：

```typescript
export interface ValidationPipeOptions extends ValidatorOptions {
  transform?: boolean;
  disableErrorMessages?: boolean;
  exceptionFactory?: (errors: ValidationError[]) => any;
  errorFormat?: 'list' | 'grouped';
}
```

除了这些，所有 `class-validator` 选项（继承自 `ValidatorOptions` 接口）可用：

<table>
  <tr>
    <th>Option</th>
    <th>Type</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>enableDebugMessages</code></td>
    <td><code>boolean</code></td>
    <td>If set to true, validator will print extra warning messages to the console when something is not right.</td>
  </tr>
  <tr>
    <td><code>skipUndefinedProperties</code></td>
    <td><code>boolean</code></td>
    <td>If set to true then validator will skip validation of all properties that are undefined in the validating object.</td>
  </tr>
  <tr>
    <td><code>skipNullProperties</code></td>
    <td><code>boolean</code></td>
    <td>If set to true then validator will skip validation of all properties that are null in the validating object.</td>
  </tr>
  <tr>
    <td><code>skipMissingProperties</code></td>
    <td><code>boolean</code></td>
    <td>If set to true then validator will skip validation of all properties that are null or undefined in the validating object.</td>
  </tr>
  <tr>
    <td><code>whitelist</code></td>
    <td><code>boolean</code></td>
    <td>If set to true, validator will strip validated (returned) object of any properties that do not use any validation decorators.</td>
  </tr>
  <tr>
    <td><code>forbidNonWhitelisted</code></td>
    <td><code>boolean</code></td>
    <td>If set to true, instead of stripping non-whitelisted properties validator will throw an exception.</td>
  </tr>
  <tr>
    <td><code>forbidUnknownValues</code></td>
    <td><code>boolean</code></td>
    <td>If set to true, attempts to validate unknown objects fail immediately.</td>
  </tr>
  <tr>
    <td><code>disableErrorMessages</code></td>
    <td><code>boolean</code></td>
    <td>If set to true, validation errors will not be returned to the client.</td>
  </tr>
  <tr>
    <td><code>errorHttpStatusCode</code></td>
    <td><code>number</code></td>
    <td>This setting allows you to specify which exception type will be used in case of an error. By default it throws <code>BadRequestException</code>.</td>
  </tr>
  <tr>
    <td><code>exceptionFactory</code></td>
    <td><code>Function</code></td>
    <td>Takes an array of the validation errors and returns an exception object to be thrown.</td>
  </tr>
  <tr>
    <td><code>groups</code></td>
    <td><code>string[]</code></td>
    <td>Groups to be used during validation of the object.</td>
  </tr>
  <tr>
    <td><code>always</code></td>
    <td><code>boolean</code></td>
    <td>Set default for <code>always</code> option of decorators. Default can be overridden in decorator options.</td>
  </tr>

  <tr>
    <td><code>strictGroups</code></td>
    <td><code>boolean</code></td>
    <td>If <code>groups</code> is not given or is empty, ignore decorators with at least one group.</td>
  </tr>
  <tr>
    <td><code>dismissDefaultMessages</code></td>
    <td><code>boolean</code></td>
    <td>If set to true, the validation will not use default messages. Error message always will be <code>undefined</code>        if
      its not explicitly set.</td>
  </tr>
  <tr>
    <td><code>validationError.target</code></td>
    <td><code>boolean</code></td>
    <td>Indicates if target should be exposed in <code>ValidationError</code>.</td>
  </tr>
  <tr>
    <td><code>validationError.value</code></td>
    <td><code>boolean</code></td>
    <td>Indicates if validated value should be exposed in <code>ValidationError</code>.</td>
  </tr>
  <tr>
    <td><code>stopAtFirstError</code></td>
    <td><code>boolean</code></td>
    <td>When set to true, validation of the given property will stop after encountering the first error. Defaults to false.</td>
  </tr>
  <tr>
    <td><code>errorFormat</code></td>
    <td><code>'list' | 'grouped'</code></td>
    <td>Specifies the format of validation error messages. <code>'list'</code> (default) returns an array of error message strings. <code>'grouped'</code> returns an object with property paths as keys and arrays of unmodified error messages as values, preserving custom validation messages without prepending parent path prefixes.</td>
  </tr>
</table>

> info **Notice** 在 [仓库](https://github.com/typestack/class-validator) 中查找有关 `class-validator` 包的更多信息。

#### 自动验证

从绑定开始 `ValidationPipe` 在应用程序级别，从而保护每个端点不接收到无效数据。

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

要测试管道，请创建一个基本端点：

```typescript
@Post()
create(@Body() createUserDto: CreateUserDto) {
  return 'This action adds a new user';
}
```

> info **Hint** TypeScript 不为**泛型或接口**发出元数据，因此 `ValidationPipe` 无法验证用它们声明的 DTO。为您的 DTO 使用具体的类。

> info **Hint** 不要使用仅类型导入导入 DTO，因为仅类型导入会在运行时被删除。写 `import { CreateUserDto }` 而不是 `import type { CreateUserDto }`。

接下来，使用 `class-validator` 包提供的装饰器将验证规则添加到 `CreateUserDto` 中（参见 [完整列表](https://github.com/typestack/class-validator#validation-decorators)）。然后，每条使用 `CreateUserDto` 的路由都会强制执行这些规则。

```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;
}
```

在这些规则到位后，正文包含无效 `email` 属性收到 `400 Bad Request` 使用下列主体进行响应：

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["email must be an email"]
}
```

`ValidationPipe` 也验证请求的其他部分。例如，要只接受数值 `:id` 路径参数，使用以下构造：

```typescript
@Get(':id')
findOne(@Param() params: FindOneParams) {
  return 'This action returns a user';
}
```

与 DTO 一样，`FindOneParams` 是一个用 `class-validator` 定义验证规则的类：

```typescript
import { IsNumberString } from 'class-validator';

export class FindOneParams {
  @IsNumberString()
  id: string;
}
```

#### 禁用详细错误

错误消息解释了请求的错误，但某些生产环境不希望暴露它们。若要禁用详细错误，请将 options 对象传递给 `ValidationPipe`：

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    disableErrorMessages: true,
  }),
);
```

因此，响应正文不再包含详细的错误消息。

#### 剥离性能

`ValidationPipe` 还可以过滤掉路由处理程序不应接收的属性。当您将可接受的属性**白名单**时，任何未包含在白名单中的属性都会从生成的对象中剥离。例如，如果处理程序期望 `email` 和 `password`，但请求还包括 `age` 属性，则从结果 DTO 中删除 `age`。要启用此行为，请将 `whitelist` 设置为 `true`。

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
  }),
);
```

启用此选项后，验证类中没有任何装饰器的属性将被删除。

或者，您可以拒绝包含非白名单属性的请求，并给出错误响应。为此，除了 `whitelist` 之外，还将 `forbidNonWhitelisted` 设置为 `true`。

#### 转换有效载荷对象

有效载荷作为普通 JavaScript 对象通过网络到达。`ValidationPipe` 可以将它们转换为其 DTO 类的实例。要启用自动转换，请将 `transform` 设置为 `true`。您可以在方法级别执行此操作：

```typescript
@Post()
@UsePipes(new ValidationPipe({ transform: true }))
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

要在全局范围内启用此行为，请在全局管道上设置选项：

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
  }),
);
```

启用自动转换后，`ValidationPipe` 还转换基本类型。在下面的示例中，`findOne()` 方法采用 `id` 路径参数作为参数：

```typescript
@Get(':id')
findOne(@Param('id') id: number) {
  console.log(typeof id === 'number'); // true
  return 'This action returns a user';
}
```

路径参数和查询参数总是以字符串的形式到达。因为方法签名声明 `id` 作为一个 `number`,`ValidationPipe` 将字符串标识符转换为数字。

#### 显式转换

上一节展示了如何 `ValidationPipe` 根据声明的类型隐式转换查询和路径参数。该转换需要启用自动转换。

禁用自动转换后，可以使用 `ParseIntPipe` 或 `ParseBoolPipe` 显式转换值。没有 `ParseStringPipe`，因为路径和查询参数已经是字符串了。

```typescript
@Get(':id')
findOne(
  @Param('id', ParseIntPipe) id: number,
  @Query('sort', ParseBoolPipe) sort: boolean,
) {
  console.log(typeof id === 'number'); // true
  console.log(typeof sort === 'boolean'); // true
  return 'This action returns a user';
}
```

> info **Hint** 这个 `ParseIntPipe` 和 `ParseBoolPipe` 是从 `@nestjs/common` 包装。

#### 映射类型

特点如**CRUD**（创建/读取/更新/删除）通常需要几个基本类型的变体。Nest 提供执行这些类型转换的实用程序函数。

> warning **Warning** 如果您的应用程序使用 `@nestjs/swagger` 包，见 [本章](/openapi/mapped-types) 有关映射类型的更多信息。同样，如果您使用 `@nestjs/graphql` 包，见 [本章](/graphql/mapped-types).这两个包都严重依赖于类型元数据，因此它们导出这些实用程序的各自版本。从 `@nestjs/mapped-types` 而不是 `@nestjs/swagger` 或者 `@nestjs/graphql` 会引起未记录的副作用。

输入验证类型（DTO）通常出现在同一类型的**create**和**update**变体中：**create**变体需要所有字段，而**update**变体使它们成为可选的。映射类型实用程序导出此类变体，而无需重复属性声明或其验证装饰符。考虑以下**创建**类型：

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}
```

> info **Hint** `PartialType()`,`PickType()`,`OmitType()`，和 `IntersectionType()` 是从 `@nestjs/mapped-types` 包装。

这个 `PartialType()` 函数返回一个类型（类），输入类型的所有属性都设置为可选：

```typescript
export class UpdateCatDto extends PartialType(CreateCatDto) {}
```

这个 `PickType()` 函数从输入类型的属性子集构造类型：

```typescript
export class UpdateCatAgeDto extends PickType(CreateCatDto, ['age'] as const) {}
```

这个 `OmitType()` 函数用输入类型的每个属性构造一个类型，**除了**列出的属性。第二个参数是属性名数组：

```typescript
export class UpdateCatDto extends OmitType(CreateCatDto, ['name'] as const) {}
```

这个 `IntersectionType()` 函数将两种类型的属性组合成一个新类型（类）。例如，给定附加类型：

```typescript
export class AdditionalCatInfo {
  color: string;
}
```

以下类型包含两者的属性：

```typescript
export class UpdateCatDto extends IntersectionType(
  CreateCatDto,
  AdditionalCatInfo,
) {}
```

类型映射实用程序函数是可组合的。例如，以下类型具有 `CreateCatDto` 除了 `name`，全部设置为可选：

```typescript
export class UpdateCatDto extends PartialType(
  OmitType(CreateCatDto, ['name'] as const),
) {}
```

#### 解析和验证数组

TypeScript 不发出泛型类型（如数组）的元数据，因此 `ValidationPipe` 无法验证数组参数的元素。在下面的代码中，`createUserDtos` 未经验证：

```typescript
@Post()
createBulk(@Body() createUserDtos: CreateUserDto[]) {
  return 'This action adds new users';
}
```

若要验证数组，请使用包装数组的属性创建专用类，或使用 `ParseArrayPipe`：

```typescript
@Post()
createBulk(
  @Body(new ParseArrayPipe({ items: CreateUserDto }))
  createUserDtos: CreateUserDto[],
) {
  return 'This action adds new users';
}
```

`ParseArrayPipe` 对于解析查询参数也很有用。考虑 `findByIds()` 根据查询字符串中传递的标识符返回用户的方法：

```typescript
@Get()
findByIds(
  @Query('ids', new ParseArrayPipe({ items: Number, separator: ',' }))
  ids: number[],
) {
  return 'This action returns users by ids';
}
```

此构造解析并验证请求的查询参数，例如：

```bash
GET /?ids=1,2,3
```

#### 基于模式的验证

这个 `StandardSchemaValidationPipe` 根据模式而不是修饰类验证值。它接受任何实现 [Standard Schema](https://standardschema.dev/) 规范，其中包括 [Zod](https://zod.dev/), [Valibot](https://valibot.dev/)，和 [ArkType](https://arktype.io/).模式是有效负载的唯一真实来源：它在运行时验证值，其推断类型是处理程序参数的 TypeScript 类型。本节中的示例使用 Zod。

```bash
$ npm i --save zod
```

定义模式并推断 DTO 从中键入：

```typescript
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  displayName: z.string().max(50).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
```

接下来，在应用程序级别绑定管道：

```typescript
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

然后将架构附加到参数 `schema` 参数装饰器的选项：

```typescript
@Post()
create(@Body({ schema: createUserSchema }) createUserDto: CreateUserDto) {
  return this.usersService.create(createUserDto);
}
```

管道只验证声明模式的参数，并将所有其他值传递给 unchanged，因此全局绑定它是安全的。如果请求主体与模式不匹配，应用程序将用 `400 Bad Request` 响应。每条消息都以无效属性的路径作为前缀：

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "email: Invalid email address",
    "password: Too small: expected string to have >=8 characters"
  ]
}
```

`schema` 选项受 `@Body()`、`@Query()` 和 `@Param()` 以及 [网关](/websockets/gateways) 中的 `@MessageBody()` 和 [微服务](/microservices/basics) 中的 `@Payload()` 支持。将其作为验证整个对象的唯一参数传递，或在属性名之后传递以验证单个值：

```typescript
@Post('invitations')
invite(@Body('email', { schema: z.email() }) email: string) {
  return this.usersService.invite(email);
}
```

#### 强制与转化

路径参数和查询参数总是以字符串的形式到达。强制模式，例如 `z.coerce.number()`，在验证之前转换它们：

```typescript
@Get(':id')
findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {
  return this.usersService.findOne(id);
}
```

模式还可以应用默认值和转换。以下架构描述了分页列表的查询字符串：

```typescript
import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
```

```typescript
@Get()
findAll(@Query({ schema: listUsersQuerySchema }) query: ListUsersQuery) {
  return this.usersService.findAll(query);
}
```

对于请求 `GET /users?page=2&search=%20kamil%20`，处理程序接收 `page` 作为数字 `2`，`limit` 作为默认 `20`，`search` 作为修剪字符串 `'kamil'`。

默认情况下，管道将模式的**输出**传递给处理程序，因此强制、默认和转换都会生效。若要验证值，但将原始输入传递不变，请设置 `transform` 二 `false`.在这种情况下，使用模式的输入类型键入参数（`z.input<typeof schema>` 在佐德）。

#### 未知属性

模式如何处理它没有声明的属性由模式本身决定，而不是由管道决定。在佐德：

- `z.object()` 剥离未知属性，例如 `ValidationPipe` 的 `whitelist` 选项。
- `z.strictObject()` 拒绝它们，就像 `forbidNonWhitelisted` 选项一样。错误信息是 `Unrecognized key: "age"`。
- `z.looseObject()` 留着它们。

#### 推导模式

这个 [映射类型](#mapped-types) 公用事业公司衍生新事物 DTO 现有类的类。对于模式，库自己的方法也起到了同样的作用：

```typescript
import { z } from 'zod';
import { createUserSchema } from './create-user.dto.js';

// All properties optional, like PartialType()
export const updateUserSchema = createUserSchema.partial();

// Only the listed properties, like PickType()
export const changeEmailSchema = createUserSchema.pick({ email: true });

// Every property except the listed ones, like OmitType()
export const publicProfileSchema = createUserSchema.omit({ password: true });

// Additional properties, like IntersectionType()
export const createAdminSchema = createUserSchema.extend({
  role: z.enum(['admin', 'editor']),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
```

数组也不需要特殊处理。将项架构包装在 `z.array()`，每个元素都经过验证：

```typescript
@Post('bulk')
createBulk(
  @Body({ schema: z.array(createUserSchema) }) createUserDtos: CreateUserDto[],
) {
  return this.usersService.createMany(createUserDtos);
}
```

无效元素的消息以其索引为前缀，例如 `1.email: Invalid email address`。

#### 验证自定义装饰器

使用 [`createParamDecorator()`](/custom-decorators) 接受 `schema` 也是选项。例如，以下装饰器从请求头中提取租户标识符：

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().headers['x-tenant-id'],
);
```

```typescript
@Get()
findAll(@TenantId({ schema: z.uuid() }) tenantId: string) {
  return this.projectsService.findAll(tenantId);
}
```

管道跳过自定义装饰器，除非启用 `validateCustomDecorators` 选项：

```typescript
app.useGlobalPipes(
  new StandardSchemaValidationPipe({
    validateCustomDecorators: true,
  }),
);
```

#### 架构验证选项

这个 `StandardSchemaValidationPipe` 构造函数接受以下选项：

<table>
  <tr>
    <th>Option</th>
    <th>Type</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>transform</code></td>
    <td><code>boolean</code></td>
    <td>If <code>true</code>, the handler receives the value produced by the schema. If <code>false</code>, it receives the original input after successful validation. Default: <code>true</code>.</td>
  </tr>
  <tr>
    <td><code>validateCustomDecorators</code></td>
    <td><code>boolean</code></td>
    <td>If <code>true</code>, parameters of custom decorators created with <code>createParamDecorator()</code> are validated as well. Default: <code>false</code>.</td>
  </tr>
  <tr>
    <td><code>validateOptions</code></td>
    <td><code>Record&lt;string, unknown&gt;</code></td>
    <td>Options forwarded to the schema's <code>~standard.validate()</code> method, for libraries that support them.</td>
  </tr>
  <tr>
    <td><code>errorHttpStatusCode</code></td>
    <td><code>number</code></td>
    <td>The HTTP status code of the exception thrown when validation fails. Default: <code>400</code>.</td>
  </tr>
  <tr>
    <td><code>exceptionFactory</code></td>
    <td><code>Function</code></td>
    <td>Receives the array of validation issues and returns the exception to throw.</td>
  </tr>
</table>

使用 `exceptionFactory` 更改错误响应的形状。每期都有一个 `message` 并且，对于嵌套值，a`path` 其段是属性键或对象 `key` 属性：

```typescript
app.useGlobalPipes(
  new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new UnprocessableEntityException({
        message: 'Validation failed',
        errors: issues.map((issue) => ({
          path: issue.path
            ?.map((segment) => (typeof segment === 'object' ? segment.key : segment))
            .join('.'),
          message: issue.message,
        })),
      }),
  }),
);
```

使用此工厂，无效请求将生成 `422 Unprocessable Entity` 回应：

```json
{
  "message": "Validation failed",
  "errors": [
    { "path": "email", "message": "Invalid email address" },
    { "path": "password", "message": "Too small: expected string to have >=8 characters" }
  ]
}
```

#### 其他模式库

管道里没有任何东西是佐德特有的。相同 `schema` 选项接受 Valibot 架构：

```typescript
import * as v from 'valibot';

export const createUserSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
});

export type CreateUserDto = v.InferOutput<typeof createUserSchema>;
```

或原型模式：

```typescript
import { type } from 'arktype';

export const createUserSchema = type({
  email: 'string.email',
  password: 'string >= 8',
});

export type CreateUserDto = typeof createUserSchema.infer;
```

错误消息来自库，因此它们的措辞因库而异。

> info **Hint** 相同的模式可以描述您的 API 在 OpenAPI 文档中。看 [Standard Schema (Zod, Valibot)](/openapi/introduction#standard-schema-zod-valibot) 在 OpenAPI 章节。

有一个工作示例可用 [在这里](https://github.com/nestjs/nest/tree/master/sample/35-zod-validation)。

#### WebSocket 和微服务

本章展示了使用 HTTP 应用（例如，Express 或者 Fastify），两者 `ValidationPipe` 和 `StandardSchemaValidationPipe` 无论传输方式如何，WebSockets 和微服务的工作方式都一样。默认情况下，两者都抛出一个 HTTP 验证失败时的异常。要以传输可以理解的方式报告错误，请返回 `WsException` 或者一个 `RpcException` 从 `exceptionFactory` 选项：

```typescript
new StandardSchemaValidationPipe({
  exceptionFactory: (issues) =>
    new WsException(issues.map((issue) => issue.message)),
});
```

#### 了解更多

在 [class-validator](https://github.com/typestack/class-validator) 存储库中阅读有关自定义验证器、错误消息和可用装饰器的更多信息。有关模式库，请参见 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/) 和 [ArkType](https://arktype.io/) 文档，以及 [Standard Schema compatible libraries](https://standardschema.dev/schema#what-schema-libraries-implement-the-spec) 列表。
