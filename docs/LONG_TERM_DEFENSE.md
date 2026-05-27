# TweetGuard 长期防御架构

> 配套：[DEFAULT_RULES.md](DEFAULT_RULES.md) / [DETECTION_LOGIC.md](DETECTION_LOGIC.md)
> 这份文档回答："规则会被绕过怎么办？长期怎么打？"

---

## 零、问题本质：这是一场不对称战争

### 0.1 为什么纯规则注定失败

```
我们写规则的速度  ≈  1 条 / 天   （还要测试、不能误伤、要发版）
bot 改套路的速度  ≈  10 次 / 天  （换词、换 emoji、换模板，零成本）
```

这是**结构性劣势**。规则的根本问题：

1. **规则是可枚举的**——bot 运营方读一遍我们的开源代码就知道全部 keyword
2. **规则是离散的**——改一个字符就失效（`寻固炮` → `寻 固 炮`）
3. **规则是滞后的**——总在 bot 之后跟进
4. **维护是手动的**——靠我一个人写规则 = 项目早晚死

**信号的"易伪造度"决定它的寿命**：

| 信号类型 | 伪造成本 | 寿命 | 例 |
|---|---|---|---|
| 关键词字面 | 几乎为零 | 7-30 天 | 寻固炮 → 寻 固 炮 |
| 显示名模板 | 低 | 30-90 天 | 改分隔符 emoji |
| Handle 正则 | 低 | 季度级 | 换用户名生成器 |
| 内容主题分布 | 中 | 半年 | 改用真人 GPT 改写 |
| **发帖时序模式** | **高** | **年级** | bot 一定有自动化痕迹 |
| **社交图谱位置** | **极高** | **年级** | 真人粉丝难造 |
| **跨账号协同模式** | **极高** | **年级** | 同操盘手必有指纹 |
| **群体共识（多用户标记）** | **极高** | **永久** | 1000 个用户的判断对手无法 fake |

**结论**：我们必须把核心防御建立在表格下半部分的信号上。规则是 L0 兜底，不是主力。

### 0.2 长期可持续的两个必要条件

1. **信号自更新**——不靠维护者写规则，靠系统从数据里学
2. **数据飞轮**——用户越多 → 标签越多 → 模型越准 → 用户更多

**没有飞轮的反 spam 工具不可持续**。这是 Gmail / Akismet / uBlock 的共同生存逻辑。

---

## 一、Defense in Depth 五层架构

```
┌──────────────────────────────────────────────────────────────┐
│  L0  规则引擎（rules）                  即时 / 90% 显性 spam   │
│      - 17 信号 + 硬规则                  ← V0 已落地           │
│      - 用户可见配置                                            │
│      - 维护：开源社区 + 用户自定义                             │
├──────────────────────────────────────────────────────────────┤
│  L1  本地小模型（local ML）             ~10ms / 灰区精判       │
│      - 文本分类器 + embedding 相似度                          │
│      - 训练数据：L0 + L2 + L4 反馈                            │
│      - WebGPU / WASM 运行                                     │
│      - 仅对评分灰区调用，不影响主路径                          │
├──────────────────────────────────────────────────────────────┤
│  L2  社区共识（crowd signal）           异步 / 真正的"网络效应"│
│      - 匿名上报 hide/whitelist 行为                           │
│      - 服务端聚合 → block_rate per account                    │
│      - 订阅式 filter list（uBlock 模式）                      │
│      - opt-in，隐私优先（k-匿名 + 差分隐私）                  │
├──────────────────────────────────────────────────────────────┤
│  L3  行为指纹（behavioral）             浏览时被动收集          │
│      - 发帖频率、时序、回复延迟分布                           │
│      - 跨线程出现模式（同 bot 多次出现）                       │
│      - 头像感知哈希（pHash）识别盗图                          │
│      - V2+：GraphQL 拦截补齐 account_age 等                   │
├──────────────────────────────────────────────────────────────┤
│  L4  个人化学习（personal）             你的 TweetGuard 越用越懂你 │
│      - 用户每次 hide/whitelist/like 是标签                    │
│      - 本地 logistic regression 调权重                        │
│      - 个性化阈值                                              │
│      - 数据永不离开本地（除非用户 opt-in 上报到 L2）          │
└──────────────────────────────────────────────────────────────┘
```

