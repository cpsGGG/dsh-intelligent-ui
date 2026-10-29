# 图片检索与 DSH 宿主契约

核查日期：2026-10-26。目标版本为本机 DeepSeek Harness 0.2.1-rc.2。

## 已实现

- `plugin/host.mjs`：导出 `name = 'dsh-intelligent-ui'`、`inject = ['systemPrompt', 'tools']`。通过 `import answerStyle from './answer-style.md'` 获取提示词，构建时须用 esbuild `.md: text` loader。注册独立 `dsh-intelligent-ui:answer-style` section，`order: 10150`、`interpolate: false`。
- `plugin/image-search.mjs`：创建 `intelligent_ui_image_search` 工具。只读取 Wikimedia Commons 的 JSON 元数据，不请求或下载图片字节；结果包含缩略图 URL、真实文件来源页面、标题、可用的作者与许可。
- `tests/image-search.test.mjs`：8 项测试覆盖参数和来源校验、原始资料的纯文本处理、单次 JSON 请求、失败降级、带/不带 Content-Length 的 1 MB 限制、超时、调用方取消、串行检索与不可信资料标记。

## 模型调用与渲染约定

工具名：`intelligent_ui_image_search`

输入 JSON Schema（只使用本机 DSH 支持的 Schema 子集，长度另外在执行器中校验）：

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["query"],
  "properties": {
    "query": { "type": "string", "description": "1–180 个字符的公开主题；具体的英文名称通常更适合 Commons 检索" },
    "count": { "type": "integer", "enum": [1, 2, 3, 4], "description": "默认 3" }
  }
}
```

返回值：

```ts
{
  status: 'ok' | 'empty' | 'error';
  provider: string; // Wikimedia Commons
  query: string;
  message: string;
  images: Array<{
    url: string;       // API 实际返回的 HTTPS 缩略图
    sourceUrl: string; // Commons File: 页面
    title: string;
    caption: string;
    author: string;    // 原资料缺失时为空字符串
    license: string;   // 原资料缺失时为空字符串
  }>;
  gallery: { title: string; images: 同上 };
}
```

只有 `status === 'ok'` 且图片与问题相关时，才可把 `gallery` 对象写入 `iui-gallery` 围栏。保留每张图片的源页面和可用署名。检索失败、超时或无匹配时，`images` 和 `gallery.images` 都为空，不回退到猜测地址或占位图片。没有宣称已检查图像内容或已独立核验许可；作者、标题和许可属于返回的来源声明。

## 请求边界

- 固定 GET 端点：`https://commons.wikimedia.org/w/api.php`。搜索参数使用 `URLSearchParams`，不能把 query 变成端点或额外参数。
- 单次请求 1–4 个文件搜索结果；`generator=search`、`gsrnamespace=6`、`prop=imageinfo`、`iiprop=url|mime|thumbmime|extmetadata`、`iiurlwidth=900`、`maxlag=5`。
- `extmetadata` 限定 ImageDescription、Artist、LicenseShortName，避免读取不必要的大量元数据。
- 工具请求按顺序执行；网络请求默认 12 秒超时，DSH 工具预算 20 秒；调用方取消和插件停用会中止请求。
- 响应最多读取 1,000,000 字节；超过限制立即取消。只接受 JSON，不跟随重定向，不输出任意服务器错误体或网络异常细节。
- 缩略图只允许 HTTPS 的 `upload.wikimedia.org` 或 `thumb.wikimedia.org`；来源只允许 HTTPS 的 `commons.wikimedia.org/wiki/File:...`。拒绝带用户名、密码和非默认端口的地址。
- 元数据只转成有长度限制的纯文本；工具内容以 JSON 文本呈现，并明确标记外部资料不构成指令。无 HTML 执行。

官方接口说明支持这些参数，也说明 `iiurlwidth` 请求宽度不保证和返回缩略图宽度相同。[Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo)、[Search API](https://www.mediawiki.org/wiki/API:Search)、[API 请求规范](https://www.mediawiki.org/wiki/API:Etiquette)。

## 宿主注册契约

接口依据来自 DSH 0.2.1 的工具和提示词注册实现。以下为公开的行为约定；安装包提取文件和私人验收资料不随仓库分发。

- `ctx.tools.register()` 接收工具定义、超时和执行函数；执行时转发 `exec.signal`。
- 工具参数与结果使用 JSON Schema，执行函数再做有边界的运行时校验。
- 定义必须包含 `output.schema` 和 `output.render`，注册随 Cordis 生命周期清理。
- `systemPrompt.section()` 同样随上下文卸载自动移除。

`output.render` 返回 `[{ type: 'text', text: ... }]`，不返回裸字符串。宿主构建需从 `plugin/host.mjs` 打包，而非继续生成只有提示词的旧 `lib/index.js`。

## 实际网络验证

2026-10-26 使用当前工具执行了一次真实请求，查询 `Mount Fuji landscape`、`count: 2`，在约 1.4 秒内成功返回两张图片的元数据：

1. [Sunrise with Mount Fuji - March 2025.jpg](https://commons.wikimedia.org/wiki/File:Sunrise_with_Mount_Fuji_-_March_2025.jpg)，作者 Romain Guy，来源许可字段为 CC0。
2. [Mount Fuji (from Shin-Fuji Interchange).JPG](https://commons.wikimedia.org/wiki/File:Mount_Fuji_(from_Shin-Fuji_Interchange).JPG)，作者 Alpsdake，来源许可字段为 CC BY-SA 4.0。

API 实际返回的是 `thumb.wikimedia.org` 的 960px 缩略图地址。没有下载两张图的原文件或缩略图；只验证了真实 JSON 检索、字段投影与 URL 校验。图片在 DSH 中的可见渲染及宿主激活仍由主任务进行验收。
