# Mail

Source: https://docs.nestjs.com/application/mail

当顾客在网上商店订购猫粮和用品时，他们希望在一分钟内收到一封确认电子邮件：商品、总数、订单链接以及 PDF 形式的发票。发送该电子邮件需要的不仅仅是调用 SMTP 库：

- **这 HTML 必须安全。**产品名称或客户名称最终会出现在标记中。未逃脱，一个名字 `<script>` 或者流浪汉 `&` 破坏布局，或者更糟。
- **邮件必须经受住故障的考验。**邮件服务器被列入灰名单，速率限制并关闭。请求中失败的发送要么会导致已经提交的订单失败，要么会丢失电子邮件。
- **测试必须查看发送的内容。**“客户收到带有订单链接的确认”的测试需要呈现的邮件及其链接，而不是模拟的方法调用。

`@nestjs/mail` 涵盖这些。邮件类是可注入的提供程序，它从类型化数据呈现主题和正文，因此它们可以注入您的其他提供程序，如存储库或 PDF 效果图。尸体来自一个 HTML 模板文件，由一个小型内置引擎呈现，该引擎会转义它插入的每个值，或者由车把或您插入的任何其他引擎呈现。运输交付结果：SMTP，写在 `node:net` 和 `node:tls`，以及 Resend、Postmark、SendGrid 和 AmazonSES 超过他们的 HTTP 蜜蜂。测试将传输替换为内存中的传输，并读取它收到的邮件。该包没有超出 Nest 本身。

在本教程中，您将向商店的订单添加订单确认电子邮件 API：

- 开发将每封邮件都写给 `.eml` 文件而不是发送。
- 确认是一个邮件类，它呈现 HTML 模板，采用每封邮件共享的布局，附有发票和内联徽标。
- 预览路由在浏览器中显示邮件，而不发送邮件。
- 订单提交后，邮件会通过发件箱发出，其中包含重试和死信。
- 生产通过 SMTP 或者重新发送，由环境变量选择。

#### 安装

要开始，请安装所需的依赖项：

```bash
$ npm i --save @nestjs/mail
```

#### 注册邮件模块

登记 `MailModule` 在根模块中，旁边 `DrizzleModule`.邮件教程需要客户及其订单的数据库，以及发件箱的表，通过这些表发送邮件 [订单提交后发送](/application/mail#send-after-the-order-commits).在发展中， `FileMailTransport` 将每封邮件写入 `var/mail` 而不是发送它，以及 `FileTemplateEngine` 从 HTML 文件在 `mail/templates`.它导入的功能模块在以下部分中构建：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { FileMailTransport, FileTemplateEngine, MailModule } from '@nestjs/mail';
import { drizzle } from 'drizzle-orm/node-postgres';
import { join } from 'node:path';
import * as schema from './database/schema.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // A pg pool on DATABASE_URL: the customers and orders, and the outbox's tables
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    MailModule.forRoot({
      // Development: every mail becomes an .eml file in var/mail instead of leaving the machine
      transport: new FileMailTransport({ directory: 'var/mail' }),
      // Mail bodies are HTML files in mail/templates, wrapped in mail/templates/layout.html
      templates: new FileTemplateEngine({
        dir: join(import.meta.dirname, 'mail/templates'),
        layout: 'layout',
        // Development reads the files for every mail, so edits show up without a restart
        cache: process.env.NODE_ENV === 'production',
      }),
      from: 'Orders <orders@example.com>',
    }),
    OrdersModule,
    NotificationsModule,
  ],
})
export class AppModule {}
```

- `transport`：邮件如何离开应用程序。每个传输都扩展了抽象 `MailTransport` 类，这也是它的注入令牌，因此测试将其替换为 `overrideProvider(MailTransport)`. `FileMailTransport` 是为了发展：打开 `.eml` 任何邮件客户端中的文件，以查看到底要发送什么。它写入本地磁盘，无人到达，因此 [生产中](/application/mail#send-in-production) 应用程序切换到 SMTP 或者重新发送。
- `templates`: 呈现命名模板的邮件。`FileTemplateEngine` 从 `dir` 读取 `.html` 个文件，并将每封邮件包装到 `layout` 模板 `mail/templates/layout.html` 中。根据工作目录解析相对 `dir`；它从 `import.meta.dirname` 构建，指向编译后的 `app.module.js` 旁边，无论应用程序在哪里启动。编译的模板被缓存。关闭 `cache` 后，就像在生产之外一样，每封邮件都会再次读取文件，因此编辑过的模板会出现在下一封邮件中，而无需重新启动。
- `from`：默认发件人。消息可以覆盖它。

TypeScript 编译器不会将 HTML 文件复制到 `dist`。将模板添加到 `nest-cli.json` 中的 [资产](/cli/monorepo#assets) 中，这样它们就会落到编译后的 `app.module.js` 旁边的 `dist/mail/templates` 中：

```json
{
  "compilerOptions": {
    "assets": ["mail/templates/**/*"],
    "watchAssets": true
  }
}
```

和 `watchAssets`,`nest start --watch` 将模板复制到 `dist` 无论何时你保存它。

> info **Hint** 教程中写道 `process.env` 直接，长话短说。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 有了验证模式，所以缺少一个 `DATABASE_URL` 或者 `SMTP_URL` 启动时停止应用程序，并从 `ConfigService` 在工厂里。

`MailModule` 是全球性的，提供 `Mailer`，它发送邮件，以及 `MailEvents`，它报告发送的内容和失败的内容。失踪 `transport` 或无效 `from` 在启动时停止应用程序，并显示命名选项的消息。

#### 写订单确认邮件

邮件的正文是 HTML 模板。值在双大括号和块之间，例如 `#each` 为列表中的每个项目重复模板的部分：

```html
<p>Hi {{ customer.name }},</p>
<p>thank you for your order! We are packing it now.</p>
<table>
  <tr><th>Product</th><th>Qty</th><th>Price</th></tr>
  {{#each items}}
  <tr>
    <td>{{ name }}</td>
    <td>{{ quantity }}</td>
    <td>{{ price }}</td>
  </tr>
  {{/each}}
</table>
<p><strong>Total: {{ total }}</strong></p>
<p><a href="{{ orderUrl }}">View your order</a></p>
```

每封邮件都包裹在布局中。它将呈现的邮件放置在 `body` 周围，并包括签名，这是一个位于 `mail/templates/partials/signature.html` 中的部分：

```html
<!DOCTYPE html>
<html>
<body>
{{{ body }}}
{{> signature}}
</body>
</html>
```

```html
<p>The customer care team</p>
```

邮件类实现 `Mailable<TData>`。它的 `render()` 方法获取数据并返回主题、模板的名称及其上下文、模板读取的值：

```typescript
import { Injectable } from '@nestjs/common';
import type { Mailable } from '@nestjs/mail';
import type { Customer } from '../customers/customers.repository.js';
import type { Order } from '../orders/order.js';

export interface OrderConfirmation {
  order: Order;
  customer: Customer;
}

const SHOP_URL = process.env.SHOP_URL ?? 'https://shop.example.com';

@Injectable()
export class OrderConfirmationMail implements Mailable<OrderConfirmation> {
  render({ order, customer }: OrderConfirmation) {
    const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    return {
      subject: `Your order #${order.number}`,
      // mail/templates/order-confirmation.html, wrapped in the layout
      template: 'order-confirmation',
      // The values the template shows, ready to insert: prices formatted, the link built
      context: {
        customer,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: price(item.price * item.quantity),
        })),
        total: price(order.total),
        orderUrl: `${SHOP_URL}/orders/${order.id}`,
      },
    };
  }
}
```

这个模板没有逻辑。它有价值观，`#if`,`#unless` 和 `#each` 块、部分和注释，但没有助手和表达式：需要代码的内容，如格式化价格或建立链接，发生在邮件类中，在 TypeScript，在那里输入和测试它。语法是手柄的子集（请参见 [Template syntax](/application/mail#template-syntax)），因此模板移动到 [另一引擎](/application/mail#use-another-template-engine) 就像他们一样。

双括号转义该值。一种名为 `Feather wand toy <limited edition>` 变成 `Feather wand toy &lt;limited edition&gt;`，且客户名称无法注入标记。有两条规则很难出错：

- 转义保护元素内容和引用的属性值，因此双括号值只能放在这些位置。其他任何地方标记中的值都是编译错误：`href=` 紧接着是值，或者是位于属性之间的值。转义不能保护任何一个地方（未引号，值中的空格将开始一个新属性）。引用属性值，就像上面的链接一样。
- 三重大括号按原样插入值，用于 HTML 你创造了你自己。在本教程中，只有布局的 `body` 需要他们。

缺少值将呈现为无，如车把。内部 `#each`,`this` 是物品，`@index`,`@first` 和 `@last` 描述它的位置，并在模板的上下文中查找项目没有的名称，因此行可以显示列表之外的值。不编译的模板会使邮件失败 `MailTemplateError`，它命名文件和位置：

