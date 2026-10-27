# Controllers

Source: https://docs.nestjs.com/controllers

控制器负责处理传入的**请求**并将**响应**发送回客户端。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Controllers_1.png" /></figure>

控制器的目的是处理应用程序的特定请求。**路由**机制确定哪个控制器处理每个请求。一个控制器通常有多条路由，每条路由可以执行不同的动作。

要创建基本控制器，您可以使用类和**装饰器**。装饰器将类与所需的元数据相关联，Nest 用于构建路由映射，该映射将请求连接到其相应的控制器。

> info **Hint** 要创建具有内置 [验证](https://docs.nestjs.com/application/validation) 的 CRUD 控制器，请使用 CLI 的 [CRUD 生成器](https://docs.nestjs.com/recipes/crud-generator#crud-generator): `nest g resource [name]`。

#### 路由

以下示例使用 `@Controller()` 装饰器，这是定义基本控制器的**必需**，可选路由路径前缀为 `cats`。`@Controller()` 装饰器中的路径前缀对相关路由进行分组，并减少重复代码。例如，若要对 `/cats` 路径下管理 cat 实体的路由进行分组，请在 `@Controller()` 装饰器中指定 `cats` 前缀。然后，您不需要为文件中的每条路径重复该路径部分。

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Get()
  findAll(): string {
    return 'This action returns all cats';
  }
}
```

> info **Hint** 要使用 CLI，运行 `$ nest g controller [name]` 命令。

这个 `@Get()`HTTP 请求方法装饰器放置在 `findAll()` 方法告诉 Nest 为特定端点创建处理程序的步骤。端点由 HTTP 请求方法（GET 在这种情况下）和路由路径。处理程序的路由路径结合了为控制器声明的（可选）前缀**和**方法的装饰器中指定的任何路径。因为示例设置了前缀（`cats`) 并且方法装饰器中没有路径，Nest 地图 `GET /cats` 对此处理程序的请求。

如果方法装饰器还指定了路径，例如 `@Get('breed')`，则结果路由将是 `GET /cats/breed`。

当一个 `GET /cats` 请求到达，Nest 将其路由到用户定义的 `findAll()` 方法。方法名是任意的：必须声明一个方法来绑定路由，但是 Nest 不重视它的名字。

该方法返回 200 状态代码以及相关的响应，在本例中，响应是一个字符串。为了解释原因，我们需要介绍两个**不同**的选项 Nest 提供操作响应：

<table>
  <tr>
    <td>Standard (recommended)</td>
    <td>
      With this built-in method, when a route handler returns a JavaScript object or array, it is <strong>automatically</strong>
      serialized to JSON. When it returns a JavaScript primitive type (e.g., <code>string</code>, <code>number</code>, <code>boolean</code>), Nest sends the value without attempting to serialize it. Response handling is therefore straightforward: return the value, and Nest takes care of the rest.
      <br />
      <br /> The response's <strong>status code</strong> is 200 by default, except for POST
      requests, which use 201. You can change this behavior by adding the <code>@HttpCode(...)</code>
      decorator at the handler level (see <a href='controllers#status-code'>Status code</a>).
    </td>
  </tr>
  <tr>
    <td>Library-specific</td>
    <td>
      You can use the library-specific (e.g., Express) <a href="https://expressjs.com/en/api.html#res" rel="nofollow" target="_blank">response object</a>, injected with the <code>@Res()</code> decorator in the route handler signature (e.g., <code>findAll(@Res() response)</code>). This approach lets you use the native response handling methods exposed by that object. For example, with Express, you can construct responses with code like <code>response.status(200).send()</code>.
    </td>
  </tr>
</table>

> warning **Warning** Nest 检测处理程序何时使用 `@Res()` 或者 `@Next()`，这表明您选择了特定于库的选项。如果同时使用这两种方法，标准方法将被**自动禁用**该路线，并且不再按预期工作。若要组合它们（例如，注入响应对象仅用于设置 cookies 或头，而将其余的留给框架），请设置 `passthrough` 选项 `true` 在 `@Res({ passthrough: true })` 装修师。

#### 请求对象

处理程序通常需要访问客户端的**请求**详细信息。Nest 提供对 [请求对象](https://expressjs.com/en/api.html#req) 底层平台（Express 默认情况下）。要访问它，请添加 `@Req()` 装饰器到处理程序的签名，它指示 Nest 注射它。

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('cats')
export class CatsController {
  @Get()
  findAll(@Req() request: Request): string {
    return 'This action returns all cats';
  }
}
```

