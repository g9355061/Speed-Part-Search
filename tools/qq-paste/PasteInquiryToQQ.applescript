-- Paste the current clipboard into Tencent QiDian or QQ.
-- The web page should copy the inquiry text before this script runs.
-- This script only pastes; it does not press Return or send the message.

on run
	set appCandidates to {"腾讯企点", "QQ"}
	set targetApp to ""
	
	tell application "System Events"
		repeat with appName in appCandidates
			if exists process (appName as text) then
				set targetApp to appName as text
				exit repeat
			end if
		end repeat
	end tell
	
	if targetApp is "" then
		repeat with appName in appCandidates
			try
				do shell script "open -a " & quoted form of (appName as text)
				set targetApp to appName as text
				delay 1.2
				exit repeat
			end try
		end repeat
	end if
	
	if targetApp is "" then
		display dialog "找不到腾讯企点或 QQ。请先打开 QQ 对话窗口后再执行。" buttons {"确定"} default button "确定" with icon caution
		return
	end if
	
	tell application targetApp to activate
	delay 0.45
	
	tell application "System Events"
		tell process targetApp
			set frontmost to true
		end tell
		delay 0.15
		keystroke "v" using command down
	end tell
end run
