# TweetGuard 识别引擎详解

> 配套文档：[PRODUCT_PLAN.md](PRODUCT_PLAN.md)
> 这份文档回答："给定一条推文/回复，TweetGuard 具体怎么判断它是不是垃圾？"

---

## 零、判别流程总览

```
   一条新出现的推文 (article DOM)
              │
              ▼
   ┌────────────────────────┐
   │ 第 1 步：数据抽取      │  从 DOM 拿到能拿到的字段
   └────────────────────────┘
              │
              ▼
   ┌────────────────────────┐
   │ 第 2 步：保护检查      │  白名单 / 已关注 → 直接放行
   └────────────────────────┘
              │
              ▼
   ┌────────────────────────┐
   │ 第 3 步：硬规则命中    │  极强信号一击致命（contract 地址 + 不相关话题）
   └────────────────────────┘
              │
              ▼
   ┌────────────────────────┐
   │ 第 4 步：多信号评分    │  累加 17 个加权信号
   └────────────────────────┘
              │
              ▼
   ┌────────────────────────┐
   │ 第 5 步：阈值处置      │  ≥70 隐藏 / 50-69 折叠 / <50 放行
   └────────────────────────┘
```

每条推文从被插入 DOM 到决策完成，目标 **< 1ms**（保证 60fps 滚动）。

---

## 一、能从 DOM 拿到什么（数据基础）

这是所有判断的输入。一条推文的 article 元素里，能直接读到的字段：

| 字段 | 选择器 / 来源 | 备注 |
|---|---|---|
| 显示名 displayName | `[data-testid="User-Name"] span:first-child` | 含 emoji |
| 用户名 @handle | `[data-testid="User-Name"] a[href^="/"]` 的 href | 关键标识 |
| 蓝标 verified | `svg[data-testid="icon-verified"]` 存在性 | 区分 Premium/官方/政府 颜色 |
| 推文正文 text | `[data-testid="tweetText"]` innerText | |
| 媒体类型 | `[data-testid="tweetPhoto"]` / `[data-testid="videoComponent"]` | |
| 转发标签 | `[data-testid="socialContext"]` 含 "reposted" | 区分原创/转发 |
| 引用嵌套 | 内层 `[role="link"][tabindex="0"]` 的 article | 引用的推文也得评分 |
| 互动数 | `[data-testid="like"] / [data-testid="retweet"] / [data-testid="reply"]` 的 aria-label | 文本里有数字 |
| 浏览数 | aria-label 含 "Views" | |
| 时间 | `time[datetime]` 的 datetime 属性 | ISO 时间戳 |
| 是否回复 | 推文头部 `[id^="id__"]` 含 "Replying to" | |
| 链接 | `a[href]:not([href^="/"])` | 外部链接 |
| 上下文 父推文 | URL `/status/<id>` 决定当前页类型 | |

**不能直接拿到的**（需要 hover 或 GraphQL）：
- 粉丝数 / 关注数
- 注册时间
- bio 内容
- 历史发帖密度

V1 只用 DOM 字段；V2 通过拦截 `/UserByScreenName` GraphQL 把这些补齐到 LRU 缓存里。

### ⚠️ 关键认知更新：displayName 才是 CN spam 的引流位

V0 调研漏判了 X 上对中文用户最泛滥的 spam 形态——**bot 农场色情引流号**。它们的特征：

```
displayName:  "悦欣🌸寻固炮🌸点击主页"   ← 引流文案全在显示名
@handle:      @Maria554548731              ← 英文随机名 + 8-10 位数字（买来的老号）
text:         "👆💁\n🍀\n🍾🍓☀️"          ← 推文只有 emoji，避开正文关键词检测
avatar:       动漫风女性头像              ← V2 图像分析才能识别
```

**为什么是 displayName**：因为 X 的搜索/算法主要看推文内容，bot 把广告全放在显示名里就能规避平台过滤；用户看到显示名"寻固炮 点击主页"立刻知道意图，无需推文配合。这是平台经济和黑产对抗下的演化结果。

