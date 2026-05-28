<div align="center">

# TweetGuard

A Chrome extension that filters spam, crypto shills, and adult bots from the X (Twitter) feed.

[简体中文](README.md) · English

[![License: MIT](https://img.shields.io/badge/license-MIT-0f172a.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/chrome-extension-0f172a.svg)](#installation)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-0f172a.svg)](manifest.json)
[![No Backend](https://img.shields.io/badge/backend-none-059669.svg)](#privacy)

</div>

---

## Overview

TweetGuard is a Chrome extension that identifies and collapses spam tweets in the X (Twitter) feed on the client side. There is no backend and no telemetry; all state lives in `chrome.storage.local`. An optional bring-your-own AI key raises coverage.

---

## How it works

Each tweet flows through three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│  L0 — Built-in rules (synchronous, < 1 ms)                      │
│  17 hand-tuned signals + 6 hard rules + collective-infection    │
│  bonus. Catches ~80% of obvious spam.                           │
├─────────────────────────────────────────────────────────────────┤
│  Cache — local per-account decisions                            │
│  Once a handle has been judged (by L0, AI, or user), the        │
│  verdict is cached locally and reused for subsequent tweets.    │
├─────────────────────────────────────────────────────────────────┤
│  L_AI — gray-zone review (optional)                             │
│  When L0 is uncertain, the tweet is sent to the configured AI   │
│  provider (DeepSeek / OpenAI / Anthropic / Gemini / Ollama).    │
│  The AI also distills new rules to reduce future AI calls.      │
└─────────────────────────────────────────────────────────────────┘
```

Detected tweets are replaced with a collapsed strip that shows the reason; clicking expands the original.

---

## Features

- **Layered detection**: rules → cache → AI, evaluated cheapest first.
- **Bring your own AI key (BYOK)**: works with DeepSeek, OpenAI, Anthropic, Gemini, Groq, OpenRouter, and Ollama (local).
- **Feedback-based learning**: clicking "trust" on a wrongly-hidden tweet disables the offending rule; flagging missed spam can trigger rule generalization.
- **Cross-handle template detection**: repeatedly flagged similar text (e.g. `她太涩了 t`, `她太涩了 x`) is generalized into a `tweet_keyword` rule, avoiding future AI calls.
- **Inspectable rules**: each hidden tweet shows the matching rules; all rules can be viewed, edited, and disabled.
- **Chinese spam patterns built in**: rules for templates such as 寻固炮, 加微, 返佣, 撸毛, sao 货, pan.quark.cn, etc.
- **No layout shift**: collapse/expand uses CSS transitions; AI evaluations show a pulsing placeholder dot.
- **No telemetry**: no servers, no analytics, no remote loading. The only outbound traffic is user-initiated AI API calls.

---

## Installation

Until the Chrome Web Store listing is published, install via developer mode:

1. Clone this repo:
   ```bash
   git clone https://github.com/viewer12/tweetguard.git
   ```
2. Open `chrome://extensions` in Chrome / Edge / Brave.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked** and select the cloned folder.
5. Open `x.com` — built-in rules are active by default.

The toolbar icon is optional: convert `icons/icon.svg` to 16/48/128 px PNGs and reference them under `"icons"` in `manifest.json`.

---

## Configuring AI (optional)

The built-in rules alone cover most obvious spam. The AI layer raises coverage from ~80% to ~95% by handling templates not yet in the rule set.

1. Click the TweetGuard toolbar icon → **Settings**.
2. Open the **AI Provider** tab.
3. Pick a provider, paste your API key, click **Run test** (5 known sample tweets verify the model).

| Provider | Recommended model | Approx. cost per 1k evaluations |
|---|---|---|
| DeepSeek | `deepseek-v4-flash` | ≈ ¥0.30 |
| OpenAI | `gpt-4o-mini` | ≈ $0.15 |
| Anthropic | `claude-haiku-4-5` | ≈ $1 |
| Gemini | `gemini-2.0-flash` | free tier |
| Groq | `llama-3.1-8b-instant` | — |
| Ollama | `qwen2.5:7b` | $0 (local) |

Use Ollama if tweet data must not leave the device.

---

## Privacy

- No backend, no telemetry. The repo contains no server code.
- All state lives in `chrome.storage.local`: config, cache, learned rules, and feedback history are local to your machine.
- Outbound traffic is limited to user-initiated AI API calls, sent directly from your machine to the provider you choose. TweetGuard does not proxy or log.
- Ollama local mode keeps tweet data on-device.
- No username-based filtering. `@handle` is structurally unreliable as a signal (Asian users widely use "romanized name + digits" handles). Built-in rules judge by display-name templates and tweet content; AI learning is restricted to tweet text.

See [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) for the full data-flow design.

---

## Documentation

Design and engineering notes live in [`docs/`](docs/):

| Doc | Contents |
|---|---|
| [PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) | Market research, competitor analysis, positioning |
| [DETECTION_LOGIC.md](docs/DETECTION_LOGIC.md) | How each of the 17 signals scores a tweet; worked examples |
| [DEFAULT_RULES.md](docs/DEFAULT_RULES.md) | Default ruleset — keywords, regex, weights, thresholds |
| [PERFORMANCE_UX.md](docs/PERFORMANCE_UX.md) | FOUC prevention, MutationObserver design, render timing |
| [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | BYOK design, prompt engineering, cache strategy, cost model |
| [LONG_TERM_DEFENSE.md](docs/LONG_TERM_DEFENSE.md) | Why rules alone are insufficient; multi-layer defense |

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

No build step. Edit a file, reload the extension at `chrome://extensions`, refresh `x.com`.

---

## Contributing

PRs welcome. Useful directions:

- New Chinese spam template patterns (built-in rules in `src/inject.js`'s `RX` block)
- Multi-language spam rules (Spanish / Indonesian / Korean, etc.)
- Provider adapters (Anthropic batches API, OpenRouter routing, etc.)
- UI / visual polish (`options/options.css` or `src/styles.css`)
- Test fixtures — real-world spam DOM snapshots for regression tests

Before opening a PR:

1. Test the change against real `x.com` for at least 30 minutes of casual scrolling.
2. Make sure legitimate accounts aren't auto-blocked based on weak signals.
3. Run `node -c src/*.js` to confirm no syntax errors.

---

## Roadmap

- [ ] Chrome Web Store listing
- [ ] Firefox port (Manifest V3 is now stable on Firefox)
- [ ] On-device classifier via `transformers.js` (no AI key required)
- [ ] Bilingual UI (currently Chinese-primary)
- [ ] Filter list subscription model (à la uBlock Origin)
- [ ] Cache export / import

---

## License

MIT — see [LICENSE](LICENSE).
