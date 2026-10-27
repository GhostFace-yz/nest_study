# Configuration

Source: https://docs.nestjs.com/application/configuration

应用程序通常在不同的**环境**中运行，每个环境都需要自己的配置设置。例如，本地环境通常依赖于仅对本地数据库实例有效的数据库凭据，而生产环境使用一组单独的凭据。由于配置变量在不同环境之间会发生变化，因此最佳实践是 [存储配置变量](https://12factor.net/config) 在环境中。

外部定义的环境变量在内部可见 Node.js 通过 `process.env` 全球的。您可以通过在每个环境中分别设置环境变量来处理多个环境。这很快就会变得笨拙，尤其是在开发和测试环境中，这些值需要易于模拟或更改。

在 Node.js 在应用程序中，通常使用 `.env` 保存键值对的文件。在不同的环境中运行应用程序是在正确的环境中进行交换的问题 `.env` 文件。

将这种技术应用于 Nest 是创建一个 `ConfigModule` 这暴露了一个 `ConfigService`，它加载适当的 `.env` 文件。您可以自己编写这样的模块，但为了方便起见，Nest 提供 `@nestjs/config` 包装。本章涵盖了该包。

#### 安装

要开始，请安装所需的依赖项：

```bash
$ npm i --save @nestjs/config
```

> info **Hint** `@nestjs/config` 包内部使用 [多滕夫](https://github.com/motdotla/dotenv)。

> warning **Note** `@nestjs/config` 要求 TypeScript4.1 或更高。

#### 入门

安装完成后，导入 `ConfigModule`。通常，您将它导入到根 `AppModule` 中，并使用 `.forRoot()` 静态方法控制它的行为。在此步骤中，将解析和解析环境变量键/值对。稍后，您将看到几个用于访问其他功能模块中 `ConfigModule` 的 `ConfigService` 类的选项。

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
})
export class AppModule {}
```

这段代码从默认位置（进程开始的目录，通常是项目根目录）加载并解析 `.env` 文件，将 `.env` 文件中的键/值对与分配给 `process.env` 的环境变量合并，并将结果存储在可以通过 `ConfigService` 访问的私有结构中。`forRoot()` 方法注册 `ConfigService` 提供程序，该提供程序提供了用于读取这些解析和合并的配置变量的 `get()` 方法。由于 `@nestjs/config` 依赖于 [多滕夫](https://github.com/motdotla/dotenv)，它使用该包的规则来解决环境变量名称中的冲突。当密钥同时存在于运行时环境中（例如，通过 `export DATABASE_USER=test` 这样的 shell 导出设置）和 `.env` 文件中时，运行时环境变量优先。要让 `.env` 文件中的值获胜，请将 `override` 选项设置为 `true`。

样品 `.env` 文件如下所示：

```json
DATABASE_USER=test
DATABASE_PASSWORD=test
```

如果您需要在加载 `ConfigModule` 和引导 Nest 应用程序（例如，将微服务配置传递给 `NestFactory#createMicroservice()` 方法）之前可用一些环境变量，请使用 NestCLI 的 `--env-file` 选项。它指定应用程序启动前要加载的 `.env` 文件的路径。CLI 将文件传递给 Node.js`--env-file` 标志；有关详细信息，请参见 [Node.js documentation](https://nodejs.org/dist/v20.18.1/docs/api/cli.html#--env-fileconfig)。

```bash
$ nest start --env-file .env
```

#### 自定义环境文件路径

默认情况下，包查找 `.env` 当前工作目录（通常是应用程序的根目录）中的文件。为 `.env` 文件，设置 `envFilePath` 传递给的可选选项对象的属性 `forRoot()`，如下：

```typescript
ConfigModule.forRoot({
  envFilePath: '.development.env',
});
```

还可以为 `.env` 文件：

```typescript
ConfigModule.forRoot({
  envFilePath: ['.env.development.local', '.env.development'],
});
```

如果在多个文件中找到变量，则第一个文件优先。

#### 禁用环境变量加载

如果不想加载 `.env` 文件，只想从运行时环境访问环境变量（例如，通过 `export DATABASE_USER=test` 等 shell 导出进行设置），请将 options 对象的 `ignoreEnvFile` 属性设置为 `true`：

```typescript
ConfigModule.forRoot({
  ignoreEnvFile: true,
});
```

#### 本土 `.env` 支持

