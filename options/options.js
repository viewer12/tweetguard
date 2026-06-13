import {
  DEFAULT_CONFIG, DEFAULT_SYSTEM_PROMPT, BAD_CASE_REVIEW_PROMPT,
  PROVIDERS, CATEGORY_LABELS,
  SENSITIVITY_THRESHOLDS, mergeConfig,
  HARD_RULES, SCORING_SIGNALS, COMMUNITY_RULES_URL
} from '../src/defaults.js';

// Prompt 编辑器配置 —— 用同一组 UI 编辑两个 prompt
const PROMPT_DEFS = {
  classifier: {
    label: '分类 Prompt',
    desc: '每条灰区推文都用这个 prompt 判断是否为 spam，返回 JSON 决策 + 可选的泛化签名。每次调用 ~700 input tokens。',
    defaultText: DEFAULT_SYSTEM_PROMPT,
    configKey: 'customPrompt'
  },
  review: {
    label: '复审 Prompt',
    desc: '两种时机都会用到它来复审并沉淀规则：① 你点「信任」/ 小旗按钮标记误判时；② AI 判定为 spam 但分类时没自动产出规则时（自动兜底复审）。让 AI 反思并产出新规则 / 禁用旧规则建议。每次调用 ~1500 input tokens。',
    defaultText: BAD_CASE_REVIEW_PROMPT,
    configKey: 'customReviewPrompt'
  }
};

let activePromptKey = 'classifier';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============================================================================
// 模块定义
// ============================================================================

const MODULE_DEFS = [
  { id: 'cn_nsfw_bot',     name: '中文色情 bot',  desc: '寻炮 / 点击主页 / 加微 类显示名引流，bot 农场指纹' },
  { id: 'crypto_shill',    name: '加密币 shill',  desc: '$XXX 100x / 合约地址 / pump.fun / DM for alpha' },
  { id: 'nsfw',            name: '英文色情引流',  desc: 'check my bio / DM me / OnlyFans / Fansly' },
  { id: 'cn_marketing',    name: '中文营销灰产',  desc: '返佣 / 撸毛 / 月入 X 万 / 加 TG 类' },
  { id: 'engagement_bait', name: '互动诱饵',      desc: 'RT if agree / tag 3 friends / 纯 emoji 回复' },
  { id: 'ai_filler',       name: 'AI 灌水回复',   desc: '通用赞美 / 100% agree（识别率有限，默认关）' }
];

// 规则与信号清单现在统一来自 src/defaults.js 的 HARD_RULES / SCORING_SIGNALS，
// 与引擎(inject.js)同源维护，避免配置页再次与实际逻辑漂移。

// ============================================================================
// 状态
// ============================================================================

let config = null;
let cache = {};
let saveTimer = null;

async function loadAll() {
  const data = await chrome.storage.local.get(['config', 'cache']);
  config = mergeConfig(data.config);
  cache = data.cache || {};
  renderAll();
  // 版本号从 manifest 动态读，避免 HTML 里硬编码导致 stale
  const ver = chrome.runtime.getManifest().version;
  const sv = document.getElementById('sidebar-version'); if (sv) sv.textContent = 'v' + ver;
  const av = document.getElementById('about-version'); if (av) av.textContent = ver;
}

async function saveConfig() {
  await chrome.storage.local.set({ config });
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveConfig, 300);
}

// ============================================================================
// 渲染
// ============================================================================

function renderAll() {
  renderGeneral();
  renderAI();
  renderPrompt();
  renderRules();
  renderGithubSync();
  renderGithubRules();
  renderLearnedRules();
  renderBadCases();
  renderCache();
  renderLists();
}

// ── 通用 ────────────────────────────────────────
function renderGeneral() {
  $('#opt-enabled').checked = config.enabled !== false;

  $$('#opt-sensitivity button').forEach(b => {
    b.classList.toggle('active', b.dataset.value === config.sensitivity);
  });

  $$('#opt-hidemode input').forEach(r => {
    r.checked = r.value === config.hideMode;
  });

  const container = $('#opt-modules');
  container.innerHTML = MODULE_DEFS.map(m => `
    <div class="module-item">
      <div class="module-info">
        <div class="module-name">${escapeHtml(m.name)}</div>
        <div class="module-desc">${escapeHtml(m.desc)}</div>
      </div>
      <label class="switch">
        <input type="checkbox" data-module="${m.id}" ${config.modules?.[m.id] ? 'checked' : ''}>
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </label>
    </div>
  `).join('');
}

// ── AI ────────────────────────────────────────
function renderAI() {
  $('#opt-ai-enabled').checked = !!config.ai?.enabled;

  // Provider 列表
  const providerSelect = $('#opt-ai-provider');
  providerSelect.innerHTML = Object.entries(PROVIDERS).map(([key, p]) =>
    `<option value="${key}">${escapeHtml(p.label)}</option>`
  ).join('');
  providerSelect.value = config.ai?.provider || 'deepseek';

  $('#opt-ai-provider-note').textContent =
    PROVIDERS[providerSelect.value]?.note || '';

  // Model 列表
  renderModelOptions(providerSelect.value);
  updateKeyLink(providerSelect.value);

  $('#opt-ai-key').value = config.ai?.apiKey || '';
  $('#opt-ai-baseurl').value = config.ai?.baseURL || PROVIDERS[providerSelect.value]?.baseURL || '';
  $('#opt-ai-timeout').value = config.ai?.timeoutMs || 8000;

  // 统计
  const aiCalls = config.stats?.aiCalls || 0;
  const cacheHits = config.stats?.cacheHits || 0;
  const totalLookups = aiCalls + cacheHits;
  $('#stat-ai-calls').textContent = formatNumber(aiCalls);
  $('#stat-cache-hits').textContent = formatNumber(cacheHits);
  $('#stat-cache-rate').textContent = totalLookups > 0
    ? ((cacheHits / totalLookups) * 100).toFixed(0) + '%'
    : '—';
  $('#stat-total-hidden').textContent = formatNumber(config.stats?.totalHidden || 0);
}

