# Complexity

Source: https://docs.nestjs.com/graphql/complexity

> warning **Warning** 本章仅适用于代码优先的方法。

查询复杂度允许您定义某些字段的复杂度，并以**最大复杂度**限制查询。这个想法是将每个字段的复杂性表示为一个数字。常见的默认值是给每个字段赋予 `1` 的复杂度。您还可以自定义如何使用复杂性估计器计算 GraphQL 查询的复杂性。复杂度估计器是计算字段复杂度的函数。您可以向规则中添加任意数量的估计量，它们会一个接一个地运行。返回数值的第一估计器确定该字段的复杂度。

这个 `@nestjs/graphql` 软件包与以下工具集成：[graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity)，提供了基于成本分析的解决方案。有了这个库，您可以拒绝执行成本太高的查询。

#### 安装

首先，安装所需的依赖项：

```bash
$ npm install --save graphql-query-complexity
```

#### 入门

安装完成后，定义 `ComplexityPlugin` 班级：

```typescript
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { Plugin } from '@nestjs/apollo';
import {
  ApolloServerPlugin,
  BaseContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { GraphQLError } from 'graphql';
import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity';

@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {
  constructor(private gqlSchemaHost: GraphQLSchemaHost) {}

  async requestDidStart(): Promise<GraphQLRequestListener<BaseContext>> {
    const maxComplexity = 20;
    const { schema } = this.gqlSchemaHost;

    return {
      async didResolveOperation({ request, document }) {
        const complexity = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [
            fieldExtensionsEstimator(),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        if (complexity > maxComplexity) {
          throw new GraphQLError(
            `Query is too complex: ${complexity}. Maximum allowed complexity: ${maxComplexity}`,
          );
        }
        console.log('Query Complexity:', complexity);
      },
    };
  }
}
```

出于演示目的，最大允许复杂度设置为 `20`。上面的示例使用了两个估计器，`fieldExtensionsEstimator` 和 `simpleEstimator`：

- `fieldExtensionsEstimator`：提取为架构的每个字段定义的复杂性值（通过字段的 `extensions`）
- `simpleEstimator`：返回每个字段的固定复杂度（用作没有定义复杂度的字段的回退）

> info **Hint** 记得将此类添加到 `providers` 模块的数组。

#### 场级复杂性

有了这个插件，您可以通过指定 `complexity`options 对象中的属性传递给 `@Field()` 装饰师：

```typescript
@Field({ complexity: 3 })
title: string;
```

或者，您可以定义估计函数：

```typescript
@Field({ complexity: (options: ComplexityEstimatorArgs) => ... })
title: string;
```

#### 查询/变异级复杂度

这个 `@Query()` 和 `@Mutation()` 装修商也接受 `complexity` 选项对象中的属性：

```typescript
@Query(() => [Item], {
  complexity: (options: ComplexityEstimatorArgs) =>
    options.args.count * options.childComplexity,
})
items(@Args('count') count: number) {
  return this.itemsService.getItems({ count });
}
```
