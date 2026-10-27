# Pipes

Source: https://docs.nestjs.com/pipes

管道是一个类，注释为 `@Injectable()` 实现 `PipeTransform` 接口。

<figure>
  <img class="illustrative-image" src="https://docs.nestjs.com/assets/Pipe_1.png" />
</figure>

管道有两种典型用例：

- **转换**：将输入数据转换为所需形式（例如，从字符串到整数）
- **验证**：评估输入数据，如果有效，则将其不变地通过；否则，抛出异常

在这两种情况下，管道都对由<a href="controllers#route-parameters">控制器路由处理程序</a>处理的参数进行操作。Nest 在调用方法之前立即插入管道；管道接收指定用于方法的参数，并对其进行操作。任何转换或验证都发生在该点，之后用（潜在的）转换的参数调用路由处理程序。

Nest 带有许多内置管道，您可以开箱即用，也可以自己制作。本章介绍了内置管道，并展示了如何将它们绑定到路由处理程序。然后，它通过几个自定义管道来展示如何从头开始构建一个。

> info **Hint** 管道在例外区内运行。管道引发的异常由异常层（全局异常筛选器和任何 [异常筛选器](/exception-filters) 应用于当前上下文）。当管道抛出异常时，不会执行路由处理程序。这使得管道成为在系统边界验证从外部源进入应用程序的数据的推荐位置。

#### 内置管道

Nest 提供以下开箱即用的管道，全部从 `@nestjs/common` 包装：

- `ValidationPipe`
- `StandardSchemaValidationPipe`
- `ParseIntPipe`
- `ParseFloatPipe`
- `ParseBoolPipe`
- `ParseArrayPipe`
- `ParseUUIDPipe`
- `ParseEnumPipe`
- `DefaultValuePipe`
- `ParseFilePipe`
- `ParseDatePipe`

让我们从 `ParseIntPipe` 开始。这是**transformation**用例的一个例子：管道确保将路由处理程序参数转换为 JavaScript 整数，或者在转换失败时抛出异常。在本章的后面，我们将构建 `ParseIntPipe` 的简单自定义实现。以下技术也适用于其他内置转换管道（`ParseBoolPipe`、`ParseFloatPipe`、`ParseEnumPipe`、`ParseArrayPipe`、`ParseDatePipe` 和 `ParseUUIDPipe`），本章统称为 `Parse*` 管道。

#### 捆扎管

若要使用管道，请将管道类的实例绑定到适当的上下文。在 `ParseIntPipe` 例如，我们希望将管道与特定的路由处理程序方法相关联，并确保它在调用该方法之前运行。下面的构造做到了这一点；我们称之为在方法参数级别绑定管道：

```typescript
@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  return this.catsService.findOne(id);
}
```

这保证了两个结果之一：`findOne()` 是一个数字（如 `this.catsService.findOne()`expects），或者在调用路由处理程序之前抛出异常。

例如，假设路由调用如下：

```bash
GET localhost:3000/abc
```

Nest 抛出异常，该异常会产生以下响应：

```json
{
  "statusCode": 400,
  "message": "Validation failed (numeric string is expected)",
  "error": "Bad Request"
}
```

异常会阻止 `findOne()` 方法从执行。

在上面的例子中，我们传递一个类（`ParseIntPipe`），而不是实例。这将实例化留给了框架，并启用了依赖注入。与防护和异常筛选器一样，您可以传递就地实例，当您想要通过传递选项来自定义内置管道的行为时，这非常有用：

```typescript
@Get(':id')
async findOne(
  @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE }))
  id: number,
) {
  return this.catsService.findOne(id);
}
```

其他转换管道（所有**Parse\***管道）的绑定方式相同。它们处理路由参数、查询字符串参数和请求正文值。

例如，使用查询字符串参数：

```typescript
@Get()
async findOne(@Query('id', ParseIntPipe) id: number) {
  return this.catsService.findOne(id);
}
```

以下示例使用 `ParseUUIDPipe` 来验证字符串参数是否为 UUID：

```typescript
@Get(':uuid')
async findOne(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
  return this.catsService.findOne(uuid);
}
```

> info **Hint** 默认情况下，`ParseUUIDPipe` 接受任何版本的 UUID（版本 1 到 8、Nil 和 Max uuid）。要需要特定版本，请传递 `version` 选项（`'1'`、`'2'`、`'3'`、`'4'`、`'5'`、`'6'`、`'7'` 或 `'8'`）。从 NestJSv12.1.2 开始，`version` 选项也接受这些版本作为数字（例如，`7`），`'all'` 接受任何版本，与省略 `version` 相同。`UUIDVersion` 类型描述这些值，并从 `@nestjs/common` 导出。

