# TweetGuard v0 默认规则集

> 配套：[DETECTION_LOGIC.md](DETECTION_LOGIC.md)
> 这是首次安装后的开箱默认。所有数字、关键词、正则都是可直接 ship 的具体值，不是占位符。

---

## 0. 默认配置一览

| 项 | 值 |
|---|---|
| 默认灵敏度 | **Standard**（hide ≥ 70，collapse ≥ 50） |
| 默认隐藏方式 | **display:none**（无感） |
| 默认模块开启 | **CN-NSFW-Bot ✅（最高优先级）** / NSFW ✅ / Crypto ✅ / CN-Marketing ✅ / Engagement-Bait ✅ |
| 默认模块关闭 | AI-Filler ❌（识别率不够易误伤）/ Unverified-Replies ❌ |
| 默认白名单 | 空（用户首次访问 following 页时自动填充） |
| 默认黑名单 | 空 |
| 首次启动行为 | 引导用户进入"诊断模式"试用 24 小时 |

---

## 1. 灵敏度阈值

```yaml
thresholds:
  conservative:
    hide: 80          # 几乎只杀 100% 确定的
    collapse: 65
  standard:           # ← 默认
    hide: 70
    collapse: 50
  aggressive:
    hide: 55
    collapse: 40
```

---

## 2. 信号权重表（V1 默认值）

每个信号最高加分。命中即按 base 加分；多个子规则命中取 max 不累加；不同信号之间累加。

| 信号 ID | 类别 | 默认权重 | 启用 |
|---|---|---|---|
| **`N1_displayname_cn_nsfw`** | **显示名** | **见 §3.5 分级（最高优先级）** | **✅** |
| **`N2_displayname_separator_pattern`** | **显示名** | **见 §3.5** | **✅** |
| **`N3_name_handle_lang_mismatch`** | **账号** | **见 §3.5** | **✅** |
| **`N4_pure_emoji_post`** | **内容** | **见 §3.5** | **✅** |
| `A1_username_pattern` | 账号 | 见 §3.1 分级 | ✅ |
| `A2_displayname_emoji` | 账号 | 见 §3.2 分级（**已修复 CJK 减权 bug**） | ✅ |
| `A3_verified_suspicious` | 账号 | 20-25 | ✅ |
| `A4_default_avatar` | 账号 | 8 | ✅ |
| `A5_avatar_nsfw_hint` | 账号 | 20 | ❌（V2 才上） |
| `B1_crypto_shill` | 内容 | 见 §4.1 分级 | ✅ |
| `B2_nsfw_keywords` | 内容 | 见 §4.2 分级 | ✅ |
| `B3_cn_marketing` | 内容 | 见 §4.3 分级 | ✅ |
| `B4_excessive_emoji` | 内容 | 15-25 | ✅ |
| `B5_excessive_hashtag` | 内容 | 10-20 | ✅ |
| `B6_link_density` | 内容 | 5-20 | ✅ |
| `B7_engagement_bait` | 内容 | 15 | ✅ |
| `B8_low_info_reply` | 内容 | 10-20 | ❌（V1 默认关） |
| `C1_topic_mismatch` | 上下文 | 25 | ✅（仅 crypto-on-non-crypto） |
| `C2_farming_position` | 上下文 | 8-12 | ✅ |
| `C3_repeated_author` | 上下文 | 20 | ✅ |
| `D1_is_followed` | 保护 | **-100** | ✅（强保护） |
| `D2_interacted_recently` | 保护 | **-50** | ✅ |
| `D3_whitelisted` | 保护 | **skip** | ✅ |

---

## 3. 账号身份信号 — 具体规则

### 3.1 A1_username_pattern

按命中优先级取最高分（不累加）：

