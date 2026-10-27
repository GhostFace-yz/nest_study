# Internationalization

Source: https://docs.nestjs.com/application/i18n

一家销售猫粮和用品的在线商店向美国、波兰和德国的客户销售，其订单 API 应该用他们自己的语言回答他们每个人。在本教程中，您将翻译订单确认（使用正确的波兰语复数）、错误消息、验证消息（从 `class-validator`，或来自 Zod）和 GraphQL 菲尔兹。您还将格式化每个区域的价格和日期。

包对每个请求解析一次区域设置，并将其保存在 `AsyncLocalStorage` 存储。服务、例外、管道和 GraphQL 字段解析器在不访问请求对象的情况下进行翻译，并且每个提供程序都是单例。它的作用是一样的 Express 和 Fastify 以及微服务和 WebSocket 网关。

#### 安装

本教程扩展了商店的订单 API，以英语、波兰语和德语为客户提供服务。订单是存储在内存中的简单对象。示例种子订单#1001：两袋鲑鱼粗粮和三包结块垃圾，总共 97.95 美元。它于 2026 年 9 月 14 日放置，此后一直发货。

安装软件包：

```bash
$ npm i --save @nestjs/i18n
```

第一部分从 JSON 文件派生类型，因此在 `tsconfig.json` 中启用 `resolveJsonModule`。

#### 添加目录并注册模块

翻译生活在 JSON 文件，每个区域设置一个目录。每个文件都成为一个以该文件命名的命名空间，因此 `notFound` 留言 `orders.json` 有钥匙 `orders.notFound`.

```text
src
├── i18n
│   ├── de
│   │   ├── orders.json
│   │   └── validation.json
│   ├── en
│   │   ├── orders.json
│   │   └── validation.json
│   ├── pl
│   │   ├── orders.json
│   │   └── validation.json
│   └── translations.ts
├── orders
└── app.module.ts
```