**关键洞察**：单独看每一层都可被绕过；五层叠加的概率乘积让 bot 的"评估-迭代"成本指数级上升。

---

## 二、L1 本地 ML：从规则到表征学习

### 2.1 为什么这层关键

规则是"显式特征匹配"——必须提前枚举所有可能的引流话术。
ML 是"隐式表征学习"——从样本里学到"这种东西看起来像 spam"的概念。

举例：
- 规则：必须列出 `寻炮 / 约炮 / 找男友 / 老司机 / 资源 / ...`
- 模型：看过 1000 个引流号显示名后，对 `寻緣分` `等真心人` `老乡介绍` 这些 **从未见过但同分布的新词** 自动归类

### 2.2 技术选型

**模型**：fine-tuned multilingual DistilBERT（66M 参数，量化后 ~30MB）
- 备选：MiniLM-L6-multilingual（22M，~12MB）—— 更轻
- 输入：`[displayName] [SEP] [tweetText]`（拼接两个最强字段）
- 输出：3 分类 `{normal, suspicious, spam}` + 置信度

**运行环境**：Transformers.js + WebGPU（fallback WASM）
- WebGPU：~5ms/inference（M1 Mac 实测）
- WASM：~30-80ms/inference
- 都在 Web Worker，不阻塞主线程

**调用策略**：
```
L0 规则评分 → 如果分数在灰区 [40, 70) → 调用 L1 模型
            → 否则直接走 L0 决策
```

99% 的推文不需要进 L1（要么明显垃圾、要么明显正常），所以平均开销 ≈ 0.5ms/条。

### 2.3 训练数据从哪来

**Bootstrap 阶段（V1）**：
- 我手工标注 5000 条样本（2 周工作量）
- L0 高置信度命中作为弱标签（10w+ 自动标签）
- 公开数据集：TweepFake / TwiBot-22 等学术数据

**自维护阶段（V2+）**：
- 用户行为反馈（L4 → 训练数据）
- L2 社区高一致度标签
- Active learning：模型最不确定的样本浮到 UI 让用户判定

**每月定期再训练 + 发版**——这是关键的"鲜度"机制。规则发版可能要等好几周（怕误伤），但模型再训练用真实数据，自然适配新 spam 形态。

### 2.4 对抗 bot 演化的关键设计

**Embedding-space defense**：
- 把每条 spam 的 displayName+text 编码成 768 维向量
- 维护一个 "known bot cluster" centroid 集合（k-means k=50）
- 新推文判断：到最近 cluster centroid 的距离 < 阈值 → spam
- bot 改字面但不改"引流意图"，向量距离依然近

这是规则替代不了的。bot 可以把"寻固炮"换成"寻緣分"，但语义向量依然落在引流 cluster 里。

---

## 三、L2 社区共识：唯一真正的长期护城河

### 3.1 为什么这是命脉

单个用户判断 spam 的速度 < bot 出新变种的速度。
**群体判断的速度 > bot 出新变种的速度。**

这是 Gmail 反 spam、uBlock filter list、Akismet 都验证过的核心机制。**没有这一层，TweetGuard 永远是个跟跑的工具。有了这层，攻防关系彻底反转**。

### 3.2 数据流（隐私优先设计）

```
用户在 TweetGuard 内点击 hide / whitelist
    │
    ▼
本地立刻应用（不需等服务器）
    │
    ▼
打包事件（opt-in 用户）：
    {
      account_handle_hash: sha256(handle)[:8],   // 前 8 字节，碰撞容忍
      action: "hide",
      reason_tags: ["N1", "N3"],                 // 命中的信号 ID
      ts: today (精度只到天，不到秒)
    }
    │
    ▼
批量上报（每天一次，聚合 1 包）
    │
    ▼
服务端聚合：
    - 每个 hash 累计 hide/show 计数
    - 计算 block_rate = hides / (hides + shows + 1)
    - 应用 k-匿名：少于 50 次上报的 hash 不发布
    - 差分隐私噪声：±5% 计数扰动
    │
    ▼
生成 filter list（每日更新）：
    [
      { hash: "a3f9b21c", block_rate: 0.94, n: 8421 },
      ...
    ]
    │
    ▼
所有 TweetGuard 客户端订阅
    │
    ▼
本地命中：sha256(@handle)[:8] 查表 → block_rate > 0.7 加分 +40
```

### 3.3 为什么这种设计能扛得住攻击

