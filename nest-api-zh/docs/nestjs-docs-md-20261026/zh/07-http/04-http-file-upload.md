# File upload and streaming

Source: https://docs.nestjs.com/http/file-upload

本章涵盖两个方向的文件：接收客户端上传的文件，以及 [流式文件](#streaming-files) 回到客户身边。

要处理文件上传， Nest 提供基于 [穆尔特](https://github.com/expressjs/multer) 中间件包 Express.Multer 处理发布在 `multipart/form-data` 格式，主要用于上传文件 HTTP `POST` 请求。该模块是完全可配置的，因此您可以根据应用程序的需求调整其行为。

> warning **Warning** Multer 无法处理不在 `multipart/form-data` 格式。

> info **Hint** 如果您的应用程序在 `FastifyAdapter` 相同的拦截器可从 `@nestjs/platform-fastify` 包，由 [@fastify/multipart](https://github.com/fastify/fastify-multipart) 而不是 Multer，本章中描述的装饰器和管道工作不变。只有导入路径更改 - 请参阅 [Fastify](/http/file-upload#fastify) 下面的部分。

对于类型安全，请安装 Multer 类型定义：

```shell
$ npm i -D @types/multer
```

安装此软件包后，您可以使用 `Express.Multer.File` 类型（使用 `import { Express } from 'express'` 导入 `Express` 命名空间）。

#### 基本示例

若要上传单个文件，请绑定 `FileInterceptor()` 拦截器到路由处理程序，并使用 `@UploadedFile()` 装修师。

```typescript
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
uploadFile(@UploadedFile() file: Express.Multer.File) {
  console.log(file);
}
```

> info **Hint** `FileInterceptor()` 装饰器是从 `@nestjs/platform-express` 包导出的。`@UploadedFile()` 装饰器是从 `@nestjs/common` 导出的。

这个 `FileInterceptor()`decorator 有两个参数：

- `fieldName`：的名称 HTML 保存文件的表单字段
- `options`：类型为 `MulterOptions` 的可选对象。这与 Multer 构造函数接受的对象相同（参见 [Multer options](https://github.com/expressjs/multer#multeropts)）。

> warning **Warning** `FileInterceptor()` 可能与 Google Firebase 或其他第三方云提供者不兼容。

#### 文件验证

您通常需要验证传入的文件元数据，如文件大小或 MIME 类型。为此，请创建一个 [管道](/pipes) 并将其绑定到用 `@UploadedFile()` 装饰的参数。以下示例实现了一个基本的文件大小验证管道：

```typescript
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class FileSizeValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    // "value" is an object containing the file's attributes and metadata
    const oneKb = 1000;
    return value.size < oneKb;
  }
}
```

将其与 `FileInterceptor` 如下：

```typescript
@Post('file')
@UseInterceptors(FileInterceptor('file'))
uploadFileAndValidate(@UploadedFile(
  new FileSizeValidationPipe(),
  // other pipes can be added here
) file: Express.Multer.File, ) {
  return file;
}
```

对于普通案件，Nest 提供内置管道，`ParseFilePipe`，它还标准化了如何添加新文件验证：

```typescript
@Post('file')
uploadFileAndPassValidation(
  @Body() body: SampleDto,
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        // ... Set of file validator instances here
      ]
    })
  )
  file: Express.Multer.File,
) {
  return {
    body,
    file: file.buffer.toString(),
  };
}
```

`ParseFilePipe` 需要一个文件验证器数组来执行。验证器接口描述如下。管道还接受两个**可选**选项：

<table>
  <tr>
    <td><code>errorHttpStatusCode</code></td>
    <td>The HTTP status code to be thrown in case <b>any</b> validator fails. Default is <code>400</code> (BAD REQUEST)</td>
  </tr>
  <tr>
    <td><code>exceptionFactory</code></td>
    <td>A factory which receives the error message and returns an error.</td>
  </tr>
</table>

此管道使用的验证器要么是内置实现，要么是您自己的抽象子类 `FileValidator` 班级：

```typescript
export abstract class FileValidator<TValidationOptions = Record<string, any>> {
  constructor(protected readonly validationOptions: TValidationOptions) {}

  /**
   * Indicates if this file should be considered valid, according to the options passed in the constructor.
   * @param file the file from the request object
   */
  abstract isValid(file?: any): boolean | Promise<boolean>;

  /**
   * Builds an error message in case the validation fails.
   * @param file the file from the request object
   */
  abstract buildErrorMessage(file: any): string;
}
```

> info **Hint** 这个 `isValid()` 方法可以是异步的。对于类型安全，请键入 `file` 参数 as`Express.Multer.File` 当您使用 Express（默认 HTTP 适配器）。

一个 `FileValidator` 接收文件对象，并根据传递给其构造函数的选项对其进行验证。Nest 提供两个内置实现：

- `MaxFileSizeValidator` 检查文件大小是否小于提供的值（以字节为单位）。
- `FileTypeValidator` 检查文件的 MIME 类型是否与给定的字符串或正则表达式匹配。默认情况下，它从文件内容的 [幻数](https://www.ibm.com/support/pages/what-magic-number) 确定 MIME 类型。

以下代码片段将两个验证器与 `ParseFilePipe` 一起使用：

```typescript
@UploadedFile(
  new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: 1000 }),
      new FileTypeValidator({ fileType: 'image/jpeg' }),
    ],
  }),
)
file: Express.Multer.File,
```

> info **Hint** 如果验证器列表变长，请在单独的文件中定义数组，并将其作为命名常量导入，例如 `fileValidators`。

或者，用 `ParseFilePipeBuilder` 班级。生成器为您实例化每个验证器，因此您只传递它们的选项：

```typescript
@UploadedFile(
  new ParseFilePipeBuilder()
    .addFileTypeValidator({
      fileType: 'jpeg',
    })
    .addMaxSizeValidator({
      maxSize: 1000
    })
    .build({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
    }),
)
file: Express.Multer.File,
```

> info **Hint** 默认情况下需要一个文件。要使其成为可选，请在 `build()` 方法的选项中传递 `fileIsRequired: false`（在 `errorHttpStatusCode` 旁边）。

#### 文件阵列

若要上载由单个字段名标识的文件数组，请使用 `FilesInterceptor()` 装饰器（注意其名称中的复数**文件**）。它需要三个论点：

- `fieldName`：如上所述
- `maxCount`: 可接受的可选最大文件数
- `options`：可选 `MulterOptions` 对象，如上所述

使用时 `FilesInterceptor()`，从 `request` 与 `@UploadedFiles()` 装修师。

```typescript
@Post('upload')
@UseInterceptors(FilesInterceptor('files'))
uploadFile(@UploadedFiles() files: Array<Express.Multer.File>) {
  console.log(files);
}
```

> info **Hint** `FilesInterceptor()` 装饰器是从 `@nestjs/platform-express` 包导出的。`@UploadedFiles()` 装饰器是从 `@nestjs/common` 导出的。

#### 验证文件数组

若要验证上传的文件数组，请传递一个由 `ParseFilePipeBuilder` 到 `@UploadedFiles()` 装修师。注册的验证器针对数组中的每个文件运行。

```typescript
@Post('upload')
@UseInterceptors(FilesInterceptor('files', 5))
uploadFiles(
  @UploadedFiles(
    new ParseFilePipeBuilder()
      .addFileTypeValidator({
        fileType: /^image\/(jpeg|png|gif)$/,
      })
      .addMaxSizeValidator({ maxSize: 5242880 })
      .build({
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
  )
  files: Array<Express.Multer.File>,
) {
  console.log(files);
}
```

#### 多个文件

若要上载不同字段名下的多个文件，请使用 `FileFieldsInterceptor()` 装修师。它有两个论点：

- `uploadedFields`：对象数组，每个对象都有一个必需的 `name` 属性（字段名）和可选 `maxCount` 财产
- `options`：可选 `MulterOptions` 对象，如上所述

使用时 `FileFieldsInterceptor()`，从 `request` 与 `@UploadedFiles()` 装修师。

```typescript
@Post('upload')
@UseInterceptors(FileFieldsInterceptor([
  { name: 'avatar', maxCount: 1 },
  { name: 'background', maxCount: 1 },
]))
uploadFile(@UploadedFiles() files: { avatar?: Express.Multer.File[], background?: Express.Multer.File[] }) {
  console.log(files);
}
```

#### 任何文件

若要接受任何字段名下的文件，请使用 `AnyFilesInterceptor()` 装修师。它接受可选的 `options` 对象，如上所述。

使用时 `AnyFilesInterceptor()`，从 `request` 与 `@UploadedFiles()` 装修师。

```typescript
@Post('upload')
@UseInterceptors(AnyFilesInterceptor())
uploadFile(@UploadedFiles() files: Array<Express.Multer.File>) {
  console.log(files);
}
```

#### 没有文件

要接受 `multipart/form-data` 而不允许上传文件，请使用 `NoFilesInterceptor`。它将多部分字段设置为请求主体的属性。包含文件的请求会被 `BadRequestException` 拒绝。

```typescript
@Post('upload')
@UseInterceptors(NoFilesInterceptor())
handleMultiPartData(@Body() body) {
  console.log(body)
}
```

#### 默认选项

您可以将 Multer 选项传递给每个文件拦截器，如上所述。要设置默认选项，请在导入 `MulterModule` 时调用静态 `register()` 方法。它接受所有 [Multer options](https://github.com/expressjs/multer#multeropts)。

```typescript
MulterModule.register({
  dest: './upload',
});
```

> info **Hint** 这个 `MulterModule` 类是从 `@nestjs/platform-express` 包装。

传递给文件拦截器的选项优先于这些默认值。从 NestJS v12.0.4，两个 `limits` 对象是逐个键合并的，因此只设置 `limits.fileSize` 保持默认值，例如 `limits.files`.如果其中一个是函数，则拦截器的 `limits` 完全替换默认值。

#### 异步配置

设置 `MulterModule` 异步选项而不是静态选项，请使用 `registerAsync()` 方法。与大多数动态模块一样，它支持多种异步配置技术。

一种技术是使用工厂函数：

```typescript
MulterModule.registerAsync({
  useFactory: () => ({
    dest: './upload',
  }),
});
```

与其他 [工厂供应商](/fundamentals/custom-providers#factory-providers-usefactory) 一样，工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖项。

```typescript
MulterModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    dest: configService.get<string>('MULTER_DEST'),
  }),
  inject: [ConfigService],
});
```

或者，您可以配置 `MulterModule` 使用类而不是工厂，如下所示：

```typescript
MulterModule.registerAsync({
  useClass: MulterConfigService,
});
```

上面的构造实例化 `MulterConfigService` 内部 `MulterModule` 并称之为 `createMulterOptions()` 方法获取 options 对象。为了让它发挥作用，`MulterConfigService` 必须实施 `MulterOptionsFactory` 接口：

```typescript
@Injectable()
class MulterConfigService implements MulterOptionsFactory {
  createMulterOptions(): MulterModuleOptions {
    return {
      dest: './upload',
    };
  }
}
```

如果要重用现有选项提供程序，而不是在 `MulterModule`，使用 `useExisting` 句法。

```typescript
MulterModule.registerAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});
```

你也可以通过 `extraProviders` 到 `registerAsync()` 方法。这些提供程序与模块的提供程序合并。

```typescript
MulterModule.registerAsync({
  imports: [ConfigModule],
  useClass: ConfigService,
  extraProviders: [MyAdditionalProvider],
});
```

当工厂函数或类构造函数需要额外的依赖项时，这非常有用。

#### 内存使用和存储

默认情况下，Multer 使用其内存存储引擎（`memoryStorage()`）：每个上传的文件都被完全读入内存，并作为 `Buffer` 在 `file.buffer` 在路由处理程序运行之前。这对于小文件（头像或 CSV 导入），但每次飞行中上传占用的内存与其大小一样多，因此大文件或许多并发上传会很快耗尽进程的内存。

> warning **Warning** 默认情况下，Multer 不限制上传文件的大小。将文件保存在内存中时，始终设置 `limits.fileSize`。

##### 文件大小限制

使用 `limits` 拒绝太大文件的选项。当超过限制时，Nest 回应一个 `413 File too large` 错误（对于 `fileSize`）或 `400 Bad Request`（对于其他限制，例如 `files`) 并且不调用路由处理程序。

```typescript
@Post('upload')
@UseInterceptors(
  FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  }),
)
uploadFile(@UploadedFile() file: Express.Multer.File) {
  console.log(file.size);
}
```

> info **Hint** 不像 `MaxFileSizeValidator`，在接收到整个文件后运行，`limits.fileSize` 使 Multer 停止存储文件，并在达到限制后立即拒绝请求，因此过大的文件永远不会完全到达内存或磁盘。参见 [Multer limits](https://github.com/expressjs/multer#limits) 查看完整的选项列表。

##### 字段名限制

字段名，例如 `user[address][city]` 或者 `tags[2]` 在请求主体中构建嵌套对象和数组。有两个限制：`fieldNestingDepth`，嵌套级数（`a[b][c]` 有 2），并且 `fieldArrayIndexLimit`，最高数组索引（`tags[2]` 使用索引 2）。超过其中任何一个的请求将被拒绝 `400 Bad Request` 回应。从 NestJSv12.1.4，它们分别默认为 32 和 1000（Multer 让它们不受限制），这样单个请求就无法构建任意深的主体或巨大的数组。将限制设置为 `Infinity` 把它抬起来。

##### 磁盘存储

无论文件大小如何，要保持内存使用恒定，请使用 `diskStorage()` 引擎将上传内容写入磁盘。然后，Multer 在每个文件到达时将其流式传输到磁盘，文件对象公开 `destination`、`filename` 和 `path`，而不是 `buffer`。

```typescript
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';

@Post('upload')
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  }),
)
uploadFile(@UploadedFile() file: Express.Multer.File) {
  console.log(file.path);
}
```

> info **Hint** 这个 `diskStorage()` 和 `memoryStorage()` 函数从 `multer` 包装。作为速记，pass`dest: './uploads'` 将文件以随机名称存储在磁盘上。如果你通过了 `destination` 函数而不是字符串，您负责创建目录。

要对模块中的每个文件拦截器应用相同的存储和限制，请将它们设置为 [默认选项](/http/file-upload#default-options) 或带有 [异步配置](/http/file-upload#async-configuration)。

一旦路由处理程序运行，存储在磁盘上的文件不会自动删除。删除它们（例如使用 `unlink()` 来自 `fs/promises`) 一旦您处理了它们，包括处理失败时。从 NestJSv12.1.4，如果管道拒绝请求（例如，因为 `ParseFilePipe` 验证失败），路由处理程序不运行，并且在发送错误响应后删除存储的文件。

##### 将文件发送到外部存储

若要将上传内容存储在 S3、Cloudflare R2 或其他外部存储中，而不将其缓冲在内存中或写入临时文件，请使用存储引擎，在每个文件到达时将其流式传输到目的地。[`@nestjs/storage`](/application/file-storage) 包提供了一个 `uploadToDisk()`，您可以将其作为 `FileInterceptor()` 的 `storage` 选项传递。见 [Upload product photos](/application/file-storage#upload-product-photos)。任何其他 Multer[存储引擎](https://github.com/expressjs/multer/blob/main/StorageEngine.md) 都以同样的方式工作。

> info **Hint** 在 `FastifyAdapter` 上，您也可以使用 `FileStreamInterceptor()` 在路由处理程序中以流的形式接收文件。参见 [Streaming uploads](/http/file-upload#streaming-uploads)。

#### Fastify

从 NestJSv12.1，运行在 `FastifyAdapter`（见 [Performance (Fastify)](/http/performance)）可以处理文件上传 API，由 [@fastify/multipart](https://github.com/fastify/fastify-multipart) 插件而不是 Multer。本章中描述的拦截器采用相同的参数和选项，以相同的方式填充请求，并以相同的错误响应失败，而 `@UploadedFile()`,`@UploadedFiles()`,`ParseFilePipe`,`ParseFilePipeBuilder` 内置的文件验证器工作不变。

首先，安装插件：

```bash
$ npm i @fastify/multipart
```

无需注册：`FastifyAdapter` 一旦你的应用程序使用了一个上传拦截器，就会自动注册插件（在不使用的应用程序中，它根本不会注册）。如果未安装软件包，应用程序将无法启动，并且会出现命名错误。

接下来，从 `@nestjs/platform-fastify/multipart` 而不是 `@nestjs/platform-express` 导入拦截器。控制器的其余部分保持不变，只是文件类型为 `UploadedMultipartFile`：

```typescript
import {
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileInterceptor,
  UploadedMultipartFile,
} from '@nestjs/platform-fastify/multipart';

@Controller('files')
export class FilesController {
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1000 }),
          new FileTypeValidator({ fileType: 'image/png' }),
        ],
      }),
    )
    file: UploadedMultipartFile,
  ) {
    console.log(file);
  }
}
```

> info **Hint** 所有导出自 `@nestjs/platform-fastify/multipart` 也是从 `@nestjs/platform-fastify` 包根。拦截器仅适用于 `FastifyAdapter`：与 `ExpressAdapter`，应用程序无法启动，因此请继续从 `@nestjs/platform-express` 那里。

下表映射了 ExpressAPI 对其 Fastify 对应方：

| `@nestjs/platform-express` | `@nestjs/platform-fastify/multipart` |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `FileInterceptor()`,`FilesInterceptor()`,`FileFieldsInterceptor()`,`AnyFilesInterceptor()`,`NoFilesInterceptor()` | 相同的名称、参数和选项 |
| `MulterOptions` | `MultipartOptions` |
| `MulterModule`,`MulterOptionsFactory`,`createMulterOptions()` | `MultipartModule`,`MultipartOptionsFactory`,`createMultipartOptions()` |
| `Express.Multer.File` | `UploadedMultipartFile` |
| `memoryStorage()` 和 `diskStorage()` 从 `multer` 包装 | `memoryStorage()` 和 `diskStorage()` |
| - | `FileStreamInterceptor()`（见 [Streaming uploads](/http/file-upload#streaming-uploads)） |

拦截器选项是 Multer 接受的选项： `dest`, `storage`, `limits` （对象，或接收请求并返回请求的函数）， `fileFilter`, `preservePath` 和 `defParamCharset`.上传的文件显示为 `req.file` 或者 `req.files` 和文本字段为 `req.body` 和穆特一模一样。 `UploadedMultipartFile` 形状与 `Express.Multer.File` 所以你不需要 `@types/multer` 包装。

`MultipartModule` 为导入它的模块的上传拦截器设置默认选项，就像 `MulterModule` 一样。它的 `registerAsync()` 方法接受 `useFactory`（与 `imports` 和 `inject` 一起）、`useClass` 和 `useExisting`。

```typescript
MultipartModule.register({
  dest: './upload',
});
```

##### 存储

与 Multer 一样，文件保存在内存中（在 `file.buffer` 中），除非您设置了 `dest` 或 `storage` 选项。`dest` 将每个文件以随机名称写入给定的文件夹，`diskStorage()` 函数允许您选择文件夹和文件名。在文件上设置磁盘存储集 `destination`、`filename` 和 `path`，而不是 `buffer`。

```typescript
import {
  diskStorage,
  FileInterceptor,
  UploadedMultipartFile,
} from '@nestjs/platform-fastify/multipart';

@Post('upload')
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, callback) =>
        callback(null, `${Date.now()}-${file.originalname}`),
    }),
  }),
)
uploadFile(@UploadedFile() file: UploadedMultipartFile) {
  console.log(file.path);
}
```

存储引擎遵循 Multer 的存储引擎合同（`_handleFile()` 和 `_removeFile()`），所以穆尔特自己的 `multer.diskStorage()` 和第三方 Multer 存储引擎可以传递为 `storage` 不变的。

##### 限制

`@fastify/multipart` 应用比 Multer 更严格的默认值。除非另有配置，否则最大文件大小（`fileSize`）是 Fastify`bodyLimit`（默认为 1 MiB）和最大部件数（`parts`）是 1000，而 Multer 两者都不限制。较大的文件将被拒绝 `413 File too large` 回应。您可以提高这些限制：

- 对于单个路由，使用 `limits` 拦截器选项
- 对于模块，使用 `MultipartModule.register()` 或者 `registerAsync()`
- 对于整个应用程序，使用 `multipart` 选择权 `FastifyAdapter`，它将选项传递给插件本身：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    multipart: { limits: { fileSize: 10 * 1024 * 1024 } },
  }),
);
```

在路由上设置的限制合并到 `MultipartModule` 一键接一键，并且两者都在应用程序范围内合并。唯一的例外是 `fieldNameSize` 拦截器不会从插件选项中读取这些选项——在路由上或使用 `MultipartModule`.

##### 插件注册

这个 `multipart` 选择权 `FastifyAdapter` 控制如何 `@fastify/multipart` 插件已注册：

- 未设置（默认值）：当使用上传拦截器时，适配器会注册插件，除非它已经注册
- 选项对象（`FastifyMultipartOptions`，例如，`limits`)：当应用程序初始化时，适配器用这些选项注册插件
- `true`：与上面相同，使用插件的默认选项
- `false`：适配器从不注册插件，对于自己注册插件或使用另一个库解析多部分请求的应用程序（上传拦截器仍然需要 `@fastify/multipart`，如果未注册，应用程序将无法启动）

将选项设置为 `true`（或传递选项对象）当上传拦截器在依赖注入系统外部实例化时，例如 `new (FileInterceptor('file'))()` 传给 `app.useGlobalInterceptors()`，因为它不会触发自动注册。当上传拦截器仅用于 [延迟加载模块](/fundamentals/lazy-loading-modules) 这些是在应用程序启动后加载的，因为插件在那时不能再注册。

如果您喜欢自己注册插件，请在 `app.init()` 之前或之后将其传递给 `app.register()`。适配器接管此注册，因此插件仅注册一次，您的选项优先于通过 `multipart` 选项传递的选项：

```typescript
import multipart from '@fastify/multipart';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
```

> warning **Warning** 注册 `@fastify/multipart` 直接在 Fastify 实例（`app.getHttpAdapter().getInstance().register(multipart)`），或传递动态 `import()` 它到 `app.register()`，只在之前有效 `app.init()`（哪个 `app.listen()` 呼唤你）。之后，适配器已经为您的上传拦截器注册了插件，并且 Fastify 失败 `FST_ERR_DEC_ALREADY_PRESENT` 错误。使用 `app.register(multipart)` 或者 `multipart` 选项，或将选项设置为 `false` 自己管理插件。

##### 流式上传

到目前为止描述的拦截器在路由处理程序运行之前存储每个文件（在内存中或磁盘上）。要在文件到达时对其进行处理，例如将大型上传文件通过管道传输到其最终目的地，请使用仅在 Fastify 上可用的 `FileStreamInterceptor()`。它获取保存文件的字段名称和可选的选项对象（与其他拦截器相同，除了 `dest` 和 `storage`），并将具有 `stream` 属性的文件交给路由处理程序，而不是 `buffer`：

```typescript
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  FileStreamInterceptor,
  MultipartFileStream,
} from '@nestjs/platform-fastify/multipart';

@Post('upload')
@UseInterceptors(
  FileStreamInterceptor('file', { limits: { fileSize: 1024 * 1024 * 1024 } }),
)
async uploadFile(@UploadedFile() file: MultipartFileStream, @Body() body) {
  const path = join('uploads', randomUUID());
  await pipeline(file.stream, createWriteStream(path));
  return { originalname: file.originalname, path, body };
}
```

由于文件从不缓冲，因此适用以下几条规则：

- 表单中的文件前面必须有文本字段。在它之前发送的那些在 `req.body`(`@Body()`)，而文件后面的部分没有被解析。
- 在给定的字段中，只接受一个文件。任何其他字段中的文件都会使请求失败 `400 Unexpected file field` 回应。
- 事先不知道文件大小，所以 `MaxFileSizeValidator` 不适用，幻数检查也不适用 `FileTypeValidator` （设置其 `skipMagicNumbersValidation` 选项 `true` 仅比较客户端提供的 mime 类型）。这个 `fileSize` 限制仍然被强制执行：一旦超过，流就会出错 `PayloadTooLargeException`.
- 在发送响应之前，路由处理程序留下的任何未读内容都会被丢弃，以便客户端可以完成上传。当处理程序返回一个 `StreamableFile`（这可能是上传本身），一旦响应被发送，上传的其余部分就会被丢弃。因此，一个处理程序使用 `StreamableFile` 除了上传之外的其他内容应该首先读取上传——否则，仍在通过未保持活动状态的连接上传的客户端可能会失败 `EPIPE` 或者 `ECONNRESET` 错误。

##### 与 Multer 的区别

除了 [默认限值](/http/file-upload#limits)，这个 Fastify 拦截器与 Multer 的区别如下：

- 的文本字段 `fieldSize` 字节被接受，而 Multer 拒绝它。
- 可能污染原型的字段名（`constructor`，或带有 `__proto__`,`constructor` 或者 `prototype` 段，例如 `user[constructor]`) 用 a 失败请求 `400 Invalid field name` 回应。莫特接受他们。
- 文本字段与 `Content-Type: application/json` 标头到达解析，且无效 JSON 请求失败 `400` 响应（a`@fastify/multipart` 特征）。格式错误的零件标题行将被忽略，而 Multer 使用 `400` 回应。
- `fileFilter` 函数和存储引擎接收 Fastify 请求而不是 Express 一。
- 这个 `attachFieldsToBody` 不支持插件选项，因为它会在拦截器运行之前消耗请求主体。
- 穆尔特的 `highWaterMark`,`fileHwm`,`defCharset` 和 `streamHandler` 拦截器不支持选项。

#### 例子

文件上传的工作示例可用 [在这里](https://github.com/nestjs/nest/tree/master/sample/29-file-upload)。

#### 流式文件

要从路由处理程序发送文件，可以将流管道传输到响应对象中：

```typescript
@Controller('file')
export class FileController {
  @Get()
  getFile(@Res() res: Response) {
    const file = createReadStream(join(process.cwd(), 'package.json'));
    file.pipe(res);
  }
}
```

通过这种方法，处理程序接管响应，因此后控制器 [截击机](/interceptors) 逻辑不再运行。相反，返回一个 `StreamableFile` 实例，以及 Nest 把它变成你的回应。

> info **Note** 流式文件适用于**HTTP 应用**。以下示例不适用于 GraphQL 或微服务应用。

##### 可流文件类

`StreamableFile` 保存要发送的内容。它的构造函数接受 `Readable` 流或 `Uint8Array`（包括 `Buffer`）。以下示例返回 `package.json` 文件，而不是 JSON 响应。相同的方法适用于图像、文档和任何其他文件类型：

```typescript
import { Controller, Get, StreamableFile } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

@Controller('file')
export class FileController {
  @Get()
  getFile(): StreamableFile {
    const file = createReadStream(join(process.cwd(), 'package.json'));
    return new StreamableFile(file);
  }
}
```

> info **Hint** 这个 `StreamableFile` 类是从 `@nestjs/common` 包装。

都不是 `ClassSerializerInterceptor` 也不是 `StandardSchemaSerializerInterceptor`[序列化](/application/serialization)`StreamableFile` 答案。

##### 响应头

默认情况下，`Content-Type` 响应头是 `application/octet-stream`。若要更改它并设置 `Content-Disposition` 和 `Content-Length` 头，请将 `type`、`disposition` 和 `length` 选项传递给 `StreamableFile` 构造函数：

```typescript
@Get()
getFile(): StreamableFile {
  const file = createReadStream(join(process.cwd(), 'package.json'));
  return new StreamableFile(file, {
    type: 'application/json',
    disposition: 'attachment; filename="package.json"',
  });
}
```

当内容是 `Uint8Array`,`length` 默认为其大小。对于流，设置 `length` 如果你事先知道尺寸的话，你自己。

带有静态值的标题也可以用 [`@Header()`](/controllers#response-headers) 装饰师：

```typescript
@Get()
@Header('Content-Type', 'application/json')
@Header('Content-Disposition', 'attachment; filename="package.json"')
getFile(): StreamableFile {
  const file = createReadStream(join(process.cwd(), 'package.json'));
  return new StreamableFile(file);
}
```

要在运行时计算头，请注入启用了 `passthrough` 的响应对象，以便 Nest 仍然发送返回的 `StreamableFile`：

```typescript
import type { Response } from 'express';

@Get()
getFile(@Res({ passthrough: true }) res: Response): StreamableFile {
  const file = createReadStream(join(process.cwd(), 'package.json'));
  res.set({
    'Content-Type': 'application/json',
    'Content-Disposition': 'attachment; filename="package.json"',
  });
  return new StreamableFile(file);
}
```

##### 流错误

与 Express 适配器，如果流在发送任何数据之前发出错误，则客户端接收 `400 Bad Request` 响应，并记录错误。从 NestJSv12.1.4，响应正文不再包含错误消息，其中可能包括文件的路径。如果数据已经发送，则响应结束。要自定义此行为，请将处理程序传递给 `setErrorHandler()` 方法：

```typescript
@Get()
getReport(): StreamableFile {
  const file = createReadStream(join(process.cwd(), 'report.pdf'));
  return new StreamableFile(file).setErrorHandler((err, res) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 404;
    res.send('Report not found');
  });
}
```

这个 `setErrorLogger()` 方法替换记录错误的函数：默认错误处理程序回答的错误，以及响应流在文件写入时发出的错误。

> info **Note** 错误处理程序和错误记录器应用于 Express 适配器。与 Fastify 适配器，流错误由 [异常层](/exception-filters)，因此默认情况下客户端会收到一个 `500 Internal Server Error` 回应。

##### 跨平台支持

Fastify 可以在没有 `stream.pipe(res)` 的情况下发送流，因此对于 Fastify，`StreamableFile` 类不是严格要求的。但是，Nest 在两个平台上都支持 `StreamableFile`，因此如果您在 Express 和 Fastify 之间切换，返回它的代码将保持不变。