```text
order-confirmation.html:5:3: {{#each items}} is never closed (expected {{/each}})
```

没有文本模板。邮件程序从 HTML：段落、表行和链接 `View your order (https://shop.example.com/orders/…)`.未显示的邮件客户端 HTML 和垃圾邮件过滤器，阅读那部分。要自己写，请添加 `order-confirmation.txt` 旁边 HTML：引擎将其呈现为文本部分，语法相同，不转义。

将类注册为提供程序，就像任何其他可注入的类一样：

```typescript
import { Module } from '@nestjs/common';
import { OrderConfirmationMail } from './order-confirmation.mail.js';

@Module({
  providers: [OrderConfirmationMail],
})
export class NotificationsModule {}
```

然后下单的时候发送。`mailer.send()` 获取邮件类和收件人，`data` 的类型来自该类的 `render()`：

```typescript
async placeOrder({ customerId, items }: PlaceOrderDto): Promise<Order> {
  const customer = await this.customersRepository.findById(customerId);
  if (!customer) {
    throw new BadRequestException(`Unknown customer "${customerId}"`);
  }
  if (!items?.length) {
    throw new BadRequestException('An order needs at least one item');
  }

  const order = await this.db.transaction((tx) => this.insertOrder(tx, customerId, items));

  // After the commit: never inside the transaction, which would stay open, holding its
  // connection and locks, for as long as the mail server takes to answer
  await this.mailer.send(OrderConfirmationMail, {
    to: { name: customer.name, address: customer.email },
    data: { order, customer },
  });
  return order;
}
```

接收者是一个对象，具有 `name` 和一个 `address`，因此带有逗号或引号的名称仍然是一个显示名称。字符串也可以工作，如 `'Ada Lovelace <ada@example.com>'`，但字符串必须包含一个地址：逗号分隔的列表会抛出，因此用户键入的名称永远无法添加收件人。收件人列表是数组。

下订单，文件将出现在 `var/mail` 中。这是可行的，但它会在提交后从请求发送邮件。[Send after the order commits](/application/mail#send-after-the-order-commits) 解释了为什么这还不够好，并修复了它。

**内联书写的邮件。**小到可以写入的邮件 TypeScript 不需要模板文件。`render()` 回报 `html` 代替 `template` 和 `context`，用 `html` 标记模板：

```typescript
return {
  subject: `Your order #${order.number}`,
  html: html`
    <p>Hi ${customer.name},</p>
    <p>thank you for your order! We are packing it now.</p>
    <table>
      ${order.items.map(
        (item) => html`
          <tr>
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${price(item.price * item.quantity)}</td>
          </tr>`,
      )}
    </table>
    // ...
};
```

`html` 转义您插值的每个值，使用与模板相同的规则：标记内的值必须在引号属性值中，否则会抛出。嵌套 `html` 模板及其数组（如表行）按原样插入，并且 `unsafeHtml()` 插入件 HTML 你产生了你自己；这个名字就是警告。`mailer.send()` 采取 `html` 也适用于没有邮件类发送的邮件。

#### 附上发票并预览邮件

发票是 PDF，由小型提供者呈现。上面写着 PDF 手工使用内置字体，以保持示例没有依赖项。真实的应用程序使用 PDF 图书馆或这里的渲染服务。邮件只需要字节：

```typescript
@Injectable()
export class InvoicePdf {
  render(order: Order, customer: Customer): Buffer {
    const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const lines = [
      `Invoice ${order.number}`,
      `Date: ${order.placedAt.slice(0, 10)}`,
      `Bill to: ${customer.name}`,
      '',
      ...order.items.map((item) => `${item.quantity} x ${item.name}  ${money(item.price * item.quantity)}`),
      '',
      `Total: ${money(order.total)}`,
    ];
    // ...
  }
}
```

`render()` 返回附件和模板。发票是常规附件。徽标是一个内联图像：它 `cid` 使其成为 HTML，其中引用它为 `cid:logo@example.com`.徽标位于每封邮件的头部，因此引用位于布局中：

```html
<!DOCTYPE html>
<html>
<body>
<p><img src="cid:logo@example.com" alt="Logo" width="120" height="32"></p>
{{{ body }}}
{{> signature}}
</body>
</html>
```

邮件类附加徽标和发票：

```typescript
const LOGO = join(import.meta.dirname, 'assets/logo.png');

@Injectable()
export class OrderConfirmationMail implements Mailable<OrderConfirmation> {
  constructor(private readonly invoicePdf: InvoicePdf) {}

  render({ order, customer }: OrderConfirmation) {
    // ...
    return {
      subject: `Your order #${order.number}`,
      // mail/templates/order-confirmation.html, wrapped in the layout
      template: 'order-confirmation',
      // ...
      attachments: [
        // Inline: the layout's <img> references it by its cid
        { cid: 'logo@example.com', path: LOGO },
        { filename: `invoice-${order.number}.pdf`, content: this.invoicePdf.render(order, customer) },
      ],
    };
  }
}
```

在这种布局中呈现的每封邮件都以相同的方式附加徽标，或者其标题显示一个损坏的图像。模板在链接后多了一行，`<p>Your invoice is attached.</p>`。

附件的内容是 `Buffer` 字符串或流，或者是从本地读取的 `path` 邮件发出时。内容类型来自文件名，以及一个非-ASCII 文件名被编码，以便每个邮件客户端都显示它。邮件服务器按照邮件客户端期望的方式排列零件：徽标位于 HTML，因此显示文本版本的客户端不会将其列为附件。

> warning **Warning** 永远不要建立依恋 `path` 来自用户输入。该路径上的文件是附加的，不管它是什么。URL 被拒绝，而不是被获取。

当您处理模板时，您不想为每个更改下订单。`mailer.render()` 呈现邮件类而不发送它。仅开发路由在浏览器中显示结果。关闭模板缓存后，它会在下次刷新时显示编辑过的模板：

```typescript
import { Controller, Get, Header } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import { OrderConfirmationMail, type OrderConfirmation } from './order-confirmation.mail.js';

const SAMPLE: OrderConfirmation = {
  customer: {
    id: 'sample',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    // ...
  },
  order: {
    id: '00000000-0000-4000-8000-000000000000',
    number: 1001,
    customerId: 'sample',
    items: [
      { productId: 'salmon-kibble-2kg', name: 'Salmon kibble, 2 kg', quantity: 2, price: 2499 },
      { productId: 'feather-wand', name: 'Feather wand toy', quantity: 1, price: 799 },
    ],
    total: 5797,
    placedAt: '2026-09-22T10:00:00.000Z',
  },
};

@Controller('dev/mail')
export class MailPreviewController {
  constructor(private readonly mailer: Mailer) {}

