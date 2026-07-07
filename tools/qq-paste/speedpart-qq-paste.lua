local logPath = os.getenv("HOME") .. "/Library/Logs/speedpart-hammerspoon-qq.log"

local function log(message)
  local file = io.open(logPath, "a")
  if file then
    file:write(os.date("%Y-%m-%d %H:%M:%S") .. " " .. message .. "\n")
    file:close()
  end
end

local function findTargetApp()
  local bundleIds = {
    "com.tencent.qq",
  }

  for _, bundleId in ipairs(bundleIds) do
    local app = hs.application.get(bundleId)
    if app then
      return app
    end
  end

  local appNames = {
    "腾讯企点",
    "QQ",
  }

  for _, appName in ipairs(appNames) do
    local app = hs.application.find(appName)
    if app then
      return app
    end
  end

  return nil
end

local function delayFromParams(params)
  local rawDelay = params and params.delay
  local delayMs = tonumber(rawDelay) or 2600
  if delayMs < 0 then
    delayMs = 0
  elseif delayMs > 8000 then
    delayMs = 8000
  end

  return delayMs / 1000
end

local function performPaste(delaySeconds, source)
  log("paste requested from " .. source .. ", delay=" .. tostring(delaySeconds))
  local app = findTargetApp()
  if not app then
    log("target app not found")
    hs.alert.show("請先開啟 QQ / 腾讯企点 對話")
    return
  end

  log("target app found: " .. app:name())

  hs.timer.doAfter(delaySeconds, function()
    log("activating app: " .. app:name())
    hs.alert.show("SpeedPart: 切到 " .. app:name())
    app:activate(true)
  end)
  hs.timer.doAfter(delaySeconds + 0.55, function()
    log("sending cmd-v")
    hs.alert.show("SpeedPart: 貼上")
    hs.eventtap.keyStroke({ "cmd" }, "v", 0, app)
    log("cmd-v sent")
  end)
end

hs.urlevent.bind("speedpartPaste", function(_, params)
  log("received hammerspoon://speedpartPaste")
  hs.alert.show("SpeedPart: 收到 URL 貼上指令")
  performPaste(delayFromParams(params), "url")
end)

local function delayFromPath(path)
  local rawDelay = string.match(path or "", "delay=(%d+)")
  return delayFromParams({ delay = rawDelay })
end

-- 讀取 QQ 目前對話視窗的文字（給網頁「讀取 QQ 回覆」導讀用）。
-- QQ NT 是 Electron，需先設 AXManualAccessibility 打開輔助功能樹。
local function readQqChat()
  local app = findTargetApp()
  if not app then
    return { ok = false, error = "qq_not_running" }
  end

  local axApp = hs.axuielement.applicationElement(app)
  pcall(function() axApp:setAttributeValue("AXManualAccessibility", true) end)
  pcall(function() axApp:setAttributeValue("AXEnhancedUserInterface", true) end)

  local win = app:mainWindow()
  local title = win and win:title() or ""
  local axWin = win and hs.axuielement.windowElement(win) or nil

  local texts = {}
  local visited = 0
  local function walk(el, depth)
    if not el or depth > 30 or visited > 8000 then return end
    visited = visited + 1
    local okv, value = pcall(function() return el:attributeValue("AXValue") end)
    if okv and type(value) == "string" and #value > 0 then
      texts[#texts + 1] = value
    end
    local okd, desc = pcall(function() return el:attributeValue("AXDescription") end)
    if okd and type(desc) == "string" and #desc > 0 then
      texts[#texts + 1] = desc
    end
    local okc, children = pcall(function() return el:attributeValue("AXChildren") end)
    if okc and children then
      for _, c in ipairs(children) do walk(c, depth + 1) end
    end
  end
  if axWin then walk(axWin, 0) end

  return { ok = true, title = title, texts = texts, nodes = visited }
end

speedpartQqPasteServer = speedpartQqPasteServer or hs.httpserver.new(false, false)
speedpartQqPasteServer
  :setInterface("loopback")
  :setPort(5298)
  :setCallback(function(method, path)
    local headers = {
      ["Access-Control-Allow-Origin"] = "*",
      ["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS",
      ["Access-Control-Allow-Headers"] = "Content-Type",
      ["Access-Control-Allow-Private-Network"] = "true",
      ["Cache-Control"] = "no-store",
      ["Content-Type"] = "application/json; charset=utf-8",
    }

    if method == "OPTIONS" then
      return "{}", 204, headers
    end

    if string.match(path or "", "^/health") then
      log("health check")
      return '{"ok":true}', 200, headers
    end

    if string.match(path or "", "^/paste%-now") then
      performPaste(0, "http")
      return '{"ok":true}', 200, headers
    end

    if string.match(path or "", "^/read%-chat") then
      log("read-chat requested")
      local result = readQqChat()
      return hs.json.encode(result), 200, headers
    end

    if string.match(path or "", "^/paste") then
      performPaste(delayFromPath(path), "http")
      return '{"ok":true}', 200, headers
    end

    return '{"ok":false,"error":"not_found"}', 404, headers
  end)
  :start()

log("http server listening on http://127.0.0.1:5298")
log("config loaded")
hs.alert.show("Speed Part QQ paste helper loaded")
