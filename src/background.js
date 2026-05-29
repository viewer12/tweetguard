// TweetGuard background service worker
// 职责：代理 AI 提供商的网络请求（页面 CSP 不允许 inject.js 直接 fetch）

import { DEFAULT_SYSTEM_PROMPT, BAD_CASE_REVIEW_PROMPT, DEFAULT_CONFIG, COMMUNITY_RULES_URL, mergeConfig } from './defaults.js';

const SMOKE_TEST_CASES = [
  {
    input: {
      display_name: '悦欣🌸寻固炮🌸点击主页',
      handle: '@Maria554548731',
      verified: false,
      tweet_text: '👆💁\n🍀\n🍾🍓☀️',
      is_reply: true,
      is_followed_by_user: false
    },
    expected: true
  },
  {
    input: {
      display_name: 'Paul Graham',
      handle: '@paulg',
      verified: true,
      tweet_text: 'The best way to predict the future is to invent it.',
      is_reply: false,
      is_followed_by_user: false
    },
    expected: false
  },
  {
    input: {
      display_name: 'CryptoKing 🚀💎',
      handle: '@cryptoking847291',
      verified: false,
      tweet_text: '$PEPE going 1000x next week 🚀🚀🚀 ape in fast t.me/cryptoking',
      is_reply: true,
      is_followed_by_user: false
    },
    expected: true
  },
  {
    input: {
      display_name: 'Sarah Chen',
      handle: '@sarahchen_dev',
      verified: false,
      tweet_text: 'Just shipped a new feature for our open-source project. Feedback welcome!',
      is_reply: false,
      is_followed_by_user: false
    },
    expected: false
  },
  {
    input: {
      display_name: 'Maria 18+ Open DM 💋',
      handle: '@maria_hot_2024',
      verified: false,
      tweet_text: 'Check my bio 🔥💋 daddy',
      is_reply: true,
      is_followed_by_user: false
    },
    expected: true
  }
];

chrome.runtime.onInstalled.addListener(async () => {
  const { config } = await chrome.storage.local.get('config');
  const merged = mergeConfig(config);
  await chrome.storage.local.set({ config: merged });
  scheduleGithubSync();
  syncGithubRules().catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  scheduleGithubSync();
  syncGithubRules().catch(() => {});
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === GITHUB_ALARM) syncGithubRules().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ai-evaluate') {
    handleAIEvaluate(msg.input).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || String(err) });
    });
    return true; // async
  }
  if (msg.type === 'ai-smoke-test') {
    handleSmokeTest(msg.providerConfig).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || String(err) });
    });
    return true;
  }
  if (msg.type === 'ai-review-bad-case') {
    handleBadCaseReview(msg.payload).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || String(err) });
    });
    return true;
  }
  if (msg.type === 'github-sync-now') {
    syncGithubRules(true).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || String(err) });
    });
    return true;
  }
});

async function handleBadCaseReview(payload) {
  const { config } = await chrome.storage.local.get('config');
  const ai = config?.ai || DEFAULT_CONFIG.ai;
  if (!ai.enabled) return { skipped: true, reason: 'AI not enabled' };
  if (!ai.apiKey && ai.provider !== 'ollama') return { error: 'API key not configured' };

  // 复审用专门的 prompt，用户可在设置里改写
  const reviewPrompt = ai.customReviewPrompt && ai.customReviewPrompt.trim()
    ? ai.customReviewPrompt
    : BAD_CASE_REVIEW_PROMPT;

  const result = await callProvider({
    provider: ai.provider,
    baseURL: ai.baseURL,
    apiKey: ai.apiKey,
    model: ai.model,
    systemPrompt: reviewPrompt,
    input: payload,
    timeoutMs: (ai.timeoutMs || 8000) + 4000,  // 复审多给点时间，输出更长
    isReview: true
  });
  return result;
}

async function handleAIEvaluate(input) {
  const { config } = await chrome.storage.local.get('config');
  const ai = config?.ai || DEFAULT_CONFIG.ai;
  if (!ai.enabled) return { skipped: true };
  if (!ai.apiKey && ai.provider !== 'ollama') return { error: 'API key not configured' };

  const prompt = ai.customPrompt && ai.customPrompt.trim()
    ? ai.customPrompt
    : DEFAULT_SYSTEM_PROMPT;

  return callProvider({
    provider: ai.provider,
    baseURL: ai.baseURL,
    apiKey: ai.apiKey,
    model: ai.model,
    systemPrompt: prompt,
    input,
    timeoutMs: ai.timeoutMs || 8000
  });
}