绑定验证管道的工作方式略有不同；我们将在本章后面讨论它。

> info **Hint** 看 [Validation techniques](/application/validation) 验证管道的大量示例。

#### 定制管道

如前所述，您可以建造自己的管道。虽然 Nest 提供强大的内置 `ParseIntPipe` 和 `ValidationPipe` 实现，让我们从头开始构建每个的简单版本，看看如何构建自定义管道。

我们从一个简单的 `ValidationPipe` 开始。最初，它接受一个输入值并返回不变的值，其行为类似于一个标识函数。

```typescript
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class ValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    return value;
  }
}
```

> info **Hint** `PipeTransform<T, R>` 是每个管道都必须实现的通用接口。`T` 指示输入的类型 `value`，和 `R` 指示 `transform()` 方法。

每个管道都必须实现 `transform()` 实现的方法 `PipeTransform` 接口合同。此方法有两个参数：

- `value`
- `metadata`

这个 `value` 参数是当前正在处理的方法参数（在路由处理程序接收到它之前），并且 `metadata` 是那个参数的元数据。元数据对象具有以下属性：

```typescript
export interface ArgumentMetadata {
  type: 'body' | 'query' | 'param' | 'custom';
  metatype?: Type<unknown>;
  data?: string;
  schema?: StandardSchemaV1;
}
```

这些属性描述正在处理的参数：

<table>
  <tr>
    <td>
      <code>type</code>
    </td>
    <td>Indicates whether the argument is a body
      (<code>@Body()</code>), query
      (<code>@Query()</code>), param
      (<code>@Param()</code>), or custom parameter (see
      <a routerLink="/custom-decorators">custom decorators</a>).</td>
  </tr>
  <tr>
    <td>
      <code>metatype</code>
    </td>
    <td>
      The metatype of the argument, for example,
      <code>String</code>. The value is
      <code>undefined</code> if you omit the type declaration in the route handler signature or use vanilla JavaScript.
    </td>
  </tr>
  <tr>
    <td>
      <code>data</code>
    </td>
    <td>The string passed to the decorator, for example,
      <code>@Body('string')</code>. It's
      <code>undefined</code> if you don't pass a string to the decorator, as in <code>@Body()</code>.</td>
  </tr>
  <tr>
    <td>
      <code>schema</code>
    </td>
    <td>
      A Standard Schema compatible schema attached through parameter decorator options such as <code>@Body({ schema })</code> or <code>@Param('id', { schema })</code>. It's <code>undefined</code> if no schema is attached.
    </td>
  </tr>
</table>

> warning **Warning** TypeScript 界面在转移过程中消失。如果方法参数的类型声明为接口而不是类，则 `metatype` 值为 `Object`。

> info **Hint** 内置的 `StandardSchemaValidationPipe` 使用 `schema` 用于验证任何标准模式兼容库的参数的字段。没有模式的参数保持不变。

#### 基于模式的验证

> info **Hint** 以下部分从头开始构建验证管道，以展示管道的工作原理。对于生产中基于模式的验证，请使用内置的 `StandardSchemaValidationPipe`。它可以与 Zod、Valibot、ArkType 和任何其他 [Standard Schema](https://standardschema.dev/) 兼容的库一起工作，并通过参数装饰器（如 `@Body()` 和 `@Param()`）的 `schema` 选项读取您附加的模式。详见 [Schema-based validation](/application/validation#schema-based-validation)。

让我们让我们的验证管道更有用。考虑 `create()` 方法 `CatsController`：我们希望确保 POST 在运行服务方法之前，body 对象是有效的。

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

`createCatDto` 主体参数的类型为 `CreateCatDto`：

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}
```

对 `create()` 方法的每个请求都必须包含一个有效的正文，因此我们需要验证 `createCatDto` 对象的三个成员。我们可以在路由处理程序中这样做，但那会违反**单一责任原则**（SRP）。

另一种方法是创建一个**验证器类**并将任务委托给它。缺点是我们必须记住在每个方法的开头调用验证器。

验证中间件呢？这可能可行，但是不可能创建可以在整个应用程序的每个上下文中使用的**通用中间件**。中间件不知道**执行上下文**，包括将要调用的处理程序及其参数。

管道正是为这种用例设计的，因此我们将改进我们的验证管道。

#### 对象模式验证

有几种方法可以在 clean 中验证对象，[DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself) 方式。一种常见的方法是**基于模式的**验证，我们在这里使用它。

[Zod](https://zod.dev/) 库允许您使用可读的 API 定义模式。让我们构建一个使用 Zod 模式的验证管道。

首先安装所需的软件包：

```bash
$ npm install --save zod
```

下面的类将一个模式作为构造函数参数并调用 `schema.parse()`，它针对该模式验证传入参数。

如前所述，**验证管道**要么返回值，要么抛出异常。此管道返回模式解析的值，或者抛出 `BadRequestException` 如果验证失败。

下一节演示如何使用 `@UsePipes()` 装修师。这使得验证管道可以跨上下文重用，这就是我们要做的。

```typescript
import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodType } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      const parsedValue = this.schema.parse(value);
      return parsedValue;
    } catch (error) {
      throw new BadRequestException('Validation failed');
    }
  }
}
```

#### 绑定验证管道

前面，我们看到了如何绑定转换管道（如 `ParseIntPipe` 其余的 `Parse*` 管道）。绑定验证管道同样简单。

在这种情况下，我们希望在方法级别绑定管道。使用 `ZodValidationPipe` 在我们的示例中，我们需要：

1. 创建 `ZodValidationPipe`
2. 将特定于上下文的 Zod 模式传递给管道的构造函数
3. 将管道绑定到方法

下面是一个示例 Zod 模式：

```typescript
import { z } from 'zod';