Node.js 可以使用 `--env-file` 标志（上面显示的 `nest start --env-file` 选项依赖于它）或使用 `process.loadEnvFile()` 方法自行加载 `.env` 文件。要让 Node.js 加载文件并继续使用 `ConfigModule` 进行其他操作，请将 `ignoreEnvFile` 设置为 `true`，如上所示，以便模块仅读取 `process.env`：

```bash
$ node --env-file=.env dist/main.js
```

因为变量已经在 `process.env` 何时 `forRoot()` 运行、验证、 `ConfigService#get()`，和 `registerAs()` 工厂照常运转。 `ConfigModule` 但是，将这些变量视为预定义的，因此它们仅在 `validatePredefined` 保留其默认值 `true`.在运行时环境中已经设置的变量总是胜过文件（没有与 `override` 选项），以及几个 `--env-file` 标志，最后一个文件优先，这与 `envFilePath`.

`process.loadEnvFile()` 必须在 `AppModule` 导入，因为 `forRoot()` 阅读 `process.env` 而 `app.module` 正在评估文件。身体中的呼唤 `main.ts` 来得太晚了，所以把它放在一个单独的文件中，然后先导入该文件：

```typescript
import './load-env.js'; // contains only process.loadEnvFile()
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
```

或者，保留 `ConfigModule` 负责加载文件（`envFilePath`、`override` 等），并通过 `parser` 选项仅替换解析器。解析器以 `Buffer` 的形式接收每个文件的内容，并返回键/值对（默认值为 `dotenv.parse`）。由于 `util.parseEnv()` 只接受字符串，请先转换缓冲区：

```typescript
import { parseEnv } from 'node:util';

ConfigModule.forRoot({
  parser: (buf) => parseEnv(buf.toString()),
});
```

