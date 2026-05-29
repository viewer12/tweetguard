<div align="center">

<img src="icons/icon-128.png" width="96" height="96" alt="TweetGuard">

# TweetGuard

Chrome extension that filters spam, marketing accounts, NSFW bots and crypto shills out of your X (Twitter) feed.

[简体中文](README.md) · English

[![License: MIT](https://img.shields.io/badge/license-MIT-0f172a.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/chrome-extension-0f172a.svg)](#install)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-0f172a.svg)](manifest.json)
[![No Backend](https://img.shields.io/badge/backend-none-059669.svg)](#privacy)

</div>

---

## Overview

TweetGuard identifies and silently collapses spam tweets in your X (Twitter) feed, entirely on the client. No backend, no telemetry — all data lives in `chrome.storage.local`. Built-in rules work out of the box; optionally bring your own AI key to let it **automatically learn and distill** new spam templates as you browse; and it can **two-way sync** with a GitHub community rule set.

---

## How it works

Each tweet passes through several gates, cheapest first — whichever decides first wins:

```
① List protection (highest priority)
   Whitelist / people you follow → never hidden;  blacklist → force-hidden.
   No rule (community rules included) can hide someone you trust.
        │
② Per-account cache
   Account judged before → reuse the result. Zero compute, zero AI.
        │
③ Rule match (hide on hit)
   Built-in hard rules + AI-learned rules + GitHub community rules
   — tweet keywords / short romanized-Chinese / fixed emoji templates.
        │
④ L0 scoring (13 signals accumulate; over threshold → hide / blur)
   Display-name signals are down-weighted (display names are unreliable).
        │
⑤ AI review (gray zone, optional)
   When local rules are unsure, send to your configured AI (DeepSeek /
   OpenAI / Anthropic / Gemini / Groq / OpenRouter / Ollama). The AI
   **distills a rule on the spot** — next time the same template is
   caught locally, no AI call.
```

Flagged tweets collapse into a thin, card-width strip showing the reason and source (local rule / community / AI / cache). Click to expand, click again to re-collapse.

---

## Three rule sources

| Source | Where it comes from | View / manage |
|---|---|---|
| **Built-in** | Hard-coded: **4 hard rules** + **13 scoring signals** | Settings → "Rules & Weights" (rendered from a single source of truth shared with the engine) |
| **AI-learned** | AI **auto-distills** a tweet keyword when it flags spam; a review-prompt fallback fills in when classification yields nothing; your manual misjudgment reports also produce rules | Settings → "AI-learned rules" (each tagged "auto" / "your feedback"; toggle/delete) |
| **GitHub community** | Synced from a community repo; you can contribute yours with one click | Settings → "Rules & Weights" → "Community sync" |

**Self-improvement**: every time the AI catches spam that local rules missed, it distills the tweet keyword (text, short romanized-Chinese like `sao货`, or a fixed emoji template) into a rule — so it gets **cheaper and sharper the more you use it**.

---

## Features

- **List protection first**: people you follow / whitelist are never hidden by any rule (community rules included) — a fail-open floor.
- **Three rule sources**: built-in + AI self-learning + GitHub community, all visible, toggleable, deletable.
- **AI auto-distillation**: rules are learned automatically after a spam verdict (emoji templates included); a review-prompt fallback covers cases the classifier missed.
- **Bring your own AI key (BYOK)**: DeepSeek, OpenAI, Anthropic, Gemini, Groq, OpenRouter, Ollama (local).
- **GitHub community rules**: two-way — pull shared rules + contribute yours in one click; a misfiring community rule can be vetoed locally, and your veto survives re-syncs.
- **Auto-sync your following list**: one click on your own "Following" page auto-scrolls and captures every account into protection (uses X's own loading, no API reverse-engineering).
- **Backup / restore config**: full export/import (learned rules, lists, following, feedback history, keywords, identified accounts, preferences); API key optionally included.
- **Feedback learning**: "Trust" on a wrongly-hidden tweet auto-disables the offending rule; the flag button on a missed spam triggers rule induction.
- **Hide modes**: collapse strip / in-place blur / full remove; three sensitivity levels.
- **No telemetry**: no server, no tracking. Outbound traffic is only your explicit AI calls plus (when enabled) pulling community rules from GitHub.

---

## Install

Until it's on the Chrome Web Store, install in developer mode. Pick either option:

**Option A — download the packaged zip (recommended)**

1. Grab the latest `tweetguard-x.y.z.zip` from [Releases](https://github.com/viewer12/tweetguard/releases) and **unzip** it into a permanent folder (don't delete it — the extension runs from there).
2. Open `chrome://extensions` in Chrome / Edge / Brave.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.
5. Open `x.com` — built-in rules are on by default.

> Why not a double-click `.crx`? Chrome auto-disables `.crx` files from outside the Web Store for security, so "unzip + Load unpacked" is the most reliable sideload today.

**Option B — clone the source (developers)**

1. Clone the repo:
   ```bash
   git clone https://github.com/viewer12/tweetguard.git
   ```
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the cloned directory.

> After editing code, hit the **reload** icon on the extension in `chrome://extensions`, then refresh `x.com`.

---

## Configure AI (optional)

Built-in rules alone cover most overt spam. Enabling AI lifts coverage from ~80% to ~95% and starts **auto-learning** templates the built-ins don't yet cover.

1. Toolbar TweetGuard icon → **Settings** → **AI Provider**.
2. Pick a provider, enter the API key, click **Run test** (5 known samples).

| Provider | Model | ~Cost per 1000 evals |
|---|---|---|
| DeepSeek | `deepseek-v4-flash` | ≈ ¥0.30 |
| OpenAI | `gpt-4o-mini` | ≈ $0.15 |
| Anthropic | `claude-haiku-4-5` | ≈ $1 |
| Gemini | `gemini-2.0-flash` | free tier |
| Groq | `llama-3.1-8b-instant` | — |
| Ollama | `qwen2.5:7b` | $0 (local; tweets never leave your machine) |

Both prompts (classifier / review) are viewable, editable and resettable under **Settings → Prompt**.

---

## Community rules

TweetGuard can sync community rules from GitHub (on by default, toggleable):

- **Sync (pull)**: pulls from this repo's [`community-rules.json`](community-rules.json) by default — on startup + every 24h, plus a manual "Sync now". Pulled rules pass the **same safety gate** as AI-learned rules: tweet keywords only; display-name / username rules are rejected.
- **Contribute (push)**: Settings → "Rules & Weights" → "Community sync" → "Contribute my rules" exports your local learned rules in community format (copied to clipboard + downloaded + opens the GitHub commit page); confirm and open a PR.
- **Veto**: a misfiring community rule can be vetoed locally via "Trust", and re-syncs never overwrite your veto.

Rule file format:
```json
{ "format": "tweetguard-rules-v1", "rules": [ { "kind": "tweet_keyword", "value": "完整版来了", "category": "cn_nsfw_bot" } ] }
```

---

## Privacy

- No backend, no telemetry; the repo contains no server code.
- All state lives in `chrome.storage.local`: config, cache, learned rules, feedback history — local only.
- Outbound traffic is only: your AI API calls (direct to your chosen provider, not relayed) + community-rule pulls from GitHub when enabled.
- Ollama local mode keeps tweets on your machine.
- **Never judges spam by username (@handle)**: handles are structurally unreliable (Asian users widely use "romanized name + digits"). Even display-name hard rules are kept to a tiny set (Chinese solicitation phrases, WeChat/TG); other display-name signals are down-weighted in scoring; AI-learned and community rules are **tweet-content only**.

---

## Project structure

```
TweetGuard/
├── manifest.json              Chrome MV3 manifest (storage + alarms)
├── community-rules.json       community rule set (default GitHub sync source)
├── src/
│   ├── content.js             isolated-world bridge (storage / AI request relay)
│   ├── inject.js              page-context core: DOM observe, L0 scoring,
│   │                          cache, AI client, auto-distill, following sync, actuator
│   ├── background.js          service worker: AI fetch proxy + GitHub rule sync
│   ├── defaults.js            default config, provider catalog, prompts, rule single-source
│   └── styles.css             injected CSS (collapse strip / blur / pending / sync button)
├── popup/                     toolbar popup (quick toggle + stats)
├── options/                   full settings page (General / AI / Prompt / Rules / Accounts / Lists / About)
├── docs/                      design docs
└── icons/                     icon assets (SVG source + 16/32/48/128 PNG)
```

No build step. Reload the extension in `chrome://extensions` and refresh `x.com` after edits.

---

## Contributing

- **Submit rules**: the quickest way is the in-extension "Contribute my rules", then PR into [`community-rules.json`](community-rules.json).
- **Code**: Chinese spam templates (`RX` block in `src/inject.js`), multilingual rules, provider adapters, UI polish, regression fixtures.

Before a PR: scroll-test on real `x.com`; make sure weak signals don't auto-hide legit accounts; `node --check src/*.js` passes.

---

## Roadmap

- [x] Cache / config export-import
- [x] Community rule subscription & contribution (GitHub sync)
- [ ] Chrome Web Store listing
- [ ] Firefox port (MV3)
- [ ] In-browser classifier (`transformers.js`, no AI key)
- [ ] Full English UI

---

## License

MIT — see [LICENSE](LICENSE).