**Sybil 攻击防御**：
- 单个用户上报权重很低，需要 50+ 独立设备同方向才会进 filter list
- 频率限制：每个匿名 ID 每天上报上限
- Sanity check：上报 hash 必须能从该设备 IP 段的"自然浏览速率"中合理产生

**Bot 反向投毒防御**（bot 大量上报"good"洗白自己）：
- 上报需带 Proof of Browse Time（在 X 停留时间证明）
- 异常账号自动权重降为 0
- 内部 ground truth set 持续监控（如果某个新 vote 让已知 bot 评分骤降，告警）

**隐私保护**：
- 上报 hash 而非明文 handle（防止反向枚举谁被谁屏蔽）
- 8 字节哈希 = 故意保留碰撞（plausible deniability）
- 不收集 IP、设备指纹、用户标识
- 用户可一键关闭上报，但仍可订阅 filter list（不对称交易）

### 3.4 filter list 订阅模型

参考 uBlock 的成功设计：

```yaml
subscriptions:
  - tweetguard-core              # 官方默认，每日更新
  - tweetguard-cn-spam            # 中文垃圾专门 list
  - tweetguard-crypto-shill       # 加密 shill 专门 list
  - some-community-curator/list   # 第三方维护者
```

每个 list 是 Cloudflare R2 上的 JSON，CDN 分发，零鉴权。用户可以 fork 自建。

**这把 TweetGuard 变成了平台而非产品。** 维护成本从"我一个人"变成"全球用户协作"。

---

## 四、L3 行为指纹：bot 留不下来的痕迹

### 4.1 关键观察

bot 必然自动化，自动化必然规律。规律即是指纹。

我们能在用户浏览 X 时**被动收集**这些信号，无需任何特殊权限：

#### 4.1.1 发帖时序指纹

```js
// 拦截 UserTweets / TweetDetail GraphQL，记录看到的每条推文
recentTweetsBy[handle] = [
  { id, created_at, replied_to, has_media, len },
  ...
];

// 一旦同一作者出现 ≥ 10 次，计算时序特征：
const features = {
  postsPerHour: count / hoursSpan,
  varianceOfIntervals: std(intervals),     // 真人方差大，bot 方差小
  burstScore: longestBurst / totalSpan,    // bot 常爆发性发帖
  nightActiveRate: nightPosts / totalPosts // bot 不睡觉
};

if (features.varianceOfIntervals < 60s && features.postsPerHour > 5) {
  // 极度规律的高频发帖 → bot
  accountTrust[handle] -= 30;
}
```

**bot 几乎无法解决这个问题**——你随机化时序，发帖率就要降低，引流效率就下降，操盘成本就增加。

#### 4.1.2 跨线程出现模式

```js
// 一个用户的当前 session 中，记录每个作者在哪些 thread 里出现
authorAppearances[handle] = Set<threadId>;

// 如果同一 author 在 ≥ 5 个互不相关的 viral thread 中出现 → 引流 bot 特征
if (authorAppearances[handle].size >= 5
    && allThreadsAreUnrelated(authorAppearances[handle])) {
  accountTrust[handle] -= 40;
}
```

这是"灌水覆盖率"信号。真实用户不会在 10 个完全不同话题的爆款下都留言。

#### 4.1.3 头像感知哈希（pHash）

bot 必用盗图头像（动漫脸、网图美女）。同一张头像被多个账号使用 = bot 农场：

```js
async function hashAvatar(imgUrl) {
  const img = await loadImage(imgUrl);
  return perceptualHash(img);  // 64-bit pHash
}

// 本地维护 avatarHash → handle[] 映射
if (avatarToHandles.get(hash).size >= 3) {
  // 同一头像被 3+ 账号使用 → 一票 hide
  for (const h of avatarToHandles.get(hash)) accountTrust[h] = 0;
}
```

bot 反制的成本：每个账号必须用独占头像。盗图库的图就那么多。

#### 4.1.4 内容模板指纹