  /** Renders the mail with sample data, without sending it: GET /dev/mail/order-confirmation */
  @Get('order-confirmation')
  @Header('content-type', 'text/html; charset=utf-8')
  async orderConfirmation() {
    const message = await this.mailer.render(OrderConfirmationMail, { data: SAMPLE });

    // Browsers don't resolve cid: references; inline the images as data: URLs instead
    let body = message.html ?? '';
    for (const { cid, contentType, content } of message.attachments) {
      if (cid) {
        body = body.replaceAll(`cid:${cid}`, `data:${contentType};base64,${content.toString('base64')}`);
      }
    }
    return body;
  }
}
```

`render()` 返回完成的 `MailMessage` 主题，HTML 以及衍生文本、附件和 `toMime()` 对于原始消息。收件人在这里是可选的。`render()` 还获取内联编写的消息，例如主题、`template` 及其 `context`，以预览没有邮件类的模板。仅在生产外注册控制器：

```typescript
@Module({
  // The preview route renders mail with sample data; production doesn't need it
  controllers: process.env.NODE_ENV === 'production' ? [] : [MailPreviewController],
  providers: [OrderConfirmationMail, InvoicePdf],
})
export class NotificationsModule {}
```

#### 订单提交后发送

[Write the order confirmation mail](/application/mail#write-the-order-confirmation-mail) 订单提交后，发送请求中的邮件。有三件事出错了：

- **提交和发送之间的崩溃会丢失邮件。**在错误的时间重新启动流程的部署会留下未确认的已付款订单。
- **邮件服务器中断导致已经成功的请求失败。**订单被保存，但客户看到 500，可以重新订购。
- **客户等待邮件服务器。**SMTPexchange 需要数百毫秒，而速度慢的服务器需要处理请求的时间。

这是双写问题 [发件箱教程](/reliability/outbox) 和发件箱（`@nestjs/outbox`，在该教程中安装和设置）修复它。秩序和 `order.placed` 在一个事务中提交消息，中继将消息交给发送邮件的处理程序。如果发送失败，中继会回退重试，并将从未成功的消息移动到死信表。outbox 通过其存储将其消息保存在应用程序的 PostgreSQL 数据库中，紧邻订单，`PostgresOutboxStore` 来自 `@nestjs/outbox/postgres` 在数据库上 [`@nestjs/drizzle`](/data/drizzle) 寄存器。当应用程序启动时，存储以自己的模式创建表；[Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 在 outbox 教程中介绍了它们，以及如何在生产中应用它们的迁移。

本节显示订单事务两次：第一次是使用 Drizzle，这是教程的路径，然后，在本节末尾的“使用 TypeORM”下，显示 ORM 为 TypeORM 的应用程序的相同事务。取两个中的一个。

登记 `OutboxModule` 以及作为根模块提供者的存储：注入 Drizzle 数据库和 `OutboxStorage` 注册表，商店用它来注册自己。如果没有它，发件箱将保留其消息在内存中，并在重新启动时丢失它们：

```typescript
@Module({
  imports: [
    // ...
    OutboxModule.forRootAsync({
      useFactory: () => ({
        relay: { enabled: process.env.OUTBOX_RELAY !== 'off' },
        // A mail server that is down for a while doesn't lose the confirmation
        retry: { attempts: 10, backoff: { delay: '10s', maxDelay: '10m' } },
      }),
    }),
    // ...
  ],
  providers: [
    {
      // Messages and inbox records in your database, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
  ],
})
export class AppModule {}
```

`OrdersService` 添加消息而不是发送邮件，Drizzle 的 `tx`，因此消息提交或回滚顺序如下：

```typescript
async placeOrder({ customerId, items }: PlaceOrderDto): Promise<Order> {
  if (!(await this.customersRepository.findById(customerId))) {
    throw new BadRequestException(`Unknown customer "${customerId}"`);
  }
  if (!items?.length) {
    throw new BadRequestException('An order needs at least one item');
  }

  const order = await this.db.transaction(async (tx) => {
    const order = await this.insertOrder(tx, customerId, items);
    // Same transaction: the confirmation mail is queued only if the order commits
    await this.outbox.add(tx, { topic: 'order.placed', payload: order });
    return order;
  });

  this.outbox.notify(); // send now instead of at the next poll
  return order;
}
```

处理程序发送邮件：

```typescript
import { Injectable } from '@nestjs/common';
import { MailError, Mailer } from '@nestjs/mail';
import { NonRetryableMessageError, OnOutboxMessage, type OutboxHandlerContext } from '@nestjs/outbox';
import { CustomersRepository } from '../customers/customers.repository.js';
import type { Order } from '../orders/order.js';
import { OrderConfirmationMail } from './order-confirmation.mail.js';

@Injectable()
export class OrderMailsHandler {
  constructor(
    private readonly mailer: Mailer,
    private readonly customersRepository: CustomersRepository,
  ) {}

  // Runs after the order committed. The inbox skips messages this consumer already handled.
  @OnOutboxMessage('order.placed', { consumer: 'order-confirmation-mail' })
  async sendConfirmation(order: Order, { message, signal }: OutboxHandlerContext) {
    const customer = await this.customersRepository.findById(order.customerId);
    if (!customer) {
      throw new NonRetryableMessageError(`Customer ${order.customerId} not found`);
    }

    try {
      await this.mailer.send(OrderConfirmationMail, {
        to: { name: customer.name, address: customer.email },
        data: { order, customer },
        // Over SMTP, a redelivery of this message keeps its Message-ID; Resend gets the
        // key as its Idempotency-Key and refuses the duplicate
        idempotencyKey: message.id,
        signal,
        // The outbox retries with its own backoff, and dead-letters what never succeeds
        retry: false,
      });
    } catch (error) {
      // A refused address or sender won't be accepted later: dead-letter it now
      if (error instanceof MailError && error.permanent) {
        throw new NonRetryableMessageError(error.message, { cause: error });
      }
      throw error;
    }
  }
}
```

在中注册处理程序 `NotificationsModule`，其中导入 `CustomersModule` 对于存储库：

```typescript
@Module({
  imports: [CustomersModule],
  // The preview route renders mail with sample data; production doesn't need it
  controllers: process.env.NODE_ENV === 'production' ? [] : [MailPreviewController],
  providers: [OrderConfirmationMail, InvoicePdf, OrderMailsHandler],
})
export class NotificationsModule {}
```

的每个选项 `send()` 呼叫有工作：

- **`idempotencyKey`.** 发件箱至少发送一次：发送后崩溃的中继，在记录之前，会再次发送。密钥标识这些投递中的邮件。这个 `Message-ID` 头是从它派生出来的，所以结束了 SMTP 副本携带相同的 id，Gmail 和其他收件人使用该 id 丢弃它。`ResendTransport` 将密钥作为重新发送的 `Idempotency-Key` 重发 24 小时内拒绝重复。邮戳、发送网格和 SES 分配自己的 `Message-ID` 并且没有幂等键，因此有了它们，重新交付可以到达客户两次。
- **`signal`.**当处理程序的寿命超过 `publishTimeout` 时，中继将中止它。邮件程序停止 SMTP 交换或 HTTP 请求。
- **`retry: false`.**默认情况下，邮件程序会重试三次暂时性故障，并带有退避功能。在这里，发件箱已经重试，超过几分钟而不是几秒钟，所以邮件发送者每次投递尝试一次。两层的重试都会成倍增加。

包抛出的每个错误都会扩展 `MailError`，及其 `permanent` 标志表示再次发送相同的消息是否可以成功。一个 4xxSMTP 回复（灰名单，一个完整的邮箱），一个 429 来自一个 HTTP 提供程序，超时或丢弃的连接是瞬时的：处理程序重新抛出它，发件箱重试。5xx 回复，例如 `550 5.1.1 User unknown`，是永久的：处理程序抛出 `NonRetryableMessageError` 发件箱死信一次发送消息，而不是尝试十次。

当 SMTP 拒绝几个收件人中的一个时，事务在发送消息之前被重置，因此错误总是意味着没有人收到它，发件箱的重试不能传递两次。一个例外：消息传输后，在服务器响应之前，连接中断。邮件发送者无法知道服务器是否保留了它，报告了一个瞬时错误，重试再次发送它，使用相同的 `Message-ID`。

**对于 TypeORM。**对于 ORM 为 TypeORM 的应用程序，相同的订单事务。Drizzle 保持教程的路径：取这段代码，而不是上面的 Drizzle 代码，而不是它旁边。outbox 通过 TypeORM 的数据源上的同一个存储来保存它的消息，如 outbox 教程的 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 所示。示例应用程序将此版本保留在教程的 Drizzle 代码旁边的 `src/typeorm` 中，以客户、产品和订单为实体。

`TypeOrmModule` 取代了根模块中的 `DrizzleModule`，具有 TypeORMCLI 共享的选项，商店工厂注入其 `DataSource`，通过 `fromTypeOrm()`：

```typescript
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // The entities and migrations the CLI uses; migrations run on deploy (`migration:run`)
      useFactory: () => ({ ...dataSourceOptions, url: process.env.DATABASE_URL }),
    }),
    // ...
    OutboxModule.forRootAsync({
      useFactory: () => ({
        relay: { enabled: process.env.OUTBOX_RELAY !== 'off' },
        // A mail server that is down for a while doesn't lose the confirmation
        retry: { attempts: 10, backoff: { delay: '10s', maxDelay: '10m' } },
      }),
    }),
    // ...
  ],
  providers: [
    {
      // Messages and inbox records in your database, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [DataSource, OutboxStorage],
      useFactory: (dataSource: DataSource, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromTypeOrm(dataSource) }, outboxStorage),
    },
  ],
})
export class AppModule {}
```

`OrdersService` 打开其与数据源的事务，并将事务的实体管理器传递给 `outbox.add()`，旁边是它自己的写。发件箱的类型参数是 TypeORM 的 `EntityManager`：

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customersRepository: CustomersRepository,
    private readonly outbox: Outbox<EntityManager>,
  ) {}

  async placeOrder({ customerId, items }: PlaceOrderDto): Promise<Order> {
    // ... check the customer and the items, as in the Drizzle version

    const order = await this.dataSource.transaction(async (manager) => {
      const order = await this.insertOrder(manager, customerId, items);
      // The transaction's EntityManager: the confirmation mail is queued only if the order commits
      await this.outbox.add(manager, { topic: 'order.placed', payload: order });
      return order;
    });

    this.outbox.notify(); // send now instead of at the next poll
    return order;
  }

  private async insertOrder(manager: EntityManager, customerId: string, items: PlaceOrderDto['items']): Promise<Order> {
    const found = await manager.findBy(ProductEntity, { id: In(items.map((item) => item.productId)) });
    // ... price the lines and total them, as in the Drizzle version
    // The database numbers the order from its sequence: 1001, 1002, ...
    const { generatedMaps } = await manager.insert(OrderEntity, { id, customerId, items: lines, total, placedAt });
    const { number } = generatedMaps[0] as Pick<OrderEntity, 'number'>;
    return { id, number, customerId, items: lines, total, placedAt: placedAt.toISOString() };
  }
}
```

`OrderEntity` 声明 `number` 为标识列（`generated: 'identity'`），因此 `manager.insert()` 返回数据库在 `generatedMaps` 中分配的编号。实体不能声明序列从哪里开始，因此示例的种子迁移在 1001 重新启动它，在它插入的客户和产品旁边。处理程序和 `NotificationsModule` 保持原样；`CustomersRepository` 用 TypeORM 读取客户，就像应用程序的其余部分一样。

