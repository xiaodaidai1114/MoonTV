#!/usr/bin/env bash
# 构建 MoonTV 轻量级 APK（WebView 外壳，零第三方依赖）
#   依赖：JDK 17+ 与 Android SDK（build-tools 34、platforms;android-34）
#   用法：./build.sh
set -euo pipefail

APK_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-$HOME/android-sdk}"
# 需要 JDK 17（build-tools 34 的 d8 在更高版本 JDK 上有兼容问题）
if [ -z "${JAVA_HOME:-}" ]; then
  for candidate in /tmp/jdk17/Contents/Home /opt/homebrew/opt/openjdk@17 /opt/homebrew/opt/jdk-temurin-25/Home; do
    if [ -x "$candidate/bin/javac" ]; then JAVA_HOME="$candidate"; break; fi
  done
fi
JAVA_HOME="${JAVA_HOME:-/tmp/jdk17/Contents/Home}"
export PATH="$JAVA_HOME/bin:$PATH"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="$APK_DIR/build"

if [ ! -d "$BT" ] || [ ! -f "$PLATFORM" ]; then
  echo "找不到 Android SDK：$SDK（需要 build-tools;34.0.0 与 platforms;android-34）" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

echo "== 编译资源 =="
"$BT/aapt2" compile --dir "$APK_DIR/res" -o "$OUT/res.zip"

echo "== 链接资源与清单 =="
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$PLATFORM" \
  --manifest "$APK_DIR/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --min-sdk-version 23 \
  --target-sdk-version 34 \
  --auto-add-overlay \
  "$OUT/res.zip"

echo "== 编译 Java =="
find "$APK_DIR/src" "$OUT/gen" -name "*.java" > "$OUT/sources.txt"
"$JAVA_HOME/bin/javac" \
  -source 8 -target 8 \
  -bootclasspath "$PLATFORM" \
  -classpath "$PLATFORM" \
  -d "$OUT/classes" \
  @"$OUT/sources.txt" 2>&1 | grep -v "bootstrap class path\|source value 8\|target value 8\|deprecated" || true

echo "== 转 dex =="
CLASSES=$(find "$OUT/classes" -name "*.class")
"$BT/d8" --lib "$PLATFORM" --min-api 23 --output "$OUT/dex" $CLASSES

echo "== 打包 =="
cp "$OUT/base.apk" "$OUT/unsigned.apk"
( cd "$OUT/dex" && zip -q "$OUT/unsigned.apk" classes.dex )
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$APK_DIR/keystore.jks" ]; then
  echo "== 生成签名密钥（仅首次） =="
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -keystore "$APK_DIR/keystore.jks" \
    -alias moontv \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass moontv123 -keypass moontv123 \
    -dname "CN=MoonTV, OU=App, O=MoonTV, L=CN, S=CN, C=CN" >/dev/null 2>&1
fi

echo "== 签名 =="
"$BT/apksigner" sign \
  --ks "$APK_DIR/keystore.jks" \
  --ks-pass pass:moontv123 \
  --key-pass pass:moontv123 \
  --ks-key-alias moontv \
  --min-sdk-version 23 \
  --out "$APK_DIR/moontv.apk" \
  "$OUT/aligned.apk"

"$BT/apksigner" verify --print-certs "$APK_DIR/moontv.apk" | head -3

echo
echo "完成：$APK_DIR/moontv.apk  ($(du -h "$APK_DIR/moontv.apk" | cut -f1))"
