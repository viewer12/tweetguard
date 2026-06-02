# Chrome Web Store 上架素材

本目录包含上架 Chrome Web Store 所需的全部视觉素材。**全部由 gpt-image-2 生成**(通过全局 [gpt-image-2 skill](~/.claude/skills/gpt-image-2/)),`ai-raw/` 是高分辨率源,`out/` 是按规格成品。

## 上传到 Chrome Web Store 的文件

只需要上传 `out/` 目录里的 PNG。

| 文件 | 规格 | 上传位置 | 必需 |
|------|------|---------|------|
| [out/store-icon-128.png](out/store-icon-128.png) | 128×128(96 内容 + 16 透明 padding) | Store listing → Icon | ✓ |
| [out/small-promo-440x280.png](out/small-promo-440x280.png) | 440×280 | Store listing → Small promo tile | ✓(没有它排序靠后) |
| [out/marquee-1400x560.png](out/marquee-1400x560.png) | 1400×560 | Store listing → Marquee promo tile | 可选(没有它进不了特色展示) |
| [out/screenshot-1-rules-1280x800.png](out/screenshot-1-rules-1280x800.png) | 1280×800 | Store listing → Screenshots | ✓(至少 1,最多 5) |
| [out/screenshot-2-feed-1280x800.png](out/screenshot-2-feed-1280x800.png) | 1280×800 | 同上 | |
| [out/screenshot-3-feedback-1280x800.png](out/screenshot-3-feedback-1280x800.png) | 1280×800 | 同上 | |
| [out/screenshot-4-community-1280x800.png](out/screenshot-4-community-1280x800.png) | 1280×800 | 同上 | |
| [out/screenshot-5-ai-provider-1280x800.png](out/screenshot-5-ai-provider-1280x800.png) | 1280×800 | 同上 | |

截图按 1→5 顺序讲故事:**规则与权重**(产品独特性) → **静默隐藏效果**(用户体验) → **AI 自动复审**(自学习壁垒) → **社区共建**(开源生态) → **BYOK 多 provider**(灵活与隐私)。

## ai-raw/ 是什么

`ai-raw/` 是 gpt-image-2 的高分辨率原始输出,`out/` 是经 `sips` 缩放/裁切到 Chrome 规格的成品。改 prompt 重做时:

| ai-raw/ 源 | 生成方式 | → out/ 成品 |
|---|---|---|
| `icon-raw.png` (1024×1024) | `generate.sh` + 纯文字 prompt,做完后用 PIL 加 16px 透明 padding | `store-icon-128.png` |
| `small-promo-edit-v3.png` (1536×1024) | **`edit.sh` 用 `icon-raw.png` 当参考图** + prompt | `small-promo-440x280.png` |
| `marquee-edit-v3.png` (1536×1024) | 同上,保证盾牌 logo 跟 store icon 一致 | `marquee-1400x560.png` |
| `screenshot-*-2k.png` (2048×1280) | `generate.sh` + 精准 prompt(中文要渲染的字用引号包) + `quality=high` | `screenshot-*-1280x800.png`(sips supersample) |

[prompts.md](ai-raw/prompts.md) 留了写 prompt 的要点和坑。

## 重新生成 / 调整

需要全局 gpt-image-2 skill 已配置(API key 在 `~/.claude/skills/gpt-image-2/config.sh`)。

```bash
# 例 1:重做 icon
bash ~/.claude/skills/gpt-image-2/scripts/generate.sh \
  "$(prompt content)" 1024x1024 marketing/ai-raw/icon-raw.png
sips -Z 96 marketing/ai-raw/icon-raw.png --out /tmp/icon-96.png
python3 -c "from PIL import Image; src=Image.open('/tmp/icon-96.png').convert('RGBA'); canvas=Image.new('RGBA',(128,128),(0,0,0,0)); canvas.paste(src,(16,16),src); canvas.save('marketing/out/store-icon-128.png')"

# 例 2:重做 promo(用 icon 当参考图保 logo 一致)
bash ~/.claude/skills/gpt-image-2/scripts/edit.sh \
  marketing/ai-raw/icon-raw.png \
  "$(prompt content)" 1536x1024 marketing/ai-raw/small-promo-edit-v3.png
sips -Z 440 marketing/ai-raw/small-promo-edit-v3.png --out marketing/out/small-promo-440x280.png
sips -c 280 440 marketing/out/small-promo-440x280.png --out marketing/out/small-promo-440x280.png

# 例 3:重做 screenshot(2K supersample → 1280×800)
bash ~/.claude/skills/gpt-image-2/scripts/generate.sh \
  "$(prompt content)" 2048x1280 marketing/ai-raw/screenshot-N-NAME-2k.png
sips -Z 1280 marketing/ai-raw/screenshot-N-NAME-2k.png --out marketing/out/screenshot-N-NAME-1280x800.png
sips -c 800 1280 marketing/out/screenshot-N-NAME-1280x800.png --out marketing/out/screenshot-N-NAME-1280x800.png
```

**计费提醒**:每次 `generate.sh` / `edit.sh` 调用 = $0.05(成功 / 失败 / 超时都计费)。skill 默认不做客户端 retry,失败 1 次就停,由人工决定要不要再发。**绝对不要并发跑多张** —— 实测 ≥3 张并发 server 必拒并把全部计入计费。

## 设计原则

- **logo 一致性靠 image-to-image**:promo / marquee 都用 `edit.sh` 把 `icon-raw.png` 当输入,模型基于真实 icon 生成衍生图,盾牌设计 100% 一致。纯文字 prompt 描述"白盾深 navy 外框…"在多次生成时**必然漂移**。
- **视觉与扩展实际 UI 对齐**:配色 / 圆角 / 字号都按 [options.css](../options/options.css) 的 CSS 变量取值(`--bg-soft #F8FAFC` / `--text #0F172A` / `--accent #0F172A` / `--success #059669`)。
- **事实严格对齐代码**:硬规则 ID、评分信号项数、provider 列表、默认配置值,都按 [defaults.js](../src/defaults.js) 的 `HARD_RULES` / `SCORING_SIGNALS` / `PROVIDERS` 实际值写,不靠记忆推断。
- **图标含 16px 透明 padding**:严格符合 Chrome Web Store「96 内容 + 16 padding」规范。

## 店面文案建议

- **标题**:TweetGuard — 静默过滤 X 信息流里的垃圾推文
- **简短描述**(132 字符内):本地过滤 X 上的色情 bot、加密引流、营销号;五重检测 + 可选 AI 复审(自备 API Key)+ 社区规则共建;完全开源,无服务器、无遥测。
- **详细描述**:可直接复用 [README.md](../README.md) 的「简介」+「工作原理」+「功能」段。
- **类别**:Productivity 或 Social & Communication
- **语言**:zh_CN(主) + en_US(可选,有英文 README 复用)