function renderModelOptions(providerKey) {
  const p = PROVIDERS[providerKey];
  const select = $('#opt-ai-model');
  const customInput = $('#opt-ai-model-custom');
  if (!p || !p.models?.length) {
    select.innerHTML = '<option value="">（无预设，使用自定义模型名）</option>';
    customInput.style.display = '';
  } else {
    select.innerHTML = p.models.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    customInput.style.display = 'none';
  }
  const currentModel = config.ai?.model || p?.defaultModel || '';
  if (currentModel && p?.models?.includes(currentModel)) {
    select.value = currentModel;
  } else if (currentModel) {
    customInput.style.display = '';
    customInput.value = currentModel;
  }
}

// 按当前 provider 显示「获取 API Key」入口链接（ollama 本地 / custom 自定义无需 key，隐藏）
function updateKeyLink(providerKey) {
  const link = $('#opt-ai-key-link');
  if (!link) return;
  const p = PROVIDERS[providerKey];
  if (p && p.apiKeyUrl) {
    link.href = p.apiKeyUrl;
    link.textContent = `获取 ${p.label} API Key ↗`;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
}

// ── Prompt ────────────────────────────────────────
function renderPrompt() {
  // 高亮当前激活的 prompt 类型
  document.querySelectorAll('#prompt-switcher button').forEach(b => {
    b.classList.toggle('active', b.dataset.prompt === activePromptKey);
  });
  // 顶部描述卡片
  $('#prompt-current-desc').textContent = PROMPT_DEFS[activePromptKey].desc;
  // 编辑器内容
  const def = PROMPT_DEFS[activePromptKey];
  const stored = config.ai?.[def.configKey];
  const editor = $('#prompt-editor');
  editor.value = stored || def.defaultText;
  updatePromptStatus();
}

function updatePromptStatus() {
  const def = PROMPT_DEFS[activePromptKey];
  const editor = $('#prompt-editor');
  const value = editor.value;
  const isDefault = value === def.defaultText || !value.trim();
  const isStoredDefault = !config.ai?.[def.configKey];
  const modifiedFromStored = isStoredDefault ? !isDefault : value !== config.ai[def.configKey];

  $('#prompt-status').dataset.modified = modifiedFromStored ? '1' : '0';
  $('#prompt-status').textContent = isDefault
    ? `使用默认${def.label}`
    : (modifiedFromStored ? '未保存的修改' : `使用自定义${def.label}`);

  $('#prompt-counter').textContent = `${value.length.toLocaleString()} 字符`;
  $('#prompt-save').disabled = !modifiedFromStored;
  $('#prompt-reset').disabled = isDefault;
}

// ── 规则 ────────────────────────────────────────
function renderRules() {
  // 对应模块开关决定该规则 / 信号当前是否生效；无 module 字段 = 恒定生效
  const isOn = (item) => !item.module || !!config.modules?.[item.module];

  // 硬规则
  const rulesGrid = $('#rules-grid');
  if (rulesGrid) {
    rulesGrid.innerHTML = HARD_RULES.map(rule => `
      <div class="rule-item" data-on="${isOn(rule) ? '1' : '0'}">
        <span class="rule-id">${escapeHtml(rule.id)}</span>
        <span class="rule-text">${escapeHtml(rule.desc)}</span>
      </div>
    `).join('');
  }

  // 评分信号
  const grid = $('#signals-grid');
  if (grid) {
    grid.innerHTML = SCORING_SIGNALS.map(sig => `
      <div class="signal-item" data-on="${isOn(sig) ? '1' : '0'}">
        <span class="signal-id">${escapeHtml(sig.id)}</span>
        <span class="signal-name">${escapeHtml(sig.name)}</span>
        <span class="signal-weight">${escapeHtml(sig.weight)}</span>
      </div>
    `).join('');
  }

  // 计数全部来自清单长度，杜绝散文里写死的数字再次漂移
  for (const sel of ['#rules-count', '#about-rules-count']) {
    const el = $(sel); if (el) el.textContent = HARD_RULES.length;
  }
  for (const sel of ['#signals-count', '#about-signals-count']) {
    const el = $(sel); if (el) el.textContent = SCORING_SIGNALS.length;
  }

  // 自定义关键词
  renderChips('#custom-keyword-list', config.customKeywords || [], 'customKeywords');
}

function renderGithubSync() {
  const gs = config.githubSync || {};
  const en = $('#gh-enabled'); if (en) en.checked = gs.enabled !== false;
  const src = $('#gh-src'); if (src) src.textContent = COMMUNITY_RULES_URL;
  const disabledN = (config.githubRulesDisabled || []).length;
  const resetBtn = $('#gh-reset-disabled'); if (resetBtn) resetBtn.style.display = disabledN > 0 ? '' : 'none';
  const status = $('#gh-status');
  if (!status) return;
  const cnt = (config.githubRules || []).length;
  const suffix = disabledN > 0 ? ` · 已禁用 ${disabledN} 条` : '';
  if (!gs.lastSyncAt) status.textContent = '尚未同步' + suffix;
  else if (gs.lastSyncStatus === 'ok') status.textContent = `上次同步 ${formatRelative(gs.lastSyncAt)} · 已加载 ${cnt} 条社区规则${suffix}`;
  else if (typeof gs.lastSyncStatus === 'string' && gs.lastSyncStatus.startsWith('error')) status.textContent = `上次同步 ${formatRelative(gs.lastSyncAt)} 失败：${gs.lastSyncStatus.slice(6)}${suffix}`;
  else status.textContent = `上次同步 ${formatRelative(gs.lastSyncAt)}${suffix}`;
}

// 渲染从 GitHub 社区拉取的规则(只读)。不认可的可「否决」→ 写入 githubRulesDisabled，
// 引擎里用户裁判优先于外部规则，且同步不覆盖否决清单，故否决持久有效。
function renderGithubRules() {
  const list = $('#gh-rules-list');
  if (!list) return;
  const rules = (config.githubRules || []).slice();
  const disabled = new Set((config.githubRulesDisabled || []).map(v => String(v).toLowerCase()));
  const countEl = $('#gh-rules-count'); if (countEl) countEl.textContent = rules.length;

  if (rules.length === 0) {
    list.innerHTML = `<div class="empty-state">尚未加载社区规则。点「立即同步」从上方仓库拉取。</div>`;
    return;
  }

  // 未否决的排前，组内按关键词排序
  rules.sort((a, b) => {
    const da = disabled.has(String(a.value).toLowerCase()) ? 1 : 0;
    const db = disabled.has(String(b.value).toLowerCase()) ? 1 : 0;
    if (da !== db) return da - db;
    return String(a.value || '').localeCompare(String(b.value || ''));
  });

  list.innerHTML = rules.map(rule => {
    const off = disabled.has(String(rule.value).toLowerCase());
    return `
    <div class="gh-rule" data-value="${escapeHtml(rule.value)}" data-enabled="${off ? '0' : '1'}">
      <span class="learned-rule-kind" data-origin="github" title="来自社区规则库（只读）">社区</span>
      <span class="learned-rule-value" title="${escapeHtml(rule.value)}">${escapeHtml(rule.value)}</span>
      <span class="learned-rule-category">${escapeHtml(CATEGORY_LABELS[rule.category] || rule.category || '可疑')}</span>
      <button class="btn btn-ghost btn-sm gh-rule-toggle" type="button" data-action="${off ? 'restore' : 'veto'}">${off ? '恢复' : '否决'}</button>
    </div>`;
  }).join('');
}

// ── 已学习规则 ────────────────────────────────────────

const LEARNED_KIND_LABEL = {
  displayname_keyword: '显示名',
  tweet_keyword: '推文',
  username_regex: '用户名 ~',
  displayname_regex: '显示名 ~'
};

function renderLearnedRules() {
  const list = $('#learned-rules-list');
  if (!list) return;
  const rules = (config.learnedRules || []).slice();
  $('#learned-rules-count').textContent = rules.length;

  if (rules.length === 0) {
    list.innerHTML = `<div class="empty-state">AI 还没学到新规则。启用 AI 并浏览一段时间后会自动填充。</div>`;
    return;
  }

  // 按命中数倒序，未命中的按创建时间倒序
  rules.sort((a, b) => {
    const ha = a.hitCount || 0, hb = b.hitCount || 0;
    if (ha !== hb) return hb - ha;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  list.innerHTML = rules.map(rule => `
    <div class="learned-rule" data-id="${escapeHtml(rule.id)}" data-enabled="${rule.enabled !== false ? '1' : '0'}">
      <span class="learned-rule-kind" data-origin="${rule.origin || 'unknown'}" title="${rule.origin === 'feedback' ? '你标记垃圾后产生' : rule.origin === 'auto' ? 'AI 浏览时自动学习' : '旧规则，来源未记录'}">${rule.origin === 'feedback' ? '你反馈' : rule.origin === 'auto' ? '自动' : '—'}</span>
      <span class="learned-rule-value" title="${escapeHtml(rule.value)}${rule.sourceHandle ? '\n来源: ' + escapeHtml(rule.sourceHandle) : ''}">${escapeHtml(rule.value)}</span>
      <span class="learned-rule-category">${escapeHtml(CATEGORY_LABELS[rule.category] || rule.category || '可疑')}</span>
      <span class="learned-rule-hits">命中 ${rule.hitCount || 0}</span>
      <span class="learned-rule-time">${formatRelative(rule.createdAt)}</span>
      <div class="learned-rule-actions">
        <button class="cache-action-btn" data-action="toggle" title="${rule.enabled !== false ? '禁用此规则' : '启用此规则'}">
          ${rule.enabled !== false
            ? `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8L7 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>`}
        </button>
        <button class="cache-action-btn" data-action="delete" title="删除此规则">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 5H13M6 5V3.5C6 3.22 6.22 3 6.5 3H9.5C9.78 3 10 3.22 10 3.5V5M5 5L5.5 13C5.5 13.28 5.72 13.5 6 13.5H10C10.28 13.5 10.5 13.28 10.5 13L11 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

// ── Bad cases ────────────────────────────────────────

function renderBadCases() {
  const list = $('#badcase-list');
  if (!list) return;
  const cases = (config.badCases || []).slice();
  $('#badcase-count').textContent = cases.length;

  if (cases.length === 0) {
    list.innerHTML = `<div class="empty-state">还没有反馈记录。在 X 上标记几条试试。</div>`;
    return;
  }

  list.innerHTML = cases.slice(0, 50).map(bc => {
    const typeLabel = bc.type === 'false_positive' ? '误判' : '漏判';
    const aiText = bc.aiAnalysis?.diagnosis
      || (bc.aiError ? `AI 分析失败：${bc.aiError}` : 'AI 未参与（未启用或失败）');
    const actionPills = [];
    if (bc.aiAnalysis?.add_signature) {
      const sig = bc.aiAnalysis.add_signature;
      actionPills.push(`<span class="badcase-action-pill" data-kind="add">+ ${escapeHtml(sig.kind)}: ${escapeHtml((sig.value || '').slice(0, 40))}</span>`);
    }
    if (bc.aiAnalysis?.disable_rule_id) {
      actionPills.push(`<span class="badcase-action-pill" data-kind="disable">禁用 ${escapeHtml(bc.aiAnalysis.disable_rule_id)}</span>`);
    }
    return `
      <div class="badcase-item">
        <div class="badcase-head">
          <span class="badcase-tag" data-type="${escapeHtml(bc.type)}">${typeLabel}</span>
          <span style="font-size:10.5px;padding:1px 6px;border-radius:4px;background:var(--bg-soft);border:1px solid var(--border);flex-shrink:0;color:${bc.trigger === 'ai_auto' ? 'var(--text)' : 'var(--text-faint)'};${bc.trigger === 'ai_auto' ? 'font-weight:500;' : ''}">${bc.trigger === 'ai_auto' ? 'AI 自动' : '你标记'}</span>
          <span class="badcase-handle">${escapeHtml(bc.handle || '(unknown)')}</span>
          <span class="badcase-time">${formatRelative(bc.capturedAt)}</span>
        </div>
        ${bc.displayName || bc.tweetText ? `<div class="badcase-content">${escapeHtml(bc.displayName || '')}\n${escapeHtml((bc.tweetText || '').slice(0, 200))}</div>` : ''}
        <div class="badcase-diagnosis">
          <span class="badcase-diagnosis-label">AI 复盘：</span>${escapeHtml(aiText)}
        </div>
        ${actionPills.length ? `<div class="badcase-actions-applied">${actionPills.join('')}</div>` : ''}
      </div>
    `;
  }).join('');

  if (cases.length > 50) {
    list.innerHTML += `<div class="empty-state">只显示最近 50 条（共 ${cases.length} 条）</div>`;
  }
}

// ── 缓存 ────────────────────────────────────────
function renderCache() {
  const search = ($('#cache-search')?.value || '').trim().toLowerCase();
  const filter = $('#cache-filter')?.value || 'all';

  const entries = Object.entries(cache)
    .filter(([handle, entry]) => {
      if (filter === 'spam' && entry.decision !== 'spam') return false;
      if (filter === 'normal' && entry.decision !== 'normal') return false;
      if (search) {
        const hay = [handle, entry.category, entry.reasoning, entry.source].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => (b[1].evaluatedAt || 0) - (a[1].evaluatedAt || 0));

  const list = $('#cache-list');
  const totalAll = Object.keys(cache).length;
  $('#cache-filter').querySelector('[value="all"]').textContent = `所有 (${totalAll})`;

  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-state">${totalAll === 0 ? '还没有缓存的判定，浏览 X 后会自动填充。' : '当前筛选无匹配项。'}</div>`;
    return;
  }

  list.innerHTML = entries.slice(0, 500).map(([handle, entry]) => `
    <div class="cache-row" data-decision="${entry.decision}" data-handle="${escapeHtml(handle)}">
      <div class="cache-handle">
        <a class="cache-handle-id" style="text-decoration:none" href="https://x.com/${encodeURIComponent(handle.replace(/^@/, ''))}" target="_blank" rel="noopener noreferrer" title="在 X 打开主页">${escapeHtml(handle)}</a>
        ${entry.displayName ? `<span class="cache-handle-name">${escapeHtml(entry.displayName)}</span>` : ''}
      </div>
      <div class="cache-category">${escapeHtml(CATEGORY_LABELS[entry.category] || entry.category || '未分类')}</div>
      <div class="cache-source">${sourceLabel(entry.source)}</div>
      <div class="cache-time">${formatRelative(entry.evaluatedAt)}</div>
      <div class="cache-actions">
        <button class="cache-action-btn" data-action="flip" title="${entry.decision === 'spam' ? '改判为正常' : '改判为 spam'}">
          ${entry.decision === 'spam'
            ? `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8L7 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`}
        </button>
        <button class="cache-action-btn" data-action="delete" title="删除此缓存">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 5H13M6 5V3.5C6 3.22 6.22 3 6.5 3H9.5C9.78 3 10 3.22 10 3.5V5M5 5L5.5 13C5.5 13.28 5.72 13.5 6 13.5H10C10.28 13.5 10.5 13.28 10.5 13L11 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  if (entries.length > 500) {
    list.innerHTML += `<div class="empty-state">只显示前 500 条（共 ${entries.length}）。请用搜索缩小范围。</div>`;
  }
}

function sourceLabel(src) {
  return {
    'rule': '规则', 'ai': 'AI', 'cache': '缓存', 'user': '手动'
  }[src] || src || '—';
}

function formatRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 30 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── 名单 ────────────────────────────────────────
function renderLists() {
  renderChips('#whitelist-list', config.whitelist || [], 'whitelist');
  renderChips('#blacklist-list', config.blacklist || [], 'blacklist');
  renderChips('#following-list', config.followingList || [], 'followingList');
  $('#following-count').textContent = (config.followingList || []).length;
}

function renderChips(container, items, fieldKey) {
  const el = $(container);
  if (!el) return;
  el.innerHTML = items.map(item => `
    <span class="chip" data-value="${escapeHtml(item)}">
      ${escapeHtml(item)}
      <button class="chip-remove" type="button" data-field="${fieldKey}" data-value="${escapeHtml(item)}" aria-label="移除">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
    </span>
  `).join('');
}

// ============================================================================
// 事件绑定
// ============================================================================

function bindEvents() {
  // Tab 切换
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1);
    if (hash) switchTab(hash);
  });
  const initialHash = location.hash.slice(1);
  if (initialHash) switchTab(initialHash);

  // ── 通用 ──
  $('#opt-enabled').addEventListener('change', e => {
    config.enabled = e.target.checked;
    scheduleSave();
  });

  $$('#opt-sensitivity button').forEach(b => {
    b.addEventListener('click', () => {
      config.sensitivity = b.dataset.value;
      $$('#opt-sensitivity button').forEach(x => x.classList.toggle('active', x === b));
      scheduleSave();
    });
  });

  $$('#opt-hidemode input').forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) {
        config.hideMode = r.value;
        scheduleSave();
      }
    });
  });

  $('#opt-modules').addEventListener('change', (e) => {
    const target = e.target.closest('input[data-module]');
    if (!target) return;
    if (!config.modules) config.modules = {};
    config.modules[target.dataset.module] = target.checked;
    scheduleSave();
    renderRules();
  });

  // ── AI ──
  $('#opt-ai-enabled').addEventListener('change', e => {
    if (!config.ai) config.ai = { ...DEFAULT_CONFIG.ai };
    config.ai.enabled = e.target.checked;
    scheduleSave();
  });

  $('#opt-ai-provider').addEventListener('change', e => {
    if (!config.ai) config.ai = { ...DEFAULT_CONFIG.ai };
    const newProvider = e.target.value;
    config.ai.provider = newProvider;
    config.ai.baseURL = PROVIDERS[newProvider]?.baseURL || '';
    config.ai.model = PROVIDERS[newProvider]?.defaultModel || '';
    $('#opt-ai-provider-note').textContent = PROVIDERS[newProvider]?.note || '';
    renderModelOptions(newProvider);
    updateKeyLink(newProvider);
    $('#opt-ai-baseurl').value = config.ai.baseURL;
    scheduleSave();
  });

  $('#opt-ai-model').addEventListener('change', e => {
    if (!config.ai) config.ai = { ...DEFAULT_CONFIG.ai };
    config.ai.model = e.target.value;
    $('#opt-ai-model-custom').value = '';
    scheduleSave();
  });

  $('#opt-ai-model-custom').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) {
      if (!config.ai) config.ai = { ...DEFAULT_CONFIG.ai };
      config.ai.model = v;
      scheduleSave();
    }
  });

  $('#opt-ai-key').addEventListener('input', e => {
    if (!config.ai) config.ai = { ...DEFAULT_CONFIG.ai };
    config.ai.apiKey = e.target.value;
    scheduleSave();
  });

  $('#opt-ai-key-toggle').addEventListener('click', () => {
    const input = $('#opt-ai-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#opt-ai-baseurl').addEventListener('input', e => {
    if (!config.ai) config.ai = { ...DEFAULT_CONFIG.ai };
    config.ai.baseURL = e.target.value.trim();
    scheduleSave();
  });

  $('#opt-ai-timeout').addEventListener('input', e => {
    if (!config.ai) config.ai = { ...DEFAULT_CONFIG.ai };
    config.ai.timeoutMs = Math.max(2000, parseInt(e.target.value, 10) || 8000);
    scheduleSave();
  });

  $('#opt-ai-test').addEventListener('click', runSmokeTest);

  $('#stats-reset').addEventListener('click', async () => {
    const confirmed = await confirmModal({
      title: '重置统计',
      body: '清空 AI 调用、缓存命中和累计隐藏的计数。不会影响规则、缓存的判定或白名单。',
      confirmLabel: '重置'
    });
    if (!confirmed) return;
    config.stats = {
      totalHidden: 0, sessionHidden: 0,
      byCategory: {}, aiCalls: 0, cacheHits: 0, aiSpentTokens: 0
    };
    await saveConfig();
    renderAI();
    showToast('统计已重置');
  });

  // ── Prompt ──
  const editor = $('#prompt-editor');
  editor.addEventListener('input', updatePromptStatus);

  // 分类 / 复审 切换
  document.querySelectorAll('#prompt-switcher button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.prompt;
      if (target === activePromptKey) return;

      // 当前 prompt 有未保存修改时确认
      const def = PROMPT_DEFS[activePromptKey];
      const stored = config.ai?.[def.configKey] || '';
      const current = editor.value;
      const baseline = stored || def.defaultText;
      if (current !== baseline) {
        const confirmed = await confirmModal({
          title: '丢弃未保存修改？',
          body: `当前「${def.label}」有未保存的修改。切换会丢失这些修改。`,
          confirmLabel: '丢弃并切换',
          cancelLabel: '继续编辑'
        });
        if (!confirmed) return;
      }
      activePromptKey = target;
      renderPrompt();
    });
  });

  $('#prompt-save').addEventListener('click', async () => {
    if (!config.ai) config.ai = { ...DEFAULT_CONFIG.ai };
    const def = PROMPT_DEFS[activePromptKey];
    const value = editor.value;
    // 与默认值相同 → 存空字符串（让 background 走默认逻辑）
    config.ai[def.configKey] = value === def.defaultText ? '' : value;
    await saveConfig();
    updatePromptStatus();
    showToast(`${def.label} 已保存`);
  });

  $('#prompt-reset').addEventListener('click', async () => {
    const def = PROMPT_DEFS[activePromptKey];
    const confirmed = await confirmModal({
      title: `恢复默认${def.label}`,
      body: `当前的自定义${def.label}将被丢弃，恢复为内置默认值。此操作不可撤销。`,
      confirmLabel: '恢复默认'
    });
    if (!confirmed) return;
    editor.value = def.defaultText;
    if (config.ai) config.ai[def.configKey] = '';
    await saveConfig();
    updatePromptStatus();
    showToast(`已恢复为默认${def.label}`);
  });

  // ── 规则 ──
  bindChipInput('#custom-keyword-input', 'customKeywords', (v) => v.toLowerCase());

  // ── 学习规则 ──
  $('#learned-rules-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.cache-action-btn');
    if (!btn) return;
    const row = btn.closest('.learned-rule');
    const id = row?.dataset.id;
    if (!id) return;
    const rules = config.learnedRules || [];
    const idx = rules.findIndex(r => r.id === id);
    if (idx < 0) return;

    if (btn.dataset.action === 'toggle') {
      rules[idx].enabled = rules[idx].enabled === false ? true : false;
      await saveConfig();
      renderLearnedRules();
      showToast(rules[idx].enabled ? '规则已启用' : '规则已禁用');
    } else if (btn.dataset.action === 'delete') {
      const removed = rules[idx];
      rules.splice(idx, 1);
      config.learnedRules = rules;
      await saveConfig();
      renderLearnedRules();
      showToast(`已删除规则「${removed.value.slice(0, 30)}」`);
    }
  });

  $('#learned-rules-clear').addEventListener('click', async () => {
    const total = (config.learnedRules || []).length;
    if (total === 0) {
      showToast('暂无已学习的规则');
      return;
    }
    const confirmed = await confirmModal({
      title: '清空学习规则',
      body: `将删除 ${total} 条 AI 学到的规则。下次遇到这些 spam 模式会重新触发 AI 调用。`,
      confirmLabel: '清空'
    });
    if (!confirmed) return;
    config.learnedRules = [];
    await saveConfig();
    renderLearnedRules();
    showToast('学习规则已清空');
  });

  // ── 反馈历史 ──
  $('#badcase-clear').addEventListener('click', async () => {
    const total = (config.badCases || []).length;
    if (total === 0) {
      showToast('暂无反馈记录');
      return;
    }
    const confirmed = await confirmModal({
      title: '清空反馈历史',
      body: `将删除 ${total} 条反馈记录。已经应用到学习规则的修改不会被回滚。`,
      confirmLabel: '清空'
    });
    if (!confirmed) return;
    config.badCases = [];
    await saveConfig();
    renderBadCases();
    showToast('反馈历史已清空');
  });

  // ── 缓存 ──
  $('#cache-search').addEventListener('input', renderCache);
  $('#cache-filter').addEventListener('change', renderCache);

  $('#cache-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.cache-action-btn');
    if (!btn) return;
    const row = btn.closest('.cache-row');
    const handle = row?.dataset.handle;
    if (!handle) return;

    if (btn.dataset.action === 'delete') {
      delete cache[handle];
      await chrome.storage.local.set({ cache });
      renderCache();
      showToast(`已删除 ${handle}`);
    } else if (btn.dataset.action === 'flip') {
      const entry = cache[handle];
      if (!entry) return;
      entry.decision = entry.decision === 'spam' ? 'normal' : 'spam';
      entry.source = 'user';
      entry.ttl = Infinity;
      entry.evaluatedAt = Date.now();
      cache[handle] = entry;
      await chrome.storage.local.set({ cache });
      renderCache();
      showToast(`已改判 ${handle} → ${entry.decision === 'spam' ? '隐藏' : '放行'}`);
    }
  });

  $('#cache-clear').addEventListener('click', async () => {
    const confirmed = await confirmModal({
      title: '清空缓存',
      body: `将删除全部 ${Object.keys(cache).length} 条账号判定。下次访问会重新评估（如启用 AI 会消耗 token）。`,
      confirmLabel: '清空缓存'
    });
    if (!confirmed) return;
    cache = {};
    await chrome.storage.local.set({ cache });
    renderCache();
    showToast('缓存已清空');
  });

  $('#cache-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({
      format: 'tweetguard-cache-v1',
      exportedAt: Date.now(),
      entries: cache
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tweetguard-cache-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出缓存');
  });

  $('#cache-import').addEventListener('click', () => $('#import-file').click());

  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.format !== 'tweetguard-cache-v1') throw new Error('文件格式不正确');
      const incoming = data.entries || {};
      const merged = { ...cache };
      let added = 0;
      for (const [h, entry] of Object.entries(incoming)) {
        if (!merged[h] || (merged[h].evaluatedAt || 0) < (entry.evaluatedAt || 0)) {
          merged[h] = entry;
          added++;
        }
      }
      cache = merged;
      await chrome.storage.local.set({ cache });
      renderCache();
      showToast(`导入完成 · 新增 ${added} 条`);
    } catch (err) {
      showToast('导入失败：' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  // —— 完整配置备份 / 恢复(换设备迁移用)——
  $('#backup-export')?.addEventListener('click', () => {
    const c = config || {};
    const includeKey = !!$('#backup-include-key')?.checked;
    const backup = {
      format: 'tweetguard-backup-v1',
      exportedAt: Date.now(),
      appVersion: '0.1.0',
      includesApiKey: includeKey,
      config: {
        sensitivity: c.sensitivity,
        hideMode: c.hideMode,
        modules: c.modules,
        learnedRules: c.learnedRules || [],
        whitelist: c.whitelist || [],
        blacklist: c.blacklist || [],
        followingList: c.followingList || [],
        customKeywords: c.customKeywords || [],
        badCases: c.badCases || [],
        // AI 配置:默认抹掉 apiKey(敏感);仅当用户勾选「包含 API Key」时才完整导出
        ai: c.ai ? (includeKey ? { ...c.ai } : { ...c.ai, apiKey: '' }) : undefined
      },
      cache: cache || {}
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tweetguard-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(includeKey ? '已导出全部配置（含 API Key，请妥善保管）' : '已导出全部配置（不含 API Key）');
  });

  $('#backup-import')?.addEventListener('click', () => $('#backup-import-file').click());
  $('#backup-import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== 'tweetguard-backup-v1') throw new Error('不是 TweetGuard 备份文件');
      const inc = data.config || {};
      // 数组类:合并去重(保留现有 + 并入导入,不丢失本机已有数据)
      const mergeArr = (cur, add, key) => {
        const out = Array.isArray(cur) ? [...cur] : [];
        const seen = new Set(out.map(x => key ? key(x) : x));
        for (const item of (Array.isArray(add) ? add : [])) {
          const k = key ? key(item) : item;
          if (!seen.has(k)) { seen.add(k); out.push(item); }
        }
        return out;
      };
      config.whitelist      = mergeArr(config.whitelist, inc.whitelist);
      config.blacklist      = mergeArr(config.blacklist, inc.blacklist);
      config.followingList  = mergeArr(config.followingList, inc.followingList);
      config.customKeywords = mergeArr(config.customKeywords, inc.customKeywords);
      config.learnedRules   = mergeArr(config.learnedRules, inc.learnedRules, r => r.id || (r.kind + '|' + r.value));
      config.badCases       = mergeArr(config.badCases, inc.badCases, b => b.id || (b.handle + '|' + b.capturedAt));
      // 偏好:用导入值覆盖
      if (inc.sensitivity) config.sensitivity = inc.sensitivity;
      if (inc.hideMode) config.hideMode = inc.hideMode;
      if (inc.modules) config.modules = { ...config.modules, ...inc.modules };
      // AI 配置合并：优先保留本机已填的 key；本机没填则采用备份里的 key(支持含 Key 的完整迁移)
      if (inc.ai) {
        const keepKey = config.ai?.apiKey || inc.ai.apiKey || '';
        config.ai = { ...config.ai, ...inc.ai, apiKey: keepKey };
      }
      await saveConfig();
      // 识别账号缓存:同 handle 取较新
      if (data.cache && typeof data.cache === 'object') {
        const merged = { ...cache };
        for (const [h, entry] of Object.entries(data.cache)) {
          if (!merged[h] || (merged[h].evaluatedAt || 0) < (entry.evaluatedAt || 0)) merged[h] = entry;
        }
        cache = merged;
        await chrome.storage.local.set({ cache });
      }
      renderAll();
      showToast('配置导入完成 · 已合并到本机');
    } catch (err) {
      showToast('导入失败：' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  // —— GitHub 社区规则同步 ——
  $('#gh-enabled')?.addEventListener('change', (e) => {
    if (!config.githubSync) config.githubSync = {};
    config.githubSync.enabled = e.target.checked;
    scheduleSave();
  });
  // 社区规则地址已固定内置(COMMUNITY_RULES_URL)，不再提供编辑入口
  $('#gh-sync-now')?.addEventListener('click', async () => {
    const status = $('#gh-status');
    if (status) status.textContent = '同步中…';
    try {
      const r = await chrome.runtime.sendMessage({ type: 'github-sync-now' });
      const { config: fresh } = await chrome.storage.local.get('config');
      if (fresh) config = mergeConfig(fresh);
      if (r?.error) { if (status) status.textContent = '同步失败：' + r.error; }
      else { if (status) status.textContent = `同步成功 · 加载 ${r?.count ?? 0} 条`; }
      renderGithubSync();
      renderGithubRules();
    } catch (err) {
      if (status) status.textContent = '同步失败：' + (err.message || err);
    }
  });
  $('#gh-reset-disabled')?.addEventListener('click', async () => {
    config.githubRulesDisabled = [];
    await saveConfig();
    renderGithubSync();
    renderGithubRules();
    showToast('已重置：社区规则禁用清单已清空');
  });

  $('#gh-contribute')?.addEventListener('click', async () => {
    // 把本地学习规则(启用的 tweet_keyword)导出成「社区格式」——与同步拉取格式一致
    const rules = (config.learnedRules || [])
      .filter(r => r.enabled !== false && r.kind === 'tweet_keyword' && r.value)
      .map(r => ({ kind: 'tweet_keyword', value: r.value, category: r.category || 'cn_nsfw_bot' }));
    if (!rules.length) { showToast('没有可贡献的本地规则', 'error'); return; }
    const json = JSON.stringify({ format: 'tweetguard-rules-v1', rules }, null, 2);
    // 复制到剪贴板 + 下载文件(双保险，确保用户一定拿得到内容)
    try { await navigator.clipboard.writeText(json); } catch {}
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tweetguard-rules-contribution.json'; a.click();
    URL.revokeObjectURL(url);
    // 从同步 URL 推导仓库，直达 GitHub「新建文件」提交页(内容短则预填，长则打开仓库由你粘贴)
    const m = COMMUNITY_RULES_URL.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//);
    if (m) {
      const [, owner, repo, branch] = m;
      const fname = `contributions/${Date.now()}.json`;
      const pre = `https://github.com/${owner}/${repo}/new/${branch}?filename=${encodeURIComponent(fname)}&value=${encodeURIComponent(json)}`;
      window.open(pre.length < 7000 ? pre : `https://github.com/${owner}/${repo}`, '_blank');
    }
    showToast(`已复制 + 下载 ${rules.length} 条规则；在打开的 GitHub 页确认 / 粘贴后提 PR 即可`);
  });

  // 社区规则「否决 / 恢复」——写入 githubRulesDisabled，裁判优先于外部规则，同步不覆盖
  $('#gh-rules-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.gh-rule-toggle');
    if (!btn) return;
    const value = btn.closest('.gh-rule')?.dataset.value;
    if (!value) return;
    if (!Array.isArray(config.githubRulesDisabled)) config.githubRulesDisabled = [];
    const lc = value.toLowerCase();
    const idx = config.githubRulesDisabled.findIndex(v => String(v).toLowerCase() === lc);
    if (btn.dataset.action === 'veto') { if (idx < 0) config.githubRulesDisabled.push(value); }
    else if (idx >= 0) config.githubRulesDisabled.splice(idx, 1);
    await saveConfig();
    renderGithubRules();
    renderGithubSync();
  });

  // ── 名单 ──
  bindChipInput('#whitelist-input', 'whitelist', normalizeHandle);
  bindChipInput('#blacklist-input', 'blacklist', normalizeHandle);
  bindChipInput('#following-input', 'followingList', normalizeHandle);

  // 全局 chip 删除
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-remove');
    if (!btn) return;
    const field = btn.dataset.field;
    const value = btn.dataset.value;
    if (!field) return;
    config[field] = (config[field] || []).filter(v => v !== value);
    scheduleSave();
    renderAll();
  });

  $('#following-clear').addEventListener('click', async () => {
    const confirmed = await confirmModal({
      title: '清空关注列表',
      body: '清空后，关注用户将不再享有 -100 分保护。可重新访问你的 Following 页同步。',
      confirmLabel: '清空'
    });
    if (!confirmed) return;
    config.followingList = [];
    scheduleSave();
    renderLists();
  });
}

