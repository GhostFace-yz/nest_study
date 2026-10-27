# Introduction

Source: https://docs.nestjs.com/openapi/introduction

这个 [OpenAPI](https://swagger.io/specification/) 规范是一种与语言无关的定义格式，用于描述 RESTful API。Nest 提供专用的 [模块](https://github.com/nestjs/swagger) 这就从代码中的装饰者那里生成了这样一个规范。

#### 安装

首先，安装所需的依赖项：

```bash
$ npm install --save @nestjs/swagger
```

> warning **Warning** 如果使用 Fastify，还要安装 `@fastify/static`：
>
> 巴什
> $ npm 安装 --save @fastify/static
> ```

#### 引导

安装完成后，打开 `main.ts` 文件和初始化 Swagger 使用 `SwaggerModule` 班级：

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addTag('cats')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

> info **Hint** 包装 `SwaggerModule.createDocument()` 在工厂函数中，推迟文档生成，直到首次请求文档，这样可以节省初始化时间。生成的文档是符合 [OpenAPI Document](https://swagger.io/specification/#openapi-document) 规格。而不是把它端上来 HTTP，您也可以将其另存为 JSON 或者 YAML 归档并在其他地方使用。

> warning **Warning** 如果你打电话 `createDocument()` 急切地（而不是在工厂函数中，如上所示），确保 `app.enableVersioning()` 先跑。否则，生成的 `paths` 缺少版本前缀。工厂模式不受影响，因为在首次请求文档之前不会生成文档。

`DocumentBuilder` 构建符合 OpenAPI 规范的基础文档。它的方法允许您设置标题、描述和版本等属性。要创建完整的文档（定义了所有 HTTP 路由），请使用 `SwaggerModule` 类的 `createDocument()` 方法。它需要两个参数：应用程序实例和 `DocumentBuilder#build()` 返回的基本文档配置。[文档选项](/openapi/introduction#document-options) 部分涵盖了类型为 `SwaggerDocumentOptions` 的可选第三个参数。

接下来，调用 `setup()` 方法。它接受：

1. 挂载路径 SwaggerUI 在
2. 应用程序实例
3. 文档对象，或返回它的工厂函数（如上）
4. 可选配置对象（参见 [设置选项](/openapi/introduction#setup-options)）

现在运行以下命令启动 HTTP 服务器：

```bash
$ npm run start
```

当应用程序运行时，打开浏览器并导航到 `http://localhost:3000/api`。您应该看到 SwaggerUI。

<figure><img src="https://docs.nestjs.com/assets/swagger1.png" /></figure>

这个 `SwaggerModule` 自动反映您的所有端点。

> info **Hint** 要生成和下载 SwaggerJSON 文件，请导航到 `http://localhost:3000/api-json`（假设您的 Swagger 文档在 `http://localhost:3000/api` 下可用）。
> 您也可以使用 `setup()` 方法的 `jsonDocumentUrl` 选项在您选择的路径上公开它：
>
> ``` 打字脚本
> SwaggerModule.setup('招摇', app, documentFactory, {
> jsonDocumentUrl: 'swagger/json',
> });
> ```
>
> 这在 `http://localhost:3000/swagger/json` 处暴露了它。

> info **Hint** Swagger UI 与 Nest 内置 [安全报头](/security/helmet) 的默认值 [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 配合使用。如果您通过 `customJs`/`customJsStr` 添加脚本，或者在本地开发之外的普通 HTTP 上提供 SwaggerUI，请参见 [Swagger UI and GraphQL IDEs](/security/helmet#swagger-ui-and-graphql-ides) 了解要调整的指令。

> warning **Warning** 当您直接向 Fastify 注册 `helmet` 时，它的 [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 可以阻止 SwaggerUI。要解决此冲突，请配置 CSP，如下所示：
>
> ``` 打字脚本
> app.register(盔，{
> contentSecurityPolicy:{
> 指令：{
> defaultSrc:[`'self'`],
> styleSrc:[`'self'`,`'unsafe-inline'`],
> imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
> scriptSrc:[`'self'`,`https:`,`'unsafe-inline'`],
> },
> },
> });
>
> // 如果您根本不打算使用 CSP，可以使用：
> app.register(盔，{
> contentSecurityPolicy: 假，
> });
> ```

#### 文档选项

创建文档时，可以传递额外的选项来微调库的行为。这些选项的类型为 `SwaggerDocumentOptions`：

```TypeScript
export interface SwaggerDocumentOptions {
  /**
   * List of modules to include in the specification
   */
  include?: Function[];

  /**
   * Additional, extra models that should be inspected and included in the specification
   */
  extraModels?: Function[];

  /**
   * If `true`, swagger will ignore the global prefix set through `setGlobalPrefix()` method
   */
  ignoreGlobalPrefix?: boolean;

  /**
   * If `true`, swagger will also load routes from the modules imported by `include` modules
   */
  deepScanRoutes?: boolean;

  /**
   * Custom operationIdFactory that will be used to generate the `operationId`
   * based on the `controllerKey`, `methodKey`, and version.
   * @default () => controllerKey_methodKey_version
   */
  operationIdFactory?: OperationIdFactory;

  /**
   * Custom linkNameFactory that will be used to generate the name of links
   * in the `links` field of responses
   *
   * @see [Link objects](https://swagger.io/docs/specification/links/)
   *
   * @default () => `${controllerKey}_${methodKey}_from_${fieldKey}`
   */
  linkNameFactory?: (
    controllerKey: string,
    methodKey: string,
    fieldKey: string
  ) => string;

  /*
   * Generate tags automatically based on the controller name.
   * If `false`, you must use the `@ApiTags()` decorator to define tags.
   * Otherwise, the controller name without the suffix `Controller` will be used.
   * @default true
   */
  autoTagControllers?: boolean;

  /**
   * If `true`, swagger will only include routes that are decorated with the `@ApiIncludeEndpoint()` decorator
   * @default false
   */
  onlyIncludeDecoratedEndpoints?: boolean;

  /**
   * If `true`, `default` values that are non-plain objects at runtime
   * (e.g., `new Date()` or class instances) are omitted from the document,
   * so the document doesn't change on every restart.
   * @default false
   */
  excludeDynamicDefaults?: boolean;

  /**
   * If set, `example` and `examples` values on component schemas are
   * truncated once their nested object/array depth exceeds this number.
   * Per-property `@ApiProperty({ exampleMaxDepth })` overrides it.
   * @default undefined
   */
  exampleMaxDepth?: number;

  /**
   * Converts Standard Schema instances passed to route parameter decorators
   * into OpenAPI schemas (see "Standard Schema (Zod, Valibot)" below).
   */
  standardSchemaConverter?: StandardSchemaConverter;
}
```

例如，要生成操作名称，如 `createUser` 而不是 `UsersController_createUser`，设置以下内容：

```TypeScript
const options: SwaggerDocumentOptions =  {
  operationIdFactory: (
    controllerKey: string,
    methodKey: string
  ) => methodKey
};
const documentFactory = () => SwaggerModule.createDocument(app, config, options);
```

#### 标准方案（Zod、Valibot）

Nest 路由参数装饰器接受 [Standard Schema](https://standardschema.dev/) 通过他们的兼容模式 `schema` 选项（参见 [控制器](/controllers#request-object) 章）：

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';

const createCatSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
  breed: z.string(),
});
type CreateCatDto = z.infer<typeof createCatSchema>;

@Controller('cats')
export class CatsController {
  @Post()
  create(@Body({ schema: createCatSchema }) createCatDto: CreateCatDto) {
    return this.catsService.create(createCatDto);
  }
}
```

这个 Swagger 模块获取这些模式，并在生成的文档中将它们转换为请求主体和参数。

##### 无需配置的库

如果您的验证库实现了**标准 JSON 架构**扩展（即，其架构公开 `~standard.jsonSchema`),Nest 转换模式本身，无需配置任何内容。例如，Zod 4.2 和更高版本实现了这种扩展。Nest 请求 `openapi-3.0` 目标并使用 `input` 或者 `output` 变体，取决于模式描述的是请求还是响应。

##### 提供转换器

对于不公开该扩展的库（或者当您想自己控制转换时），请在 `SwaggerDocumentOptions` 中提供 `standardSchemaConverter`。它接收原始模式和正在生成的 `schemaType`，并返回转换后的 OpenAPI 模式：

```typescript
standardSchemaConverter?: (
  schema: unknown,
  options: { schemaType: 'input' | 'output' },
) => { schema: unknown; components?: Record<string, any> } | undefined;
```

Nest 在尝试本机转换之前调用转换器。返回 `undefined` 告诉 Nest 转换器不处理此模式，因此 Nest 回到上面描述的本机转换。这使得从一个转换器支持多个库变得安全。

对于**Zod**，您可以使用 [zod-openapi](https://github.com/samchungy/zod-openapi)：

```bash
$ npm i --save-dev zod-openapi
```

```typescript
import { SwaggerDocumentOptions, SwaggerModule } from '@nestjs/swagger';
import { createSchema } from 'zod-openapi';

const documentOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => {
    const converted = createSchema(schema as never, {
      io: schemaType,
      openapiVersion: '3.0.0',
    });
    return { schema: converted.schema, components: converted.components };
  },
};

const documentFactory = () =>
  SwaggerModule.createDocument(app, config, documentOptions);
```

对于**Valibot**，请使用 [@valibot/to-json-schema](https://github.com/fabian-hiller/valibot/tree/main/packages/to-json-schema)：

```bash
$ npm i --save-dev @valibot/to-json-schema
```

```typescript
import { SwaggerDocumentOptions } from '@nestjs/swagger';
import { toJsonSchema } from '@valibot/to-json-schema';

const documentOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => ({
    schema: toJsonSchema(schema as never, {
      target: 'openapi-3.0',
      typeMode: schemaType,
    }),
  }),
};
```

这两个转换器在一个方面有所不同。`createSchema()` 可以提升可重用的定义，因此其结果携带一个 `components` 映射，您可以通过该映射，Nest 将其合并到文档的共享组件中。`toJsonSchema()` 返回一个独立的模式，因此 Valibot 转换器省略了 `components`。

##### 同时支持多个库

因为转换器将模式接收为 `unknown`，所以您可以在模式的供应商上进行分支，并在同一应用程序中支持多个库。每个标准模式在 `~standard.vendor` 处公开其供应商：

```typescript
import { SwaggerDocumentOptions } from '@nestjs/swagger';
import { toJsonSchema } from '@valibot/to-json-schema';
import { createSchema } from 'zod-openapi';

function hasVendor(schema: unknown, vendor: string) {
  return (
    !!schema &&
    typeof schema === 'object' &&
    (schema as { '~standard'?: { vendor?: string } })['~standard']?.vendor ===
      vendor
  );
}

const documentOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => {
    if (hasVendor(schema, 'zod')) {
      const converted = createSchema(schema as never, {
        io: schemaType,
        openapiVersion: '3.0.0',
      });
      return { schema: converted.schema, components: converted.components };
    }

    if (hasVendor(schema, 'valibot')) {
      return {
        schema: toJsonSchema(schema as never, {
          target: 'openapi-3.0',
          typeMode: schemaType,
        }),
      };
    }

    // Not handled here - let Nest fall back to native conversion
    return undefined;
  },
};
```

> warning **Warning** 在调用特定于库的转换器之前，始终按供应商缩小范围。将 Valibot 架构传递给 `createSchema()`（或者相反）在文档生成时间上折腾，而不是优雅地失败。

> info **Hint** `schemaType` 模式执行转换时很重要：`input` 形状是客户端发送的，`output`shape 是处理程序在解析后接收到的内容。Nest 请求符合记录位置的变体，因此将值直接传递给您的转换器，而不是硬编码。

#### 设置选项

您可以配置 SwaggerUI 通过传递实现 `SwaggerCustomOptions` 接口作为第四个参数 `SwaggerModule#setup()` 方法。

```TypeScript
export interface SwaggerCustomOptions {
  /**
   * If `true`, Swagger resources paths will be prefixed by the global prefix set through `setGlobalPrefix()`.
   * Default: `false`.
   * @see https://docs.nestjs.com/faq/global-prefix
   */
  useGlobalPrefix?: boolean;

  /**
   * If `false`, the Swagger UI will not be served. Only API definitions (JSON and YAML)
   * will be accessible (on `/{path}-json` and `/{path}-yaml`). To fully disable both the Swagger UI and API definitions, use `raw: false`.
   * Default: `true`.
   * @deprecated Use `ui` instead.
   */
  swaggerUiEnabled?: boolean;

  /**
   * If `false`, the Swagger UI will not be served. Only API definitions (JSON and YAML)
   * will be accessible (on `/{path}-json` and `/{path}-yaml`). To fully disable both the Swagger UI and API definitions, use `raw: false`.
   * Default: `true`.
   */
  ui?: boolean;

  /**
   * If `true`, raw definitions for all formats will be served.
   * Alternatively, you can pass an array to specify the formats to be served, e.g., `raw: ['json']` to serve only JSON definitions.
   * If set to `false` or an empty array, no definitions (JSON or YAML) will be served.
   * Use this option to control the availability of Swagger-related endpoints.
   * Default: `true`.
   */
  raw?: boolean | Array<'json' | 'yaml'>;

  /**
   * Url point the API definition to load in Swagger UI.
   */
  swaggerUrl?: string;

  /**
   * Path of the JSON API definition to serve.
   * Default: `<path>-json`.
   */
  jsonDocumentUrl?: string;

  /**
   * Path of the YAML API definition to serve.
   * Default: `<path>-yaml`.
   */
  yamlDocumentUrl?: string;

  /**
   * Hook allowing to alter the OpenAPI document before being served.
   * It's called after the document is generated and before it is served as JSON & YAML.
   * The hook can return either a plain `OpenAPIObject` or a `Promise<OpenAPIObject>`.
   */
  patchDocumentOnRequest?: <TRequest = any, TResponse = any>(
    req: TRequest,
    res: TResponse,
    document: OpenAPIObject
  ) => OpenAPIObject | Promise<OpenAPIObject>;

  /**
   * If `true`, the selector of OpenAPI definitions is displayed in the Swagger UI interface.
   * Default: `false`.
   */
  explorer?: boolean;

  /**
   * Additional Swagger UI options
   */
  swaggerOptions?: SwaggerUiOptions;

  /**
   * Custom CSS styles to inject in Swagger UI page.
   */
  customCss?: string;

  /**
   * URL(s) of a custom CSS stylesheet to load in Swagger UI page.
   */
  customCssUrl?: string | string[];

  /**
   * URL(s) of custom JavaScript files to load in Swagger UI page.
   */
  customJs?: string | string[];

  /**
   * Custom JavaScript scripts to load in Swagger UI page.
   */
  customJsStr?: string | string[];

  /**
   * Custom favicon for Swagger UI page.
   */
  customfavIcon?: string;

  /**
   * Custom title for Swagger UI page.
   */
  customSiteTitle?: string;

  /**
   * File system path (ex: ./node_modules/swagger-ui-dist) containing static Swagger UI assets.
   */
  customSwaggerUiPath?: string;

  /**
   * @deprecated This property has no effect.
   */
  validatorUrl?: string;

  /**
   * @deprecated This property has no effect.
   */
  url?: string;

  /**
   * @deprecated This property has no effect.
   */
  urls?: Record<'url' | 'name', string>[];
}
```

> info **Hint** `ui` 和 `raw` 是独立的选项。禁用 Swagger UI (`ui: false`）不会禁用 API 定义（JSON/YAML).相反，禁用 API 定义（`raw: []`）不会禁用 Swagger UI.
>
> 例如，以下配置禁用 Swagger UI 但保持 JSON API 可用定义：
>
> ``` 打字脚本
> 常量选项：SwaggerCustomOptions = {
> ui：false，// Swagger UI 已禁用
> 原始：['json'], // JSON API 定义仍然可以访问（YAML 已禁用）
> };
> SwaggerModule.setup（'api'，应用程序， documentFactory，选项）；
> ```
>
> 在这种情况下， `http://localhost:3000/api-json` 仍然可以访问，但是 `http://localhost:3000/api` （ Swagger UI）不是。

#### 例子

[Nest repository](https://github.com/nestjs/nest/tree/master/sample/11-swagger) 中提供了一个工作示例。
