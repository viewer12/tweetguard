# Chrome Web Store 上架文案(中文)

> 所有字段按 Chrome Web Store 开发者后台的填写项整理。事实(检测机制、权限、provider)均对照
> `manifest.json` / `src/defaults.js` 核实,未编造。直接复制到对应字段即可。

---

## 1. 商品名称 / Name(≤45 字符)

```
TweetGuard — X(推特)信息流垃圾过滤
```

> 注:商店显示名取自 `manifest.json` 的 `name` 字段(当前为 `TweetGuard`)。若想让商店标题更具描述性,
> 需把 manifest 的 `name` 改成上面这行。保持纯品牌名 `TweetGuard` 也可以,描述交给下面的简短说明。

---

## 2. 简短说明 / Summary(≤132 字符)

```
本地过滤 X 信息流里的色情 bot、加密引流、营销号与钓鱼链接。五重检测 + 可选 AI 复审(自备 Key)+ 社区规则共建。完全开源,无服务器、无遥测。
```

---

## 3. 类别 / Category

```
生产工具（Productivity）
```

---

## 4. 语言 / Language

```
中文（简体）— zh_CN
```
（如要面向英文用户,可另加 en_US,英文文案可由 README.en-US.md 改写）

---

## 5. 详细说明 / Description

```
TweetGuard 在你浏览 X（原 Twitter）时，自动识别并静默隐藏信息流里的垃圾推文——色情引流 bot、加密货币 shill、营销号、返佣党、钓鱼链接。被隐藏的推文收起为一条细条，不打扰阅读，需要时一键展开。

【五重检测，毫秒决断】
① 名单保护：白名单与你关注的人永不误伤
② 账号缓存：判过的账号瞬时应用，不重复计算
③ 规则匹配：内置规则 + AI 自动学习 + 社区共建，三个来源
④ 评分信号：13 项加权信号综合打分，越过阈值才隐藏
⑤ AI 复审：仅对本地拿不准的「灰区」推文调用一次 AI

【完全本地，隐私至上】
· 没有后端服务器、没有遥测、没有埋点
· 所有配置、规则、缓存都只存在你的浏览器本地，卸载即清除
· AI 复审是可选功能，需你自己提供 API Key；推文直连你选择的 AI 服务，TweetGuard 不中转、不经过任何第三方
· 想要绝对隐私？选 Ollama 本地模式，推文永不离开你的设备

【可选 AI 复审 · 自备 Key（BYOK）】
支持 7 家主流 AI：DeepSeek、OpenAI、Anthropic、Google Gemini、Groq、OpenRouter、Ollama（本地）。
插件本身不提供任何 API Key，需你自己注册填入。不启用 AI 时，内置规则也能干掉大部分垃圾。

【越用越准】
AI 复审发现漏判时，会自动把垃圾模板沉淀成本地规则；下次同类垃圾本地直接命中，零额外 API 消耗。
你也可以手动标记可疑推文，系统会自动归纳；并内置「防误伤」机制，宁可漏判也绝不静默隐藏正常推文。

【社区共建规则库】
默认从 GitHub 社区规则库同步垃圾特征（仅推文关键词，可随时关闭），也可一键把你学到的规则贡献回社区。

【完全开源（MIT）】
源码、规则引擎、社区规则库全部公开，欢迎审计、提 issue、贡献：
https://github.com/viewer12/tweetguard

——
TweetGuard 不收集你的任何数据，也没有任何后端服务器。它不是一个「免费但拿你数据」的产品，而是一个你完全掌控的本地工具。
```

---

## 6. 单一用途说明 / Single Purpose(MV3 必填)

```
TweetGuard 只做一件事：在用户浏览 X（twitter.com / x.com）时，自动识别并隐藏信息流中的垃圾推文（色情引流机器人、加密货币推广、营销号、钓鱼链接），为用户提供更干净的浏览体验。所有判定优先在本地完成；可选的 AI 复审由用户自行启用并配置自己的 API Key。
```

---

## 7. 权限理由 / Permission Justifications（每项单独填）