```js
// === Tier 1 强信号：+25 ===
const TIER1 = [
  /^[a-z]+\d{6,}$/i,                          // cryptoking847291
  /^[a-z]{2,5}\d{5,}$/i,                      // abc12345
  /^[a-zA-Z][a-z]+\d{4,}[a-z]?$/,             // John1234, Mary8888a
  /^0x[a-fA-F0-9]{6,}/,                       // 0xDeAd1337
  /^[a-z]+_[a-z]+_\d{3,}$/i,                  // john_smith_42
];

// === Tier 2 中信号：+15 ===
const TIER2 = [
  /^[a-z]+\d{3,5}$/i,                         // crypto847
  /^[a-z]{6,}_\d{2,}$/i,                      // username_99
  /^_+[a-z]+_+$/i,                            // ___john___
  /^[a-z]+x[a-z]+\d*$/i,                      // tokenxhunter
];

// === NSFW Handle：+30（覆盖以上分数）===
const NSFW_HANDLE = [
  /(18plus|18\+|over18|adult|nsfw)/i,
  /(hot|sexy|naughty|spicy|kinky|horny|wet|thicc|busty)/i,
  /(babe|baby|kitten|wifey|mistress|princess|queen)\w*\d*$/i,
  /(daddy|dom|sub|milf|teen|cougar|sugar)(baby|girl|boy)?/i,
  /(onlyfans|fansly|chaturbate|cam(girl|boy))/i,
];

// === Crypto Handle：+20 ===
const CRYPTO_HANDLE = [
  /^(crypto|trade|trader|sol|btc|eth|0x|nft|defi|moon|pump|gem|degen|whale|alpha|ape|bull|bear)/i,
  /(signals|calls|gems|pumps|alpha)$/i,
  /^(elon|saylor|cz|vitalik)[_\d]+/i,         // 名人冒充
];

// === 反例保护 ===
// 用户名长度 > 18 字符 → 权重 ×0.5（自然人极少这么长）
// 用户名是常见词典词 + 短数字 → 权重 ×0.7（如 john1990 可能是生日）
```

### 3.2 A2_displayname_emoji_stuffing

```js
const emojiCount = countEmoji(displayName);

let score = 0;
if (emojiCount >= 4)  score = 18;
if (emojiCount >= 6)  score = 25;

// 特定 emoji 簇加成（取最高，不累加 A2 base）
const CRYPTO_EMOJIS = /[🔥💎🚀💰📈📊💸🌙⚡️🔋]/g;
const NSFW_EMOJIS   = /[🔞🍑🍆💋💦👅💄👙🩱]/g;
const SHILL_EMOJIS  = /[✅⚡️🎯🏆💯🆕🔝]/g;

const cryptoCount = (displayName.match(CRYPTO_EMOJIS) || []).length;
const nsfwCount   = (displayName.match(NSFW_EMOJIS) || []).length;

if (cryptoCount >= 2)  score = Math.max(score, 15);
if (nsfwCount   >= 1)  score = Math.max(score, 30);

// === 反例保护 ===
// 显示名含 CJK 字符且 emoji ≥ 4 → 权重 ×0.5（亚洲用户偏好）
if (/[一-鿿぀-ヿ가-힯]/.test(displayName)) score *= 0.5;
```

### 3.3 A3_verified_suspicious

```js
// 触发：有蓝标 AND（满足任一）：
//   - A1 username_pattern 命中 Tier1 or NSFW or Crypto handle
//   - A2 displayname_emoji ≥ 4 个
//   - 显示名含 t.me / linktr.ee / OnlyFans
//   - V2: followers < 500 且 created_at < 6 months

if (verified && (
    a1ScoreTier >= 'tier1' ||
    emojiCount >= 4 ||
    /t\.me|linktr\.ee|onlyfans/i.test(displayName)
)) {
  score += 22;
}
```

### 3.4 A4_default_avatar

```js
const avatarImg = article.querySelector('[data-testid="Tweet-User-Avatar"] img');
const isDefault = !avatarImg ||
                  avatarImg.src.includes('default_profile') ||
                  avatarImg.src.includes('sticker_default');

if (isDefault) score += 8;  // 单独低分，需要叠加其他信号
```

### 3.5 N1-N4 — **CN-NSFW-Bot 模块（新增，最高优先级）**

> ⚠️ **重要背景**：X 上对中文用户最泛滥的 spam 不是加密 shill，而是**色情引流 bot 农场**——它们把英文账号（@Maria + 长数字）买来，把显示名改成 `小薇🌸寻固炮🌸点击主页` 这种模板，推文只发纯 emoji（避开正文关键词过滤）。**显示名才是引流位**，过去版本完全忽略了。

#### N1. 显示名中文色情/引流关键词 — KILLER 级

