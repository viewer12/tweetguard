// TweetGuard inject.js — 在 X.com 页面 context 运行的主体脚本
// 职责：DOM 观察、数据抽取、L0 规则评分、缓存、AI 异步评估、平滑过渡 actuator
//
// 注：本文件是 page-world script，不能用 chrome.* API。
// 与 content.js 通过 window.postMessage 双向通信。

(function () {
  'use strict';

  // ===========================================================================
  // §0 初始化：读取 content.js 注入的 initial config
  // ===========================================================================

  const initialConfigNode = document.getElementById('tg-initial-config');
  let bootstrap = { config: {}, cache: {} };
  if (initialConfigNode) {
    try { bootstrap = JSON.parse(initialConfigNode.textContent); } catch (e) { /* noop */ }
  }

  let config = mergeWithDefaults(bootstrap.config);
  let cache = bootstrap.cache || {};

  // ===========================================================================
  // §1 默认配置（inject.js 自带副本，因为 page-context 不能 import）
  // ===========================================================================

  function getDefaultConfig() {
    return {
      version: 1,
      enabled: true,
      sensitivity: 'standard',
      hideMode: 'breadcrumb',
      modules: {
        cn_nsfw_bot: true, crypto_shill: true, nsfw: true,
        cn_marketing: true, engagement_bait: true, ai_filler: false
      },
      ai: {
        enabled: false, provider: 'deepseek', apiKey: '',
        model: 'deepseek-chat', baseURL: 'https://api.deepseek.com/v1',
        customPrompt: '', timeoutMs: 8000, batchSize: 1
      },
      whitelist: [], blacklist: [], followingList: [], customKeywords: [],
      stats: {
        totalHidden: 0, sessionHidden: 0,
        byCategory: {},
        aiCalls: 0, cacheHits: 0
      }
    };
  }

  function mergeWithDefaults(stored) {
    return deepMerge(getDefaultConfig(), stored || {});
  }

  function deepMerge(target, source) {
    const out = Array.isArray(target) ? [...target] : { ...target };
    for (const key of Object.keys(source || {})) {
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

  // 规则版本号：bump 此值会令旧版规则下"判为正常"的缓存全部失效（spam 缓存保留）
  // V7: AI 学习规则只允许 tweet_keyword（移除 displayname_keyword / displayname_regex）
  // V6: 完全移除 username 维度判定（A1/A6/A7/N3 + R2/R8/R9/R11 + AI 禁止学 username_regex）
  // V5: A1 进一步弱化 + 自动禁用过宽 learned regex / V4: verified 保护 + 弱化 A1/N3
  const RULES_VERSION = 7;

  const SENSITIVITY = {
    // aiTrigger: L0 分数 ≥ 此值才进灰区调 AI
    //   保守 30：只让 AI 看"有明显信号"的，省 token
    //   标准 15：平衡覆盖率与成本
    //   激进  0：AI 评估所有未缓存推文，最大覆盖率，token 消耗 3-5x
    conservative: { hide: 80, blur: 65, aiTrigger: 30 },
    standard:     { hide: 70, blur: 50, aiTrigger: 15 },
    aggressive:   { hide: 55, blur: 40, aiTrigger:  0 }
  };

  const CACHE_TTL = {
    spamHigh: Infinity,
    spam: 90 * 86400_000,
    normalHigh: 90 * 86400_000,
    normal: 30 * 86400_000,
    borderline: 7 * 86400_000
  };

  // ===========================================================================
  // §2 预编译规则（启动时一次性编译，常量化）
  // ===========================================================================

  const RX = Object.freeze({
    // —— 用户名 ——
    // —— V6 移除：所有 username 维度的正则 ——
    // 原因：handle 是不稳定信号（亚洲用户大量使用罗马名+数字格式），高假阳性 + 低召回
    // 注：user 自己的黑名单 / 关注列表保护仍然按 handle 匹配（那是精确匹配，不是模式）
    // 已移除：username_tier1 / username_tier2 / username_nsfw / username_crypto
    // —— 中文 NSFW 显示名 KILLER ——
    cn_nsfw_killer: [
      /寻\s*[固找约]?\s*炮/,
      /约\s*[炮p]/i,
      /炮\s*友/,
      /找\s*男\s*友/, /找\s*老\s*公/,
      /单\s*身\s*找/, /寂\s*寞\s*找/,
      /点[击我]?\s*主\s*页/,
      /[查看进]\s*主\s*页/,
      /(老\s*司\s*机|司\s*机)\s*带/,
      /资\s*源\s*[分有看]/,
      /(嫩\s*妹|学\s*妹|空\s*姐|护\s*士)/,
      /大\s*胆\s*[露漏]/,
      /\d+\s*[岁y]\s*[找寻约]/
    ],
    cn_nsfw_strong: [
      /(寂寞|无聊|空闲|在家)\s*([找想等])/,
      /(单身|想恋爱|想脱单)\s*\d*/,
      /(刺激|福利|你懂)\s*[的吧]/,
      /(等你|想你|来撩|来聊)/,
      /(加\s*[Vv微Ｖ])|(加\s*[Tt][Gg])|(电\s*报|纸\s*飞\s*机)/
    ],
    // —— 加密 ——
    crypto_killer: [
      /\b\d{2,4}00x\b/i,
      /0x[a-fA-F0-9]{40}\b/,
      /\bpump\.fun\/[a-zA-Z0-9]{20,}/,
      /\bdexscreener\.com\/[a-z]+\/0x[a-fA-F0-9]+/i
    ],
    crypto_strong: [
      /\bmoonshot\b/i, /\bape\s+in\b/i,
      /\b(buy|ape|get\s+in)\s+(now|fast|quick|asap)\b/i,
      /\bgem\b\s+(found|alert|spotted)/i,
      /\bnext\s+(\$?\w+|big\s+thing)\b/i,
      /\b(send|pump)\s+it\b/i,
      /\b(presale|fair\s+launch|stealth\s+launch)\b/i,
      /\blow\s*cap\s+(gem|play|alpha)/i,
      /\b(dm|message)\s+(me\s+)?for\s+(alpha|signal|call)/i
    ],
    // —— 英文 NSFW ——
    nsfw_killer: [
      /\bcheck\s+(my|the)\s+bio\b/i,
      /\blink\s+(in|on)\s+(my\s+)?bio\b/i,
      /\bbio\s+link\b/i,
      /\b(open|slide\s+in(to)?)\s+(my\s+)?dms?\b/i,
      /\bdm\s+(me\s+)?(for|baby|daddy)\b/i,
      /\b(onlyfans|fansly|chaturbate)\b/i,
      /\b(OF|0F)\s+(link|account|girl)/i,
      /\b18\+\s*(only|content)/i,
      /\bspicy\s+(content|pics?|vids?)\b/i
    ],
    // —— 中文/罗马化 NSFW 推文关键词（针对显示名"干净"但正文是粗口的变种）——
    cn_tweet_nsfw_killer: [
      /sao\s*(货|妹|姐|妞|逼)/i,         // sao货 / sao妹
      /骚\s*(货|妹|姐|逼|妇)/,            // 骚货 直白版
      /(淫|荡)\s*(货|妇|妹|娃)/,         // 淫货 / 荡妇
      /(嫖|约|找)\s*[炮p]\s*友?/i,
      /(私信|私聊|私我|d\s*我|dm)\s*(看|要|找|有|加)/i,
      /(肏|操|艹)\s*(我|她|他|你)/,
      /(没人|没有人).{0,3}(比|有).{0,5}(sao|骚|浪|淫)/i,  // "没人比她sao"
      /(浪|淫|sao)\s*(到|得|出)/i
    ],
    // —— 中文营销 ——
    cn_marketing_killer: [
      /返佣(\d|高|无限)?/, /撸毛/, /撸空投/, /薅羊毛/, /躺赚/,
      /月入[一二三四五六七八九十0-9]+(刀|美金|万|w|k)/i,
      /日(入|赚)[0-9]+/,
      /(财富|金钱)\s*自由/, /被动收入/
    ],
    cn_marketing_strong: [
      /代付/, /搬砖/, /教程\s*(免费|私聊|私我|发你)/,
      /(加|联系)\s*(微信|VX|TG|电报|纸飞机)/i,
      /交易所\s*(返佣|开户|福利|奖励)/, /拉新/, /推广员/
    ],
    // —— 互动诱饵 ——
    bait: [
      /\bRT\s+(if|for)\s+(you\s+)?(agree|want)/i,
      /\blike\s+(if|for|this)\s+(you|to)\b/i,
      /\brepost\s+(if|this|to)\b/i,
      /\b(comment|reply)\s+(yes|no|below|with)\b/i,
      /\b(tag|follow)\s+(a\s+friend|me|3|5)\b/i,
      /\bdrop\s+(a|your)\s+\w+\s+(below|here)\b/i
    ],
    // —— emoji ——
    emoji_match: /\p{Extended_Pictographic}/gu,
    separator_emoji: /[🌸💕✨🌺💖🌹🌷❤️💗💓💞🍑🔞⭐️🌙💫🎀]/u,
    nsfw_emoji: /[🔞🍑🍆💋💦👅👙🩱]/u,
    crypto_emoji: /[🔥💎🚀💰📈📊💸🌙]/u,
    pointing_emoji: /^[👆👇👈👉☝️🔝]/u,
    cjk: /[一-鿿぀-ヿ가-힯]/,
    // —— 短链 ——
    shortlink: /\b(t\.me|bit\.ly|tinyurl|cutt\.ly|linktr\.ee|lnkd\.in|shorturl\.at|rebrand\.ly)\//i,
    // V6 移除 western_handle_digits（基于 handle 判定不可靠）
    // 保留 western_full_name —— 这是 displayName 的判定，非 handle
    western_full_name: /^[A-Z][a-z]+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/,
    // —— $ticker ——
    ticker: /\$([A-Z]{2,8})\b/g,
    // —— 通用赞美 ——
    generic_praise: [
      /^(great|amazing|awesome|excellent|wonderful|fantastic|incredible|powerful|fire)\s+(post|thread|take|point|insight|content)\.?!?$/i,
      /^(100%|totally|absolutely|completely)\s+(agree|this|right|true)\.?!?$/i,
      /^well\s+said\.?!?$/i,
      /^this[\s.!]*$/, /^facts?[\s.!]*$/i, /^based[\s.!]*$/i, /^💯+$/
    ]
  });

  const TICKER_WHITELIST = new Set(['BTC','ETH','SOL','DOGE','XRP','ADA','BNB','USDT','USDC','LTC','TON','BCH','TRX','DOT']);

  // ===========================================================================
  // §3 DOM 数据抽取
  // ===========================================================================

  // V6 已移除 looksRandomWord（属于 username 维度判定，配合 A7 一起移除）

  function extractTextWithEmoji(el) {
    if (!el) return '';
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        text += node.textContent;
      } else if (node.nodeType === 1) {
        if (node.tagName === 'IMG' && node.alt) {
          text += node.alt; // X 把 emoji 渲染为 img alt
        } else if (node.tagName === 'BR') {
          text += '\n';     // 显式换行
        } else {
          text += extractTextWithEmoji(node);
        }
      }
    }
    return text;
  }

  function extractTweetData(article) {
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    if (!userNameEl) return null;

    // 显示名（第一个 span 通常是名字，第二个是 @handle 链接）
    const links = userNameEl.querySelectorAll('a[href^="/"]');
    let handle = '';
    if (links.length > 0) {
      const href = links[links.length - 1].getAttribute('href') || '';
      const m = href.match(/^\/([A-Za-z0-9_]+)(?:\/|$)/);
      if (m) handle = '@' + m[1];
    }
    // displayName 是 User-Name 中第一个 link 之前的那段（X 用嵌套 div/span）
    // 用一个稳健做法：取所有 text 节点，去掉 handle 部分
    let displayName = extractTextWithEmoji(userNameEl);
    // 去除尾部的 handle 和时间戳
    displayName = displayName.replace(handle, '').trim();
    // 去除尾部的 "· 12h" 形式
    displayName = displayName.replace(/·\s*\d+[smhdwy]\s*$/i, '').trim();
    // 去除 "Replying to" 等噪音（在某些布局下出现）
    displayName = displayName.split('\n')[0].trim();

    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    const tweetText = tweetTextEl ? extractTextWithEmoji(tweetTextEl) : '';

    const verified = !!article.querySelector('svg[data-testid="icon-verified"]');

    // 是否为回复（找 "Replying to" 标记）
    const replyHeader = article.querySelector('[id^="id__"][aria-labelledby]') ||
                        Array.from(article.querySelectorAll('div'))
                          .find(d => /^Replying to/i.test(d.textContent || '') && d.textContent.length < 200);
    const isReply = !!replyHeader;

    // 外链
    const externalLinks = Array.from(article.querySelectorAll('a[role="link"][href]'))
      .map(a => a.href)
      .filter(h => h && !h.includes('x.com') && !h.includes('twitter.com'));

    // 头像
    const avatarImg = article.querySelector('[data-testid="Tweet-User-Avatar"] img, [data-testid="UserAvatar-Container-unknown"] img');
    const avatarSrc = avatarImg?.src || '';
    const defaultAvatar = !avatarSrc || avatarSrc.includes('default_profile') || avatarSrc.includes('sticker_default');

    return {
      handle: handle.toLowerCase(),
      displayName,
      tweetText,
      verified,
      isReply,
      externalLinks,
      defaultAvatar,
      avatarSrc
    };
  }

  // ===========================================================================
  // §4 L0 规则评分引擎
  // ===========================================================================

  function evaluateL0(data) {
    const reasons = [];
    let score = 0;
    const enabledModules = config.modules || {};

    // —— 黑名单 ——
    if (config.blacklist?.some(h => h.toLowerCase() === data.handle)) {
      return { score: 100, hide: true, hard: true, category: 'bot_farm', reasons: ['blacklisted'] };
    }
    // —— 白名单 ——
    if (config.whitelist?.some(h => h.toLowerCase() === data.handle)) {
      return { score: -100, hide: false, protected: true, category: 'normal', reasons: ['whitelisted'] };
    }
    // —— 关注列表保护 ——
    const followed = config.followingList?.some(h => h.toLowerCase() === data.handle);
    if (followed) score -= 100;

    // ============ 硬规则（直接 100） ============
    // 注：V6 起所有硬规则只能基于 displayName / 推文内容 / 上下文，不允许基于 handle
    // 已移除：R2 (NSFW handle + ...) / R8 (...+ handle) / R9 (...+ handle) / R11 (...+ handle)

    // R7: CN NSFW 显示名 killer
    if (enabledModules.cn_nsfw_bot && RX.cn_nsfw_killer.some(r => r.test(data.displayName))) {
      return { score: 100, hide: true, hard: true, category: 'cn_nsfw_bot', reasons: ['R7: CN NSFW killer in display name'] };
    }
    // R10: 加微/加TG 类引流 + 是回复
    if (enabledModules.cn_nsfw_bot && /(加\s*[Vv微Ｖ])|(加\s*[Tt][Gg])|(电\s*报|纸\s*飞\s*机)/.test(data.displayName) && data.isReply) {
      return { score: 100, hide: true, hard: true, category: 'cn_nsfw_bot', reasons: ['R10: contact keyword in display name + reply'] };
    }

    // —— Tweet 内容特征（提前抽取，多处用）——
    const tweetEmojiCount = (data.tweetText.match(RX.emoji_match) || []).length;
    const hasRealWord = /[a-zA-Z]{3,}|[一-鿿]{2,}/.test(data.tweetText);
    const nearPureEmoji = !hasRealWord && tweetEmojiCount >= 3;
    const _tokens = data.tweetText.split(/[\s\n]+/).filter(t => t.trim());
    const emojiClusters = _tokens.filter(t => /[\p{Extended_Pictographic}]/u.test(t)).length;
    const multiClusterEmoji = emojiClusters >= 3;
    const isFullName = RX.western_full_name.test(data.displayName.trim());
    const segments = data.displayName.split(RX.separator_emoji).map(s => s.trim()).filter(Boolean);

    // R4: OnlyFans/Fansly in displayName + reply
    if (enabledModules.nsfw && /onlyfans|fansly|chaturbate/i.test(data.displayName) && data.isReply) {
      return { score: 100, hide: true, hard: true, category: 'nsfw_solicitation', reasons: ['R4: OnlyFans/Fansly in display name + reply'] };
    }
    // R6: 4+ NSFW emoji in display name
    const nsfwEmojiCount = (data.displayName.match(new RegExp(RX.nsfw_emoji.source, 'gu')) || []).length;
    if (enabledModules.nsfw && nsfwEmojiCount >= 4) {
      return { score: 100, hide: true, hard: true, category: 'nsfw_solicitation', reasons: ['R6: 4+ NSFW emoji in display name'] };
    }
    // R3: pump.fun 链接 + reply
    if (enabledModules.crypto_shill && /pump\.fun\/[a-zA-Z0-9]{20,}/.test(data.tweetText) && data.isReply) {
      return { score: 100, hide: true, hard: true, category: 'crypto_shill', reasons: ['R3: pump.fun link + reply'] };
    }

    // ============ 评分信号 ============
    let category = 'normal';

    // —— N1: CN NSFW 显示名（非 killer 等级）已经在 R7 处理；此处加 strong
    if (enabledModules.cn_nsfw_bot && RX.cn_nsfw_strong.some(r => r.test(data.displayName))) {
      score += 30; reasons.push('N1 cn_nsfw_strong'); category = 'cn_nsfw_bot';
    }
    // —— N2: 分隔符模式 ——
    if (enabledModules.cn_nsfw_bot && segments.length >= 3) {
      score += 35; reasons.push('N2 separator-pattern displayname');
      if (category === 'normal') category = 'cn_nsfw_bot';
    }
    // V6 已移除 N3（基于 handle 判定不可靠）
    // —— N4: 近似纯 emoji 推文（无 3+ 字母词 / 2+ CJK 词，即便 bot 撒了单字母也算）——
    if (nearPureEmoji) {
      let n4 = 25;
      if (tweetEmojiCount >= 6) n4 = 45;
      else if (tweetEmojiCount >= 4) n4 = 35;
      if (RX.pointing_emoji.test(data.tweetText.trim())) n4 += 15;
      if (multiClusterEmoji) n4 += 10;
      score += n4;
      reasons.push(`N4 emoji-only tweet (${tweetEmojiCount}e/${emojiClusters}c)`);
      if (category === 'normal') category = 'cn_nsfw_bot';
    }

    // —— Combo: 西方 bot 农场（V6 移除 handle 维度）——
    // 仅靠 "full name displayName + 多簇 emoji 纯 emoji 推文" 两个内容信号
    // 比 V5 弱（之前还有 handle 锚定）但避免误伤
    if (enabledModules.cn_nsfw_bot && isFullName && nearPureEmoji && multiClusterEmoji) {
      score += 20;
      reasons.push('Combo: western full-name + multi-cluster emoji-only tweet');
      if (category === 'normal') category = 'bot_farm';
    }

    // V6 已移除 A1 / A6 / A7（全部基于 handle 判定）
    // 这些信号被反复证明对亚洲用户高假阳性。如果未来要恢复，必须先解决"handle 不可靠"的根本问题

    // —— A2 显示名 emoji 灌水（修复后逻辑）——
    const displayEmojiCount = (data.displayName.match(RX.emoji_match) || []).length;
    let a2 = 0;
    if (displayEmojiCount >= 4) a2 = 18;
    if (displayEmojiCount >= 6) a2 = 25;
    const cryptoEmojiCount = (data.displayName.match(new RegExp(RX.crypto_emoji.source, 'gu')) || []).length;
    if (cryptoEmojiCount >= 2) a2 = Math.max(a2, 15);
    if (RX.nsfw_emoji.test(data.displayName)) a2 = Math.max(a2, 30);
    // CJK 减权：只对非分隔符模式且无 NSFW emoji 时生效
    if (a2 > 0 && RX.cjk.test(data.displayName) && segments.length < 3 && !RX.nsfw_emoji.test(data.displayName)) {
      a2 *= 0.5;
    }
    if (a2 > 0) { score += a2; reasons.push(`A2 displayname emoji (${a2.toFixed(0)})`); }

    // —— B1 crypto shill ——
    if (enabledModules.crypto_shill) {
      let cryptoScore = 0;
      for (const r of RX.crypto_killer) if (r.test(data.tweetText)) { cryptoScore += 50; break; }
      let strongCount = 0;
      for (const r of RX.crypto_strong) if (r.test(data.tweetText)) strongCount++;
      cryptoScore += Math.min(strongCount * 18, 36);

      const tickers = [...data.tweetText.matchAll(RX.ticker)].map(m => m[1])
        .filter(t => !TICKER_WHITELIST.has(t));
      cryptoScore += Math.min(tickers.length * 6, 24);

      if (cryptoScore > 0) {
        score += cryptoScore; reasons.push(`B1 crypto_shill (${cryptoScore})`);
        if (category === 'normal') category = 'crypto_shill';
      }
    }

    // —— B2 NSFW killer（英文）——
    if (enabledModules.nsfw) {
      if (RX.nsfw_killer.some(r => r.test(data.tweetText))) {
        score += 50; reasons.push('B2 NSFW killer');
        if (category === 'normal') category = 'nsfw_solicitation';
      }
    }
    // —— B2.cn 中文/罗马化 NSFW 推文（sao货 / 骚货 / d 我看 等）——
    if (enabledModules.cn_nsfw_bot || enabledModules.nsfw) {
      if (RX.cn_tweet_nsfw_killer.some(r => r.test(data.tweetText))) {
        score += 50; reasons.push('B2.cn CN/romanized NSFW killer in tweet');
        if (category === 'normal') category = 'cn_nsfw_bot';
      }
    }

    // —— B3 CN marketing ——
    if (enabledModules.cn_marketing) {
      let mScore = 0;
      for (const r of RX.cn_marketing_killer) if (r.test(data.tweetText)) { mScore += 30; break; }
      let strongCount = 0;
      for (const r of RX.cn_marketing_strong) if (r.test(data.tweetText)) strongCount++;
      mScore += Math.min(strongCount * 18, 36);
      if (mScore > 0) {
        score += mScore; reasons.push(`B3 cn_marketing (${mScore})`);
        if (category === 'normal') category = 'cn_marketing';
      }
    }

    // —— B4 excessive emoji（复用上方已抽取的 tweetEmojiCount）——
    const textLen = [...data.tweetText].length;
    if (textLen >= 10) {
      const ratio = tweetEmojiCount / textLen;
      if (ratio >= 0.30 && tweetEmojiCount >= 3) {
        score += 15; reasons.push('B4 excessive emoji ratio');
      }
      if (ratio >= 0.50) { score += 10; }
    }

    // —— B6 link density ——
    if (data.externalLinks.length > 0) {
      let linkScore = 0;
      for (const url of data.externalLinks) {
        if (RX.shortlink.test(url)) linkScore += 12; else linkScore += 4;
      }
      const wordCount = data.tweetText.trim().split(/\s+/).length;
      if (wordCount < 15 && data.externalLinks.length >= 1) linkScore += 8;
      linkScore = Math.min(linkScore, 25);
      score += linkScore;
      if (linkScore > 0) reasons.push(`B6 link_density (${linkScore})`);
    }

    // —— B7 engagement bait ——
    if (enabledModules.engagement_bait && RX.bait.some(r => r.test(data.tweetText))) {
      score += 15; reasons.push('B7 engagement_bait');
      if (category === 'normal') category = 'engagement_bait';
    }

    // —— Combos ——
    if (reasons.find(r => r.startsWith('N1')) && reasons.find(r => r.startsWith('N2')) && reasons.find(r => r.startsWith('N3'))) {
      score += 25; reasons.push('Combo N1+N2+N3');
    }
    if (reasons.find(r => r.startsWith('B1')) && (a2 > 0 || tweetEmojiCount >= 3) && data.externalLinks.some(u => RX.shortlink.test(u))) {
      score += 15; reasons.push('Combo crypto-triple');
    }

    const thresholds = SENSITIVITY[config.sensitivity] || SENSITIVITY.standard;
    return {
      score,
      hide: score >= thresholds.hide,
      blur: score >= thresholds.blur && score < thresholds.hide,
      protected: score < -50,
      category,
      reasons,
      hard: false
    };
  }

  // ===========================================================================
  // §4.4 集体感染：同一页面/线程下已识别多少个 bot
  //   核心洞察：bot 农场天然成簇，单条难判，多条共现是确定性信号
  //   策略：感染越严重，分数 bonus 越高、AI 灰区下限越低，对该线程全员降权
  // ===========================================================================

  const threadSpamCount = new Map();   // pathname → 已 hide 的数量

  function currentThreadId() {
    return location.pathname;
  }

  function bumpThreadInfection() {
    const id = currentThreadId();
    threadSpamCount.set(id, (threadSpamCount.get(id) || 0) + 1);
  }

  function getThreadInfection() {
    const count = threadSpamCount.get(currentThreadId()) || 0;
    return {
      count,
      // 每发现 1 个 bot，全线程其它推文 +3 分，封顶 +30
      scoreBonus: Math.min(count * 3, 30)
    };
  }

  // ===========================================================================
  // §4.5 学习规则（AI 自动总结的本地规则）
  // ===========================================================================

  // 估算 regex 里"字面字符锚点"数量（不含字符类、量词、元字符）
  // 用来判断一条 regex 是否过宽：字面字符越少越宽，<4 即危险品
  function regexLiteralCharCount(pattern) {
    if (!pattern) return 0;
    let s = pattern;
    s = s.replace(/\\u[0-9a-fA-F]{4}/g, '_');
    s = s.replace(/\\x[0-9a-fA-F]{2}/g, '_');
    s = s.replace(/\\[dDsSwW]/g, '');
    s = s.replace(/\\[bBAZ]/g, '');
    s = s.replace(/\\[fnrtv0]/g, '_');
    s = s.replace(/\\(.)/g, '$1');
    s = s.replace(/\[[^\]]*\]/g, '');
    s = s.replace(/\{[^}]*\}/g, '');
    s = s.replace(/[\^$.*+?(){}|]/g, '');
    return s.length;
  }

  function isBroadRegex(value) {
    return regexLiteralCharCount(value) < 4;
  }

  // 启动时迁移历史 learned rules，禁用不再被允许的类型：
  //   V5: 禁用过宽 regex
  //   V6: 禁用所有 username_regex（不再以 handle 为判定维度）
  //   V7: 禁用所有 displayname_keyword / displayname_regex（AI 学习只允许 tweet_keyword）
  function migrateBroadLearnedRules() {
    if (!config.learnedRules || !config.learnedRules.length) return;
    const disabledRules = [];
    for (const rule of config.learnedRules) {
      if (!rule.enabled) continue;
      // V7: 非 tweet_keyword 一律禁用（最严格的过滤）
      if (rule.kind !== 'tweet_keyword') {
        rule.enabled = false;
        rule.disabledAt = Date.now();
        rule.disabledReason = `kind_removed_v7_${rule.kind}`;
        disabledRules.push(rule);
      }
    }
    if (disabledRules.length === 0) return;

    postToContent({ type: 'save-config', data: { learnedRules: config.learnedRules } });

    // 清掉 rule 来源的 spam 缓存（让被错误规则杀掉的账号重新评估）
    // 不动 ai/user 来源的（那些是经过 AI 或用户明确判定的）
    if (cache && typeof cache === 'object') {
      let cleared = 0;
      for (const handle of Object.keys(cache)) {
        const entry = cache[handle];
        if (entry?.source === 'rule' && entry?.decision === 'spam') {
          delete cache[handle];
          cleared++;
        }
      }
      if (cleared > 0) {
        postToContent({ type: 'clear-cache-by-source', source: 'rule', decision: 'spam' });
      }
      console.info(`[TweetGuard] migrated: disabled ${disabledRules.length} broad regex rules, cleared ${cleared} cache entries`,
        disabledRules.map(r => r.value));
    }
  }

  // 编译好的 regex 缓存，避免每条推文都 new RegExp
  const compiledLearnedRegex = new Map();
  function getCompiledRegex(value, flags = 'i') {
    const key = flags + ':' + value;
    let re = compiledLearnedRegex.get(key);
    if (re === undefined) {
      try { re = new RegExp(value, flags); } catch { re = null; }
      compiledLearnedRegex.set(key, re);
    }
    return re;
  }

  // 命中检查
  function matchLearnedRules(data) {
    const rules = config.learnedRules || [];
    if (!rules.length) return null;

    const dnLower = data.displayName.toLowerCase();
    const txLower = data.tweetText.toLowerCase();
    const handle = data.handle.replace(/^@/, '');

    // 蓝标用户：只信任高特异度的学习规则（regex 类型 或 长 keyword）
    // 防止 AI 学到的过于通用关键词（"不是"/"什么"/"看看"）误伤真实付费用户
    const isVerified = data.verified;

    for (const rule of rules) {
      if (!rule.enabled) continue;
      // V7: 仅 tweet_keyword 生效（即使数据库里残留 displayname_*/username_* 也跳过）
      if (rule.kind !== 'tweet_keyword') continue;
      const v = rule.value;
      if (!v) continue;

      // 对蓝标账号严格筛选：tweet_keyword 必须 ≥8 字符（防止短词误伤）
      if (isVerified && v.length < 8) continue;

      if (txLower.includes(v.toLowerCase())) return rule;
    }
    return null;
  }

  // 落库新规则
  // 禁用某条学习规则（不删除，留痕迹便于复盘）
  function disableLearnedRule(ruleId) {
    if (!ruleId || !config.learnedRules) return false;
    const rule = config.learnedRules.find(r => r.id === ruleId);
    if (!rule) return false;
    rule.enabled = false;
    rule.disabledAt = Date.now();
    rule.disabledReason = 'user_feedback';
    postToContent({ type: 'save-config', data: { learnedRules: config.learnedRules } });
    return true;
  }

  function addLearnedRule(signature, sourceHandle, sourceCategory) {
    if (!signature || !signature.kind || !signature.value) return;
    // V7: 防御层 —— 即使 background 校验被绕过，inject 这里也再拒一次
    if (signature.kind !== 'tweet_keyword') return;
    if (!config.learnedRules) config.learnedRules = [];

    // 去重
    const valueLower = signature.value.toLowerCase();
    const exists = config.learnedRules.some(r =>
      r.kind === signature.kind && r.value.toLowerCase() === valueLower
    );
    if (exists) return;

    // 容量上限 200，按 lastHitAt 淘汰最不活跃的
    if (config.learnedRules.length >= 200) {
      config.learnedRules.sort((a, b) =>
        (b.lastHitAt || b.createdAt || 0) - (a.lastHitAt || a.createdAt || 0)
      );
      config.learnedRules.length = 199;
    }

    const rule = {
      id: 'lr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      kind: signature.kind,
      value: signature.value,
      category: signature.category || sourceCategory || 'cn_nsfw_bot',
      enabled: true,
      createdAt: Date.now(),
      sourceHandle: sourceHandle || '',
      hitCount: 0
    };
    config.learnedRules.push(rule);
    postToContent({ type: 'save-config', data: { learnedRules: config.learnedRules } });
  }

  // 命中次数 debounce flush（避免每命中就 setStorage）
  const pendingHits = new Map();
  let hitFlushTimer = null;
  function bumpLearnedRuleHit(ruleId) {
    pendingHits.set(ruleId, (pendingHits.get(ruleId) || 0) + 1);
    if (hitFlushTimer) return;
    hitFlushTimer = setTimeout(() => {
      hitFlushTimer = null;
      if (!config.learnedRules) { pendingHits.clear(); return; }
      let changed = false;
      for (const [id, delta] of pendingHits) {
        const rule = config.learnedRules.find(r => r.id === id);
        if (rule) {
          rule.hitCount = (rule.hitCount || 0) + delta;
          rule.lastHitAt = Date.now();
          changed = true;
        }
      }
      pendingHits.clear();
      if (changed) {
        postToContent({ type: 'save-config', data: { learnedRules: config.learnedRules } });
      }
    }, 5000);
  }

  // ===========================================================================
  // §5 缓存层
  // ===========================================================================

  function getCache(handle) {
    if (!handle) return null;
    const entry = cache[handle];
    if (!entry) return null;
    // 旧规则版本下的 "normal" 判定可能漏判（规则改进过）→ 失效让它重新走 L0
    // SPAM 判定永久保留：bot 几乎不会自我洗白，且 AI 已经盖章
    if (entry.decision === 'normal' && (entry.rulesVersion || 0) < RULES_VERSION) {
      delete cache[handle];
      return null;
    }
    const ttl = entry.ttl == null ? CACHE_TTL.normal : entry.ttl;
    if (ttl !== Infinity && (Date.now() - entry.evaluatedAt > ttl)) {
      delete cache[handle];
      return null;
    }
    entry.lastAccessedAt = Date.now();
    return entry;
  }

  function setCache(handle, decision, source, displayName) {
    if (!handle) return;
    let ttl;
    if (source === 'user') ttl = Infinity;
    else if (decision.is_spam && decision.confidence >= 90) ttl = CACHE_TTL.spamHigh;
    else if (decision.is_spam) ttl = CACHE_TTL.spam;
    else if (decision.confidence >= 90) ttl = CACHE_TTL.normalHigh;
    else ttl = CACHE_TTL.normal;

    // 保留旧条目的 displayName（防止后续覆盖不带 name 的 setCache 把旧 name 清掉）
    const existing = cache[handle];
    const finalDisplayName = displayName || existing?.displayName || '';

    const entry = {
      handle,
      displayName: finalDisplayName,
      decision: decision.is_spam ? 'spam' : 'normal',
      category: decision.category,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      reasons: decision.reasons,
      evaluatedAt: Date.now(),
      ttl,
      source: source || 'rule',
      rulesVersion: RULES_VERSION
    };
    cache[handle] = entry;
    postToContent({ type: 'save-cache-entry', handle, entry });
  }

  // ===========================================================================
  // §6 AI 客户端（通过 postMessage 走 content.js → background）
  // ===========================================================================

  let aiReqCounter = 0;
  const aiPending = new Map();

  function callAI(input) {
    return new Promise((resolve) => {
      const id = `ai-${Date.now()}-${++aiReqCounter}`;
      aiPending.set(id, resolve);
      postToContent({ type: 'ai-evaluate', requestId: id, input });
      setTimeout(() => {
        if (aiPending.has(id)) {
          aiPending.delete(id);
          resolve({ error: 'client_timeout' });
        }
      }, (config.ai?.timeoutMs || 8000) + 2000);
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const msg = e.data;
    if (!msg || msg.source !== 'tg-content') return;
    if (msg.type === 'config-update') {
      const oldConfig = config;
      const newConfig = mergeWithDefaults(msg.data);
      config = newConfig;
      applyMode();
      // 仅当影响判定的字段变化时才重评——否则 stats 写入会触发无限重评循环
      if (needsReEval(oldConfig, newConfig)) {
        reEvaluateAll();
      }
    } else if (msg.type === 'ai-response') {
      const resolve = aiPending.get(msg.requestId);
      if (resolve) {
        aiPending.delete(msg.requestId);
        resolve(msg.result);
      }
    }
  });

  function needsReEval(oldC, newC) {
    if (!oldC) return true;
    if (oldC.enabled !== newC.enabled) return true;
    if (oldC.sensitivity !== newC.sensitivity) return true;
    if ((oldC.ai?.enabled || false) !== (newC.ai?.enabled || false)) return true;
    if (JSON.stringify(oldC.modules || {}) !== JSON.stringify(newC.modules || {})) return true;
    if (JSON.stringify(oldC.whitelist || []) !== JSON.stringify(newC.whitelist || [])) return true;
    if (JSON.stringify(oldC.blacklist || []) !== JSON.stringify(newC.blacklist || [])) return true;
    if (JSON.stringify(oldC.customKeywords || []) !== JSON.stringify(newC.customKeywords || [])) return true;
    // 学习规则：只比较模式与启用状态，忽略 hitCount/lastHitAt 噪音
    if (!sameLearnedRules(oldC.learnedRules, newC.learnedRules)) return true;
    // hideMode 变化由 CSS 自动处理（attribute selector），不需要重评
    // stats / cache 变化更不需要重评
    return false;
  }

  function sameLearnedRules(a, b) {
    a = a || []; b = b || [];
    if (a.length !== b.length) return false;
    const sig = (r) => `${r.id}|${r.kind}|${r.value}|${r.enabled ? 1 : 0}`;
    const aSet = new Set(a.map(sig));
    for (const r of b) if (!aSet.has(sig(r))) return false;
    return true;
  }

  function postToContent(payload) {
    window.postMessage({ source: 'tg-page', ...payload }, '*');
  }

  // ===========================================================================
  // §6.5 Bad case 反馈循环
  //   核心思路：用户是最终裁判，标记 → 立即应用用户意见 → 后台请 AI 复审
  //   AI 复审产物：
  //     - false_negative: 添加 learnedRule（下次相似 bot 直接命中）
  //     - false_positive: 禁用导致误判的 learnedRule（如果是它的锅）
  //   所有 bad case 入档 config.badCases，options 页可查看历史
  // ===========================================================================

  // 提取一段文本中所有 CJK / CJK+ASCII 混合的 n-gram 候选（用于"重复模式"检测）
  function ngramCandidates(text, minLen = 4, maxLen = 10) {
    const out = new Set();
    if (!text) return [];
    // 匹配 CJK + 拉丁字母混合 run（spam 模板常这样：" 她太涩了t" / "sao 货"）
    const runs = text.match(/[一-鿿぀-ヿ가-힯a-zA-Z]{4,}/g) || [];
    for (const run of runs) {
      if (!/[一-鿿぀-ヿ가-힯]/.test(run)) continue;     // 必须含 CJK
      const arr = [...run];                              // 按 codepoint 切，安全处理代理对
      for (let len = minLen; len <= Math.min(maxLen, arr.length); len++) {
        for (let i = 0; i + len <= arr.length; i++) {
          out.add(arr.slice(i, i + len).join(''));
        }
      }
    }
    return [...out];
  }

  // 常见中文 substring 黑名单（这些 4-char 片段太通用，不应作为 spam 规则）
  const COMMON_NGRAM_BLOCK = new Set([
    '我以为你', '是不是有', '不是有众', '我真的觉', '为什么会', '我也是这',
    '这是不是', '我觉得这', '什么时候', '怎么会有', '我感觉这', '这个真的',
    '其实就是', '我也想说', '我也是这', '不过我觉', '感觉就是', '可能是因',
    '我不知道', '没什么好', '没有什么', '应该可以', '没问题啊', '已经看完',
    '哈哈哈哈', '真的好笑', '一定要去', '我也要去'
  ]);

  // 在历史 FN bad cases 中找"重复模式"：跨 handle 出现的相同 substring 即为 template
  function findRepeatPattern(newText, newHandle, prevBadCases) {
    const candidates = ngramCandidates(newText, 4, 10);
    if (!candidates.length) return null;

    // 优先长 ngram（更特异）
    candidates.sort((a, b) => b.length - a.length);

    const prevFN = prevBadCases.filter(bc =>
      bc.type === 'false_negative' &&
      bc.tweetText &&
      bc.handle !== newHandle                          // 必须是不同 handle 的"重复"
    );
    if (!prevFN.length) return null;

    for (const cand of candidates) {
      if (COMMON_NGRAM_BLOCK.has(cand)) continue;
      // 跨 handle 重复出现即为 template
      const hits = prevFN.filter(bc => bc.tweetText.includes(cand));
      if (hits.length >= 1) {
        return {
          kind: 'tweet_keyword',
          value: cand,
          category: 'cn_solicitation',
          confirmedBy: hits.length + 1,                // 含当前这条
          sampleHandles: [newHandle, ...hits.slice(0, 3).map(h => h.handle)]
        };
      }
    }
    return null;
  }

  function markAsBadCase(article, userVerdict /* 'spam' | 'normal' */) {
    const data = extractTweetData(article);
    if (!data || !data.handle) {
      showInPageToast('无法标记：抓不到推文数据');
      return;
    }

    // 当前 TweetGuard 的判定（用于送 AI 复盘）
    const prevTg = article.getAttribute('data-tg') || 'unevaluated';
    const prevCategory = article.getAttribute('data-tg-category') || null;
    const prevSource = article.getAttribute('data-tg-source') || null;
    const cached = cache[data.handle];
    const previousLearnedRuleHit = cached?.reasoning?.match(/Learned rule \[.*?\]: (.+)/)?.[1] || null;
    // 找 learnedRule id（如果命中过）
    let learnedRuleId = null;
    if (previousLearnedRuleHit && config.learnedRules) {
      const lr = config.learnedRules.find(r => r.value === previousLearnedRuleHit);
      learnedRuleId = lr?.id || null;
    }

    // 1. 立即应用用户意见（不等 AI）
    if (userVerdict === 'spam') {
      applyHide(article, {
        handle: data.handle,
        category: 'user_flagged',
        reasoning: '用户手动标记为垃圾'
      }, 'user');
    } else {
      // normal: 显示 + 加白名单
      article.setAttribute('data-tg', 'ok');
      removeBreadcrumb(article);
      if (!config.whitelist) config.whitelist = [];
      if (!config.whitelist.includes(data.handle)) {
        config.whitelist.push(data.handle);
        postToContent({ type: 'save-config', data: { whitelist: config.whitelist } });
      }
    }

    // 2. 直接覆盖缓存为用户判定（永久）
    setCache(data.handle, {
      is_spam: userVerdict === 'spam',
      confidence: 100,
      category: userVerdict === 'spam' ? 'user_flagged' : 'normal',
      reasoning: '用户手动标记'
    }, 'user', data.displayName);

    // 3. 确定性自动修复（不等 AI）
    //    a) FP + 是某条 learned rule 命中导致的 → 立即 disable 那条规则
    //    b) FN + 跨 handle 重复出现的内容模式 → 立即新增 tweet_keyword 规则
    let repeatSig = null;
    let autoDisabledRule = null;
    if (userVerdict === 'normal' && learnedRuleId) {
      // FP 且有 learned rule 命中：用户说"这不是 spam"，且命中规则可定位 → 直接禁用
      // 不依赖 AI 反复确认 —— 用户已经说了规则错了
      if (disableLearnedRule(learnedRuleId)) {
        const ruleObj = config.learnedRules?.find(r => r.id === learnedRuleId);
        autoDisabledRule = ruleObj ? `${ruleObj.kind}: ${ruleObj.value}` : learnedRuleId;
      }
    }
    if (userVerdict === 'spam') {
      repeatSig = findRepeatPattern(data.tweetText, data.handle, config.badCases || []);
      if (repeatSig) {
        addLearnedRule(repeatSig, data.handle, repeatSig.category);
      }
    }

    // 4. UI 反馈（按"立即可执行的修复"优先级提示）
    const verdictText = userVerdict === 'spam' ? '已标记为垃圾' : '已标记为正常';
    if (autoDisabledRule) {
      showInPageToast(`${verdictText} · 已自动禁用错判规则「${autoDisabledRule.slice(0, 30)}」`);
    } else if (repeatSig) {
      showInPageToast(`${verdictText} · 检测到重复模式「${repeatSig.value}」自动加规则`);
    } else {
      showInPageToast(`${verdictText}${config.ai?.enabled ? '，AI 正在分析...' : ''}`);
    }

    // 5. 后台请 AI 复审（仅在 AI 启用时）
    if (!config.ai?.enabled || (!config.ai.apiKey && config.ai.provider !== 'ollama')) {
      // 不调 AI 也至少把 bad case 入档
      saveBadCaseEntry({
        id: 'bc-' + Date.now().toString(36),
        type: userVerdict === 'spam' ? 'false_negative' : 'false_positive',
        handle: data.handle,
        displayName: data.displayName,
        tweetText: data.tweetText.slice(0, 300),
        userVerdict,
        previousDecision: prevTg === 'hide' ? 'spam' : (prevTg === 'ok' || prevTg === 'reveal') ? 'normal' : 'unevaluated',
        previousCategory: prevCategory,
        previousSource: prevSource,
        capturedAt: Date.now(),
        aiAnalysis: null
      });
      return;
    }

    // 发送 AI 复审
    callAIReview({
      user_says: userVerdict,
      previous_decision: prevTg === 'hide' ? 'spam' : (prevTg === 'ok' || prevTg === 'reveal') ? 'normal' : 'unevaluated',
      previous_reasons: cached?.reasons || [],
      previous_learned_rule_hit: previousLearnedRuleHit,
      input: {
        display_name: data.displayName.slice(0, 100),
        handle: data.handle,
        verified: data.verified,
        tweet_text: data.tweetText.slice(0, 500),
        is_reply: data.isReply
      }
    }).then(result => {
      // 入档 bad case
      const entry = {
        id: 'bc-' + Date.now().toString(36),
        type: userVerdict === 'spam' ? 'false_negative' : 'false_positive',
        handle: data.handle,
        displayName: data.displayName,
        tweetText: data.tweetText.slice(0, 300),
        userVerdict,
        previousDecision: prevTg === 'hide' ? 'spam' : (prevTg === 'ok' || prevTg === 'reveal') ? 'normal' : 'unevaluated',
        previousCategory: prevCategory,
        previousSource: prevSource,
        capturedAt: Date.now(),
        aiAnalysis: result && !result.error ? {
          diagnosis: result.diagnosis,
          corrected: result.corrected_decision,
          category: result.category,
          add_signature: result.add_signature,
          disable_rule_id: result.disable_rule_id,
          confidence: result.confidence
        } : null,
        aiError: result?.error || null
      };
      saveBadCaseEntry(entry);

      if (!result || result.error) {
        showInPageToast('AI 复审失败: ' + (result?.error || 'unknown'));
        return;
      }

      // 应用 AI 复审建议
      const actions = [];
      if (result.add_signature) {
        addLearnedRule(result.add_signature, data.handle, result.category);
        actions.push('新增规则');
      }
      if (result.disable_rule_id && !autoDisabledRule) {
        // 只有当我们没在 Step 3 自动 disable 时，才考虑 AI 建议的 disable
        if (disableLearnedRule(result.disable_rule_id)) {
          actions.push('禁用关联规则');
        }
      }

      if (actions.length) {
        showInPageToast(`AI: ${actions.join(' + ')}`);
      } else if (!repeatSig && !autoDisabledRule) {
        // 都没有自动操作 + AI 也没建议 → 引导用户继续反馈
        if (userVerdict === 'spam') {
          showInPageToast(`AI 已记录反馈。再标 1-2 条类似的，系统会自动归纳规则`);
        } else {
          // FP 而且 AI 没给 disable 建议：可能是 L0 内置规则误命中
          showInPageToast(`AI 已记录反馈。L0 内置规则可能需要调整（请反馈给开发者）`);
        }
      }
      // 如果 autoDisabledRule / repeatSig 已经处理了，AI 那边没补充建议就静默
    }).catch(err => {
      showInPageToast('AI 复审异常: ' + (err.message || err));
    });
  }

  function saveBadCaseEntry(entry) {
    postToContent({ type: 'save-badcase', entry });
  }

  let reviewReqCounter = 0;
  const reviewPending = new Map();
  function callAIReview(payload) {
    return new Promise((resolve) => {
      const id = `rev-${Date.now()}-${++reviewReqCounter}`;
      reviewPending.set(id, resolve);
      postToContent({ type: 'ai-review-bad-case', requestId: id, payload });
      setTimeout(() => {
        if (reviewPending.has(id)) {
          reviewPending.delete(id);
          resolve({ error: 'client_timeout' });
        }
      }, (config.ai?.timeoutMs || 8000) + 8000);
    });
  }

  // 接收 AI 复审响应
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const msg = e.data;
    if (!msg || msg.source !== 'tg-content') return;
    if (msg.type === 'ai-review-response') {
      const resolve = reviewPending.get(msg.requestId);
      if (resolve) {
        reviewPending.delete(msg.requestId);
        resolve(msg.result);
      }
    }
  });

  // 简洁的页面内 toast（右下角悬浮提示）
  let toastEl = null;
  let toastTimer = null;
  function showInPageToast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'tg-toast';
      document.body?.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl?.classList.remove('show');
    }, 3000);
  }

  // ===========================================================================
  // §7 Actuator：DOM 状态机
  //   data-tg=
  //     "ok"       → 已评估为正常
  //     "pending"  → AI 评估中（subtle 指示）
  //     "hide"     → 已隐藏（CSS 控制呈现：breadcrumb / blur / remove）
  //     "reveal"   → 用户手动展开
  // ===========================================================================

  function applyMode() {
    document.documentElement.setAttribute('data-tg-mode', config.hideMode || 'breadcrumb');
    document.documentElement.setAttribute('data-tg-enabled', config.enabled ? '1' : '0');
  }

  function applyOk(article) {
    article.setAttribute('data-tg', 'ok');
    removeBreadcrumb(article);
    ensureMarkSpamButton(article);
  }

  // 给"已判为正常"的推文挂一个悬浮"标记为垃圾"按钮
  function ensureMarkSpamButton(article) {
    if (article.querySelector(':scope > .tg-mark-spam-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'tg-mark-spam-btn';
    btn.type = 'button';
    btn.title = 'TweetGuard: 标记为垃圾，让 AI 学习';
    btn.setAttribute('aria-label', '标记为垃圾');
    // 实心 flag 图标 —— 视觉重量比之前的细线版本更大、识别度更高
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 17V3.5C4 3.22 4.22 3 4.5 3H15.2C15.6 3 15.85 3.42 15.68 3.78L13.5 8L15.68 12.22C15.85 12.58 15.6 13 15.2 13H5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="currentColor" fill-opacity="0.12"/>
      </svg>
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      markAsBadCase(article, 'spam');
    });
    article.appendChild(btn);
  }

  function applyPending(article) {
    article.setAttribute('data-tg', 'pending');
  }

  function applyHide(article, decision, source) {
    article.setAttribute('data-tg', 'hide');
    article.setAttribute('data-tg-category', decision.category || 'normal');
    article.setAttribute('data-tg-source', source || 'rule');
    if (decision.handle) article.setAttribute('data-tg-handle', decision.handle);
    // 把 source 也带进 decision，breadcrumb 详情面板要展示
    ensureBreadcrumb(article, { ...decision, source: source || 'rule' });

    bumpThreadInfection();   // 集体感染计数 +1

    sessionStats.hidden++;
    sessionStats.byCategory[decision.category] = (sessionStats.byCategory[decision.category] || 0) + 1;
    if (source === 'cache') sessionStats.cacheHits++;
    if (source === 'ai') sessionStats.aiCalls++;
    debouncedStatsFlush();
  }

  function applyReveal(article) {
    article.setAttribute('data-tg', 'reveal');
  }

  function ensureBreadcrumb(article, decision) {
    let bc = article.querySelector(':scope > .tg-breadcrumb');
    if (bc) {
      updateBreadcrumb(bc, decision);
      return;
    }
    bc = document.createElement('div');
    bc.className = 'tg-breadcrumb';
    bc.innerHTML = `
      <div class="tg-bc-head">
        <span class="tg-bc-dot"></span>
        <span class="tg-bc-text">
          <span class="tg-bc-label">TweetGuard 已隐藏</span>
          <span class="tg-bc-meta"></span>
        </span>
        <button class="tg-bc-reveal" type="button">显示</button>
        <button class="tg-bc-trust" type="button" title="信任此用户">信任</button>
      </div>
      <div class="tg-bc-details">
        <div class="tg-bc-detail-row">
          <span class="tg-bc-detail-label">命中</span>
          <span class="tg-bc-detail-content" data-field="reasons"></span>
        </div>
        <div class="tg-bc-detail-row">
          <span class="tg-bc-detail-label">来源</span>
          <span class="tg-bc-detail-content" data-field="source"></span>
        </div>
      </div>
    `;
    updateBreadcrumb(bc, decision);
    bc.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      if (btn.classList.contains('tg-bc-reveal')) {
        applyReveal(article);
      } else if (btn.classList.contains('tg-bc-trust')) {
        // 「信任」= 标记为误判（false positive）→ 触发 AI 复审 + 学习
        markAsBadCase(article, 'normal');
      }
    });
    article.insertBefore(bc, article.firstChild);
  }

  function updateBreadcrumb(bc, decision) {
    const meta = bc.querySelector('.tg-bc-meta');
    if (meta) {
      const handle = decision.handle || '';
      const cat = CATEGORY_LABELS[decision.category] || decision.category || '可疑账号';
      meta.textContent = `${handle ? handle + ' · ' : ''}${cat}`;
    }

    // 详情面板内容（仅在 reveal 时显示）
    const reasonsEl = bc.querySelector('[data-field="reasons"]');
    if (reasonsEl) {
      let txt;
      if (Array.isArray(decision.reasons) && decision.reasons.length) {
        txt = decision.reasons.join('  ·  ');
      } else if (typeof decision.reasoning === 'string' && decision.reasoning.trim()) {
        txt = decision.reasoning;
      } else {
        txt = '—';
      }
      reasonsEl.textContent = txt;
    }
    const sourceEl = bc.querySelector('[data-field="source"]');
    if (sourceEl) {
      const SOURCE_LABELS = {
        rule: '本地规则',
        cache: '历史缓存',
        ai: 'AI 判定',
        user: '用户手动标记'
      };
      sourceEl.textContent = SOURCE_LABELS[decision.source] || decision.source || '—';
    }
  }

  function removeBreadcrumb(article) {
    const bc = article.querySelector(':scope > .tg-breadcrumb');
    if (bc) bc.remove();
  }

  const CATEGORY_LABELS = {
    cn_nsfw_bot: '中文色情 bot',
    cn_solicitation: '中文色情 bot',
    crypto_shill: '加密币 shill',
    nsfw: '色情引流',
    nsfw_solicitation: '色情引流',
    cn_marketing: '中文营销',
    marketing: '营销广告',
    engagement_bait: '互动诱饵',
    ai_filler: 'AI 灌水',
    bot_farm: 'Bot 农场',
    normal: '正常'
  };

  function addWhitelist(handle) {
    handle = handle.toLowerCase();
    if (!config.whitelist) config.whitelist = [];
    if (!config.whitelist.includes(handle)) {
      config.whitelist.push(handle);
      postToContent({ type: 'save-config', data: { whitelist: config.whitelist } });
    }
    // 清掉这个 handle 的 cache（让它重新被评估为正常）
    if (cache[handle]) {
      delete cache[handle];
      postToContent({ type: 'delete-cache-entry', handle });
    }
    // 立刻 reveal 所有该作者的推文
    document.querySelectorAll(`article[data-tg-handle="${handle}"]`).forEach(a => {
      a.setAttribute('data-tg', 'ok');
    });
  }

  // ===========================================================================
  // §8 主评估流程
  // ===========================================================================

  const processed = new WeakSet();

  async function evaluate(article) {
    if (!article || processed.has(article)) return;
    if (!config.enabled) {
      article.removeAttribute('data-tg');
      return;
    }
    processed.add(article);

    const data = extractTweetData(article);
    if (!data) return;

    // Step 1: 缓存查询
    if (data.handle) {
      const cached = getCache(data.handle);
      if (cached) {
        if (cached.decision === 'spam') {
          applyHide(article, {
            handle: data.handle,
            category: cached.category,
            reasoning: cached.reasoning
          }, 'cache');
        } else {
          applyOk(article);
        }
        return;
      }
    }

    // Step 1.5: AI 之前学到的规则（L0 增强层）
    const learnedHit = matchLearnedRules(data);
    if (learnedHit) {
      applyHide(article, {
        handle: data.handle,
        category: learnedHit.category,
        reasoning: `Learned rule [${learnedHit.kind}]: ${learnedHit.value}`
      }, 'rule');
      bumpLearnedRuleHit(learnedHit.id);
      // 高分写缓存，下次同 handle 直接缓存命中
      if (data.handle) {
        setCache(data.handle, {
          is_spam: true,
          confidence: 95,
          category: learnedHit.category,
          reasoning: `Learned rule: ${learnedHit.value}`
        }, 'rule', data.displayName);
      }
      return;
    }

    // Step 2: L0 规则
    const l0 = evaluateL0(data);
    if (l0.protected) {
      applyOk(article);
      return;
    }

    // Step 2.5: 集体感染 bonus —— 同一线程已识别 N 个 bot，本条降权
    const infection = getThreadInfection();
    if (infection.scoreBonus > 0 && !l0.hard) {
      l0.score += infection.scoreBonus;
      (l0.reasons = l0.reasons || []).push(`infection +${infection.scoreBonus} (thread bots: ${infection.count})`);
    }
    const thresholds = SENSITIVITY[config.sensitivity] || SENSITIVITY.standard;
    // 重新判断是否过 hide 阈值（叠加感染后可能跨过）
    if (l0.score >= thresholds.hide) {
      l0.hide = true;
    }

    if (l0.hide) {
      applyHide(article, { ...data, ...l0, reasoning: l0.reasons.join(', ') }, 'rule');
      // 写缓存（仅 hard rule 或高分写）
      if (l0.hard || l0.score >= 90) {
        setCache(data.handle, {
          is_spam: true,
          confidence: Math.min(100, l0.score),
          category: l0.category,
          reasoning: l0.reasons.join(', ')
        }, 'rule', data.displayName);
      }
      return;
    }

    // Step 3: AI（仅在启用 + L0 灰区）
    //   灰区下限由灵敏度决定：保守 30 / 标准 15 / 激进 0
    //   感染严重的线程（≥3 个已识别 bot）下限再压低 5 分，对兄弟 bot 全网格扫描
    const aiEnabled = config.ai?.enabled && (config.ai.apiKey || config.ai.provider === 'ollama');
    const baseAiTrigger = thresholds.aiTrigger;
    const effectiveAiTrigger = infection.count >= 3 ? Math.max(0, baseAiTrigger - 10) : baseAiTrigger;
    const isGrayZone = l0.score >= effectiveAiTrigger && l0.score < thresholds.hide;

    if (aiEnabled && isGrayZone) {
      applyPending(article);
      const aiInput = buildAIInput(data, l0);
      const result = await callAI(aiInput);
      if (!result || result.error || result.skipped) {
        // AI 失败 → fail-open，按 L0 决策
        if (l0.blur) {
          applyHide(article, { ...data, ...l0, reasoning: 'L0 blur (AI unavailable)' }, 'rule');
        } else {
          applyOk(article);
        }
        return;
      }
      if (result.is_spam) {
        applyHide(article, {
          handle: data.handle,
          category: result.category,
          reasoning: result.reasoning
        }, 'ai');
        setCache(data.handle, result, 'ai', data.displayName);
        // 关键：AI 顺手蒸馏出来的规则，落库供未来 L0 直接命中
        if (result.signature) {
          addLearnedRule(result.signature, data.handle, result.category);
        }
      } else {
        applyOk(article);
        setCache(data.handle, result, 'ai', data.displayName);
      }
    } else {
      // 无 AI：L0 灰区按 blur 分级处理
      if (l0.blur) {
        applyHide(article, { ...data, ...l0, reasoning: l0.reasons.join(', ') }, 'rule');
      } else {
        applyOk(article);
      }
    }
  }

  function buildAIInput(data, l0) {
    return {
      display_name: data.displayName.slice(0, 100),
      handle: data.handle,
      verified: data.verified,
      tweet_text: data.tweetText.slice(0, 500),
      is_reply: data.isReply,
      is_followed_by_user: false,    // 已在 protection 阶段处理，不会进 AI
      l0_score: l0.score,
      l0_reasons: (l0.reasons || []).slice(0, 5)
    };
  }

  // ===========================================================================
  // §9 MutationObserver + 路由变化
  // ===========================================================================

  let observer = null;

  function attachObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      const articles = new Set();
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('article[data-testid="tweet"]')) {
            articles.add(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll('article[data-testid="tweet"]').forEach(a => articles.add(a));
          }
        }
      }
      for (const a of articles) {
        try { evaluate(a); } catch (err) { console.warn('[TweetGuard] eval error', err); }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    initialScan();
  }

  function initialScan() {
    document.querySelectorAll('article[data-testid="tweet"]:not([data-tg])').forEach(a => {
      try { evaluate(a); } catch (err) { /* swallow */ }
    });
  }

  function reEvaluateAll() {
    // 配置变化时强制重评所有已处理的推文
    document.querySelectorAll('article[data-testid="tweet"]').forEach(a => {
      processed.delete(a);
      a.removeAttribute('data-tg');
      a.removeAttribute('data-tg-category');
      a.removeAttribute('data-tg-source');
      a.removeAttribute('data-tg-handle');
      removeBreadcrumb(a);
    });
    initialScan();
  }

  // SPA 路由处理
  function attachRouteHandler() {
    const origPush = history.pushState;
    history.pushState = function (...args) {
      const ret = origPush.apply(this, args);
      onRouteChange();
      return ret;
    };
    window.addEventListener('popstate', onRouteChange);
  }
  function onRouteChange() {
    setTimeout(() => initialScan(), 100);
  }

  // 用户互动追踪（D2: 最近互动减分）
  // V0.1 先简化：记录到内存，不持久化
  const recentInteractions = new Map();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-testid="like"], [data-testid="reply"], [data-testid="retweet"]');
    if (!btn) return;
    const article = btn.closest('article[data-testid="tweet"]');
    if (!article) return;
    const handle = article.getAttribute('data-tg-handle') ||
                   extractTweetData(article)?.handle;
    if (handle) recentInteractions.set(handle, Date.now());
  }, true);

  // ===========================================================================
  // §10 统计 + 启动
  // ===========================================================================

  const sessionStats = { hidden: 0, byCategory: {}, aiCalls: 0, cacheHits: 0 };
  let statsFlushTimer = null;
  function debouncedStatsFlush() {
    if (statsFlushTimer) return;
    statsFlushTimer = setTimeout(() => {
      statsFlushTimer = null;
      postToContent({
        type: 'update-stats',
        data: {
          totalHidden: (config.stats?.totalHidden || 0) + sessionStats.hidden,
          sessionHidden: sessionStats.hidden,
          byCategory: deepMerge(config.stats?.byCategory || {}, sessionStats.byCategory),
          aiCalls: (config.stats?.aiCalls || 0) + sessionStats.aiCalls,
          cacheHits: (config.stats?.cacheHits || 0) + sessionStats.cacheHits
        }
      });
      // 重置本地累加器
      sessionStats.hidden = 0;
      sessionStats.aiCalls = 0;
      sessionStats.cacheHits = 0;
      sessionStats.byCategory = {};
    }, 3000);
  }

  // 启动
  applyMode();
  // V5 迁移：自动禁用过宽 learned regex（如 ^[a-zA-Z]{6,}\d{5,}$ 这种灾难规则）
  // 同时清掉这些规则造成的 rule-source spam 缓存，让被错杀的账号重新评估
  migrateBroadLearnedRules();
  if (document.body) {
    attachObserver();
  } else {
    document.addEventListener('DOMContentLoaded', attachObserver, { once: true });
  }
  attachRouteHandler();

  // 向外暴露一个 debug 入口（仅用于诊断）
  window.__TweetGuard__ = {
    version: '0.1.0',
    get config() { return { ...config, ai: { ...config.ai, apiKey: config.ai.apiKey ? '***' : '' } }; },
    cacheSize: () => Object.keys(cache).length,
    rescan: () => reEvaluateAll()
  };

  console.info('[TweetGuard] v0.1.0 loaded, mode:', config.hideMode, 'AI:', config.ai.enabled ? config.ai.provider : 'off');
})();
