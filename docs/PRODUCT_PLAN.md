# TweetGuard 产品方案

> 一个安静过滤 X.com 垃圾号的 Chrome 插件
> 调研 + 产品方案 v0.1（2026-05-27）

---

## 摘要（TL;DR）

X.com 在 2025-2026 出现系统性垃圾号污染：加密币营销、色情引流、AI 生成的"check my bio"灌水回复，平台官方已承认结构性无法治理（80% crypto 活动来自 bot）。现有插件方案要么过于粗暴（一键隐藏所有蓝标）、要么过于狭窄（只处理自己推文的回复），缺少一个"多信号评分 + 无感隐藏 + 灵活规则"的产品。

**TweetGuard 的差异化**：本地多维度评分（账号特征 + 内容特征 + 上下文）→ 静默 `display:none` 隐藏 → 用户可调节灵敏度 + 白名单兜底 → 全程不动 X 的 API、不传任何用户数据。仅需 `storage` 权限。

**MVP 范围**：3 周开发。规则引擎 + 评分隐藏 + 三个主战场（Home Timeline / 推文回复区 / 引用转发）。后续再加本地小模型与社区共享黑名单。

---

## 一、问题域调研

### 1.1 X 平台垃圾号现状（2025-2026）

| 维度 | 数据 / 现象 | 来源 |
|---|---|---|
| 规模 | X 自承 80% 加密币内容来自 bot | beincrypto / cryptonews |
| 流量 | CryptoQuant 单日检测到 775 万条加密推文，环比 +1224% | bravenewcoin |
| 类型扩张 | 2024 起色情号"check my bio"灌水回复跨品类铺开 | bleepingcomputer |
| 平台无力 | X Head of Product 2026 公开承认现有技术无法根治 | beincrypto |
| 治理副作用 | "Probable SPAM" 折叠把付费用户合理回复也藏掉，引发反弹 | theshortcut.com |
| 蓝标失效 | Premium 订阅把 bot 染成"已验证"，反而获得回复区优先曝光 | techcrunch, socialmediatoday |

**关键洞察**：X 的算法 + Premium 经济结构让 bot 经济与平台经济耦合，官方不可能彻底解决；这是一个**长期存在**的用户痛点，不是临时阵痛。这意味着第三方插件有持续的市场窗口。

### 1.2 垃圾号分类（实战谱系）

按危害程度和识别难度分四类：

1. **加密币营销号（crypto shillers）**
   - 形态：在任何热推下回复 "$XXX is going to 100x"，常带合约地址、TG/Discord 链接、🚀💰📈 表情串
   - 行为：批量、低互动、回复速度极快（机器人脚本）
   - 现状：X 已部分对策（首次提币内容需身份验证），但绕过普遍

2. **色情引流号（NSFW lead-gen）**
   - 形态："Check my bio 🔥"、"DM me baby"、女性化头像 + 露骨头图、bio 里 OnlyFans/Fansly 短链
   - 行为：在任何高曝光推文下灌水，特别针对男性用户的回复区
   - 识别：用户名+头像+bio 模式高度可识别

3. **营销/SEO 号（商业引流）**
   - 形态：自助建站、Dropshipping 教程、AI 工具推广、"我用 XX 月入 5000 刀"
   - 行为：发原创推 + 大量回复名人推获取曝光
   - 中文圈尤其多：交易所返佣、跨境电商、加密资讯营销号

4. **AI 灌水号（engagement farming）**
   - 形态：用 LLM 自动生成看似合理但毫无信息量的回复（"This is great!"、"100% agree"、emoji 列表）
   - 危害：最难识别——内容看起来正常，但实际拉低信息密度
   - 趋势：占比快速上升

### 1.3 用户为什么会装这种插件

- **回复区不可读**：高赞推文下前 20 条回复几乎全是垃圾，需要滚 200+ 条才能看到真讨论
- **时间线噪音**：算法推荐塞进来一堆"For You"垃圾号
- **引用转发污染**：被引用的好推文，引用方却是营销号，要点开才知道
- **Notification 被淹没**：被一堆 bot mention 淹没真实互动

---

## 二、用户与价值主张

### 2.1 目标用户画像

