#!/usr/bin/env bash
# 打包 TweetGuard 为可加载的 zip —— 用于 GitHub Release / Chrome「加载已解压的扩展程序」。
# 只含扩展运行必需文件;排除开发文档(docs/)、仓库元数据、README,
# 以及 community-rules.json(运行时从 GitHub 拉取,不读本地副本)。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION=$(grep '"version"' manifest.json | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
OUT="dist/tweetguard-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"
zip -rq "$OUT" \
  manifest.json \
  src options popup icons \
  LICENSE \
  -x "*.DS_Store" "*/._*"

echo "✓ 打包完成: $OUT (version ${VERSION})"
unzip -l "$OUT"
