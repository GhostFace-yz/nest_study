# File storage

Source: https://docs.nestjs.com/application/file-storage

一家猫粮和用品的网上商店保存着三种文件。产品照片由工作人员上传并展示给大家。发票是 PDF 文件，只有付款的客户才能下载。仓库团队使用商店的移动应用程序拍摄产品，该应用程序上传了不需要通过订单的大照片 API。

在开发过程中，所有这些都应该从笔记本电脑上的文件夹中工作。在生产中，文件会转到 S3 或 Cloudflare R2，因为 API 在多个实例上运行，但没有一个实例具有持久的磁盘。存储和服务文件的代码应该是相同的。

`@nestjs/storage` 为每个实时位置文件指定一个名称、一个**磁盘**和一个 API 对于他们所有人： `put()`, `get()`, `list()`, `delete()`、公共 URL 和签名 URL。它发送一个本地磁盘，一个与 AWS S3 和 S3 兼容存储（Cloudflare R2、MinIO、Backblaze B2），以及用于测试的内存磁盘。它与 S3 通话 `fetch`，没有 AWS SDK，并且只取决于 `@nestjs/common` 和 `@nestjs/core`.

它不解析上传。穆尔特 Express 和 `@nestjs/platform-fastify/multipart` 在 Fastify 继续这样做，用 `FileInterceptor()` 像往常一样。这个包是文件的最终位置：它提供了一个存储引擎，将每个上传的文件直接传输到磁盘上。

在本教程中，您将：

- 为照片配置一个公共磁盘，为其他所有内容配置一个私有磁盘，
- 将照片上传到照片磁盘，在写入任何内容之前检查类型和大小，
- 私自存储发票并分发五分钟后过期的下载链接，
- 让手机 app 直接上传照片到存储，签名上传 URL，
- 仅通过配置从本地磁盘切换到 S3 或 R2，
- 针对内存磁盘测试所有这些。

#### 安装

要开始，请安装所需的依赖项：

```bash
$ npm i --save @nestjs/storage @nestjs/config
```

#### 配置磁盘

该应用程序需要两个磁盘。`photos` 保存产品照片，任何人都可以看到，所以它有一个公开的 URL。`private` 保存尚未检查的发票和上传，并且只能通过签名的 URL 访问。将公共文件和私有文件保存在单独的磁盘上（在生产中是单独的存储桶）意味着文件永远不会意外公开。

从配置开始，`@nestjs/config` 的 [自定义配置文件](/application/configuration#custom-configuration-files)。`STORAGE_DRIVER` 将选择本地磁盘或 S3[生产中](/application/file-storage#use-s3-or-r2-in-production)；在那之前，一切都是本地的：

```typescript
export default () => ({
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  storage: {
    // 'local' in development, 's3' in production (AWS S3, Cloudflare R2, MinIO...)
    driver: process.env.STORAGE_DRIVER ?? 'local',
    root: process.env.STORAGE_ROOT ?? 'storage',
    signingKey: process.env.STORAGE_SIGNING_KEY,
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'auto',
      photosBucket: process.env.S3_PHOTOS_BUCKET ?? 'store-photos',
      privateBucket: process.env.S3_PRIVATE_BUCKET ?? 'store-private',
      photosUrl: process.env.PHOTOS_CDN_URL,
    },
  },
});
```

磁盘是通过工厂函数从该配置构建的：

```typescript
import { ConfigService } from '@nestjs/config';
import { LocalDisk, type StorageModuleOptions } from '@nestjs/storage';

export function createStorageOptions(config: ConfigService): StorageModuleOptions {
  const appUrl = config.getOrThrow<string>('appUrl');
  const root = config.getOrThrow<string>('storage.root');
  return {
    default: 'private',
    disks: {
      // Product photos: public, served by the app in development
      photos: new LocalDisk({ root: `${root}/photos`, publicUrl: `${appUrl}/photos` }),
      // Invoices and uploads in progress: only reachable through signed URLs
      private: new LocalDisk({
        root: `${root}/private`,
        signedUrls: {
          baseUrl: `${appUrl}/files`,
          keys: [config.getOrThrow<string>('storage.signingKey')],
        },
      }),
    },
  };
}
```

`LocalDisk` 将文件保存在启动时创建的目录中。`publicUrl` 是可以公开获取文件的地方：照片磁盘的 `url(key)` 返回其下的 URL。在开发中，应用程序本身将服务于该路径（参见 [Upload product photos](/application/file-storage#upload-product-photos)）；在生产中，CDN 将。

本地目录不能像 S3 那样生成签名的 URL，所以私有磁盘自己签名：with `signedUrls`,它的 `signedUrl()` 返回 URL `baseUrl`，签名 HMAC-SHA256，应用程序验证并提供服务（参见 [Serve signed URLs in development](/application/file-storage#serve-signed-urls-in-development)). `keys` 获取一个或多个键。第一个符号，它们都是验证的，所以你可以旋转一个密钥，把新的放在第一位，一旦它签名的链接过期，就删除旧的。密钥必须至少有 32 个字符。

用 `forRootAsync()` 注册模块，这样工厂就可以读取 `ConfigService`：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@nestjs/storage';
import configuration from './config/configuration.js';
import { createStorageOptions } from './storage/storage.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createStorageOptions,
    }),
  ],
})
export class AppModule {}
```

`StorageModule` 是全球性的。服务通过以下三种方式之一注入磁盘：

| 注射 | 给你 |
| --- | --- |
| `private readonly files: StorageDisk` | 默认磁盘，此处 `private` |
| `@InjectDisk('photos') private readonly photos: StorageDisk` | 磁盘名为 `photos` |
| `private readonly storage: Storage` | 每个磁盘：`storage.disk('photos')`，对于在运行时选择磁盘的代码 |

配置错误会在启动时停止应用程序。没有 `STORAGE_SIGNING_KEY`,`getOrThrow()` 报告丢失的密钥；对于较短的签名密钥，错误表示签名密钥必须至少有 32 个字符。这同样适用于 `default` 它不命名磁盘，对于注入磁盘名称的类，配置不提供：

```text
PhotosService injects the disk "photos" (@InjectDisk('photos')), but StorageModule has no disk by that name. Configured disks: private.
```

#### 上传产品照片

照片可能是 JPEG,PNG 或高达 5 MiB 的 WebP 图像。规则由下面的上传端点和 [移动上传](/application/file-storage#upload-straight-to-storage-from-the-mobile-app) 再往下：

```typescript
/** What a product photo may be, wherever it is uploaded from. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MiB
/** Every photo gets a new key, so browsers and the CDN may cache it forever. */
export const PHOTO_CACHE_CONTROL = 'public, max-age=31536000, immutable';
```

上传端点使用 `FileInterceptor()` 来自 `@nestjs/platform-express` 就像任何上传一样。区别在于 `storage` 选项：`uploadToDisk()` 是一个 multer 存储引擎，它将文件流式传输到磁盘，而不是内存或临时文件夹：

```typescript
import { BadRequestException, Controller, Get, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectDisk, serveFile, StorageDisk, uploadToDisk, type StoredUpload } from '@nestjs/storage';
import type { Request, Response } from 'express';
import { MAX_PHOTO_SIZE, PHOTO_CACHE_CONTROL, PHOTO_TYPES } from './photo-rules.js';
import { PhotosService } from './photos.service.js';

