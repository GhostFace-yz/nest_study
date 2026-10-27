# Operations

Source: https://docs.nestjs.com/openapi/operations

在 OpenAPI 术语中，路径是您的 API 公开的端点（资源），如 `/users` 或 `/reports/summary`。操作是用于操作这些路径的 HTTP 方法，例如 `GET`、`POST` 或 `DELETE`。

#### 标签

若要将控制器附加到特定标记，请使用 `@ApiTags(...tags)` 装饰师：

```typescript
@ApiTags('cats')
@Controller('cats')
export class CatsController {}
```

OpenAPI 3.2 扩展了 Tag 对象，这样标签就可以被组织成一个层次结构，并带有关于它们应该如何呈现的提示进行注释。要声明这些关系，请预先使用 `DocumentBuilder` 定义标记，并将 `parent` 和 `kind` 选项传递给 `addTag()`：

```typescript
const config = new DocumentBuilder()
  .setOpenAPIVersion('3.2.0')
  .addTag('Animals', 'Everything about animals', undefined, { kind: 'nav' })
  .addTag('Cats', 'Cat operations', undefined, { parent: 'Animals' })
  .addTag('Dogs', 'Dog operations', undefined, { parent: 'Animals' })
  .build();
```

`parent` 选项按名称引用另一个标记。`kind` 选项是一个自由格式、机器可读的字符串，它提示应该如何使用标记，通常是 `nav`、`badge` 或 `audience`。同一个选项对象还接受另一个 OpenAPI 3.2 标记对象字段 `summary`。

> warning **Warning** 这个 `parent` 和 `kind` 字段属于 OpenAPI 3.2 标记对象。你必须打电话 `setOpenAPIVersion('3.2.0')` 否则，生成的文档仍然声明 `openapi: 3.0.0`，严格验证器拒绝这些字段。层次结构字段只能通过 `DocumentBuilder.addTag()`.这 `@ApiTags()` 装饰器忽略它们并记录警告。

#### 标题

若要定义作为请求一部分的自定义标头，请使用 `@ApiHeader()`：

```typescript
@ApiHeader({
  name: 'X-MyHeader',
  description: 'Custom header',
})
@Controller('cats')
export class CatsController {}
```

#### 答复

定义自定义 HTTP 响应，使用 `@ApiResponse()` 装饰师：

```typescript
@Post()
@ApiResponse({ status: 201, description: 'The record has been successfully created.'})
@ApiResponse({ status: 403, description: 'Forbidden.'})
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

Nest 提供一组速记**API 响应** 装饰者建立在 `@ApiResponse()`，每个公共状态代码一个。它们包括：

- `@ApiOkResponse()`
- `@ApiCreatedResponse()`
- `@ApiAcceptedResponse()`
- `@ApiNoContentResponse()`
- `@ApiMovedPermanentlyResponse()`
- `@ApiFoundResponse()`
- `@ApiBadRequestResponse()`
- `@ApiUnauthorizedResponse()`
- `@ApiNotFoundResponse()`
- `@ApiForbiddenResponse()`
- `@ApiMethodNotAllowedResponse()`
- `@ApiNotAcceptableResponse()`
- `@ApiRequestTimeoutResponse()`
- `@ApiConflictResponse()`
- `@ApiPreconditionFailedResponse()`
- `@ApiTooManyRequestsResponse()`
- `@ApiGoneResponse()`
- `@ApiPayloadTooLargeResponse()`
- `@ApiUnsupportedMediaTypeResponse()`
- `@ApiUnprocessableEntityResponse()`
- `@ApiInternalServerErrorResponse()`
- `@ApiNotImplementedResponse()`
- `@ApiBadGatewayResponse()`
- `@ApiServiceUnavailableResponse()`
- `@ApiGatewayTimeoutResponse()`
- `@ApiDefaultResponse()`

```typescript
@Post()
@ApiCreatedResponse({ description: 'The record has been successfully created.'})
@ApiForbiddenResponse({ description: 'Forbidden.'})
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

若要为请求指定返回模型，请创建一个类并使用 `@ApiProperty()` 装饰师：

```typescript
export class Cat {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}
```

然后您可以使用 `Cat` 模型与 `type` 响应装饰器的属性：

```typescript
@ApiTags('cats')
@Controller('cats')
export class CatsController {
  @Post()
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: Cat,
  })
  async create(@Body() createCatDto: CreateCatDto): Promise<Cat> {
    return this.catsService.create(createCatDto);
  }
}
```

打开浏览器并验证生成的 `Cat` 型号：

<figure><img src="https://docs.nestjs.com/assets/swagger-response-type.png" /></figure>

您可以使用 `DocumentBuilder` 类为所有端点定义全局响应，而不是为每个端点或控制器单独定义响应。这对于应用程序中的每个端点都可以返回的响应非常有用（例如，像 `401 Unauthorized` 或 `500 Internal Server Error` 这样的错误）。

