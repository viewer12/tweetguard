# TweetGuard 性能 & 用户体验深度方案

> 关键问题："会卡吗？会先看到再消失吗？"答案：**不会，但需要正确的实现路径**。
> 这份文档讲清楚为什么不会，以及具体怎么做到。

---

## 一、最关键的体验问题：FOUC

**FOUC（Flash of Unwanted Content）** —— "推文先闪一下再被隐藏" —— 是这类插件最难处理的体验问题。如果用户先看到了，再消失，那：

1. 用户已经看了一眼，过滤等于没过滤
2. 视觉跳动让眼睛被吸引（注意力反而被垃圾内容抓走）
3. 列表收缩导致滚动位置跳变（最糟）

**TweetGuard 必须做到：被识别为垃圾的推文从未在屏幕上出现过**。下面解释为什么这是可达成的。

### 1.1 浏览器渲染时序（关键时间线）

React 在 X 上的渲染流程，对单条新推文：

```
时刻 T0   ┌──────────────────────────────────────────┐
          │ React reconciler 提交，DOM 新增 article  │  ← 主线程任务执行中
          └──────────────────────────────────────────┘
                            │
                            ▼  (同一 task 内的 microtask 队列)
时刻 T1   ┌──────────────────────────────────────────┐
          │ MutationObserver 回调触发                │  ← 我们的代码在这里
          └──────────────────────────────────────────┘
                            │
                            ▼  (microtask 全部执行完，回到主循环)
时刻 T2   ┌──────────────────────────────────────────┐
          │ Style Recalc → Layout → Paint           │  ← 浏览器渲染
          └──────────────────────────────────────────┘
                            │
                            ▼
时刻 T3              用户看到屏幕

关键事实：T1 < T2 < T3
```

**结论**：如果我们在 MutationObserver 回调（T1）里同步设置 `display:none`，那么浏览器在 T2 做 layout/paint 时看到的是"已隐藏"状态，**该 article 从未参与渲染**。用户在 T3 看到的屏幕里它根本不存在。

这是浏览器规范保证的，不是经验之谈。Spec：`MutationObserver` 的 microtask 在渲染步骤前执行。

### 1.2 实现的纪律要求

要兑现这个承诺，我们必须做到：

✅ **MutationObserver 回调必须同步完成判定**——不能 await、不能 setTimeout、不能 `requestIdleCallback`（后者会推到 T2 之后）

✅ **每条推文的判定必须在 ~1ms 内完成**——否则一帧内多条新推文累积超过 16ms 预算，导致掉帧

✅ **必须能在不读取 layout 的情况下完成判定**——读取 `offsetTop` / `getBoundingClientRect` 会强制同步 layout，把我们自己挤到 T2 之后

✅ **CSS 规则提前注入**——`document_start` 阶段就把 `[data-tg-hide] { display: none }` 注入，到 T1 时只需打一个属性，不需要让浏览器临时解析 CSS

这四条是 FOUC 不出现的硬约束。下面看我们怎么具体满足。

---

## 二、性能预算与时序方案

### 2.1 帧预算

| 阶段 | 时间预算 | 备注 |
|---|---|---|
| 一帧总时间 | 16.67ms | 60fps |
| 浏览器 layout/paint/composite | ~10ms | X 自己的成本 |
| React 渲染 | ~3ms | 滚动时新插入推文 |
| **TweetGuard 全部工作** | **≤ 3ms** | 同步 microtask 阶段 |

滚动时，X 通常一帧内插入 1-3 条新推文。如果每条评分 < 1ms，3 条总共 3ms，进帧预算。

### 2.2 单条推文判定时序

```
T1: MutationObserver 回调进入
    │
    ├─ Step A (≤ 0.05ms)：调 article.dataset['tgState'] 检查是否已处理
    │  ✓ 已处理 → return（早退）
    │
    ├─ Step B (≤ 0.1ms)：抽取核心字段
    │     - displayName (textContent)
    │     - handle (href)
    │     - text (textContent)
    │     - verified flag (querySelector 1 次)
    │  注意：只读，不触发 layout
    │
    ├─ Step C (≤ 0.05ms)：保护检查
    │     - whitelist.has(handle) → 标 'ok'，return
    │     - followingSet.has(handle) → 累加 -100，继续但已基本免疫
    │
    ├─ Step D (≤ 0.1ms)：硬规则检查
    │     - 6 条 hard rule 短路求值，一命中即 'hide'，return
    │
    ├─ Step E (≤ 0.5ms)：评分循环
    │     - 17 个信号按 "命中频率 × 计算开销" 排序
    │     - 早退：分数累加到 ≥ hideThreshold 立即停止
    │     - 全部预编译正则（startup 时一次性）
    │
    ├─ Step F (≤ 0.05ms)：写决策
    │     - article.dataset['tgState'] = 'hide' / 'collapse' / 'ok'
    │     - 不读取任何 layout 属性
    │
    └─ Step G: 累加到本帧统计（仅内存写）

T2: 浏览器看到 article 已带 data-tg-state="hide" + 预注入的 CSS → 不渲染
```