| 画像 | 占比 | 痛点 | 付费意愿 |
|---|---|---|---|
| 信息消费重度用户（KOL / VC / 研究员 / 开发者） | 25% | 回复区不可读 + 时间线被污染 | 高（$5-15/月） |
| 加密币/科技圈用户 | 30% | 加密 bot 灌水严重 | 中高 |
| 内容创作者 | 15% | 自己推文回复区被污染 | 中 |
| 普通中文用户 | 20% | 色情号 + 营销号 + AI 灌水 | 低-中 |
| 隐私敏感用户 | 10% | 不接受云端方案 | 高 |

### 2.2 核心价值主张

> **"让你的 X 信息流回到 2020 年的清爽——但你完全感觉不到我们在工作。"**

三句话：
1. **无感**：被识别的垃圾内容直接消失，不留痕迹，不打断阅读节奏
2. **灵活**：拉杆调节激进度，加白名单，自定义关键词
3. **本地**：所有数据本地，不上传，不读 cookie，不动 X API

---

## 三、竞品分析

### 3.1 主流方案对比

| 产品 | 装机量级 | 核心能力 | 短板 | 评级 |
|---|---|---|---|---|
| **Control Panel for Twitter** | 数十万 | 85+ 配置项，时间线/UI 全面定制 | 不专攻垃圾号；过滤维度是关键词级，不做账号评分 | ⭐⭐⭐⭐ |
| **Hide Verified Replies** | 中等 | 一键隐藏所有蓝标回复 | 太粗暴，误伤真正付费的活人 | ⭐⭐ |
| **Mass Block Twitter** | 中等 | 批量 block 搜索结果 | 走 Twitter Block 接口有封号风险；用户介入操作多 | ⭐⭐ |
| **Reply Hide & Block for X** | 小 | 通知页隐藏 + block | 只覆盖 notifications，不管 timeline 和回复区 | ⭐⭐ |
| **X/Twitter Spam Filter** | 极小（2 评论） | 号称 AI，实际规则 | 未证实，可信度低 | ⭐ |
| **PureFeed（中文）** | 小 | 多层过滤 + 白名单 | 偏白名单导向；不深入账号特征 | ⭐⭐⭐ |
| **uBlock Origin（cosmetic 规则）** | 千万级 | 写 `:has()` 选择器手动过滤 | 需要技术能力；规则维护不可持续 | ⭐⭐⭐ |

### 3.2 差异化机会

- **没有人做"多信号账号评分 + 静默隐藏"** —— Control Panel 偏 UI 定制，Spam Filter 类太单维度
- **没有人做中文圈本土化** —— PureFeed 是少数中文产品但功能有限
- **没有人做"渐进式学习"** —— 用户每次 block 一个号可以反哺规则
- **没有人做"上下文感知"** —— 同一个号在 timeline 是 OK 的（被关注），在某热推回复区是 spam（突然出现）

---

## 四、TweetGuard 产品方案

### 4.1 设计原则

| 原则 | 含义 | 反例 |
|---|---|---|
| **静默优先** | 默认隐藏方式是 `display:none`，不留占位 | ❌ "已隐藏 X 条垃圾，点击查看" 横幅 |
| **灰度处置** | 高分直接隐藏；中分降权（折叠/淡化）；低分不处理 | ❌ 二元 block/show |
| **永远可恢复** | 设置里有"显示隐藏内容"开关 + 一键诊断模式 | ❌ 删干净找不回 |
| **白名单优先** | 用户关注的 + 用户互动过的，永远不隐藏 | ❌ 误伤好友 |
| **零外部依赖** | 不调 X API，不传服务器（V1） | ❌ 注册账户 / 上传 cookie |
| **性能为王** | 滚动 60 FPS，单条推文判定 <1ms | ❌ 一卡一卡 |

### 4.2 核心功能架构