> info **Hint** 利用 `express` 打字（如 `request: Request` 上面的参数），安装 `@types/express` 包装。

请求对象表示 HTTP 请求并具有查询字符串、路由参数， HTTP 标题和正文（参见 [Express documentation](https://expressjs.com/en/api.html#req)).在大多数情况下，您不需要手动访问这些属性。相反，使用专用的装饰器，如 `@Body()` 或者 `@Query()` 开箱即用。下表列出了所提供的装饰符及其所代表的特定于平台的对象。

<table>
  <tbody>
    <tr>
      <td><code>@Request(), @Req()</code></td>
      <td><code>req</code></td></tr>
    <tr>
      <td><code>@Response(), @Res()</code><span class="table-code-asterisk">*</span></td>
      <td><code>res</code></td>
    </tr>
    <tr>
      <td><code>@Next()</code></td>
      <td><code>next</code></td>
    </tr>
    <tr>
      <td><code>@Session()</code></td>
      <td><code>req.session</code></td>
    </tr>
    <tr>
      <td><code>@Param(key?: string)</code></td>
      <td><code>req.params</code> / <code>req.params[key]</code></td>
    </tr>
    <tr>
      <td><code>@Body(key?: string)</code></td>
      <td><code>req.body</code> / <code>req.body[key]</code></td>
    </tr>
    <tr>
      <td><code>@Query(key?: string)</code></td>
      <td><code>req.query</code> / <code>req.query[key]</code></td>
    </tr>
    <tr>
      <td><code>@Headers(name?: string)</code></td>
      <td><code>req.headers</code> / <code>req.headers[name]</code></td>
    </tr>
    <tr>
      <td><code>@Cookies(name?: string)</code></td>
      <td>request cookies / the cookie named <code>name</code> (see <a routerLink="/techniques/cookies">Cookies</a>)</td>
    </tr>
    <tr>
      <td><code>@SignedCookies(name?: string)</code></td>
      <td>verified signed cookies / the signed cookie named <code>name</code></td>
    </tr>
    <tr>
      <td><code>@Ip()</code></td>
      <td><code>req.ip</code></td>
    </tr>
    <tr>
      <td><code>@HostParam()</code></td>
      <td><code>req.hosts</code></td>
    </tr>
  </tbody>
</table>

<sup>\* </sup>为了与跨底层 HTTP 平台(例如，Express 和 Fastify]) 的类型兼容，Nest 提供 `@Res()` 和 `@Response()` 装饰器。`@Res()` 是 `@Response()` 的别名。两者都直接公开底层平台的本机 `response` 对象。使用它们时，还要安装底层库的类型（例如，`@types/express`），以充分利用它们。当您将 `@Res()` 或 `@Response()` 注入路由处理程序时，您将 Nest 置于该处理程序的**特定库模式**，并且您将负责管理响应。然后，您必须通过调用 `response` 对象上的方法（例如，`res.json(...)` 或 `res.send(...)`）来发送响应；否则，请求将挂起。

`@Body()`,`@Query()`,`@Param()`，和 `@RawBody()` 还接受 options 对象 `schema` 和 `pipes` 属性。这使您可以连接 [Standard Schema](https://standardschema.dev/) 兼容的模式，如使用 Zod、Valibot 或 ArkType 创建的模式，可以直接路由参数。

```typescript
@Post()
create(@Body({ schema: createCatSchema }) createCatDto: CreateCatDto) {
  return this.catsService.create(createCatDto);
}

@Get(':id')
findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {
  return this.catsService.findOne(id);
}
```

这些装饰器本身只将模式作为元数据附加。要验证它，请注册内置的 `StandardSchemaValidationPipe` 或读取 `metadata.schema` 的自定义管道。

> info **Hint** 要了解如何创建自己的装饰器，请参阅 [Custom route decorators](/custom-decorators) 篇章。

#### 资源

前面，我们定义了一个端点来获取 cats 资源（**GET**路）。通常，我们还需要一个创建新记录的端点。让我们加一个**POST**处理程序：

```typescript
import { Controller, Get, Post } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Post()
  create(): string {
    return 'This action adds a new cat';
  }

  @Get()
  findAll(): string {
    return 'This action returns all cats';
  }
}
```

Nest 为所有标准 HTTP 方法提供装饰器：`@Get()`、`@Post()`、`@Put()`、`@Delete()`、`@Patch()`、`@Options()`、`@Head()` 和 `@QueryMethod()`。最后一个映射到 `QUERY` 方法；它被命名为 `QueryMethod`，以避免与 `@Query()` 参数装饰器发生冲突。此外，`@All()` 定义了一个处理所有这些问题的端点。

#### 路线通配符

Nest 还支持基于模式的路由。例如，星号（`*`) 在路径的末尾充当匹配任何字符组合的通配符。在下面的示例中，`findAll()` 方法对以 `abcd/`，不管后面有多少个字符。

