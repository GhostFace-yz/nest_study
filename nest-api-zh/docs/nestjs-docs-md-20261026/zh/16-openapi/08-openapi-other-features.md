# Other features

Source: https://docs.nestjs.com/openapi/other-features

本页涵盖了 Swagger 您可能会发现有用的模块。

#### 全局前缀

忽略通过 `setGlobalPrefix()`，使用 `ignoreGlobalPrefix` 选项：

```typescript
const document = SwaggerModule.createDocument(app, options, {
  ignoreGlobalPrefix: true,
});
```

#### 全局参数

要定义所有路由的参数，请使用 `DocumentBuilder`：

```typescript
const config = new DocumentBuilder()
  .addGlobalParameters({
    name: 'tenantId',
    in: 'header',
  })
  // other configurations
  .build();
```

#### 全球应对措施

要定义所有路由的全局响应，请使用 `DocumentBuilder`。这对于在应用程序中的所有端点之间设置一致的响应非常有用，例如错误代码，如 `401 Unauthorized` 或 `500 Internal Server Error`。

```typescript
const config = new DocumentBuilder()
  .addGlobalResponse({
    status: 500,
    description: 'Internal server error',
  })
  // other configurations
  .build();
```

#### 多种规格

这个 `SwaggerModule` 支持多种规格。换句话说，您可以在不同的端点上使用不同的 UI 提供不同的文档。

为了支持多种规范，您的应用程序必须采用模块化方法编写。这个 `createDocument()` 方法采用第三个参数，`extraOptions`，这是一个具有 `include` 财产。这个 `include` 属性接受一个模块数组。

设置对多个规格的支持，如下所示：

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { CatsModule } from './cats/cats.module.js';
import { DogsModule } from './dogs/dogs.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * createDocument(application, configurationOptions, extraOptions);
   *
   * createDocument method takes an optional 3rd argument "extraOptions"
   * which is an object with "include" property where you can pass an Array
   * of Modules that you want to include in that Swagger Specification
   * E.g: CatsModule and DogsModule will have two separate Swagger Specifications which
   * will be exposed on two different SwaggerUI with two different endpoints.
   */

  const options = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addTag('cats')
    .build();

  const catDocumentFactory = () =>
    SwaggerModule.createDocument(app, options, {
      include: [CatsModule],
    });
  SwaggerModule.setup('api/cats', app, catDocumentFactory);

  const secondOptions = new DocumentBuilder()
    .setTitle('Dogs example')
    .setDescription('The dogs API description')
    .setVersion('1.0')
    .addTag('dogs')
    .build();

  const dogDocumentFactory = () =>
    SwaggerModule.createDocument(app, secondOptions, {
      include: [DogsModule],
    });
  SwaggerModule.setup('api/dogs', app, dogDocumentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

现在使用以下命令启动服务器：

```bash
$ npm run start
```

导航至 `http://localhost:3000/api/cats` 去看 SwaggerUI 对于猫：

<figure><img src="https://docs.nestjs.com/assets/swagger-cats.png" /></figure>

反过来，`http://localhost:3000/api/dogs` 会暴露 SwaggerUI 对于狗：

<figure><img src="https://docs.nestjs.com/assets/swagger-dogs.png" /></figure>

#### 资源管理器栏中的下拉列表

要在资源管理器栏的下拉菜单中列出多个规格，请在 `SwaggerCustomOptions` 中设置 `explorer: true` 并配置 `swaggerOptions.urls`。

> info **Hint** 确保 `swaggerOptions.urls` 指向 Swagger 文档的 JSON 格式。要指定 JSON 文档的路径，请使用 `SwaggerCustomOptions` 的 `jsonDocumentUrl` 选项。有关更多选项，请参见 [设置选项](/openapi/introduction#setup-options)。

以下是如何从资源管理器栏中的下拉列表中选择多个规格：

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { CatsModule } from './cats/cats.module.js';
import { DogsModule } from './dogs/dogs.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Main API options
  const options = new DocumentBuilder()
    .setTitle('Multiple Specifications Example')
    .setDescription('Description for multiple specifications')
    .setVersion('1.0')
    .build();

  // Create main API document
  const document = SwaggerModule.createDocument(app, options);

  // Setup main API Swagger UI with dropdown support
  SwaggerModule.setup('api', app, document, {
    explorer: true,
    swaggerOptions: {
      urls: [
        {
          name: '1. API',
          url: 'api/swagger.json',
        },
        {
          name: '2. Cats API',
          url: 'api/cats/swagger.json',
        },
        {
          name: '3. Dogs API',
          url: 'api/dogs/swagger.json',
        },
      ],
    },
    jsonDocumentUrl: '/api/swagger.json',
  });

  // Cats API options
  const catOptions = new DocumentBuilder()
    .setTitle('Cats Example')
    .setDescription('Description for the Cats API')
    .setVersion('1.0')
    .addTag('cats')
    .build();

  // Create Cats API document
  const catDocument = SwaggerModule.createDocument(app, catOptions, {
    include: [CatsModule],
  });

  // Setup Cats API Swagger UI
  SwaggerModule.setup('api/cats', app, catDocument, {
    jsonDocumentUrl: '/api/cats/swagger.json',
  });

  // Dogs API options
  const dogOptions = new DocumentBuilder()
    .setTitle('Dogs Example')
    .setDescription('Description for the Dogs API')
    .setVersion('1.0')
    .addTag('dogs')
    .build();

  // Create Dogs API document
  const dogDocument = SwaggerModule.createDocument(app, dogOptions, {
    include: [DogsModule],
  });

  // Setup Dogs API Swagger UI
  SwaggerModule.setup('api/dogs', app, dogDocument, {
    jsonDocumentUrl: '/api/dogs/swagger.json',
  });

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
```

这个例子设置了一个主要的 API 以及猫和狗的单独规格，每个规格都可以从浏览器栏中的下拉菜单中访问。