@Controller()
export class PhotosController {
  constructor(
    private readonly photosService: PhotosService,
    @InjectDisk('photos') private readonly photos: StorageDisk,
  ) {}

  @Post('products/:id/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: uploadToDisk({ disk: 'photos', contentTypes: PHOTO_TYPES, cacheControl: PHOTO_CACHE_CONTROL }),
      limits: { fileSize: MAX_PHOTO_SIZE, files: 1 },
    }),
  )
  upload(@Param('id') id: string, @UploadedFile() file: StoredUpload | undefined) {
    if (!file) {
      throw new BadRequestException('Attach the image as the "photo" field');
    }
    return this.photosService.replace(id, file.key);
  }

  // Development only: in production a CDN serves the photos bucket at `publicUrl`
  @Get('photos/:file')
  serve(@Param('file') file: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return serveFile(this.photos, file, { req, res, disposition: 'inline' });
  }
}
```

当处理程序运行时，照片被存储。`uploadToDisk()` 在路上做了三件事：

- **它检查的是文件是什么，而不是客户端所说的是什么。**浏览器发送它根据文件名猜测的类型，而脚本可以发送任何内容，因此一个文件声明 `image/png` 很可能是一个 HTML 页面或 SVG 里面有剧本。引擎读取流的第一个字节，从它们的签名中检测类型（JPEG,PNG,GIF, 网络,AVIF,HEIC 和 PDF 是内置的；[其他格式](/application/file-storage#accept-csv-and-other-text-formats) 带一个你自己的检测器），并拒绝任何不在 `contentTypes` 用一个 `415` 在写入字节之前。存储的内容类型是检测到的，而不是客户端的。
- **它在不留下部分文件的情况下强制执行了大小限制。** multer 停止读取 `limits.fileSize`.然后，引擎拒绝提交它接收到的内容：请求失败 `413 File too large`，不存储任何内容，也不替换任何文件。
- **它选择了密钥。**默认情况下，随机的 UUID 和检测到的类型的扩展名，例如 `2f1c0d6e-….png`。唯一的密钥很重要：一个上传永远不会覆盖另一个，缓存的照片永远不会过时。

`@UploadedFile()` 返回一个 `StoredUpload`：multer 的常用字段（`fieldname`, `originalname`, `mimetype`, `size`) 更多 `key`, `disk`, `contentType` 和 `etag`. `mimetype` 仍然是客户的索赔；使用 `contentType`.

> info **Hint** `ParseFilePipe` 当流文件已经存储时，其验证器在拦截器之后运行，并且 `FileTypeValidator` 需要内存中的文件来检查其字节。和 `uploadToDisk()`，检查发动机中的类型和尺寸，如上所述。在 Fastify, 进口 `FileInterceptor` 来自 `@nestjs/platform-fastify/multipart` 和登记 `@fastify/multipart`; `uploadToDisk()` 两者都一样。

产品具有这种形状，应用程序的 `ProductsService` 具有 `findOne(id)`，它会抛出 `NotFoundException` 以获取未知的 id，并且 `setPhoto(id, key)`：

```typescript
export interface Product {
  id: string;
  name: string;
  /** Price in cents */
  price: number;
  /** Where the photo lives on the `photos` disk */
  photoKey?: string;
}
```

服务记录新照片，并删除之前的照片：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDisk, StorageDisk } from '@nestjs/storage';
import { ProductsService } from './products.service.js';

@Injectable()
export class PhotosService {
  constructor(
    private readonly productsService: ProductsService,
    @InjectDisk('photos') private readonly photos: StorageDisk,
  ) {}

  async replace(productId: string, key: string): Promise<{ id: string; photoUrl: string }> {
    let previous: string | undefined;
    try {
      previous = this.productsService.findOne(productId).photoKey;
      this.productsService.setPhoto(productId, key);
    } catch (error) {
      // The upload is already stored: don't leave it behind for a product that doesn't exist
      await this.photos.delete(key);
      throw error;
    }
    if (previous) {
      await this.photos.delete(previous);
    }
    return { id: productId, photoUrl: this.photos.url(key) };
  }
}
```

拦截器运行在处理程序之前，因此即使产品不存在，文件也会被存储。在这种情况下，服务会删除它，这样可以防止输入错误的 id 留下孤儿。`url(key)` 从磁盘的 `publicUrl` 构建公共 URL。

