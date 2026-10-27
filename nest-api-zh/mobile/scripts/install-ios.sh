#!/usr/bin/env bash
# 编译 Release 版并安装到已连接的 iPhone。
# 用法：
#   bash scripts/install-ios.sh                 # 用默认设备
#   bash scripts/install-ios.sh <设备UDID>       # 指定设备
#   xcrun devicectl list devices                # 查 UDID
set -euo pipefail

cd "$(dirname "$0")/.."          # mobile/
UDID="${1:-00008150-000A18313432401C}"
TEAM="${APPLE_TEAM_ID:-9B99Q22WDJ}"
BUNDLE_ID="com.yangzheng.nestdocs"

echo "▸ 设备 $UDID · Team $TEAM"

# 1) 没有原生工程就生成（首次会跑 pod install）
if [ ! -d ios ]; then
  echo "▸ 生成 ios 工程…"
  EXPO_NO_TELEMETRY=1 npx expo prebuild --platform ios
fi

cd ios
if [ ! -d Pods ]; then
  echo "▸ 安装 CocoaPods 依赖…"
  pod install
fi

# 2) 自动签名 + Release 编译（JS 打进包，脱离电脑也能看）
echo "▸ 编译中（首次较慢，之后增量很快）…"
xcodebuild \
  -workspace NestJS.xcworkspace \
  -scheme NestJS \
  -configuration Release \
  -destination "id=$UDID" \
  -derivedDataPath build \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_IDENTITY="Apple Development" \
  | tail -5

APP="build/Build/Products/Release-iphoneos/NestJS.app"
[ -d "$APP" ] || { echo "✗ 没找到 $APP"; exit 1; }

# 3) 安装 + 启动
echo "▸ 安装到设备…"
xcrun devicectl device install app --device "$UDID" "$APP"
echo "▸ 启动…"
xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID" || true

echo "✓ 完成。若提示未受信任，去 设置 → 通用 → VPN与设备管理 信任开发者证书。"