export const createCatSchema = z.object({
  name: z.string(),
  age: z.number(),
  breed: z.string(),
});

export type CreateCatDto = z.infer<typeof createCatSchema>;
```

用 `@UsePipes()` 装饰师：

```typescript
@Post()
@UsePipes(new ZodValidationPipe(createCatSchema))
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

> info **Hint** 这个 `@UsePipes()` 装饰器是从 `@nestjs/common` 包装。

您还可以将 `ZodValidationPipe` 与内置管道一起绑定到特定参数。以下示例使用 `ParseIntPipe` 验证 `id` 路由参数，使用 `ZodValidationPipe` 验证请求主体：

```typescript
@Put('/:id')
async update(
  @Param('id', ParseIntPipe) id: number,
  @Body(new ZodValidationPipe(createCatSchema)) body: CreateCatDto
): Promise<void> {
  this.catsService.update(id, body);
}
```

> warning **Warning** 这个 `zod` 图书馆需要 `strictNullChecks` 要在您的 `tsconfig.json` 文件。

#### 类验证器

> warning **Warning** 本节中的技术要求 TypeScript 如果您的应用程序是用普通语言编写的，则不可用 JavaScript.

本节介绍了我们验证技术的替代实现。

Nest 与 [class-validator](https://github.com/typestack/class-validator) 库，提供基于装饰器的验证。基于装饰器的验证与 Nest 的 **管道** 功能，因为管道可以访问 `metatype` 处理过的参数。在开始之前，请安装所需的软件包：

```bash
$ npm i --save class-validator class-transformer
```

安装完成后，向 `CreateCatDto` 班级。这显示了该技术的一个显著优势：`CreateCatDto` 类仍然是真理的唯一来源 POST 体对象，因此不需要单独的验证类。

```typescript
import { IsString, IsInt } from 'class-validator';

export class CreateCatDto {
  @IsString()
  name: string;

  @IsInt()
  age: number;

  @IsString()
  breed: string;
}
```

> info **Hint** 在 [类验证器文档](https://github.com/typestack/class-validator#usage) 中阅读更多关于类验证器装饰器的信息。

我们现在可以创建一个 `ValidationPipe` 使用这些装饰器的类。

```typescript
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }
    const object = plainToInstance(metatype, value);
    const errors = await validate(object);
    if (errors.length > 0) {
      throw new BadRequestException('Validation failed');
    }
    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
```

> info **Hint** 这个管道是故意的基本。您不必自己构建通用验证管道：Nest 提供更强大的 `ValidationPipe` 开箱即用，将在本节末尾进行描述。

> warning **Notice** 上面的代码使用 [class-transformer](https://github.com/typestack/class-transformer) 库，它与**class-validator**库由同一个作者制作，因此两者可以很好地协同工作。

让我们来看看这段代码。首先，将 `transform()` 方法标记为 `async`。这是可能的，因为 Nest 同时支持同步和**异步**管道。我们制作这个方法 `async` 是因为一些类验证器验证 [可以异步](https://github.com/typestack/class-validator#custom-validation-classes)（它们返回承诺）。

接下来，我们使用解构来提取 `metatype` 字段来自 `ArgumentMetadata` 物体。这是接收完整的速记 `ArgumentMetadata` 然后分配 `metatype` 单独语句中的变量。

辅助方法 `toValidate()` 当正在处理的参数是本机参数时，跳过验证 JavaScript 类型。本机类型不能附加验证装饰器，因此没有理由验证它们。

接下来，我们使用类转换器函数 `plainToInstance()` 改造平原 JavaScript 将参数对象转换为类型化对象，以便我们可以应用验证。这是必要的，因为传入 POST 体，当从网络请求反序列化时，**没有任何类型信息**（这是底层平台，如 Express，作品）。因为类验证器依赖于在 DTO 前面，我们将传入的主体转换为装饰类的实例，而不是验证一个普通对象。

最后，因为这是一个**验证管道**，它要么返回值不变，要么抛出异常。

最后一步是绑定 `ValidationPipe`.管道可以是参数作用域、方法作用域、控制器作用域或全局作用域。前面，我们在方法级别绑定了基于 Zod 的验证管道 `@UsePipes()`.在下面的示例中，我们将管道实例绑定到路由处理程序的 `@Body()` 装饰器，以便管道验证 POST 身体。

```typescript
@Post()
async create(
  @Body(new ValidationPipe()) createCatDto: CreateCatDto,
) {
  this.catsService.create(createCatDto);
}
```

当验证逻辑只涉及一个参数时，参数作用域管道非常有用。

#### 全局范围管道

因为 `ValidationPipe` 它被设计成尽可能通用，作为**全局范围**管道最有用，应用于整个应用程序中的每个路由处理程序。

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

> warning **Notice** 在混合应用中，`useGlobalPipes()` 默认情况下不为已连接的微服务设置管道（请参见 [Hybrid application](/faq/hybrid-application) 改变这种行为）。在标准（非混合）微服务应用中，`useGlobalPipes()` 确实在全球范围内安装管道。

在任何模块外部注册的全局管道（具有 `useGlobalPipes()`（如上面的示例）不能注入依赖项，因为绑定发生在任何模块的上下文之外。要解决此问题，您可以使用以下构造**直接从任何模块**注册全局管道：

```typescript
import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}
```

> info **Hint** 当您使用此方法对管道执行依赖注入时，无论您在哪个模块中注册管道，管道都是全局的。将其注册到定义管道（上面示例中的 `ValidationPipe`）的模块中。`useClass` 不是注册自定义提供者的唯一方式；在 [Custom providers](/fundamentals/custom-providers) 中了解更多信息。

#### 内置验证管道

您不必自己构建通用验证管道：Nest 开箱即用提供 `ValidationPipe`。内置的 `ValidationPipe` 提供了比本章中构建的示例更多的选项，本章中的示例是基本的，以说明自定义管道的力学。对于基于模式的验证，Nest 还提供了内置的 `StandardSchemaValidationPipe`。有关完整细节和许多示例，请参见 [Validation techniques](/application/validation)。

#### 转换用例

验证并不是自定义管道的唯一用例。正如本章开头提到的，管道还可以将输入数据**转换**为所需的格式。这是可能的，因为从 `transform()` 方法替换参数的先前值。

这什么时候有用？有时，从客户端传递的数据需要更改（例如，从字符串转换为整数），路由处理程序才能处理它。某些必填字段也可能缺失，您可能希望应用默认值。**转换管道**通过在客户端请求和路由处理函数之间插入处理函数来执行这些功能。

这里有一个简单的 `ParseIntPipe` 将字符串解析为整数。（如上所述，Nest 具有更复杂的内置 `ParseIntPipe`; 这是一个自定义转换管道的简单示例。）

```typescript
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const val = parseInt(value, 10);
    if (isNaN(val)) {
      throw new BadRequestException('Validation failed');
    }
    return val;
  }
}
```

然后，我们可以将此管道绑定到选定的参数：

```typescript
@Get(':id')
async findOne(@Param('id', new ParseIntPipe()) id) {
  return this.catsService.findOne(id);
}
```

另一个有用的转换是使用 ID 请求中提供：

```typescript
@Get(':id')
findOne(@Param('id', UserByIdPipe) userEntity: UserEntity) {
  return userEntity;
}
```

我们把这个管道的实现留给读者。与所有其他转换管道一样，它接收一个输入值（一个 `id`）并返回输出值（a`UserEntity` 对象）。这使得代码更具声明性 [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself) 通过将样板移出路线处理程序并移入可重复使用的管道中。

#### 提供默认值

默认情况下，`Parse*` 管道期望定义参数的值，并在接收到 `null` 或 `undefined` 时抛出异常（除非您将它们的 `optional` 选项设置为 `true`）。若要让端点处理缺少的查询字符串参数，请提供在 `Parse*` 管道对其进行操作之前应用的默认值。`DefaultValuePipe` 服务于这个目的。在相关的 `Parse*` 管道之前的 `@Query()` 装饰器中实例化一个 `DefaultValuePipe`，如下所示：

```typescript
@Get()
async findAll(
  @Query('activeOnly', new DefaultValuePipe(false), ParseBoolPipe) activeOnly: boolean,
  @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
) {
  return this.catsService.findAll({ activeOnly, page });
}
```