这个 `GET photos/:file` 路线服务于正在开发的照片。 `serveFile()` 从磁盘流式传输文件作为响应，使用 `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`，这个 `Cache-Control` 与文件一起存储（`private` 如果没有，则共享缓存永远不会保存可能属于一个用户的文件），并且 `X-Content-Type-Options: nosniff`，因此浏览器永远不会再次猜测类型。 `disposition: 'inline'` 让浏览器显示图像；对于可以在源中运行脚本的类型，例如 HTML 或者 SVG, `serveFile()` 发送 `Content-Disposition: attachment` 不论。它回答 `Range` 请求 `206`, `If-None-Match` 和 `304`，以及一个丢失的文件 `404`.

注册特征模块，并将 `ProductsModule` 导入 `AppModule`：

```typescript
import { Module } from '@nestjs/common';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';
import { ProductsService } from './products.service.js';

@Module({
  controllers: [PhotosController],
  providers: [ProductsService, PhotosService],
})
export class ProductsModule {}
```

##### 接受 CSV 和其他文本格式

内置检测通过格式开头的固定字节来识别格式。一个 CSV 文件没有这样的签名，所以 `contentTypes: ['text/csv']` 它自己拒绝一切 CSV 用一个 `415`.对于这样的格式，通过 `detectContentType`：接收文件开头并返回其类型的函数，或 `undefined` 当它不认识它的时候。

员工通过上传电子表格导出来更新价格。应用程序通过其标题行识别：

```typescript
/** The header row of a price list exported from the spreadsheet */
const PRICE_LIST_HEADER = 'sku,price';

/** Recognizes a price list by its first line. It doesn't check the rows. */
export function detectPriceList(bytes: Buffer): string | undefined {
  // Spreadsheet apps often start a UTF-8 export with a byte order mark: TextDecoder drops it
  const text = new TextDecoder().decode(bytes);
  const header = text.split(/\r?\n/, 1)[0];
  return header === PRICE_LIST_HEADER ? 'text/csv; charset=utf-8' : undefined;
}
```

上传端点允许 `text/csv` 并将函数传递给 `uploadToDisk()`。价目表将进入私有磁盘，因为还没有人检查过它们的行：

```typescript
@Post('products/price-lists')
@UseInterceptors(
  FileInterceptor('prices', {
    storage: uploadToDisk({
      disk: 'private',
      key: (file) => `price-lists/${randomUUID()}${file.extension}`,
      contentTypes: ['text/csv'],
      detectContentType: detectPriceList,
    }),
    limits: { fileSize: 1024 * 1024, files: 1 },
  }),
)
importPrices(@UploadedFile() file: StoredUpload | undefined) {
  if (!file) {
    throw new BadRequestException('Attach the price list as the "prices" field');
  }
  return this.priceListsService.import(file.key);
}
```

- **内置检测是第一位的。**该功能仅在文件不是内置格式时运行。一个 PNG 重命名为 `prices.csv` 仍然被检测为 PNG，并拒绝了。传递导出 `detectContentType()`helper 作为选项什么也不做，因为那是已经运行的检查。
- **它会看到文件的开头。** `bytes` 保存前 4 KiB，或者当文件较小时保存整个文件。要更改此设置 `contentTypeSampleBytes` 到 1 字节到 64 KiB 的整数（它需要 `detectContentType`).第二个论点有 `originalname` 和 `mimetype`，但它们是客户的索赔，所以根据字节来决定。
- **它返回的内容与 `contentTypes`.** 在没有参数的情况下比较类型： `text/csv` 列表中允许 `text/csv; charset=utf-8`.当函数返回时 `undefined`，或不在列表中的类型，上传将被拒绝 `415` 在写入字节之前。没有 `contentTypes`，任何返回的类型都被接受，无法识别的文件存储为 `application/octet-stream`.
- **返回的类型是存储和提供文件的类型。**包括文本格式的字符集。它还设置扩展名：`file.extension` 是 `.csv` 在 `key()` 上面，默认键也以它结尾。
- **它可能是异步的。**引擎在持有请求的同时等待承诺，因此它必须快速结算。返回 `undefined` 对于您不认识的文件，而不是抛出：一个错误会使上传失败，就像在请求中的其他地方一样，所以除了一个 `HttpException` 变成 `500` 而不是一个 `415`.返回除字符串或 `undefined`.

> warning **Warning** 该函数对文件的开头进行分类。它不验证文件：带有正确标题的价目表可以包含它后面的任何内容。`PriceListsService.import()` 必须读取整个文件，检查每一行，然后删除 `file.key` 当它拒绝列表时，就像在拦截器之后运行的任何检查一样。

#### 将发票保密

发票是在客户第一次要求时生成的，并存储在私有磁盘上。一个真实的应用程序呈现 PDF 具有图书馆或渲染服务；这个替身足以遵循流程：

```typescript
import type { Order } from '../orders/order.interface.js';

const usd = (cents: number) => (cents / 100).toFixed(2);

/** A stand-in for a real PDF renderer (pdfkit, a headless browser, a rendering service). */
export function renderInvoice(order: Order): Buffer {
  const lines = order.items.map((item) => `% ${item.quantity} x ${item.name}  ${usd(item.price)}`);
  return Buffer.from(
    ['%PDF-1.7', `% Invoice for ${order.id}`, ...lines, `% Total ${usd(order.total)} USD`, '%%EOF', ''].join('\n'),
  );
}
```