```typescript
@Get('abcd/*')
findAll() {
  return 'This route uses a wildcard';
}
```

这个 `'abcd/*'` 路线路径匹配 `abcd/`,`abcd/123`,`abcd/abc`，等等。在基于字符串的路径中，连字符（`-`）和点（`.`）是字面解释的。

这种方法适用于 Express 和 Fastify。然而，Expressv5 使其路由更加严格：在普通的 Express 中，必须为要工作的路由命名通配符（例如，`abcd/{*splat&#125;`，其中 `splat` 是通配符参数的任意名称，没有特殊含义）。因为 Nest 为 Express 提供了一个兼容层，所以您仍然可以使用一个未命名的星号（`*`）作为通配符。

对于**路线中间**中的星号，Express 需要命名通配符（例如，`ab{*splat&#125;cd`），而 Fastify 根本不支持他们。

#### 路由冲突和解决顺序

Nest 按声明顺序注册路由。在区分顺序的适配器上，例如默认值 Express 适配器，因此参数路由可以静默地覆盖更特定的路由：

```typescript
@Controller('users')
export class UsersController {
  @Get(':id')
  findOne() {}

  @Get('me') // never reached: `:id` matches "me" first
  findMe() {}
}
```

这很容易被忽略：应用程序在没有警告的情况下启动，并且问题只在运行时出现，当请求被分派给错误的处理程序时。管道，例如 `ParseIntPipe` 这里没有帮助，因为路由会在任何管道运行之前选择处理程序。

NestJSv12 增加了两个选择加入 `NestApplicationOptions` 防止这种情况的属性。两者都默认为前面的行为，因此现有的应用程序不受影响，除非您设置它们。

**`routeConflictPolicy`**启用引导时间诊断。对于每种冲突，其严重程度为 `'off'`（默认值）、`'warn'` 或 `'error'`：

```typescript
const app = await NestFactory.create(AppModule, {
  routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
});
```

<table>
  <tr>
    <td><code>duplicate</code></td>
    <td>Two routes share an identical method, path, host, and version.</td>
  </tr>
  <tr>
    <td><code>shadow</code></td>
    <td>Two route patterns can match the same request (e.g., <code>/users/me</code> and <code>/users/:id</code>).</td>
  </tr>
</table>

和 `'error'`，所有违规对聚合为一个 `RouteConflictException`，在应用程序初始化时抛出（在 `app.init()`，或在 `app.listen()` 如果你不打电话 `init()` 明确）。这样，您可以一次看到每个冲突，而不是每次重新启动一次。

**`routeResolutionStrategy`**控制注册顺序。将其设置为 `'specificity'` 首先注册最特定的路由（文字段优先于参数段，参数段优先于通配符），因此上面的示例无论声明顺序如何都适用：

```typescript
const app = await NestFactory.create(AppModule, {
  routeResolutionStrategy: 'specificity',
});
```

默认值是 `'declaration'`，它保留了以前的行为。

> info **Hint** 除了 `duplicate` 策略，这些选项仅对注册顺序影响匹配的适配器有影响。 `ExpressAdapter` 对顺序敏感； `FastifyAdapter` 不是，因为它的路由器（`find-my-way`）已经按特异性对路由进行排序。在 Fastify，这个 `shadow` 政策是不操作的， `'specificity'` 排序没有效果，而 `duplicate` 两个适配器都遵守策略。这个 `RouteConflictPolicy`, `RouteConflictPolicyLevel`，和 `RouteResolutionStrategy` 类型导出自 `@nestjs/common`.