```js
// 抽象一条推文的"骨架"：剥离具体字符，保留结构
function templatize(text) {
  return text
    .replace(/[\p{Emoji}]+/gu, 'E')        // emoji → E
    .replace(/\d+/g, 'N')                  // 数字 → N
    .replace(/@\w+/g, '@')                 // mention → @
    .replace(/https?:\/\/\S+/g, 'L')       // 链接 → L
    .replace(/\s+/g, ' ')
    .trim();
}

// 同一 template 在 24h 内被 ≥ 10 个不同 author 使用 → 协同 bot
templateUsage[template].add({ author, ts });

if (templateUsage[template].uniqueAuthors >= 10 && timespan < 24h) {
  for (const author of templateUsage[template].authors) {
    accountTrust[author] -= 50;
  }
}
```

这是抓"操盘手"的方法。即便 bot 换具体词，操盘手分发的内容模板会暴露他们。

### 4.2 这些信号为什么 bot 难逃

对手要逃，必须：
- 让每个 bot 用独立头像 → 盗图成本变高
- 让发帖间隔自然 → 灌水效率降低
- 让每条内容结构不同 → 没法批量生产
- 让账号分散到不同话题 → 引流转化率降低

**对手每解一个，他们的盈利模型就被削弱一次。** 这就是好的防御信号——逼迫对手做不利于自己的让步。

---

## 五、L4 个人化学习：你的 TweetGuard 越用越懂你

### 5.1 概念

每个用户对 spam 的定义不同：
- 加密研究员觉得 $BTC 100x 是真讨论
- 普通用户觉得是垃圾

应该是每个用户的 TweetGuard 学到 ta 自己的判断。

### 5.2 实现：本地在线学习

每个用户的设备维护一个 logistic regression（或 small MLP）：

```
input:  各信号的 raw value（A1 score, B1 score, ..., L1 model output, L2 block_rate, ...）
output: hide / show 概率
weights: 用户专属
```

每次用户的显式动作（hide / whitelist / un-hide）就是一个训练样本：

```js
function onUserAction(article, action) {
  const features = extractAllSignals(article);
  const label = action === 'hide' ? 1 : 0;
  personalModel.train(features, label, learningRate=0.05);
}
```

模型权重存本地，永不上传。

### 5.3 用户体验上的体现

```
"TweetGuard 已经学到你的偏好"
- 你接受了 12 条加密推文，所以现在 crypto 信号权重 -30%
- 你 hide 了 3 个 AI 灌水回复，所以 AI filler 信号权重 +25%
- 当前你的个性化阈值：65（默认 70）
[查看详细] [重置]
```

这种"它在为我学习"的感受是高粘性来源。

### 5.4 冷启动问题

新用户没有标签数据，怎么用 L4？
- L4 初始权重 = L0 + L1 + L2 + L3 的默认值
- 前 30 天采集行为数据，不调权
- 30 天后启动个人化训练
- 给用户一个"激进训练模式"：刷 50 条推文逐条判断，快速 bootstrap

---

## 六、五层协同：FOUC 性能不受影响

担心：层数多了会不会卡？

**答**：层级是异步独立的，主路径只跑 L0。

```
推文进入 DOM (T1)
   │
   ├─ L0 规则评分（0.5ms 同步）→ 判决 → set data-tg-state
   │     │
   │     ▼
   │  浏览器 paint，无 FOUC
   │
   └─ 异步任务（不阻塞渲染）:
        ├─ 灰区 → L1 模型推理（Web Worker）→ 完成后可能改判 → 更新 data-tg-state
        ├─ L2 查询 block_rate（已在内存）→ 调整 score
        ├─ L3 累计行为指纹（仅记账）
        └─ L4 个人模型刷新（每 1 小时）
```

L1 改判会有"先显示然后消失"的小概率 FOUC，处理方案：
- 灰区推文默认 `data-tg-state="pending"` + `opacity: 0.85`（轻微暗示）
- L1 模型给出"spam"判断 → `data-tg-state="hide"` + 0.2s 淡出
- 用户感受到的是"逐渐消失的轻微淡化"，不是"突然出现又突然消失"

这个 UX 细节也写进 [PERFORMANCE_UX.md](PERFORMANCE_UX.md) 的更新里。

---

## 七、版本路线图（重新规划）