```
┌─────────────────────────────────────────────────┐
│                   TweetGuard                     │
├─────────────────────────────────────────────────┤
│  采集层  Collector                              │
│   ├─ DOM Observer（MutationObserver）           │
│   ├─ 推文实体提取（作者/正文/上下文）           │
│   └─ 可选：GraphQL 响应拦截（V2）               │
├─────────────────────────────────────────────────┤
│  识别层  Detector                                │
│   ├─ 规则引擎（关键词 / 正则 / 模式）           │
│   ├─ 评分引擎（多信号加权）                     │
│   ├─ 白名单/黑名单                              │
│   └─ 可选：本地小模型（V2，Transformers.js）   │
├─────────────────────────────────────────────────┤
│  处置层  Actuator                                │
│   ├─ display:none（hard hide）                  │
│   ├─ 半透明/折叠（soft hide）                   │
│   └─ 仅标记（diagnostic mode）                  │
├─────────────────────────────────────────────────┤
│  控制层  UI                                      │
│   ├─ Popup（快速开关 + 灵敏度滑杆）             │
│   ├─ Options（详细规则 / 白名单 / 关键词）      │
│   └─ Sidebar Counter（可关闭，本次会话隐藏数）  │
└─────────────────────────────────────────────────┘
```

### 4.3 识别引擎设计（核心）

**评分模型**：每条推文打 0-100 分，超过阈值即隐藏。

**信号清单**（17 个 V1 维度，每个权重可配置）：

#### A. 账号身份信号（DOM 内可见）
| 信号 | 权重区间 | 取值示例 |
|---|---|---|
| `username_pattern` | +0~30 | 用户名匹配 `[a-z]+\d{6,}$` / 全随机字符 |
| `display_name_emoji` | +0~15 | 名字里 4+ 个 emoji，常见 🔥💎🚀 |
| `verified_low_followers` | +0~25 | 蓝标但粉丝 <500（买的勾） |
| `default_avatar` | +0~10 | 默认头像（egg）|
| `nsfw_avatar_hint` | +0~30 | 头像/头图过曝光肤色检测（V2 才上） |

#### B. 内容信号（推文文本）
| 信号 | 权重区间 | 取值示例 |
|---|---|---|
| `crypto_shill_keywords` | +0~40 | "100x" / "moonshot" / "$TICKER" / 合约地址 |
| `nsfw_keywords` | +0~50 | "check my bio" / "dm me" / 18+ emoji 组合 |
| `cn_marketing_keywords` | +0~30 | "返佣" / "建站" / "薅羊毛" / "代付" |
| `excessive_emoji` | +0~20 | emoji 占比 >30% |
| `excessive_hashtags` | +0~15 | hashtag 数 >5 |
| `link_density` | +0~20 | 含短链 + 文本短 |
| `engagement_bait` | +0~15 | "RT if agree" / "Like for X" |
| `low_info_reply` | +0~20 | 纯 emoji / "Great post!" / "100% agree" |

#### C. 上下文信号（位置）
| 信号 | 权重区间 | 含义 |
|---|---|---|
| `unrelated_topic` | +0~25 | 加密回复出现在非加密推下（V2 需主题识别） |
| `not_followed` | +0~10 | 作者非关注用户 |
| `is_reply_to_viral` | +0~10 | 在 >10k 互动的推文下回复（典型 farming 位） |

#### D. 减分信号（保护合法用户）
| 信号 | 权重区间 | 含义 |
|---|---|---|
| `is_followed` | -100 | 关注的人永远不隐藏 |
| `interacted_recently` | -50 | 我点过赞/回复过的人 |
| `whitelisted` | -∞ | 手动白名单 |

**默认阈值**：
- ≥70 分 → `display:none`
- 50-69 分 → 半透明 + 折叠（点击展开）
- <50 分 → 不处理

**灵敏度滑杆**：用户拖动调整阈值（保守模式 80 / 标准 70 / 激进 55）。

### 4.4 UI / UX

#### Popup（点击插件图标）
```
┌─────────────────────────────┐
│  TweetGuard          🟢 ON  │
├─────────────────────────────┤
│  本次会话隐藏：127 条        │
│  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔          │
│  灵敏度：保守 [▓▓▓░░] 激进  │
│  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔          │
│  □ 隐藏加密垃圾              │
│  □ 隐藏色情引流              │
│  □ 隐藏 AI 灌水              │
│  □ 隐藏未关注的蓝标          │
│  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔          │
│  [⚙️ 高级设置]  [📋 日志]   │
└─────────────────────────────┘
```

#### 隐藏方式（关键 UX 决策）
- **默认**：`display:none`，无任何视觉残留（用户要求"无感"）
- **可选**：opt-in 一个极简模式——被隐藏的推文位置留一个 4px 高的灰色细线，hover 显示"已隐藏 / 显示"按钮。给"我怕误伤"型用户兜底。

