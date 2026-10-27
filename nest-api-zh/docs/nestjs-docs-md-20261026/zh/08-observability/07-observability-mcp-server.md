# MCP server

Source: https://docs.nestjs.com/observability/mcp-server

NestJS 观察暴露了 [MCP](https://modelcontextprotocol.io/) 服务器，等等 MCP-兼容客户端（Claude 代码、Claude 桌面、光标、VS 代码，或您自己编写的代理）可以直接查询您的项目，而不是您将仪表板数据复制到提示中。回归、慢速操作、错误组、跟踪、作业和警报都是可用的：仪表板显示的数据相同，范围精确到您可以看到的内容。

这个 MCP 服务器包含在每个付费计划（Pro 及以上）中。它遵循为每个项目付费的计划：被邀请加入付费团队项目的免费帐户成员可以在这些项目中使用它。

> info **Hint** MCP 是向代理获取遥测信息的两种方法之一。**复制代理提示**按钮（参见 [Dashboard](/observability/dashboard#handing-a-failure-to-a-coding-agent)) 将一个页面打包为单个粘贴的文本。MCP 适用于需要不断提问的代理（跟踪，检查错误是否仍在触发），而无需您转发每个答案。

端点在 `POST https://<api-host>/mcp` 处调用可流式 HTTP。它是无状态的：没有要打开的会话，没有要保持的东西，除了请求本身之外没有设置。确切的主机显示在仪表板中您的令牌旁边。

#### 获取令牌

个人的 MCP 令牌在仪表板中铸造**下的代币 MCP 代币**。

- 单击**创建令牌**，给它命名，并可选地设置到期日。没有过期的令牌永远不会过期，因为 MCP 客户端没有刷新流。
- 秘密（`omcp_...`) 在创建它的响应中显示**一次**。立即复制；只存储它的散列，因此不能再次检索它。如果您丢失了它，请撤销代币并铸造另一个。
- 令牌充当**创建它们的用户**，拥有它们确切的项目权限。没有作用域：如果您可以在仪表板中看到它，令牌可以读取它 MCP 如果你不能，令牌也不能。

从同一页面撤销令牌会立即将其切断。令牌管理本身故意仅适用于仪表板：MCP 令牌不能铸造或撤销 MCP 令牌，所以泄露的凭据不能延长自己的寿命。

#### 连接客户端

任何会说话的客户端 HTTP 可以连接一个 URL 和一个头，没有 OAuth 流。客户端的区别仅在于配置文件的位置和它的键的名称。

**克劳德密码**

```bash
$ claude mcp add observe --transport http https://<api-host>/mcp --header "Authorization: Bearer <token>"
```

**Claude 桌面等 `mcpServers` 客户**

```json
{
  "mcpServers": {
    "observe": {
      "url": "https://<api-host>/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

**光标**使用相同的 `mcpServers` 形状 `~/.cursor/mcp.json`（每个项目）或 `.cursor/mcp.json`（一个项目），并扩展 `${env:...}` 内部 `url` 和 `headers`，这是如何将令牌排除在可能提交的文件之外：

```json
{
  "mcpServers": {
    "observe": {
      "url": "https://<api-host>/mcp",
      "headers": { "Authorization": "Bearer ${env:OBSERVE_MCP_TOKEN}" }
    }
  }
}
```

**VS 代码（副驾驶代理模式）** 使用 `servers` 而不是 `mcpServers`，想要一个明确的 `type`，并且可以提示一次令牌并将其加密存储。在 `.vscode/mcp.json` 对于一个工作区或您的用户 `mcp.json` 对于他们所有人：

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "observe-token",
      "description": "NestJS Observe MCP token",
      "password": true
    }
  ],
  "servers": {
    "observe": {
      "type": "http",
      "url": "https://<api-host>/mcp",
      "headers": { "Authorization": "Bearer ${input:observe-token}" }
    }
  }
}
```

**您自己的代理。**对于官方 TypeScriptSDK，端点是 `StreamableHTTPClientTransport`，令牌进入 `requestInit.headers`：

```typescript
const client = new Client({ name: 'my-agent', version: '1.0.0' });

await client.connect(
  new StreamableHTTPClientTransport(new URL('https://<api-host>/mcp'), {
    requestInit: {
      headers: { Authorization: `Bearer ${process.env.OBSERVE_MCP_TOKEN}` },
    },
  }),
);

const { tools } = await client.listTools();
```

在调试客户端配置之前，请确认端点和令牌有效。此命令列出服务器宣传的工具：

```bash
$ curl -s https://<api-host>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

如果您得到一个工具列表，凭据是有效的，任何仍然损坏的东西都是客户端的。**401**表示令牌丢失、过期或被撤销，或者标题格式错误。**405**表示客户端发送了 `GET` 或 `DELETE`；对此端点的每个 MCP 请求必须是一个 `POST`。

#### 实例调查

这些工具是围绕调查而不是终点设计的，因此每个答案都包含了下一个问题所需的关键。假设部署出来了，似乎出了问题：

1. **“上次部署后出现了什么倒退？”** -`find_regressions` 比较每个发布边界两侧的错误率和延迟（您的 `serviceVersion` 值）并命名使事情变得更糟的版本，以及它降级的操作。
2. **“向我展示该操作。”** - `get_operation_details` 返回路由的延迟和错误摘要以及最近的单个请求，每个请求都带有 `traceId`。
3. “那个请求到底做了什么？”`get_trace` 将跟踪 id 解析为瀑布：它下面的每个执行，跨服务，使用生成树。
4. **“事情发生时代码是怎么说的？”** -`get_trace_logs` 按顺序返回在相同跟踪 id 下发出的每条日志行。

错误和后台作业遵循相同的形状：`list_error_groups`→`get_error_details`→`get_trace`，以及 `list_jobs`→`get_job_details`→`get_trace`。在每种情况下，都从 `list_projects` 开始，因为几乎每个诊断工具都需要 `projectId`。

#### 可用工具

几乎每个工具都是只读的；写的人列在下面 [Setting up a service](/observability/mcp-server#setting-up-a-service) 大多数诊断工具都有一个范围：一个必需的 `projectId`，可选 `applicationId` 缩小到一项服务，以及一项可选服务 `timeInterval` 后视窗（`1h`, `3h`, `12h`, `1d`, `3d`, `7d`, `30d`），默认为 `1d`.

| 工具 | 它回答什么 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_projects` | 您参与的每个项目，包括团队和应用程序。从这里开始解析项目 id。 |
| `get_project` | 每个 id 一个项目，包括您的访问级别和订阅状态。 |
| `search` | 对您的项目、应用程序、警报规则、SLO 和问题进行全文搜索。 |
| `find_regressions` | 让事情变得更糟的版本：每个版本边界之前和之后的错误率和延迟，每个版本的具体操作都降级了。 |
| `list_slow_operations` | 最慢的 HTTP 窗口中的操作，按 p95 排序，旁边还有音量，因此要把精力放在慢速和热的部分。 |
| `get_operation_details` | 一条路径：延迟和错误摘要加上最近的单个请求，每个请求都有持续时间、状态和 `traceId`. |
| `get_trace` | 一个 `traceId` 解决了在它下面运行的每个执行——跨服务、请求和作业——每个执行都有自己的生成树。 |
| `get_trace_logs` | 在 a 下发出的每条日志行 `traceId`，按顺序。 |
| `list_error_groups` | 按指纹分组的错误，按出现次数排序，带有类、示例消息和堆栈跟踪，第一次/最后一次出现，以及介绍版本。 |
| `get_error_details` | 最近出现的一个错误类：每次出现的消息、状态、用户和 `traceId`，外加摘要。 |
| `get_error_trend` | 误差是在窗口上增长还是衰减，已经被归类为一个方向。 |
| `get_affected_users` | 一个错误类的爆炸半径：哪些最终用户击中它以及多久击中一次。 |
| `list_jobs` | 窗口中的后台作业性能，按作业名称和队列：卷、持续时间和故障计数。 |
| `get_job_details` | 一个队列上的一个作业名称：持续时间和等待时间摘要以及最近的单独执行，每个作业名称都有状态和 `traceId`. |
| `list_issues`,`get_issue` | 您的项目中的问题，以及其评论和活动中的一个问题。 |
| `list_slos` | 具有当前状态和错误预算消耗的项目 SLO。 |
| `list_alert_rules`,`list_alert_events` | 您可以看到的每个项目的警报规则及其触发历史记录。 |

除了设置服务和解决问题之外，不能通过以下方式创建或更改任何内容 MCP，包括警报规则和错误组状态。那些留在仪表板上。工具结果还省略了仪表板端点返回的时间分段图表系列，因为数百个分段值花费了上下文，并且比从它们派生的摘要要少。

#### 设置服务

这些是写作的工具。每个都通过与匹配的仪表板按钮相同的服务，因此您在项目中的角色和您的计划的限制完全相同，拒绝将作为工具的答案返回。不能在 MCP 上删除、重命名或撤销任何内容。

| 工具 | 它的作用 |
| -------------------- | ------------ |
| `list_applications` | 一个项目的应用。在创建副本之前检查它。 |
| `create_project` | 在现有团队（传递其 id）或以该项目命名的新团队中创建一个项目。 |
| `create_application` | 在项目中注册一个 NestJS 服务。该名称不能在 MCP 上更改，并且应该与您在 SDK 中给出的 `serviceId` 匹配。 |
| `create_api_key` | 发出密钥对 SDK 身份验证。秘密返回一次；一个行为良好的客户端会将它写入你的 git 忽略的环境文件，并且不会重复它。 |
| `resolve_issue` | 标记修复发送后已解决的问题，修复发送会根据事件发生前的基线开始验证。 |

使用这些工具，代理可以在一个请求中将存储库从“未装备”变为“报告”：*“为此服务设置 NestJS 观察”*变为 `list_projects`→`create_application`→`create_api_key`，然后是安装和来自 [SDK 指南](/observability/sdk) 的三次代码编辑。
