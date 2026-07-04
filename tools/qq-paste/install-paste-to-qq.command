#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.speedpart.qq-paste-helper.plist"
HAMMERSPOON_DIR="$HOME/.hammerspoon"
HAMMERSPOON_MODULE="$HAMMERSPOON_DIR/speedpart-qq-paste.lua"
HAMMERSPOON_INIT="$HAMMERSPOON_DIR/init.lua"

launchctl bootout "gui/$(id -u)" "$LAUNCH_AGENT" >/dev/null 2>&1 || true
rm -f "$LAUNCH_AGENT"
rm -f "$HOME/Library/Scripts/Speed Part Search/PasteInquiryToQQ.applescript"
rm -f "$HOME/Library/Scripts/Speed Part Search/qq-paste-helper.js"

mkdir -p "$HAMMERSPOON_DIR"
cp "$SCRIPT_DIR/speedpart-qq-paste.lua" "$HAMMERSPOON_MODULE"

touch "$HAMMERSPOON_INIT"
if ! grep -Fq 'require("speedpart-qq-paste")' "$HAMMERSPOON_INIT"; then
  {
    echo ''
    echo '-- Speed Part Search QQ paste helper'
    echo 'require("speedpart-qq-paste")'
  } >> "$HAMMERSPOON_INIT"
fi

/usr/bin/open -a Hammerspoon >/dev/null 2>&1 || true
/usr/bin/open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" >/dev/null 2>&1 || true

/usr/bin/osascript <<'EOF'
display dialog "已安裝 Hammerspoon QQ 自動貼上 helper。\n\n現在網頁點 QQ 後，會先複製詢價內容、開啟 QQ，再呼叫 Hammerspoon 貼上。\n\n請在系統設定 > 隱私權與安全性 > 輔助使用，允許 Hammerspoon 控制電腦。\n\n若 Hammerspoon 已開啟，請點它選單列圖示並選 Reload Config。" buttons {"確定"} default button "確定"
EOF
