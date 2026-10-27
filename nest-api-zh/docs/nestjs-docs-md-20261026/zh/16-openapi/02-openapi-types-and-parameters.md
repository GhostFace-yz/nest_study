# Types and Parameters

Source: https://docs.nestjs.com/openapi/types-and-parameters

这个 `SwaggerModule` 搜索全部 `@Body()`,`@Query()`,`@Param()`，和 `@Headers()` 路由处理程序中的装饰器生成 API 文档。它还使用反射来创建相应的模型定义。考虑以下代码：

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

> info **Hint** 若要显式设置主体定义，请使用 `@ApiBody()` 装饰器（从 `@nestjs/swagger` 包）。

基于 `CreateCatDto`,SwaggerUI 显示以下模型定义：

<figure><img src="https://docs.nestjs.com/assets/swagger-dto.png" /></figure>

定义为空，尽管类声明了一些属性。使类属性对 `SwaggerModule`，或者用 `@ApiProperty()` 装饰器或使用 [CLI 插件](/openapi/cli-plugin)，它会自动执行此操作：

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}
```

> info **Hint** 不要手动注释每个属性，而是考虑使用 [Swagger plugin](/openapi/cli-plugin)，为您添加这些注释。

打开浏览器并验证生成的 `CreateCatDto` 型号：

<figure><img src="https://docs.nestjs.com/assets/swagger-dto2.png" /></figure>

这个 `@ApiProperty()`decorator 还允许您设置各种 [Schema Object](https://swagger.io/specification/#schemaObject) 属性：

```typescript
@ApiProperty({
  description: 'The age of a cat',
  minimum: 1,
  default: 1,
})
age: number;
```

> info **Hint** 而不是显式键入 `{{"@ApiProperty({ required: false })"}}`，您可以使用 `@ApiPropertyOptional()` 速记装饰器。

若要显式设置属性的类型，请使用 `type` 关键：

```typescript
@ApiProperty({
  type: Number,
})
age: number;
```

#### 阵列

当属性是数组时，必须手动指示数组类型，如下所示：

```typescript
@ApiProperty({ type: [String] })
names: string[];
```

> info **Hint** 考虑使用 [Swagger plugin](/openapi/cli-plugin)，自动检测数组。

要么将类型作为数组的第一个元素传递（如上所示），要么将 `isArray` 属性设置为 `true`。

#### 循环依赖关系

当类之间存在循环依赖关系时，请使用懒惰函数来提供 `SwaggerModule` 使用类型信息：

```typescript
@ApiProperty({ type: () => Node })
node: Node;
```

> info **Hint** 考虑使用 [Swagger plugin](/openapi/cli-plugin)，它自动检测循环依赖关系。

#### 泛型和接口

TypeScript 不存储关于泛型或接口的元数据，因此当您在 DTOs 中使用它们时，`SwaggerModule` 可能无法在运行时正确生成模型定义。例如，Swagger 模块无法正确检查以下代码：

```typescript
createBulk(@Body() usersDto: CreateUserDto[])
```

要克服此限制，请显式设置类型：

```typescript
@ApiBody({ type: [CreateUserDto] })
createBulk(@Body() usersDto: CreateUserDto[])
```

#### 枚举

识别 `enum`，设置 `enum` 的性质 `@ApiProperty()` 到数组值：

```typescript
@ApiProperty({ enum: ['Admin', 'Moderator', 'User']})
role: UserRole;
```

或者，定义一个实际的 TypeScript 枚举如下：

```typescript
export enum UserRole {
  Admin = 'Admin',
  Moderator = 'Moderator',
  User = 'User',
}
```

然后，您可以直接将枚举与 `@Query()` 参数装饰器，结合 `@ApiQuery()` 装饰师：

```typescript
@ApiQuery({ name: 'role', enum: UserRole })
async filterByRole(@Query('role') role: UserRole = UserRole.User) {}
```

<figure><img src="https://docs.nestjs.com/assets/enum_query.gif" /></figure>

和 `isArray` 设置为 `true`，这个 `enum` 可以在**多选**中选择值：

<figure><img src="https://docs.nestjs.com/assets/enum_query_array.gif" /></figure>

#### 枚举模式

默认情况下，`enum` 属性将原始 [枚举](https://swagger.io/docs/specification/data-models/enums/) 定义添加到 `parameter` 中：

```yaml
- breed:
    type: 'string'
    enum:
      - Persian
      - Tabby
      - Siamese
```

该规范适用于大多数情况。但是，如果使用将规范作为**输入**并生成**客户端**代码的工具，则生成的代码可能包含重复的 `enums`。考虑以下代码片段：

```typescript
// generated client-side code
export class CatDetail {
  breed: CatDetailEnum;
}

export class CatInformation {
  breed: CatInformationEnum;
}

export enum CatDetailEnum {
  Persian = 'Persian',
  Tabby = 'Tabby',
  Siamese = 'Siamese',
}