**对识别引擎的影响**：必须把 displayName 视为 **等同于推文正文** 的关键字段，不只是"装饰"。详见 [DEFAULT_RULES.md](DEFAULT_RULES.md) §3.5 的 N1-N4 信号。

---

## 二、17 个信号详解

每个信号给出：**触发条件 + 加分权重 + 反例保护**。

### A. 账号身份信号（5 个）

#### A1. `username_pattern` — 机器生成的用户名

**触发规则**（按命中优先级，取最高分）：

```js
// 强信号 +25
/^[a-z]+\d{6,}$/i                     // 例: cryptoking_887421, mary123456
/^[a-zA-Z]{2,5}[0-9]{4,}$/            // 例: jk9482, abc1234
/^0x[a-f0-9]{6,}/i                    // 例: 0xDeAd1337abc

// 中信号 +15
/^[a-z]+_?[a-z]+_?\d{2,}$/i           // 例: john_smith_42, crypto_king_88
/^[a-z]+\d{2,5}[a-z]+\d*$/i           // 例: nft8ape, btc24moon

// NSFW 强信号 +30
/(18plus|hot|sexy|baby|girl|wife|kitten|babe|naughty).*\d*/i
/(daddy|dom|sub|cock|milf|teen).*/i

// 加密强信号 +20
/^(0x|crypto|moon|pump|gem|signal|trader|defi|nft|ape|degen|whale|alpha)/i
```

**反例保护**：用户名长度 > 20 字符（自然人极少用这么长）且词典里有词的，降权 50%。

#### A2. `display_name_emoji_stuffing` — 显示名 emoji 灌水

```js
// 数 emoji
const emojiCount = (name.match(/\p{Emoji}/gu) || []).length;

if (emojiCount >= 4)  score += 18;
if (emojiCount >= 6)  score += 25;

// 特定 emoji 组合（钩子型）
if (/[🔥💎🚀💰📈]/.test(name) && emojiCount >= 2)  score += 15;  // crypto shill
if (/[🔞🍑💋🍆💦]/.test(name))                      score += 30;  // NSFW
if (/[💸💵💴💶💷].*[📈📊🔥]/.test(name))            score += 15;  // money/finance shill
```

**反例**：emoji ≥4 但名字含日韩中字符的，权重 ×0.5（亚洲用户偏好多 emoji 装饰）。

#### A3. `verified_suspicious` — 蓝标可疑

X 的 Premium 蓝标可购买，bot 大量持有。但不能一刀切隐藏所有蓝标（误伤合法付费用户）。

**触发**：蓝标 AND 满足以下任一：
- 显示名是 A2 的 emoji 灌水模式：+20
- 用户名是 A1 的机器模式：+25
- 显示名含 `t.me` / `linktr.ee` / `bit.ly`：+25
- V2 解锁：粉丝数 < 500 AND 注册 < 6 个月：+25

#### A4. `default_avatar` — 默认头像

X 默认头像现在是灰色人形剪影。

```js
const avatarUrl = article.querySelector('img[src*="profile_images"]')?.src;
const isDefault = !avatarUrl || avatarUrl.includes('default_profile');
if (isDefault) score += 10;
```

**单独低分**，需要和其他信号叠加才有意义。

#### A5. `avatar_nsfw_hint` — 头像 NSFW 提示（V2）

头像加载完毕后，5×5 缩略图肤色像素占比 > 50% → +20。
**V1 不做**（计算开销 + 误伤风险高）。

---

### B. 内容文本信号（8 个）

#### B1. `crypto_shill_keywords` — 加密币吹嘘关键词

分级权重：