```js
// === 显示名直接出现 CN NSFW 引流词 → +60，几乎一票否决 ===
const CN_NSFW_DISPLAYNAME_KILLER = [
  // 直接性引流
  /寻\s*[固找约]?\s*炮/,          // 寻炮 / 寻固炮 / 找炮 / 约炮
  /约\s*[炮p]/i,
  /炮\s*友/,
  /找\s*男\s*友/, /找\s*老\s*公/,
  /单\s*身\s*找/, /寂\s*寞\s*找/,

  // 引导点击型 CTA（强信号）
  /点[击我]?\s*主\s*页/,           // 点击主页 / 点我主页
  /[查看进]\s*主\s*页/,            // 查主页 / 看主页 / 进主页
  /[加联][微v]\s*[信VX]?/i,        // 加微 / 加V / 加VX
  /(私聊|私我|滴我|d我)\s*[有看]?/,

  // 色情资源关键词
  /(老\s*司\s*机|司\s*机)\s*带/,
  /资\s*源\s*[分有看]/,
  /(大\s*胆\s*[露漏]|露\s*出|抠\s*紧)/,
  /(嫩\s*妹|学\s*妹|空\s*姐|护\s*士)/,

  // 数字 + 引流暗示
  /\d+(岁|y)\s*[找寻约]/,
];

if (CN_NSFW_DISPLAYNAME_KILLER.some(r => r.test(displayName))) {
  score += 60;
  reasons.push('N1: CN NSFW keyword in display name');
}

// === 中等：暗示性词 +30 ===
const CN_NSFW_DISPLAYNAME_STRONG = [
  /(寂寞|无聊|空闲|在家)\s*([找想等])/,
  /(单身|想恋爱|想脱单)\s*\d*/,
  /(刺激|福利|你懂)\s*[的吧]/,
  /(等你|想你|来撩|来聊)/,
];

if (CN_NSFW_DISPLAYNAME_STRONG.some(r => r.test(displayName))) {
  score += 30;
}
```

#### N2. 显示名 emoji 分隔符模式

bot 农场的标志性视觉：用 emoji 做"竖线分隔符"把多段广告文字拼起来：

```
悦欣 🌸 寻固炮 🌸 点击主页
小薇 💕 23 💕 找老公
妹妹 ✨ 在家 ✨ 等你来
```

```js
// 检测 text + emoji + text + emoji + text 模式（≥3 段）
const SEPARATOR_EMOJIS = /[🌸💕✨🌺💖🌹🌷❤️💗💓💞🍑🔞⭐️🌙💫]/u;
const segments = displayName.split(SEPARATOR_EMOJIS).filter(s => s.trim().length > 0);

if (segments.length >= 3) {
  score += 35;
  reasons.push('N2: separator-pattern display name (3+ segments)');
}

// 加成：分隔符 emoji 数 ≥ 2 个且其中包含 🌸 / 💕 / 🔞（典型 bot 模板）
const segEmojiCount = (displayName.match(SEPARATOR_EMOJIS) || []).length;
if (segEmojiCount >= 2 && /[🌸💕🔞🍑]/u.test(displayName)) {
  score += 10;
}
```

#### N3. 显示名 + 用户名语种错位（bot 农场关键指纹）

bot 农场的最强特征：买来一批英文名 + 长数字 handle 的老账号，改显示名为中文引流模板。**正常人极少出现这种组合**。

```js
const hasCJKDisplayName = /[一-鿿]/.test(displayName);
const isWesternHandlePlusDigits = /^[A-Z][a-z]{2,10}\d{6,}$/.test(handle);  // Maria554548731

if (hasCJKDisplayName && isWesternHandlePlusDigits) {
  score += 30;
  reasons.push('N3: CJK display name + Western handle+digits (bot farm)');
}

// 反向也算（虽然少见）：英文显示名 + 中文拼音 handle + 长数字
const hasCJKHandle = /[一-鿿]/.test(handle);  // X 现在允许 CJK handle
if (!hasCJKDisplayName && hasCJKHandle && /\d{4,}/.test(handle)) {
  score += 15;
}
```

#### N4. 推文纯 emoji 多行结构

截图里的推文：
```
👆💁          ← 第一行：指向头像/显示名
🍀            ← 第二行：暗示性 emoji
🍾🍓☀️       ← 第三行：装饰 emoji
```

```js
// 移除 emoji 和空白后还剩什么？
const stripped = text.replace(/[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\s\n]/gu, '');

if (stripped.length === 0 && text.trim().length >= 3) {
  // 纯 emoji 推文
  const emojiCount = countEmojiCodepoints(text);
  const lineCount = text.split('\n').filter(l => l.trim()).length;

  if (lineCount >= 3 && emojiCount >= 5) {
    score += 40;
    reasons.push('N4: multi-line pure emoji post');
  } else if (emojiCount >= 3) {
    score += 25;
    reasons.push('N4: pure emoji post');
  }

  // 起始 emoji 是 👆/👇/👈/👉/☝️（指向 CTA）
  if (/^[👆👇👈👉☝️🔝]/u.test(text.trim())) {
    score += 15;
    reasons.push('N4: pointing-arrow emoji prefix');
  }
}
```