#### 状态代码

如前所述，默认响应**状态码**为**200**，除了 POST 请求，默认为**201**。您可以使用 `@HttpCode(...)` 处理程序级别的装饰器。

```typescript
@Post()
@HttpCode(204)
create() {
  return 'This action adds a new cat';
}
```

> info **Hint** 进口 `HttpCode` 从 `@nestjs/common` 包装。

通常，状态代码不是静态的，而是取决于各种因素。在这种情况下，使用特定于库的**response**对象（注入 `@Res()`) 或者，如果出现错误，则抛出异常。

#### 响应头

若要设置自定义响应头，请使用 `@Header()` 装饰器或特定于库的响应对象（并调用 `res.header()` 直接）。

```typescript
@Post()
@Header('Cache-Control', 'no-store')
create() {
  return 'This action adds a new cat';
}
```

> info **Hint** 进口 `Header` 从 `@nestjs/common` 包装。

#### 重定向

将响应重定向到特定 URL，使用 `@Redirect()` 装饰器或特定于库的响应对象（并调用 `res.redirect()` 直接）。

`@Redirect()` 接受两个可选参数，`url` 和 `statusCode`。如果省略，`statusCode` 默认为 `302`（`Found`）。

```typescript
@Get()
@Redirect('https://nestjs.com', 301)
```

> info **Hint** 要动态确定 HTTP 状态码或重定向 URL，请返回一个跟随 `HttpRedirectResponse` 接口的对象（从 `@nestjs/common` 导出）。

返回值覆盖传递给 `@Redirect()` 装修师。例如：

```typescript
@Get('docs')
@Redirect('https://docs.nestjs.com', 302)
getDocs(@Query('version') version) {
  if (version && version === '5') {
    return { url: 'https://docs.nestjs.com/v5/' };
  }
}
```

#### 路线参数

当您需要接受**动态数据**作为请求的一部分时，具有静态路径的路由不起作用（例如，`GET /cats/1` 以获取 id 为 `1` 的猫）。要定义带有参数的路由，请将路由参数**tokens**添加到路由路径中，以从 URL 捕获动态值，如下面示例中的 `@Get()` 装饰器所示。然后，您可以使用添加到方法签名中的 `@Param()` 装饰器访问这些路由参数。

> info **Hint** 在任何静态路径之后声明带有参数的路由，这样参数化路径就不会拦截目的地为静态路径的流量。看 [Route conflicts and resolution order](/controllers#route-conflicts-and-resolution-order) 对于在引导时检测到这一点或为您解决它的选项。

```typescript
@Get(':id')
findOne(@Param() params: any): string {
  console.log(params.id);
  return `This action returns a #${params.id} cat`;
}
```

`@Param()` 装饰器装饰方法参数（上面示例中的 `params`），使**route**参数在方法中作为该参数的属性可用。如代码所示，您将 `id` 参数访问为 `params.id`。或者，将特定的参数令牌传递给装饰器，并在方法体中通过名称直接引用路由参数。

> info **Hint** 进口 `Param` 从 `@nestjs/common` 包装。

```typescript
@Get(':id')
findOne(@Param('id') id: string): string {
  return `This action returns a #${id} cat`;
}
```

#### 子域路由

这个 `@Controller()` 装修人员可以采取 `host` 选项要求 HTTP 传入请求的主机匹配特定值。

```typescript
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string {
    return 'Admin page';
  }
}
```

> warning **Warning** 自**Fastify**不支持嵌套路由器，使用默认值 Express 如果您依赖子域路由，请使用适配器。

像一条路线 `path`，这个 `host` 选项可以使用令牌来捕获主机名中该位置的动态值，作为主机参数令牌 `@Controller()` 下面的装饰师显示。您可以使用 `@HostParam()` 装饰器，添加到方法签名中。

```typescript
@Controller({ host: ':account.example.com' })
export class AccountController {
  @Get()
  getInfo(@HostParam('account') account: string) {
    return account;
  }
}
```

#### 状态共享

来自其他编程语言的开发人员可能会惊讶地发现 Nest 几乎所有内容都由传入的请求共享。这包括数据库连接池、具有全局状态的单例服务等资源。Node.js 不遵循请求/响应多线程无状态模型，其中每个请求由单独的线程处理。因此，在 Nest 是完全**安全**的。

也就是说，一些边缘情况可能需要控制器基于请求的生命周期，例如 GraphQL 应用程序中的每个请求缓存、请求跟踪或多租户。要了解如何控制这一点，请参见 [Injection scopes](/fundamentals/injection-scopes)。

#### 异步

现代的 JavaScript 严重依赖**异步**数据处理，以及 Nest 全力支持 `async` 功能。安 `async` 函数总是返回一个 `Promise`，因此路由处理程序可以返回一个延迟值 Nest 自动解决：

```typescript
@Get()
async findAll(): Promise<any[]> {
  return [];
}
```

路由处理程序也可以返回 RxJS[可观测流](https://rxjs.dev/guide/observable)。Nest 在内部订阅流，并在流完成后解析最后发出的值。

```typescript
@Get()
findAll(): Observable<any[]> {
  return of([]);
}
```

两种方法都是有效的；选择最适合你需求的。

#### 请求有效载荷

这个 POST 前面示例中的路由处理程序不接受任何客户端参数。让我们通过添加 `@Body()` 装修师。

在继续之前（如果您使用的是 TypeScript），我们需要定义**DTO**（数据传输对象）模式。DTO 是定义通过网络发送的数据形状的对象。您可以使用**TypeScript**接口或普通类定义 DTO 模式，但**类**是推荐的选择。类是 JavaScriptES6 标准的一部分，因此它们在编译的 JavaScript 中作为真实实体保留。相比之下，TypeScript 接口在翻译过程中被删除，因此 Nest 不能在运行时引用它们。这很重要，因为像**pipes**这样的特性依赖于对运行时变量元类型的访问，而这只有类才有可能。

创建 `CreateCatDto` 班级：

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}
```