```js
// 致命级（单条 +40，几乎一票否决）
const KILLER = [
  /\b\d{1,4}00x\b/i,              // "100x", "1000x"
  /0x[a-fA-F0-9]{40}/,            // 以太坊合约地址
  /[1-9A-HJ-NP-Za-km-z]{43,44}/,  // Solana 地址（注意误伤）
  /pump\.fun\/[a-zA-Z0-9]+/,      // pump.fun memecoin 链接
];

// 强信号（+15 每个，叠加上限 +30）
const STRONG = [
  /\bmoonshot\b/i, /\bape in\b/i, /\b(buy|ape) (now|fast)\b/i,
  /\bgem\b/i, /\bdegen\b/i, /\bnext (eth|sol|btc|doge)\b/i,
  /\b(send|pump) it\b/i, /\bdo not miss\b/i,
];

// 中信号（+8 每个，上限 +24）
const MEDIUM = [
  /\$[A-Z]{2,8}\b/,               // $TICKER（但 $BTC $ETH $SOL 减分，太常见）
  /\bairdrop\b/i, /\bpresale\b/i, /\bICO\b/, /\bIDO\b/,
  /\bDM (me|for) (alpha|signal)/i,
];

// 减分（避免误伤合法讨论）
const WHITELIST_TICKERS = ['$BTC', '$ETH', '$SOL', '$DOGE'];
// 如果只命中这些主流币 ticker 且不含其他强信号 → 不算 shill
```

#### B2. `nsfw_keywords` — 色情引流

```js
// 经典 NSFW 钩子（+50，几乎一票否决）
const KILLER = [
  /check (my|the) bio/i,
  /link (in|on) my? bio/i,
  /(open|slide in|check) (my )?dms?/i,
  /\b(onlyfans|OF link|fansly)\b/i,
  /18\+\s*only/i,
];

// 强信号（+25）
const STRONG = [
  /\b(spicy|naughty|kinky)\s+(content|pics?|vids?)/i,
  /\b(fuck|cum|horny|wet)\b/i,                  // 注意英语日常用词上下文
  /\b(daddy|baby) (i|me)\b/i,
];

// NSFW emoji 组合（+20）
if (/[🔞🍆🍑💦💋].*[🔞🍆🍑💦💋]/.test(text)) score += 20;
```

#### B3. `cn_marketing_keywords` — 中文营销号

```js
const KILLER = [                  // +30
  /返佣[0-9%]*/, /撸毛/, /薅羊毛/, /躺赚/,
  /月入[0-9]+(刀|美金|万)/, /日赚[0-9]+/,
];

const STRONG = [                  // +18
  /代付/, /副业/, /被动收入/, /搬砖/,
  /教程.*免费/, /添加.*[微信VTG]/,
  /交易所.*(返佣|开户|福利)/,
];

const MEDIUM = [                  // +10
  /空投/, /教程/, /干货/, /工具站/, /AI变现/,
];
```

#### B4. `excessive_emoji` — emoji 比例过高

```js
const emojiCount = (text.match(/\p{Emoji}/gu) || []).length;
const textLen = [...text].length;  // 注意 codepoint 长度
const ratio = emojiCount / textLen;

if (ratio >= 0.3 && textLen >= 10)  score += 15;
if (ratio >= 0.5)                    score += 25;
if (emojiCount >= 5 && textLen <= 50)  score += 10;
```

**反例**：纯日韩文本里 emoji 多很常见，结合 A2 一起判，单看比例容易误伤。

#### B5. `excessive_hashtags` — 话题标签灌水

```js
const hashtagCount = (text.match(/#\w+/g) || []).length;

if (hashtagCount >= 4)  score += 10;
if (hashtagCount >= 7)  score += 20;
```

#### B6. `link_density` — 链接密度