#### N1-N4 模块组合加成

四个信号联合命中时，额外 +20（这就是典型 bot 农场画像）：

```js
if (N1_hit && N3_hit) bonus += 15;          // 显示名 NSFW + 语种错位
if (N2_hit && N4_hit) bonus += 15;          // 分隔符显示名 + 纯 emoji 推文
if (N1_hit && N2_hit && N3_hit) bonus += 25;  // 三件套全中（截图里的标准画像）
```

---

### 3.6 修复：A2 显示名 emoji 减权 bug

> ⚠️ **原 §3.2 的 BUG**：原规则对"显示名含 CJK 字符 + emoji ≥ 4"做 ×0.5 减权，理由是"亚洲用户偏好"。**但这恰好保护了 CN bot 农场**——它们的显示名几乎全是 CJK + emoji。

**修复后逻辑**：CJK 减权只在 **emoji 是装饰性、非分隔符模式** 时生效。

```js
// 原 A2 代码：
const emojiCount = countEmoji(displayName);
let a2score = 0;
if (emojiCount >= 4)  a2score = 18;
if (emojiCount >= 6)  a2score = 25;
// ... 特定 emoji 簇加成 ...

// === 修复点：CJK 减权的条件收紧 ===
if (/[一-鿿]/.test(displayName)) {
  // 只有当不是分隔符模式 + 不含 NSFW emoji 时才减权
  const segments = displayName.split(SEPARATOR_EMOJIS).filter(s => s.trim());
  const hasNsfwEmoji = NSFW_EMOJIS.test(displayName);
  if (segments.length < 3 && !hasNsfwEmoji) {
    a2score *= 0.5;   // 真·亚洲用户保护
  }
  // 否则不减权（bot 农场不享受保护）
}

score += a2score;
```

### 4.1 B1_crypto_shill — 加密币吹嘘

```js
// === 致命级 KILLER：+50 each（叠加上限 +50）===
const CRYPTO_KILLER = [
  /\b\d{2,4}00x\b/i,                              // 100x, 1000x, 10000x
  /0x[a-fA-F0-9]{40}\b/,                          // 以太坊合约地址
  /\bpump\.fun\/[a-zA-Z0-9]{20,}/,                // pump.fun 链接
  /\bdexscreener\.com\/[a-z]+\/0x[a-fA-F0-9]+/i,  // dexscreener 链接
];

// === 强信号 STRONG：+18 each（叠加上限 +36）===
const CRYPTO_STRONG = [
  /\bmoonshot\b/i, /\bape\s+in\b/i, /\b(buy|ape|get\s+in)\s+(now|fast|quick|asap)\b/i,
  /\bgem\b\s+(found|alert|spotted)/i, /\bnext\s+(\$?\w+|big\s+thing)\b/i,
  /\b(send|pump)\s+it\b/i, /\bdon[''']?t\s+miss\b/i,
  /\b(presale|fair\s+launch|stealth\s+launch)\b/i,
  /\blow\s*cap\s+(gem|play|alpha)/i,
  /\bx\s+(100|1000)\b/i,                          // x100, x1000
  /\b(dm|message)\s+(me\s+)?for\s+(alpha|signal|call)/i,
];

// === 中信号 MEDIUM：+8 each（叠加上限 +24）===
const CRYPTO_MEDIUM = [
  /\bto\s+the\s+moon\b/i, /\bwagmi\b/i, /\bngmi\b/i, /\blfg\b/i,
  /\bdiamond\s+hands?\b/i, /\bdegen(s)?\b/i,
  /\bairdrop\b/i, /\bICO\b/, /\bIDO\b/, /\bIEO\b/,
  /\b\$\$\$\b/, /\b\d+\s*x\s+(returns?|gains?)\b/i,
];

// === $TICKER 模式 ===
// $XXX (2-8 大写字母) → +6
// 但若是主流币 ($BTC $ETH $SOL $DOGE $XRP $ADA $BNB $USDT $USDC) → +0
const TICKER_WHITELIST = new Set(['BTC','ETH','SOL','DOGE','XRP','ADA','BNB','USDT','USDC','LTC','TON']);
const tickers = [...text.matchAll(/\$([A-Z]{2,8})\b/g)].map(m => m[1]);
for (const t of tickers) {
  if (!TICKER_WHITELIST.has(t)) score += 6;
}

// === Combo: 多 ticker 灌水 ===
if (tickers.filter(t => !TICKER_WHITELIST.has(t)).length >= 3)  score += 12;
```

### 4.2 B2_nsfw_keywords — 色情引流