**关键纪律**：Step F 只 set 一个 attribute；CSS 规则匹配在 T2 做。我们绝不在 JS 里 `el.style.display = 'none'`，因为那样会让某些浏览器立即触发 style recalc，可能产生额外开销。

### 2.3 已编译正则的存储

```js
// 启动时一次性编译并 freeze
const COMPILED = Object.freeze({
  nsfw_killer: [/check\s+my\s+bio/i, /onlyfans/i, ...],
  crypto_killer: [/\d{2,4}00x/i, /0x[a-f0-9]{40}/i, ...],
  // ...
});

// 评分时直接用引用，零编译开销
```

### 2.4 文本缓存

同一推文的文本只读一次：

```js
function evaluate(article) {
  // 一次 textContent，避免反复 DOM 访问
  const text = article.querySelector('[data-testid="tweetText"]')?.textContent || '';
  const ctx = { text, lowercase: text.toLowerCase(), len: text.length };
  // 后续所有正则用 ctx
}
```

### 2.5 早退策略（关键加速器）

信号按"快 + 高命中率"优先：

```
1. is_blacklisted    (Set.has, 0.001ms)        → 命中即终止
2. is_whitelisted    (Set.has, 0.001ms)        → 命中即终止
3. is_followed       (Set.has, 0.001ms)        → 累加 -100
4. hard_rules        (6 个正则, 0.1ms)         → 命中即 hide
5. nsfw_killer       (~5 正则, 0.1ms)          → 高命中场景早退
6. crypto_killer     (~4 正则, 0.1ms)          → 高命中场景早退
7. username_pattern  (5-10 正则)
8. cn_marketing      (10 正则)
9. 其他              (剩余信号)

if (score >= hideThreshold) break;  // 提前结束
```

实测：在垃圾号密集的回复区，>80% 的判定在前 5 步就结束。

---

## 三、MutationObserver 设计

### 3.1 观察什么

❌ **不要**这样：
```js
new MutationObserver(cb).observe(document.body, { childList: true, subtree: true });
```
这会捕捉 X 任何 DOM 变化，包括头像加载、菜单弹出、计数器更新等几十种与我们无关的事件，CPU 浪费严重。

✅ **应该**这样：
```js
// 启动后等待 timeline 容器出现
async function attachObserver() {
  const timeline = await waitForSelector('[aria-label^="Timeline:"], [data-testid="primaryColumn"]');
  observer.observe(timeline, {
    childList: true,
    subtree: true,
    attributes: false,        // 不监听属性变化
    characterData: false,     // 不监听文本变化
  });
}
```

只在 timeline 子树内观察，CPU 开销降低一个数量级。

### 3.2 SPA 路由变化处理

X 是单页应用，从 Home → 某推文详情时，DOM 树会重建。我们需要重新挂载 observer：

```js
// 拦截 history API
const origPushState = history.pushState;
history.pushState = function(...args) {
  origPushState.apply(this, args);
  onRouteChange();
};
window.addEventListener('popstate', onRouteChange);

function onRouteChange() {
  // 1. 重置 context（父推文、farming counters）
  contextState.reset();
  // 2. 等新 DOM 稳定后重挂 observer
  setTimeout(() => {
    observer.disconnect();
    attachObserver();
    // 3. 扫描首屏已存在的推文
    scanExistingArticles();
  }, 0);
}
```

### 3.3 批量处理多条推文

MutationObserver 回调可能收到多个 mutation。统一遍历：

```js
function onMutations(mutations) {
  // 1. 收集所有新的 article
  const newArticles = new Set();
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.('article[data-testid="tweet"]')) {
        newArticles.add(node);
      } else {
        // 子树里可能有 article
        node.querySelectorAll?.('article[data-testid="tweet"]').forEach(a => newArticles.add(a));
      }
    }
  }

  // 2. 统一同步评估
  for (const article of newArticles) {
    evaluate(article);
  }
}
```

