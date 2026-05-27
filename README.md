<div align="center">

# TweetGuard

**优雅地过滤 X (Twitter) 信息流中的垃圾号、营销号、色情 bot 和加密 shill。**

简体中文 · [English](README.en-US.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-0f172a.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/chrome-extension-0f172a.svg)](#安装)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-0f172a.svg)](manifest.json)
[![无后端](https://img.shields.io/badge/无后端-059669.svg)](#隐私)

</div>

---

## 这是什么

X 上的垃圾号问题已经失控。**X 自己承认 80% 加密币活动来自 bot**；"check my bio"、"寻固炮 / 点击主页" 这种引流模板和 1000x 代币吹嘘充斥所有热推回复区。X 官方治理屡屡失准——把合法用户的回复折叠为"疑似 spam"，真正的 bot 反而漏网。

TweetGuard 是一个 Chrome 扩展，把这些垃圾**在你浏览器端过滤掉**。零后端、零遥测、零数据外传，除非你主动配置自己的 AI API key。

简单说：你自己花两周也能做出来的那种过滤器，现在直接给你。

---

## 工作原理（30 秒讲清）

```
信息流里每条推文都会流经三层：

┌─────────────────────────────────────────────────────────────────┐
│  L0 — 内置规则（同步，< 1 ms）                                   │
│  17 个手工调校的信号 + 6 条硬规则 + 集体感染加成。               │
│  约 80% 的显性 spam 在这一层就被秒杀。                           │
├─────────────────────────────────────────────────────────────────┤
│  Cache — 本地按账号判定缓存                                      │
│  某个 handle 被判定过（规则 / AI / 你），结果就缓存在本地。      │
│  同账号的后续推文微秒级决策，不重复评估。                        │
├─────────────────────────────────────────────────────────────────┤
│  L_AI — 你的 AI，只复审灰区推文                                  │
│  L0 不确定时，送你配置的 AI（DeepSeek / OpenAI / Anthropic /     │
│  Gemini / Ollama）。AI 还会从看到的 spam 中蒸馏可复用规则，      │
│  让未来同模板的 spam 不需要再调 AI。                             │
└─────────────────────────────────────────────────────────────────┘
```

被识别的推文不是直接消失——而是**平滑收起成一条细折叠条**，注明被隐藏的理由。一键展开恢复原文。布局永不跳动。

---

## 功能特性

- **多层联防**：规则 → 缓存 → AI，从快到慢。绝大多数推文走不到 AI 那一层。
- **自带 AI Key**：支持 DeepSeek、OpenAI、Anthropic、Gemini、Groq、OpenRouter、Ollama（全本地）。你的 key，你的数据流向。
- **从反馈中自学**：在被错隐的推文上点「信任」→ 导致误判的规则自动禁用。在漏判的 spam 上点小旗 → 如果之前见过类似模板，自动归纳新规则，不调 AI。
- **跨 handle 模板识别**：你之前标过 "她太涩了 t"，现在又标 "她太涩了 x"，系统自动归纳 `tweet_keyword: "她太涩了"`，下次同模板秒杀。
- **完全透明**：每条被隐藏的推文展开后会显示具体命中的规则。所有规则可查可改可禁。
- **中文场景优先**：内置针对中文 spam 模板的专门规则（寻固炮 / 加微 / 返佣 / 撸毛 / sao 货 / pan.quark.cn 等），是英文优先的过滤工具完全覆盖不到的。
- **零布局抖动**：折叠条收起用 CSS transition；AI 评估中显示克制的脉冲点，而不是"先显示再删除"。
- **零遥测**：没有服务器，没有埋点，没有远程加载。**唯一**的对外流量是你显式发起的 AI API 调用。

---

## 安装

Chrome Web Store 上架前，开发者模式安装：

1. 下载或克隆本仓库：
   ```bash
   git clone https://github.com/<你的用户名>/tweetguard.git
   ```
2. Chrome / Edge / Brave 打开 `chrome://extensions`。
3. 右上角开启 **开发者模式**。
4. 点 **加载已解压的扩展程序**，选择克隆下来的文件夹。
5. 打开 `x.com`，TweetGuard 已经开始工作（内置规则默认启用）。

> 想要工具栏图标？把 `icons/icon.svg` 转成 16/48/128 px 三种 PNG，在 `manifest.json` 里加上 `"icons"` 字段。不加也能正常运行。

---

## 配置 AI（可选但强烈推荐）

只用内置规则也能盖住大部分显性 spam。加上 AI 层后，覆盖率从 ~80% 提升到 ~95%——能抓到内置规则还没覆盖到的新模板。

1. 点工具栏 TweetGuard 图标 → **设置**。
2. 切到 **AI 提供商** tab。
3. 选 provider，粘贴 API key，点 **运行测试**（用 5 条已知样本验证你的模型能正确判定）。

| Provider | 推荐模型 | 每 1000 次 spam 评估约费用 |
|---|---|---|
| **DeepSeek** | `deepseek-v4-flash` | ≈ ¥0.30（最便宜 + 中文最佳） |
| OpenAI | `gpt-4o-mini` | ≈ $0.15 |
| Anthropic | `claude-haiku-4-5` | ≈ $1 |
| Gemini | `gemini-2.0-flash` | 免费层够日常用 |
| Groq | `llama-3.1-8b-instant` | 极快 |
| **Ollama** | `qwen2.5:7b` | $0（完全跑在你本地） |

需要绝对隐私？选 **Ollama** 本地模式——推文永远不离开你的设备。

---

## 隐私

TweetGuard 给你的硬承诺：

- **没有后端，没有遥测**。仓库里零行服务端代码。我们字面上看不到你屏蔽了什么。
- **所有状态都在 `chrome.storage.local`**——你的配置、缓存、学习规则、反馈历史，全部只存在你本机。
- **唯一对外流量**：你主动发起的 AI API 调用，从**你的机器**直接到**你选择**的 provider。TweetGuard 不中转、不镜像、不记录。
- **完整支持 Ollama 本地**：不希望任何数据出本机的用户，选这个即可。
- **不基于 username 屏蔽**：handle（`@xxx`）作为 spam 信号在结构上不可靠——亚洲用户大量使用"罗马名+数字"格式（短 handle 被抢光了）。TweetGuard 明确**不通过 username 模式**判定 spam。内置规则只看显示名关键词模板和推文内容；AI 学习被限制为只能基于推文文本。

完整数据流设计见 [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md)。

---

## 文档

详细的设计与工程笔记在 [`docs/`](docs/)：

| 文档 | 主要内容 |
|---|---|
| [PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) | 市场调研、竞品分析、产品定位 |
| [DETECTION_LOGIC.md](docs/DETECTION_LOGIC.md) | 17 个信号如何给推文打分；含逐步推演 |
| [DEFAULT_RULES.md](docs/DEFAULT_RULES.md) | 可直接 ship 的默认规则集 —— 关键词、正则、权重、阈值 |
| [PERFORMANCE_UX.md](docs/PERFORMANCE_UX.md) | FOUC 防治、MutationObserver 设计、浏览器渲染时序 |
| [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | BYOK 架构、Prompt 工程、缓存策略、成本模型 |
| [LONG_TERM_DEFENSE.md](docs/LONG_TERM_DEFENSE.md) | 为什么纯规则不够 —— 多层防御论 |

---

## 项目结构

```
TweetGuard/
├── manifest.json              Chrome MV3 manifest，仅 `storage` 权限
├── src/
│   ├── content.js             隔离环境桥接
│   ├── inject.js              页面 context 主体：DOM 观察、L0 规则、
│   │                          actuator、AI 客户端、反馈处理
│   ├── background.js          service worker：AI fetch 代理
│   ├── defaults.js            默认配置、provider 目录、prompts
│   └── styles.css             注入页面的 CSS（折叠条、码掉、pending 三态）
├── popup/                     工具栏弹窗（快速开关 + 统计）
├── options/                   完整设置页（7 个 tab）
├── docs/                      设计文档
└── icons/                     源 SVG 图标
```

无构建步骤、无转译。改完代码 → `chrome://extensions` 刷新扩展 → 刷新 `x.com` 即可。

---

## 贡献

欢迎 PR，特别欢迎：

- **新的中文 spam 模板**（`src/inject.js` 的 `RX` 区块里的内置规则）
- **多语种 spam 规则**（西班牙语 / 印尼语 / 韩语等）
- **Provider 适配**（Anthropic 批量 API、OpenRouter 路由技巧等）
- **UI / 视觉细节**（`options/options.css` 或 `src/styles.css` 里的任何打磨）
- **测试 fixture**——真实 spam 的 DOM 快照，保存为 HTML fixture 用于回归测试

提 PR 前请：

1. 在真实 `x.com` 上至少滚动 30 分钟测试你的改动
2. 确认不会触发误伤（不要基于弱信号自动屏蔽合法账号）
3. 跑一遍 `node -c src/*.js` 确认没有语法错误

---

## 路线图

- [ ] Chrome Web Store 上架
- [ ] Firefox 移植（Firefox 已稳定支持 Manifest V3）
- [ ] 浏览器内分类器（`transformers.js`，无需 AI key）
- [ ] 完整英文 UI（当前以中文为主）
- [ ] 规则集订阅机制（类似 uBlock Origin）
- [ ] 缓存导出/导入（P2P 共享精选黑名单）

---

## 许可证

MIT —— 见 [LICENSE](LICENSE)。

---

<div align="center">
<sub>献给所有受够了"check my bio"和"寻固炮"占据每条热推评论区的人。</sub>
</div>