```js
// === KILLER：+50（一击致命）===
const NSFW_KILLER = [
  /\bcheck\s+(my|the)\s+bio\b/i,
  /\blink\s+(in|on)\s+(my\s+)?bio\b/i,
  /\bbio\s+link\b/i,
  /\b(open|slide\s+in(to)?)\s+(my\s+)?dms?\b/i,
  /\bdm\s+(me\s+)?(for|baby|daddy)\b/i,
  /\b(onlyfans|fansly|chaturbate)\b/i,
  /\b(OF|0F)\s+(link|account|girl)/i,
  /\b18\+\s*(only|content)/i,
  /\bspicy\s+(content|pics?|vids?)\b/i,
];

// === STRONG：+25 ===
const NSFW_STRONG = [
  /\b(horny|wet|tight|naked|nude)\s+(rn|now|tonight)\b/i,
  /\b(daddy|baby)\s+(i|me|please|need)\b/i,
  /\bshow\s+(me\s+)?(your|my)\s+(feet|tits|cock|ass)\b/i,
  /\bsugar\s+(daddy|baby|momma)\b/i,
  /\b(cam|webcam)\s+(girl|boy|model|show)\b/i,
];

// === Emoji combo：+20 ===
// 任意两个 NSFW emoji 同时出现
const NSFW_EMOJI_CLUSTERS = /[🔞🍑🍆💋💦👅👙🩱].*[🔞🍑🍆💋💦👅👙🩱]/u;
if (NSFW_EMOJI_CLUSTERS.test(text))  score += 20;

// 配 4.1 的 emoji 列表注意区分语境
```

### 4.3 B3_cn_marketing — 中文营销/灰产

```js
// === KILLER：+30 ===
const CN_KILLER = [
  /返佣(\d|高|无限)/, /撸毛/, /撸空投/, /薅羊毛/, /躺赚/,
  /月入[一二三四五六七八九十0-9]+(刀|美金|万|w|k)/, 
  /日(入|赚)[0-9]+/,
  /(财富|金钱)\s*自由/, /被动收入/,
];

// === STRONG：+18 ===
const CN_STRONG = [
  /代付/, /副业/, /搬砖/,
  /教程\s*(免费|私聊|私我|发你)/, 
  /(加|联系)\s*(微信|VX|TG|电报|纸飞机|telegram)/i,
  /交易所\s*(返佣|开户|福利|奖励)/, 
  /拉新/, /拉人/, /推广员/,
];

// === MEDIUM：+10 ===
const CN_MEDIUM = [
  /空投/, /干货/, /工具站/, /AI\s*变现/, /资料\s*领取/,
  /翻墙/, /加速器/, /机场/, /节点/,
  /(私聊|私信)\s*我/, /上岸/, /翻身/,
];

// === 短链 + 中文营销词 combo：+15 ===
if (CN_STRONG.some(r => r.test(text)) && /t\.me|bit\.ly|tinyurl/i.test(text)) {
  score += 15;
}
```

### 4.4 B4_excessive_emoji

```js
const emojiCount = countEmojiCodepoints(text);     // \p{Emoji_Presentation} 严谨数法
const textLen = [...text].length;

if (textLen < 5) return;  // 太短不算
const ratio = emojiCount / textLen;

if (ratio >= 0.30 && textLen >= 10)  score += 15;
if (ratio >= 0.50)                    score += 25;
if (emojiCount >= 5 && textLen <= 60) score += 10;

// 纯 emoji 推文（textLen >= 3）：+20
if (text.replace(/[\p{Emoji}\s]/gu, '').length === 0 && textLen >= 3)  score += 20;
```

### 4.5 B5_excessive_hashtag

```js
const hashtagCount = (text.match(/#[\w一-鿿]+/g) || []).length;

if (hashtagCount >= 4)  score += 10;
if (hashtagCount >= 7)  score += 20;
if (hashtagCount >= 10) score += 30;
```

### 4.6 B6_link_density

```js
// 只数外链
const externalLinks = [...article.querySelectorAll('a[role="link"]')]
  .filter(a => a.href && !a.href.includes('x.com') && !a.href.startsWith('/'));

const shortlinkDomains = ['t.me', 'bit.ly', 'tinyurl.com', 'cutt.ly', 'linktr.ee', 'lnkd.in', 'shorturl.at', 'rebrand.ly'];

let linkScore = 0;
for (const link of externalLinks) {
  if (shortlinkDomains.some(d => link.href.includes(d))) linkScore += 12;
  else                                                    linkScore += 4;
}

const wordCount = text.trim().split(/\s+/).length;
if (wordCount < 15 && externalLinks.length >= 1)  linkScore += 8;

score += Math.min(linkScore, 25);  // 上限
```