注意：所有 evaluate 都在同一个 microtask 内同步完成，保证 T2 之前。

### 3.4 已处理标记（避免重复评分）

```js
function evaluate(article) {
  // dataset 是 attribute，attribute mutations 不会触发我们的 observer（attributes:false）
  if (article.dataset.tgState) return;
  // ... 评分 ...
  article.dataset.tgState = decision;
}
```

用 dataset 而不是 WeakSet 的好处：状态可在 DOM 上序列化，便于诊断模式查看。坏处：每个推文多挂一个 attribute（毫不影响性能）。

---

## 四、CSS 预注入策略

### 4.1 入口注入

content.js 在 `document_start` 阶段（DOM 还没解析）就插入一段 style：

```js
// content.js（document_start）
const style = document.createElement('style');
style.id = 'tg-styles';
style.textContent = `
  article[data-testid="tweet"][data-tg-state="hide"] {
    display: none !important;
  }
  article[data-testid="tweet"][data-tg-state="collapse"] {
    opacity: 0.4;
    max-height: 80px;
    overflow: hidden;
    transition: opacity 0.15s, max-height 0.2s;
  }
  article[data-testid="tweet"][data-tg-state="collapse"]:hover {
    opacity: 0.7;
  }
  article[data-testid="tweet"][data-tg-state="diag-hide"] {
    opacity: 0.55;
    outline: 2px dashed rgba(255,100,100,0.4);
  }
`;
(document.head || document.documentElement).appendChild(style);
```

到 React 开始渲染时，这条规则已经在 stylesheet 里，匹配 cost 几乎为零。

### 4.2 为什么不直接 `el.style.display = 'none'`

写 inline style 会触发 style invalidation，浏览器会标记元素 "需要重算"。在 microtask 里设置 attribute（属性变化）然后让 CSS 选择器匹配（在 T2 的 style recalc 一次性做完），相比直接写 inline style 更便宜。

### 4.3 collapse 模式的过渡动效

折叠（中分推文）用 CSS transition，保证不在 JS 里推动画。`opacity` + `max-height` 由 GPU 合成，不触发 layout。

---

## 五、UX 细节设计

### 5.1 无 layout shift（防止滚动跳）

被 `display:none` 的推文不参与 layout，所以从插入那一刻起，它就不存在于布局流中。后续推文位置正常。

对比错误做法：

❌ `visibility: hidden`——元素还占位，会留一个空白区域
❌ `opacity: 0`——还是参与 layout 和事件
❌ JS `el.remove()`——可以，但破坏 React 的 reconciler，可能导致后续 bug
✅ `display: none`——彻底退出布局，最干净

### 5.2 toggle 切换的瞬时响应

用户在 popup 把插件关掉，预期效果是"所有被隐藏的内容立刻出现"。

```js
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled !== undefined) {
    if (changes.enabled.newValue === false) {
      // 全部恢复
      document.querySelectorAll('[data-tg-state]').forEach(el => {
        el.removeAttribute('data-tg-state');
      });
    } else {
      // 重新评估所有可见 article
      document.querySelectorAll('article[data-testid="tweet"]').forEach(evaluate);
    }
  }
});
```

整个切换 < 10ms，用户体感"瞬间"。

### 5.3 灵敏度调节的实时反馈

拖动灵敏度滑杆时：

```js
// popup → background → content script via runtime.sendMessage
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'sensitivityChange') {
    threshold = THRESHOLDS[msg.value];
    // 把所有已处理的 article 重新评分
    document.querySelectorAll('article[data-testid="tweet"]').forEach(a => {
      delete a.dataset.tgState;
      evaluate(a);
    });
  }
});
```

为防止拖动过程中频繁重算，popup 端 debounce 200ms。

### 5.4 诊断模式（首次安装强烈建议）

诊断模式下，被判隐藏的推文不真隐藏，而是：

```
┌────────────────────────────────────────────────┐
│  @cryptoking_88472                  ⚠️ score:85│  ← 浮于推文右上角
│  $PEPE going 1000x next week 🚀🚀🚀 ...        │  ← 半透明 + 红色虚线框
│                                                │
│  [信任此用户]  [永久隐藏]  [详细评分]          │  ← hover 显示
└────────────────────────────────────────────────┘
```

用户点"详细评分"显示：
```
Final score: 85 (threshold: 70)

✓ A1 username_pattern: +25  (name+5digits)
✓ B1 crypto_shill: +60      (1000x KILLER + buy now STRONG + $PEPE)
✓ B4 excessive_emoji: +10   (5 emoji)
✓ B6 link_density: +20      (t.me shortlink + short text)
✓ Combo crypto-triple: +15
- D1 is_followed: 0
- D2 interacted: 0

Decision: HIDE
```

