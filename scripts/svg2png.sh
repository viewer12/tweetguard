#!/usr/bin/env bash
# 把 SVG 渲染成指定尺寸 PNG —— 用 Chrome --headless 截图,
# 因为本机没装 rsvg-convert/inkscape/imagemagick,而 Chrome 一定有。
# 用法: svg2png.sh <input.svg> <width> <height> <output.png>
set -euo pipefail

if [ $# -ne 4 ]; then
  echo "用法: $0 <input.svg> <width> <height> <output.png>"; exit 1
fi
INPUT="$1"; W="$2"; H="$3"; OUT="$4"
[ -f "$INPUT" ] || { echo "✗ 找不到 $INPUT"; exit 1; }
mkdir -p "$(dirname "$OUT")"

CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "✗ Chrome 路径不可执行: $CHROME"; exit 1; }

# 包成 HTML —— 透明背景、SVG 拉满窗口
TMPDIR_REAL=$(mktemp -d -t tg-render)
trap "rm -rf '$TMPDIR_REAL'" EXIT
TMPHTML="$TMPDIR_REAL/page.html"
SVG=$(cat "$INPUT")
cat > "$TMPHTML" <<HTML
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;}
  svg{display:block;width:${W}px;height:${H}px;}
</style></head><body>${SVG}</body></html>
HTML

"$CHROME" \
  --headless=new \
  --disable-gpu --no-sandbox --hide-scrollbars \
  --default-background-color=00000000 \
  --window-size=${W},${H} \
  --screenshot="$OUT" \
  --virtual-time-budget=2000 \
  "file://$TMPHTML" >/dev/null 2>&1 || true

if [ ! -f "$OUT" ]; then
  echo "✗ Chrome 没生成 $OUT(可能 headless 失败)"; exit 1
fi
SIZE=$(wc -c < "$OUT" | tr -d ' ')
echo "✓ $OUT (${W}×${H}, ${SIZE} bytes)"
