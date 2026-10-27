# Security

Source: https://docs.nestjs.com/openapi/security

若要定义特定操作使用哪些安全机制，请应用 `@ApiSecurity()` 装饰师：

```typescript
@ApiSecurity('basic')
@Controller('cats')
export class CatsController {}
```

在运行应用程序之前，请使用 `DocumentBuilder` 将安全性定义添加到基础文档中：

```typescript
const options = new DocumentBuilder().addSecurity('basic', {
  type: 'http',
  scheme: 'basic',
});
```

最流行的认证技术（例如，`basic` 和 `bearer`) 是内置的，因此您不必如上所示手动定义它们的安全机制。

#### 基本认证

要启用基本身份验证，请使用 `@ApiBasicAuth()`：

```typescript
@ApiBasicAuth()
@Controller('cats')
export class CatsController {}
```

在运行应用程序之前，请使用 `DocumentBuilder` 将安全性定义添加到基础文档中：

```typescript
const options = new DocumentBuilder().addBasicAuth();
```

#### 承载认证

要启用承载验证，请使用 `@ApiBearerAuth()`：

```typescript
@ApiBearerAuth()
@Controller('cats')
export class CatsController {}
```

在运行应用程序之前，请使用 `DocumentBuilder` 将安全性定义添加到基础文档中：

```typescript
const options = new DocumentBuilder().addBearerAuth();
```

#### OAuth2 身份验证

要启用 OAuth2，请使用 `@ApiOAuth2()`：

```typescript
@ApiOAuth2(['pets:write'])
@Controller('cats')
export class CatsController {}
```

在运行应用程序之前，请使用 `DocumentBuilder` 将安全性定义添加到基础文档中：

```typescript
const options = new DocumentBuilder().addOAuth2();
```

#### Cookie 认证

要启用 cookie 身份验证，请使用 `@ApiCookieAuth()`：

```typescript
@ApiCookieAuth()
@Controller('cats')
export class CatsController {}
```

在运行应用程序之前，请使用 `DocumentBuilder` 将安全性定义添加到基础文档中：

```typescript
const options = new DocumentBuilder().addCookieAuth('optional-session-id');
```