async function handleSmokeTest(providerConfig) {
  const prompt = providerConfig.customPrompt && providerConfig.customPrompt.trim()
    ? providerConfig.customPrompt
    : DEFAULT_SYSTEM_PROMPT;

  const results = [];
  const start = Date.now();

  for (const t of SMOKE_TEST_CASES) {
    try {
      const r = await callProvider({
        ...providerConfig,
        systemPrompt: prompt,
        input: t.input,
        timeoutMs: 15000
      });
      const correct = r.is_spam === t.expected;
      results.push({
        input: t.input,
        expected: t.expected,
        actual: r,
        correct
      });
    } catch (err) {
      results.push({
        input: t.input,
        expected: t.expected,
        error: err.message || String(err),
        correct: false
      });
    }
  }

  const correct = results.filter(r => r.correct).length;
  return {
    total: results.length,
    correct,
    accuracy: correct / results.length,
    durationMs: Date.now() - start,
    cases: results
  };
}

// ============================================================================
// Provider 调用统一入口
// ============================================================================

async function callProvider({ provider, baseURL, apiKey, model, systemPrompt, input, timeoutMs, isReview }) {
  const userMessage = `<<INPUT>>\n${JSON.stringify(input)}\n<<END_INPUT>>`;
  const parser = isReview ? parseBadCaseReviewOutput : parseClassifierOutput;
  // max_tokens 给充裕预算 —— 截断的代价（empty content + 用户 debug 时间）远高于
  // 多输出几百 token 的费用（DeepSeek 1.1¥/M output tokens，单次复审多花 ¥0.001 不到）
  // JSON 模式下输出会被 schema 自然收敛，不会真的写到上限
  const maxTokens = 4096;
  switch (provider) {
    case 'anthropic':
      return callAnthropic({ baseURL, apiKey, model, systemPrompt, userMessage, timeoutMs, parser, maxTokens });
    case 'gemini':
      return callGemini({ baseURL, apiKey, model, systemPrompt, userMessage, timeoutMs, parser, maxTokens });
    default:
      // openai-compatible: deepseek, openai, groq, openrouter, ollama, custom
      return callOpenAICompatible({ baseURL, apiKey, model, systemPrompt, userMessage, timeoutMs, parser, maxTokens });
  }
}

async function callOpenAICompatible({ baseURL, apiKey, model, systemPrompt, userMessage, timeoutMs, parser, maxTokens }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${stripTrailingSlash(baseURL)}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: maxTokens || 240
      })
    });
    clearTimeout(t);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`${res.status}: ${errorText.slice(0, 300)}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      const finish = choice?.finish_reason || 'unknown';
      // 部分 DeepSeek 模型会有 reasoning_content 而 content 为空（reasoner 系列）
      const reasoning = choice?.message?.reasoning_content;
      if (reasoning) {
        // 试着从 reasoning 里提取 JSON（最后的兜底）
        const parsed = (parser || parseClassifierOutput)(reasoning);
        if (!parsed._error) return { ...parsed, _meta: { provider: 'openai-compat', fromReasoning: true } };
      }
      throw new Error(`Empty content (finish_reason: ${finish}). 模型: ${model}. ${finish === 'length' ? '建议换 flash 类轻模型或反馈给开发者增大 max_tokens' : ''}`);
    }

    const parsed = (parser || parseClassifierOutput)(content);
    return { ...parsed, _meta: { provider: 'openai-compat', tokens: data.usage } };
  } finally {
    clearTimeout(t);
  }
}

async function callAnthropic({ baseURL, apiKey, model, systemPrompt, userMessage, timeoutMs, parser, maxTokens }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${stripTrailingSlash(baseURL)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens || 240,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    clearTimeout(t);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`${res.status}: ${errorText.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.content?.[0]?.text;
    if (!content) throw new Error('Empty response from Anthropic');
    const parsed = (parser || parseClassifierOutput)(content);
    return { ...parsed, _meta: { provider: 'anthropic', tokens: data.usage } };
  } finally {
    clearTimeout(t);
  }
}

async function callGemini({ baseURL, apiKey, model, systemPrompt, userMessage, timeoutMs, parser, maxTokens }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${stripTrailingSlash(baseURL)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: maxTokens || 240,
          responseMimeType: 'application/json'
        }
      })
    });
    clearTimeout(t);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`${res.status}: ${errorText.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty response from Gemini');
    const parsed = (parser || parseClassifierOutput)(content);
    return { ...parsed, _meta: { provider: 'gemini' } };
  } finally {
    clearTimeout(t);
  }
}

function parseClassifierOutput(text) {
  // 去除可能的 ```json wrappers
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 尝试找到第一个 { ... }
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { is_spam: false, confidence: 0, category: 'normal', reasoning: 'parse_error', _error: true };
  }

  return {
    is_spam: Boolean(parsed.is_spam),
    confidence: clamp(Number(parsed.confidence) || 0, 0, 100),
    category: typeof parsed.category === 'string' ? parsed.category : 'normal',
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 300) : '',
    signature: validateSignature(parsed.signature)
  };
}

