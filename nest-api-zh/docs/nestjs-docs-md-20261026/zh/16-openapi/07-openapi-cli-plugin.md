# CLI Plugin

Source: https://docs.nestjs.com/openapi/cli-plugin

[TypeScript](https://www.typescriptlang.org/docs/handbook/decorators.html) 的元数据反映系统有几个局限性。例如，它不能确定一个类由哪些属性组成，也不能确定给定的属性是可选的还是必需的。但是，这些约束中的一些可以在编译时解决。Nest 提供一个插件来增强 TypeScript 编译过程，以减少所需的样板代码量。

> info **Hint** 这个插件是**选择加入**。如果您愿意，可以手动声明所有装饰器，或者只在需要的地方声明特定的装饰器。

#### 概述

这个 Swagger 插件自动：

- 注释全部 DTO 具有 `@ApiProperty()`，除非 `@ApiHideProperty()` 被使用
- 根据问号设置 `required` 属性（例如，`name?: string` 设置 `required: false`）
- 设置 `type` 或者 `enum` 属性取决于类型（也支持数组）
- 设置 `default` 基于指定的默认值的属性
- 基于 `class-validator` 装饰器设置几个验证规则（如果 `classValidatorShim` 设置为 `true`）
- 向具有适当状态的每个端点添加响应装饰器，并且 `type`（响应模型）
- 根据注释生成属性和端点的描述（如果 `introspectComments` 设置为 `true`）
- 根据注释生成属性的示例值（如果 `introspectComments` 设置为 `true`）

要让插件分析 DTO 文件，其文件名**必须具有**以下后缀之一：`['.dto.ts', '.entity.ts']`（例如，`create-user.dto.ts`）。

如果使用不同的后缀，请使用 `dtoFileNameSuffix` 选项（见下文）。

没有插件，提供与 SwaggerUI 意味着复制大量代码来告诉包应该如何在规范中声明您的模型/组件。例如，您可以定义一个简单的 `CreateUserDto` 类如下：

```typescript
export class CreateUserDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty({ enum: RoleEnum, default: [], isArray: true })
  roles: RoleEnum[] = [];

  @ApiProperty({ required: false, default: true })
  isEnabled?: boolean = true;
}
```

虽然这在中型项目中不是一个重要的问题，但一旦有了大量的类，这就变得冗长且难以维护。

与 [Swagger plugin enabled](/openapi/cli-plugin#using-the-cli-plugin)，您可以在没有任何装饰符的情况下声明上面的类：

```typescript
export class CreateUserDto {
  email: string;
  password: string;
  roles: RoleEnum[] = [];
  isEnabled?: boolean = true;
}
```

> info **Note** 这个 Swagger 插件派生 `@ApiProperty()` 注释来自 TypeScript 类型和 `class-validator` 装饰者，描述你的 API 在生成的 SwaggerUI 文件。但是，运行时验证仍然由 `class-validator` 装饰器，因此必须继续使用验证器，如 `IsEmail()`,`IsNumber()`，等等。

换句话说，如果您依赖于文档的自动注释，并且仍然希望运行时验证，则仍然需要 `class-validator` 装修人员。

> info **Hint** 当您使用 [映射类型实用程序](/openapi/mapped-types)（喜欢 `PartialType`) 在 DTOs 中，从 `@nestjs/swagger` 而不是 `@nestjs/mapped-types` 以便插件获取模式。

该插件根据**抽象语法树**即时添加适当的修饰符，因此您不必分散 `@ApiProperty()` 整个代码的装饰者。

> info **Hint** 该插件会生成任何缺失的 Swagger 属性。要覆盖一个，请通过 `@ApiProperty()` 显式设置它。

#### 评论自省

启用注释自省功能后，CLI 插件根据注释生成属性的描述和示例值。

例如，考虑一个 `roles` 属性：

```typescript
/**
 * A list of user's roles
 * @example ['admin']
 */
@ApiProperty({
  description: `A list of user's roles`,
  example: ['admin'],
})
roles: RoleEnum[] = [];
```

必须复制说明值和示例值。和 `introspectComments` 启用，CLI 插件提取这些注释，并自动提供属性的描述（和示例，如果定义的话）。然后可以如下声明上述属性：

```typescript
/**
 * A list of user's roles
 * @example ['admin']
 */