#### 诊断模式
设置里的"诊断模式"打开后：被隐藏的推文不真隐藏，而是显示半透明 + 右上角徽章 `score:78 (NSFW keyword)`，用户可以校准。

---

## 五、技术方案

### 5.1 整体架构（参考 Control Panel for Twitter 验证过的模式）

```
manifest.json (MV3)
  ├─ permissions: ["storage"]   ← 只要 storage，不要任何特权
  ├─ host_permissions: 不需要（content_scripts 已覆盖）
  ├─ content_scripts:
  │    matches: x.com/*, twitter.com/*
  │    run_at: document_start
  │    js: [content.js]
  └─ web_accessible_resources: [script.js]

content.js（隔离环境，3-5 KB）
  ├─ 注入 script.js 到页面环境
  ├─ chrome.storage.local 读 + listen onChanged
  ├─ 通过 <script id="tg-config"> innerHTML 把 config 传给页面脚本
  └─ 通过 window.message 接收页面脚本的回写（用户调整偏好）

script.js（页面环境主体）
  ├─ 启动一个全局 MutationObserver on document
  ├─ 用 data-testid 选择器找新增推文
  ├─ 对每条推文跑评分引擎
  ├─ 根据分数处置 DOM
  └─ 监听 history.pushState（SPA 路由）重置上下文
```

### 5.2 DOM 切入点

X.com 的 React 渲染使用 `data-testid` 作为相对稳定的标识（比 className 稳定得多）。验证过的核心选择器：

```
article[data-testid="tweet"]                  // 单条推文容器
[data-testid="cellInnerDiv"]                  // 时间线 cell 包装
[data-testid="tweetText"]                     // 推文正文
[data-testid="User-Name"]                     // 作者区块
[data-testid="UserHoverContainer"]            // 鼠标悬停面板
[aria-label^="Timeline:"]                     // 时间线容器
svg[data-testid="icon-verified"]              // 蓝标
```

**注意点**：
- 推文有多种容器（Home / 个人页 / 单推详情 / 引用嵌套）必须分别测试
- 引用转发是嵌套 article，需要识别"外层是否被引用方污染"
- 头像 / bio 在悬停时才加载，初始 DOM 拿不到

### 5.3 三种数据获取策略对比

| 策略 | 拿到的数据 | 性能 | 风险 | 推荐 |
|---|---|---|---|---|
| **A. DOM only** | 用户名/显示名/正文/verified/简单上下文 | ★★★★★ | 无 | **V1 默认** |
| **B. 触发 hover card** | + bio / followers / following / 注册时间 | ★★ | 易触发频控 | 不推荐 |
| **C. 拦截 GraphQL** | 全量用户实体 / followers / created_at | ★★★★ | 内部接口变更 | **V2 增强** |

V1 用 A，性价比最高、最稳。V2 加 C 解锁 follower 数和注册时间等高质量信号。

**C 的实现思路**：
```js
// 在 script.js 入口劫持 fetch
const origFetch = window.fetch;
window.fetch = function(...args) {
  return origFetch.apply(this, args).then(async (res) => {
    const url = args[0];
    if (typeof url === 'string' &&
        (url.includes('/UserByScreenName') ||
         url.includes('/TweetDetail') ||
         url.includes('HomeTimeline'))) {
      const clone = res.clone();
      clone.json().then((data) => {
        // 提取 user.legacy.followers_count, created_at, etc.
        // 存到内存 LRU cache
        cache.set(screenName, extractUserStats(data));
      });
    }
    return res;
  });
};
```

### 5.4 性能优化（关键）

X 的时间线是虚拟滚动，每秒可能有几十个 DOM 变更。必须严格控制开销：

1. **MutationObserver 配置精简**：
   ```js
   observer.observe(timelineContainer, {
     childList: true,
     subtree: true,
     // 不要 attributes / characterData
   });
   ```

2. **去抖 + 批处理**：用 `requestIdleCallback` 把判定推到空闲帧；同一帧内批量处理新增 article。

3. **WeakSet 标记已处理**：避免对同一个 DOM 节点重复跑评分。

4. **正则预编译**：所有关键词正则在配置加载时编译一次，存全局。