它有三个基本属性。我们现在可以在 `CatsController` 中使用新的 DTO：

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  return 'This action adds a new cat';
}
```

> info **Hint** `ValidationPipe` 可以过滤掉路由处理程序不应接收的属性。您可以将可接受的属性列入白名单，并且任何不在白名单中的属性都会自动从生成的对象中剥离。在 `CreateCatDto` 示例中，白名单由 `name`、`age` 和 `breed` 属性组成。在 [Stripping properties](https://docs.nestjs.com/application/validation#stripping-properties) 中了解更多信息。

#### 查询参数

若要从传入请求中提取查询参数，请使用 `@Query()` 装修师。

考虑一个通过查询参数（如 `age` 和 `breed`）过滤猫列表的路由。首先，在 `CatsController` 中定义查询参数：

```typescript
@Get()
async findAll(@Query('age') age: number, @Query('breed') breed: string) {
  return `This action returns all cats filtered by age: ${age} and breed: ${breed}`;
}
```

在本例中，`@Query()` 装饰器提取 `age` 和 `breed` 从查询字符串。例如，请求：

```plaintext
GET /cats?age=2&breed=Persian
```

结果 `age` 存在 `'2'` 和 `breed` 存在 `'Persian'`.查询参数值以字符串形式到达，并且 `number` 单独类型注释不能转换它们。若要接收数字，请应用管道，例如 `ParseIntPipe` （见 [Pipes](/pipes)).

如果应用程序需要处理更复杂的查询参数，例如嵌套对象或数组：

```plaintext
?filter[where][name]=John&filter[where][age]=30
?item[]=1&item[]=2
```

配置您的 HTTP 适配器（Express 或者 Fastify) 使用适当的查询解析器。在 Express，使用 `extended` 支持富查询对象的解析器：

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('query parser', 'extended');
```