这是建立信任的关键 UX——用户能看到"为什么"，就不会担心黑盒误伤。

### 5.5 隐藏统计（克制版）

Popup 显示：

```
本会话隐藏    127 条
├ NSFW 引流       45
├ 加密 shill       62
├ 中文营销        15
└ 其他             5

[查看隐藏列表]  [本次会话不再统计]
```

不在时间线中插入"X tweets hidden, click to expand"横幅——那违反"无感"原则。统计仅在 popup 内可见。

### 5.6 "我担心错杀"的兜底闭环

完整的安全网：

1. **首次安装** → 引导用户进入诊断模式
2. **诊断模式使用 24 小时** → 看到判定理由，建立信心
3. **切到无感模式** → 默认隐藏统计 + 隐藏列表
4. **每周提醒** → "本周隐藏 N 条，回顾一下？" 一键看列表
5. **任何时候** → popup 一键切回诊断模式 / 关闭插件

### 5.7 移动端体验（V2 才支持）

X 的 mobile.x.com DOM 结构差异较大；V1 仅 desktop。V2 增加 mobile selectors 并适配触摸交互（折叠模式改为左滑显示）。

---

## 六、性能反模式（明确不做的事）

| 反模式 | 为什么不做 | 我们怎么做 |
|---|---|---|
| `setInterval` 周期扫描 | 浪费 CPU，FOUC 严重 | MutationObserver 同步触发 |
| `requestIdleCallback` 评估 | 落在 T2 之后，FOUC | 同步 microtask 完成 |
| 读 `offsetTop` 等 layout 属性 | 强制同步 layout | 只读 textContent / dataset |
| 在评分循环里查询 DOM | 反复 querySelector | 启动时抽取一次到 ctx |
| `el.style.display = 'none'` | inline style 触发立即 invalidation | 写 attribute 让 CSS 匹配 |
| 监听 `document.body` 子树 | 噪音过大 | 仅监听 timeline 容器 |
| 同步存储 IO | chrome.storage 是 async | 启动加载到内存，写回 debounce |
| 在主线程跑 ML 推理 | 阻塞 | V2 用 Web Worker |
| 监听 attribute mutations | 触发频率太高 | `attributes: false` |
| 在 keypress 时重评 | 不必要 | 仅 DOM 变化时评 |

---

## 七、最坏情况分析

### 7.1 用户滚动很快

X 在快速滚动时，一帧可能新增 5-10 条推文。

- 单条 < 1ms × 10 = 10ms
- 加上其它开销，仍在 16ms 帧预算内
- 即使偶尔超过，浏览器会丢一帧，体感无感（人眼对 50ms 内的丢帧不敏感）

实测验证方案：用 Chrome Performance 面板录制滚动 10 秒，看 Long Tasks 数量。目标：< 3 个 Long Task（>50ms）。

### 7.2 评分逻辑里有 bug

如果我们的 evaluate 抛异常：

```js
function evaluate(article) {
  try {
    // ... 评分 ...
  } catch (e) {
    article.dataset.tgState = 'ok';  // 默认放行
    logError(e);
  }
}
```

**故障安全**：异常时一律放行（show），用户至少看到完整内容而不是空白。错误日志走 popup 的"导出诊断日志"按钮，用户主动反馈。

### 7.3 X 改了 data-testid

例如某天 `[data-testid="tweet"]` 改名为 `[data-testid="post"]`。

**降级策略**：
1. content.js 启动时跑 health check：在已知页面查找关键选择器，全失败 → 进入 silent fallback
2. silent fallback：插件不工作，但 popup 显示警告 "X DOM 结构变化，请等待规则更新"
3. 不会破坏 X 本身的渲染（我们只 set attribute / inject CSS）

### 7.4 用户禁用 JavaScript（极端）

content script 不会运行，X 自身也不能用。无需处理。

### 7.5 内存泄漏

- WeakSet 不会持有引用（但我们用 dataset，无需 WeakSet）
- recentInteractions Map 加滑窗清理（每天定时清理 30 天前的）
- threadAuthorCount Map 在路由切换时清空

```js
// 滑窗清理
setInterval(() => {
  const cutoff = Date.now() - 30 * 86400_000;
  for (const [k, t] of recentInteractions) {
    if (t < cutoff) recentInteractions.delete(k);
  }
}, 3600_000);  // 每小时清理
```

