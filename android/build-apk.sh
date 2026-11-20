#!/usr/bin/env bash
# Copies the web app into the APK assets and builds Shahzad.apk.
set -euo pipefail
cd "$(dirname "$0")"
WWW=app/src/main/assets/www
rm -rf app/src/main/assets && mkdir -p "$WWW"
cp -r ../index.html ../manifest.webmanifest ../hand_landmarker.task ../css ../js ../vendor ../icons "$WWW/"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
gradle --no-daemon -q assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../Shahzad.apk
echo "Built ../Shahzad.apk"