> warning **Warning** 这个 Node.js 这些 API 背后的解析器与 dotenv 不完全兼容。例如，一个 UTF-8BOM 在第一个键名中结束，引号值中的引号结束该值（`'it's here'` 变成 `it`），并且仅由空格组成的值会吞噬下一行，因此在那里定义的变量丢失。它的行为也发生了变化 Node.js20.x 和 22.x 次要版本。Node.js 不展开变量，并且 `parseEnv()` 返回按名称排序的键，因此不要组合 `parser` 选项 [`expandVariables`](/application/configuration#expandable-variables)：对变量的引用，其名称排序稍后会解析，就好像该变量没有被设置一样。

#### 全局使用模块

使用 `ConfigModule` 在其他模块中，您需要导入它（与任何 Nest 模块）。或者，将其声明为 [全局模块](/modules#global-modules) 通过设置 `isGlobal` 购股权的性质反对 `true`，如下所示。在这种情况下，一旦 `ConfigModule` 被加载到根模块中（例如，`AppModule`)，不需要在其他模块中导入。

```typescript
ConfigModule.forRoot({
  isGlobal: true,
});
```

#### 自定义配置文件

对于更复杂的项目，可以使用返回嵌套配置对象的自定义配置文件。这允许您按功能对相关配置设置（例如，数据库相关设置）进行分组，并将它们存储在单独的文件中，以便您可以独立地管理它们。

自定义配置文件导出返回配置对象的工厂函数。配置对象可以是任何任意嵌套的普通 JavaScript 对象。在工厂内部，`process.env` 对象包含完全解析的环境变量键/值对（`.env` 文件和外部定义的变量如 [Getting started](/application/configuration#getting-started) 中所述解析和合并）。由于您控制返回的配置对象，因此可以添加所需的任何逻辑来将值转换到适当的类型，设置默认值，等等。例如：

```typescript
export default () => ({
  port: parseInt(process.env.PORT ?? '', 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '', 10) || 5432
  }
});
```

使用 `load` 传递给 `ConfigModule.forRoot()` 方法：

```typescript
import configuration from './config/configuration.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
    }),
  ],
})
export class AppModule {}
```

> info **Hint** 分配给 `load` 属性的值是一个数组，因此可以加载多个配置文件（例如，`load: [databaseConfig, authConfig]`）。

自定义配置文件还允许您从其他格式（如 YAML）加载配置。以下是 YAML 格式的配置示例：

```yaml
http:
  host: 'localhost'
  port: 8080

db:
  postgres:
    url: 'localhost'
    port: 5432
    database: 'yaml-db'

  sqlite:
    database: 'sqlite.db'
```

读取和解析 YAML 文件，您可以使用 `js-yaml` 包装：

```bash
$ npm i js-yaml
$ npm i -D @types/js-yaml
```

安装软件包后，使用 `yaml#load` 函数加载 YAML 上面创建的文件：

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const YAML_CONFIG_FILENAME = 'config.yaml';

export default () => {
  return yaml.load(
    readFileSync(join(import.meta.dirname, YAML_CONFIG_FILENAME), 'utf8'),
  ) as Record<string, any>;
};
```

> warning **Note** 在构建过程中，NestCLI 不会自动将您的“资产”（非 TS 文件）复制到 `dist` 文件夹。要确保复制 YAML 文件，请在 `nest-cli.json` 文件的 `compilerOptions#assets` 对象中指定它们。例如，如果 `config` 文件夹与 `src` 文件夹处于同一级别，请将 `compilerOptions#assets` 与值 `"assets": [{"include": "../config/*.yaml", "outDir": "./dist/config"}]` 一起添加。有关详细信息，请参见 [Assets](/cli/monorepo#assets)。

配置文件不会自动验证，即使您使用 `validationSchema` 选择权 `ConfigModule`（仅适用于环境变量）。如果您需要验证或想要应用转换，请在工厂函数中处理它们，在那里您可以完全控制配置对象。

例如，为了确保端口在一定范围内，在工厂函数中添加一个验证步骤：

```typescript
export default () => {
  const config = yaml.load(
    readFileSync(join(import.meta.dirname, YAML_CONFIG_FILENAME), 'utf8'),
  ) as Record<string, any>;

  if (config.http.port < 1024 || config.http.port > 49151) {
    throw new Error('HTTP port must be between 1024 and 49151');
  }

  return config;
};
```

现在，如果端口超出了指定的范围，应用程序在启动时会抛出一个错误。

#### 使用 `ConfigService`

要访问配置值，首先注入 `ConfigService`。与任何提供程序一样，您需要将其包含模块 `ConfigModule` 导入到使用它的模块中（除非您将传递给 `ConfigModule.forRoot()` 的 options 对象的 `isGlobal` 属性设置为 `true`）。将其导入到特征模块中，如下所示：

```typescript
@Module({
  imports: [ConfigModule],
  // ...
})
```

然后通过构造函数注入：

```typescript
constructor(private configService: ConfigService) {}
```

> info **Hint** 进口 `ConfigService` 从 `@nestjs/config` 包装。

然后在课堂上使用它：

```typescript
// get an environment variable
const dbUser = this.configService.get<string>('DATABASE_USER');

// get a custom configuration value
const dbHost = this.configService.get<string>('database.host');
```

如上所示，使用 `configService.get()` 方法通过传递变量名来获取一个简单的环境变量。您可以将类型参数传递为 TypeScript 类型提示（例如，`get<string>(...)`）。`get()` 方法还可以遍历嵌套的自定义配置对象（使用 [自定义配置文件](/application/configuration#custom-configuration-files) 创建），如第二个示例所示。

还可以使用接口作为类型提示获取整个嵌套的自定义配置对象：

```typescript
interface DatabaseConfig {
  host: string;
  port: number;
}

const dbConfig = this.configService.get<DatabaseConfig>('database');

// you can now use `dbConfig.port` and `dbConfig.host`
const port = dbConfig.port;
```

这个 `get()` 方法还接受一个可选的第二个参数，该参数定义默认值，当键不存在时返回：

```typescript
// use "localhost" when "database.host" is not defined
const dbHost = this.configService.get<string>('database.host', 'localhost');
```

如果需要一个值，请改用 `getOrThrow()` 方法。它接受与 `get()` 相同的参数，但如果解析的值为 `undefined`，则抛出错误，并且其返回类型排除 `undefined`：

```typescript
// throws if "DATABASE_USER" is not defined
const dbUser = this.configService.getOrThrow<string>('DATABASE_USER');
```

`ConfigService` 有两个可选的泛型（类型参数）。第一个有助于防止访问不存在的配置属性：

```typescript
interface EnvironmentVariables {
  PORT: number;
  TIMEOUT: string;
}

// somewhere in the code
constructor(private configService: ConfigService<EnvironmentVariables>) {
  const port = this.configService.get('PORT', { infer: true });

  // TypeScript Error: this is invalid as the URL property is not defined in EnvironmentVariables
  const url = this.configService.get('URL', { infer: true });
}
```

当 `infer` 属性设置为 `true` 时，`ConfigService#get` 方法从接口推断属性类型。例如，`port` 被键入为 `number`，因为 `PORT` 在 `EnvironmentVariables` 接口中具有 `number` 类型（启用 `strictNullChecks` 编译器选项后，类型为 `number | undefined`）。

与 `infer` 功能，还可以推断嵌套的自定义配置对象的属性类型，即使使用点符号：

```typescript
constructor(private configService: ConfigService<{ database: { host: string } }>) {
  const dbHost = this.configService.get('database.host', { infer: true })!;
  // typeof dbHost === "string"                                          |
  //                                                                     +--> non-null assertion operator
}
```

第二个通用依赖于第一个。它充当类型断言，删除 `undefined` 键入 `ConfigService` 方法可以返回 `strictNullChecks` 已启用。例如：

```typescript
// ...
constructor(private configService: ConfigService<{ PORT: number }, true>) {
  //                                                               ^^^^
  const port = this.configService.get('PORT', { infer: true });
  //    ^^^ The type of port is 'number', so you don't need TS type assertions
}
```

> info **Hint** 若要使 `ConfigService#get` 方法忽略 `process.env` 变量并仅从自定义配置文件（如果使用验证，则从已验证的环境变量）检索值，请在传递给 `ConfigModule.forRoot()` 的 options 对象中将 `skipProcessEnv` 选项设置为 `true`。

#### 配置命名空间

这个 `ConfigModule` 允许您定义和加载多个自定义配置文件，如 [Custom configuration files](/application/configuration#custom-configuration-files) 上面。您可以使用嵌套配置对象管理复杂的配置层次结构，如该部分所示。或者，您可以使用 `registerAs()` 功能，如下：

```typescript
export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432
}));
```

与自定义配置文件一样，在 `registerAs()` 工厂函数中，`process.env` 对象包含完全解析的环境变量键/值对（`.env` 文件和外部定义的变量按照 [Getting started](/application/configuration#getting-started) 中所述进行解析和合并）。

> info **Hint** 这个 `registerAs()` 函数从 `@nestjs/config` 包装。

使用 `load` 财产 `forRoot()` 方法的选项对象，与加载自定义配置文件的方式相同：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [databaseConfig],
    }),
  ],
})
export class AppModule {}
```

为了得到 `host` 来自 `database` 命名空间，使用点符号。使用 `'database'` 作为属性名称的前缀。它对应于命名空间的名称（作为第一个参数传递给 `registerAs()` 函数）：

```typescript
const dbHost = this.configService.get<string>('database.host');
```

或者，您可以注射 `database` 直接命名空间，这为您提供了强类型：

```typescript
constructor(
  @Inject(databaseConfig.KEY)
  private dbConfig: ConfigType<typeof databaseConfig>,
) {}
```

> info **Hint** 这个 `ConfigType` 类型是从 `@nestjs/config` 包装。

#### 模块中的名称空间配置

若要使用命名空间配置作为应用程序中另一个模块的配置对象，请使用 `.asProvider()` 配置对象的方法。此方法将命名空间配置转换为可传递给 `forRootAsync()` 要配置的模块的方法（或等效方法）：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
  ],
})
```

了解如何 `.asProvider()` 方法有效，看看它的返回值：

```typescript
// Return value of the .asProvider() method
{
  imports: [ConfigModule.forFeature(databaseConfig)],
  useFactory: (configuration: ConfigType<typeof databaseConfig>) => configuration,
  inject: [databaseConfig.KEY]
}
```

这种结构允许您将命名空间配置插入到其他模块中，而无需编写重复的样板代码，这使得您的应用程序保持有组织性和模块化。

#### 缓存环境变量

访问 `process.env` 可能会很慢。若要改善存储在 `process.env` 中的变量的 `ConfigService#get` 方法的性能，请设置传递给 `ConfigModule.forRoot()` 的 options 对象的 `cache` 属性：

```typescript
ConfigModule.forRoot({
  cache: true,
});
```

#### 部分配准

到目前为止，我们已经处理了根模块中的配置文件（例如，`AppModule`）与 `forRoot()` 方法。在更复杂的项目结构中，特定于功能的配置文件可能位于几个不同的目录中。不将所有这些文件加载到根模块中，可以使用 `@nestjs/config` 名为**部分注册**的包，它只引用与每个功能模块相关联的配置文件。使用 `forFeature()` 特征模块内执行部分注册的静态方法，如下所示：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
})
export class DatabaseModule {}
```

> warning **Warning** 在某些情况下，您可能需要访问通过在 `onModuleInit()` 钩子而不是构造函数。这是因为 `forFeature()` 方法在模块初始化期间运行，模块初始化的顺序是不确定的。如果您访问构造函数中的另一个模块以这种方式加载的值，则配置所依赖的模块可能尚未初始化。这个 `onModuleInit()` 方法只有在它所依赖的所有模块都已初始化后才运行，因此这种技术是安全的。

#### 模式验证

如果没有提供所需的环境变量或不符合某些验证规则，则在应用程序启动期间抛出异常是标准做法。这个 `@nestjs/config` 软件包支持两种方法：

- 通过 `validationSchema` 选项传递了与 [Standard Schema](https://standardschema.dev/) 兼容的架构。任何实现规范的库都可以工作，例如 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/) 和 [ArkType](https://arktype.io/)。
- 定制 `validate()` 将环境变量作为输入的函数。

安装您选择的验证库。此示例使用 Zod：

```bash
$ npm install --save zod
```

现在定义一个验证模式并将其通过 `validationSchema`options 对象的属性传递给 `forRoot()`，如下所示：

```typescript
import { z } from 'zod';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: z.object({
        NODE_ENV: z
          .enum(['development', 'production', 'test', 'provision'])
          .default('development'),
        PORT: z.coerce.number().default(3000),
      }),
    }),
  ],
})
export class AppModule {}
```

此架构为 `NODE_ENV` 和 `PORT`，如果不在环境中提供这些变量，则使用这些变量（`.env` 文件或进程环境）。要需要一个变量，请不使用默认值。如果变量丢失，验证步骤将在引导过程中抛出异常。

环境变量总是以字符串的形式到达，这就是为什么 `PORT` 使用 `z.coerce.number()`. `ConfigService` 提供模式返回的值，因此模式中声明的强制和转换适用于应用程序读取的配置。架构未声明的变量仍然可用 `ConfigService` 也是。

默认情况下，未知环境变量（许多不相关的条目 `process.env` 总是携带，例如 `PATH` 和 `HOME`) 不会触发验证异常，每个失败变量都会被报告，而不仅仅是第一个。每个验证错误的格式为 `PATH: message`，错误由换行符连接。

您可以通过 `validationOptions` 键转发特定于库的选项。由于该选项是根据标准架构规范键入的，因此特定于库的设置位于 `libraryOptions` 下：

```typescript
import { z } from 'zod';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: z.object({
        NODE_ENV: z
          .enum(['development', 'production', 'test', 'provision'])
          .default('development'),
        PORT: z.coerce.number().default(3000),
      }),
      validationOptions: {
        libraryOptions: {
          // options specific to your validation library
        },
      },
    }),
  ],
})
export class AppModule {}
```

> info **Hint** 仍然支持 Joi，但它需要**Joi v18 或更高版本**，它实现了标准模式规范。像以前一样将 `Joi.object({ ... &#125;)` 传递到 `validationSchema`，并将 `allowUnknown` 和 `abortEarly` 等 Joi 设置放在 `validationOptions.libraryOptions` 下。对于 Joi 模式，`@nestjs/config` 保留其历史默认值 `allowUnknown: true` 和 `abortEarly: false`，并合并您在它们之上传递的选项。对于新项目，我们推荐使用现代标准模式库，如 Zod。

> info **Hint** 若要禁用预定义环境变量的验证，请在传递给 `forRoot()` 的 options 对象中将 `validatePredefined` 属性设置为 `false`。预定义的环境变量是在导入模块之前设置的过程变量（`process.env` 变量）。例如，如果您使用 `PORT=3000 node main.js` 启动应用程序，则 `PORT` 是预定义的环境变量。

#### 自定义验证函数

或者，您可以指定一个**同步**`validate` 功能。它获取一个包含环境变量的对象（从 `.env` 文件和进程）并返回一个包含已验证环境变量的对象，因此您可以在需要时转换或修改它们。如果函数抛出错误，应用程序不会引导。

本示例使用 `class-transformer` 和 `class-validator` 包裹。首先，定义：

- 具有验证约束的类，
- 验证函数，它利用 `plainToInstance` 和 `validateSync` 功能。

```typescript
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, Max, Min, validateSync } from 'class-validator';

enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
  Provision = "provision",
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    config,
    { enableImplicitConversion: true },
  );
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
```

完成此操作后，将 `validate` 函数作为 `ConfigModule` 的配置选项传递：

```typescript
import { validate } from './env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
    }),
  ],
})
export class AppModule {}
```

#### 自定义 getter 函数

`ConfigService` 定义泛型 `get()` 方法，通过键检索配置值。您还可以添加 getter 函数以获得更自然的编码风格：

```typescript
@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get isAuthEnabled(): boolean {
    return this.configService.get('AUTH_ENABLED') === 'true';
  }
}
```

> info **Hint** 这个例子假设 `AUTH_ENABLED` 是一个字符串。如果您的验证模式将其转换为布尔值，`get()` 将返回转换后的值，因此直接返回 `this.configService.get<boolean>('AUTH_ENABLED')`，而不是将其与 `'true'` 进行比较。

现在您可以使用 getter 函数，如下所示：

```typescript
@Injectable()
export class AppService {
  constructor(apiConfigService: ApiConfigService) {
    if (apiConfigService.isAuthEnabled) {
      // Authentication is enabled
    }
  }
}
```

#### 环境变量加载挂钩

如果模块配置依赖于从 `.env` 文件，使用 `ConfigModule.envVariablesLoaded` 钩子以确保在读取 `process.env` 对象：

```typescript
export async function getStorageModule() {
  await ConfigModule.envVariablesLoaded;
  return process.env.STORAGE === 'S3' ? S3StorageModule : DefaultStorageModule;
}
```

此构造保证所有配置变量在 `ConfigModule.envVariablesLoaded` 承诺解决。

#### 条件模块配置

有时，您可能希望有条件地加载模块，并在环境变量中指定条件。这个 `@nestjs/config` 包提供 `ConditionalModule` 为此目的。

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    ConditionalModule.registerWhen(FooModule, 'USE_FOO'),
  ],
})
export class AppModule {}
```

此模块加载 `FooModule` 除非 `USE_FOO` 环境变量设置为 `false`（不区分大小写）。如果未定义变量，`FooModule` 是加载的。还可以传递自定义条件：接收 `process.env` 引用并返回布尔值：

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    ConditionalModule.registerWhen(
      FooBarModule,
      (env: NodeJS.ProcessEnv) => !!env['foo'] && !!env['bar'],
    ),
  ],
})
export class AppModule {}
```

