# SWC (fast compiler)

Source: https://docs.nestjs.com/recipes/swc

[SWC](https://swc.rs/)（Speedy Web Compiler）是一个可扩展的基于 Rust 的平台，可用于编译和捆绑。使用 SWC 与 NestCLI 是显著加快开发过程的直接方法。

> info **Hint** SWC 大约比默认值快**20 倍**TypeScript 编译器。

#### 安装

要开始，首先安装几个软件包：

```bash
$ npm i --save-dev @swc/cli @swc/core
```

#### 入门

安装完成后，您可以使用 `swc` 生成器 NestCLI，如下：

```bash
$ nest start -b swc
# OR nest start --builder swc
```

> info **Hint** 如果您的存储库是单存储库，请参见 [Monorepo](/recipes/swc#monorepo) 部分。

而不是通过 `-b` 标志，您可以设置 `compilerOptions.builder` 财产至 `"swc"` 在你的 `nest-cli.json` 文件：

```json
{
  "compilerOptions": {
    "builder": "swc"
  }
}
```

要自定义生成器的行为，请传递一个包含两个属性的对象，`type`(`"swc"`）和 `options`，如下：

```json
{
  "compilerOptions": {
    "builder": {
      "type": "swc",
      "options": {
        "swcrcPath": "infrastructure/.swcrc",
      }
    }
  }
}
```

例如，使 SWC 汇编 `.jsx` 和 `.tsx` 文件，请使用以下配置：

```json
{
  "compilerOptions": {
    "builder": {
      "type": "swc",
      "options": { "extensions": [".ts", ".tsx", ".js", ".jsx"] }
    },
  }
}
```

要在监视模式下运行应用程序，请使用以下命令：

```bash
$ nest start -b swc -w
# OR nest start --builder swc --watch
```

#### 类型检查

与默认值不同 TypeScript 编译器，SWC 不执行任何类型的检查本身。要打开类型检查，请使用 `--type-check` 旗帜：

```bash
$ nest start -b swc --type-check
```

此命令指示 NestCLI 奔跑 `tsc` 在 `noEmit` 并排模式 SWC，它异步执行类型检查。而不是通过 `--type-check` 标志，也可以设置 `compilerOptions.typeCheck` 财产至 `true` 在你的 `nest-cli.json` 文件：

```json
{
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true
  }
}
```

#### CLI 插件（SWC）

这个 `--type-check` 标志自动执行**NestJSCLI 插件**并生成一个序列化的元数据文件，然后应用程序可以在运行时加载该文件。

#### SWC 配置

这个 SWCbuilder 是预先配置的，以满足 NestJS 应用。但是，您可以通过创建 `.swcrc` 根目录中的文件，并根据需要调整选项：

```json
{
  "$schema": "https://swc.rs/schema.json",
  "sourceMaps": true,
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "baseUrl": "./"
  },
  "minify": false
}
```

> info **Hint** 这个 SWCbuilder 发出的模块格式与 TypeScript 编译器将：ES 模块当您 `package.json` 文件集 `"type": "module"`（新项目的默认值），否则为 CommonJS。一个 `module` 设置 `.swcrc` 覆盖这个。

#### 单存储库

> info **Hint** 作为 NestJS v12，monorepos 默认使用 Rspack builder，它已经使用 SWC （通过 Rspack 内置的 `swc-loader`).以下设置仅适用于使用已弃用的 webpack 生成器的情况。

如果您的存储库是 monorepo，那么您必须将 `webpack` 配置为使用 `swc-loader`，而不是使用 `swc` 生成器。

首先，安装所需的软件包：

```bash
$ npm i --save-dev swc-loader
```

安装完成后，创建一个 `webpack.config.js` 应用程序根目录中的文件，其中包含以下内容：

```js
const swcDefaultConfig = require('@nestjs/cli/lib/compiler/defaults/swc-defaults').swcDefaultsFactory().swcOptions;

module.exports = {
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'swc-loader',
          options: swcDefaultConfig,
        },
      },
    ],
  },
};
```

#### 单回购和 CLI 插件

如果您使用 CLI 插件，`swc-loader` 不会自动加载它们。相反，您必须创建一个单独的文件来手动加载它们。为此，请创建一个 `generate-metadata.ts` 文件旁边的 `main.ts` 包含以下内容的文件：

```ts
import { PluginMetadataGenerator } from '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator.js';
import { ReadonlyVisitor } from '@nestjs/swagger/plugin';

const generator = new PluginMetadataGenerator();
generator.generate({
  visitors: [new ReadonlyVisitor({ introspectComments: true, pathToSource: import.meta.dirname })],
  outputDir: import.meta.dirname,
  watch: true,
  tsconfigPath: 'apps/<name>/tsconfig.app.json',
});
```

> info **Hint** 本示例使用 `@nestjs/swagger` 插件，但是你可以使用任何你选择的插件。

这个 `generate()` 方法接受以下选项：

| | |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `watch` | 是否观察项目的变化。 |
| `tsconfigPath` | `tsconfig.json` 文件的路径。相对于当前工作目录（`process.cwd()`）。 |
| `outputDir` | 保存元数据文件的目录的路径。 |
| `visitors` | 用于生成元数据的访问者数组。 |
| `filename` | 元数据文件的名称。默认值为 `metadata.ts`。 |
| `printDiagnostics` | 是否将诊断打印到控制台。默认值为 `true`。 |

最后，运行 `generate-metadata` 在单独的终端窗口中使用以下命令编写脚本：

```bash
$ npx ts-node src/generate-metadata.ts
# OR npx ts-node apps/{YOUR_APP}/src/generate-metadata.ts
```

#### 常见陷阱

如果您使用 TypeORM、MikroORM 或任何其他 ORM 在应用程序中，您可能会遇到循环导入问题。SWC 无法很好地处理**循环导入**，因此请使用以下解决方法：

```typescript
@Entity()
export class User {
  @OneToOne(() => Profile, (profile) => profile.user)
  profile: Relation<Profile>; // <--- see "Relation<>" type here instead of just "Profile"
}
```

> info **Hint** 这个 `Relation` 类型是从 `typeorm` 包装。

这可以防止属性的类型保存在转录代码的属性元数据中，从而避免循环依赖问题。

如果你的 ORM 没有提供类似的解决方法，您可以自己定义包装器类型：

```typescript
/**
 * Wrapper type used to circumvent ESM modules circular dependency issue
 * caused by reflection metadata saving the type of the property.
 */
export type WrapperType<T> = T; // WrapperType === Relation
```

为了所有人 [循环依赖注入](/fundamentals/circular-dependency) 在项目中，您还需要使用上述自定义包装器类型：

```typescript
@Injectable()
export class UsersService {
  constructor(
    @Inject(forwardRef(() => ProfileService))
    private readonly profileService: WrapperType<ProfileService>,
  ) {}
}
```

### Jest+SWC

使用 SWC 和 Jest（CommonJS 项目的默认测试运行程序），安装以下软件包：

```bash
$ npm i --save-dev jest @swc/core @swc/jest
```

安装完成后，更新您的 `package.json` 或者 `jest.config.js` 包含以下内容的文件（取决于您的配置）：

```json
{
  "jest": {
    "transform": {
      "^.+\\.(t|j)s?$": ["@swc/jest"]
    }
  }
}
```

此外，添加 `legacyDecorator` 和 `decoratorMetadata``transform` 您的属性 `.swcrc` 文件：

```json
{
  "$schema": "https://swc.rs/schema.json",
  "sourceMaps": true,
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "transform": {
      "legacyDecorator": true,
      "decoratorMetadata": true
    },
    "baseUrl": "./"
  },
  "minify": false
}
```

如果您使用 NestJSCLI 项目中的插件，您必须运行 `PluginMetadataGenerator` 手动的。参见 [Monorepo and CLI plugins](/recipes/swc#monorepo-and-cli-plugins) 了解更多信息的部分。

### Vitest

[Vitest](https://vitest.dev/) 是一款快速、轻便的测试运行器，设计用于与 Vite 配合使用。使用 ES 模块（默认值）的新 NestJS 项目已经设置了 Vitest。本节展示了如何配置 Vitest 以使用 SWC 构建测试文件。

#### 安装

要开始，首先安装所需的软件包：

```bash
$ npm i --save-dev vitest unplugin-swc @swc/core @vitest/coverage-v8
```

#### 配置

创建一个 `vitest.config.ts` 应用程序根目录中的文件，其中包含以下内容：

```ts
import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      // Ensure Vitest correctly resolves TypeScript path aliases
      'src': resolve(import.meta.dirname, './src'),
    },
  },
});
```

此配置文件设置 Vitest 环境、根目录和 SWC 插件。您还应该为 e2e 测试创建一个单独的配置文件（例如，`vitest.config.e2e.ts`），还有一个附加的 `include` 指定测试文件的全局模式的字段：

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.e2e-spec.ts'],
    globals: true,
    root: './',
  },
  plugins: [swc.vite()],
});
```

此外，您还可以设置 `alias` 支持的选项 TypeScript 测试中的路径：

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.e2e-spec.ts'],
    globals: true,
    alias: {
      '@src': './src',
      '@test': './test',
    },
    root: './',
  },
  resolve: {
    alias: {
      '@src': './src',
      '@test': './test',
    },
  },
  plugins: [swc.vite()],
});
```

### 路径别名

Vitest 不会自动解析 TypeScript 路径别名，例如 `src/`，这可能会导致测试期间的相关性解析错误。若要解决此问题，请添加以下内容 `resolve.alias` 配置到您的 `vitest.config.ts` 文件：

```ts
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'src': resolve(import.meta.dirname, './src'),
    },
  },
});
```

这确保了 Vitest 正确解析模块导入，防止与缺少依赖项相关的错误。

#### 更新 E2E 测试中的导入

将任何使用 `import * as request from 'supertest'` 的 E2E 测试导入更改为 `import request from 'supertest'`。`supertest` 是一个导出函数的 CommonJS 模块，在 Vitest 这样的 ES 模块设置中，命名空间导入是不可调用的，因此您需要默认导入。

最后，更新测试脚本 `package.json` 文件：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:debug": "vitest --inspect-brk --no-file-parallelism",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts"
  }
}
```

这些脚本运行测试，监视更改，生成代码覆盖率报告，并启动调试会话。这个 `test:e2e` 脚本使用专用配置文件运行 E2E 测试。

> info **Hint** [nest-vitest 存储库](https://github.com/TrilonIO/nest-vitest) 中提供了一个工作示例。
