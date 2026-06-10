const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { htmlToText } = require("html-to-text");

// 从 HTML 中提取 <title>
function extractTitle(html) {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

// 尝试提取 <article> 或 <main> 等主体内容，减少噪音
function extractMainContent(html) {
    // 优先提取 article / main / role=main
    const patterns = [
        /<article[\s>][\s\S]*?<\/article>/gi,
        /<main[\s>][\s\S]*?<\/main>/gi,
        /<div[^>]*role\s*=\s*["']main["'][^>]*>[\s\S]*?<\/div>/gi,
        /<div[^>]*class\s*=\s*["'][^"']*content[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    ];
    for (const pat of patterns) {
        const m = html.match(pat);
        if (m && m[0].length > 200) {
            return m[0];
        }
    }
    return html;
}

// 移除明显的噪音块
function removeNoise(html) {
    return html
        // 移除 script/style/noscript
        .replace(/<script[\s>][\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s>][\s\S]*?<\/style>/gi, "")
        .replace(/<noscript[\s>][\s\S]*?<\/noscript>/gi, "")
        // 移除 nav/header/footer/aside/iframe
        .replace(/<nav[\s>][\s\S]*?<\/nav>/gi, "")
        .replace(/<header[\s>][\s\S]*?<\/header>/gi, "")
        .replace(/<footer[\s>][\s\S]*?<\/footer>/gi, "")
        .replace(/<aside[\s>][\s\S]*?<\/aside>/gi, "")
        .replace(/<iframe[\s>][\s\S]*?<\/iframe>/gi, "")
        // 移除表单
        .replace(/<form[\s>][\s\S]*?<\/form>/gi, "")
        // 移除常见广告/推荐 class
        .replace(/<div[^>]*class\s*=\s*["'][^"']*(?:ad-|advert|recommend|related|sidebar|comment|social|share|widget|popup|modal|banner)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
}

async function fetchUrl(url, timeout = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml,*/*",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
            },
            redirect: "follow"
        });
        if (!res.ok) {
            return { error: `HTTP ${res.status} ${res.statusText}` };
        }

        const contentType = res.headers.get("content-type") || "";

        // 非 HTML 直接返回提示
        if (contentType.includes("application/pdf")) {
            return { error: "URL is a PDF, not supported. Try converting to text first." };
        }
        if (contentType.startsWith("image/")) {
            return { error: `URL is an image (${contentType}), not a web page.` };
        }
        if (contentType.includes("application/json")) {
            const json = await res.text();
            return { content: json.slice(0, 25000), contentType };
        }

        const html = await res.text();

        // 提取标题
        const title = extractTitle(html);

        // 去噪 + 提取主体
        const cleaned = removeNoise(html);
        const mainContent = extractMainContent(cleaned);

        // 转文本
        const text = htmlToText(mainContent, {
            wordwrap: false,
            selectors: [
                { selector: "a", options: { ignoreHref: true } },
                { selector: "img", format: "skip" },
                { selector: "table", options: { uppercaseHeaderCells: false } }
            ],
            limits: { maxChildNodes: 512 }
        });

        // 清理多余空行
        const trimmed = text.replace(/\n{3,}/g, "\n\n").trim();

        // 组装结果
        let result = "";
        if (title) result += `# ${title}\n\n`;
        result += `URL: ${url}\n\n`;
        result += trimmed;

        // 截断
        if (result.length > 25000) {
            result = result.slice(0, 25000) + "\n\n[内容已截断，共 " + trimmed.length + " 字符]";
        }

        return { content: result, contentType };
    } catch (e) {
        if (e.name === "AbortError") {
            return { error: `Request timed out after ${timeout}ms` };
        }
        return { error: e.message };
    } finally {
        clearTimeout(timer);
    }
}

const server = new McpServer({ name: "web-reader", version: "1.1.0" });

server.tool(
    "read_url",
    "Fetch a URL and convert the page content to readable text. Extracts main content, removes ads/navigation/sidebar noise.",
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
