# Extensions

Source: https://docs.nestjs.com/graphql/extensions

> warning **Warning** 本章仅适用于代码优先的方法。

扩展是一个**高级的低级特性**，允许您在类型配置中定义任意数据。将自定义元数据附加到某些字段允许您构建更复杂、更通用的解决方案。例如，使用扩展，您可以定义访问特定字段所需的角色。您的代码可以在运行时读取这些角色，以确定调用者是否具有检索特定字段的足够权限。

#### 添加自定义元数据

若要将自定义元数据附加到字段，请使用 `@Extensions()` 从 `@nestjs/graphql` 包装：

```typescript
@Field()
@Extensions({ role: Role.ADMIN })
password: string;
```

在上面的示例中，我们指定了值 `Role.ADMIN` 到 `role` 元数据属性。`Role` 是一个 TypeScript 枚举对系统中所有可用的用户角色进行分组。

除了字段之外，还可以使用 `@Extensions()` 类级别和方法级别的装饰器（例如，在查询处理程序上）。

#### 使用自定义元数据

使用自定义元数据的逻辑可以根据需要复杂。例如，可以创建一个拦截器来存储或记录每次方法调用的事件，或者创建一个 [现场中间件](/graphql/field-middleware) 这匹配了根据调用者的权限检索字段所需的角色（字段级权限系统）。

为了说明的目的，让我们定义一个 `checkRoleMiddleware` 将用户角色（此处硬编码）与访问目标字段所需的角色进行比较：

```typescript
export const checkRoleMiddleware: FieldMiddleware = async (
  ctx: MiddlewareContext,
  next: NextFn,
) => {
  const info = ctx.info!;
  const { extensions } = info.parentType.getFields()[info.fieldName];

  /**
   * In a real-world application, the "userRole" variable
   * should represent the caller's (user) role (e.g., read from "ctx.context").
   */
  const userRole = Role.USER;
  if (userRole !== extensions.role) {
    // or "return null" to hide the value instead
    throw new ForbiddenException(
      `User does not have sufficient permissions to access "${info.fieldName}" field.`,
    );
  }
  return next();
};
```

完成此操作后，注册中间件 `password` 字段：

```typescript
@Field({ middleware: [checkRoleMiddleware] })
@Extensions({ role: Role.ADMIN })
password: string;
```