### 4.7 B7_engagement_bait

```js
const BAIT_PATTERNS = [
  /\bRT\s+(if|for)\s+(you\s+)?(agree|want)/i,
  /\blike\s+(if|for|this)\s+(you|to)\b/i,
  /\brepost\s+(if|this|to)\b/i,
  /\b(comment|reply)\s+(yes|no|below|with)\b/i,
  /\b(tag|follow)\s+(a\s+friend|me|3|5)\b/i,
  /\bdrop\s+(a|your)\s+\w+\s+(below|here)\b/i,
  /\bguess\s+(the|what)\b.*\?$/i,                 // "Guess what?"
  /\b(open|click)\s+the\s+link\b/i,
];

if (BAIT_PATTERNS.some(r => r.test(text)))  score += 15;
```

### 4.8 B8_low_info_reply — **V1 默认关**

仅当是 reply 时评估。识别率不够，避免默认开启误伤热情回复。

```js
const GENERIC_PRAISE = [
  /^(great|amazing|awesome|excellent|wonderful|fantastic|incredible|powerful|fire)\s+(post|thread|take|point|insight|content)\.?!?$/i,
  /^(100%|totally|absolutely|completely)\s+(agree|this|right|true)\.?!?$/i,
  /^well\s+said\.?!?$/i,
  /^this[\s.!]*$/i, /^facts?[\s.!]*$/i, /^based[\s.!]*$/i, /^💯+$/,
  /^(gold|fire|chef.?s\s+kiss)\b/i,
  /^(love|need)\s+this\s*[!.]*$/i,
  /^so\s+(true|good|real)\s*[!.]*$/i,
];

// 纯 emoji 短回复
if (/^[\p{Emoji}\s]+$/u.test(text) && text.length < 25)  score += 20;

// 通用赞美短回复
if (GENERIC_PRAISE.some(r => r.test(text.trim())) && text.length < 50)  score += 15;

// 极短无名词
const hasContentNoun = /\b[a-z]{5,}\b/i.test(text);
if (text.length < 20 && !hasContentNoun)  score += 10;
```

---

## 5. 上下文信号

### 5.1 C1_topic_mismatch（V1 仅 crypto-on-non-crypto）

```js
// 仅在用户当前在某个推文详情页时启用
const isReply = !!article.querySelector('[id^="id__"][aria-labelledby*="Replying"]');
if (!isReply) return;

const parentText = getParentTweetText();  // 详情页的主推文
const parentIsCrypto = /\b(crypto|btc|bitcoin|eth|ethereum|sol|solana|defi|nft|web3|token|airdrop|stake|mining)\b/i.test(parentText);
const thisIsCrypto  = /\b(crypto|btc|eth|\$[A-Z]{2,8}|pump|moon|gem|degen|ape|presale|moonshot)\b/i.test(text);

if (!parentIsCrypto && thisIsCrypto)  score += 25;
```

### 5.2 C2_farming_position

```js
const parentEngagement = getParentEngagementCount();  // 主推 likes + RTs + replies

if (parentEngagement > 10_000  && isReply && !isFollowed)  score += 8;
if (parentEngagement > 100_000 && isReply && !isFollowed)  score += 12;
```

### 5.3 C3_repeated_author_in_thread

```js
// 跨推文聚合：1 秒滑窗内同一作者在同一回复线程出现次数
const author = data.author;
const threadId = getCurrentThreadId();
const count = threadAuthorCount.increment(threadId, author);

if (count >= 3)  score += 20;
```

---

## 6. 保护信号（减分）

### 6.1 D1_is_followed — `-100`

```js
const followingSet = new Set(storage.followingList);
if (followingSet.has(authorHandle))  score -= 100;
```

**首次抓取**：
- 首次启动后，popup 提示 "请打开你的 Following 页一次以同步关注列表"
- 用户访问 `x.com/{me}/following` 时，content script 自动扫描所有 `[data-testid="UserCell"]` 抓 handle，存 storage
- 之后每访问该页都增量同步

### 6.2 D2_interacted_recently — `-50`

```js
// 监听用户行为
const RECENT_DAYS = 30;
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-testid="like"], [data-testid="reply"]');
  if (!target) return;
  const article = target.closest('article[data-testid="tweet"]');
  if (!article) return;
  const author = extractAuthor(article);
  recentInteractions.set(author, Date.now());
});

// 评分时
const lastInteract = recentInteractions.get(authorHandle);
if (lastInteract && (Date.now() - lastInteract) < RECENT_DAYS * 86400_000) {
  score -= 50;
}
```