#### 投入生产

开发将文件写入容器在被替换时丢失的本地磁盘；生产需要真正的运输。从环境中选择它，以便在任何地方运行相同的构建：

```typescript
import { FileMailTransport, ResendTransport, SmtpTransport, type MailTransport } from '@nestjs/mail';
import { readFileSync } from 'node:fs';

/**
 * The transport for this environment: `file` in development (the default), `smtp` or
 * `resend` in production. Missing settings fail at startup, naming the variable.
 */
export function mailTransport(env: NodeJS.ProcessEnv = process.env): MailTransport {
  switch (env.MAIL_TRANSPORT ?? 'file') {
    case 'file':
      return new FileMailTransport({ directory: env.MAIL_DIRECTORY ?? 'var/mail' });
    case 'smtp':
      return new SmtpTransport({
        url: required(env, 'SMTP_URL'), // smtp://user:password@smtp.example.com:587
        pool: true,
        // A private CA, e.g. for a relay inside the company network
        ...(env.SMTP_CA_FILE && { tls: { ca: readFileSync(env.SMTP_CA_FILE) } }),
      });
    case 'resend':
      return new ResendTransport({ apiKey: required(env, 'RESEND_API_KEY') });
    default:
      throw new Error(`MAIL_TRANSPORT must be "file", "smtp" or "resend" (got "${env.MAIL_TRANSPORT}")`);
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required when MAIL_TRANSPORT is "${env.MAIL_TRANSPORT}"`);
  }
  return value;
}
```

在 `forRootAsync()` 中构建传输。工厂在启动时运行，因此 `MAIL_TRANSPORT` 中的错别字或缺少 `SMTP_URL` 会停止应用程序，而不是导致第一封邮件失败：

```typescript
MailModule.forRootAsync({
  // Runs at startup: a bad MAIL_TRANSPORT or a missing SMTP_URL stops the app there
  useFactory: () => ({
    transport: mailTransport(),
    templates: new FileTemplateEngine({
      dir: join(import.meta.dirname, 'mail/templates'),
      layout: 'layout',
      cache: process.env.NODE_ENV === 'production',
    }),
    from: process.env.MAIL_FROM ?? 'Orders <orders@example.com>',
  }),
}),
```

**SMTP.** `SmtpTransport` 在 `node:net` 和 `node:tls` 上说话 SMTP：

- **加密。**在端口 587 上，it 升级为 STARTTLS，以及不提供 STARTTLS 被拒绝，而不是以明文形式发送到。 `startTls: 'opportunistic'` 本地主机的默认值，仅在服务器提供本地主机时升级，并且 `'never'` 保持明文，用于可信网络上的中继。端口 465（`smtps://`）它使用 TLS 从第一个字节开始。根据主机名验证证书； `tls.ca` 添加私有 CA.除了发送到本地主机之外，从不通过未加密的连接发送凭据。
- **身份验证。**它使用 AUTH PLAIN 或者 LOGIN，无论服务器提供哪个，以及 `authMethod` 力一。对于 Gmail 和 Microsoft 365，将 OAuth 访问令牌传递为 `accessToken` 在 `auth` 为了 XOAUTH2.OAuth 访问令牌通常在一小时后过期，因此 `accessToken` 也可以是一个返回一个的函数，或者是一个的承诺：它是为每个新连接调用的，并且可以获取一个新的令牌。 `name` 设置传输引入的名称 `EHLO`;默认值是完全限定时计算机的主机名，否则它的 IP 地址。
- **汇集。**`pool: true` 保持最多五个连接打开并重用它们，而不是一个 TCP 和 TLS 每封邮件握手。对象设置限制：`maxConnections`（默认值 5；进一步发送等待空闲连接），`maxMessages`（默认值为 100，之后替换连接）以及 `idleTimeout`（默认 `'30s'`，之后空闲连接被关闭）。每个连接都说 `QUIT` 当应用程序关闭时。
- **回复。** 4xx 回复是暂时的 `MailSmtpError`，一个 5xx 回复一个永久的。两者都携带着答案 `code` 增强型代码（例如 `5.1.1`）和服务器的文本。

用 DKIM 当你的 SMTP 服务器没有，添加 `dkim` 使用域（`domainName`），选择器（`keySelector`）和私钥（`privateKey`, PEM 或者一个 `KeyObject`).安 RSA 关键标志 `rsa-sha256`，Ed25519 密钥 `ed25519-sha256` (RFC 8463);并非每个接收器都验证 Ed25519 签名，传输签名只需一个密钥，因此 RSA 除非您知道收件人的服务器是安全的选择。签名包括从，回复-到，到，抄送，主题，日期，消息-ID 和 MIME 标题，加上消息的自定义标题； `dkim.headers` 替换该列表。From 总是有签名的，并且列出的次数比它在消息中出现的次数多，所以在签名下面添加的第二个 From 会破坏它。 HTTP 提供者自己与您的验证域签名。

**HTTP 供应商。** `ResendTransport`, `PostmarkTransport`, `SendGridTransport` 和 `SesTransport` 调用提供程序的 API `fetch`，并且不需要 SDK.这 `fetch` 选项替换全局选项，以通过代理或存根 API 在测试中。 `SesTransport` 用 AWS 签名版本 4，并接受 AWS SDK 的凭据提供程序（如实例角色） `credentials`.在这四个键中，只有 Resend 支持幂等键。Resend 和 SendGrid 至少需要一个 `to` 收件人：一封只有 `cc` 或者 `bcc` 失败 `MailMessageError` 在请求之前。

**国际化地址。**具有非-ASCII 字符（`zoë@kočka.example`）转换为其 ASCII 形式（IDNA, `xn--...`) 用于每个传输，因此没有服务器必须支持它。一个非-ASCII 本地部分，在 `@`，无法转换：结束 SMTP 它需要服务器的 SMTPUTF8 延伸。 `SmtpTransport` 使用 SMTPUTF8 当服务器提供它时，否则会因永久 `MailConnectionError` 在发送任何内容之前： `The SMTP server ... doesn't support SMTPUTF8, which an address with non-ASCII characters needs`.这 HTTP 提供者获得的地址是原样的，他们是否接受它取决于提供者。

使用 `app.enableShutdownHooks()` 在 `main.ts`，因此部署允许中继完成它正在发送的邮件，并关闭 SMTP 游泳池后。

#### 以客户的语言发送

这家商店用英语和波兰语出售。客户在注册时选择一种语言，`customers` 表将其存储在 `locale` 列中：`en` 或 `pl`。邮件程序将每次发送的区域设置交给模板引擎，模板引擎为它选择模板。

翻译模板：添加 `order-confirmation.pl.html` 在英国的旁边。

```html
<p>Cześć {{ customer.name }},</p>
<p>dziękujemy za zamówienie! Właśnie je pakujemy.</p>
<table>
  <tr><th>Produkt</th><th>Ilość</th><th>Cena</th></tr>
  {{#each items}}
  <tr>
    <td>{{ name }}</td>
    <td>{{ quantity }}</td>
    <td>{{ price }}</td>
  </tr>
  {{/each}}
</table>
<p><strong>Razem: {{ total }}</strong></p>
<p><a href="{{ orderUrl }}">Zobacz zamówienie</a></p>
<p>Fakturę znajdziesz w załączniku.</p>
```

对于区域设置 `pl`, `FileTemplateEngine` 效果图 `order-confirmation.pl.html`，对于任何其他区域设置，或者没有， `order-confirmation.html`.区域设置首先尝试自己，然后是它的语言：for `pt-BR`，引擎寻找 `order-confirmation.pt-BR.html`,然后 `order-confirmation.pt.html`.部分和布局以相同的方式查找，因此布局保持共享，并且波兰签名是其自身的部分：

```html
<p>Zespół obsługi klienta</p>
```

邮件的副本是散文，所以它一次翻译一个文件：译者看到整封邮件，写波兰语句子，而不是一个接一个地填写键。邮件类计算的内容仍然取决于区域设置：主题、发票文件名和价格。他们来自 `@nestjs/i18n`，其中 [国际化分会](/application/i18n) 深度覆盖。为邮件添加一个目录，每种语言一个：

```json
{
  "orderConfirmation": {
    "subject": "Your order #{number}",
    "invoiceFile": "invoice-{number}.pdf"
  }
}
```

```json
{
  "orderConfirmation": {
    "subject": "Twoje zamówienie #{number}",
    "invoiceFile": "faktura-{number}.pdf"
  }
}
```

注册目录的形状，以便在编译时检查键，并在 `MailModule` 旁边注册 `I18nModule`：

```typescript
import type mail from './en/mail.json';

export interface Translations {
  mail: typeof mail;
}

declare module '@nestjs/i18n' {
  interface I18nTypes {
    translations: Translations;
  }
}
```

