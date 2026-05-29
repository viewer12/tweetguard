# Chrome Web Store 上架素材

本目录包含上架 Chrome Web Store 所需的全部视觉素材,以及生成它们的 SVG 源文件 + 构建脚本。

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

截图建议按顺序 1→5 上传,讲述故事:**规则与权重**(产品独特性) → **静默隐藏效果**(用户体验) → **AI 自动复审**(自学习壁垒) → **社区共建**(开源生态) → **BYOK 多 provider**(灵活与隐私)。

## 设计原则(为什么这样画)

- **视觉与扩展实际 UI 一致**:配色 / 圆角 / 字号严格按 [options.css](../options/options.css) 的 CSS 变量取值(`--bg-soft #F8FAFC` / `--text #0F172A` / `--accent #0F172A` / `--success #059669` 等),避免店里看到的预期与装上后看到的实际产生落差。
- **事实严格对齐代码**:硬规则、评分信号、provider 列表等数字与名称都按 [defaults.js](../src/defaults.js) 的 `HARD_RULES` / `SCORING_SIGNALS` / `PROVIDERS` 实际值写,不靠记忆推断。
- **浏览器壳 + sidebar + 底部浮层标题** 五张截图统一构图,扫一眼能看出是同一产品的不同界面。
- **图标含 16px 透明 padding**,严格符合 Chrome Web Store「96 内容 + 16 padding」规范(原 icon 满铺,违反规范)。

## 重新生成 / 调整

所有素材都是 `src/` 目录里的 SVG → 用 `scripts/svg2png.sh` 渲染成 PNG。改 SVG 后重跑脚本即可。

```bash
# 单独生成一张:
bash scripts/svg2png.sh marketing/src/store-icon-128.svg 128 128 marketing/out/store-icon-128.png

# 全部重新生成:
cd marketing/src
for f in *.svg; do
  name="${f%.svg}"
  # 文件名末尾的尺寸约定:xxx-WxH.svg
  size=$(echo "$f" | grep -oE '[0-9]+x[0-9]+' | tail -1)
  W=${size%x*}; H=${size#*x}
  bash ../../scripts/svg2png.sh "$f" "$W" "$H" "../out/$name.png"
done
```

`scripts/svg2png.sh` 用 Chrome `--headless=new` 渲染 SVG,本机不需要装 rsvg/inkscape/ImageMagick。

## ⚠️ 关于截图的合规风险

5 张 1280×800 截图都是 **SVG 仿真版**,严格对齐了真实 UI 的视觉,但毕竟不是真实 Chrome 截图。Chrome Web Store 政策要求截图「demonstrate the actual user experience」。绝大多数扩展(尤其只读 UI 的产品)用仿真都能过审,但**理论上有被退回的可能**。

如果被退回,补救路径:用真实 Chrome 截扩展的配置页 / popup / x.com 推文流被处理后的视觉,各截一张原始素材,我可以按相同的构图(浏览器壳 + 标题层 + 1280×800 画布)加工出真实截图版,替换 SVG 仿真版。

## 店面文案建议(可选)

- **标题**:TweetGuard — 静默过滤 X 信息流里的垃圾推文
- **简短描述**(132 字符内):本地过滤 X 上的色情 bot、加密引流、营销号;五重检测 + 可选 AI 复审(自备 API Key)+ 社区规则共建;完全开源,无服务器、无遥测。
- **详细描述**:可直接复用 [README.md](../README.md) 的「简介」+「工作原理」+「功能」段。
- **类别**:Productivity 或 Social & Communication
- **语言**:zh_CN(主) + en_US(可选,有英文 README 复用)