当您使用 `ConditionalModule`，确保 `ConfigModule` 也加载到应用程序中，以便 `ConfigModule.envVariablesLoaded` 胡克解决了。如果钩子在 5 秒内（或在超时时间内，以毫秒为单位，通过 `timeout` 第三人的财产 `options` 的论点 `registerWhen()` 方法），`ConditionalModule` 抛出错误和 Nest 中止启动应用程序。

#### 可扩展变量

这个 `@nestjs/config` 包支持环境变量扩展。使用这种技术，您可以创建嵌套环境变量，其中一个变量在另一个变量的定义中被引用。例如：

```json
APP_URL=mywebsite.com
SUPPORT_EMAIL=support@${APP_URL}
```

使用这种构造，变量 `SUPPORT_EMAIL` 解析为 `'support@mywebsite.com'`。`${...}` 语法触发解析 `SUPPORT_EMAIL` 定义中变量 `APP_URL` 的值。

> info **Hint** 对于此特性，`@nestjs/config` 包内部使用 [dotenv-expand](https://github.com/motdotla/dotenv-expand)。

启用环境变量展开，将选项对象的 `expandVariables` 属性传递给 `ConfigModule.forRoot()`，如下所示。除了 `true`，您还可以传递带有 `dotenv-expand` 选项的对象。

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      // ...
      expandVariables: true,
    }),
  ],
})
export class AppModule {}
```

#### 用于 `main.ts`

虽然配置存储在服务中，但您仍然可以在 `main.ts` 文件，例如，用于读取诸如应用程序端口或 CORS 主持。

要访问它，请使用 `app.get()` 服务类的方法：

```typescript
const configService = app.get(ConfigService);
```

然后，您可以像往常一样使用它，通过调用 `get()` 具有配置键的方法：

```typescript
const port = configService.get('PORT');
```
