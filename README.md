# web-reader-mcp

本地网页阅读 MCP Server，为 Claude Code 提供 read_url 工具。抓取 URL 并转换为可读文本。

## 功能

- 抓取网页 HTML 并转换为纯文本
- 自动提取 `<article>` / `<main>` 等主体内容
- 去除广告、导航栏、侧边栏、页脚等噪音
- 提取页面标题
- 支持 JSON API 直接返回
- 超时和错误处理

## 部署

### 方式一：Claude Code 插件（推荐）

```bash
/plugin marketplace add wsdone/web-reader-mcp
/plugin install web-reader-mcp
/reload-plugins --force
```

### 方式二：独立部署

```bash
git clone https://github.com/wsdone/web-reader-mcp.git
cd web-reader-mcp
npm install
node server.js
```

### 方式三：项目级 .mcp.json

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "web-reader": {
      "command": "node",
      "args": ["/path/to/web-reader-mcp/server.js"]
    }
  }
}
```

## 依赖

- Node.js >= 18
- @modelcontextprotocol/sdk
- html-to-text
- zod

## License

MIT