5. **早退（short-circuit）**：白名单命中直接 return；高强度信号（如 NSFW keyword）一击 50 分，可以提前结束评分循环。

6. **CSS `:has()` 兜底**：能用 CSS 选择器搞定的（如"隐藏所有 verified + 0 关注者的回复"）就不要走 JS。在 styleSheet 里 inject 动态规则更便宜。

### 5.5 存储设计

`chrome.storage.local` 单存档对象，结构：

```typescript
interface TGStorage {
  version: number;                    // schema 版本
  enabled: boolean;
  sensitivity: 'conservative' | 'standard' | 'aggressive';
  modules: {
    cryptoShill: boolean;
    nsfw: boolean;
    aiFiller: boolean;
    cnMarketing: boolean;
    unverifiedReplies: boolean;
  };
  weights: Record<SignalKey, number>;  // 用户自定义权重
  whitelist: string[];                 // @handles
  blacklist: string[];                 // 永久 block
  customKeywords: string[];
  customRegex: string[];
  hideMode: 'remove' | 'thinline' | 'diagnostic';
  stats: {
    totalHiddenLifetime: number;
    perCategory: Record<string, number>;
  };
}
```

**容量预算**：`chrome.storage.local` 默认 10MB（足够）。`sync` 不用（容易触发配额）。

### 5.6 测试与发布

- **单元测试**：评分引擎用 jest，覆盖所有信号
- **DOM 快照测试**：把真实 X 页面的 HTML 片段固化为 fixture，回归测试
- **真机灰度**：先发 Chrome Web Store unlisted 给 10-20 个种子用户
- **崩溃监控**：本地日志环形缓冲 + 设置里的"导出诊断日志"按钮（用户主动发给我们）

---

## 六、落地路径

### 6.1 MVP 范围（3 周）

| Week | 交付 |
|---|---|
| **W1** | 工程脚手架（Vite + CRXJS + TS）+ 注入框架 + Storage 通信 + 5 个核心选择器跑通 |
| **W2** | 评分引擎 + 12 个 V1 信号（账号+内容）+ 静默隐藏 + 白名单 |
| **W3** | Popup + Options UI + 灵敏度滑杆 + 诊断模式 + Chrome Web Store 提审包 |

**MVP 不包含**：本地小模型、GraphQL 拦截、社区黑名单、移动端、Firefox 版本。

### 6.2 V2 增强（MVP 上线后 1-2 月）

- **GraphQL 拦截** → 解锁 follower 数 / 注册时间 / following 数等"硬"特征
- **本地 Transformers.js 分类器** → 用 distilbert-tiny 微调一个 spam classifier，跑在 Web Worker
- **社区共享黑名单**（opt-in） → 类似 uBlock 的 filter list 订阅模式
- **学习模式** → 用户每次手动 hide，反馈到本地规则权重（贝叶斯更新）

### 6.3 V3 商业化（V2 验证后）

**Freemium 模式**（参考 Chrome 扩展最佳实践）：
- **免费**：基础规则 + 5 个自定义关键词 + 100 白名单
- **Pro $4.99/月**：无限自定义规则 + GraphQL 增强信号 + 社区黑名单订阅 + 跨设备同步（自建 backend，不存推文内容）
- **Team $14.99/月**：共享白/黑名单 + 团队规则模板（针对企业的"行业 watch"场景）

参考点：成功的 Chrome 扩展年均 $862K 收入，70-85% 毛利。$5/月在生产力扩展里是合理价位。

### 6.4 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| X 改 DOM / data-testid | 高 | 中 | 选择器版本化 + 用户可订阅的"规则更新"channel（不需要重发版） |
| 误伤合法用户 | 中 | 高 | 诊断模式 + 白名单 + 灵敏度可调 + 用户上报反馈通道 |
| Chrome 政策风险（被下架） | 低 | 极高 | 不调 X API，不读 cookie，不传数据；Privacy Policy 写清楚 |
| X 主动反制（注入检测） | 低 | 中 | 不修改 X 业务逻辑，只动 CSS display；难以检测 |
| 中文圈用户预期价格低 | 中 | 中 | 中文用户主推免费版，靠 Pro 海外市场收入 |

### 6.5 可选：用户增长路径