```js
const links = article.querySelectorAll('a[href]:not([href^="/"]):not([href*="x.com"])');
const wordCount = text.split(/\s+/).length;

// 短链域名权重高
const SHORTLINK_DOMAINS = ['t.me', 'bit.ly', 'tinyurl', 'cutt.ly', 'linktr.ee', 'lnkd.in'];
let linkScore = 0;
for (const link of links) {
  if (SHORTLINK_DOMAINS.some(d => link.href.includes(d))) linkScore += 12;
  else linkScore += 4;
}

if (wordCount < 15 && links.length >= 1)  linkScore += 8;  // 短文配链接 = 引流模板
```

#### B7. `engagement_bait` — 互动诱饵

```js
const BAIT_PATTERNS = [
  /\bRT (if|for)\b/i,
  /\blike (if|for|this) (you|to)\b/i,
  /\b(comment|reply) (yes|no|below)\b/i,
  /\b(follow|tag) (me|3|5) (for|friends)\b/i,
  /\bdrop (a|your) [a-z]+ (below|here)\b/i,
];

if (BAIT_PATTERNS.some(r => r.test(text)))  score += 15;
```

#### B8. `low_info_reply` — 低信息量回复（AI 灌水核心）

仅当推文是 **回复（reply）** 时才评估：

```js
const GENERIC_PHRASES = [
  /^(great|amazing|awesome|excellent|wonderful|fantastic) (post|thread|take|point|insight)/i,
  /^(100%|totally|absolutely) (agree|this|right)/i,
  /^well said\.?$/i,
  /^this[\s.!]*$/i,
  /^facts?[\s.!]*$/i,
  /^based[\s.!]*$/i,
  /^💯+$/,
];

// 整条只有 emoji
if (/^[\p{Emoji}\s]+$/u.test(text) && text.length < 20)  score += 20;

// 命中通用赞美 + 文本很短
if (GENERIC_PHRASES.some(r => r.test(text)) && text.length < 40)  score += 15;

// 极短 + 无名词（粗糙：检查是否包含 4+ 字母词）
const hasContentWord = /\b[a-z]{4,}\b/i.test(text);
if (text.length < 20 && !hasContentWord)  score += 10;
```

---

### C. 上下文信号（3 个）

#### C1. `topic_mismatch` — 话题不相关（V2 才完美做）

最经典的模式：在一个讨论烹饪的爆款下回复"$XXX 100x"。V1 简化：

```js
// 只判加密回复出现在非加密推下（最高 ROI 的场景）
const parentTweetText = getParentTweetText();  // 当前是 reply 时拿父推
const parentIsCrypto = /\b(crypto|btc|eth|bitcoin|defi|nft|web3)\b/i.test(parentTweetText);
const thisIsCrypto = /\b(crypto|btc|eth|\$[A-Z]+|pump|moon)\b/i.test(text);

if (!parentIsCrypto && thisIsCrypto && isReply)  score += 25;
```

V2：用 Transformers.js 跑一个轻量主题分类器，覆盖更多 mismatch 场景。

#### C2. `farming_position` — 在爆款下灌水

```js
const parentEngagement = getParentEngagement();  // likes + RTs
if (parentEngagement > 10000 && isReply && !isFollowed)  score += 8;
if (parentEngagement > 100000 && isReply && !isFollowed)  score += 12;
```

#### C3. `repeated_author_in_thread` — 同线程同作者多次出现

观察 1 秒内进入视野的推文，发现同一个作者在同一个回复线程下出现 ≥3 次 → +20。
（典型的 bot 集群刷屏行为）

```js
// 用 Map<threadId, Map<author, count>> 跟踪
if (threadAuthorCount.get(threadId)?.get(author) >= 3)  score += 20;
```

---

### D. 保护信号（减分，避免误伤）

#### D1. `is_followed` — 我关注的人 → **-100**

如何拿到关注列表？

- **V1**：用户首次启动时，引导他打开自己的 following 页一次；插件在那一刻扫描所有 `[data-testid="UserCell"]` 抓取 handle 列表，存 storage。
- **V2**：拦截 `Following` GraphQL 查询自动同步。

```js
const followingSet = new Set(storage.followingList);
if (followingSet.has(authorHandle))  score -= 100;
```