| 版本 | 时间 | 新增层 | 主要交付 | 用户感知 |
|---|---|---|---|---|
| **V0** | 3 周 | **L0** | 规则引擎 + 17 信号 + N1-N4 模块 + 硬规则 | 80% 显性 spam 被屏蔽 |
| **V1** | + 2 月 | **L1** | 本地 DistilBERT-tiny + Web Worker + 灰区调用 | 90% spam，含新变种 |
| **V2** | + 2 月 | **L2** | 匿名上报基础设施 + filter list 订阅模型 + 第一个公共 list | 95% spam，可订阅社区 |
| **V3** | + 3 月 | **L3** | 行为指纹（发帖时序 / 跨线程 / pHash / 模板）+ GraphQL 拦截 | 97% spam，难绕过 |
| **V4** | + 3 月 | **L4** | 个人化学习 + active learning UI | 99% 在用户视角准 |

### V1 → V2 → V3 是关键的"系统转型"

- **V0**：纯个人工具
- **V1**：智能个人工具
- **V2**：**网络效应启动**——这一步是死活分水岭
- **V3**：抗对抗成熟
- **V4**：体验成熟

**V2 启动失败 = 项目失败**。所以早期所有产品决策（隐私模型、UI 文案、引导流程）都要为 L2 opt-in 转化率服务。

---

## 八、关键技术与产品决策

### 8.1 L1 模型尺寸 tradeoff

| 选项 | 大小 | 准确率 | 推理速度 | 推荐 |
|---|---|---|---|---|
| 自训 logistic regression | < 1MB | ~75% | < 1ms | 灰区第一道 |
| MiniLM-L6-multilingual | ~12MB | ~88% | 10ms WASM / 3ms WebGPU | **V1 选这个** |
| DistilBERT-multilingual | ~30MB | ~92% | 30ms WASM / 8ms WebGPU | V2 升级 |
| 自训 spam-specific 小模型 | ~5MB | ~90% | 5ms WASM | V3 训练 |

V1 推荐 MiniLM——准确率/速度/包大小的最优解。

### 8.2 L2 服务端开销

- **存储**：每天聚合后约 100MB 的 block_rate 表
- **计算**：每日批处理 1 次，AWS Lambda 足够
- **分发**：Cloudflare R2 + CDN，全球延迟 < 50ms
- **预估成本**：1 万 DAU 时 < $20/月，10 万 DAU 时 < $200/月

商业化必要性在这里显现：L2 需要钱维护，Pro 订阅 + Cloudflare 免费层够用很长时间。

### 8.3 隐私的硬承诺

不可妥协的几条：
1. **L0/L1/L3/L4 完全本地**——零网络流量
2. **L2 必须 opt-in**——首次安装默认关闭，引导文案明确告知
3. **L2 上报内容不可逆**——只发哈希、行为、信号 ID，不发推文内容、不发完整 handle
4. **服务端零用户标识**——不存 IP、不存 cookies、不存 device fingerprint
5. **Public transparency**——上报协议公开，服务端代码开源

这是和"X/Twitter Spam Filter"那类不透明工具的本质区别，也是中文用户付费的关键说服点。

### 8.4 active learning 的 UI

用户的反馈是金子，但不能强迫用户标注。设计：

```
某天打开 popup，看到：
┌───────────────────────────────────────────┐
│ 帮 TweetGuard 学习（30 秒）              │
│                                            │
│ 这条推文是 spam 吗？                      │
│ ┌─────────────────────────────────────┐  │
│ │ @random_handle_92831                 │  │
│ │ "Amazing thread 🔥🔥🔥 totally based"│  │
│ │ 回复了一条 50k 互动的推             │  │
│ └─────────────────────────────────────┘  │
│                                            │
│ [是 spam]  [不是]  [跳过]                 │
│                                            │
│ 已标 3/10  下次再标 →                     │
└───────────────────────────────────────────┘
```

样本选择策略：
- 模型置信度最低的（不确定的最值钱）
- 用户实际看过但没操作的（隐式信号）
- 跨用户分歧大的（社区灰区）

每标 10 条解锁"高级权重设置"——给用户激励。

---

## 九、对抗演化的元策略

### 9.1 假设对手会主动针对我们

bot 运营方一定会做的事：
1. 装上 TweetGuard，看哪些被 hide，调整避绕
2. 注册马甲账号，反向上报"good"来洗白
3. 制造"误伤"内容（正常推文 + 微量 spam 模式），训练用户怀疑插件
4. 攻击服务端（DDoS L2 接口）

### 9.2 不变的真理：让对手攻击的边际成本高于他们的边际收益

具体策略：

**1. 信号冗余**——任何单一信号被绕过，其它信号能补上。bot 必须同时绕过 10+ 信号才能不被识别。