服务与应用程序的 `OrdersService`, 按什么顺序 `ord_1000` 已支付和 `ord_1001` 没有，存储一次发票，并返回一个签名链接：

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { StorageDisk } from '@nestjs/storage';
import { OrdersService } from '../orders/orders.service.js';
import { renderInvoice } from './render-invoice.js';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly ordersService: OrdersService,
    // No name: the default disk, `private`
    private readonly storageDisk: StorageDisk,
  ) {}

  async downloadUrl(orderId: string) {
    const order = this.ordersService.findOne(orderId);
    if (order.status === 'pending') {
      throw new ConflictException(`Order ${orderId} has not been paid yet`);
    }
    const key = `invoices/${order.id}.pdf`;
    if (!(await this.storageDisk.exists(key))) {
      await this.storageDisk.put(key, renderInvoice(order), {
        contentType: 'application/pdf',
        metadata: { orderId: order.id },
      });
    }
    const url = await this.storageDisk.signedUrl(key, {
      expiresIn: '5m',
      filename: `invoice-${order.id}.pdf`,
    });
    return { url };
  }
}
```

`put()` 需要一个 `Buffer` 一个字符串，一个 `Uint8Array`, 一个 Node 流，一个网络 `ReadableStream`，或任何异步可迭代字节。在每个磁盘上，写入都是原子的：读者看到的是旧文件或新文件，而不是一半，写入失败不会留下任何东西。`metadata` 在文件中存储您自己的字符串值；`stat()` 和 `get()` 还给他们。

对于 `LocalDisk`，失败的文件系统写入会删除临时文件并保留任何现有文件。如果写入没有进展，或者持久大小与写入的字节不同，`put()` 将用 `StorageError` 拒绝。

`signedUrl()` 返回一个无需任何其他凭据即可工作的链接，直到它过期。`expiresIn` 是持续时间：`'5m'`,`'1h'`，或毫秒，默认为 15 分钟，最多 7 天，S3 的限制。`filename` 设置浏览器保存文件的名称。

端点返回链接而不是文件，这允许网页或移动应用程序直接打开它：

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { InvoicesService } from '../invoices/invoices.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get(':id/invoice')
  invoice(@Param('id') id: string) {
    return this.invoicesService.downloadUrl(id);
  }
}
```

在 `OrdersModule` 中注册 `OrdersController`、`OrdersService` 和 `InvoicesService`。在真实的应用程序中，端点还会检查发票是否属于已登录的客户，例如使用 [授权](/security/authorization) 教程中的策略。链接本身不需要检查：持有它的人可以下载那个文件，直到它过期。

#### 正在开发中的服务签名 URL

使用本地磁盘，签名链接指向应用程序本身，`http://localhost:3000/files?key=…&expires=…&signature=…`，因此应用程序需要一个验证和服务它的路由：

```typescript
import { Controller, Get, Req, Res } from '@nestjs/common';
import { serveSignedUrl, StorageDisk } from '@nestjs/storage';
import type { Request, Response } from 'express';

/**
 * Serves the private disk's signed URLs when it is a local disk. With S3, the URLs point at
 * the bucket and this route answers 404.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly storageDisk: StorageDisk) {}

  @Get()
  download(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return serveSignedUrl(this.storageDisk, { req, res });
  }
}
```

`serveSignedUrl()` 检查签名、到期日和方法，然后回答如下 `serveFile()`，以及链接签名时使用的文件名。签名覆盖路由（`baseUrl`）、键、到期日和文件名，因此更改其中任何一个都是 `403 Invalid signed URL`，过期的链接是 `403 The signed URL has expired` 为一个磁盘的路由发出的链接会被另一个磁盘的路由拒绝，即使两个磁盘使用相同的签名密钥。下载管理器可以恢复大文件 `Range` 请求。

将控制器注册到 `FilesModule`，并将其导入 `AppModule` 以及其他功能：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@nestjs/storage';
import configuration from './config/configuration.js';
import { FilesModule } from './files/files.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ProductsModule } from './products/products.module.js';
import { createStorageOptions } from './storage/storage.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createStorageOptions,
    }),
    ProductsModule,
    OrdersModule,
    FilesModule,
  ],
})
export class AppModule {}
```

路线保留在生产中的应用程序中。在那里，私有磁盘是一个 S3 磁盘，其签名的 URL 指向桶，因此 `serveSignedUrl()` 没有任何服务，并响应 `404`。

#### 从移动应用程序直接上传到存储

仓库团队用移动应用程序拍摄产品。照片很大，而且手机通常连接速度很慢，因此通过 API 只要需要，就会保留连接和请求。相反，应用程序会询问 API 上传 URL，将照片直接发送到存储库，然后告诉 API 完成了：

1. `POST /products/:id/photo/uploads` 使用照片的类型和大小返回签名上传 URL。
2. 该应用程序将照片发送到带有 `PUT` 的 URL。
3. `PUT /products/:id/photo` 有了上传的键，它就成了产品的照片。

上传到私有磁盘，在 `incoming/`，因为 API 还没看呢。只有在检查之后 API 将其复制到照片磁盘：

```typescript
@Injectable()
export class PhotosService {
  constructor(
    private readonly productsService: ProductsService,
    @InjectDisk('photos') private readonly photos: StorageDisk,
    @InjectDisk('private') private readonly uploads: StorageDisk,
  ) {}

  // ...

