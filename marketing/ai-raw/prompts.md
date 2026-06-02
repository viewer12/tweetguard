# gpt-image-2 生成 marketing 素材的 prompts

## 共同原则

- 锁住品牌色 `#0F172A`(深 navy)+ 浅灰背景
- 明确写 **"no text, no letters, no words"** — gpt-image-2 文字渲染会出乱码;文字必须后期叠加
- 描述构图、留白比例、风格关键词(flat vector / minimalist / cinematic)
- 包含**反向描述**(避免 logo / 品牌名 / 真实 X logo / 真实 tweet 文字)

## icon(1024×1024 → sips 缩成 128×128)

```
A premium minimalist app icon for a security shield concept.
Deep navy blue (#0F172A) rounded square background,
large clean white shield silhouette centered,
a single dark navy checkmark perfectly placed inside the shield.
Flat vector design language matching modern macOS / iOS aesthetics.
Generous padding around the shield (~16% inset from edges).
Crisp edges, subtle inner highlight on the shield.
Absolutely no text, no letters, no numbers, no words anywhere — purely iconic.
Centered composition.
```

## small promo tile(1536×1024 → 中心裁切到 440×280)

```
Clean modern marketing tile for a Chrome browser extension that silently filters
spam from social media feeds.
Left side: a prominent dark navy blue shield icon with a checkmark inside,
sitting on a soft light grey background.
Right side: stylized abstract floating cards representing a social media feed —
three crisp clear cards (legitimate posts) and two faded ghosted-out cards
(filtered spam) gently fading away with diagonal pattern overlay.
Soft white-to-pale-slate gradient background.
Minimalist flat vector illustration, premium professional aesthetic,
lots of negative space, balanced composition.
Absolutely no text, no letters, no readable words, no logos or brand names anywhere
— just abstract horizontal lines suggesting text on the cards.
```

## marquee(1536×1024 → sips 缩到 1400×560)

```
Wide cinematic hero banner for a privacy-focused Chrome extension that silently
filters spam tweets.
Left third: a large prominent dark navy shield icon (#0F172A) with a white
checkmark inside, softly glowing.
Right two-thirds: a vertical stream of stylized social media tweet cards floating
gently — half are crisp clear cards in white with avatars and abstract text lines
(legitimate tweets), half are faded ghosted cards with subtle diagonal stripe
pattern overlay (filtered spam being silently hidden).
Soft pastel gradient background from off-white on the left to pale slate-blue on
the right.
Calm professional minimalist aesthetic.
Modern flat vector illustration style with subtle shadows.
Generous negative space around the shield.
Absolutely no readable text, no letters, no words, no logos visible — only
abstract shapes and lines suggesting text/avatars on the cards.
Wide horizontal composition.
```

## 5 张 screenshot — gpt-image-2 也能做(已验证)

之前误以为 AI 生图做不出真实 UI 截图(文字会糊、布局乱),用户纠正:**只要 prompt 把要渲染的具体文字内容用引号写出来 + 精准描述布局,gpt-image-2 能产出近似真实 Chrome 截图的效果**。screenshot-1 实测已验证。

写 screenshot prompt 的关键:
1. **顶部明确写**"pixel-perfect screenshot of a Chrome browser window, photographic realism, NOT illustration"
2. **逐区域描述**:浏览器 chrome(traffic lights / address bar)→ 左 sidebar(brand + nav 顺序高亮谁) → 右主面板(title + subtitle + 每张卡片)
3. **每个要渲染的中文字符串都用引号包**,模型会按字面画
4. **数字 / 时间戳 / 分类 dot 颜色** 都写清楚
5. 1536×1024 生成,sips 后处理到 1280×800