在 Fastify，使用 `querystringParser` 选项：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    querystringParser: (str) => qs.parse(str),
  }),
);
```

> info **Hint** `qs` 是一个支持嵌套和数组的查询字符串解析器。用 `npm install qs` 安装它。

#### 处理错误

处理错误（即处理异常）在 [Exception filters](/exception-filters) 篇章。

#### 生产中的观察路线

在机器上表现完美的控制器在实际流量下可能会有很大不同。在生产中，问题从来不是“这条路线有效吗？”但是“为什么 `GET /cats/:id` 周二部署后从 40 毫秒增加到 900 毫秒，是每个请求还是一个不幸的租户？”

路由处理程序是回答该问题的自然单元，并且 [NestJS Observe](https://www.observe.nestjs.com/) 关于那个单位的报告。因为 `@nestjs/observe`SDK 钩住 Nest 自己的请求生命周期，而不是包装 HTTP 服务器，每个度量都用您声明的路由模式标记（`GET /cats/:id`，而不是 10,000 个不同的 URL）。因此，每条路线都是一行，您可以对其进行排序、绘制图表和提醒：

```typescript
const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});
```

连同导入 `ObserveModule.forRoot()` 到您的根模块中，这就是整个集成。从那里，一条慢速路线只需点击三次：按 p95 对路线列表进行排序；打开操作，查看回归是恒定的还是尖峰的，以及它是否以释放开始；然后打开一个慢速执行，读取它的瀑布，看看哪个控制器、服务方法或查询占用了时间。按**类和方法**分配时间，减去等待时间，因此 `CatsService.findOne()` 在自己的代码中花费 800 毫秒可以立即与 `CatsService.findOne()` 在数据库上等待 800 毫秒。

参见 [Observability](/observability/overview) 章节要建立，并且 [Dashboard](/observability/dashboard) 从警报到单个请求的完整过程。

#### 全资源样本

下面的示例使用几个可用的装饰器来创建一个基本控制器。控制器公开了一些访问和操作内部数据的方法。

```typescript
import { Controller, Get, Query, Post, Body, Put, Param, Delete } from '@nestjs/common';
import { CreateCatDto, UpdateCatDto, ListAllEntities } from './dto.js';

@Controller('cats')
export class CatsController {
  @Post()
  create(@Body() createCatDto: CreateCatDto) {
    return 'This action adds a new cat';
  }

  @Get()
  findAll(@Query() query: ListAllEntities) {
    return `This action returns all cats (limit: ${query.limit} items)`;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return `This action returns a #${id} cat`;
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateCatDto: UpdateCatDto) {
    return `This action updates a #${id} cat`;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return `This action removes a #${id} cat`;
  }
}
```

> info **Hint** 这个 NestCLI 提供一个生成器（示意图），自动创建**所有样板代码**，因此您不必手动编写它。了解更多信息 [CRUD 生成器](/recipes/crud-generator) 食谱。

#### 起床跑步

即使有 `CatsController` 完全定义，Nest 还不知道，也不会创建该类的实例。

控制器必须始终属于一个模块，这就是为什么我们包括 `controllers` 数组在 `@Module()` 装修师。因为除了根之外，我们没有定义任何模块 `AppModule`，我们用它来注册 `CatsController`:

```typescript
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller.js';

@Module({
  controllers: [CatsController],
})
export class AppModule {}
```

通过将此元数据附加到模块类 `@Module()` 装修工，Nest 可以确定要挂载哪些控制器。

#### 图书馆专用方法

到目前为止，我们已经涵盖了标准 Nest 操纵反应的方式。另一种方法是使用特定于库的 [响应对象](https://expressjs.com/en/api.html#res) 注射了 `@Res()` 装修师。为了突出差异，让我们重写 `CatsController` 如下：

```typescript
import { Controller, Get, Post, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Controller('cats')
export class CatsController {
  @Post()
  create(@Res() res: Response) {
    res.status(HttpStatus.CREATED).send();
  }

  @Get()
  findAll(@Res() res: Response) {
    res.status(HttpStatus.OK).json([]);
  }
}
```

这种方法通过提供对响应对象的完全控制（例如，标头操作和对特定于库的特性的访问）提供了更大的灵活性，但应该谨慎使用。它通常不太清楚，并且有一些缺点。主要的缺点是您的代码变得依赖于平台，因为不同的底层库可能会在响应对象上公开不同的 API。这也使测试变得更加困难，因为您需要模拟响应对象等。

此外，这种方法与 Nest 依赖于标准响应处理的功能，如拦截器和 `@HttpCode()`/`@Header()` 装修人员。要解决这个问题，请启用 `passthrough` 选项：

```typescript
@Get()
findAll(@Res({ passthrough: true }) res: Response) {
  res.status(HttpStatus.OK);
  return [];
}
```

这样，您就可以与本机响应对象进行交互（例如，根据特定条件设置 cookies 或头），而将剩下的留给框架。
