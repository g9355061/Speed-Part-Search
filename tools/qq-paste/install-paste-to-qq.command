#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
INSTALL_DIR="$HOME/Library/Scripts/Speed Part Search"
DESKTOP_COMMAND="$HOME/Desktop/貼到QQ.command"

mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/PasteInquiryToQQ.applescript" "$INSTALL_DIR/PasteInquiryToQQ.applescript"

cat > "$DESKTOP_COMMAND" <<'EOF'
#!/bin/zsh
/usr/bin/osascript "$HOME/Library/Scripts/Speed Part Search/PasteInquiryToQQ.applescript"
EOF

chmod +x "$DESKTOP_COMMAND"

/usr/bin/open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" >/dev/null 2>&1 || true

/usr/bin/osascript <<'EOF'
display dialog "已安装「貼到QQ.command」到桌面。\n\n第一次使用时，请在系统设置 > 隐私与安全性 > 辅助使用，允许 Terminal / iTerm / Codex 控制电脑。\n\n使用流程：网页点 QQ 后打开对话，再双击桌面的「貼到QQ.command」贴上询价内容。" buttons {"确定"} default button "确定"
EOF
