// TweetGuard content script (isolated world bridge)
// 职责：
//   1. 把 inject.js 注入到 X.com 的页面 context（让它能挂载到 React DOM）
//   2. 桥接 chrome.storage / chrome.runtime 和 page-context 之间的通信
//   3. 处理 AI 调用的代理（页面 CSP 限制 → 走 background fetch）

(function () {
  'use strict';

  // 当扩展被刷新/升级，旧页面里的本脚本会进入 "context invalidated" 状态
  // 任何后续 chrome.* API 调用都会抛错。我们用这个守卫优雅退场。
  function isExtensionAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }
  function isContextInvalidatedError(err) {
    return err && /Extension context invalidated|Extension manifest must request permission/i.test(err.message || '');
  }

  if (!isExtensionAlive()) return;

  const SCRIPT_URL = chrome.runtime.getURL('src/inject.js');

  // 注入主体脚本到页面 world
  function injectMainScript() {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.dataset.tgBootstrap = '1';
    script.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(script);
  }

  // 把初始配置以 <script type="application/json"> 的方式塞进 DOM
  // inject.js 启动时同步读取，避免异步等待造成 FOUC 窗口
  function provideInitialConfig(config) {
    let node = document.getElementById('tg-initial-config');
    if (!node) {
      node = document.createElement('script');
      node.id = 'tg-initial-config';
      node.type = 'application/json';
      (document.head || document.documentElement).appendChild(node);
    }
    node.textContent = JSON.stringify(config || {});
  }

  // 1. 同步读取 storage
  try {
    chrome.storage.local.get(null, (data) => {
      if (chrome.runtime.lastError) {
        // context invalidated 之类，静默
        return;
      }
      provideInitialConfig({
        config: data?.config || {},
        cache: data?.cache || {}
      });
      injectMainScript();
    });
  } catch (e) {
    if (!isContextInvalidatedError(e)) console.warn('[TweetGuard] init failed:', e);
  }

  // 2. storage 变化时通过 postMessage 推送给 inject
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.config) {
        window.postMessage({
          source: 'tg-content',
          type: 'config-update',
          data: changes.config.newValue
        }, '*');
      }
    });
  } catch (e) {
    if (!isContextInvalidatedError(e)) console.warn('[TweetGuard] onChanged hook failed:', e);
  }

  // 3. 接收 inject 的请求
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'tg-page') return;

    // 扩展上下文已失效 → 静默退场（新的 content.js 会接手）
    if (!isExtensionAlive()) return;

    try {
    switch (msg.type) {
      case 'save-config': {
        const current = await chrome.storage.local.get('config');
        const merged = deepMerge(current.config || {}, msg.data);
        await chrome.storage.local.set({ config: merged });
        break;
      }

      // ── learnedRules 原子写：串行处理 + 基于最新 storage 读改写，避免被 config-update 整体覆盖冲掉 ──
      case 'add-learned-rule': {
        const { config: cfg = {} } = await chrome.storage.local.get('config');
        if (!Array.isArray(cfg.learnedRules)) cfg.learnedRules = [];
        const rule = msg.rule;
        if (rule && rule.value) {
          const lc = String(rule.value).toLowerCase();
          const dup = cfg.learnedRules.some(r => r.kind === rule.kind && String(r.value).toLowerCase() === lc);
          if (!dup) {
            cfg.learnedRules.push(rule);
            await chrome.storage.local.set({ config: cfg });
          }
        }
        break;
      }
      case 'patch-learned-rule': {
        const { config: cfg = {} } = await chrome.storage.local.get('config');
        const rule = (cfg.learnedRules || []).find(r => r.id === msg.id);
        if (rule) {
          Object.assign(rule, msg.patch || {});
          await chrome.storage.local.set({ config: cfg });
        }
        break;
      }
      case 'bump-learned-hits': {
        const { config: cfg = {} } = await chrome.storage.local.get('config');
        let changed = false;
        for (const [id, delta] of Object.entries(msg.hits || {})) {
          const rule = (cfg.learnedRules || []).find(r => r.id === id);
          if (rule) {
            rule.hitCount = (rule.hitCount || 0) + delta;
            rule.lastHitAt = Date.now();
            changed = true;
          }
        }
        if (changed) await chrome.storage.local.set({ config: cfg });
        break;
      }

      case 'save-cache-entry': {
        const current = await chrome.storage.local.get('cache');
        const cache = current.cache || {};
        cache[msg.handle] = msg.entry;
        // 简单 LRU：超过 30000 时按 lastAccessedAt 淘汰到 25000
        const keys = Object.keys(cache);
        if (keys.length > 30000) {
          const sorted = keys
            .map(k => [k, cache[k].lastAccessedAt || cache[k].evaluatedAt || 0])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25000)
            .map(([k]) => k);
          const kept = {};
          for (const k of sorted) kept[k] = cache[k];
          await chrome.storage.local.set({ cache: kept });
        } else {
          await chrome.storage.local.set({ cache });
        }
        break;
      }

      case 'delete-cache-entry': {
        const current = await chrome.storage.local.get('cache');
        const cache = current.cache || {};
        delete cache[msg.handle];
        await chrome.storage.local.set({ cache });
        break;
      }

      case 'clear-cache-by-source': {
        // 批量清除某来源的缓存（用于规则版本升级时回收 rule-cache）
        const current = await chrome.storage.local.get('cache');
        const cache = current.cache || {};
        const wantSource = msg.source;
        const wantDecision = msg.decision;        // 可选过滤
        let cleared = 0;
        for (const handle of Object.keys(cache)) {
          const e = cache[handle];
          if (!e) continue;
          if (wantSource && e.source !== wantSource) continue;
          if (wantDecision && e.decision !== wantDecision) continue;
          delete cache[handle];
          cleared++;
        }
        if (cleared > 0) await chrome.storage.local.set({ cache });
        break;
      }

      case 'update-stats': {
        const current = await chrome.storage.local.get('config');
        const config = current.config || {};
        config.stats = deepMerge(config.stats || {}, msg.data);
        await chrome.storage.local.set({ config });
        break;
      }

      case 'ai-evaluate': {
        // 转发到 background 做 fetch（避开页面 CSP）
        try {
          const result = await chrome.runtime.sendMessage({
            type: 'ai-evaluate',
            input: msg.input,
            requestId: msg.requestId
          });
          window.postMessage({
            source: 'tg-content',
            type: 'ai-response',
            requestId: msg.requestId,
            result
          }, '*');
        } catch (err) {
          window.postMessage({
            source: 'tg-content',
            type: 'ai-response',
            requestId: msg.requestId,
            result: { error: err.message || String(err) }
          }, '*');
        }
        break;
      }

      case 'ai-smoke-test': {
        try {
          const result = await chrome.runtime.sendMessage({
            type: 'ai-smoke-test',
            providerConfig: msg.providerConfig
          });
          window.postMessage({
            source: 'tg-content',
            type: 'ai-smoke-response',
            requestId: msg.requestId,
            result
          }, '*');
        } catch (err) {
          window.postMessage({
            source: 'tg-content',
            type: 'ai-smoke-response',
            requestId: msg.requestId,
            result: { error: err.message || String(err) }
          }, '*');
        }
        break;
      }

      case 'ai-review-bad-case': {
        try {
          const result = await chrome.runtime.sendMessage({
            type: 'ai-review-bad-case',
            payload: msg.payload
          });
          window.postMessage({
            source: 'tg-content',
            type: 'ai-review-response',
            requestId: msg.requestId,
            result
          }, '*');
        } catch (err) {
          window.postMessage({
            source: 'tg-content',
            type: 'ai-review-response',
            requestId: msg.requestId,
            result: { error: err.message || String(err) }
          }, '*');
        }
        break;
      }

      case 'save-badcase': {
        const current = await chrome.storage.local.get('config');
        const config = current.config || {};
        config.badCases = config.badCases || [];
        config.badCases.unshift(msg.entry);     // 最新的排前面
        if (config.badCases.length > 100) config.badCases.length = 100;
        await chrome.storage.local.set({ config });
        break;
      }
    }
    } catch (err) {
      // 几乎肯定是 "Extension context invalidated" —— 旧 content.js 残留
      // 在 chrome.* API 上抛出。静默退场，新版会在下次页面刷新时接手。
      if (isContextInvalidatedError(err)) return;
      console.warn('[TweetGuard] handler error:', err);
    }
  });

  function deepMerge(target, source) {
    const out = Array.isArray(target) ? [...target] : { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
      ) {
        out[key] = deepMerge(target[key], source[key]);
      } else if (source[key] !== undefined) {
        out[key] = source[key];
      }
    }
    return out;
  }
})();