```typescript
@Module({
  imports: [
    // ...
    I18nModule.forRoot({
      defaultLocale: 'en',
      supportedLocales: ['en', 'pl'],
      loader: new JsonI18nLoader({ path: join(import.meta.dirname, 'i18n') }),
    }),
    MailModule.forRootAsync({
      // ...
    }),
    // ...
  ],
})
export class AppModule {}
```

将目录添加到中的资产中 `nest-cli.json` 太（`i18n/**/*.json`），如国际化章节所示。

邮件类是一个提供程序，因此它注入 `I18nService` 在发票渲染器旁边。`render()` 获取第二个参数，渲染上下文，其 `locale` 是传给 `send()`，以及邮件程序交给模板引擎的那个。它的 `to` 保存已解析的收件人，并且对于没有它们呈现的预览为空：

```typescript
type Key = keyof Translations['mail']['orderConfirmation'];

const SHOP_URL = process.env.SHOP_URL ?? 'https://shop.example.com';
const LOGO = join(import.meta.dirname, 'assets/logo.png');

@Injectable()
export class OrderConfirmationMail implements Mailable<OrderConfirmation> {
  constructor(
    private readonly i18nService: I18nService,
    private readonly invoicePdf: InvoicePdf,
  ) {}

  render({ order, customer }: OrderConfirmation, { locale }: MailRenderContext) {
    // Mail is sent outside the customer's request, so the locale is always passed explicitly
    const t = (key: Key, args?: Record<string, unknown>) =>
      this.i18nService.t(`mail.orderConfirmation.${key}`, { locale, args });
    const price = (cents: number) =>
      this.i18nService.formatNumber(cents / 100, { locale, style: 'currency', currency: 'USD' });
    return {
      subject: t('subject', { number: order.number }),
      // order-confirmation.pl.html for Polish, else order-confirmation.html
      template: 'order-confirmation',
      // ...
      attachments: [
        // Inline: the layout's <img> references it by its cid
        { cid: 'logo@example.com', path: LOGO },
        { filename: t('invoiceFile', { number: order.number }), content: this.invoicePdf.render(order, customer) },
      ],
    };
  }
}
```

上下文不会改变：相同的值填充两个模板。`Key` 是 `keyof Translations['mail']['orderConfirmation']`，因此拼写错误的键是编译错误。价格按区域设置格式：`$25.98` 英语，`25,98 USD` 波兰语。发票的文件名来自目录：`invoice-1001.pdf` 或 `faktura-1001.pdf`。

> warning **Warning** 显式传递区域设置。`I18nService` 返回到当前请求的区域设置，邮件通常会在收件人的请求之外发送：从发件箱处理程序（如这里），或者从其他人（如管理员）发出的请求发送。该请求的区域设置不正确。

发送时，发件箱处理程序会传递客户的区域设置：

```typescript
await this.mailer.send(OrderConfirmationMail, {
  to: { name: customer.name, address: customer.email },
  data: { order, customer },
  locale: customer.locale,
  // ...
});
```

波兰语主题或收件人姓名不能放入邮件头中，因为它是：邮件头是 ASCII.邮件程序编码非-ASCII 标题文本为 RFC 2047 个编码字，例如 `=?UTF-8?Q?Twoje_zam=C3=B3wienie_=231001?=`，并且主体为可引用可打印，因此每个服务器都不变地携带消息，邮件客户端显示 `Twoje zamówienie #1001`.

预览从查询字符串中获取语言，因此可以在浏览器中检查两个版本：

```typescript
/** Renders the mail with sample data, without sending it: GET /dev/mail/order-confirmation?locale=pl */
@Get('order-confirmation')
@Header('content-type', 'text/html; charset=utf-8')
async orderConfirmation(@Query('locale') locale = 'en') {
  const message = await this.mailer.render(OrderConfirmationMail, { data: SAMPLE, locale });
  // ...
}
```

#### 使用另一个模板引擎

`FileTemplateEngine` 工具 `MailTemplateEngine`，具有一个方法的抽象类：`render()` 获取模板的名称、上下文和区域设置，并返回 HTML，或具有 `html` 和 `text`，或者两者的承诺。扩展它以使用手柄进行渲染，EJS 或者别的什么。中的车把模板引擎 `.hbs` 文件：

```typescript
import { MailTemplateEngine, MailTemplateError, type MailTemplateRenderOptions } from '@nestjs/mail';
import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEMPLATES = join(import.meta.dirname, 'templates');

/** Renders order-confirmation.pl.hbs, else order-confirmation.hbs, with Handlebars. */
export class HandlebarsTemplateEngine extends MailTemplateEngine {
  private readonly templates = new Map<string, ReturnType<typeof Handlebars.compile> | undefined>();

  async render(name: string, context: object, { locale }: MailTemplateRenderOptions) {
    // Only a language code goes into a file name, never whatever the locale holds
    const localized = locale && /^[a-z]{2}$/.test(locale) ? [`${name}.${locale}.hbs`] : [];
    for (const file of [...localized, `${name}.hbs`]) {
      const template = await this.load(file);
      if (template) {
        return template(context);
      }
    }
    throw new MailTemplateError(`No template "${name}" in ${TEMPLATES}`, { template: name });
  }

  private async load(file: string) {
    if (!this.templates.has(file)) {
      const source = await readFile(join(TEMPLATES, file), 'utf8').catch(() => undefined);
      // compat: plain paths fall back to outer contexts, as in FileTemplateEngine
      this.templates.set(file, source === undefined ? undefined : Handlebars.compile(source, { compat: true }));
    }
    return this.templates.get(file);
  }
}
```

将其传递为 `templates` 代替 `FileTemplateEngine`：实例或类，Nest 实例化，因此它可以注入配置或其他提供程序。与运输一样，一个班级处于最高水平 `forRootAsync()`，旁边 `useFactory`，工厂返回实例。

邮件发送 HTML 当引擎返回时，转义是引擎的工作：车把转义双大括号值，如 `FileTemplateEngine` 是的。 `compat: true` 在里面扬名 `#each` 回到外部上下文，因此本教程中的模板在车把下呈现。车把不知道 `partials/` 文件夹和布局：使用 `Handlebars.registerPartial()`，并自己渲染邮件周围的布局。为了 [MJML](https://mjml.io)，转换渲染 MJML 和 `mjml2html()` 在返回之前 HTML.扔 `MailTemplateError` 对于丢失或损坏的模板：它是永久的，所以发件箱会死信邮件，而不是重试。

#### 编写您自己的传输

对于包不运送传输的提供者，请扩展 `MailTransport`.其 `send()` 获取完成的消息，并在提供者接受后进行解析。邮件枪的运输工具，其 `messages.mime` 端点将消息视为 MIME，方式 `SesTransport` 发送到 SES:

```typescript
import {
  MailProviderError,
  MailTransport,
  type MailMessage,
  type MailTransportResult,
  type MailTransportSendOptions,
} from '@nestjs/mail';

export interface MailgunTransportOptions {
  domain: string;
  apiKey: string;
  /** `https://api.eu.mailgun.net` for a domain in the EU region. */
  baseUrl?: string;
}

/** Sends the finished MIME message through Mailgun's `messages.mime` endpoint. */
export class MailgunTransport extends MailTransport {
  readonly #apiKey: string;
  private readonly url: string;

  constructor({ domain, apiKey, baseUrl = 'https://api.mailgun.net' }: MailgunTransportOptions) {
    super();
    this.#apiKey = apiKey;
    this.url = `${baseUrl}/v3/${encodeURIComponent(domain)}/messages.mime`;
  }

  async send(message: MailMessage, { signal }: MailTransportSendOptions): Promise<MailTransportResult> {
    const form = new FormData();
    // The envelope names every recipient; the MIME message leaves Bcc out
    form.append('to', message.envelope.to.join(','));
    form.append('message', new Blob([new Uint8Array(message.toMime())]), 'message.eml');

    // An abort rejects with signal.reason; a network error is transient, so the mailer retries it
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`api:${this.#apiKey}`).toString('base64')}` },
      body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      // Permanent for 4xx except 408, 409 and 429: those and 5xx are retried
      throw new MailProviderError({
        provider: 'mailgun',
        status: response.status,
        detail: await response.text(),
        ...(retryAfter > 0 && { retryAfterMs: retryAfter * 1_000 }),
      });
    }

    const { id } = (await response.json()) as { id?: string };
    return { accepted: message.envelope.to, providerMessageId: id };
  }
}
```

将实例作为 `transport` 以及内置传输。`send(message, options)` 得到：

- **`message`.** A `MailMessage`，已验证并冻结：`from`、`to`、`cc`、`bcc`、`replyTo`、`subject`、`html`、`text`、`attachments`、`headers` 和 `messageId`。`envelope` 保存 SMTP 信封，每个收件人一次，包括密件抄送，`toMime()` 以 MIME 的形式返回消息，没有密件抄送头。每次尝试都是同一个物体。
- **`signal`.** 当呼叫者取消发送时中止，例如当处理程序超时时中止发件箱中继。停止请求，并用 `signal.reason`;邮件程序不会重试中止。
- **`idempotencyKey`.**呼叫者的密钥，每次尝试和每次重新投递时都是相同的。将其发送到对请求进行重复数据删除的提供程序，如 `ResendTransport` 确实；这个 `Message-ID` 已经从它派生出来了。
- **`attempt`.** 1 表示第一次尝试，2 表示第一次重试。

