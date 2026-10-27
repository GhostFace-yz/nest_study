# Hot reload

Source: https://docs.nestjs.com/recipes/hot-reload

**TypeScript 编译**对应用程序的引导时间影响最大。和 [网络包](https://github.com/webpack/webpack)HMR（热模块替换），您不需要在每次发生变化时重新编译整个项目。这大大减少了实例化应用程序所需的时间，并使迭代开发更快。

> warning **Warning** `webpack` 不会自动复制您的资产（例如， `graphql` 文件）到 `dist` 文件夹。同样， `webpack` 与静态全局路径不兼容（例如 `entities` 物业于 `TypeOrmModule`).

> warning **Warning** 作为 NestJS v12，webpack builder 被**弃用**，Rspack 是 monorepos 的默认捆绑包。此配方针对基于 webpack 的 CommonJS 项目，这就是下面的示例使用的原因 `module.hot` 和一个平原 `bootstrap()` 打电话而不是 ESM 顶级 `await` 在这些文档的其他地方使用。对于新项目，首选 `--builder rspack`.

### 和 CLI

如果使用 [Nest CLI](/cli/overview)，配置过程很简单。CLI 包装 `webpack`，允许您使用 `HotModuleReplacementPlugin`。

#### 安装

首先，安装所需的软件包：

```bash
$ npm i --save-dev webpack-node-externals run-script-webpack-plugin webpack
```

> info **Hint** 如果您使用**纱线浆果**（不是经典纱线），请安装 `webpack-pnp-externals` 包，而不是 `webpack-node-externals`。

#### 配置

安装完成后，创建一个 `webpack-hmr.config.js` 应用程序根目录中的文件：

```typescript
const nodeExternals = require('webpack-node-externals');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');

module.exports = function (options, webpack) {
  return {
    ...options,
    entry: ['webpack/hot/poll?100', options.entry],
    externals: [
      nodeExternals({
        allowlist: ['webpack/hot/poll?100'],
      }),
    ],
    plugins: [
      ...options.plugins,
      new webpack.HotModuleReplacementPlugin(),
      new webpack.WatchIgnorePlugin({
        paths: [/\.js$/, /\.d\.ts$/],
      }),
      new RunScriptWebpackPlugin({ name: options.output.filename, autoRestart: false }),
    ],
  };
};
```

> info **Hint** 对于**Yarn Berry**（不是经典纱线），不要在 `externals` 配置属性中使用 `nodeExternals`，而是使用 `webpack-pnp-externals` 包中的 `WebpackPnpExternals`：`WebpackPnpExternals({ exclude: ['webpack/hot/poll?100'] })`。

该函数将包含默认 webpack 配置的原始对象作为其第一个参数，并引用底层 `webpack` 使用的包 NestCLI 作为它的第二个论点。它返回一个修改后的 webpack 配置 `HotModuleReplacementPlugin`,`WatchIgnorePlugin`，和 `RunScriptWebpackPlugin` 插件。

#### 热模块更换

启用**HMR**，打开应用程序条目文件（`main.ts`) 并添加以下与 webpack 相关的说明：

```typescript
declare const module: any;

async function bootstrap() {
  if (module.hot?.data?.closePromise) {
    // wait for the previous application instance to fully shut down
    await module.hot.data.closePromise;
  }

  const app = await NestFactory.create(AppModule, {
    forceCloseConnections: !!module.hot,
  });
  await app.listen(process.env.PORT ?? 3000);

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose((data: any) => {
      data.closePromise = app.close();
    });
  }
}
bootstrap();
```

> info **Hint** `app.close()` 是异步的，但是 webpack 不等待 `dispose()` 回调。把归还的承诺藏在 `module.hot.data` 让下一个应用程序实例在再次绑定到端口之前等待它，这（与 `forceCloseConnections`) 预防 `EADDRINUSE` 重新加载时出错。

若要简化执行过程，请在 `package.json` 文件：

```json
"start:dev": "nest build --webpack --webpackPath webpack-hmr.config.js --watch"
```

然后运行以下命令：

```bash
$ npm run start:dev
```

### 没有 CLI

如果你不使用 [Nest CLI](/cli/overview) 配置稍微复杂一些，需要更多的手动步骤。

#### 安装

首先，安装所需的软件包：

```bash
$ npm i --save-dev webpack webpack-cli webpack-node-externals ts-loader run-script-webpack-plugin
```

> info **Hint** 如果您使用**纱线浆果**（不是经典纱线），请安装 `webpack-pnp-externals` 包，而不是 `webpack-node-externals`。

#### 配置

安装完成后，创建一个 `webpack.config.js` 应用程序根目录中的文件：

```typescript
const webpack = require('webpack');
const path = require('path');
const nodeExternals = require('webpack-node-externals');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');

module.exports = {
  entry: ['webpack/hot/poll?100', './src/main.ts'],
  target: 'node',
  externals: [
    nodeExternals({
      allowlist: ['webpack/hot/poll?100'],
    }),
  ],
  module: {
    rules: [
      {
        test: /.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  mode: 'development',
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [new webpack.HotModuleReplacementPlugin(), new RunScriptWebpackPlugin({ name: 'server.js', autoRestart: false })],
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'server.js',
  },
};
```

> info **Hint** 对于**Yarn Berry**（不是经典纱线），不要在 `externals` 配置属性中使用 `nodeExternals`，而是使用 `webpack-pnp-externals` 包中的 `WebpackPnpExternals`：`WebpackPnpExternals({ exclude: ['webpack/hot/poll?100'] })`。

这个配置告诉 webpack 关于应用程序的一些基本信息：条目文件的位置，保存**编译**文件的目录，以及用于编译源文件的加载程序。您通常可以按原样使用此文件，即使您不完全理解所有选项。

#### 热模块更换

启用**HMR**，打开应用程序条目文件（`main.ts`) 并添加以下与 webpack 相关的说明：

```typescript
declare const module: any;

async function bootstrap() {
  if (module.hot?.data?.closePromise) {
    // wait for the previous application instance to fully shut down
    await module.hot.data.closePromise;
  }

  const app = await NestFactory.create(AppModule, {
    forceCloseConnections: !!module.hot,
  });
  await app.listen(process.env.PORT ?? 3000);

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose((data: any) => {
      data.closePromise = app.close();
    });
  }
}
bootstrap();
```

> info **Hint** `app.close()` 是异步的，但是 webpack 不等待 `dispose()` 回调。把归还的承诺藏在 `module.hot.data` 让下一个应用程序实例在再次绑定到端口之前等待它，这（与 `forceCloseConnections`) 预防 `EADDRINUSE` 重新加载时出错。

若要简化执行过程，请在 `package.json` 文件：

```json
"start:dev": "webpack --config webpack.config.js --watch"
```

然后运行以下命令：

```bash
$ npm run start:dev
```

#### 例子

工作示例可在 [webpack 示例](https://github.com/nestjs/nest/tree/master/sample/08-webpack) 在 GitHub 上。