// 校验 AI 提供的 signature，防止过宽 / 非法 / 危险的模式落库
function validateSignature(sig) {
  if (!sig || typeof sig !== 'object') return null;

  // V7: AI 学习规则**只允许基于推文内容**
  //   理由：显示名和 username 都可随意伪造，且我们已经看到 AI 会学到
  //   过于通用的显示名片段（如"月璃"）导致大量误伤真实账号。
  //   推文文本是 bot 实际表达意图的地方，是唯一可靠的学习维度。
  //   内置规则仍可用 displayName / handle 做精确判断（R7/R10 等），但 AI 学习只看推文。
  const VALID_KINDS = ['tweet_keyword'];
  if (!VALID_KINDS.includes(sig.kind)) return null;

  const value = typeof sig.value === 'string' ? sig.value.trim() : '';

  // 纯 ASCII keyword 最低 5 字符（防 "free"/"hot" 这类通用词）
  // 含 CJK(中/日/韩) 的词信息密度高，短词也高特异(如 "sao货"=4字、"她太涩"=3字)→ 放宽到 ≥3
  // regex 类型最低 7 字符
  const isRegex = sig.kind.endsWith('_regex');
  const hasCJK = /[぀-ヿ㐀-鿿가-힯]/.test(value);
  const minLen = isRegex ? 7 : (hasCJK ? 3 : 5);
  if (value.length < minLen || value.length > 120) return null;

  // 通用词黑名单：明显常用，会产生大量误伤
  const GENERIC = new Set([
    // 英文常用词
    'the', 'and', 'for', 'you', 'this', 'that', 'with', 'have', 'are', 'was',
    'crypto', 'hot', 'free', 'love', 'best', 'new', 'win', 'now', 'good',
    'great', 'check', 'follow', 'like', 'thank', 'thanks', 'hello', 'world',
    // 中文常用词（这些会误伤大量真人推文）
    '不是', '什么', '可以', '知道', '我们', '你们', '他们', '为什么',
    '没有', '一个', '这个', '那个', '免费', '关注', '回复', '推荐',
    '热门', '最新', '看看', '哈哈', '感谢', '谢谢', '请问', '怎么',
    '这样', '那么', '好的', '可能', '应该', '已经', '还是', '但是',
    '加密', '众安', '不会', '不过', '其实', '当然', '虽然', '因为'
  ]);
  if (GENERIC.has(value.toLowerCase())) return null;

  // 含通用词作为完整 substring 也拒绝（防止 "我看看看看" 这种连续重复）
  for (const w of GENERIC) {
    if (value.length < w.length + 3 && value.toLowerCase().includes(w)) return null;
  }

  if (isRegex) {
    try {
      new RegExp(value);
      // 拒绝明显过宽的模式
      if (/^\.\*?$/.test(value) || /^\.\+$/.test(value)) return null;
      // 拒绝纯通配/纯字符类
      if (/^[\[\]\\.\*\+\?\{\}\^\$\|\(\)]+$/.test(value)) return null;
      // 关键防御：必须有 ≥4 个字面文字锚点（不能全是字符类 + 量词）
      // 防止 AI 学到 `^[a-zA-Z]{6,}\d{5,}$` 这种"任何字母+数字 handle 都中"的灾难
      if (regexLiteralCharCount(value) < 4) return null;
    } catch (e) { return null; }
  }

  return {
    kind: sig.kind,
    value: value,
    category: typeof sig.category === 'string' ? sig.category : null
  };
}

// bad-case 复审输出有更丰富的 schema（含 add_signature / disable_rule_id）
function parseBadCaseReviewOutput(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { _error: 'parse_error', corrected_decision: null };
  }

  return {
    corrected_decision: parsed.corrected_decision === 'spam' ? 'spam'
                      : parsed.corrected_decision === 'normal' ? 'normal'
                      : null,
    confidence: clamp(Number(parsed.confidence) || 0, 0, 100),
    category: typeof parsed.category === 'string' ? parsed.category : 'normal',
    diagnosis: typeof parsed.diagnosis === 'string' ? parsed.diagnosis.slice(0, 400) : '',
    add_signature: validateSignature(parsed.add_signature),
    disable_rule_id: typeof parsed.disable_rule_id === 'string' && /^lr-/.test(parsed.disable_rule_id)
                       ? parsed.disable_rule_id.slice(0, 40)
                       : null
  };
}