**2. 黑箱与白箱混合**
- L0 规则是开源（可信任，可审计）
- L1 模型权重不公开（增加对手探测成本）
- L2 算法公开，但具体阈值和噪声参数私有
- L3 行为指纹算法私有（最贵的护城河）

**3. Tarpit 设计**
- 对疑似 bot 的 hide 决策，故意有 5% 概率"延迟暴露"——bot 不能立即知道哪条被识别了
- 给恶意上报的设备分配一个 honeypot 命名空间，让他们以为投毒成功

**4. 持续监控**
- 维护一个"金标准 ground truth set"——内部团队持续手工标注的 5000 个明确 spam + 5000 个明确正常
- 每次模型更新、filter list 更新，先在 ground truth 上跑准确率
- 准确率骤降即告警

**5. 用户教育**
- 在产品 UI 里诚实告知"没有任何反 spam 系统能 100% 准"
- 提供诊断模式让用户验证决策依据
- 邀请用户成为 ground truth 标注者（精英用户激励）

### 9.3 永远的兜底：用户控制权

无论我们的算法多牛，最后一道防线永远是：

- **一键关闭整个插件**（瞬时恢复完整 X）
- **可视化"我隐藏了什么"**（信任建立）
- **导出我的全部数据 / 删除我的全部数据**（GDPR-style）
- **拒绝任何"自动学习"**（给保守用户）

让用户始终觉得"我在掌控"，比"算法很准"重要。

---

## 十、和现有 V0 规则的关系

**规则不被废弃，规则是 L0**。具体分工：

| 任务 | 由哪一层处理 |
|---|---|
| 拦截已知大规模 spam 模式（寻固炮等） | L0 规则（即时、便宜） |
| 处理新出现但变种轻微的 spam | L0 + L1 协同 |
| 处理深度伪装的新型 bot | L1 + L3 |
| 处理"我自己定义的 spam"（个人偏好） | L4 个人化 |
| 处理大规模 bot 农场（同操盘手数百号） | L2 + L3 协同 |
| 跨语言、跨文化的 spam | L1 多语言模型 + L2 本地 list |

L0 是地基，L1-L4 是楼层。地基必须有，但只有地基的房子住不了人。

---

## 十一、需要你拍板的战略问题

1. **L2 社区共识——做不做、什么时候做**？
   *推荐：V2 必做（不做没未来）。但 V0/V1 阶段把所有产品决策都为 V2 的 opt-in 转化率服务（先建立信任）。*

2. **服务端基础设施愿意投入多少**？
   *L2 需要后端。预估 1 万 DAU 时 $20/月，规模化后需要 Pro 订阅养。如果你坚持纯客户端，L2 改成 P2P/去中心化方案（更复杂、更长开发周期）。*

3. **开源 vs 闭源**？
   *推荐：L0 + L1 开源（建立信任）；L2 协议开源 + 服务端开源（透明度）；L3 行为指纹算法和 L4 训练流程闭源（护城河）。*

4. **是否做"操盘手识别"（L3 的最贵部分）**？
   *这需要长期跨 session 数据，必然涉及一些本地长期存储。隐私敏感用户可能不接受。可以默认关闭，给愿意的用户开。*

5. **active learning 体验是默认 opt-in 还是 opt-out**？
   *推荐 opt-in 但首次安装强引导。强迫标注会被卸载。*

6. **L1 模型多久重训一次 / 发版一次**？
   *推荐每月一次小更新，每季度一次大重训。模型放 Cloudflare R2 静态分发，用户透明拉取。*

---

## 附录：和其他领域的对照

| 领域 | L0 规则 | L1 ML | L2 社区 | L3 行为 | L4 个性化 |
|---|---|---|---|---|---|
| Gmail 反 spam | 关键词 | 神经网络 | 用户标 spam 按钮 | 发件人信誉 | 个人垃圾箱 |
| uBlock | filter 规则 | (无) | 订阅列表 | (无) | 用户自定 |
| Akismet | 黑名单 | 贝叶斯 | 全平台标注 | IP 信誉 | (无) |
| TweetGuard | 17 信号 | DistilBERT | 共享 block list | 时序+pHash+模板 | 本地权重学习 |

**结论**：成熟的反 spam 系统都是多层的，没有任何一个仅靠规则活到今天。TweetGuard 走的是同样的路径，只是浓缩到 2 年内走完。