### 6.3 D3_whitelisted — skip

```js
if (whitelist.has(authorHandle))  return 'show';  // 跳过所有评分
```

---

## 7. 硬规则（一票否决 = 100 分）

满足任一直接 HIDE：

```js
const HARD_RULES = [
  // R1: 合约地址 + 不在加密话题
  (d) => /0x[a-fA-F0-9]{40}/.test(d.text) && !isCryptoContext(d.parentText),

  // R2: NSFW handle + NSFW keyword
  (d) => matchesAny(d.username, NSFW_HANDLE) && matchesAny(d.text, NSFW_KILLER),

  // R3: pump.fun 链接 + 是回复
  (d) => /pump\.fun\/[a-zA-Z0-9]{20,}/.test(d.text) && d.isReply,

  // R4: 显示名含 OnlyFans/Fansly + 是回复（不管验证状态）
  (d) => /onlyfans|fansly|chaturbate/i.test(d.displayName) && d.isReply,

  // R5: 黑名单
  (d) => blacklist.has(d.username),

  // R6: 显示名是 4+ 个 NSFW emoji
  (d) => (d.displayName.match(NSFW_EMOJIS) || []).length >= 4,

  // === 以下为本次新增（CN-NSFW-Bot 模块） ===

  // R7: 显示名含 "寻炮/约炮/点击主页/找男友/老司机" 等 CN NSFW killer keyword
  //     → 不管推文内容、不管验证状态，直接 HIDE
  (d) => CN_NSFW_DISPLAYNAME_KILLER.some(r => r.test(d.displayName)),

  // R8: 显示名 emoji 分隔符模式（≥3 段）+ handle 是英文+长数字
  //     → 典型 bot 农场指纹
  (d) => {
    const segments = d.displayName.split(SEPARATOR_EMOJIS).filter(s => s.trim());
    const westernPlusDigits = /^[A-Z][a-z]{2,10}\d{6,}$/.test(d.handle);
    return segments.length >= 3 && westernPlusDigits;
  },

  // R9: 显示名含 CJK + handle 是英文+长数字 + 推文纯 emoji
  //     → 即便没有引流关键词，三件套同时出现也是 100% bot
  (d) => /[一-鿿]/.test(d.displayName)
      && /^[A-Z][a-z]{2,10}\d{6,}$/.test(d.handle)
      && d.text.replace(/[\p{Emoji}\s\n]/gu, '').length === 0
      && d.text.trim().length >= 3,

  // R10: 显示名含 微信/V信/加V/TG/电报 引流符号 + 是回复
  (d) => /(加\s*[VvＶ微])|(加\s*[Tt][Gg])|(电\s*报|纸\s*飞\s*机)/.test(d.displayName) && d.isReply,
];
```

---

## 8. 组合加成 Combo Bonus

某些信号集体出现时额外加分（避免单点漏判）：

```js
// Combo 1：crypto 三件套 +15
if (B1_hit && (A2_hit || B4_hit) && B6_hit) bonus += 15;

// Combo 2：NSFW 全武装 +20
if (matchesAny(username, NSFW_HANDLE) && B2_hit && A3_hit) bonus += 20;

// Combo 3：CN marketing + 短链 +12
if (B3_hit && hasShortlink) bonus += 12;

// Combo 4：filler + farming +10
if (B8_hit && C2_hit) bonus += 10;

// Combo 5：新号 + 高频回复 +15（V2 需 account age）
if (accountAge < 30_days && C3_count >= 2) bonus += 15;
```

---

## 9. 完整推算示例（默认设置下）

### 示例 A：crypto shill

```
@cryptoking_88472  [无蓝标，无关注，无互动]
"$PEPE going 1000x next week 🚀🚀🚀 buy now t.me/cryptoking 🔥💎"
```

| 信号 | 命中详情 | 加分 |
|---|---|---|
| A1 | `name+5digits` Tier 1 | +25 |
| A4 | 假设默认头像 | +8 |
| B1 | `1000x` KILLER (50) + `buy now` STRONG (18) + `$PEPE` (6) = 74，但 STRONG 上限 36 | +50+18+6 = **+74**（实际取 +60，KILLER 上限） |
| B4 | 5 emoji / 60 chars = 8% ratio + count≥5 | +10 |
| B6 | t.me 短链 +12，短文 +8 | +20 |
| Combo 1 | crypto + emoji + shortlink | +15 |
| **finalScore** | | **= 128** |