这是订单的英文目录。大括号中的单词是占位符，由翻译时传递的参数填充。`items` 是复数消息，[Translate order confirmations](/application/i18n#translate-order-confirmations) 解释道。

```json
{
  "items": {
    "one": "{count} item",
    "other": "{count} items"
  },
  "confirmed": "Thank you! Order #{id} is confirmed: {items}.",
  "notFound": "Order #{id} was not found.",
  "invalidId": "The order number must be a whole number.",
  "unknownProduct": "Product {id} is not in our catalog.",
  "tooManyItems": {
    "one": "{path} must not exceed {count} item per product",
    "other": "{path} must not exceed {count} items per product"
  },
  "unsupportedCountry": "We only ship to the United States, Poland and Germany.",
  "status": {
    "pending": "Awaiting payment",
    "paid": "Paid",
    "shipped": "Shipped"
  }
}
```

TypeScript 编译器不会将 JSON 文件复制到 `dist`。将它们添加到 `nest-cli.json` 中的 [资产](/cli/monorepo#assets) 中：

```json
{
  "compilerOptions": {
    "assets": ["i18n/**/*.json"],
    "watchAssets": true
  }
}
```

立即注册 `I18nModule` 在根模块中：

```typescript
import { Module } from '@nestjs/common';
import {
  AcceptLanguageLocaleResolver,
  HeaderLocaleResolver,
  I18nModule,
  JsonI18nLoader,
  QueryLocaleResolver,
} from '@nestjs/i18n';
import { join } from 'node:path';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      supportedLocales: ['en', 'pl', 'de'],
      fallbacks: { 'de-AT': 'de' },
      loader: new JsonI18nLoader({
        path: join(import.meta.dirname, 'i18n'),
      }),
      resolvers: [
        new QueryLocaleResolver('lang'),
        new HeaderLocaleResolver('x-lang'),
        new AcceptLanguageLocaleResolver(),
      ],
    }),
    OrdersModule,
  ],
})
export class AppModule {}
```

该模块是全局的，它在每条路由上安装一个中间件，在防护、拦截器、管道和处理程序运行之前解析区域设置。分辨率是这样的：

- **解析器按顺序运行。**每个解析器返回一个或多个候选，第一个与支持的区域设置匹配的候选获胜。这里，`?lang=pl` 击败 `x-lang` 头，后者击败 `Accept-Language`。
- **`Accept-Language` 已正确解析。** 语言按其 `q` 值排序，不支持的语言将被跳过，因此 `fr-CH, fr;q=0.9, de;q=0.8` 解析为 `de`。
- **区域与其基础语言相匹配。** `pl-PL` 解析为 `pl`。无需配置。
- **`fallbacks` 将区域保留为自己的区域设置。** `de-AT` 决心 `de-AT` 它的信息来自 `de`.环境很重要 [格式化价格和日期](/application/i18n#format-prices-and-dates)：奥地利客户获得奥地利号码格式。未列出的区域，例如 `de-CH`，决心简单 `de`.
- **没有匹配的内容，或者根本没有请求**（cron 作业，队列使用者）：`defaultLocale` 被使用。

`CookieLocaleResolver` 而是读取一个 cookie，`lang` 默认情况下，对于记住访问者选择的语言的站点。[Use the customer's saved language](/application/i18n#use-the-customers-saved-language) 添加您自己的解析器。

每个响应都说明了它是在哪个区域设置中编写的。中间件集 `Content-Language` 到解析的区域设置，并添加解析器读取到的头 `Vary`,这里 `Vary: x-lang, Accept-Language`，因此缓存每种语言保留一个副本。设置 `responseHeaders: false` 关掉这个。

`supportedLocales` 是可选的，默认为加载程序找到的目录。固定它意味着一个杂散的目录永远不会成为一个区域设置。

最后，给你的钥匙一个类型。英文目录是真理的来源，仅类型导入在编译时读取其形状，而无需加载文件。这个 `declare module` 块寄存器与包一起形成形状：

```typescript
import type orders from './en/orders.json';
import type validation from './en/validation.json';

export interface Translations {
  orders: typeof orders;
  validation: typeof validation;
}

declare module '@nestjs/i18n' {
  interface I18nTypes {
    translations: Translations;
  }
}
```

从现在开始，`I18nService` 以及用于本地化异常和验证消息的助手函数，`t()`,`i18nValidationMessage()` 和 `i18nIssueMessage()`，只接受英文目录中存在的密钥。错别字，例如 `orders.notFund` 编译失败，编译失败 `orders.status`，因为它是一个命名空间而不是消息。从另一种形状的目录（如图书馆的目录）转换的提供程序注入 `I18nService<OtherTranslations>`，它根据 `OtherTranslations` 反而。

#### 翻译订单确认

当客户下订单时，API 会通过一条包含商品数量的消息来确认订单。将 `I18nService` 注入 `OrdersService` 并调用 `t()`：

```typescript
@Injectable()
export class OrdersService {
  // ...
  constructor(private readonly i18nService: I18nService) {}

  create(userId: number, dto: CreateOrderDto) {
    const order: Order = {
      id: this.nextId++,
      userId,
      items: dto.items,
      total: this.priceOf(dto.items),
      status: 'pending',
      createdAt: new Date(),
    };
    this.orders.push(order);

    return {
      id: order.id,
      message: this.i18nService.t('orders.confirmed', {
        args: { id: order.id, items: this.describeItems(order) },
      }),
    };
  }

  describeItems(order: Order): string {
    const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
    return this.i18nService.t('orders.items', { args: { count } });
  }
  // ...
}
```

您不会将区域设置传递给 `t()`.它读取当前请求解析的请求，即使 `OrdersService` 是一个从未看到请求的单例。设置 `locale` 选项仅覆盖它，例如，当后台作业以客户配置文件中保存的语言向客户发送电子邮件时。该选项的匹配方式与请求区域设置相同： `pl-PL` 变成 `pl`，而您不支持的区域设置将成为默认区域设置，因此过时的配置文件值不会中断作业。

控制器中没有任何特定于区域设置的内容：

```typescript
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    // The Authentication tutorial replaces the fixed customer with the signed-in user.
    return this.ordersService.create(1, dto);
  }
}
```

英语和德语有两种复数形式。波兰有四个，一个数字取哪一个取决于它的最后一位数字。复数消息是由复数类别锁定的对象：

```json
{
  "items": {
    "one": "{count} produkt",
    "few": "{count} produkty",
    "many": "{count} produktów",
    "other": "{count} produktu"
  },
  "confirmed": "Dziękujemy! Zamówienie #{id} zostało przyjęte: {items}.",
  "notFound": "Nie znaleziono zamówienia #{id}.",
  "invalidId": "Numer zamówienia musi być liczbą całkowitą.",
  "unknownProduct": "Produktu {id} nie ma w naszym katalogu.",
  "tooManyItems": {
    "one": "{path}: można zamówić najwyżej {count} sztukę jednego produktu",
    "few": "{path}: można zamówić najwyżej {count} sztuki jednego produktu",
    "many": "{path}: można zamówić najwyżej {count} sztuk jednego produktu",
    "other": "{path}: można zamówić najwyżej {count} sztuki jednego produktu"
  },
  "unsupportedCountry": "Wysyłamy tylko do Stanów Zjednoczonych, Polski i Niemiec.",
  "status": {
    "pending": "Oczekuje na płatność",
    "paid": "Opłacone",
    "shipped": "Wysłane"
  }
}
```

当参数包含数字时 `count`，服务选择表单 `Intl.PluralRules` 对于消息的区域设置。如果缺少一个类别，`other` 被使用。德语文件与英语文件镜像，`one` 和 `other` 仅限表格。

| 项目 | 英语 | 波兰的 | 德国的 |
| --- | --- | --- | --- |
| 1 | 1 项 | 1 个产品 | 1 个产品 |
| 2 | 2 项 | 2 个产品 | 2 个产品 |
| 5 | 5 项 | 5 个产品 | 5 个产品 |
| 22 | 22 项 | 22 个产品 | 22 个产品 |

确认由两条信息组成：复数短语先翻译，然后插入句子中。占位符不能嵌套，所以这是你组合它们的方法。

占位符的名称由字母、数字和下划线组成。您不传递参数的占位符会保留在文本中，括号中的任何其他文本也是如此。要在名称旁边写一个大括号，请将其翻倍：<code>{{id}}</code>打印<code>{id}</code>。对于选择、序数和精确匹配，[使用 ICU 消息语法](/application/i18n#use-icu-message-syntax)。

> info **Hint** 只有 `count` 参数选择复数形式，所以命名它 `count` 在您翻译的每一条复数消息中 `t()`.由于注册目录类型， `t()` 没有它就无法编译复数消息。验证消息获取 `count` 自动，作为 [Localize validation messages](/application/i18n#localize-validation-messages) 显示。

#### 本地化异常

缺失的订单应该会生成客户语言中的 404。投掷时翻译消息：

```typescript
findOne(id: number): Order {
  const order = this.orders.find((order) => order.id === id);
  if (!order) {
    throw new NotFoundException(this.i18nService.t('orders.notFound', { args: { id } }));
  }
  return order;
}
```

异常携带完成的文本，因此无需配置：Nest 的默认异常筛选器、您自己的筛选器和 GraphQL 格式错误所有接收翻译后的消息。`GET /orders/999` 和 `x-lang: pl` 返回：

```json
{
  "message": "Nie znaleziono zamówienia #999.",
  "error": "Not Found",
  "statusCode": 404
}
```

没有 `I18nService` 手头可以使用 `t()` 功能代替。它以相同的方式翻译当前请求。内置管道，例如 `ParseIntPipe` 生成英文消息，因此给解析订单 id 的管道一个异常工厂：

```typescript
const orderIdPipe = new ParseIntPipe({
  exceptionFactory: () => new BadRequestException(t('orders.invalidId')),
});

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}
  // ...

  @Get(':id')
  findOne(@Param('id', orderIdPipe) id: number) {
    return this.ordersService.getSummary(id);
  }
}
```

管道创建一次，在依赖注入之外，仍然用它自己的语言响应每个请求。您将在 [Format prices and dates](/application/i18n#format-prices-and-dates) 中写入 `getSummary()`。

如果你的 API 用自己的形状来塑造错误 [异常过滤器](/exception-filters#binding-filters)，例如 RFC9457 问题详细信息，过滤器像其他消息一样读取翻译后的消息：

```typescript
import {
  Catch,
  NotFoundException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch(NotFoundException)
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const response = host.switchToHttp().getResponse();
    httpAdapter.setHeader(response, 'Content-Type', 'application/problem+json');
    httpAdapter.reply(
      response,
      { type: 'about:blank', title: 'Not Found', status: 404, detail: exception.message },
      404,
    );
  }
}
```

注册筛选器后，相同的请求返回：

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Nie znaleziono zamówienia #999."
}
```

#### 本地化验证消息

此步骤假设您的应用程序使用 `class-validator`;如果使用 Zod 或其他标准模式库进行验证，请继续阅读 [With Zod](#with-zod). `I18nValidationPipe` 是 Nest's [`ValidationPipe`](/application/validation#using-the-built-in-validationpipe)：它接受相同的选项，并且只翻译消息。把它绑定在哪里 `ValidationPipe` 是，作为一个 `APP_PIPE` 提供者 `AppModule`:

```typescript
providers: [
  {
    provide: APP_PIPE,
    useValue: new I18nValidationPipe({ whitelist: true, transform: true }),
  },
],
```

从 DTO 新订单。它使用 `class-validator` 没有任何消息的装饰者：

```typescript
import { i18nValidationMessage } from '@nestjs/i18n';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsInt, IsString, Max, Min, ValidateNested } from 'class-validator';

export class OrderItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(10, { message: i18nValidationMessage('orders.tooManyItems') })
  quantity: number;
}

export class CreateOrderDto {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

在 `validation` 命名空间中通过约束名称查找没有 `message` 的约束：`@IsInt()` 读取 `validation.isInt`，`@Min()` 读取 `validation.min`。`i18nValidationMessage()` 指向您选择的关键点处的单个约束，这里是针对项目限制的商店特定消息。您以纯字符串形式编写的消息将被单独留下。消息可以使用以下占位符：

- `property`：字段名，例如 `quantity`。
- `path`：来自 DTO 的虚线路径，例如 `items.1.quantity`。对于顶级字段，与 `property` 相同。
- `value`：被拒绝的值，当它是字符串、数字或布尔值时。
- `constraint1`，`constraint2` 等等：装饰者的论点。列表（例如 `@IsIn()` 接受的值）读取 `US, PL, DE`。
- `count`：第一个数字参数，因此复数消息同意它。`@Max(10)` 选择 10 的表单。

项目限制是复数消息（参见波兰目录 [Translate order confirmations](/application/i18n#translate-order-confirmations))，所以 `@Max(10)` 用波兰语写着“10 件”。这是波兰语 `validation` 本教程使用的约束目录。`minLength` 也是复数消息，所以 `@MinLength(2)` 读取“2 znaki”和 `@MinLength(5)`“5 个字符”:

```json
{
  "isInt": "{path} musi być liczbą całkowitą",
  "isString": "{path} musi być tekstem",
  "min": "{path} musi wynosić co najmniej {constraint1}",
  "arrayNotEmpty": "{path} musi zawierać co najmniej jeden element",
  "minLength": {
    "one": "{path} musi mieć co najmniej {count} znak",
    "few": "{path} musi mieć co najmniej {count} znaki",
    "many": "{path} musi mieć co najmniej {count} znaków",
    "other": "{path} musi mieć co najmniej {count} znaku"
  },
  "matches": "{path} ma nieprawidłowy format"
}
```

没有转换的约束保留 `class-validator` 消息，以便您可以一次转换一个使用的约束。

对于嵌套对象，Nest 的 `ValidationPipe` 将父路径放在每个消息的前面。`I18nValidationPipe` 保留翻译后的消息原样，因此每个消息自行决定：`path` 给出 `items.1.quantity`，`property` 只给出 `quantity`。没有翻译的邮件保留前缀。

客户在订单上设置送货地址。它的 DTO 依赖于 `minLength` 和 `matches` 目录的条目，并为国家/地区命名特定于商店的消息：

```typescript
import { i18nValidationMessage } from '@nestjs/i18n';
import { IsIn, Matches, MinLength } from 'class-validator';

export class ShippingAddressDto {
  @MinLength(2)
  recipient: string;

  @MinLength(2)
  city: string;

  @Matches(/^[0-9-]{5,6}$/)
  postalCode: string;

  @IsIn(['US', 'PL', 'DE'], { message: i18nValidationMessage('orders.unsupportedCountry') })
  country: 'US' | 'PL' | 'DE';
}
```

```typescript
@Put(':id/shipping-address')
updateShippingAddress(
  @Param('id', orderIdPipe) id: number,
  @Body() address: ShippingAddressDto,
) {
  return this.ordersService.updateShippingAddress(id, address);
}
```

德国客户发送一个字母收件人，一个四位数的邮政编码和 `AT` 因为这个国家收到了三条翻译信息。这个 [Try it](#try-it) 节显示了响应。

##### 与佐德

如果您的应用程序使用 Zod、Valibot、ArkType 或其他 [Standard Schema](https://standardschema.dev/) 库进行验证，请绑定 `I18nStandardSchemaValidationPipe` 而不是 `I18nValidationPipe`。它是 Nest 的 [`StandardSchemaValidationPipe`](/application/validation#schema-based-validation) 的嵌入式替换，应用程序绑定两个管道中的一个，而不是两个：

```typescript
providers: [{ provide: APP_PIPE, useValue: new I18nStandardSchemaValidationPipe() }],
```

以下是与 Zod 模式相同的输入。库消息是纯字符串，因此 `i18nIssueMessage()` 对消息本身中的翻译密钥进行编码，该密钥适用于任何标准架构库：

```typescript
import { i18nIssueMessage } from '@nestjs/i18n';
import { z } from 'zod';

export const orderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1).max(10, i18nIssueMessage('orders.tooManyItems')),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).nonempty(),
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const shippingAddressSchema = z.object({
  recipient: z.string().min(2),
  city: z.string().min(2),
  postalCode: z.string().regex(/^[0-9-]{5,6}$/),
  country: z.enum(['US', 'PL', 'DE'], i18nIssueMessage('orders.unsupportedCountry')),
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;
```

主体参数声明它们的模式而不是类：

```typescript
import {
  createOrderSchema,
  shippingAddressSchema,
  type CreateOrderDto,
  type ShippingAddress,
} from './orders.schemas.js';
// ...
@Post()
create(@Body({ schema: createOrderSchema }) dto: CreateOrderDto) {
  // ...
}

@Put(':id/shipping-address')
updateShippingAddress(
  @Param('id', orderIdPipe) id: number,
  @Body({ schema: shippingAddressSchema }) address: ShippingAddress,
) {
  return this.ordersService.updateShippingAddress(id, address);
}
```

没有显式键的问题通过库分配的代码查找，从最特定的键到最小的键：

- **先格式化。**失败的正则表达式读取 `validation.invalid_format.regex`。
- **然后是原点。**佐德报告了短字符串、小数字和短数组的 `too_small`，并在 `origin` 中说明了哪个。一个短字符串读取 `validation.too_small.string`，因此目录可以谈论字符而不会弄错数字。
- **然后只有代码**，例如 `validation.too_small`。

Valibot 的问题 `type` 以同样的方式工作。消息可以使用上面的 `property` 和 `path` 占位符，库自己的文本作为 `message`，以及问题的参数，如 `minimum` 或 `expected`。`count` 包含数字 `minimum` 或 `maximum`，因此“2 个字符”和“5 个字符”都正确显示，`orders.tooManyItems` 也正确显示 `.max(10)`。这里又是波兰目录，约束名称前面有问题代码条目：

```json
{
  "invalid_type": "{path} musi być typu {expected}",
  "too_small": {
    "string": {
      "one": "{path} musi mieć co najmniej {count} znak",
      "few": "{path} musi mieć co najmniej {count} znaki",
      "many": "{path} musi mieć co najmniej {count} znaków",
      "other": "{path} musi mieć co najmniej {count} znaku"
    },
    "number": "{path} musi wynosić co najmniej {minimum}",
    "array": "{path} musi zawierać co najmniej jeden element"
  },
  "invalid_format": {
    "regex": "{path} ma nieprawidłowy format"
  },
  "isInt": "{path} musi być liczbą całkowitą",
  "isString": "{path} musi być tekstem",
  "min": "{path} musi wynosić co najmniej {constraint1}",
  "arrayNotEmpty": "{path} musi zawierać co najmniej jeden element",
  "minLength": {
    "one": "{path} musi mieć co najmniej {count} znak",
    "few": "{path} musi mieć co najmniej {count} znaki",
    "many": "{path} musi mieć co najmniej {count} znaków",
    "other": "{path} musi mieć co najmniej {count} znaku"
  },
  "matches": "{path} ma nieprawidłowy format"
}
```

使用这些条目，无效的送货地址来自 [Try it](#try-it) 节得到与类相同的三个德语消息，无效顺序如下：

```json
{
  "message": [
    "items.0.quantity musi wynosić co najmniej 1",
    "items.1.productId musi być typu string",
    "items.1.quantity: można zamówić najwyżej 10 sztuk jednego produktu"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

没有翻译的问题 Nest 的通常格式，库的消息所遵循的路径。

#### 本地化 GraphQL 字段

此步骤适用于将 GraphQL 与 `@nestjs/graphql` 一起服务的应用程序。移动应用程序通过 Apollo 驱动程序和在 `AppModule` 中注册的 [代码优先](/graphql/quick-start#code-first) 模式读取 GraphQL 上的订单：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
}),
```

对象类型公开原始订单数据：

```typescript
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Order')
export class OrderModel {
  @Field(() => Int)
  id: number;

  @Field()
  status: string;

  @Field(() => Float)
  total: number;
}
```

局部字段由字段解析器计算，具有相同的 `I18nService` 这个 REST 控制器使用：

```typescript
import { Args, Int, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { I18nService } from '@nestjs/i18n';
import type { Order } from './order.entity.js';
import { OrderModel } from './order.model.js';
import { OrdersService } from './orders.service.js';

@Resolver(() => OrderModel)
export class OrdersResolver {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly i18nService: I18nService,
  ) {}

  @Query(() => OrderModel)
  order(@Args('id', { type: () => Int }) id: number) {
    return this.ordersService.findOne(id);
  }

  @ResolveField(() => String)
  statusLabel(@Parent() order: Order) {
    return this.i18nService.t(`orders.status.${order.status}`);
  }

  @ResolveField(() => String)
  items(@Parent() order: Order) {
    return this.ordersService.describeItems(order);
  }
}
```

这个 `statusLabel`key 是从 `OrderStatus`union，所以编译器仍然检查每个状态都有一个标签。

在 Express 上，Apollo 安装在 Nest 的中间件之后，因此来自 [Add catalogs and register the module](/application/i18n#add-catalogs-and-register-the-module) 的区域设置中间件包装了每个 GraphQL 操作。`?lang`、`x-lang` 和 `Accept-Language` 在旋转变压器、现场旋转变压器和防护装置中的工作方式与 REST 完全相同。`findOne()` 抛出的 `NotFoundException` 到达翻译后的客户端，在 `errors[0].message` 中。

> warning **Warning** 区域设置中间件不包装在 WebSockets 上运行的订阅，或者 GraphQL 安装在外部的驱动程序。这包括常见的情况 [全局前缀](/faq/global-prefix): Nest 在前缀下挂载中间件，而 Apollo 则停留在 `/graphql`,所以设置 `useGlobalPrefix: true` 在 `GraphQLModule` 当你使用一个。在中间件不运行的情况下，包返回到全局拦截器，该拦截器从请求中读取区域设置 GraphQL 上下文（对于订阅，WebSocket 握手）并在守卫之后运行。字段解析器（包括订阅事件的解析器）仅当您设置 `fieldResolverEnhancers: ['interceptors']`，守卫看不到区域设置，响应不携带 `Content-Language`.

#### 格式化价格和日期

订单摘要显示状态、项目数量、总额和订单日期，格式按照每个客户的期望：

```typescript
getSummary(id: number) {
  const order = this.findOne(id);
  return {
    id: order.id,
    status: this.i18nService.t(`orders.status.${order.status}`),
    items: this.describeItems(order),
    total: this.i18nService.formatNumber(order.total, { style: 'currency', currency: 'USD' }),
    placedAt: this.i18nService.formatDate(order.createdAt, {
      dateStyle: 'long',
      timeZone: 'UTC',
    }),
  };
}
```

`formatNumber()` 和 `formatDate()` 包 `Intl.NumberFormat` 和 `Intl.DateTimeFormat` 使用请求的区域设置。他们采取通常的 `Intl` 选项，加上 `locale` 覆盖当前区域设置的选项，如 `t()`.对于订单#1001：

| 本地 | `total` | `placedAt` |
| --- | --- | --- |
| `en` | $97.95 | 2026 年 9 月 14 日 |
| `pl` | 97,95USD | 2026 年 9 月 14 日 |
| `de` | 97,95$ | 2026 年 9 月 14 日 |
| `de-AT` | $97,95 | 2026 年 9 月 14 日 |

`de-AT` 获得奥地利格式，因为模块注册在 `fallbacks` 中列出了它。它的信息仍然来自德国目录。

环境不决定两件事：

- **货币。**区域设置控制金额的书写方式，而不是其价值。商店收费 US 美元，所以每个顾客都看到 USD。从订单或商店拿货币，而不是从当地拿。
- **时区。**无 `timeZone` 日期在服务器的时区中格式化，这可能会改变日期。如果存储客户的时区，则传递客户的时区，或在 UTC 就像这里。

#### 使用客户保存的语言

客户在注册时选择一种语言，客户记录将其保存在 `locale` 字段中，就像 [邮件分会](/application/mail#send-it-in-the-customers-language) 的 `customers` 表一样。在这里，`CustomersService` 保留客户，就像 `OrdersService` 保留订单一样。对于已登录的客户来说，该选项应该胜过 `Accept-Language`，后者只是他们浏览器的默认设置。[`@nestjs/authentication`](/security/authentication) 的守卫就像 Passport 守卫一样，将已登录的用户放在 `request.user` 上。

当还没有人登录时，解析器在区域设置中间件中运行，在守卫之前。设置 `afterGuards` 而是追逐守卫，并接收 `executionContext` 电话：

```typescript
import { Injectable } from '@nestjs/common';
import { LocaleResolver, type LocaleResolverInput } from '@nestjs/i18n';
import { CustomersService } from './customers.service.js';

@Injectable()
export class CustomerLocaleResolver extends LocaleResolver {
  // After guards, the authentication guard has put the signed-in user on the request
  readonly afterGuards = true;

  constructor(private readonly customersService: CustomersService) {
    super();
  }

  resolve({ executionContext }: LocaleResolverInput) {
    const request = executionContext?.switchToHttp().getRequest<{ user?: { id: number } }>();
    const user = request?.user;
    return user ? this.customersService.findOne(user.id)?.locale : undefined;
  }
}
```

Nest 实例化解析器类，因此它可以注入提供程序。把它放进 `resolvers` 在它应该有的等级，并导入提供它注入的模块：

```typescript
I18nModule.forRoot({
  // ...
  resolvers: [
    new QueryLocaleResolver('lang'),
    new HeaderLocaleResolver('x-lang'),
    CustomerLocaleResolver,
    new AcceptLanguageLocaleResolver(),
  ],
  imports: [CustomersModule],
  // ...
}),
```

旋转变压器的顺序仍然决定：

- **`?lang` 和 `x-lang` 赢。**它们是通过语言切换器链接或应用程序设置为此请求做出的选择。当其中一个匹配时，客户解析器不会运行。
- **保存的语言节拍 `Accept-Language`.**Zofia 保存了波兰语，所以她可以在任何浏览器中阅读波兰语。卢卡斯救了 `de-AT`，它像任何候选一样匹配，所以他得到奥地利格式。
- **匿名客户和没有支持的保存语言的客户，**从 `Accept-Language` 获取下面的解析器找到的内容。

守卫会看到守卫之前的解析器找到的区域设置，对守卫抛出的错误（如 401）的响应也会看到。处理程序以及之后的一切都看到了客户的。解析器每个请求运行一次，也适用于具有多个根字段的 GraphQL 操作。在 GraphQL 上，请求位于 `GqlExecutionContext.create(executionContext).getContext().req`。

> info **Hint** 现在，对已登录客户的响应取决于谁提问。无论如何，这样的响应通常是私有的，但是如果共享缓存存储了它们，请在解析器的 `varyHeaders` 中列出标识客户的头，如 `Authorization`，中间件将其添加到 `Vary` 中。

当客户改变语言时，马上用新的语言回答他们。`I18nContext.setLocale()` 更改请求其余部分的区域设置，`Content-Language` 包括：

```typescript
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly i18nContext: I18nContext,
    private readonly i18nService: I18nService,
  ) {}

  @Put('me/locale')
  updateLocale(@Req() request: { user: { id: number } }, @Body('locale') locale: string) {
    const supported = this.i18nContext.setLocale(locale);
    if (!supported) {
      throw new BadRequestException(this.i18nService.t('customers.unsupportedLocale'));
    }

    this.customersService.updateLocale(request.user.id, supported);
    return { locale: supported, message: this.i18nService.t('customers.localeUpdated') };
  }
}
```

`setLocale()` 与 resolution 匹配区域设置，并返回匹配项： `de-DE` 变成 `de`.对于存储没有写入的语言，它返回 `undefined` 并保持区域设置不变，因此错误出现在客户正在阅读的语言中。这两条信息生活在一个新的 `customers` 每种语言的目录，注册于 `customers: typeof customers` 在 `Translations`:

```json
{
  "localeUpdated": "Erledigt! Ab jetzt schreiben wir Ihnen auf Deutsch.",
  "unsupportedLocale": "Wir schreiben nur auf Englisch, Polnisch und Deutsch."
}
```

#### 微服务和 WebSocket 网关

消息处理程序和 WebSocket 网关不通过 HTTP 中间件。在那里，模块使用相同的解析器解析全局拦截器中的区域设置，因此服务、异常和 `t()` 功能工作，就像它们为 HTTP 请求。

消息没有标头或查询字符串，但解析器接收 `executionContext`，因此解析器可以读取生产者放入消息本身的区域设置。将其添加到微服务的 `I18nModule` 的 `resolvers` 中：

```typescript
import { LocaleResolver, type LocaleResolverInput } from '@nestjs/i18n';

export class MessageLocaleResolver extends LocaleResolver {
  resolve({ executionContext }: LocaleResolverInput) {
    if (executionContext?.getType() !== 'rpc') {
      return undefined;
    }
    return executionContext.switchToRpc().getData<{ locale?: string }>()?.locale;
  }
}
```

解析器可以以相同的方式从 `executionContext.switchToRpc().getContext()` 读取消息的传输元数据，例如 NATS 或 Kafka 消息的报头。

对于网关，内置解析器读取连接升级请求的报头和查询字符串。Socket.IO 将请求保留为握手，解析器会在那里找到它。这个 `ws` 图书馆，后面 `WsAdapter` 来自 `@nestjs/platform-ws`，不保留任何内容，因此将请求存储在 `client.request` 当客户端连接时（`WsAuthenticator` 的 `@nestjs/authentication` 做同样的事情）：

```typescript
@WebSocketGateway({ path: '/orders/updates' })
export class OrderUpdatesGateway implements OnGatewayConnection {
  constructor(private readonly ordersService: OrdersService) {}

  handleConnection(client: WebSocket & { request?: IncomingMessage }, request: IncomingMessage) {
    // The ws library keeps no reference to the upgrade request, whose headers and query the resolvers read
    client.request = request;
  }

  @SubscribeMessage('orders.summary')
  summary(@MessageBody() id: number) {
    return { event: 'orders.summary', data: this.ordersService.getSummary(id) };
  }
}
```

连接到 `/orders/updates?lang=de` 阅读德语摘要。拦截器在守卫之后运行，因此在这些路径上，守卫看到默认区域设置，守卫抛出的错误就在默认区域设置中。管道和处理程序查看已解析的管道，而解析器 `afterGuards` 不需要任何额外的东西：这里的每个分解器都已经在守卫后面运行了。

#### 处理丢失的密钥并重新加载目录

一个缺失的翻译应该会破坏开发和 CI 中的构建，并在生产中悄悄地退化。这是最终的 `AppModule`：

```typescript
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import {
  AcceptLanguageLocaleResolver,
  HeaderLocaleResolver,
  I18nModule,
  I18nValidationPipe,
  JsonI18nLoader,
  QueryLocaleResolver,
} from '@nestjs/i18n';
import { join } from 'node:path';
import { CustomerLocaleResolver } from './customers/customer-locale.resolver.js';
import { CustomersModule } from './customers/customers.module.js';
import { OrdersModule } from './orders/orders.module.js';

const env = process.env.NODE_ENV ?? 'development';

@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      supportedLocales: ['en', 'pl', 'de'],
      fallbacks: { 'de-AT': 'de' },
      loader: new JsonI18nLoader({
        path: join(import.meta.dirname, 'i18n'),
        watch: env === 'development',
      }),
      resolvers: [
        new QueryLocaleResolver('lang'),
        new HeaderLocaleResolver('x-lang'),
        CustomerLocaleResolver,
        new AcceptLanguageLocaleResolver(),
      ],
      imports: [CustomersModule],
      missingKey: env === 'production' ? 'fallback' : 'throw',
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
    }),
    CustomersModule,
    OrdersModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new I18nValidationPipe({ whitelist: true, transform: true }),
    },
  ],
})
export class AppModule {}
```

这个 `missingKey` 选项决定在找不到请求区域设置的密钥时会发生什么：

- **`'throw'` 生产外。**`t()` 和 `translate()` 扔一个 `I18nMissingKeyError`，请求以 500 失败。仅存在于英文中的波兰语消息也会失败，因为此策略永远不会回滚到默认区域设置。Vitest 集合 `NODE_ENV` 二 `test`，因此您的测试套件使用此策略运行。
- **`'fallback'` 生产中。**从默认语言环境（英语）中获取一条缺失的波兰语消息，并且每对命名一次密钥和语言环境的警告。不存在的键返回键本身，并记录一个警告，每个键一次。

这个 `de-AT` 二 `de` 回退和区域到基地的匹配适用于每个策略。通过约束名称或问题代码查找的验证消息都不会抛出：没有翻译的约束或问题保留了库的消息。用来命名的键 `i18nValidationMessage()` 或者 `i18nIssueMessage()` 遵循政策，如 `t()`.其他政策是 `'key'`, `'empty'` 以及接收密钥和区域设置的函数。

> info **Hint** 回退适用于每个键。当邮件按照中的方式编写时 [Translate order confirmations](/application/i18n#translate-order-confirmations)，波兰客户可以收到一个围绕波兰复数的英语句子。警告告诉你它发生了；目录测试 [Testing](/application/i18n#testing) 阻止它运输。

和 `watch: true`，这个 JSONloader 监视目录目录，并在文件更改时重新加载，因此翻译人员无需重新启动应用程序即可编辑消息。仅在开发中启用：

- **重新加载是原子的。**整个目录在一个步骤中被重新读取和交换，因此请求永远不会看到新旧消息的混合。
- **损坏的文件将被忽略。**如果文件解析失败，上一个目录将继续使用，并且错误将与文件路径一起记录。接收下一个有效的保存。
- **关机时停止监视。**当应用程序关闭时，监视器关闭。呼吁 `app.enableShutdownHooks()` 在 `main.ts` 在终止信号时也关闭它。

和 `watchAssets` 启用于 `nest-cli.json`，这个 CLI 将编辑的目录复制到 `dist`，其中加载程序读取它们。

##### 配置中的选项

教程中写道 `process.env` 直接，长话短说。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 使用验证模式，并将模块注册为 `forRootAsync()`.它的工厂接收注入的 `ConfigService` 并返回选项：

```typescript
I18nModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const env = configService.get<string>('NODE_ENV', 'development');
    return {
      defaultLocale: 'en',
      supportedLocales: ['en', 'pl', 'de'],
      fallbacks: { 'de-AT': 'de' },
      loader: new JsonI18nLoader({
        path: join(import.meta.dirname, 'i18n'),
        watch: env === 'development',
      }),
      missingKey: env === 'production' ? 'fallback' : 'throw',
    };
  },
  // The list has a class, which Nest instantiates, so it stays next to useFactory
  resolvers: [
    new QueryLocaleResolver('lang'),
    new HeaderLocaleResolver('x-lang'),
    CustomerLocaleResolver,
    new AcceptLanguageLocaleResolver(),
  ],
  imports: [CustomersModule],
}),
```

工厂可以返回加载程序、解析器和格式化程序实例，但不能返回类：Nest 在任何工厂运行之前，在构建模块时实例化类。因此，列出 `CustomerLocaleResolver` 的 `resolvers` 与 `imports` 保持在顶层。返回一个类或在两个地方设置的选项的工厂在启动时会失败，并显示一条命名该选项的消息。

要将选项保留在自己的类中，请将其传递为 `useClass`。它实现 `I18nOptionsFactory`，Nest 调用其 `createI18nOptions()` 方法：

```typescript
@Injectable()
export class I18nConfigService implements I18nOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createI18nOptions(): I18nModuleOptions {
    const env = this.configService.get<string>('NODE_ENV', 'development');
    return {
      defaultLocale: 'en',
      // ...
    };
  }
}
```

```typescript
I18nModule.forRootAsync({
  useClass: I18nConfigService,
  resolvers: [
    // ...
  ],
  imports: [CustomersModule],
}),
```

模块最后使用的选项是可注入的 `I18N_MODULE_OPTIONS` 令牌，对于依赖它们的您自己的提供者。

##### 自定义加载器

翻译人员通常在翻译平台中工作，该平台将每个目录作为一个目录导出 JSON 文档。加载器扩展 `I18nLoader`:`load()` 返回按区域设置键的目录，以及可选的 `watch()` 将新的传递给回调，用于热重新加载。这个在启动时获取导出，每五分钟一次：

```typescript
import { Logger } from '@nestjs/common';
import { I18nLoader, type I18nCatalogs } from '@nestjs/i18n';

/** Catalogs a translation platform exports as one JSON document, fetched again every `interval` ms. */
export class RemoteI18nLoader extends I18nLoader {
  private readonly logger = new Logger(RemoteI18nLoader.name);

  constructor(
    private readonly url: string,
    private readonly interval = 5 * 60_000,
  ) {
    super();
  }

  async load(): Promise<I18nCatalogs> {
    const response = await fetch(this.url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new Error(`GET ${this.url} answered ${response.status}`);
    }
    return (await response.json()) as I18nCatalogs;
  }

  watch(onChange: (catalogs: I18nCatalogs) => void): () => void {
    const timer = setInterval(() => {
      this.load().then(onChange, (err: Error) =>
        this.logger.warn(`Keeping the current catalogs: ${err.message}`),
      );
    }, this.interval);
    // Polling alone doesn't keep the process alive
    timer.unref();
    return () => clearInterval(timer);
  }
}
```

将实例作为 `loader`.启动时失败的获取会导致引导失败，而失败的轮询会使目录继续使用。模块调用 `watch()` 当它初始化时，函数 `watch()` 关闭时返回。像第一个目录一样检查新目录，不适合的目录集（例如没有默认区域设置目录的目录集）将被记录并忽略。要从数据库中读取目录，请传递一个加载程序类，该类 Nest 使用它注入的存储库实例化，并在 `imports`.

#### 使用 ICU 消息语法

内置语法有占位符和复数形式作为目录对象。Crowdin 和 Lokalise 等翻译平台经常在 ICU 相反，MessageFormat 也有精确的匹配，例如 `=0`, `select` （对于依赖于值的消息，例如宠物的种类），以及 `selectordinal` （第一、第二、第三）。这是波兰语 `items` 留言 ICU:

```json
{
  "items": "{count, plural, one {# produkt} few {# produkty} many {# produktów} other {# produktu}}"
}
```

这个 `formatter` 选项插入另一种语法。格式化程序扩展 `I18nMessageFormatter` 和工具 `format()`，它接收消息、参数和区域设置。这个人把信息交给了 [`intl-messageformat`](https://formatjs.github.io/docs/intl-messageformat/) 应用程序安装的库：

```typescript
import { I18nMessageFormatter } from '@nestjs/i18n';
import { IntlMessageFormat } from 'intl-messageformat';

export class IcuMessageFormatter extends I18nMessageFormatter {
  // Parsing a message costs far more than formatting it, and the catalogs hold a fixed set
  private readonly compiled = new Map<string, IntlMessageFormat>();

  format(message: string, args: Record<string, unknown>, locale: string): string {
    const key = `${locale}\u0000${message}`;
    let compiled = this.compiled.get(key);
    if (!compiled) {
      compiled = new IntlMessageFormat(message, locale, undefined, { ignoreTag: true });
      this.compiled.set(key, compiled);
    }
    return String(compiled.format<unknown>(args));
  }
}
```

`ignoreTag` 将 `<` 和 `>` 保留为文本，否则库将读取富文本标记。传递实例或 Nest 实例化的类，如 `formatter`：

```typescript
I18nModule.forRoot({
  // ...
  formatter: new IcuMessageFormatter(),
}),
```

格式化程序就位后：

- **本教程的目录保持不变。**占位符是一个简单的 ICU 参数，复数对象仍然有效：模块选择表单，格式化程序格式化它。波兰的 `items` 将“5 produktów”读作复数宾语，并读作 ICU 上面的消息。
- **区域设置是请求的区域设置。** `de-AT` 从德语目录读取的消息格式为 `de-AT`，因此具有货币样式的数字参数读取 `$ 97,95`。返回到默认区域设置的消息是为默认区域设置格式化的，它是在默认区域设置的语法中编写的。
- **键保持检查，复数计数不检查。**编译器需要一个数字 `count` 对于复数对象，但是 ICU 复数是它的一个字符串，所以你自己传递它的参数。

#### 试试

启动应用程序并在 `Accept-Language` 中使用 Polish 下订单：

```bash
$ curl -X POST http://localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -H 'Accept-Language: pl-PL,pl;q=0.9,en;q=0.8' \
    -d '{"items":[{"productId":"salmon-kibble-2kg","quantity":2},{"productId":"sisal-scratching-post","quantity":3}]}'
{"id":1002,"message":"Dziękujemy! Zamówienie #1002 zostało przyjęte: 5 produktów."}
```

这个 `lang` 查询参数胜过任何标题：

```bash
$ curl -X POST 'http://localhost:3000/orders?lang=de' \
    -H 'Content-Type: application/json' \
    -d '{"items":[{"productId":"feather-wand","quantity":1}]}'
{"id":1003,"message":"Vielen Dank! Bestellung #1003 ist bestätigt: 1 Produkt."}
```

作为奥地利客户阅读订单#1001 的摘要：

```bash
$ curl http://localhost:3000/orders/1001 -H 'Accept-Language: de-AT'
```

```json
{
  "id": 1001,
  "status": "Versandt",
  "items": "5 Produkte",
  "total": "$ 97,95",
  "placedAt": "14. September 2026"
}
```

请求一个不存在的订单，用 `x-lang` 标题：

```bash
$ curl http://localhost:3000/orders/999 -H 'x-lang: pl'
```

```json
{
  "message": "Nie znaleziono zamówienia #999.",
  "error": "Not Found",
  "statusCode": 404
}
```

发送无效订单：

```bash
$ curl -X POST 'http://localhost:3000/orders?lang=pl' \
    -H 'Content-Type: application/json' \
    -d '{"items":[{"productId":"salmon-kibble-2kg","quantity":0},{"productId":42,"quantity":12}]}'
```

```json
{
  "message": [
    "items.0.quantity musi wynosić co najmniej 1",
    "items.1.productId musi być tekstem",
    "items.1.quantity: można zamówić najwyżej 10 sztuk jednego produktu"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

发送无效的送货地址：

```bash
$ curl -X PUT http://localhost:3000/orders/1001/shipping-address \
    -H 'Content-Type: application/json' \
    -H 'Accept-Language: de' \
    -d '{"recipient":"A","city":"Wien","postalCode":"1010","country":"AT"}'
```

```json
{
  "message": [
    "recipient muss mindestens 2 Zeichen lang sein",
    "postalCode hat ein ungültiges Format",
    "Wir liefern nur in die USA, nach Polen und nach Deutschland."
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

最后，查询 GraphQL 上的顺序：

```bash
$ curl -X POST 'http://localhost:3000/graphql?lang=pl' \
    -H 'Content-Type: application/json' \
    -d '{"query":"{ order(id: 1001) { id status statusLabel items } }"}'
```

```json
{
  "data": {
    "order": {
      "id": 1001,
      "status": "shipped",
      "statusLabel": "Wysłane",
      "items": "5 produktów"
    }
  }
}
```

> info **Hint** `Intl` 在 `97,95 USD`、`97,95 $` 和 `$ 97,95` 中用不间断空格（U+00A0）分隔金额和币种。上面的回答显示了一个规则的空间。在测试中比较格式化的字符串时，请记住这一点。

#### 检测

安 [端到端测试](/fundamentals/testing#end-to-end-testing) 以与客户端相同的方式设置语言：

```typescript
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Orders (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(() => app.close());

  it('confirms an order in the language of the request', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Accept-Language', 'pl-PL,pl;q=0.9')
      .send({ items: [{ productId: 'salmon-kibble-2kg', quantity: 5 }] })
      .expect(201);

    expect(res.body.message).toBe(
      'Dziękujemy! Zamówienie #1002 zostało przyjęte: 5 produktów.',
    );
  });

  it('localizes errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders/999?lang=de')
      .expect(404);

    expect(res.body.message).toBe('Bestellung #999 wurde nicht gefunden.');
  });
});
```

在请求之外，`I18nService` 使用默认区域设置。以另一种语言测试服务，而无需 HTTP，在里面运行调用 `I18nContext.run()`，这使得区域设置为当前请求将：

```typescript
import { I18nContext } from '@nestjs/i18n';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { OrdersService } from '../src/orders/orders.service.js';

describe('OrdersService', () => {
  let ordersService: OrdersService;
  let i18nContext: I18nContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    ordersService = moduleRef.get(OrdersService);
    i18nContext = moduleRef.get(I18nContext);
  });

  it.each([
    [1, '1 produkt'],
    [2, '2 produkty'],
    [5, '5 produktów'],
    [22, '22 produkty'],
  ])('describes %i item(s) in Polish', (quantity, expected) => {
    const order = {
      ...ordersService.findOne(1001),
      items: [{ productId: 'salmon-kibble-2kg', quantity }],
    };
    expect(i18nContext.run('pl', () => ordersService.describeItems(order))).toBe(expected);
  });

  it('falls back to the default locale outside a request', () => {
    const order = ordersService.findOne(1001);
    expect(ordersService.describeItems(order)).toBe('5 items');
  });
});
```

要使用其他目录运行应用程序，例如删除翻译以测试缺失密钥策略，请替换测试模块上的加载程序：`overrideProvider(I18nLoader).useValue(new InMemoryI18nLoader(catalogs))`。

这个 `'throw'` 策略在测试执行的路径上捕捉缺失的键。目录测试捕捉到了其余的：每个语言环境必须具有与英语相同的键和占位符，每个复数消息必须具有其语言所需的形式。`Intl.PluralRules` 知道它们是哪些形式：

```typescript
import { JsonI18nLoader, type I18nCatalog } from '@nestjs/i18n';
import { join } from 'node:path';

type Message = string | Record<string, string>;

/** Flattens a catalog to [key, message] pairs; plural forms count as one message. */
function messages(tree: I18nCatalog, prefix = ''): [string, Message][] {
  return Object.entries(tree).flatMap(([name, value]): [string, Message][] =>
    typeof value === 'string' || 'other' in value
      ? [[prefix + name, value as Message]]
      : messages(value, `${prefix}${name}.`),
  );
}

const placeholders = (message: Message) =>
  [...new Set(JSON.stringify(message).match(/\{\w+\}/g))].sort();

const loader = new JsonI18nLoader({ path: join(import.meta.dirname, '../src/i18n') });
const catalogs = await loader.load();
const english = new Map(messages(catalogs.en));

describe.each(Object.keys(catalogs))('the %s catalog', (lang) => {
  const translated = new Map(messages(catalogs[lang]));

  it('has the same keys and placeholders as the English one', () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, message] of translated) {
      expect(placeholders(message), key).toEqual(placeholders(english.get(key)!));
    }
  });

  it('has every plural form the language needs', () => {
    const forms = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
    for (const [key, message] of translated) {
      if (typeof message === 'object') {
        expect(Object.keys(message), key).toEqual(expect.arrayContaining(forms));
      }
    }
  });
});
```

删除 `many` 来自波兰的形式 `items` 消息，第二个测试未能提供 Polish 所需的表单列表。

#### 生产检查表

- **运送目录。**检查 `nest build` 之后是否存在 `dist/i18n`。加载程序在启动时读取目录，缺少的目录会导致引导失败。
- **在生产中使用 `'fallback'`，在其他地方使用 `'throw'`**，并在 CI 中运行目录测试。查看生产日志以获取回退警告。
- **关闭 `watch` 正在生产中。**热重新加载是一个开发工具。
- **别针 `supportedLocales`.** 否则每个目录 `i18n` 成为区域设置，包括在应用程序运行时出现的区域设置 `watch` 已启用。
- **将格式化区域添加到 `fallbacks`.**区域解析为其基础语言，除非它被列出，然后它的格式也与基础语言相同。
- **在请求之外设置区域设置。** Cron 作业、队列使用者和发出的电子邮件没有请求，因此 `I18nService` 返回默认区域设置，`t()` 函数返回密钥。保存每个客户的首选区域，并在 `I18nContext.run()` 中运行工作。
- **思维缓存。**对相同的回应 URL 区别在于 `Accept-Language` 和 `x-lang`.中间件在 `Vary`;检查您的缓存或 CDN 尊重它。这个 `lang` 查询参数是 URL 所以它不需要任何额外的东西。
- **保持 GraphQL 在全局前缀下。** `setGlobalPrefix()` 中，区域设置中间件仅覆盖前缀下的路由。给 `GraphQLModule` `useGlobalPrefix: true`，或者解析器上的防护装置看不到区域设置（参见 [Localize GraphQL fields](/application/i18n#localize-graphql-fields)).
- **转义以 HTML.** 客户姓名等参数按原样插入。这是正确的 JSON 回应，但一个 HTML 电子邮件必须像任何其他文本一样转义消息。
- **将数字和日期保留在区域设置人员手中，货币和时区不在其中。**参见 [Format prices and dates](/application/i18n#format-prices-and-dates)。

#### 参考

##### 模块选项

`I18nModule.forRoot()` 采用这些选项。`forRootAsync()` 从其工厂获取相同的值（`useFactory` 带有 `inject`，或实现 `I18nOptionsFactory` 的 `useClass` 或 `useExisting` 类），而 `imports`、`isGlobal` 和 loader、resolver 或 formatter 类保持在顶级。参见 [Options from configuration](/application/i18n#options-from-configuration)。解析的选项可以使用 `I18N_MODULE_OPTIONS` 令牌注入。

| 选择 | 默认的 | 描述 |
| --- | --- | --- |
| `loader` | 所需 | 目录的来源：`I18nLoader` 实例，如 `JsonI18nLoader`，或加载程序类 Nest 实例化。参见 [Add catalogs and register the module](/application/i18n#add-catalogs-and-register-the-module)。 |
| `resolvers` | `[new AcceptLanguageLocaleResolver()]` | 区域设置解析器，按顺序尝试：实例或类 Nest 实例化。 |
| `formatter` | 内置语法 | 将消息转换为文本的 `I18nMessageFormatter` 实例或类 Nest 实例化。参见 [Use ICU message syntax](/application/i18n#use-icu-message-syntax)。 |
| `defaultLocale` | `'en'` | 当没有解析器找到支持的区域设置和外部请求时使用。 |
| `supportedLocales` | 加载的区域设置 | 请求可以获得的区域设置，如 BCP47 个标签。 |
| `fallbacks` | 没有一个 | 将区域设置映射到其消息来源区域的对象，例如 `'de-AT': 'de'`。键算作支持的区域设置。 |
| `missingKey` | `'fallback'` | 缺少的键返回什么：`'fallback'`、`'key'`、`'empty'`、`'throw'`，或者接收键和区域设置的函数。参见 [Handle missing keys and reload catalogs](/application/i18n#handle-missing-keys-and-reload-catalogs)。 |
| `logMissingKeys` | `'once'` | 警告每个键、`'always'` 或 `'never'` 缺少键和默认区域设置回退 `'once'`。 |
| `responseHeaders` | `true` | 设置 `Content-Language` 和 `Vary` 在 HTTP 答案。 |
| `imports` | 没有一个 | 导出的提供程序加载程序、解析器和格式化程序类注入的模块。 |
| `isGlobal` | `true` | 全局注册模块。 |

`JsonI18nLoader` 采取 `path`，每个区域设置有一个子目录的目录，以及 `watch`（默认 `false`)，当文件更改时重新加载目录。`InMemoryI18nLoader` 将目录作为按区域设置键的对象。

##### 本地解析器

| 旋转器 | 阅读 | 默认名称 |
| --- | --- | --- |
| `QueryLocaleResolver` | 查询参数 | `lang` |
| `HeaderLocaleResolver` | 请求头 | `x-lang` |
| `AcceptLanguageLocaleResolver` | `Accept-Language`，订购人 `q` 价值观 | 没有一个 |
| `CookieLocaleResolver` | 饼干 `Cookie` 头球 | `lang` |

自定义解析器扩展 `LocaleResolver` 和工具 `resolve()`，它接收请求 `headers` 和 `query`，并返回候选人、候选人列表或什么都不返回。它列出了它读取的标题 `varyHeaders`.与 `afterGuards` 设置，它追逐守卫，保持其等级，并接收 `executionContext` 就像每个解析器对微服务、WebSocket 网关和 GraphQL 订阅。看 [Use the customer's saved language](/application/i18n#use-the-customers-saved-language).

##### 翻译 API

- `I18nService.t(key, options)`：翻译当前区域设置。`options` 接受占位符值 `args`（数字 `count` 选择复数形式）和 `locale`（显式区域设置）。参见 [Translate order confirmations](/application/i18n#translate-order-confirmations)。`I18nService<OtherTranslations>` 根据另一个目录形状检查键。
- `I18nService.translate(key, options)`:对于在运行时构建的密钥，未选中的密钥也是如此。
- `I18nService.exists(key, locale)`：密钥是否有消息。
- `I18nService.formatNumber(value, options)` 和 `formatDate(value, options)`：`Intl` 在当前区域设置中设置格式，使用通常的 `Intl` 选项加上 `locale`。参见 [Format prices and dates](/application/i18n#format-prices-and-dates)。
- `I18nService.matchLocale(candidate)`：将区域设置（例如保存在配置文件上的区域设置）映射到受支持的区域设置，或 `undefined`。
- `I18nService.defaultLocale` 和 `supportedLocales`: 为语言选择器配置的区域设置。
- `I18nContext.locale` 和 `I18nContext.run(locale, fn)`：读取当前区域设置，或为请求之外的代码创建一个当前区域设置。
- `I18nContext.setLocale(locale)`：更改请求其余部分的区域设置并返回匹配的区域设置，或 `undefined` 对于一个没有支持的人来说，这不会改变任何事情。它抛出一个请求，并在微服务、WebSocket 网关和 GraphQL 守卫中的订阅，在区域设置解析之前运行。
- `@CurrentLocale()`：作为处理程序参数的当前区域设置。
- `t(key, options)`:`I18nService.t()` 用于没有依赖注入的代码。在请求之外，它返回密钥。参见 [Localize exceptions](/application/i18n#localize-exceptions)。

##### 验证

| 出口 | 描述 |
| --- | --- |
| `I18nValidationPipe` | 对于约束消息，采用 `ValidationPipe` 选项，加上 `namespace`（默认值为 `'validation'`）。参见 [Localize validation messages](/application/i18n#localize-validation-messages)。 |
| `I18nStandardSchemaValidationPipe` | 获取 `StandardSchemaValidationPipe` 选项，加上 `namespace` 和 `issueKeys`，这是一个为问题返回额外候选键的函数。参见 [With Zod](/application/i18n#with-zod)。 |
| `i18nValidationMessage(key, args)` | A 点 `class-validator` 键处的约束。 |
| `i18nIssueMessage(key, args)` | 将标准模式问题指向一个键。 |
| `translateValidationErrors(errors, options)` | 翻译 `class-validator` 错误，对于你自己的管道。 |
| `translateStandardSchemaIssues(issues, options)` | 为您自己的管道翻译标准架构问题。 |

##### 错误

| 错误 | 何时 |
| --- | --- |
| `I18nMissingKeyError` | 下面缺少一个键 `missingKey: 'throw'`.它携带 `key` 和 `locale`，不是一个 `HttpException`，因此请求以 500 失败。 |