function bindChipInput(inputSel, fieldKey, normalize) {
  const input = $(inputSel);
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    const value = normalize ? normalize(raw) : raw;
    if (!value) return;
    if (!config[fieldKey]) config[fieldKey] = [];
    if (!config[fieldKey].includes(value)) {
      config[fieldKey].push(value);
      scheduleSave();
      renderAll();
    }
    input.value = '';
  });
}

function normalizeHandle(s) {
  s = s.trim();
  if (!s) return '';
  if (s.startsWith('@')) return s.toLowerCase();
  if (/^https?:\/\//i.test(s)) {
    const m = s.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i);
    if (m) return '@' + m[1].toLowerCase();
  }
  return '@' + s.toLowerCase().replace(/^@+/, '');
}

// ============================================================================
// Tab 路由
// ============================================================================

function switchTab(tabId) {
  if (!tabId) return;
  let found = false;
  $$('.nav-item').forEach(b => {
    const on = b.dataset.tab === tabId;
    b.classList.toggle('active', on);
    if (on) found = true;
  });
  $$('.tab').forEach(t => {
    t.hidden = t.dataset.tab !== tabId;
  });
  if (found && location.hash !== `#${tabId}`) {
    history.replaceState(null, '', `#${tabId}`);
  }
}

// ============================================================================
// AI Smoke test
// ============================================================================

