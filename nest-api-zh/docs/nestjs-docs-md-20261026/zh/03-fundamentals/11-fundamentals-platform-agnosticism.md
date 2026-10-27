# Platform agnosticism

Source: https://docs.nestjs.com/fundamentals/platform-agnosticism

Nest 是一个与平台无关的框架。您可以开发**可重用的逻辑部分**，并在不同类型的应用程序中使用它们。例如，大多数组件可以重用，而不会在不同的基础上进行更改 HTTP 服务器框架（例如，Express 和 Fastify），甚至跨不同类型的应用程序（例如，HTTP 服务器、具有不同传输层的微服务和 WebSockets）。

#### 一次构建，到处使用

文档的**概述**部分主要展示了使用 HTTP 服务器框架的编码技术（例如，提供 RESTAPI 或 MVC 风格的服务器端渲染应用程序的应用程序）。然而，所有这些构建块都可以在不同的传输层（[微服务](/microservices/basics) 或 [WebSockets](/websockets/gateways)）之上使用。

Nest 还带有一个专用的 [GraphQL](/graphql/quick-start) 模块。您可以将 GraphQL 用作 API 图层，与 RESTAPI 互换。

此外，[应用上下文](/application-context) 功能允许您构建任何类型的 Node.js 应用在 Nest，包括 cron 作业和 CLI 应用程序。

Nest 旨在成为一个成熟的平台 Node.js 为您的应用程序带来更高级别的模块化和可重用性的应用程序。一次建造，到处使用。