#### D2. `interacted_recently` — 最近互动过 → **-50**

监听用户的点赞/回复行为，把对方 handle 加入"最近互动池"（30 天滑窗）。

```js
// 监听点击 like 按钮事件
likeButton.addEventListener('click', () => {
  recentInteractions.add(tweet.author, Date.now());
});
```

#### D3. `whitelisted` — 手动白名单 → **直接 return**

设置里的"永不隐藏"列表。命中即跳过所有评分。

---

## 三、评分数学

### 3.1 基础公式

```
finalScore = sum(signal_score for each triggered signal)
           - protection_score
           + combo_bonus
```

但纯加法有问题：单一强信号可能过早触发，多个中等信号叠加才更可靠。所以引入两层：

### 3.2 硬规则（一票否决）

某些组合**直接 = 100 分**，跳过后续评分：

```
RULE 1: 合约地址 + 不相关话题
RULE 2: NSFW handle pattern + NSFW keyword
RULE 3: pump.fun 链接 + isReply
RULE 4: 用户在黑名单
```

### 3.3 组合加成（combo bonus）

某些信号同时出现，意味更强：

```js
// crypto combo: 加密关键词 + emoji 灌水 + 短链
if (B1 hit && (A2 hit || B4 hit) && B6 hit)  bonus += 15;

// NSFW combo: handle 模式 + 内容 + 蓝标
if (A1.matched_nsfw && B2 hit && verified)  bonus += 20;

// AI filler combo: 低信息回复 + 在爆款下
if (B8 hit && C2 hit)  bonus += 10;
```

### 3.4 阈值

| 灵敏度 | 隐藏阈值 | 折叠阈值 | 说明 |
|---|---|---|---|
| 保守 Conservative | 80 | 65 | 几乎只杀确定型 spam |
| 标准 Standard（默认） | 70 | 50 | 推荐设置 |
| 激进 Aggressive | 55 | 40 | 杀错率高，给高需求用户 |

### 3.5 算法伪代码

```js
function evaluate(article) {
  const data = extract(article);                    // 第 1 步

  if (whitelist.has(data.author)) return 'show';    // 第 2 步
  if (followingSet.has(data.author)) {
    score -= 100;                                   // 关注的人重度保护
  }

  // 第 3 步：硬规则
  if (hardRules.some(r => r(data))) return 'hide';

  // 第 4 步：评分
  let score = 0;
  for (const signal of SIGNALS_17) {
    const s = signal.score(data);
    if (s > 0) score += s * userWeights[signal.id];
  }
  score += computeComboBonus(data);
  if (interactedRecently.has(data.author)) score -= 50;

  // 第 5 步：处置
  const thresholds = THRESHOLDS[userSensitivity];
  if (score >= thresholds.hide)     return 'hide';
  if (score >= thresholds.collapse) return 'collapse';
  return 'show';
}
```

---

## 四、四个真实场景的逐步推演

### 场景 1：典型加密 shill

```
@cryptoking_88472  [无蓝标]
"$PEPE going 1000x next week 🚀🚀🚀 buy now t.me/cryptoking 🔥💎 dont miss"
```

| 信号 | 命中 | 分数 |
|---|---|---|
| A1 username_pattern | `name+5digits` 模式 | +15 |
| B1 crypto_shill | `1000x` KILLER + `buy now` STRONG + `$PEPE` MEDIUM | +40+15+8 = +63（封顶 +60）|
| B4 excessive_emoji | 5 emoji / 80 chars = 6% × 5 个 → +10 | +10 |
| B6 link_density | t.me 短链 + 短文 | +20 |
| Combo (B1+A2+B6) | 加密三联 | +15 |
| **合计** | | **120** |

→ 远超 70，**HIDE**。

---

### 场景 2：NSFW 引流

```
@Maria_hot_18  [蓝标]
"Check my bio 🔥💋 daddy"
```

