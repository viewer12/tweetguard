# TweetGuard 隐私政策

最后更新：2026-06-13

TweetGuard 是一个完全在你浏览器本地运行的开源 Chrome 扩展，用于过滤 X（原 Twitter）信息流中的垃圾推文。核心原则一句话：**我们不收集你的任何数据。**

## 我们不做什么

- ❌ 没有后端服务器，不向任何 TweetGuard 服务器发送数据
- ❌ 无遥测、无埋点、无统计分析
- ❌ 不收集个人身份信息、浏览历史、位置等任何数据
- ❌ 不出售、不转让、不共享你的数据

## 数据存储

你的所有数据——过滤配置、AI 自动学习的规则、账号判定缓存、白名单 / 黑名单 / 关注列表——都通过 Chrome 的 `storage.local` 仅保存在你自己的浏览器本地。卸载扩展即清除。设置页可随时一键清除或导出。

## 网络请求

TweetGuard 只会发起以下两类请求：

1. **社区规则同步**（默认开启，可在设置中关闭）
   从 GitHub（`raw.githubusercontent.com`）拉取公开的垃圾特征规则文件。此请求**不包含你的任何信息**，只是下载一个公共 JSON 文件。

2. **AI 复审**（默认关闭，需你手动启用并提供 API Key）
   启用后，少量被本地规则判为「灰区」（拿不准）的推文文本，会**直接发送到你自己选择并配置的 AI 服务商**：DeepSeek、OpenAI、Anthropic、Google Gemini、Groq、OpenRouter，或本地 Ollama。
   - 这些请求**直连各服务商官方 API**，使用**你自己的 API Key**，**不经过任何 TweetGuard 服务器或第三方**。
   - 发送的推文文本受你所选 AI 服务商的隐私政策约束。
   - 选择 **Ollama 本地模式**时，推文文本完全不离开你的设备。

除以上两类外，TweetGuard 不发起任何其他网络请求。

## 你的控制权

- AI 复审可随时关闭；关闭后不会发送任何推文内容。
- 社区规则同步可随时关闭。
- 所有本地数据可在设置页一键清除或导出。

## 开源可审计

TweetGuard 完全开源（MIT 许可），你可以审计全部源码，验证以上每一条承诺：
https://github.com/viewer12/tweetguard

## 联系

如有隐私相关问题，请在 GitHub 提 issue：
https://github.com/viewer12/tweetguard/issues
