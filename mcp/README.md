# PoseWear MCP

Agent 可以从图库中选人物、姿势、服装与环境，取得指定视角的图片直链，再把它们组合成一段可转发的生图提示词。

## 接入

在仓库根目录执行：

```sh
npm ci
codex mcp add posewear -- node "$PWD/mcp/server.mjs"
```

新启的 Codex 会话可以发现这四个工具。项目中的 [PoseWear skill](../.agents/skills/posewear/SKILL.md) 提供选图工作流。

其他支持 stdio 的 MCP 客户端可以使用以下配置。将路径替换为实际仓库的绝对路径：

```json
{
  "mcpServers": {
    "posewear": {
      "command": "node",
      "args": ["/absolute/path/to/posewear/mcp/server.mjs"]
    }
  }
}
```

默认使用 PoseWear 已发布的公开目录，安装后可直接启用。本地开发时，在客户端环境中设置 `POSEWEAR_CATALOG_URL=http://127.0.0.1:8787/` 即可读取 `npm start` 的预览，也可填写自托管站点。分享的图片地址使用该站声明的 canonical URL 与素材域名；自托管时应正确设置构建参数 `POSEWEAR_SITE` 和 `POSEWEAR_ASSET_HOST`。目录在进程内缓存，重启 MCP 服务即可重新读取发布版本。默认隐藏标为成人向的素材；部署者可主动设置 `POSEWEAR_ALLOW_ADULT=1` 以包含这些条目。

## 从搜索到参考图

| 工具 | 用法 |
| --- | --- |
| `posewear_list_collections` | 返回十二个库的 ID、中英日名称和可见条数。 |
| `posewear_search_references` | 按库、关键词检索。返回条目 ID、可用角度数及分页位置 `nextOffset`。 |
| `posewear_get_reference` | 按库、条目 ID 和角度返回直链、提示词和图库详情页。 |
| `posewear_compose_brief` | 按传入顺序生成提示词与参考图清单，`prompt` 可指定自己的文案。 |

例如，先查找 `collection="pose"` 下的站姿并获取所有角度，再将其中一个角度与选好的服装一起传给 `posewear_compose_brief`：

```json
{
  "references": [
    {"collection":"pose","id":"full_single_P001","angle":1},
    {"collection":"costume","id":"SPR-0001"}
  ],
  "language":"zh",
  "prompt":"按第一张图的姿势与机位，穿第二张图的服装。"
}
```

取 `brief` 即可转发。具有生图能力的 Agent 可将 `references[].url` 依次传入模型的参考图输入。MCP 工具只读取目录并返回链接，个人密钥、上传照片和生成记录保留在浏览器；CharaDB 素材继续使用原站热链。
