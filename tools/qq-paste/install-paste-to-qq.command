#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
INSTALL_DIR="$HOME/Library/Scripts/Speed Part Search"
DESKTOP_COMMAND="$HOME/Desktop/貼到QQ.command"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.speedpart.qq-paste-helper.plist"
NODE_BIN="$(command -v node)"
APP_BUNDLE="/Applications/PasteInquiryToQQ.app"

mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/PasteInquiryToQQ.applescript" "$INSTALL_DIR/PasteInquiryToQQ.applescript"
cp "$SCRIPT_DIR/qq-paste-helper.js" "$INSTALL_DIR/qq-paste-helper.js"
chmod +x "$INSTALL_DIR/qq-paste-helper.js"
rm -rf "$APP_BUNDLE"
/usr/bin/osacompile -o "$APP_BUNDLE" "$INSTALL_DIR/PasteInquiryToQQ.applescript"

cat > "$DESKTOP_COMMAND" <<'EOF'
#!/bin/zsh
/usr/bin/open "/Applications/PasteInquiryToQQ.app"
EOF

chmod +x "$DESKTOP_COMMAND"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$LAUNCH_AGENT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.speedpart.qq-paste-helper</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$INSTALL_DIR/qq-paste-helper.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SPEEDPART_QQ_PASTE_SCRIPT</key>
    <string>$INSTALL_DIR/PasteInquiryToQQ.applescript</string>
    <key>SPEEDPART_QQ_PASTE_APP</key>
    <string>$APP_BUNDLE</string>
    <key>SPEEDPART_QQ_PASTE_DELAY_MS</key>
    <string>1800</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/speedpart-qq-paste-helper.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/speedpart-qq-paste-helper.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$LAUNCH_AGENT" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$LAUNCH_AGENT"
launchctl enable "gui/$(id -u)/com.speedpart.qq-paste-helper" >/dev/null 2>&1 || true

/usr/bin/open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" >/dev/null 2>&1 || true

/usr/bin/osascript <<'EOF'
display dialog "已安装 QQ 自动贴上 helper。\n\n现在网页点 QQ 后，会复制询价内容、打开 QQ，并自动呼叫本机 helper 贴上。\n\n第一次使用时，请在系统设置 > 隐私与安全性 > 辅助使用，允许 /Applications/PasteInquiryToQQ.app 控制电脑。\n\n桌面的「貼到QQ.command」仍保留为手动备用。" buttons {"确定"} default button "确定"
EOF