| 权限 | 理由 |
|------|------|
| **storage** | 保存你的过滤配置、AI 自动学习的规则、已识别账号的判定缓存、白名单 / 黑名单 / 关注列表——全部存于本地浏览器，不上传。 |
| **alarms** | 定时（每 24 小时）从 GitHub 社区规则库同步最新的垃圾特征规则。 |
| **主机权限 raw.githubusercontent.com** | 拉取社区共建的垃圾特征规则文件（community-rules.json），不包含用户任何信息。 |
| **主机权限 api.deepseek.com / api.openai.com / api.anthropic.com / generativelanguage.googleapis.com / api.groq.com / openrouter.ai** | 仅当用户主动启用「AI 复审」并填入对应服务商的 API Key 后，将少量本地拿不准的「灰区」推文文本发送到用户自己选择的 AI 服务进行判定。默认关闭，不启用则永不请求。 |
| **主机权限 localhost / 127.0.0.1** | 支持用户使用本地 Ollama 大模型做 AI 复审，实现完全离线、数据不出设备。 |
| **在 x.com / twitter.com 上读取和更改数据**（content script） | 在 X 页面注入过滤逻辑，识别并折叠垃圾推文——这是扩展的核心功能，仅在 X 域名生效。 |

---

## 8. 数据使用披露 / Data Usage（Chrome 数据表单）

**收集的数据：无。** 逐项勾选「不收集」：
- 个人身份信息（姓名、邮箱等）：不收集
- 健康信息 / 财务信息 / 认证信息：不收集
- 个人通讯 / 位置：不收集
- 用户活动（点击、浏览历史）：不收集、不上传
- 网站内容：**默认不发送**。仅当用户主动启用 AI 复审后，被判为灰区的推文文本会发送到**用户自己配置的** AI 服务商（用户提供 Key，直连官方 API，不经 TweetGuard 任何服务器）。

**三项合规声明（勾选保证）：**
- ☑ 不将用户数据出售或转让给第三方
- ☑ 不将用户数据用于与扩展单一用途无关的目的
- ☑ 不将用户数据用于判定信用资格或借贷用途

---

## 8.5 远程代码使用情况 / Remote Code（必答）

**选「否,我不使用远程代码」（No, I am not using remote code）。**

依据(已核对源码)：
- 所有可执行 JS（background / content / inject / options / popup / defaults）全部打包在扩展包内。
- `content.js` 通过 `chrome.runtime.getURL('src/inject.js')` 注入页面脚本——这是扩展包内的本地文件 URL（`chrome-extension://…`），不是远程地址，是 MV3 注入 page-context 的标准合规写法。
- 无 `eval`、无 `new Function`、无远程 `import()`、无加载远程 `<script>`。
- 从 GitHub 拉取的 `community-rules.json`、AI API 返回的内容,都用 `JSON.parse` 当**数据**处理,绝不作为代码执行。

> 「远程代码」≠「远程数据」。本扩展会请求 GitHub / AI API 取**数据**(规则、判定结果),但不取**代码**执行,故此项为「否」。host 权限的解释见上面第 7 节。

## 9. 隐私政策 URL（必填）

```
https://github.com/viewer12/tweetguard/blob/main/PRIVACY.md
```
（隐私政策正文见仓库根目录 PRIVACY.md，已随本次提交一起入库）

---

## 10. 其他字段

- **支持网站 / 主页**：`https://github.com/viewer12/tweetguard`
- **支持邮箱**：填你愿意公开的开发者邮箱（Chrome 后台必填，本仓库未硬编码，由你填写）
- **官方网站**（可选）：同 GitHub 仓库地址

---

## ⚠️ 上传前 checklist

- [ ] manifest 的 `name` 是否要改成更具描述性的标题（决定商店显示名）
- [ ] 隐私政策 URL 在 PRIVACY.md push 到 main 后才可访问
- [ ] 截图 / 图标 / 促销图用 `marketing/out/` 里的 8 张
- [ ] 数据表单三项保证如实勾选
- [ ] 开发者支持邮箱填好