roles: RoleEnum[] = [];
```

这个 `dtoKeyOfComment` 和 `controllerKeyOfComment` 插件选项自定义插件如何将注释值分配给 `ApiProperty` 和 `ApiOperation` 分别是装饰师。请参阅下面的示例：

```typescript
export class SomeController {
  /**
   * Create some resource
   */
  @Post()
  create() {}
}
```

这相当于以下内容：

```typescript
@ApiOperation({ summary: "Create some resource" })
```

> info **Hint** 对于模型，同样的逻辑适用，但是 `ApiProperty` 而是装修师。

对于控制器，不仅可以提供摘要，还可以提供描述（备注）、标记（如 `@deprecated`），以及响应示例，如下所示：

```ts
/**
 * Create a new cat
 *
 * @remarks This operation allows you to create a new cat.
 *
 * @deprecated
 * @throws {500} Something went wrong.
 * @throws {400} Bad Request.
 */
@Post()
async create(): Promise<Cat> {}
```

作为 `@nestjs/swagger`v12，插件（带 `introspectComments` 已启用）拾取 `@param` 标记也是如此，因此路由参数描述可以来自同一个文档注释：

```ts
/**
 * List cats
 *
 * @param breed Filter results by breed
 * @param limit Maximum number of results to return
 */
@Get()
findAll(@Query('breed') breed?: string, @Query('limit') limit?: number) {}
```

插件增加了一个 `description` 到 `@ApiQuery()` 它已经生成可选的 `@Query()` 参数，生成 `@ApiQuery({ name, description &#125;)` 用于记录所需的查询参数，并生成 `@ApiParam({ name, description &#125;)` 对于记录 `@Param()` 参数。

描述由**变量名**匹配，这是什么 `@param` 文件。所以 `@Query('order_by') orderBy: string` 记录为 `@param orderBy ...`,不 `@param order_by ...`.明确的 `@ApiQuery()` / `@ApiParam()` 装修师总是优先，从不被覆盖。

#### 使用 CLI 插件

要启用插件，请打开 `nest-cli.json`（如果您使用 [Nest CLI](/cli/overview)) 并添加以下 `plugins` 配置：

```javascript
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}
```

使用 `options` 属性来自定义插件的行为：

```javascript
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "classValidatorShim": false,
          "introspectComments": true,
          "skipAutoHttpCode": true
        }
      }
    ]
  }
}
```

这个 `options`property 接受以下选项（除其他外）：

```typescript
export interface PluginOptions {
  dtoFileNameSuffix?: string | string[];
  controllerFileNameSuffix?: string | string[];
  classValidatorShim?: boolean;
  classTransformerShim?: boolean | 'exclusive';
  dtoKeyOfComment?: string;
  controllerKeyOfComment?: string;
  introspectComments?: boolean;
  skipAutoHttpCode?: boolean;
  skipDefaultValues?: boolean;
  autoFillEnumName?: boolean;
  esmCompatible?: boolean;
}
```

<table>
  <tr>
    <th>Option</th>
    <th>Default</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>dtoFileNameSuffix</code></td>
    <td><code>['.dto.ts', '.entity.ts']</code></td>
    <td>DTO (Data Transfer Object) files suffix</td>
  </tr>
  <tr>
    <td><code>controllerFileNameSuffix</code></td>
    <td><code>['.controller.ts']</code></td>
    <td>Controller files suffix</td>
  </tr>
  <tr>
    <td><code>classValidatorShim</code></td>
    <td><code>true</code></td>
    <td>If set to <code>true</code>, the plugin reuses <code>class-validator</code> validation decorators (e.g., <code>@Max(10)</code> adds <code>max: 10</code> to the schema definition)</td>
  </tr>
  <tr>
    <td><code>classTransformerShim</code></td>
    <td><code>false</code></td>
    <td>If set to <code>true</code>, the plugin skips properties decorated with <code>class-transformer</code>'s <code>@Exclude()</code>. If set to <code>'exclusive'</code>, it documents only properties decorated with <code>@Expose()</code> or <code>@ApiProperty()</code></td>
  </tr>
  <tr>
    <td><code>dtoKeyOfComment</code></td>
    <td><code>'description'</code></td>
    <td>The property key to set the comment text to on <code>ApiProperty</code>.</td>
  </tr>
  <tr>
    <td><code>controllerKeyOfComment</code></td>
    <td><code>'summary'</code></td>
    <td>The property key to set the comment text to on <code>ApiOperation</code>.</td>
  </tr>
  <tr>
    <td><code>introspectComments</code></td>
    <td><code>false</code></td>
    <td>If set to <code>true</code>, the plugin generates descriptions and example values for properties based on comments</td>
  </tr>
  <tr>
    <td><code>skipAutoHttpCode</code></td>
    <td><code>false</code></td>
    <td>Disables the automatic addition of <code>@HttpCode()</code> in controllers</td>
  </tr>
  <tr>
    <td><code>skipDefaultValues</code></td>
    <td><code>false</code></td>
    <td>If set to <code>true</code>, the plugin doesn't set the <code>default</code> property from property initializers</td>
  </tr>
  <tr>
    <td><code>autoFillEnumName</code></td>
    <td><code>false</code></td>
    <td>If set to <code>true</code>, the plugin sets <code>enumName</code> to the name of the enum type for enum properties that don't declare one</td>
  </tr>
  <tr>
    <td><code>esmCompatible</code></td>
    <td>Detected per file</td>
    <td>Makes the generated code compatible with ESM (<code>&#123; "type": "module" &#125;</code>). When omitted, the plugin detects whether each file is emitted as ESM from your compiler options and <code>package.json</code></td>
  </tr>
</table>

删除 `/dist` 每当您更新插件选项时，文件夹并重建您的应用程序。

如果您不使用 CLI，而是使用自定义的 `webpack` 配置，则可以将此插件与 `ts-loader` 结合使用：

```javascript
getCustomTransformers: (program: any) => ({
  before: [require('@nestjs/swagger/plugin').before({}, program)]
}),
```

#### SWC 建造者

对于标准（非 monorepo）设置，使用 CLI 插件 SWC 生成器要求启用类型检查，如 [SWC 食谱](/recipes/swc#type-checking).

```bash
$ nest start -b swc --type-check
```

对于 monorepo 设置，请按照 [单回购和 CLI 插件](/recipes/swc#monorepo-and-cli-plugins) 创建 `generate-metadata.ts` 文件，然后运行它：

```bash
$ npx ts-node src/generate-metadata.ts
# OR npx ts-node apps/{YOUR_APP}/src/generate-metadata.ts
```

然后加载序列化元数据文件 `SwaggerModule#loadPluginMetadata()` 方法如下所示：

```typescript
import metadata from './metadata.js'; // <-- file auto-generated by the "PluginMetadataGenerator"

await SwaggerModule.loadPluginMetadata(metadata); // <-- here
const document = SwaggerModule.createDocument(app, config);
```

#### 与 `ts-jest`（e2e 测试）

要运行 e2e 测试，`ts-jest` 在内存中动态编译源代码文件。这意味着它不使用 NestCLI 编译器，它不应用任何插件或执行 AST 转变。

要启用插件，请在 e2e 测试目录中创建以下文件：

```javascript
const transformer = require('@nestjs/swagger/plugin');

module.exports.name = 'nestjs-swagger-transformer';
// you should change the version number anytime you change the configuration below - otherwise, jest will not detect changes
module.exports.version = 1;

module.exports.factory = (cs) => {
  return transformer.before(
    {
      // @nestjs/swagger/plugin options (can be empty)
    },
    cs.program, // "cs.tsCompiler.program" for older versions of Jest (<= v27)
  );
};
```

完成此操作后，将 ASTtransformer 导入 `jest` 配置文件。默认情况下（在 starter 应用程序中），e2e 测试配置文件位于 `test` 文件夹中，并被命名为 `jest-e2e.json`。

如果您使用 `jest@<29`，使用下面的代码片段：

```json
{
  ... // other configuration
  "globals": {
    "ts-jest": {
      "astTransformers": {
        "before": ["<path to the file created above>"]
      }
    }
  }
}
```

如果您使用 `jest@^29`，请改用下面的代码片段，因为前面的方法已被弃用：

```json
{
  ... // other configuration
  "transform": {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        "astTransformers": {
          "before": ["<path to the file created above>"]
        }
      }
    ]
  }
}
```

#### 故障排除 `jest`（e2e 测试）

如果 `jest` 似乎无法识别您的配置更改，Jest 可能已经**缓存**了构建结果。要应用新配置，请清除 Jest 在缓存目录中运行以下命令 NestJS 项目文件夹：

```bash
$ npx jest --clearCache
```

如果自动缓存清除失败，请使用以下命令手动删除缓存文件夹：

```bash
# Find jest cache directory (usually /tmp/jest_rs)
# by running the following command in your NestJS project root
$ npx jest --showConfig | grep cache
# ex result:
#   "cache": true,
#   "cacheDirectory": "/tmp/jest_rs"

# Remove or empty the Jest cache directory
$ rm -rf  <cacheDirectory value>
# ex:
# rm -rf /tmp/jest_rs
```