→ ≥ 70，**HIDE** ✅

### 示例 B：NSFW（英文）

```
@Maria_hot_18  [蓝标]
"check my bio 🔥💋 daddy"
```

→ **R2 硬规则**：NSFW handle + NSFW killer → **= 100 HIDE** ✅

### 示例 B+：**CN bot 农场（截图实例，最严重的漏洞）**

```
@Maria554548731  [无蓝标，无关注]
displayName: "悦欣🌸寻固炮🌸点击主页"
text: "👆💁\n🍀\n🍾🍓☀️"
```

| 信号 | 命中详情 | 加分 |
|---|---|---|
| **R7 硬规则** | 显示名含 `寻固炮` AND `点击主页` 双 killer | **= 100 (HIDE)** ✅ |

或者，即便绕过 R7（比如换种说法）：

| 信号 | 命中详情 | 加分 |
|---|---|---|
| N1 | 显示名 `寻固炮` killer | +60 |
| N1 | 显示名 `点击主页` killer | (同 N1 不累加，取 max) |
| N2 | 分隔符 `🌸...🌸...🌸` 3 段模式 | +35 |
| N3 | CJK 显示名 + Western handle + 8 位数字 | +30 |
| N4 | 多行纯 emoji 推文（3 行）+ 👆 起始 | +40 + 15 = +55 |
| A1 | username `Maria + 9 digits` Tier1 | +25 |
| Combo (N1+N2+N3) | 三件套 bot 农场画像 | +25 |
| **finalScore** | | **= 230** |

即使没有 R7 硬规则，多信号叠加也是远超阈值 **HIDE** ✅。

### 示例 B++：bot 农场变种（推文是真有文字的情况）

```
@John9437251280
displayName: "小薇💕23💕在家找老公"
text: "好无聊，今晚想找人聊天 想认识你 dm me"
```

| 信号 | 加分 |
|---|---|
| R7 | 显示名含 `找老公` killer | **= 100 (HIDE)** ✅ |

### 示例 C：合法币圈用户（保护）

```
@my_friend  [我关注的]
"$BTC 突破 10 万，这波牛市稳了 🚀"
```

| 信号 | 加分 |
|---|---|
| D1 is_followed | **-100** |
| B1 | $BTC 白名单 (0) + 无 KILLER/STRONG | 0 |
| B4 | 1 emoji / 18 chars | 0 |
| **finalScore** | **= -100** → SHOW ✅ |

### 示例 D：临界（应触发诊断模式提醒）

```
@randomguy_2024  [无蓝标]
"This thread is fire 🔥💯 100% agree with everything"
```

| 信号 | 加分 |
|---|---|
| A1 | `name_year` 中等模式 | +15 |
| B4 | 2 emoji / 50 chars | 0 |
| B8 | "100% agree" + "thread is fire" 通用赞美（V1 默认关）| 0 |
| **finalScore** | **= 15** → SHOW |

若用户开启 B8：+15+15 = 30 还是 SHOW（标准模式）。激进模式（≥55）也 SHOW。

→ 这就是为什么 AI filler V1 默认关——单条难判，需 V2 模型 + 自学习。

---

## 10. 用户首次安装流程

```
安装 → 弹出 popup（首次自动）
   │
   ├─ 介绍卡片：「TweetGuard 会安静地隐藏 X 上的垃圾号回复。」
   │
   ├─ Step 1: 同步关注列表
   │     [打开我的 Following 页] → 自动抓取
   │
   ├─ Step 2: 选择模块
   │     [✅] NSFW 引流号
   │     [✅] 加密币 shill
   │     [✅] 中文营销/灰产号
   │     [✅] 互动诱饵
   │     [⬜] AI 灌水（识别率有限，推荐 V2 启用）
   │
   ├─ Step 3: 首次使用建议
   │     "建议先在【诊断模式】使用 24 小时，确认无误伤后切换到无感模式"
   │     [开启诊断模式] [直接进入无感模式]
   │
   └─ 完成
```

---

## 11. 规则更新策略

V1 规则内置在扩展包里，跟随扩展版本更新。

V2 引入"规则订阅"——类似 uBlock filter list：
- 内置规则集 `tweetguard-default.json`
- 可选订阅：`tweetguard-cn-marketing.json` / `tweetguard-nsfw-aggressive.json` / 用户社区规则
- 每 24h 拉取一次（如有更新）

V3 用户互投：被多个用户标记 hide 的同一个号，自动并入云端共享黑名单（opt-in）。
