import { DEFAULT_CONFIG, PROVIDERS, mergeConfig } from '../src/defaults.js';

const $ = (sel) => document.querySelector(sel);

let config = null;

async function loadConfig() {
  const { config: stored } = await chrome.storage.local.get('config');
  config = mergeConfig(stored);
  render();
}

async function saveConfig(patch) {
  config = deepMerge(config, patch);
  await chrome.storage.local.set({ config });
  render();
}

function deepMerge(target, source) {
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const key of Object.keys(source || {})) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function render() {
  // Toggle
  $('#enabled-toggle').checked = config.enabled !== false;

  // Stats
  const totalHidden = config.stats?.totalHidden || 0;
  const sessionHidden = config.stats?.sessionHidden || 0;
  $('#stats-hidden').textContent = formatNumber(totalHidden);

  const aiCalls = config.stats?.aiCalls || 0;
  const cacheHits = config.stats?.cacheHits || 0;
  const ruleHits = Math.max(0, totalHidden - aiCalls - cacheHits);
  $('#stats-rule').textContent = formatNumber(ruleHits);
  $('#stats-ai').textContent = formatNumber(aiCalls);
  $('#stats-cache').textContent = formatNumber(cacheHits);

  // Sensitivity
  document.querySelectorAll('#sensitivity-control button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === config.sensitivity);
  });

  // Hide mode
  document.querySelectorAll('input[name="hidemode"]').forEach(r => {
    r.checked = r.value === config.hideMode;
  });

  // AI status
  const aiBlock = $('#ai-status-block');
  const aiText = $('#ai-status-text');
  const aiMeta = $('#ai-status-meta');
  if (config.ai?.enabled) {
    const providerLabel = PROVIDERS[config.ai.provider]?.label || config.ai.provider;
    const hasKey = config.ai.apiKey || config.ai.provider === 'ollama';
    if (!hasKey) {
      aiBlock.dataset.on = '0';
      aiBlock.dataset.error = '1';
      aiText.textContent = `${providerLabel} · 缺少 API Key`;
      aiMeta.textContent = '前往设置完成配置';
    } else {
      aiBlock.dataset.on = '1';
      aiBlock.dataset.error = '0';
      aiText.textContent = `${providerLabel} · ${config.ai.model}`;
      aiMeta.textContent = `本月调用 ${aiCalls} · 缓存命中 ${cacheHits}`;
    }
  } else {
    aiBlock.dataset.on = '0';
    aiBlock.dataset.error = '0';
    aiText.textContent = 'AI 未启用 · 仅使用规则';
    aiMeta.textContent = '前往设置启用 AI 以提升覆盖率';
  }
}

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n || 0);
}

function bindEvents() {
  $('#enabled-toggle').addEventListener('change', (e) => {
    saveConfig({ enabled: e.target.checked });
  });

  document.querySelectorAll('#sensitivity-control button').forEach(btn => {
    btn.addEventListener('click', () => {
      saveConfig({ sensitivity: btn.dataset.value });
    });
  });

  document.querySelectorAll('input[name="hidemode"]').forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) saveConfig({ hideMode: r.value });
    });
  });

  $('#open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  $('#open-cache').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    // 通过 hash 跳到缓存 tab（options 启动时读 hash）
    chrome.tabs.query({ url: chrome.runtime.getURL('options/options.html') }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: chrome.runtime.getURL('options/options.html#cache') });
      }
    });
    window.close();
  });
}

// 监听 storage 变化（其他页面/inject 改了配置，popup 实时同步）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.config) {
    config = mergeConfig(changes.config.newValue);
    render();
  }
});

bindEvents();
loadConfig();
