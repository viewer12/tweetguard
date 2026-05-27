<div align="center">

# TweetGuard

**Elegantly filter spam, crypto shills, and adult bots out of your X (Twitter) feed.**

English · [简体中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-0f172a.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/chrome-extension-0f172a.svg)](#installation)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-0f172a.svg)](manifest.json)
[![No Backend](https://img.shields.io/badge/backend-none-059669.svg)](#privacy)

</div>

---

## What is TweetGuard?

X (Twitter) has a runaway spam problem. By X's own admission, **80% of crypto activity is bot-driven**, and adult-content "check my bio" replies, Chinese 寻固炮 / 点击主页 templates, and 1000x token shillers flood any viral thread. X's platform-level mitigations consistently miss the mark — they fold legitimate replies under "probable spam" while letting actual bots through.

TweetGuard is a Chrome extension that filters these out **on your side, in your browser**. No server. No telemetry. No data leaves your machine unless you explicitly bring your own AI API key.

It's the spam filter you'd build for yourself if you had a couple of weeks.

---

## How it works (in 30 seconds)

```
Every tweet that appears in your feed flows through three layers:

┌─────────────────────────────────────────────────────────────────┐
│  L0 — Built-in rules (synchronous, < 1 ms)                      │
│  17 hand-tuned signals + 6 hard rules + collective-infection    │
│  bonus. Catches ~80% of obvious spam instantly.                 │
├─────────────────────────────────────────────────────────────────┤
│  Cache — local by-account decisions                             │
│  Once a handle is judged (by L0, AI, or you), the verdict is    │
│  cached locally. Subsequent tweets from the same account are    │
│  decided in microseconds.                                       │
├─────────────────────────────────────────────────────────────────┤
│  L_AI — your AI, on gray-zone tweets only                       │
│  When L0 isn't sure, the tweet is sent to your configured AI    │
│  provider (DeepSeek / OpenAI / Anthropic / Gemini / Ollama).    │
│  The AI also distills generalizable rules from what it sees,    │
│  shrinking future AI traffic for the same template.             │
└─────────────────────────────────────────────────────────────────┘
```

Detected tweets are not removed — they **smoothly collapse into a thin strip** showing what was hidden and why. One click reveals the original. Layout never jumps.

---

## Features

- **Multi-layer detection**: rules + cache + optional AI, in that order. Most tweets don't reach AI.
- **Bring your own AI**: works with DeepSeek, OpenAI, Anthropic, Gemini, Groq, OpenRouter, and Ollama (fully local). Your key, your data path.
- **Self-improving via feedback**: click "trust" on a wrongly-hidden tweet → the responsible rule gets auto-disabled. Click the flag on missed spam → if a similar pattern was seen before, a new rule is auto-learned.
- **Cross-handle template detection**: if you've reported "她太涩了 t" once and "她太涩了 x" later, the system auto-generalizes `tweet_keyword: "她太涩了"` without an AI call.
- **Transparent**: every hidden tweet shows the exact rule(s) that fired, with one click. All rules are inspectable and editable.
- **Asian-language aware**: ships with first-class rules for Chinese spam templates (寻固炮 / 加微 / 返佣 / 撸毛 / sao 货 / pan.quark.cn etc.) that English-first filters completely miss.
- **No layout jank**: the collapsed-strip transition uses CSS animations; pending AI evaluations show a subtle pulsing dot rather than removing the tweet first then re-showing it.
- **Zero telemetry**: no servers, no analytics, no remote loading. The only outbound traffic is your explicit AI API calls.

---

## Installation

Until the Chrome Web Store listing is published, install in developer mode:

1. Download or clone this repo:
   ```bash
   git clone https://github.com/<your-username>/tweetguard.git
   ```
2. Open `chrome://extensions` in Chrome / Edge / Brave.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the cloned folder.
5. Open `x.com` — TweetGuard is now active with built-in rules.

> Want the toolbar icon? Convert `icons/icon.svg` to 16/48/128 px PNGs and reference them in `manifest.json` under `"icons"`. Not strictly required.

---

## Configuring AI (optional but recommended)

The built-in rules alone catch most obvious spam. Adding an AI layer pushes coverage from ~80% to ~95% by handling new templates the static rules don't yet cover.

1. Click the TweetGuard toolbar icon → **Settings**.
2. Open the **AI Provider** tab.
3. Pick a provider, paste your API key, click **Run test** (sends 5 known sample tweets and verifies the model judges them correctly).

| Provider | Model recommendation | Approx. cost per 1k spam evaluations |
|---|---|---|
| **DeepSeek** | `deepseek-v4-flash` | ≈ ¥0.30 (cheapest + best for Chinese) |
| OpenAI | `gpt-4o-mini` | ≈ $0.15 |
| Anthropic | `claude-haiku-4-5` | ≈ $1 |
| Gemini | `gemini-2.0-flash` | free tier covers normal usage |
| Groq | `llama-3.1-8b-instant` | extremely fast |
| **Ollama** | `qwen2.5:7b` | $0 (runs entirely on your machine) |

For absolute privacy, use **Ollama** locally — tweets never leave your device, not even to a cloud AI.

---

## Privacy

TweetGuard ships with the following hard guarantees:

- **No backend, no telemetry.** The repo contains zero server code. We literally can't see what you're hiding.
- **All state is `chrome.storage.local`** — your config, cache, learned rules, and feedback history live only on your machine.
- **The only external traffic** is your explicit AI API calls, sent **from your machine** to the provider **you choose**. TweetGuard never proxies, never mirrors, never logs.
- **Local-only Ollama path** is fully supported for users who don't want any data to leave their device.
- **No handle-based filtering.** Username (`@handle`) is structurally unreliable as a spam signal — Asian users widely use "romanized name + digits" handles because short ones are taken. TweetGuard explicitly does not block by username pattern. Built-in rules judge by display-name keyword templates and tweet content only; AI learning is restricted to tweet text.

See [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) for the full data-flow design.

---

## Documentation

Detailed design and engineering notes in [`docs/`](docs/):

| Doc | What's inside |
|---|---|
| [PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) | Market research, competitor analysis, product positioning |
| [DETECTION_LOGIC.md](docs/DETECTION_LOGIC.md) | How each of the 17 signals scores a tweet; worked examples |
| [DEFAULT_RULES.md](docs/DEFAULT_RULES.md) | Shippable default ruleset — keywords, regex, weights, thresholds |
| [PERFORMANCE_UX.md](docs/PERFORMANCE_UX.md) | FOUC prevention, MutationObserver design, browser render timing |
| [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | BYOK design, prompt engineering, cache strategy, cost model |
| [LONG_TERM_DEFENSE.md](docs/LONG_TERM_DEFENSE.md) | Why rules alone are insufficient; the multi-layer defense thesis |

---

## Project layout

```
TweetGuard/
├── manifest.json              Chrome MV3 manifest, only `storage` permission
├── src/
│   ├── content.js             Isolated-world bridge
│   ├── inject.js              Page-context main script: DOM observer, L0 rules,
│   │                          actuator, AI client, feedback handlers
│   ├── background.js          Service worker: AI fetch proxy
│   ├── defaults.js            Default config, provider catalog, prompts
│   └── styles.css             Page-injected CSS (collapsed-strip, blur, pending states)
├── popup/                     Toolbar popup (quick toggle + stats)
├── options/                   Full settings page (7 tabs)
├── docs/                      Design documents
└── icons/                     Source SVG icon
```

No build step. No transpilation. Edit a file, reload the extension in `chrome://extensions`, refresh `x.com`.

---

## Contributing

PRs welcome, especially for:

- **New Chinese spam template patterns** (built-in rules in `src/inject.js`'s `RX` block)
- **Multi-language spam rules** (Spanish / Indonesian / Korean spam patterns)
- **Provider adapters** (Anthropic's batches API, OpenRouter routing tricks, etc.)
- **UI / visual polish** (anything in `options/options.css` or `src/styles.css`)
- **Test fixtures** — real-world spam DOM snapshots saved as HTML fixtures for regression tests

Before opening a PR:

1. Test your change against actual `x.com` for at least 30 minutes of casual scrolling
2. Make sure no false-positive against the Chrome Web Store guidelines (don't auto-block legitimate accounts based on weak signals)
3. Run `node -c src/*.js` to confirm no syntax errors

---

## Roadmap

- [ ] Chrome Web Store listing
- [ ] Firefox port (Manifest V3 is now stable on Firefox)
- [ ] On-device classifier via `transformers.js` (no AI key required)
- [ ] Bilingual UI (currently Chinese-primary)
- [ ] Filter list subscription model (à la uBlock Origin)
- [ ] Cache export / import (P2P sharing of curated block lists)

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
<sub>Built for everyone who's tired of "check my bio" replies under every viral tweet.</sub>
</div>