| 信号 | 命中 | 分数 |
|---|---|---|
| A1 username_pattern | NSFW 模式 `hot.*\d` | +30 |
| A3 verified_suspicious | 蓝标 + A1 命中 | +25 |
| B2 nsfw_keywords | `check my bio` KILLER | +50 |
| B4 excessive_emoji | 2 emoji / 15 chars = 13% | +0（未达阈值）|
| Hard Rule 2 | NSFW handle + NSFW content | **= 100** |

→ 硬规则直接 100，**HIDE**。

---

### 场景 3：AI 灌水（最难的）

```
@john_writer_dev  [无蓝标]
"100% agree! Great thread 💯"
回复对象：一条 50k 点赞的产品发布推文
```

| 信号 | 命中 | 分数 |
|---|---|---|
| A1 username_pattern | 不匹配 | 0 |
| B8 low_info_reply | "100% agree" + "Great thread" + 短 | +15+15 = +30（按 max 算 +20）|
| C2 farming_position | 父推 50k 互动 | +8 |
| Combo (B8+C2) | filler-on-viral | +10 |
| **合计** | | **38** |

→ 38 分，标准模式（70）**SHOW**；激进模式（55）也 SHOW。

→ AI 灌水单条难判，**需要 V2 的本地小模型或自学习**。这是一个已知限制，文档里要诚实说明。

---

### 场景 4：保护误伤（中国币圈合法讨论）

```
@my_following_friend  [我关注的，蓝标]
"$BTC 刚破 10 万美金 🚀 这波 100x 的是有钱了"
```

| 信号 | 命中 | 分数 |
|---|---|---|
| D1 is_followed | 在我关注列表 | **-100** |
| B1 crypto_shill | `$BTC`（在白名单 ticker 中，不计强信号）+ `100x` KILLER | +40 |
| B3 cn_marketing | 不匹配 | 0 |
| B4 excessive_emoji | 1/20 = 5% | 0 |
| **合计** | | **-60** |

→ 负分，**SHOW**。

**关键**：`is_followed = -100` 保护了所有关注的人，即便他们偶尔发加密推文也不会被误伤。

---

## 五、误伤兜底（产品上的安全网）

技术再准也会误伤。三层兜底：

### 5.1 诊断模式（debug toggle）

设置里打开后：
- 被判隐藏的推文不真的 `display:none`，而是：
  - 半透明 60%
  - 右上角浮一个 badge：`hidden | score: 78 | reasons: B2(50), A1(30)`
  - 点击 badge 可以"信任此用户"加白名单 或 "调整权重"

用户用这个模式试用一周后再切到正常模式。

### 5.2 隐藏数日志

Popup 里显示"本次会话隐藏 127 条"，点击可以看到隐藏列表（缩略 + 分数 + 命中信号），随手"恢复"加白名单。

### 5.3 一键放行

如果哪条推被错杀，用户可以在选项里输入 @handle 加白名单（或在诊断模式直接点）。

### 5.4 不动通知

我们绝不在被隐藏推文位置放置"X tweets hidden, click to show"的横幅——这违反"无感"原则，也让 X 算法可能识别到。

---

## 六、自学习（V2）

V1 是规则系统；V2 引入轻量学习：

### 6.1 用户行为信号采集

- 用户主动 block / mute → 强烈"hide"信号
- 用户主动加白名单 → 强烈"show"信号
- 用户在诊断模式点"信任" → 中等"show"信号
- 用户点击展开被折叠推文 → 弱"show"信号
- 用户点赞被识别为可疑的推文 → 强烈"show"信号

### 6.2 贝叶斯权重更新

```
posterior_weight[signal_i] =
  prior_weight[signal_i]
  + learning_rate × (correct_hides[i] - false_positives[i])
```

每天本地结算一次，权重在 [0.5, 2.0] 区间内调整（不让单个信号疯狂膨胀）。

### 6.3 Transformers.js 小模型