  async createUpload(productId: string, contentType: string, size: number) {
    this.productsService.findOne(productId);
    if (!PHOTO_TYPES.includes(contentType)) {
      throw new UnsupportedMediaTypeException(`A photo must be one of: ${PHOTO_TYPES.join(', ')}`);
    }
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PHOTO_SIZE) {
      throw new BadRequestException(`size must be between 1 and ${MAX_PHOTO_SIZE} bytes`);
    }
    // Private until checked; the product id in the key ties the upload to this product
    const key = `incoming/${productId}/${randomUUID()}`;
    const upload = await this.uploads.signedUpload(key, { contentType, contentLength: size, expiresIn: '10m' });
    return { key, ...upload };
  }

  async completeUpload(productId: string, key: string) {
    this.productsService.findOne(productId);
    // Only keys this endpoint handed out for this product: never copy an arbitrary private
    // file (an invoice) to the public photos disk.
    const prefix = `incoming/${productId}/`;
    if (typeof key !== 'string' || !key.startsWith(prefix) || !/^[0-9a-f-]{36}$/.test(key.slice(prefix.length))) {
      throw new BadRequestException('Unknown upload');
    }
    const file = await this.uploads.stat(key).catch((error: unknown) => {
      if (error instanceof StorageFileNotFoundError) {
        throw new BadRequestException('Upload the file first');
      }
      throw error;
    });
    if (file.size > MAX_PHOTO_SIZE) {
      await this.uploads.delete(key);
      throw new PayloadTooLargeException('File too large');
    }
    // The client chose the Content-Type: check what the bytes are
    const head = await this.uploads.get(key, { range: { start: 0, end: 15 } });
    const type = detectContentType(await buffer(head.body));
    if (!type || !PHOTO_TYPES.includes(type)) {
      await this.uploads.delete(key);
      throw new UnsupportedMediaTypeException(`A photo must be one of: ${PHOTO_TYPES.join(', ')}`);
    }
    // Stream it from the private disk to the public one
    const photoKey = `${randomUUID()}${EXTENSIONS[type]}`;
    const { body } = await this.uploads.get(key);
    await this.photos.put(photoKey, body, {
      contentType: type,
      contentLength: file.size,
      cacheControl: PHOTO_CACHE_CONTROL,
    });
    await this.uploads.delete(key);
    return this.replace(productId, photoKey);
  }
}
```

`signedUpload()` 返回 URL，方法（`PUT`），客户端必须发送的标头，以及当 URL 过期。这个 URL 为声明的内容类型和大小签名：不同的 `Content-Type`，或另一长度的主体，被存储拒绝（`403`），所以应用程序不能发送 2GB 它宣布 2 的视频 MB 照片。

声明的类型仍然是客户端的声明。`completeUpload()` 因此，将上传视为不受信任：

- **钥匙必须是该产品发放的钥匙。**如果没有该支票，客户可以提交 `invoices/ord_1000.pdf` 并拥有 API 将某人的发票复制到公共照片磁盘。
- **再次检查尺寸**`stat()`，它返回没有文件主体的文件元数据。
- **通过只读取前 16 个字节来检查字节**，范围为 `get()` 并将它们传递给 `detectContentType()`，它承认 JPEG, PNG, GIF, 网络, AVIF, HEIC 和 PDF.

只有这样，照片才会从一个磁盘传输到另一个磁盘：`get()` 将主体作为 Node 流，以及 `put()` 接受它，因此文件永远不会完整地驻留在内存中。在 S3 上，这是通过 API 例如，这对照片来说很好；对于非常大的文件，您可以在它们所在的位置处理它们，例如使用作业。

控制器中的两条路由将请求传递到：

```typescript
// The mobile app asks for an upload URL, sends the photo there, then submits its key
@Post('products/:id/photo/uploads')
createUpload(@Param('id') id: string, @Body() body: { contentType: string; size: number }) {
  return this.photosService.createUpload(id, body.contentType, body.size);
}

@Put('products/:id/photo')
completeUpload(@Param('id') id: string, @Body('key') key: string) {
  return this.photosService.completeUpload(id, key);
}
```

使用本地磁盘，上传 URL 再次点击应用程序，所以 `FilesController` 收到 `PUT` 也。`receiveSignedUpload()` 执行 S3 对预签名的操作 URL：它检查签名、到期日、内容类型和长度，并将正文流式传输到磁盘：

```typescript
import { Controller, Get, Put, Req, Res } from '@nestjs/common';
import { receiveSignedUpload, serveSignedUrl, StorageDisk } from '@nestjs/storage';
import type { Request, Response } from 'express';

