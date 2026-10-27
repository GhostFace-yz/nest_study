# Decorators

Source: https://docs.nestjs.com/openapi/decorators

所有 OpenAPI 装饰器都有一个 `Api` 前缀将它们与核心装饰器区分开来。下表列出了导出的装饰器，以及每个装饰器的应用级别。

| | |
| ------------------------- | ------------------- |
| `@ApiBasicAuth()` | 方法/控制器 |
| `@ApiBearerAuth()` | 方法/控制器 |
| `@ApiBody()` | 方法 |
| `@ApiConsumes()` | 方法/控制器 |
| `@ApiCookieAuth()` | 方法/控制器 |
| `@ApiExcludeController()` | 控制者 |
| `@ApiExcludeEndpoint()` | 方法 |
| `@ApiDefaultGetter()` | 方法 |
| `@ApiExtension()` | 方法/控制器 |
| `@ApiExtraModels()` | 方法/控制器/模型 |
| `@ApiHeader()` | 方法/控制器 |
| `@ApiHeaders()` | 方法/控制器 |
| `@ApiHideProperty()` | 模型 |
| `@ApiIncludeEndpoint()` | 方法 |
| `@ApiLink()` | 方法 |
| `@ApiOAuth2()` | 方法/控制器 |
| `@ApiOperation()` | 方法 |
| `@ApiParam()` | 方法/控制器 |
| `@ApiProduces()` | 方法/控制器 |
| `@ApiSchema()` | 模型 |
| `@ApiProperty()` | 模型 |
| `@ApiPropertyOptional()` | 模型 |
| `@ApiQuery()` | 方法/控制器 |
| `@ApiResponse()` | 方法/控制器 |
| `@ApiResponseProperty()` | 模型 |
| `@ApiSecurity()` | 方法/控制器 |
| `@ApiTags()` | 方法/控制器 |
| `@ApiCallbacks()` | 方法/控制器 |
| `@ApiWebhook()` | 方法 |

速记响应修饰符（例如，[运营](/openapi/operations#responses) 章节中列出的 `@ApiOkResponse()` 和 `@ApiNotFoundResponse()`）可以应用于与 `@ApiResponse()` 相同的级别。