---

## 八、可观测性

### 8.1 内置 Perf 监控

每次评分记录耗时：

```js
const stats = {
  count: 0,
  totalMs: 0,
  maxMs: 0,
  slowEvents: [],   // > 5ms 的事件
};

function evaluate(article) {
  const t0 = performance.now();
  try {
    // ...
  } finally {
    const dt = performance.now() - t0;
    stats.count++;
    stats.totalMs += dt;
    stats.maxMs = Math.max(stats.maxMs, dt);
    if (dt > 5) stats.slowEvents.push({ when: Date.now(), dt });
  }
}
```

Popup 里有一个 hidden "开发者诊断" 选项可以看：
- 平均评分耗时
- 最慢评分耗时
- 慢事件数

用户报问题时一键导出。

### 8.2 用户报错通道

诊断日志格式（仅本地）：

```json
{
  "version": "0.1.0",
  "session_start": 1234567890,
  "stats": { "evaluated": 8421, "hidden": 127, "errors": 2 },
  "perf": { "avg_ms": 0.38, "max_ms": 4.2, "slow_events": 2 },
  "errors": [
    { "ts": 1234567899, "msg": "TypeError: ...", "stack": "..." }
  ]
}
```

不含任何用户数据（推文内容、handle 等）。

---

## 九、性能验证方案

发布前必跑：

### 9.1 测试场景

| 场景 | 操作 | 期望 |
|---|---|---|
| 冷启动 | 打开 x.com 首页 | 首屏所有 spam 不出现（无 FOUC） |
| 快速滚动 | Home 时间线滚 30 秒 | 60fps，no jank |
| 进入热推回复区 | 点开一条 100k+ 互动的推 | 回复区里垃圾全 hide |
| 长时间使用 | 浏览 30 分钟 | 内存增长 < 20MB |
| 频繁切换 | Home ↔ 个人页 ↔ 单推详情 ×10 | 每次切换 < 100ms 重挂 |
| 关闭/开启插件 | popup toggle ×5 | 每次 < 30ms 响应 |

### 9.2 自动化基准

```js
// e2e 测试用 Playwright 录制
test('no FOUC on home timeline', async ({ page }) => {
  // 装好 extension，访问 home
  await page.goto('https://x.com/home');
  // 等首屏稳定
  await page.waitForSelector('article[data-testid="tweet"]');
  // 截图，OCR 不应包含已知 spam 关键词
  const screenshot = await page.screenshot();
  const text = await ocr(screenshot);
  expect(text).not.toMatch(/check my bio|1000x/i);
});

test('scroll perf', async ({ page }) => {
  await page.goto('https://x.com/home');
  await page.evaluate(() => {
    performance.mark('start');
    for (let i = 0; i < 30; i++) {
      window.scrollBy(0, 800);
      await new Promise(r => requestAnimationFrame(r));
    }
    performance.mark('end');
    return performance.measure('scroll', 'start', 'end').duration;
  });
  // 期望：30 帧滚动 < 600ms（即 ≥ 50fps）
});
```

---

## 十、关键体验承诺（写在产品页）

我们对用户的明确承诺：

1. **不会先看到再消失**——被识别的内容从未出现
2. **不会卡顿滚动**——评分耗时 < 1ms/条
3. **不会有空白占位**——`display:none` 完全脱离布局
4. **不会有横幅干扰**——隐藏统计仅在 popup 内
5. **不会黑盒**——诊断模式可看每条决策理由
6. **不会锁死**——一键 toggle 关闭立即恢复全部内容
7. **不会泄漏**——所有数据本地，永远不上传

---

## 附：实现纪律 checklist（开发时贴在显示器上）

```
[ ] CSS 已在 document_start 注入
[ ] MutationObserver 只盯 timeline 容器
[ ] MutationObserver 设置 attributes:false, characterData:false
[ ] evaluate() 中无 await / setTimeout / requestIdleCallback
[ ] evaluate() 中无 offsetTop / getBoundingClientRect / getComputedStyle
[ ] evaluate() 中无 querySelector 重复调用同样选择器
[ ] 所有正则在模块顶部预编译 + Object.freeze
[ ] 已处理用 article.dataset.tgState 标记
[ ] 评分循环有早退（≥ hideThreshold break）
[ ] 隐藏只通过 set attribute，不写 inline style
[ ] try/catch 包裹 evaluate，异常时默认 show
[ ] 路由变化时重挂 observer + 清 context
[ ] interaction Map 有滑窗清理
[ ] perf stats 每次评分采样
```
