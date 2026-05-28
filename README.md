<div align="center">

<img src="icons/icon-128.png" width="96" height="96" alt="TweetGuard">

# TweetGuard

过滤 X (Twitter) 信息流中垃圾号、营销号、色情 bot 与加密 shill 的 Chrome 扩展。

简体中文 · [English](README.en-US.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-0f172a.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/chrome-extension-0f172a.svg)](#安装)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-0f172a.svg)](manifest.json)
[![无后端](https://img.shields.io/badge/无后端-059669.svg)](#隐私)

</div>

---

## 简介

TweetGuard 是一个 Chrome 扩展，在浏览器端识别并折叠 X (Twitter) 信息流中的垃圾推文。无后端、无遥测，所有状态保存在 `chrome.storage.local`。可选自带 AI API key 提升识别覆盖。

---

## 工作原理

信息流里的每条推文依次经过三层判定：

```
┌─────────────────────────────────────────────────────────────────┐
│  L0 — 内置规则（同步，< 1 ms）                                   │
│  17 个手工调校的信号 + 6 条硬规则 + 集体感染加成。               │
│  约 80% 显性 spam 在此层命中。                                   │
├─────────────────────────────────────────────────────────────────┤
│  Cache — 本地按账号判定缓存                                      │
│  某个 handle 被规则、AI 或用户判定过后，结果缓存在本地，         │
│  同账号的后续推文直接复用判定结果。                              │
├─────────────────────────────────────────────────────────────────┤
│  L_AI — 复审灰区推文（可选）                                     │
│  L0 不确定时，送你配置的 AI（DeepSeek / OpenAI / Anthropic /     │
│  Gemini / Ollama）。AI 同时从样本中归纳新规则，                  │
│  以减少后续同模板的 AI 调用。                                    │
└─────────────────────────────────────────────────────────────────┘
```

被识别的推文以一条细折叠条替代，标注隐藏原因，点击可展开恢复原文。

---

## 功能

- **多层识别**：规则 → 缓存 → AI，按成本从低到高依次评估。
- **自带 AI Key (BYOK)**：支持 DeepSeek、OpenAI、Anthropic、Gemini、Groq、OpenRouter、Ollama（本地）。
- **反馈学习**：在被错隐的推文上点「信任」会自动禁用导致误判的规则；在漏判的 spam 上点旗标可触发规则归纳。
- **跨 handle 模板识别**：多次标记相似文本（如 `她太涩了 t`、`她太涩了 x`）后，系统归纳出 `tweet_keyword: "她太涩了"`，下次同模板不再调用 AI。
- **规则可见**：每条被隐藏的推文显示具体命中的规则，所有规则可查、可改、可禁用。
- **中文场景规则**：内置针对中文 spam 模板的规则（寻固炮、加微、返佣、撸毛、sao 货、pan.quark.cn 等）。
- **CSS 折叠条**：折叠/展开通过 CSS transition；AI 评估期间用脉冲点占位，避免布局抖动。
- **无遥测**：无服务器、无埋点、无远程加载。对外流量仅为用户显式发起的 AI API 调用。

---

## 安装

Chrome Web Store 上架前，通过开发者模式安装：

1. 克隆本仓库：
   ```bash
   git clone https://github.com/viewer12/tweetguard.git
   ```
2. 在 Chrome / Edge / Brave 中打开 `chrome://extensions`。
3. 开启右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择克隆下来的目录。
5. 打开 `x.com` 即生效，默认启用内置规则。

---

## 配置 AI（可选）

仅使用内置规则即可覆盖大部分显性 spam。启用 AI 层后，覆盖率从约 80% 提升到约 95%，主要用于识别内置规则尚未覆盖的新模板。

1. 点击工具栏 TweetGuard 图标 → **设置**。
2. 切换到 **AI 提供商** 标签。
3. 选择 provider，填入 API key，点击 **运行测试**（使用 5 条已知样本验证模型）。

| Provider | 推荐模型 | 每 1000 次评估约费用 |
|---|---|---|
| DeepSeek | `deepseek-v4-flash` | ≈ ¥0.30 |
| OpenAI | `gpt-4o-mini` | ≈ $0.15 |
| Anthropic | `claude-haiku-4-5` | ≈ $1 |
| Gemini | `gemini-2.0-flash` | 免费额度 |
| Groq | `llama-3.1-8b-instant` | — |
| Ollama | `qwen2.5:7b` | $0（本地运行） |

如需推文数据不离开本机，选择 Ollama 本地模式。

---

## 隐私

- 无后端、无遥测，仓库不包含任何服务端代码。
- 所有状态保存在 `chrome.storage.local`：配置、缓存、学习规则、反馈历史均仅保存在本机。
- 对外流量仅为用户主动发起的 AI API 调用，由本地直连用户选择的 provider，TweetGuard 不参与中转。
- 支持 Ollama 本地模式，推文数据可不离开本机。
- 不基于 username 判定 spam。`@handle` 在结构上不可靠（亚洲用户大量使用「罗马名 + 数字」格式）。内置规则仅基于显示名关键词模板与推文内容；AI 学习仅基于推文文本。

完整数据流设计见 [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md)。

---

## 文档

设计与工程文档见 [`docs/`](docs/)：

| 文档 | 内容 |
|---|---|
| [PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) | 市场调研、竞品分析、产品定位 |
| [DETECTION_LOGIC.md](docs/DETECTION_LOGIC.md) | 17 个信号如何给推文打分；含逐步推演 |
| [DEFAULT_RULES.md](docs/DEFAULT_RULES.md) | 默认规则集 —— 关键词、正则、权重、阈值 |
| [PERFORMANCE_UX.md](docs/PERFORMANCE_UX.md) | FOUC 防治、MutationObserver 设计、渲染时序 |
| [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | BYOK 架构、Prompt 工程、缓存策略、成本模型 |
| [LONG_TERM_DEFENSE.md](docs/LONG_TERM_DEFENSE.md) | 多层防御的设计动机 |

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
└── icons/                     图标资源（SVG 主源 + 16/32/48/128 PNG 切图）
```

无构建步骤。修改代码后在 `chrome://extensions` 刷新扩展并刷新 `x.com` 即可生效。

---

## 贡献

欢迎 PR。可参与方向：

- 中文 spam 模板（`src/inject.js` 的 `RX` 区块）
- 多语种 spam 规则（西班牙语 / 印尼语 / 韩语等）
- Provider 适配（Anthropic 批量 API、OpenRouter 路由等）
- UI / 视觉细节（`options/options.css` 或 `src/styles.css`）
- 测试 fixture：真实 spam 的 DOM 快照，用于回归测试

提交 PR 前请：

1. 在真实 `x.com` 上至少进行 30 分钟滚动测试。
2. 确认不会基于弱信号自动屏蔽合法账号。
3. 运行 `node -c src/*.js` 确认无语法错误。

---

## 路线图

- [ ] Chrome Web Store 上架
- [ ] Firefox 移植（Firefox 已稳定支持 Manifest V3）
- [ ] 浏览器内分类器（`transformers.js`，无需 AI key）
- [ ] 完整英文 UI（当前以中文为主）
- [ ] 规则集订阅机制（类似 uBlock Origin）
- [ ] 缓存导出/导入

---

## 许可证

MIT — 见 [LICENSE](LICENSE)。
