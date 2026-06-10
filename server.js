const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { htmlToText } = require("html-to-text");

async function fetchUrl(url, timeout = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,*/*",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
            }
        });
        if (!res.ok) {
            return { error: `HTTP ${res.status} ${res.statusText}` };
        }
        const contentType = res.headers.get("content-type") || "";
        const html = await res.text();
        const text = htmlToText(html, {
            wordwrap: false,
            selectors: [
                { selector: "a", options: { ignoreHref: true } },
                { selector: "img", format: "skip" },
                { selector: "script", format: "skip" },
                { selector: "style", format: "skip" },
                { selector: "nav", format: "skip" },
                { selector: "footer", format: "skip" },
                { selector: "header", format: "skip" }
            ],
            limits: { maxChildNodes: 256 }
        });
        // 截断到 25000 字符，避免超出上下文
        const truncated = text.length > 25000 ? text.slice(0, 25000) + "\n\n[内容已截断]" : text;
        return { content: truncated, contentType };
    } catch (e) {
        return { error: e.message };
    } finally {
        clearTimeout(timer);
    }
}

const server = new McpServer({ name: "web-reader", version: "1.0.0" });

server.tool(
    "read_url",
    "Fetch a URL and convert the page content to readable text",
    {
        url: z.string().describe("The URL to fetch"),
        timeout: z.number().optional().describe("Request timeout in milliseconds (default 20000)")
    },
    async ({ url, timeout }) => {
        const result = await fetchUrl(url, timeout);
        if (result.error) {
            return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
        }
        return { content: [{ type: "text", text: result.content }] };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