```typescript
const config = new DocumentBuilder()
  .addGlobalResponse({
    status: 500,
    description: 'Internal server error',
  })
  // other configurations
  .build();
```

#### 文件上传

若要记录特定方法的文件上传，请将 `@ApiBody()` 装饰器与 `@ApiConsumes()` 一起使用。以下是使用 [文件上传](/http/file-upload) 技术的完整示例：

```typescript
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
@ApiBody({
  description: 'List of cats',
  type: FileUploadDto,
})
uploadFile(@UploadedFile() file: Express.Multer.File) {}
```

哪里 `FileUploadDto` 定义如下：

```typescript
class FileUploadDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
}
```

若要处理多个文件上传，请定义 `FilesUploadDto` 如下：

```typescript
class FilesUploadDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  files: any[];
}
```

#### 扩展

若要向操作添加扩展，请使用 `@ApiExtension()` 装修师。扩展名称必须以 `x-`（否则，装饰器抛出错误）。

```typescript
@ApiExtension('x-foo', { hello: 'world' })
```

#### 高级：通用 `ApiResponse`

使用 [原始定义](/openapi/types-and-parameters#raw-definitions)，您可以定义 SwaggerUI 的通用模式。假设您有以下 DTO：

```ts
export class PaginatedDto<TData> {
  @ApiProperty()
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;

  results: TData[];
}
```

我们跳过装饰 `results`，因为我们稍后将为它提供一个原始定义。现在，定义另一个 DTO，例如 `CatDto`，如下：

```ts
export class CatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}
```

有了这个，您就可以定义一个 `PaginatedDto<CatDto>` 回应：

```ts
@ApiOkResponse({
  schema: {
    allOf: [
      { $ref: getSchemaPath(PaginatedDto) },
      {
        properties: {
          results: {
            type: 'array',
            items: { $ref: getSchemaPath(CatDto) },
          },
        },
      },
    ],
  },
})
async findAll(): Promise<PaginatedDto<CatDto>> {}
```

在本例中，响应将 `PaginatedDto`（通过 `allOf`）与类型为 `Array<CatDto>` 的 `results` 属性结合起来。

- `getSchemaPath()` 返回 OpenAPI 文档中给定模型的 OpenAPI 模式路径。
- `allOf` 是一个 OAS3 个关键字，涵盖各种与继承相关的用例。

最后，因为没有控制器引用 `PaginatedDto` 直接地， `SwaggerModule` 还不能生成相应的模型定义。在这种情况下，必须将其添加为 [额外模型](/openapi/types-and-parameters#extra-models).例如，使用 `@ApiExtraModels()` 控制器级别的装饰器：

```ts
@Controller('cats')
@ApiExtraModels(PaginatedDto)
export class CatsController {}
```

如果你跑 Swagger 现在，生成的 `swagger.json` 对于此端点，定义以下响应：

```json
"responses": {
  "200": {
    "description": "",
    "content": {
      "application/json": {
        "schema": {
          "allOf": [
            {
              "$ref": "#/components/schemas/PaginatedDto"
            },
            {
              "properties": {
                "results": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/CatDto"
                  }
                }
              }
            }
          ]
        }
      }
    }
  }
}
```

要使其可重复使用，请为 `PaginatedDto` 创建自定义装饰器：

```ts
export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiExtraModels(PaginatedDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedDto) },
          {
            properties: {
              results: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
};
```

> info **Hint** 这个 `Type<any>` 接口和 `applyDecorators()` 函数是从 `@nestjs/common` 包装。

以确保 `SwaggerModule` 生成模型的定义，装饰器将其注册为附加模型 `ApiExtraModels()` 就像我们之前做的那样 `PaginatedDto` 在控制器中。

有了这个，您就可以使用自定义 `@ApiPaginatedResponse()` 端点上的装饰器：

```ts
@ApiPaginatedResponse(CatDto)
async findAll(): Promise<PaginatedDto<CatDto>> {}
```

对于客户端生成工具，这种方法使得如何 `PaginatedDto<TModel>` 应该为客户端生成。以下代码片段是客户端生成器结果的示例 `GET /` 以上终点：

```typescript
// Angular
findAll(): Observable<{ total: number, limit: number, offset: number, results: CatDto[] }>
```

这里的**返回类型**模棱两可。要解决此问题，请在 `ApiPaginatedResponse` 中的 `schema` 中添加 `title` 属性：

```typescript
export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiOkResponse({
      schema: {
        title: `PaginatedResponseOf${model.name}`,
        allOf: [
          // ...
        ],
      },
    }),
  );
};
```

客户端生成器的结果现在变为：

```ts
// Angular
findAll(): Observable<PaginatedResponseOfCatDto>
```
