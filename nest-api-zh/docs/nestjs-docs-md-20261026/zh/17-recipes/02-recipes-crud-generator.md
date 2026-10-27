# CRUD generator

Source: https://docs.nestjs.com/recipes/crud-generator

在项目的生命周期中，构建新功能通常意味着向应用程序添加新资源。每个新资源通常需要相同的一组重复操作。

#### 介绍

考虑一个需要暴露的现实场景 CRUD**用户**和**产品**两个实体的端点。按照最佳实践，您必须为每个实体执行几个操作：

- 生成模块（`nest g mo`）保持代码有条理并建立清晰的边界（对相关组件进行分组）
- 生成控制器（`nest g co`）来定义 CRUD 路由（或查询/突变 GraphQL 应用）
- 生成服务（`nest g s`) 实现和隔离业务逻辑
- 生成实体类/接口以表示资源数据形状
- 生成数据传输对象（或输入 GraphQL 应用程序）定义如何通过网络发送数据

为了加快这个重复的过程，[Nest CLI](/cli/overview) 提供自动生成所有这些样板代码的生成器（示意图）。

> info **Note** 原理图支持生成**HTTP**控制器，**微服务**控制器，**GraphQL**解析器（代码优先和模式优先）和**WebSocket**网关。

#### 生成新资源

要创建新资源，请在项目的根目录中运行以下命令：

```shell
$ nest g resource
```

这个 `nest g resource` 命令不仅生成 NestJS 构建块（模块、服务和控制器类），但也是实体类，DTO 类和测试（`.spec`) 文件。

以下是生成的控制器文件（对于 RESTAPI）：

```typescript
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
}
```

该命令还为所有 CRUD 端点：路由 RESTAPI、查询和突变 GraphQL 以及微服务和 WebSocket 网关的消息处理程序。

> info **Note** 生成的服务类**不**绑定到任何特定的**ORM（或数据源）**，这使得生成器足够通用，可以满足任何项目的需求。默认情况下，所有方法都包含占位符，您可以用特定于项目的数据源填充这些占位符。

同样，为 GraphQL 应用程序，选择 `GraphQL (code first)`（或 `GraphQL (schema first)`) 作为您的传输层。

在这种情况下，Nest 生成解析器类，而不是 RESTAPI 控制器：

```shell
$ nest g resource users

> ? What transport layer do you use? GraphQL (code first)
> ? Would you like to generate CRUD entry points? Yes
> CREATE src/users/users.module.ts (224 bytes)
> CREATE src/users/users.resolver.spec.ts (525 bytes)
> CREATE src/users/users.resolver.ts (1109 bytes)
> CREATE src/users/users.service.spec.ts (453 bytes)
> CREATE src/users/users.service.ts (625 bytes)
> CREATE src/users/dto/create-user.input.ts (195 bytes)
> CREATE src/users/dto/update-user.input.ts (281 bytes)
> CREATE src/users/entities/user.entity.ts (187 bytes)
> UPDATE src/app.module.ts (312 bytes)
```

> info **Hint** 要跳过生成测试文件，请传递 `--no-spec` 标志，如下所示：`nest g resource users --no-spec`。

如下所示，该命令不仅创建所有样板突变和查询，还使用 `UsersService`，这个 `User` 实体和 DTO。

```typescript
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { CreateUserInput } from './dto/create-user.input.js';
import { UpdateUserInput } from './dto/update-user.input.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Mutation(() => User)
  createUser(@Args('createUserInput') createUserInput: CreateUserInput) {
    return this.usersService.create(createUserInput);
  }

  @Query(() => [User], { name: 'users' })
  findAll() {
    return this.usersService.findAll();
  }

  @Query(() => User, { name: 'user' })
  findOne(@Args('id', { type: () => Int }) id: number) {
    return this.usersService.findOne(id);
  }

  @Mutation(() => User)
  updateUser(@Args('updateUserInput') updateUserInput: UpdateUserInput) {
    return this.usersService.update(updateUserInput.id, updateUserInput);
  }

  @Mutation(() => User)
  removeUser(@Args('id', { type: () => Int }) id: number) {
    return this.usersService.remove(id);
  }
}
```