1. **Reddit / HN 首发**：r/Twitter, r/chrome_extensions, HN Show 板块
2. **X 上 KOL 自发安利**：找 5-10 个抱怨过 spam 问题的科技/加密大 V 送 Pro
3. **PH (Product Hunt) 发布**：MVP 完成 2 周后
4. **中文小红书 / V2EX**：本土化版本上线时启动
5. **uBlock filter list 兼容**：让 uBlock 高级用户也能用我们的规则集

---

## 七、待决策的产品问题

需要你 align 的几个关键点：

1. **隐藏方式默认值**：纯 `display:none` 一刀切 vs. 留 4px 细线兜底？
   *推荐：纯隐藏（符合"无感"原则），但 settings 里提供细线模式开关*

2. **是否走云端**：V1 是否需要任何后端？
   *推荐：V1 完全离线。V3 商业化时再加一个极简 sync 后端*

3. **平台优先级**：先 Chrome only 还是同时 Firefox/Edge？
   *推荐：Chrome 先发，Edge 同 manifest 兼容（白送），Firefox 等 V2*

4. **中文化策略**：默认英文 + 中文翻译 vs. 中文 + 英文翻译？
   *推荐：英文为主（覆盖更大市场），但首发同步上中文，菜单和文案双语*

5. **品牌与定位**：TweetGuard 的人格是"工具感"还是"反 spam 战士感"？
   *推荐：工具感、克制、专业（参考 1Password 调性），不要"愤怒""清理"的口号*

6. **数据隐私的市场表达**：是否把"零数据上传"作为核心卖点广而告之？
   *推荐：是。这是相对 X/Twitter Spam Filter 等不透明工具的关键区别*

7. **MVP 三大模块取舍**：加密 / NSFW / AI 灌水，三个都做还是先做一个？
   *推荐：三个都做但权重不同——NSFW（最容易识别，立竿见影） > 加密（高价值用户痛点） > AI 灌水（最难，留到 V2）*

---

## 八、参考资料

调研中使用的关键来源：

**X 垃圾号现状**
- [X Admits 80% of Crypto Is Bots](https://beincrypto.com/x-crypto-bots-spam-problem/) — beincrypto
- [Twitter's bot spam keeps getting worse — it's about porn this time](https://www.bleepingcomputer.com/news/security/twitters-bot-spam-keeps-getting-worse-its-about-porn-this-time/) — BleepingComputer
- [Probable SPAM 折叠争议](https://www.theshortcut.com/p/x-twitter-labels-probable-spam) — The Shortcut
- [It sure looks like X has a Verified bot problem](https://techcrunch.com/2024/01/10/it-sure-looks-like-x-twitter-has-a-verified-bot-problem/) — TechCrunch

**Bot 检测研究**
- [Multirelational Twitter Bot Detection using Graph Neural Networks](http://www.cs.sjsu.edu/faculty/pollett/papers/2025BDS.html) — SJSU 2025
- [Malicious bot detection in Twitter/X with interpretable ML](https://link.springer.com/article/10.1007/s12652-026-05039-w) — Springer
- [Bot Detection signals 综述](https://miqwal.com/en/blog/x-twitter-fake-followers-detection-guide)

**Chrome 扩展实现**
- [Control Panel for Twitter (GitHub)](https://github.com/insin/control-panel-for-twitter) — 最佳参考实现
- [uBlock Twitter cosmetic filter 讨论](https://github.com/uBlockOrigin/uAssets/discussions/23469)
- [Building a Smart Topics Filter for X](https://www.lionbloggertech.com/building-a-smart-topics-filter-for-x-twitter-a-chrome-extension-guide/)

**技术参考**
- [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)
- [Network Interception in Chrome Extensions](https://dev.to/hamdi_laadhari/chrome-extension-network-interception-the-modern-way-to-scrape-instagram-and-beyond-49bl)
- [Transformers.js](https://huggingface.co/docs/transformers.js/en/index)

**商业化参考**
- [How to Monetize a Chrome Extension in 2026](https://dodopayments.com/blogs/monetize-chrome-extension) — Dodo
- [Real Numbers: Freemium Chrome Extension Monetization](https://dev.to/_350df62777eb55e1/real-numbers-freemium-chrome-extension-monetization-after-6-months-5hga)