export enum CatInformationEnum {
  Persian = 'Persian',
  Tabby = 'Tabby',
  Siamese = 'Siamese',
}
```

> info **Hint** 上面的代码片段是使用名为 [NSwag](https://github.com/RicoSuter/NSwag) 的工具生成的。

结果包含两个相同的 `enums`。要解决此问题，请在装饰器中传递 `enumName` 和 `enum` 属性：

```typescript
export class CatDetail {
  @ApiProperty({ enum: CatBreed, enumName: 'CatBreed' })
  breed: CatBreed;
}
```

这个 `enumName` 财产收益 `@nestjs/swagger` 转弯 `CatBreed` 变成自己的 `schema`，这使得 `CatBreed` 枚举可重用。规范如下所示：

```yaml
CatDetail:
  type: 'object'
  properties:
    ...
    - breed:
        schema:
          $ref: '#/components/schemas/CatBreed'
CatBreed:
  type: string
  enum:
    - Persian
    - Tabby
    - Siamese
```

> info **Hint** `@ApiQuery()` 和 `@ApiParam()` 装饰者也接受 `enumName` 和 `enum`。

#### 属性值示例

若要为属性设置单个实例，请使用 `example` 关键：

```typescript
@ApiProperty({
  example: 'persian',
})
breed: string;
```

要提供多个示例，请使用 `examples` 键入并传递一个结构如下的对象：

```typescript
@ApiProperty({
  examples: {
    Persian: { value: 'persian' },
    Tabby: { value: 'tabby' },
    Siamese: { value: 'siamese' },
    'Scottish Fold': { value: 'scottish_fold' },
  },
})
breed: string;
```

#### 原始定义

在某些情况下，例如深嵌套数组或矩阵，您可能需要手动定义类型：

```typescript
@ApiProperty({
  type: 'array',
  items: {
    type: 'array',
    items: {
      type: 'number',
    },
  },
})
coords: number[][];
```

还可以指定原始对象架构：

```typescript
@ApiProperty({
  type: 'object',
  properties: {
    name: {
      type: 'string',
      example: 'Error'
    },
    status: {
      type: 'number',
      example: 400
    }
  },
  required: ['name', 'status']
})
rawDefinition: Record<string, any>;
```

若要在控制器类中手动定义输入/输出内容，请使用 `schema` 属性：

```typescript
@ApiBody({
  schema: {
    type: 'array',
    items: {
      type: 'array',
      items: {
        type: 'number',
      },
    },
  },
})
async create(@Body() coords: number[][]) {}
```

#### 额外型号

定义控制器不直接引用的其他模型，而是 Swagger 模块应检查，使用 `@ApiExtraModels()` 装饰师：

```typescript
@ApiExtraModels(ExtraModel)
export class CreateCatDto {}
```

> info **Hint** 您只需要使用 `@ApiExtraModels()` 一次用于特定的模型类。

或者，用 `extraModels` 财产 `SwaggerModule.createDocument()` 方法：

```typescript
const documentFactory = () =>
  SwaggerModule.createDocument(app, options, {
    extraModels: [ExtraModel],
  });
```

获取引用（`$ref`) 到您的模型，使用 `getSchemaPath(ExtraModel)` 功能：

```typescript
'application/vnd.api+json': {
   schema: { $ref: getSchemaPath(ExtraModel) },
},
```

#### oneOf,anyOf,allOf

若要组合模式，请使用 `oneOf`,`anyOf`, 或 `allOf` 关键字（参见 [oneOf,anyOf,allOf,不](https://swagger.io/docs/specification/data-models/oneof-anyof-allof-not/) 在 Swagger 文件）：

```typescript
@ApiProperty({
  oneOf: [
    { $ref: getSchemaPath(Cat) },
    { $ref: getSchemaPath(Dog) },
  ],
})
pet: Cat | Dog;
```

要定义多态数组（即成员跨越多个模式的数组），请使用原始定义（参见上文）手动定义：

```typescript
type Pet = Cat | Dog;

@ApiProperty({
  type: 'array',
  items: {
    oneOf: [
      { $ref: getSchemaPath(Cat) },
      { $ref: getSchemaPath(Dog) },
    ],
  },
})
pets: Pet[];
```

> info **Hint** `getSchemaPath()` 函数是从 `@nestjs/swagger` 导入的。

两个 `Cat` 和 `Dog` 必须定义为具有 `@ApiExtraModels()` 装饰师（班级）。

#### 架构名称和描述

生成的模式的名称基于原始模型类的名称（例如，`CreateCatDto` 模型生成一个 `CreateCatDto` 方案）。若要更改架构名称，请使用 `@ApiSchema()` 装饰师：

```typescript
@ApiSchema({ name: 'CreateCatRequest' })
class CreateCatDto {}
```

上面的模型转化为 `CreateCatRequest` 模式。

默认情况下，生成的模式没有描述。要添加一个，请使用 `description` 属性：

```typescript
@ApiSchema({ description: 'Description of the CreateCatDto schema' })
class CreateCatDto {}
```

然后将描述包含在模式中：

```yaml
schemas:
  CreateCatDto:
    type: object
    description: Description of the CreateCatDto schema
```