// 估算 regex 里"字面字符锚点"数量（不含字符类、量词、元字符）
// 用来判断一条 regex 是否过宽：字面字符越少越宽，4 个以下就是危险品
function regexLiteralCharCount(pattern) {
  if (!pattern) return 0;
  let s = pattern;
  s = s.replace(/\\u[0-9a-fA-F]{4}/g, '_');       // \uXXXX
  s = s.replace(/\\x[0-9a-fA-F]{2}/g, '_');       // \xXX
  s = s.replace(/\\[dDsSwW]/g, '');                // \d \w 等字符类 escape → 不是字面
  s = s.replace(/\\[bBAZ]/g, '');                  // 边界
  s = s.replace(/\\[fnrtv0]/g, '_');               // \n \t 等
  s = s.replace(/\\(.)/g, '$1');                   // \. → .（字面化）
  s = s.replace(/\[[^\]]*\]/g, '');                // 字符类整段
  s = s.replace(/\{[^}]*\}/g, '');                 // 量词
  s = s.replace(/[\^$.*+?(){}|]/g, '');            // 元字符
  return s.length;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function stripTrailingSlash(s) { return (s || '').replace(/\/+$/, ''); }

// ============================================================================
// GitHub 社区规则同步
//   从用户配置的 raw URL 拉取规则文件，严格校验后写入 config.githubRules。
//   ⚠️ 外部数据 = 不可信：每条都过 validateSignature(只接受 tweet_keyword、
//      拒绝显示名/username 模式、拒绝过宽/通用词)，与 AI 学习规则同一道安全闸门。
// ============================================================================

const GITHUB_ALARM = 'tg-github-sync';

async function fetchAndValidateGithubRules(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rawRules = Array.isArray(data) ? data : (Array.isArray(data?.rules) ? data.rules : null);
    if (!rawRules) throw new Error('格式错误：应为数组或 { rules: [...] }');
    const out = [];
    const seen = new Set();
    for (const r of rawRules) {
      // 复用分类签名校验：只接受 tweet_keyword + 长度/通用词/regex 防御
      const sig = validateSignature({ kind: r?.kind, value: r?.value, category: r?.category });
      if (!sig) continue;                       // 不合规(含显示名/username/过宽)直接丢弃
      const key = sig.value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: 'gh-' + key.slice(0, 32),
        kind: sig.kind,
        value: sig.value,
        category: sig.category || 'cn_nsfw_bot',
        source: 'github',
        enabled: true
      });
      if (out.length >= 2000) break;            // 上限，防滥用 / 防超大文件
    }
    return { rules: out };
  } finally {
    clearTimeout(t);
  }
}

async function syncGithubRules(force = false) {
  const { config } = await chrome.storage.local.get('config');
  const cfg = mergeConfig(config);
  const gs = cfg.githubSync || {};
  if (!force && !gs.enabled) return { skipped: true, reason: 'disabled' };

  const url = COMMUNITY_RULES_URL;   // 固定内置地址，不走配置存储(避免被改/清空)
  try {
    const { rules } = await fetchAndValidateGithubRules(url);
    // 本地优先去重：剔除本地学习规则已覆盖的 value（本地删掉后下次同步会自动恢复）
    const learnedValues = new Set((cfg.learnedRules || []).map(r => String(r.value || '').toLowerCase()));
    const deduped = rules.filter(r => !learnedValues.has(String(r.value).toLowerCase()));
    cfg.githubRules = deduped;
    cfg.githubSync = { ...gs, lastSyncAt: Date.now(), lastSyncStatus: 'ok', lastSyncCount: deduped.length };
    await chrome.storage.local.set({ config: cfg });
    return { ok: true, count: rules.length };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 120);
    cfg.githubSync = { ...gs, lastSyncAt: Date.now(), lastSyncStatus: 'error:' + msg };
    await chrome.storage.local.set({ config: cfg });
    return { error: msg };
  }
}

function scheduleGithubSync() {
  chrome.storage.local.get('config').then(({ config }) => {
    const gs = mergeConfig(config).githubSync || {};
    const hours = Math.max(1, gs.intervalHours || 24);
    chrome.alarms?.create(GITHUB_ALARM, { periodInMinutes: hours * 60 });
  });
}