V2 用 `Xenova/distilbert-base-uncased-mnli` 或自己微调的 binary classifier：

```js
import { pipeline } from '@xenova/transformers';
const classifier = await pipeline('text-classification', 'Xenova/twitter-spam-detect');

// 仅对评分在 [50, 70) 灰区的推文调用模型（避免给每条推文都跑）
if (50 <= ruleScore < 70) {
  const result = await classifier(text);
  if (result[0].label === 'SPAM' && result[0].score > 0.8) {
    finalScore += 15;
  }
}
```

模型在 Web Worker 跑，不阻塞主线程。

---

## 七、性能预算

| 步骤 | 目标耗时 | 说明 |
|---|---|---|
| extract() | < 0.1ms | 选择器 + textContent |
| 白名单 check | < 0.05ms | Set.has() |
| hardRules | < 0.1ms | 4 个正则 |
| 17 信号评分 | < 0.5ms | 预编译正则 + 早退 |
| DOM 处置 | < 0.1ms | 加一个 class |
| **单条总计** | **< 1ms** | |

**保障措施**：
- 所有正则在配置加载时预编译，存全局 Map
- 信号按"命中频率高 + 计算便宜"排序，先跑便宜的，命中阈值早退
- 已处理的 DOM 节点用 WeakSet 标记，避免重复评分
- MutationObserver 收到变更后用 `requestIdleCallback` 推迟到空闲帧批处理

---

## 八、规则配置文件（用户可见）

最终所有信号、权重、阈值都暴露在 options 页：

```yaml
# 用户可在 options 看到 / 编辑的内容
sensitivity: standard
modules:
  crypto: true
  nsfw: true
  cn_marketing: true
  ai_filler: false       # V1 默认关，识别率不够
  unverified_replies: false

signals:
  username_pattern:
    enabled: true
    weight: 1.0          # 0.5-2.0 范围
  nsfw_keywords:
    enabled: true
    weight: 1.0
  # ... 17 个

custom_keywords:
  - "返佣"
  - "pump.fun"
  - "DM for alpha"

custom_regex:
  - "/\\b\\d+x\\s+gem\\b/i"

whitelist:
  - "@elonmusk"
  - "@my_friend"

blacklist:
  - "@known_scammer"
```

高级用户可以导出/导入 yaml 配置，分享规则集（未来 V3 的"社区规则订阅"基础）。

---

## 九、已知限制与诚实说明

放在产品页和 README 里：

1. **AI 灌水识别率有限**——V1 规则系统主要靠 phrase 库，会漏掉文风像人的 AI 回复
2. **新模式有滞后**——bot 套路变了，规则更新需要时间（V3 的社区订阅缓解）
3. **依赖 X DOM 结构**——X 大改前端时插件可能失效（选择器版本化 + 自动更新缓解）
4. **不能阻止你看到 X 推荐**——我们只隐藏渲染后的 DOM，算法推荐你的还是会推荐
5. **不会跨设备同步规则**（V1）——本地存储

---

## 十、给你拍板的小问题

1. **B1 crypto 信号是否要默认开**？  *主流币 ticker（BTC/ETH/SOL）已经在减分名单里，但中文用户里有不少加密爱好者，可能不希望默认拦截。我倾向于默认开 + 提示用户可关。*

2. **B8 AI filler 信号 V1 是否启用**？  *识别率不够会误伤热情回复的真人。我倾向默认关，V2 上模型后再默认开。*

3. **"关注列表保护"如何首次抓取**？  *方案 A：引导用户访问自己 following 页一次自动抓取；方案 B：拦截 GraphQL 自动同步（更优雅但需 V2）。MVP 用 A，V2 切 B。*

4. **是否做"中文规则包"作为单独模块**？  *默认全启用 vs 把中文 marketing keywords 单独做成可订阅包。我倾向默认包含，国际用户也能受益（中文 spam 在 EN 推文也常见）。*