它决心 `accepted`，提供者接受的信封收件人（省略时的所有收件人），`providerMessageId` 和 `response` 邮递员的 `send()` 依次决心。

它抛出的内容决定了邮件器是否重试。扔一个 `MailError` 谁的 `permanent` 说明是否再次发送相同的消息可以成功： `MailProviderError` 对于一个 HTTP API 的拒绝，这对于 4xx 状态是永久性的，除非您通过 `permanent` 你自己， `MailConnectionError` 和 `MailTimeoutError` 对于失败或缓慢的请求。任何其他错误都算作暂时性的，除非 `permanent: true` 或者 4xx `status`，所以网络错误来自 `fetch` 正在重试。错误 `retryAfterMs` 使邮件发送者在下次尝试之前至少等待那么长时间，直到 `maxDelay`.

保存连接或客户端实现的传输 `close()`，在飞行中发送完成后，在应用程序关闭时运行。

#### 试试

应用迁移，这也会添加两个客户和四个产品：

```bash
$ export DATABASE_URL=postgres://localhost:5432/store
$ npx drizzle-kit migrate
```

使用默认设置启动应用程序：文件传输和中继运行。为 Ada 下订单：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"customerId":"ada","items":[{"productId":"salmon-kibble-2kg","quantity":2},{"productId":"feather-wand","quantity":1}]}'
{"id":"fd2bfc1c-db5c-455c-8876-bf7331a1029c","number":1001,"customerId":"ada","items":[{"productId":"salmon-kibble-2kg","name":"Salmon kibble, 2 kg","quantity":2,"price":2499},{"productId":"feather-wand","name":"Feather wand toy","quantity":1,"price":799}],"total":5797,"placedAt":"2026-09-25T10:59:00.173Z"}
```

在发送任何邮件之前，响应会返回。片刻之后，中继的处理程序呈现邮件，文件传输将其写入：

```bash
[Nest] 37252  - 09/25/2026, 12:59:00 PM     LOG [FileMailTransport] "Your order #1001" to ada@example.com written to var/mail/2026-09-25T10-59-00-199Z--LtIZd5B_AiZek3-x8nOt88YfUYjgkZi-42ff80.eml
```

文件是完全相同的消息 SMTP 会传播它。它的标题和文本部分：

```bash
$ head -33 var/mail/*.eml
From: Orders <orders@example.com>
To: Ada Lovelace <ada@example.com>
Subject: Your order #1001
Date: Fri, 25 Sep 2026 10:59:00 +0000
Message-ID: <-LtIZd5B_AiZek3-x8nOt88YfUYjgkZi@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="=_bTCd1MQ5LoxTNFNN0nLRwu8d"

--=_bTCd1MQ5LoxTNFNN0nLRwu8d
Content-Type: multipart/alternative; boundary="=_9HVDyVBGuLsAaijTpu4Y2_XU"

--=_9HVDyVBGuLsAaijTpu4Y2_XU
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Hi Ada Lovelace,

thank you for your order! We are packing it now.

Product Qty Price
Salmon kibble, 2 kg 2 $49.98
Feather wand toy 1 $7.99

Total: $57.97

View your order (https://shop.example.com/orders/fd2bfc1c-db5c-455c-8876-bf=
7331a1029c)

Your invoice is attached.

The customer care team
--=_9HVDyVBGuLsAaijTpu4Y2_XU
Content-Type: multipart/related; boundary="=_u7PgKDXrb-x3mIz35ZArIBAa"
```

需要注意的几件事：

- 这个 `Message-ID` 是从发件箱消息的 id 派生的，而不是随机的。重新交付将携带相同的一个。
- 文本部分源自 HTML，并写出链接。
- 正文是可引用打印的，这使得每一行对于任何邮件服务器来说都足够短：`=` 在链接的第一行的末尾，将其与下一行连接起来。

这个 HTML，徽标和发票如下：

```bash
$ grep -E '^Content-(Type|Disposition|ID):' var/mail/*.eml | tail -5
Content-Type: image/png; name="logo.png"
Content-Disposition: inline; filename="logo.png"
Content-ID: <logo@example.com>
Content-Type: application/pdf; name="invoice-1001.pdf"
Content-Disposition: attachment; filename="invoice-1001.pdf"
```

在邮件客户端中打开文件以查看呈现的邮件。要处理模板，请在浏览器中打开预览。回复是邮件的 HTML，布局中的模板，徽标内联为 `data:`URL（此处缩写）：

```bash
$ curl localhost:3000/dev/mail/order-confirmation
```

```html
<!DOCTYPE html>
<html>
<body>
<p><img src="data:image/png;base64,…" alt="Logo" width="120" height="32"></p>
<p>Hi Ada Lovelace,</p>
<p>thank you for your order! We are packing it now.</p>
<table>
  <tr><th>Product</th><th>Qty</th><th>Price</th></tr>
  <tr>
    <td>Salmon kibble, 2 kg</td>
    <td>2</td>
    <td>$49.98</td>
  </tr>
  <tr>
    <td>Feather wand toy</td>
    <td>1</td>
    <td>$7.99</td>
  </tr>
</table>
<p><strong>Total: $57.97</strong></p>
<p><a href="https://shop.example.com/orders/00000000-0000-4000-8000-000000000000">View your order</a></p>
<p>Your invoice is attached.</p>

<p>The customer care team</p>
</body>
</html>
```

接下来，订购一个不存在的产品：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"customerId":"ada","items":[{"productId":"salmon-kibble-2kg","quantity":1},{"productId":"catnip-mouse","quantity":1}]}'
{"message":"Unknown product \"catnip-mouse\"","error":"Bad Request","statusCode":400}
```

事务回滚，`order.placed` 用它发消息，没有邮件写。

最后，请参阅 [客户的语言](/application/mail#send-it-in-the-customers-language) 在工作。为 Zofia 下订单，她在注册时选择了波兰语：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"customerId":"zofia","items":[{"productId":"feather-wand","quantity":1}]}'
{"id":"7fa5ce1f-9ef3-49b0-8de9-a2d98056c299","number":1002,"customerId":"zofia","items":[{"productId":"feather-wand","name":"Feather wand toy","quantity":1,"price":799}],"total":799,"placedAt":"2026-09-25T10:59:00.424Z"}
```

```bash
[Nest] 37252  - 09/25/2026, 12:59:00 PM     LOG [FileMailTransport] "Twoje zamówienie #1002" to zofia@example.com written to var/mail/2026-09-25T10-59-00-453Z-GnMdyKUxVa0FRBJ6wZ2k5snIWsdQmwC2-697a51.eml
```

身体来自 `order-confirmation.pl.html`。波兰主题和 Zofia 的名字以编码单词的形式到达文件，她的发票是 `faktura-1002.pdf`：

```bash
$ head -3 var/mail/2026-09-25T10-59-00-453Z-GnMdyKUxVa0FRBJ6wZ2k5snIWsdQmwC2-697a51.eml
From: Orders <orders@example.com>
To: =?UTF-8?Q?Zofia_W=C3=B3jcik?= <zofia@example.com>
Subject: =?UTF-8?Q?Twoje_zam=C3=B3wienie_=231002?=
```

#### 检测

将传输替换为 `InMemoryMailTransport`。它保存收到的每一封邮件，并有助手找到并阅读它：

```typescript
import { PGlite } from '@electric-sql/pglite';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailSmtpError, MailTransport } from '@nestjs/mail';
import { OutboxDeadLetters, OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import * as schema from '../src/database/schema.js';
import { OrderConfirmationMail } from '../src/notifications/order-confirmation.mail.js';
import { OrdersService } from '../src/orders/orders.service.js';

describe('Order confirmation mail', () => {
  const client = new PGlite(); // PostgreSQL in-process
  const mailbox = new InMemoryMailTransport();
  let moduleRef: TestingModule;
  let orders: OrdersService;
  let relay: OutboxRelay;

  beforeAll(async () => {
    const db = drizzle(client, { schema });
    // Your migrations: the tables, and the seeded customers and products. The outbox's store
    // creates its own schema in init().
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    process.env.OUTBOX_RELAY = 'off'; // no poll loop: the test drives the relay
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db) // the outbox's store runs on it too
      .overrideProvider(MailTransport)
      .useValue(mailbox)
      .compile();
    await moduleRef.init();
    orders = moduleRef.get(OrdersService);
    relay = moduleRef.get(OutboxRelay);
  });

  afterAll(async () => {
    await moduleRef.close();
    await client.close();
  });

  beforeEach(() => mailbox.clear());

  it('confirms the order with the invoice and a link to it', async () => {
    const order = await orders.placeOrder({ customerId: 'ada', items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] });
    mailbox.assertNotSent(); // nothing until the relay publishes the committed order

    await relay.runOnce();

    const mail = mailbox.assertSent({ to: 'ada@example.com', mail: OrderConfirmationMail });
    expect(mail.subject).toBe(`Your order #${order.number}`);
    expect(mail.attachment(`invoice-${order.number}.pdf`).contentType).toBe('application/pdf');
    expect(mail.link('/orders/').pathname).toBe(`/orders/${order.id}`);
  });

  it('dead-letters a confirmation the mail server refuses', async () => {
    mailbox.failNext(new MailSmtpError('RCPT TO', { code: 550, text: 'User unknown' }));
    await orders.placeOrder({ customerId: 'ada', items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] });

    await relay.runOnce();

    mailbox.assertNotSent();
    const [deadLetter] = await moduleRef.get(OutboxDeadLetters).list();
    expect(deadLetter).toMatchObject({ topic: 'order.placed', reason: 'rejected' });
  });
});
```

- **除了网络，一切都是真实的。**邮件类呈现其模板，目录和发票提供程序、发件箱和收件箱运行，邮件就完全构建好了，包括标题和附件。只有交付被替换。
- **数据库是 PostgreSQL，正在处理中。** PGlite（`@electric-sql/pglite`，dev 依赖项）运行您的实际迁移，测试覆盖数据库 `DrizzleModule` 寄存器（其令牌来自 `getDrizzleToken()`)，因此存储库和发件箱存储使用它。没有服务器可以启动，每个测试文件都有一个新的数据库。
- **`assertSent()`**按收件人返回匹配的最近邮件（`to` 匹配，抄送和密件抄送），`subject`、邮件类或 `template`，或谓词。当没有匹配的内容时，它会抛出一个错误，列出已发送的内容。`assertNotSent()`,`filter()`,`find()` 和 `mails` 覆盖其余的。助手抛出简单的错误，所以他们可以与任何测试运行者一起工作。
- **`link()`**返回邮件中包含字符串或匹配正则表达式的第一个链接，作为 `URL`.对于密码重置或神奇链接，这就是整个测试：发送邮件，然后打电话 `mail.link('/reset-password').searchParams.get('token')` 并点击链接。实体被解码，因此 `&amp;` 转义查询字符串中的写入是 `&` 再一次。
- **`failNext()`**进行下一次发送投掷，这里是永久的 SMTP 错误，用于测试错误路径。
- **`raw`**消息是 MIME，和 `mailer.render()` 单独呈现邮件类或模板，用于模板的单元测试。

#### 生产检查表

- 配置 SPF,DKIM 和 DMARC 对于发送域。HTTP 提供者与 DKIM 一旦域名与他们一起验证；和 SMTP，用 `dkim` 选项或在继电器。
- 保持 STARTTLS 需要，并进行证书验证。用于与私人 CA, 通过 `tls.ca` 而不是关闭验证。
- 将凭据保存在环境或秘密存储中。传输将它们保存在私有字段中，错误消息永远不会包含它们。
- 提交后通过发件箱发送事务性邮件，使用 `retry: false` 在处理程序和发件箱的重试策略中，大小取决于您的提供者可以关闭多长时间。
- 通过 `idempotencyKey` 对于从可以运行两次的处理程序发送的每封邮件。
- 将永久性邮件错误转换为死信，并打开警报 `dead-lettered` 发件箱事件。被拒绝的地址通常意味着注册时的错别字，或者一个不复存在的邮箱。
- 观看 `MailEvents`，或 `nestjs:mail:sent` 和 `nestjs:mail:failed` 诊断通道，用于传递失败和发送缓慢。
- 在生产中通过 `SmtpTransport` 或 HTTP 供应商的运输工具发送。`FileMailTransport` 写入本地磁盘，容器在重新启动或被替换时丢失本地磁盘，`LogMailTransport` 只日志：两者都用于开发，`InMemoryMailTransport` 用于测试。当其中一个模块使用 `NODE_ENV=production` 运行时，该模块在启动时发出警告。
- 将发件箱的消息保留在应用程序的数据库中，通过 `PostgresOutboxStore` 或另一个注册存储，因此排队邮件提交其订单并在重新启动后存活。没有存储，发件箱拒绝从 `NODE_ENV=production`，存储在未应用迁移时也是如此：在部署时应用它们，如 [发件箱教程](/reliability/outbox#keep-messages-in-your-database) 显示。
- 将模板运送到 `dist` 与 CLI 的资产，并在生产中保持模板缓存打开，这是默认值：`cache: false` 重新读取每封邮件的文件。
- 不要在生产中注册仅开发的路由，如预览。
- 使用 `app.enableShutdownHooks()`，因此部署等待飞行中的邮件并关闭 SMTP 联系。

#### 参考

##### 模块选项

`MailModule.forRoot()` 获取这些选项，`forRootAsync()` 工厂返回它们。用 `useClass` 或 `useExisting` 代替 `useFactory`，类实现了 `MailOptionsFactory`，其 `createMailOptions()` 返回它们。`transport`、`templates`、`imports` 和 `isGlobal` 也位于 `forRootAsync()` 中的 `useFactory`、`useClass` 或 `useExisting` 旁边。解析的选项在 `MAIL_MODULE_OPTIONS` 令牌下提供。

| 选择 | 类型 | 默认的 | 描述 |
| --- | --- | --- | --- |
| `transport` | `MailTransport` 实例或类 | 无（必填） | 邮件如何离开应用程序。一个类由 Nest 实例化，因此它可以注入配置。参见 [Send in production](/application/mail#send-in-production)。 |
| `templates` | `MailTemplateEngine` 实例或类 | 没有一个 | 呈现命名为 `template`：`FileTemplateEngine` 或 [你自己的](/application/mail#use-another-template-engine) 的邮件。一个类由 Nest 实例化。如果没有模板，带有模板的邮件将失败 `MailTemplateError`。 |
| `from` | 地址 | 没有一个 | 默认发件人。没有发件人的消息使用 `MailMessageError` 失败。 |
| `replyTo` | 地址或数组 | 没有一个 | 默认的回复。 |
| `headers` | `Record<string, string>` | 没有一个 | 添加到每条消息中。消息自己的标题获胜。 |
| `retry` | 号码，`false` 或重试选项 | 3 次尝试 | 每次发送的尝试次数，后退来自 `1s` 加倍至 `30s`，全抖动。 `false` 进行一次尝试。看 [Send after the order commits](/application/mail#send-after-the-order-commits). |
| `imports` | 模块 | 没有一个 | 传输或模板引擎类注入其导出的模块。 |
| `isGlobal` | `boolean` | `true` | 寄存器 `Mailer`,`MailEvents`,`MailTransport` 和 `MailTemplateEngine` 全球范围内。 |

重试选项是 `attempts`（总计，包括第一个），`backoff`（一个对象 `delay`,`factor`,`maxDelay` 和 `jitter`，或尝试的函数）和 `retryIf`（只能缩小重试哪些瞬态错误的范围）。当一个 HTTP 提供者回答 `Retry-After` 头，通常是 429 或 503，错误将其保持为 `retryAfterMs`，并且邮件程序在下一次尝试之前至少等待那么长时间，直到 `maxDelay`(`30s` 具有后退功能）。这个 `signal` 等待仍然结束。SMTP 回复没有 `Retry-After` 和一个发件箱处理程序 `retry: false` 等待发件箱的回退。

##### 模板引擎

`FileTemplateEngine` 需要：

| 选择 | 类型 | 默认的 | 描述 |
| --- | --- | --- | --- |
| `dir` | `string` | 无（必填） | 模板目录，其中包含部分 `partials/` 文件夹。根据工作目录解析相对路径。 |
| `layout` | `string` | 没有一个 | 包装每封电子邮件的 HTML 的模板，在 `body` 周围用三个大括号放置。`.txt` 版本（如果有的话）会包装文本。 |
| `cache` | `boolean` | `true` | 将编译好的模板以及存在的文件保存在内存中。`false` 读取每封邮件的文件，查看正在进行的编辑。 |

`template: 'order-confirmation'` 使用区域设置 `pt-BR` 呈现存在的第一个文件 `order-confirmation.pt-BR.html`, `order-confirmation.pt.html` 和 `order-confirmation.html`，以及第一个同名的 `.txt` 作为文本部分（如果有）。模板名称是字母、数字， `-` 和 `_`，在分隔的文件夹 `/`.其他非语言标记的名称和区域设置将失败 `MailTemplateError`，因此都无法访问外部的文件 `dir`.

##### 模板语法

语法是手柄的子集：

<table>
  <tr>
    <th>Syntax</th>
    <th>Renders</th>
  </tr>
  <tr>
    <td><code>{{ customer.name }}</code></td>
    <td>The value, HTML-escaped. Paths use dots, and <code>items.0</code> is an array's first item. A missing value renders as nothing. In a <code>.txt</code> template, the value as it is.</td>
  </tr>
  <tr>
    <td><code>{{{ body }}}</code></td>
    <td>The value as it is, for HTML you produced yourself. HTML built with the <code>html</code> tag is inserted as it is between double braces too.</td>
  </tr>
  <tr>
    <td><code>{{#if paid}} … {{else}} … {{/if}}</code></td>
    <td>The first part when the value is truthy, else the <code>else</code> part, which is optional. <code>false</code>, <code>0</code>, an empty string, an empty list and a missing value are falsy. <code>{{else if pending}}</code> chains another condition.</td>
  </tr>
  <tr>
    <td><code>{{#unless paid}} … {{/unless}}</code></td>
    <td>The opposite of <code>#if</code>, with an optional <code>else</code> part.</td>
  </tr>
  <tr>
    <td><code>{{#each items}} … {{else}} … {{/each}}</code></td>
    <td>The first part once for every item of a list, or every value of an object; the <code>else</code> part for an empty or missing list.</td>
  </tr>
  <tr>
    <td><code>this, &#64;index, &#64;first, &#64;last, &#64;key</code></td>
    <td>Inside <code>#each</code>: the item, its position from 0, whether it's the first or the last, and an object's key. A name the item doesn't have is looked up in the outer contexts.</td>
  </tr>
  <tr>
    <td><code>../number, &#64;root.shop</code></td>
    <td>The context outside the current <code>#each</code>, and the template's context.</td>
  </tr>
  <tr>
    <td><code>{{> signature}}</code></td>
    <td>The partial <code>partials/signature.html</code> (<code>.txt</code> in a text template), in the mail's locale, with the context where it's included.</td>
  </tr>
  <tr>
    <td><code>{{! note }}, {{!-- note --}}</code></td>
    <td>Comments, left out of the output. The second form may contain double braces.</td>
  </tr>
  <tr>
    <td><code>\{{</code></td>
    <td>Literal double braces.</td>
  </tr>
</table>

没有帮手，没有表情。值是从上下文本身的属性中读取的，而不是从原型中读取的，函数也不被调用。双括号、永不关闭的块和标记内部但引用属性值外部的双括号值之间的任何其他内容都会失败 `MailTemplateError`，它有 `file`，这个 `line` 和 `column`.

##### 发送选项

`mailer.send(MailClass, options)` 和 `mailer.send(message)` 取：

| 选择 | 描述 |
| --- | --- |
| `to`,`cc`,`bcc` | 一个地址或一个数组。地址是包含一个地址的字符串，或者包含 `name` 和 `address` 的对象。`bcc` 只进入 SMTP 信封。 |
| `data` | 邮件类的数据，从其 `render()` 键入。 |
| `locale` | 传给 `render()` 在呈现上下文中，并传递给模板引擎，模板引擎为其选择模板。看 [Send it in the customer's language](/application/mail#send-it-in-the-customers-language). |
| `from`,`replyTo` | 覆盖模块的默认值。 |
| `subject`,`html`,`text` | 内容，用于内联编写的消息。`text` 源自 `html` 省略时。 |
| `template`,`context` | 呈现主体的模板及其读取的值，而不是 `html` 和 `text`.邮件班的 `render()` 以同样的方式返回它们。 |
| `attachments` | 每个都有 `filename`, `content` (a `Buffer`、字符串或流）或本地 `path` 以及可选地 `contentType` 和 `cid`.见 [Attach the invoice and preview the mail](/application/mail#attach-the-invoice-and-preview-the-mail). |
| `headers` | 自定义标题，如 `List-Unsubscribe`。 |
| `retry` | 覆盖模块的 `retry` 为了这次发送。 |
| `signal` | 安 `AbortSignal` 这将停止发送和尝试之间的任何等待。 |
| `idempotencyKey` | 标识跨重新投递的邮件。这个 `Message-ID` 是从它派生出来的。 |

`mailer.render(MailClass, options)` 和 `mailer.render(message)` 取没有交付选项的相同，并解析到 `MailMessage`，它记录了它的 `template` 和 `locale`。`send()` 解析为 `messageId`、`providerMessageId`（当提供者有一个时）、`accepted`（接受的信封收件人）、`response`（最终 SMTP 回复）和 `attempts`。

##### 运输

| 运输 | 选项 | 幂等键 |
| --- | --- | --- |
| `SmtpTransport` | `url` 或 `host`、`port`、`secure`、`startTls`（`required`、`opportunistic` 或 `never`；`required` 默认情况下，`opportunistic` 表示本地主机）、`auth`（`user` 表示 `pass` 或 `accessToken`）、`authMethod`（`PLAIN`、`LOGIN` 或 `XOAUTH2`）、`name`、`tls`、`pool`、`timeouts`、`dkim`]（`domainName`、`keySelector`、`privateKey`、`headers`） | 衍生的 `Message-ID` 只有 |
| `ResendTransport` | `apiKey`,`baseUrl`,`timeout`,`fetch` | `Idempotency-Key`, 24 小时 |
| `PostmarkTransport` | `serverToken`,`messageStream`（默认 `outbound`),`baseUrl`,`timeout`,`fetch` | 没有一个 |
| `SendGridTransport` | `apiKey`,`baseUrl`,`timeout`,`fetch` | 没有一个 |
| `SesTransport` | `region`,`credentials`,`configurationSetName`,`endpoint`,`timeout`,`fetch` | 没有一个 |
| `FileMailTransport` | `directory`,`log` | 仅开发 |
| `LogMailTransport` | `body`,`logger` | 仅开发 |
| `InMemoryMailTransport` | 没有一个 | 仅测试，请参阅 [Testing](/application/mail#testing) |

`InMemoryMailTransport.mails` 将收到的每封邮件列为 `SentMail`，其中 `filter()`,`find()` 和 `assertSent()` 也回来。一个 `SentMail` 有消息的 `messageId`,`from`,`to`,`cc`,`bcc`,`subject`,`html`,`text`,`attachments`,`headers`,`mail`（邮件类），`template` 和 `locale`,加上 `sentAt`（当运输机收到它时），`raw`（MIME 来源），`links`（每个链接，从 HTML，然后只有文本部分有），`link()`,`attachment()` 和 `message`，这个 `MailMessage` 本身。`clear()` 都忘了。

和 `pool: true`,`SmtpTransport` 保持多达 5 个连接，每个连接最多发送 100 条消息，并在 30 秒空闲后关闭连接；具有 `maxConnections`,`maxMessages` 和 `idleTimeout` 作为 `pool` 更改这些限制。它的默认超时是 `30s` 连接，`30s` 为了问候，`1m` 每个命令和 `5m` 为了数据。HTTP 提供者在之后超时 `30s` 应要求。

##### 事件

`MailEvents.events$` 每次发送在重试后发出一个事件。每个事件也发布在 `node:diagnostics_channel` 渠道。

| 事件类型 | 渠道 | 何时 | 有效载荷 |
| --- | --- | --- | --- |
| `sent` | `nestjs:mail:sent` | 运输机接受了消息。 | `messageId`,`mail`,`recipients`,`subject`,`transport`,`attempts`,`durationMs`,`providerMessageId` |
| `failed` | `nestjs:mail:failed` | 发送在重试后失败，或其 `signal` 在第一次尝试之前中止（`attempts` 是 0）。 | 相同的字段没有 `providerMessageId`,加上 `error` 和 `permanent` |

验证失败的消息会在任何事件之前抛出。

##### 错误

每个错误都扩展 `MailError`，其中有 `permanent`（是否再次发送相同的消息不能成功）和 `code`（SMTP 回复代码或提供者的 HTTP 状态）。邮件程序只重试非永久性错误。参见 [Send after the order commits](/application/mail#send-after-the-order-commits)。

| 错误 | 何时 | 永久的 |
| --- | --- | --- |
| `MailMessageError` | 在发送任何内容之前，该消息无效。`field` 命名字段，`status` 是 400。 | 是的 |
| `MailConnectionError` | DNS，拒绝或重置连接，TLS 或者证书。`cause` 保留套接字错误。 | 不，除了配置问题，如服务器没有 STARTTLS 需要时 |
| `MailTimeoutError` | 一个阶段超过了超时。具有 `phase` 和 `timeoutMs`。 | 不是 |
| `MailSmtpError` | SMTP 错误回复。具有 `code`、`enhancedCode`、`command` 和 `response`。 | 5xx 个回复 |
| `MailRecipientsRejectedError` | 服务器拒绝了一个或多个收件人，没有发送任何内容。`rejected` 列出了它们。扩展 `MailSmtpError`。 | 当任何拒绝是 5xx 时 |
| `MailTemplateError` | 模板丢失或无法编译，或者邮件在没有模板引擎的情况下命名模板。有 `template`，和 `file`,`line` 和 `column` 文件中的问题。 | 是的 |
| `MailProviderError` | HTTP 提供者拒绝了该请求。当响应具有有效的 `Retry-After` 时，具有 `code`（HTTP 状态）、`provider`、`providerCode` 和 `retryAfterMs`。 | 对于 4xx，除了 408、409 和 429 |