async function runSmokeTest() {
  const btn = $('#opt-ai-test');
  const resultEl = $('#opt-ai-test-result');
  const detailEl = $('#opt-ai-test-detail');
  btn.disabled = true;
  btn.textContent = '测试中…';
  resultEl.textContent = '';
  resultEl.className = 'test-result';
  detailEl.innerHTML = '';

  try {
    const providerConfig = {
      provider: config.ai?.provider || 'deepseek',
      baseURL: config.ai?.baseURL || PROVIDERS[config.ai?.provider]?.baseURL || '',
      apiKey: config.ai?.apiKey || '',
      model: config.ai?.model || '',
      customPrompt: config.ai?.customPrompt || ''
    };
    const result = await chrome.runtime.sendMessage({
      type: 'ai-smoke-test',
      providerConfig
    });
    if (result?.error) {
      resultEl.className = 'test-result error';
      resultEl.innerHTML = `<strong>失败</strong> · ${escapeHtml(result.error)}`;
    } else {
      const acc = (result.accuracy * 100).toFixed(0);
      const cls = result.accuracy >= 0.8 ? 'ok' : result.accuracy >= 0.6 ? 'warn' : 'error';
      resultEl.className = `test-result ${cls}`;
      resultEl.innerHTML = `<strong>${result.correct} / ${result.total}</strong> · 准确率 ${acc}% · 耗时 ${result.durationMs}ms`;

      detailEl.innerHTML = result.cases.map(c => {
        const ok = c.correct;
        const expected = c.expected ? 'spam' : 'normal';
        const actual = c.error ? `error: ${c.error}` : (c.actual?.is_spam ? `spam (${c.actual.confidence}%)` : `normal (${c.actual?.confidence || 0}%)`);
        return `
          <div class="test-case">
            <span class="test-case-icon ${ok ? 'ok' : 'fail'}"></span>
            <div class="test-case-content">
              <div class="test-case-handle">${escapeHtml(c.input.handle)} · ${escapeHtml(c.input.display_name)}</div>
              <div class="test-case-detail">期望 ${expected} → 实际 ${escapeHtml(actual)}${c.actual?.reasoning ? ' · ' + escapeHtml(c.actual.reasoning) : ''}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    resultEl.className = 'test-result error';
    resultEl.innerHTML = `<strong>失败</strong> · ${escapeHtml(err.message || String(err))}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '运行测试';
  }
}

// ============================================================================
// Modal
// ============================================================================

function confirmModal({ title, body, confirmLabel = '确认', cancelLabel = '取消' }) {
  return new Promise((resolve) => {
    const modal = $('#modal');
    $('#modal-title').textContent = title;
    $('#modal-body').textContent = body;
    $('#modal-confirm').textContent = confirmLabel;
    $('#modal-cancel').textContent = cancelLabel;
    modal.hidden = false;

    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => { if (e.target === modal.querySelector('.modal-backdrop')) onCancel(); };
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };

    function cleanup() {
      modal.hidden = true;
      $('#modal-confirm').removeEventListener('click', onConfirm);
      $('#modal-cancel').removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
    }

    $('#modal-confirm').addEventListener('click', onConfirm);
    $('#modal-cancel').addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

// ============================================================================
// Toast
// ============================================================================

function showToast(text, kind = 'default') {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ============================================================================
// Util
// ============================================================================

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatNumber(n) {
  n = Math.floor(n || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString();
}

// ============================================================================
// 监听 storage 变化
// ============================================================================

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.config) {
    config = mergeConfig(changes.config.newValue);
    // 只更新可见 tab 的某些部分，避免破坏用户当前输入
    const active = document.querySelector('.nav-item.active')?.dataset.tab;
    if (active === 'cache') renderCache();
    if (active === 'rules') {
      renderLearnedRules();
      renderBadCases();
    }
    if (active === 'ai' || active === 'general') {
      const aiCalls = config.stats?.aiCalls || 0;
      const cacheHits = config.stats?.cacheHits || 0;
      const total = config.stats?.totalHidden || 0;
      if ($('#stat-ai-calls')) $('#stat-ai-calls').textContent = formatNumber(aiCalls);
      if ($('#stat-cache-hits')) $('#stat-cache-hits').textContent = formatNumber(cacheHits);
      if ($('#stat-total-hidden')) $('#stat-total-hidden').textContent = formatNumber(total);
    }
  }
  if (changes.cache) {
    cache = changes.cache.newValue || {};
    if (document.querySelector('.nav-item.active')?.dataset.tab === 'cache') {
      renderCache();
    }
  }
});

// ============================================================================
// Boot
// ============================================================================

bindEvents();
loadAll();
