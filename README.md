<div align="center">

<img src="icons/icon-128.png" width="96" height="96" alt="TweetGuard">

# TweetGuard

过滤 X (Twitter) 信息流中垃圾号、营销号、色情 bot 与加密 shill 的 Chrome 扩展。

简体中文 · [English](README.en-US.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-0f172a.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-安装-4285F4.svg)](https://chromewebstore.google.com/detail/jfjlbcabegghndnlplikppaeimbopfjp?utm_source=item-share-cb)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-0f172a.svg)](manifest.json)
[![无后端](https://img.shields.io/badge/无后端-059669.svg)](#隐私)

</div>

---

## 简介

TweetGuard 在浏览器端识别并静默折叠 X (Twitter) 信息流里的垃圾推文。无后端、无遥测，所有数据保存在 `chrome.storage.local`。内置规则开箱即用；可选启用 AI 复审（**需要你自己提供 API Key**），让系统在浏览时**自动学习并沉淀**新的 spam 模板；还能与 GitHub 社区规则库**双向同步**，大家共建同一套规则。

---

## 工作原理

每条推文按"成本从低到高"依次经过几道关，任意一关定案即停：

```
① 名单保护（最高优先级）
   白名单 / 你关注的人 → 永不隐藏；黑名单 → 强制隐藏。
   任何规则（含社区规则）都不会越过它去隐藏你信任的人。
        │
② 账号缓存
   该账号此前被判定过 → 直接复用结果，零计算、零 AI 调用。
        │
③ 规则命中（命中即隐藏）
   内置硬规则 + AI 学习规则 + GitHub 社区规则
   —— 推文关键词 / 短中文混写 / 固定 emoji 模板。
        │
④ L0 评分（13 项信号累加，过阈值则隐藏 / 模糊）
   显示名维度信号已整体降权（显示名不可靠）。
        │
⑤ AI 复核（灰区，可选）
   本地拿不准时，送你配置的 AI（DeepSeek / OpenAI / Anthropic /
   Gemini / Groq / OpenRouter / Ollama）。AI 判定的同时会
   **自动沉淀规则** —— 下次同模板本地直接命中，不再花 AI。
```

被识别的推文折叠成一条与卡片等宽的细条，标注命中原因与来源（本地规则 / 社区 / AI / 缓存），点击可展开、再点可收起。

---

## 规则的三个来源

| 来源 | 怎么来的 | 在哪看 / 管 |
|---|---|---|
| **内置规则** | 写死在引擎里：**4 条硬规则**（黑名单、pump.fun、显示名中文引流词、加微/TG+回复）+ **13 项评分信号** | 设置 →「规则与权重」（动态展示，与引擎单一数据源对齐）|
| **AI 学习规则** | AI 判 spam 时**自动蒸馏**推文关键词；分类没产出时用复审 prompt 兜底补一次；你手动标记误判时也会复审产出 | 设置 →「AI 学习到的规则」（每条标注来源「自动」/「你反馈」，可禁可删）|
| **GitHub 社区规则** | 从社区仓库同步大家共建的规则；你也能一键贡献自己的 | 设置 →「规则与权重」→「社区规则同步」|

**自我进化**：AI 每识别一条本地规则漏掉的 spam，就把它的推文关键词（文字、短中文混写如 `sao货`、或固定 emoji 模板）沉淀成规则，下次同模板零 AI 命中 —— **越用越省、越用越准**。

---

## 功能

- **名单优先保护**：你关注 / 加白名单的人，任何规则（含社区规则）都不会误隐藏 —— fail-open 底线。
- **三来源规则**：内置 + AI 自学习 + GitHub 社区，统统可见、可禁、可删。
- **AI 自动沉淀**：判定 spam 后自动归纳规则（含 emoji 模板）；分类没产出时复用复审 prompt 兜底补一次。
- **AI 自备 Key（BYOK · Bring Your Own Key）**：插件**不**提供 API Key，需要你自己注册并填入；支持 DeepSeek、OpenAI、Anthropic、Gemini、Groq、OpenRouter、Ollama（本地，可完全离线）。Key 只存本机 storage，请求直连 provider 官方 endpoint。
- **GitHub 社区规则同步**：双向——拉取共享规则 + 一键贡献你的规则；误判的社区规则可在本地否决，且同步不覆盖你的否决。
- **关注列表自动同步**：在你自己的「正在关注」页点一下，自动滚动抓取全部关注账号纳入保护（用 X 自身的加载机制，不逆向接口）。
- **配置备份 / 恢复**：完整导出导入（学习规则、黑白名单、关注列表、反馈历史、自定义关键词、识别账号、偏好），换设备一键迁移；API Key 可选包含。
- **反馈学习**：误隐藏点「信任」自动禁用闯祸规则；漏判点旗标触发规则归纳。
- **隐藏方式可选**：折叠条 / 原地模糊 / 彻底移除；三档灵敏度。
- **无遥测**：无服务器、无埋点、无远程加载。对外流量仅为你显式发起的 AI 调用，以及（启用时）从 GitHub 拉取社区规则。

---

## 安装

### ✅ 推荐：从 Chrome Web Store 安装

[**点击这里在 Chrome Web Store 安装 TweetGuard**](https://chromewebstore.google.com/detail/jfjlbcabegghndnlplikppaeimbopfjp?utm_source=item-share-cb)

这是最简单、最稳定的安装方式，Chrome 会自动更新扩展。

### 手动安装（开发者 / 侧载）

如果你想测试最新源码或自行修改，也可以通过开发者模式安装。两种方式任选其一：

**方式一：下载打包好的 zip**

1. 到 [Releases](https://github.com/viewer12/tweetguard/releases) 下载最新的 `tweetguard-x.y.z.zip`，**解压**到一个固定目录（别删，扩展从这里运行）。
2. 在 Chrome / Edge / Brave 中打开 `chrome://extensions`。
3. 开启右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择刚解压出来的目录。
5. 打开 `x.com` 即生效，默认启用内置规则。

> 为什么不是双击安装的 `.crx`？Chrome 出于安全策略会自动停用「非应用商店来源」的 `.crx`，所以走「解压 + 加载已解压」是当前最可靠的侧载方式。

**方式二：克隆源码（开发者）**

1. 克隆本仓库：
   ```bash
   git clone https://github.com/viewer12/tweetguard.git
   ```
2. `chrome://extensions` → 开启 **开发者模式** → **加载已解压的扩展程序** → 选择克隆下来的目录。

> 修改代码后，需在 `chrome://extensions` 点扩展的 **刷新** 图标重载，再刷新 `x.com` 才会生效。

---

## 配置 AI（可选）

仅用内置规则即可覆盖大部分显性 spam。启用 AI 层后，覆盖率从约 80% 提升到约 95%，并开始**自动学习沉淀**内置规则尚未覆盖的新模板。

1. 工具栏 TweetGuard 图标 → **设置** → **AI 提供商**。
2. 选择 provider，点输入框旁的「获取 API Key」入口去对应官网申请，填入后点 **运行测试**（用 5 条已知样本验证）。

| Provider | 推荐模型 | 备注 |
|---|---|---|
| DeepSeek | `deepseek-v4-flash` | 极快极便宜，适合 spam 分类 |
| OpenAI | `gpt-5.4-mini` | 综合能力强 |
| Anthropic | `claude-haiku-4-5` | 最快的 Claude，近前沿智能 |
| Gemini | `gemini-2.5-flash` | 免费额度大 |
| Groq | `llama-3.1-8b-instant` | 速度极快 |
| Ollama | `qwen2.5:7b` | 本地运行，推文不离开本机 |

两个 Prompt（分类 / 复审）都在 **设置 → Prompt** 里可看、可改、可还原。

---

## 社区规则

TweetGuard 自带从 GitHub 同步社区规则的能力（默认开启，可关）：

- **同步（拉取）**：默认从本仓库的 [`community-rules.json`](community-rules.json) 拉取，启动时 + 每 24 小时各一次，也可手动「立即同步」。拉来的规则与 AI 学习规则走**同一道安全闸门**：只接受推文关键词（`tweet_keyword`），显示名 / 用户名类规则一律拒绝。
- **贡献（推送）**：设置 →「规则与权重」→「社区规则同步」→「贡献我的规则」，把你的本地学习规则导出成社区格式（复制到剪贴板 + 下载 + 打开 GitHub 提交页），确认后提个 PR 即可。
- **否决**：误判的社区规则可点「信任」本地否决，且每次同步**不会覆盖**你的否决。

规则文件格式：
```json
{ "format": "tweetguard-rules-v1", "rules": [ { "kind": "tweet_keyword", "value": "完整版来了", "category": "cn_nsfw_bot" } ] }
```

---

## 隐私

- 无后端、无遥测，仓库不含任何服务端代码。
- 所有状态保存在 `chrome.storage.local`：配置、缓存、学习规则、反馈历史均仅在本机。
- 对外流量仅为：你主动发起的 AI API 调用（本地直连你选的 provider，TweetGuard 不中转）+ 启用时从 GitHub 拉取社区规则。
- 支持 Ollama 本地模式，推文数据可不离开本机。
- **不基于用户名（@handle）判定 spam**：handle 在结构上不可靠（亚洲用户大量使用「罗马名 + 数字」格式）。显示名维度的内置硬规则也克制到极少数（仅中文引流词、加微/TG），其余显示名信号在评分层降权；AI 学习与社区规则**只基于推文内容**。

完整隐私政策见 [PRIVACY.md](PRIVACY.md)。

---

## 贡献

- **提交规则**：最快的方式是用插件内「贡献我的规则」导出后 PR 到 [`community-rules.json`](community-rules.json)。
- **代码方向**：中文 spam 模板（`src/inject.js` 的 `RX` 区）、多语种规则、provider 适配、UI 细节、回归测试 fixture。

提交 PR 前请：在真实 `x.com` 滚动测试；确认不会基于弱信号误伤合法账号；`node --check src/*.js` 无语法错误。

---

## 许可证

MIT — 见 [LICENSE](LICENSE)。