/**
 * Serves the private disk's signed URLs when it is a local disk. With S3, the URLs point at
 * the bucket and this route answers 404.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly storageDisk: StorageDisk) {}

  @Get()
  download(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return serveSignedUrl(this.storageDisk, { req, res });
  }

  @Put()
  upload(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return receiveSignedUpload(this.storageDisk, { req, res });
  }
}
```

> info **Hint** 在 Fastify 上，上传的主体必须未读到达处理程序。Fastify 默认情况下只解析 JSON 和纯文本，用 `415` 回答其他内容类型，因此注册一个包罗万象的解析器，只留下正文：`app.getHttpAdapter().getInstance().addContentTypeParser('*', (req, payload, done) => done(null))`。

从未完成的上传保留在 `incoming/` 下。在 S3 上，生命周期规则会在一天后删除它们（参见生产清单）。

#### 在生产中使用 S3 或 R2

在生产中，两个磁盘都变成了 S3 磁盘。本地磁盘不能在那里服务：当任务被替换（部署、扩展、失败节点）时，容器的文件系统被丢弃，带走文件，其他实例无法读取它们。只有工厂变了；每个服务、控制器和签名 URL 继续工作：

```typescript
import { ConfigService } from '@nestjs/config';
import { LocalDisk, S3Disk, type StorageModuleOptions } from '@nestjs/storage';

export function createStorageOptions(config: ConfigService): StorageModuleOptions {
  if (config.get('storage.driver') === 's3') {
    const s3 = {
      endpoint: config.get<string>('storage.s3.endpoint'),
      region: config.getOrThrow<string>('storage.s3.region'),
    };
    return {
      default: 'private',
      disks: {
        photos: new S3Disk({
          ...s3,
          bucket: config.getOrThrow<string>('storage.s3.photosBucket'),
          publicUrl: config.getOrThrow<string>('storage.s3.photosUrl'),
        }),
        private: new S3Disk({
          ...s3,
          bucket: config.getOrThrow<string>('storage.s3.privateBucket'),
        }),
      },
    };
  }

  // ... the local disks from before
}
```

`S3Disk` 从标准读取凭据 `AWS_ACCESS_KEY_ID`,`AWS_SECRET_ACCESS_KEY` 和 `AWS_SESSION_TOKEN` 变量，除非通过 `credentials` 对象或返回它们的函数（在每次请求之前调用，用于旋转的凭据）。没有凭据，应用程序无法启动。同一类别涵盖多种服务：

| 服务 | 设置 |
| --- | --- |
| AWSS3 | `region`，例如 `eu-central-1`。编号 `endpoint` |
| 云闪 R2 | `endpoint: 'https://<account id>.r2.cloudflarestorage.com'`,`region: 'auto'` |
| 米尼奥 | `endpoint: 'http://minio:9000'`,`forcePathStyle: true` |
| Backblaze B2 | `endpoint: 'https://s3.<region>.backblazeb2.com'`,`region` |
| 谷歌云存储 | `endpoint: 'https://storage.googleapis.com'`,HMAC 密钥作为凭据，`batchDelete: false` |

对于 S3，`signedUrl()` 和 `signedUpload()` 返回预签名的 URL，用凭据签名，桶会自行验证：应用程序的 `/files` 路线不涉及。`url()` 返回 URL`publicUrl`，通常是 CDN 或者 R2 在照片桶前面的公共桶域。

也将流上传到 S3。一个请求中高达 8 MiB 的文件会增加；一个较长的，或者一个长度未知的流，作为多部分上传，一次四个 8 MiB 的部分，如果有任何失败，就会中止，所以失败的上传永远不会成为一个文件。因网络错误、超时、节流而失败的请求（`429`,`SlowDown`）或一个 `5xx` 在后退的情况下重试，总共最多 3 次。`multipart`,`retry` 和 `timeout` 每个磁盘调整这个。

> info **Hint** 每个 S3 请求都使用签名版本 4 进行签名，在 `node:crypto` 上实现。它是根据 AWS 签名版本 4 测试套件和 Amazon S3API 参考中的示例进行检查的，因此没有 AWSSDK 要安装。

#### 试试

在包含 `kibble.png`、`scratching-post.jpg` 和 `notes.txt` 的目录中使用签名密钥启动应用程序：

```bash
$ export STORAGE_SIGNING_KEY=$(openssl rand -hex 32)
$ npm run start
```

上传一张照片。然后尝试一个声明为图像的文本文件，应用程序拒绝它而不存储它：

```bash
$ curl -F photo=@kibble.png localhost:3000/products/salmon-kibble-2kg/photo
{"id":"salmon-kibble-2kg","photoUrl":"http://localhost:3000/photos/b098be38-74b4-427a-8239-0ab3dc3a31d2.png"}

$ curl -F 'photo=@notes.txt;type=image/png' localhost:3000/products/salmon-kibble-2kg/photo
{"message":"File type not allowed. Allowed types: image/jpeg, image/png, image/webp","error":"Unsupported Media Type","statusCode":415}
```

获取照片的标题：

```bash
$ PHOTO=$(curl -s -F photo=@kibble.png localhost:3000/products/salmon-kibble-2kg/photo | jq -r .photoUrl)
$ curl -sI "$PHOTO" | grep -iE '^(content-|cache-control|x-content)'
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=31536000, immutable
Content-Type: image/png
Content-Disposition: inline; filename="fc54756b-b451-41a8-82c9-2b979f99849a.png"
Content-Length: 70
```

获取发票的签名链接，下载该链接，并为另一个订单尝试相同的链接：

```bash
$ curl localhost:3000/orders/ord_1000/invoice
{"url":"http://localhost:3000/files?key=invoices%2Ford_1000.pdf&expires=1790319338&disposition=attachment%3B+filename%3D%22invoice-ord_1000.pdf%22&signature=w1O_KuRThM1epUeyqpsbXNGfECkQ9605tZzNjVFMsy8"}

$ INVOICE=$(curl -s localhost:3000/orders/ord_1000/invoice | jq -r .url)
$ curl -sOJ "$INVOICE"
$ head -c 8 invoice-ord_1000.pdf
%PDF-1.7

$ curl "${INVOICE/ord_1000/ord_1001}"
{"message":"Invalid signed URL","error":"Forbidden","statusCode":403}
```

最后，像移动应用程序一样上传照片。请求上传 URL，将文件发送到那里，并提交其密钥：

```bash
$ curl -s localhost:3000/products/sisal-scratching-post/photo/uploads --json "{\"contentType\":\"image/jpeg\",\"size\":$(wc -c < scratching-post.jpg)}" | tee upload.json | jq
{
  "key": "incoming/sisal-scratching-post/7fe80da3-4710-4940-a904-4a1756280440",
  "url": "http://localhost:3000/files?key=incoming%2Fsisal-scratching-post%2F7fe80da3-4710-4940-a904-4a1756280440&expires=1790319638&method=PUT&type=image%2Fjpeg&length=2011&signature=vx-LwzqLUUeTQevHKTDjguRTM3c_FWOjCbik1Uo6Ojg",
  "method": "PUT",
  "headers": {
    "content-type": "image/jpeg"
  },
  "expiresAt": "2026-09-25T07:00:38.736Z"
}

$ curl -T scratching-post.jpg -H 'content-type: image/jpeg' "$(jq -r .url upload.json)"
{"key":"incoming/sisal-scratching-post/7fe80da3-4710-4940-a904-4a1756280440","size":2011,"contentType":"image/jpeg","etag":"\"7db-65c4922577c58\""}

$ curl -X PUT localhost:3000/products/sisal-scratching-post/photo --json "$(jq -c '{key}' upload.json)"
{"id":"sisal-scratching-post","photoUrl":"http://localhost:3000/photos/5329e44d-7a45-49a5-96eb-6ea0016da7eb.jpg"}
```

文件在 `storage/photos` 和 `storage/private`，作为普通文件：`storage/private/invoices/ord_1000.pdf` 是发票。这个 `.nest-storage` 每个文件夹中的文件夹在写入期间保存临时文件，以及文件名不能携带的元数据。

#### 检测

`InMemoryDisk` 将文件保存在内存中，其行为与其他磁盘相同：相同的密钥规则、范围、列表、元数据和签名 URL。与 S3 一样，它可以同时保存 `a` 和 `a/b`，本地磁盘用 `StorageKeyConflictError` 拒绝保存。在端到端测试中，通过覆盖 `STORAGE_MODULE_OPTIONS` 替换磁盘，工厂将返回以下选项：

```typescript
import type { INestApplication } from '@nestjs/common';
import { InMemoryDisk, STORAGE_MODULE_OPTIONS } from '@nestjs/storage';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('Product photos', () => {
  let app: INestApplication;
  const photos = new InMemoryDisk({ publicUrl: 'https://photos.example.com' });
  const files = new InMemoryDisk({
    signedUrls: { baseUrl: 'https://api.example.com/files', keys: ['test-signing-key-0123456789abcdef'] },
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_MODULE_OPTIONS)
      .useValue({ default: 'private', disks: { photos, private: files } })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => photos.clear());

  it('stores the photo and returns its public URL', async () => {
    const res = await request(app.getHttpServer())
      .post('/products/salmon-kibble-2kg/photo')
      .attach('photo', PNG, 'photo.png')
      .expect(201);

    const [key] = photos.keys();
    expect(res.body.photoUrl).toBe(`https://photos.example.com/${key}`);
    expect(await photos.getBuffer(key)).toEqual(PNG);
  });

  it('refuses a file that is not an image', async () => {
    await request(app.getHttpServer())
      .post('/products/salmon-kibble-2kg/photo')
      .attach('photo', Buffer.from('<html></html>'), 'photo.png')
      .expect(415);

    expect(photos.keys()).toEqual([]);
  });
});
```

被覆盖的选项替换了工厂的结果，因此测试不需要签名密钥，也不涉及文件系统。`keys()` 列出磁盘保存的内容和 `clear()` 清空它。上传经过 multer 和 `uploadToDisk()` 如在生产中；只有字节着陆的位置不同。

要测试到达真实文件系统的内容，请使用 `LocalDisk` 而是在一个临时目录上。对于特定于 S3 的行为，例如预签名 URL 或多部分上传，请指向 `S3Disk` 在 MinIO 或本地运行的其他 S3 兼容服务器上。

#### 生产检查表

- **将公共文件和私有文件保存在单独的存储桶中。**将照片存储桶授予公共读取权限，或者在其前面放置一个 CDN，并将 `publicUrl` 指向 CDN。保持私有桶完全私有：发票和上传只能通过签名的 URL 访问。没有每个文件的公共标志，因为新的 S3 存储桶禁用了对象 ACL，一个文件上的标志很容易出错。
- **过期放弃的上传。**向私有存储桶添加生命周期规则，删除下面的对象 `incoming/` 一天后，以及一天后中止不完整的多部分上传的一个。
- **允许从浏览器直接上传 CORS.**移动应用程序不需要它，但一个网页会发送一个 `PUT` 到预先签名的 URL 是否：允许 `PUT` 从站点的起源开始，使用 `Content-Type` 头球。
- **只授予应用程序使用的内容。** IAM 政策 `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` 和 `s3:ListBucket` 两桶就够了。保持 `s3:ListBucket`：如果没有它，S3 将响应丢失文件的请求 `403` 而不是 `404`，和 `exists()` 失败而不是返回 `false`.对于短期凭证，通过 a `credentials` 返回它们的函数。
- **静止时加密。**默认情况下，S3 会加密新对象；对于一个 KMS 您自己的钥匙，设置 `serverSideEncryption: 'aws:kms'` 和 `kmsKeyId` 在磁盘上。R2 总是加密。
- **保持链接的短时间。**对于一个用户立即点击的链接来说，五分钟是足够的。签名 URL 不可撤销：它一直有效，直到过期（或者，在 S3 上，直到签署它的凭据过期或失去访问权限），所以它泄露给谁都可以使用它，直到那时。
- **为本地磁盘（开发和 CI）设置每个环境的签名密钥**，从一个秘密开始，至少有 32 个字符，并通过首先将新密钥放在 `keys` 中来旋转它。
- **不要在生产中使用本地磁盘。**写入容器磁盘的文件在任务被替换时消失，其他实例无法读取这些文件。使用 S3、R2 或另一个对象存储（参见 [Use S3 or R2 in production](/application/file-storage#use-s3-or-r2-in-production)）；本地磁盘用于开发和测试，当模块找到带有 `NODE_ENV=production` 的磁盘时，它会在启动时记录一个警告。
- **谨慎对待用户输入生成的每个密钥。**每个磁盘上的密钥都经过验证（否 `..`，没有绝对路径，没有控制字符），因此用户输入无法转义磁盘，但它仍然可以命名磁盘上的任何文件。从您控制的 id 构建密钥，就像上面的上传端点所做的那样。

#### 参考

##### 模块选项

`StorageModule.forRoot()` 接受这些选项，`forRootAsync()` 工厂返回 `default` 和磁盘实例。磁盘类 `imports` 和 `isGlobal` 位于 `useFactory`、`useClass` 或 `useExisting` 旁边。选项以 `STORAGE_MODULE_OPTIONS` 的形式提供。

| 选择 | 默认的 | 描述 |
| --- | --- | --- |
| `disks` | 无（必填） | 磁盘名称：实例，或 `StorageDisk` 类 Nest 实例化，可以注入。看 [Configure the disks](/application/file-storage#configure-the-disks). |
| `default` | 唯一的磁盘 | 磁盘 `StorageDisk` 和 `storage.disk()` 下定决心。需要多个磁盘。 |
| `imports` | 没有一个 | 导出磁盘类注入的模块。 |
| `isGlobal` | `true` | 寄存器 `Storage`,`StorageDisk` 以及全局命名的磁盘。 |

##### 磁盘方法

每个磁盘都有相同的方法、关键规则和错误。密钥是相对的，`/`-至多 1024 的分离路径 UTF-8 字节，不空，`.` 或者 `..` 段、反斜杠或控制字符。

| 方法 | 描述 |
| --- | --- |
| `put(key, body, options)` | 原子地写入文件。选项：`contentType`（默认情况下从扩展名推断）、`cacheControl`、`contentDisposition`、`metadata`（字符串值，共 2 个 KB）、`contentLength`、`signal`。解析为 `key`、`size`、`contentType` 和 `etag`。 |
| `get(key, options)` | 文件的元数据及其作为 Node 流的 `body`。`range` 取 `start` 和一个包含的 `end`，或 `suffix`。 |
| `getBuffer(key)`,`getText(key)` | 整个文件。 |
| `stat(key)`,`exists(key)` | 没有主体的元数据，或者文件是否存在。 |
| `delete(keys)` | 一个键或一个数组。丢失的密钥将被忽略。 |
| `list(options)`,`listAll(options)` | `key`、`size`、`lastModified` 和 `etag` 按 UTF-8 字节顺序排列，带有 `cursor`。选项：`prefix`、`cursor`、`limit`（默认最多 1000）。`listAll()` 迭代每一页。 |
| `copy(from, to)`,`move(from, to)` | 在磁盘内，包括元数据。 |
| `url(key)` | `publicUrl` 下的公共 URL。没有一个投掷。 |
| `signedUrl(key, options)` | 下载链接。选项：`expiresIn`（默认 15 分钟，最多 7 天），`filename`，`disposition`。参见 [Keep invoices private](/application/file-storage#keep-invoices-private)。 |
| `signedUpload(key, options)` | `url`、`method`（`PUT`）、`headers` 和 `expiresAt` 用于直接上传。选项：`contentType`（必填）、`contentLength`、`expiresIn`。参见 [Upload straight to storage from the mobile app](/application/file-storage#upload-straight-to-storage-from-the-mobile-app)。 |

##### 磁盘

| 磁盘 | 选项 |
| --- | --- |
| `LocalDisk` | `root`（必填，在启动时创建），`publicUrl`，`signedUrls`。用于开发和测试。`path(key)` 返回文件的绝对路径。 |
| `S3Disk` | `bucket`（必填）、`region`、`endpoint`、`forcePathStyle`、`credentials`、`prefix`、`serverSideEncryption`、`kmsKeyId`、`multipart`、`retry`、`timeout`、`batchDelete`、`fetch`、`publicUrl`。参见 [Use S3 or R2 in production](/application/file-storage#use-s3-or-r2-in-production)。 |
| `InMemoryDisk` | `publicUrl`,`signedUrls`.对于测试，使用 `keys()` 和 `clear()`。参见 [Testing](/application/file-storage#testing)。 |

`signedUrls` 获取 `baseUrl`（为 URL 提供服务的路由）和 `keys`（至少 32 个字符的签名密钥）。第一个钥匙标志，他们都验证了。`S3Disk` 默认值：`region` 从 `AWS_REGION` 开始，然后 `AWS_DEFAULT_REGION`，然后 `us-east-1`；`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY` 和 `AWS_SESSION_TOKEN` 的凭证；`multipart` 具有 8 MiB 的 `partSize` 和 4 的 `concurrency`；`retry: 3`，回退从 100 毫秒加倍到 20 秒；没有 `timeout`；`batchDelete: true`.

##### HTTP 助手

| 帮手 | 选项 | 描述 |
| --- | --- | --- |
| `uploadToDisk(options)` | `disk`（名称或实例，默认为默认磁盘），`contentTypes`,`detectContentType`,`contentTypeSampleBytes`（默认为 4 KiB，从 1 字节到 64 KiB，需要 `detectContentType`),`cacheControl`,`key`,`metadata` | `FileInterceptor()` 的存储引擎。`key` 和 `metadata` 是文件和请求的函数。`detectContentType(bytes, file)` 返回内置检测无法识别的文件类型，或 `undefined`，并可能返回承诺。参见 [Upload product photos](/application/file-storage#upload-product-photos) 和 [Accept CSV and other text formats](/application/file-storage#accept-csv-and-other-text-formats)。 |
| `serveFile(disk, key, options)` | `res`（必填），`req`,`disposition`（默认 `attachment`),`filename`,`cacheControl` | 流式传输文件作为响应，当给定 `req` 时，支持 `Range` 和 `If-None-Match`。 |
| `serveSignedUrl(disk, options)` | `req`,`res`,`cacheControl` | 验证并提供应用程序服务的签名下载 URL。参见 [Serve signed URLs in development](/application/file-storage#serve-signed-urls-in-development)。 |
| `receiveSignedUpload(disk, options)` | `req`,`res`,`maxSize` | 验证应用程序提供的签名上传 URL，并将 `PUT` 正文流式传输到磁盘。`maxSize` 限制没有 `contentLength` 签名的上传。 |
| `detectContentType(bytes)` | 没有一个 | 文件的前 16 个字节的类型： JPEG, PNG, GIF, 网络, AVIF, HEIC 或者 PDF,否则 `undefined`.是内置的检测 `uploadToDisk()` 跑步，对 `detectContentType` 选择。 |

##### 错误

每个错误都会扩展 `StorageError`.在外面 HTTP 帮手，他们不是 `HttpException`s，所以在你自己的代码中映射它们，它们对你有意义 API.

| 错误 | `status` | 何时 |
| --- | --- | --- |
| `StorageFileNotFoundError` | 404 | 缺失密钥的 `get()`、`stat()`、`copy()` 或 `move()`。有 `key`。 |
| `StorageInvalidKeyError` | 400 | 打破密钥规则的密钥。有 `reason`。 |
| `StorageBodyLengthError` | 400 | 主体不匹配 `contentLength`。有 `expected` 和 `received`。 |
| `StorageRangeNotSatisfiableError` | 416 | 从文件末尾开始的范围。有 `size`。 |
| `StorageKeyConflictError` | 409 | 本地磁盘不能同时保存 `a` 和 `a/b`。 |
| `StorageSignedUrlError` | 403 | 签名的 URL 验证失败。`reason` 是 `missing`、`invalid`、`expired` 或 `method`。 |
| `StorageServiceError` | 没有一个 | 对象存储被拒绝或失败。具有 `code`（如 `AccessDenied` 或 `SlowDown`）、`upstreamStatus`、`requestId` 和 `operation`。 |
