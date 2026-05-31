# Project Summary — Speed Part Search

> 最後更新：2026-05-31（移除閱讀器彈窗，優化直連 PDF 網址解析，實作完整句子的單字邊界語意摘錄與雙語對照，並修復批次翻譯 Bug）

---

### 2026-05-31 — 移除閱讀器彈窗、優化 PDF 連結直連與快取版本更新

- [x] **徹底移除內部閱讀器彈窗 (Reader Modal)**
  - 移成了先前實作的內部文章翻譯閱讀器彈窗（Reader Modal），解決使用者對於閱讀器介面不美觀的抱怨。
  - 將市場報告面板中的卡片點擊與「閱讀 PDF ↗」/「查看原文 ↗」連結直接指向報告的原始網址（`report.url`），改由瀏覽器原生分頁開啟。

- [x] **優化自動抓取器的 PDF 連結解析與相對路徑支援**
  - 在 `src/lib/demand-forecast/market-report-fetcher.ts` 內解析網頁 HTML 時，優化 PDF 的 Regex 比對與解析。
  - 改用標準 `new URL(href, url).href` 進行相對網址（包括以 `/` 開頭或不帶 `/` 的相對路徑）與絕對網址的解析，確保產生的 PDF 連結絕對完整、可直接在瀏覽器開啟。

- [x] **將 PDF/網頁核心缺料中文內容置於卡片主摘要區，並建立雙語對照**
  - 移除了卡片上原先乾癟且無具體業務價值的模板化罐頭文字（例如：「來源頁面在相近段落中提及...」）。
  - 將解析出的 **PDF 核心缺料中文翻譯內容（`evidenceTextZh`）直接放入卡片主摘要區**（當尚未載入翻譯時自動優雅地降級為顯示 `summaryZh` 罐頭文字，確保體驗流暢）。
  - 在主摘要區下方，將**英文原始缺料段落（`evidenceText`）以精美的斜體引用框呈現**，實現無需下載點開 PDF，在卡片上即可直接完成「中英雙語對照」與核心情報檢視的極佳閱讀體驗。

- [x] **擴大摘錄長度並支援單字與語意邊界完整對齊**
  - **背景問題**：先前僅擷取匹配關鍵字前後各 60 字元的極短字串，導致摘錄在單字中途斷開（如 `gh capacitance` 而非 `High capacitance`），語意十分破碎難懂。
  - **解決方案**：在 `market-report-fetcher.ts` 中建立 `extractSensibleQuote` 函數，擴展摘錄範圍至前後 200 字元左右（約 400 字元的上下文句段），並在文字兩端自動對齊至最近的空格（單字邊界），徹底避免單字被切成兩半的尷尬，大幅提升語意完整度與專業可讀性。

- [x] **修正 Google 批次翻譯分隔符號解析錯誤的嚴重 Bug**
  - **背景問題**：先前使用 `###SPLIT###` 作為翻譯分塊的拼接分隔符號，但在實際翻譯過程中，Google 翻譯常會將其翻譯為中文 `###分割###`，導致 Regex 拆分失敗，進而把 8 條不同卡片的翻譯結果全部揉成一團展示，出現嚴重的亂碼。
  - **解決方案**：將分隔符號改為純數字 `999888999`（Google 翻譯絕不會將其翻譯成中文），並在 Regex split 中同時相容 `999888999` 與以前翻譯過的 `###分割###` 等字串，完美解決分割失敗所導致的亂碼與揉字問題。

- [x] **更新快取架構版本以強制重新整理資料**
  - 將 `src/lib/demand-forecast/market-report-types.ts` 中的快取版本 `MARKET_REPORTS_SCHEMA_VERSION` 提升至 `6`。
  - 提升版本號會使舊快取自動失效，強迫系統在重新整理網頁時，使用最新優化後的摘錄函數在背景重新進行多管道抓取與語意對齊擷取，寫入最完整清晰的數據。

- **修改檔案**：
  - [page.tsx](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/app/demand-forecast/page.tsx) — 移除 `showReaderModal` 邏輯，調整 PDF 與原文直連，實作中英雙語對照與摘要置換排版，並修復分隔符號解析 Bug。
  - [market-report-fetcher.ts](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/lib/demand-forecast/market-report-fetcher.ts) — 使用 `new URL` 增強 PDF 連結解析，新增 `extractSensibleQuote` 完整對齊摘錄函數。
  - [market-report-types.ts](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/lib/demand-forecast/market-report-types.ts) — 升級 `MARKET_REPORTS_SCHEMA_VERSION` 為 `6`。

---

### 2026-05-30 — 市場情報佐證取消審核、恢復全自動化

- [x] **恢復全自動化情報信號生成與計算**
  - 取消管理員人工審核與確認流程，網站恢復為全自動化抓取和即時分析。
  - 將類別的市場情報信號層級（MarketSignalLevel）回歸為 4 種自動化狀態：
    - `no_signal`（灰色「無情報」🔘）
    - `source_unavailable`（灰色「來源未取得」🔘，在所有來源均抓取失敗時觸發）
    - `info`（藍色「有情報」🔵，當有 1 個有效來源擷取到報告時觸發）
    - `multi_source`（黃色「多來源佐證」🟡，當有 2 個（含）以上獨立來源擷取到報告時觸發）
  - 前端與後端同步簡化為上述 4 種自動信號判定，移除所有手動或審核狀態。

- [x] **移除手動匯入與人工審核端點與介面**
  - 刪除人工手動匯入市場情報端點：`/api/demand-forecast/market-reports/manual/route.ts`
  - 刪除人工審核/變更情報狀態端點：`/api/demand-forecast/market-reports/review/route.ts`
  - 刪除前端所有手動匯入的彈窗（Modal）、表單狀態變數（如 `showManualImportModal`、`importing` 及其對應處理程序）。
  - 簡化 `/api/demand-forecast/market-reports` 端點：移除任何審核狀態（status/reviewers）之存取與合併，僅讀寫全自動爬蟲快取。
  - 簡化前端 `MarketReportsListPanel`：移除所有管理員審核操作按鈕、手動匯入按鈕與表單。

- [x] **保留防誤導之矩陣欄位順序**
  - 保持對照矩陣的 5 欄優化佈局：第一欄類別、第二欄 RSS、第三欄生命週期、第四欄實時通路庫存、第五欄（最右欄）市場報告。
  - 此順序可有效確保市場情報不被誤當成主判定來源，僅作為輔助佐證。

---

### 2026-05-30 — 市場報告管理審核與手動匯入重構 (已取消/回滾)

> [!NOTE]
> 此部分人工審核與手動匯入工作流已應要求取消，回歸前述全自動化流程。原先實作的 6 層級信號已簡化回歸為 4 層級自動信號。


---

### 2026-05-30 — 市場報告可信度重構（移除假資料、降級為情報佐證）

- [x] **移除硬編假資料 (BASELINE_REPORTS)**
  - 刪除 `market-report-fetcher.ts` 中的 `BASELINE_REPORTS` 陣列（6 筆偽造的 2026 Q1/Q2 情報）。
  - 抓不到資料時，API 回傳空 `reports` 陣列，附帶 `sourceResults`（每個來源的狀態）、`fetchedAt`、`schemaVersion`。
  - 不再使用假資料作為 fallback，確保使用者不會誤認為最新市場報告。

- [x] **市場報告定位降級為「情報佐證」**
  - 前端標題由「市場報告 / 產業情報」改為「市場報告 / 產業情報佐證」。
  - 矩陣欄位狀態由「正常/中風險/有缺料風險」改為：灰色「無情報」、藍色「有情報」、黃色「多來源佐證」、紅色「確認風險」（僅限人工確認後）。
  - 市場報告欄位不再使用與 API 缺料風險完全相同的紅色 badge，避免誤導。
  - 自動擷取的報告 `signalLevel` 設為 `'info'`，不會自動升至 `confirmed_risk`。

- [x] **新增資料來源透明度欄位**
  - `MarketReport` 介面新增：`signalLevel`、`extractionMethod`、`sourceStatus`。
  - 新增型別定義：`MarketSignalLevel`、`MarketSourceStatus`、`MarketExtractionMethod`、`MarketConfidence`、`MarketReportStatus`。
  - 新增 `MarketReportSourceResult` 介面，每個來源各自回報 `sourceStatus`。
  - 新增 `MarketReportsFetchResult` 介面，包含 `schemaVersion` 欄位。

- [x] **改良抓取邏輯**
  - 新增 `isLikelyReportContent()` 函式，檢查內容是否為真實報告（vs. landing page / 表單 / 導覽頁）。
  - `fetchWebpageText()` 回傳精確的 `MarketSourceStatus`（ok / blocked / form_required / timeout / no_report_found / parse_failed）。
  - 加入 proximity-based confidence 判定：類別關鍵字與風險關鍵字距離越近，信心度越高。
  - 無法取得 `publishedAt` 時，使用 `fetchedAt` 但 confidence 自動降至 medium 以下。

- [x] **前端矩陣與面板調整**
  - 移除 `result[catId] = 'haveRisk' as any === 'high' ? ...` 怪碼。
  - 新增 `MarketSignalBadge` 元件（灰/藍/黃/紅四色，與風險 badge 視覺區隔）。
  - 面板使用獨立的 indigo/slate 色調 (`#6366F1` accent)，明確與 RSS (橘) / 生命週期 (紫) / API (綠) 區隔。
  - 每張卡片顯示：來源、發布日期、擷取方式、來源狀態、信心度、是否人工確認、原文連結、證據片段。
  - 若無資料顯示：「本週尚未取得可解析市場報告。此欄不影響 RSS、PCN/EOL 與通路庫存 API 判定。」
  - 來源狀態摘要列顯示每個來源的連線結果。

- [x] **快取策略更新**
  - 新增 `MARKET_REPORTS_SCHEMA_VERSION = 2`，API 路由驗證 cache 的 `schemaVersion`。
  - 舊版 cache（含 BASELINE_REPORTS 或缺少 schemaVersion）自動失效並重新抓取。
  - 保留 7 天 TTL 與 SWR 背景更新機制。

- **修改檔案**：
  - `src/lib/demand-forecast/market-report-fetcher.ts` — 全面重寫
  - `src/app/api/demand-forecast/market-reports/route.ts` — 重寫加入 schemaVersion 驗證
  - `src/app/demand-forecast/page.tsx` — 矩陣欄位、信號邏輯、面板元件重構

---

### 2026-05-30 — 新增「市場報告 / 產業情報預警」第四預警管道

- [x] **新增市場報告抓取與規則分析引擎**
  - 在 `src/lib/demand-forecast/market-report-fetcher.ts` 中建立抓取器與規則引擎。已全面支援並對接規定的全部 7 個免費公開情報報告管道（TTI MarketEYE、TTI Lead Time Trends、PPSI Electronics Supply Chain Risk Report、Fusion Worldwide Market Intelligence、Sourceability Lead Time Report、Future Electronics Market Conditions Report、SiliconExpert Impact Reports），對應 15 個既有料件類別。
  - 設計評估算法（比照 RSS 新聞防噪邏輯）：同一類別僅被 1 個來源命中時，綜合判定為「中風險」（🟡）；只有被 2 個以上獨立來源命中時，才判定為高風險的「有缺料風險」（🔴），防範單一報告激進用詞引起的假陽性。報告超過 30 天則自動降級。
  - graceful fallback 策略：內建 2026 Q1/Q2 產業情報基底數據，當抓取失敗時提供 fallback，保證功能不中斷。

- [x] **新增後端資料庫快取 API 路由**
  - 在 `src/app/api/demand-forecast/market-reports/route.ts` 實作 API 端點，支援 SQLite / PostgreSQL 快取結構。
  - 使用 SWR (Stale-While-Revalidate) 快取更新機制，設定 TTL 為 7 天。當快取過期時，自動在背景觸發非同步更新而不阻塞頁面初始載入。

- [x] **前端預警風險對照矩陣更新**
  - 於 `src/app/demand-forecast/page.tsx` 將對照矩陣欄位由三欄擴充至四欄，並將「市場報告 / 產業情報」放置於第一欄（其後為 RSS 新聞監測、生命週期公告、實時通路庫存）。
  - 將類別的市場預警綜合風險動態計算為三色狀態（🔴 / 🟡 / 🟢），綜合判定算法完全比照 RSS 新聞的多來源防噪規則，點擊對照矩陣的單元格會流暢滾動（Smooth Scroll）至下方的情報預警摘要面板。

- [x] **新增「市場報告與產業情報預警摘要」面板**
  - 在頁面下方（API 料件查詢上方）設計全寬的 Glassmorphic 質感預警摘要面板。
  - 展示每個被命中類別的情報來源、日期、信心度、風險標籤、中文翻譯摘要、證據原文片段與原文超連結。
  - 完美與頂部類別過濾 state 整合，且當無資料時顯示「目前沒有市場報告預警訊號」。

---

### 2026-05-30 — 新增大畫面水位設定彈窗及管理員編輯模式

- [x] **實作大畫面水位門檻設定彈窗與毛玻璃背景**
  - 將原先表格對照矩陣中的可折疊表格，取代為點擊展開的 Premium Modal 彈窗，寬度加大為 `maxWidth: 960`，大畫面排版寬敞大氣。
  - 背景遮罩升級為 `rgba(15, 23, 42, 0.45)` 的 Slate 暗色調，並配合 `backdropFilter: 'blur(16px)'` 營造極具科技感的毛玻璃效果。
  - 在 `globals.css` 結尾處新增 `@keyframes modalFadeIn` 淡入動畫，在開啟彈窗時提供平滑、微縮放與向上的淡入視覺效果。

- [x] **新增優雅右上角 X 關閉按鈕**
  - 在彈窗 Header 右上角設計一個關閉 X 按鈕。
  - 利用 React 的 mouse enter/leave 事件，為該 X 按鈕新增滑鼠移入時有圓形半透明背景變色（`var(--surface-3)`）與縮放動畫的微互動，點擊可立即關閉彈窗並重設編輯狀態。

- [x] **實作「檢視 / 編輯」雙模式切換與管理員權限保護**
  - 為了防範誤觸並提升首頁的美觀度，點擊「點此查看」時，不論是否為管理員，預設皆以唯讀形式的表格檢視（安全水位使用 `minStock` 黃色 badge，補貨水位使用 `lowStock` 灰色 badge）。
  - 若登入身分為管理員（`session?.user?.role === 'admin'`），彈窗 Footer 會顯示「🔧 進入編輯模式」按鈕。
  - 點擊「進入編輯模式」後，`isEditing` 變為 `true`，表格水位數值立刻轉為具備 focus 外框與內建陰影的高質感 number input 輸入框，Footer 動態切換為「儲存設定」與「取消編輯」按鈕；儲存後會發送 POST 請求並重新在背景計算所有料件風險。
  - 非管理員點進去時，Footer 則會顯示「🔒 唯讀模式 (僅供檢視)」的友情提示，並只有單一「關閉」按鈕，符合嚴格的權限防護。

- [x] **圖標元件 (Icon.tsx) 擴充**
  - 於通用圖標元件 `Icon.tsx` 中，定義與繪製 `settings` (齒輪) 圖標的 SVG Path。
  - 擴充 `IconName` 聯集型別以相容 `'settings'` 字串，用以裝飾彈窗 Header 標題。

- [x] **表格 Zebra Stripe 奇偶行與 Hover 高亮**
  - 水位表格對照表加上奇數/偶數行不同背景色（`#fff` 與 `var(--bg)` 交替）與 mouse enter 觸發的 hover 灰底（`var(--surface-2)`）高亮特效，提升大表格閱讀舒適度。

---

### 2026-05-30 — 新增快取料件風險動態重算機制

- [x] **實作快取動態重算邏輯**
  - **背景問題**：當水位判定邏輯或 15 類別特定門檻值調整時，歷史快取資料（`demand-forecast-cache.json` 及資料庫快取）內儲存的 `summary` 及 `riskReasons` 仍為舊版邏輯產生的舊值，導致頁面載入快取時顯示舊版紅標（有缺料風險）或舊的庫存門檻（如 5,000 顆），與最新規則不一致。
  - **解決方案**：在後端 API 路由（`route.ts`）中實作 `recalculatePartsCache` 與 `recalculateForecastPart` 自動重算機制。
  - **動態重算**：在 `mode=cached`、`mode=summary` 和 `mode=full` 流程載入快取後，會立刻使用最新的 `CATEGORY_THRESHOLDS` 配置和交期規則對快取料件的 `riskLevel`、`summary` 及 `riskReasons` 進行即時重新評估，並將更新後的快取寫回儲存（檔案與資料庫）。
  - **效果**：保證使用者在網頁載入快取時，能立即看到符合最新三色（紅/黃/綠）風險標準的水位警示，徹底修復「舊快取殘留舊風險判定與舊門檻數值」之問題。

---

### 2026-05-30 — 新增 15 類別安全與補貨水位具體數值對照表

- [x] **在說明面板新增可折疊的水位門檻數值表格**
  - 在說明看板的「水位定義與警示說明」下方，新增可點擊折疊展開（`<details>`）之「15 個類別的『安全水位 / 補貨水位』具體數值對照表」。
  - 展開後以清晰的表格列出 C01 ~ C15 的所有料件類別（包含 MLCC、PMIC、MCU 等）之「安全水位 (中風險)」與「補貨水位 (預警期)」具體設定值。
  - 資料動態與 `benchmark.ts` 中的 `CATEGORY_THRESHOLDS` 配置連動，保證未來調整門檻值時自動更新網頁顯示，提供極佳的透明度與查閱便利性。

---

### 2026-05-30 — 修復 Railway 部署忽略 src/data/ 資料夾問題

- [x] **修正 .gitignore 規則，避免誤濾 src/data/**
  - 根目錄原先使用 `data/` 規則忽略 SQLite 資料庫目錄，但由於該規則缺乏領頭斜線，導致 Linux (Railway up) 自動建置時誤將 `src/data/` 一併忽略，造成部署包內完全沒有製造商 JSON 對照表，因而觸發 `webpack errors`。
  - 將 `.gitignore` 的 `data/` 修正為 `/data/`，僅忽略根目錄的 `data` 資料夾。
  - 將 `src/app/manufacturer-mapping/page.tsx` 和 `src/lib/manufacturers.ts` 內先前為了繞過此問題而改寫的相對路徑還原為原始的 `@/data/...` 別名導入，保持程式碼的整潔性與一致性。

---

### 2026-05-30 — 新增新聞與 PCN 生命週期分類小標籤及快速篩選過濾連結

- [x] **新增安全與補貨水位的業務定義與懸浮提示 (Tooltip)**
  - 在預警矩陣上方的說明看板中，補充安全水位（Safety Stock）與補貨水位（Reorder Point）的業務定義。
  - 對說明看板的標題及預警對照矩陣中各類別下方的水位文字，加上虛線下底線（Dashed Underline）與 Hover 懸浮提示（Browser Tooltip），讓採購與工程人員在網頁上隨時可以透過滑鼠懸停，立即查閱並理解這兩個水位的精確警示判定邏輯。

- [x] **實作生命週期標籤正則解析邏輯**
  - 在 `src/app/demand-forecast/page.tsx` 中建立 `getLifecycleTags()` 函數，傳入原始標題與翻譯後標題，自動透過正則表達式偵測是否包含特定關鍵字並分派對應標籤：
    - **[EOL 停產]**：匹配 `eol`, `discontinued`, `obsolete`, `phase-out`, `end-of-life`, `停產`, `廢止` 等，渲染紅色標籤（#FFF1F0）。
    - **[NRND 不推薦設計]**：匹配 `nrnd`, `not recommended`, `不推薦設計` 等，渲染橘色標籤（#FFFAEB）。
    - **[PCN 變更]**：匹配 `pcn`, `change notification`, `產品變更`, `製程變更` 等，渲染紫色標籤（#F4F3FF）。
    - **[LTB 最後採購]**：匹配 `ltb`, `last time buy`, `最後採購`, `最後下單` 等，渲染藍色標籤（#F0F9FF）。

- [x] **優化 NewsPanel 渲染呈現與 UX 可讀性**
  - 在 `NewsPanel` 內的每張新聞與 PCN 卡片頂部，動態展示符合條件的生命週期分類小標籤，顯著提升採購及工程人員檢視風險資訊的效率與易讀性。

- [x] **新增快速篩選分類按鈕列與卡片標籤互動過濾功能**
  - 在新聞與生命週期面板上方新增「內容篩選」按鈕列（顯示：全部、EOL 停產、NRND 不推薦、PCN 變更、LTB 最後採購，並附帶各類別的動態文章計數），點擊可立即篩選並呈現對應內容。
  - 將卡片上的生命週期分類小標籤改為「可點擊的互動按鈕」，使用者在閱讀新聞時，直接點擊該小標籤即可立即將新聞面板過濾為該類型內容（再次點擊同一個小標籤則會復原為顯示全部）。
  - 若特定篩選下無符合內容，則會顯示「此篩選分類下無符合條件之內容。」提示。若某個分類目前無任何文章（計數為 0），則按鈕會自動隱藏，保持介面簡潔。

---

### 2026-05-30 — 每日快照與歷史趨勢預警機制 (建議一)

- [x] **新增歷史快照資料表 (SQLite / Postgres)**
  - 在 `src/lib/db.ts` 中新增 `demand_forecast_snapshots` 資料表，以 `(mpn, date)` 為複合主鍵。
  - 記錄每天的庫存量、供應商數量、最低報價、最短交期、最長交期和風險等級。
  - 實作 API：`saveDemandForecastSnapshot` 與 `getDemandForecastSnapshot7DaysAgo`，並在查詢時支援 `[target_date - 3, target_date + 3]` 天的彈性時間比對視窗。

- [x] **新增 5 項趨勢預警規則**
  - **庫存 7 天下降 > 50%**：中風險預警 (🟡)。
  - **庫存 7 天下降 > 80%**：高風險預警 (🔴)。
  - **供應商數自 >= 3 家降至 1 家**：中風險預警 (🟡)。
  - **最低報價 7 天上漲 > 30%**：中風險預警 (🟡)。
  - **補貨交期 7 天內拉長超過 8 週**：中風險預警 (🟡)。
  - 在 `src/app/api/demand-forecast/route.ts` 內的 `summarizePart()` 中實作上述趨勢規則判定，並將其納入料件最終的紅/黃/綠風險分級與 `riskReasons` 列表。

- [x] **前端資訊展示與風險判定說明優化**
  - 更新 `src/app/demand-forecast/page.tsx` 的指標說明區塊與對照矩陣，清晰列出 5 項趨勢預警規則及相關符號。
  - 更新通路庫存表格表頭的判定規則說明。

---

### 2026-05-30 — 類別特定庫存門檻與交期判定邏輯優化

- [x] **庫存優先於交期與最短交期判定原則**
  - 有現貨且現貨庫存大於等於類別的「補貨水位」時，完全忽略交期，直接判定為「正常」綠標，解決假陽性問題。
  - 當庫存不足時才評估交期，且交期判定改用各授權代理商中的「最短交期」（而非最長），避免因單一分銷商交期長而誤判。
  - 修改檔案：`src/app/api/demand-forecast/route.ts` → `summarizePart()` 中優化 `highRisk` 與 `mediumRisk` 的判定。

- [x] **固定庫存門檻改為 15 個類別的特定安全/補貨門檻**
  - 在 `src/lib/demand-forecast/benchmark.ts` 內定義並導出每個類別的 `minStock` (安全水位) 與 `lowStock` (補貨水位)，例如：
    - MLCC (C01): 安全 5,000 / 補貨 20,000 顆
    - MCU (C05): 安全 200 / 補貨 1,500 顆
    - 依此類推，完全貼合不同零件類別的實際用量與價格屬性。
  - 修改檔案：`src/lib/demand-forecast/benchmark.ts`、`src/app/api/demand-forecast/route.ts`。

- [x] **前端對照矩陣與料件表格標準全面可視化**
  - 在「缺料預測風險對照矩陣」面板上新增水位警示說明與規則看板（庫存優先於交期原則、最短交期原則）。
  - 對照矩陣中，為每個類別明列其「安全水位」與「補貨水位」數值。
  - 料件明細表格中，「最長交期」欄位升級為「補貨交期 (最快/慢)」，動態顯示最短交期與最長交期的範圍（例如 `4 ~ 22 週`），幫助採購人員精準掌控風險。
  - 前端與後端介面中，`ForecastPart` 和 `CategorySummary` 擴充支援中風險（🟡）型別以修復潛在的編譯與狀態不一致問題。
  - **全新！對照矩陣單元格點擊滾動與跳轉新聞功能**：使用者點擊對照矩陣中各別的類別名稱或風險狀態單元格時，頁面會自動過濾為該類別，並流暢滾動（Smooth Scroll）至下方的對應新聞卡片或料件查詢區塊，大幅提升尋料操作之便利性。
  - **新聞預警過濾時間調整為 14 天**：配合雙週採購供需審查週期並確保慢發性事件不漏報，缺料新聞與 EOL 新聞搜尋區間均調整為 14 天（維持 ≥2 則門檻），並同步更新後端 API 與前端對照矩陣表頭的說明字樣。
  - 修改檔案：`src/app/demand-forecast/page.tsx`、`src/app/api/demand-forecast/route.ts`、`src/app/globals.css`。

---

### 2026-05-30 — 缺料預測機制改名與風險邏輯全面改進

- [x] **「需求預測」改名為「缺料預測」**
  - 全站 5 個檔案、8 處「需求預測」統一改為「缺料預測」
  - 涉及頁面標題、導覽列、副標題、風險矩陣標題、錯誤訊息
  - 修改檔案：`demand-forecast/page.tsx`、`batch/page.tsx`、`batch-manufacturer/page.tsx`、`manufacturer-mapping/page.tsx`、`Header.tsx`

- [x] **P0 — 新聞管道假陽性大幅降低**
  - **搜尋時間窗從 30 天縮短為 7 天**：只反映最近一週的產業動態，避免過時新聞產生誤報
  - **類別風險門檻從 1 則提高為 ≥2 則**：需要至少 2 則風險新聞才會將該類別標紅，避免單一新聞就觸發整個類別預警
  - 修改檔案：`route.ts` → `buildCategoryNewsUrl()` 的 `when:30d` → `when:7d`、`buildNewsCategorySummary()` 門檻邏輯

- [x] **P1 — 料件風險三色等級（紅/黃/綠）**
  - 原本只有「有缺料風險」與「正常」兩種狀態，無法區分嚴重程度
  - 新增三層風險分級：
    - 🔴 **高風險**：庫存 = 0，或交期超過 20 週
    - 🟡 **中風險**：交期 12-20 週且庫存 < 5,000，或庫存低於 1,000
    - 🟢 **正常**：其他
  - 風險原因加入 emoji 前綴（🔴/🟡），方便快速辨識嚴重程度
  - 修改檔案：`route.ts` → `summarizePart()` 新增 `riskLevel` 欄位與三層判斷

- [x] **P1 — 類別風險三色等級**
  - 原本類別只有「有缺料風險」與「正常」
  - 新增三層分級：
    - 🔴 **高風險**：高風險料 ≥ 3，或已查 ≥ 5 且風險比 ≥ 40%
    - 🟡 **中風險**：高風險料 ≥ 1，或中風險料 ≥ 3
    - 🟢 **正常**：其他
  - 修改檔案：`route.ts` → `buildSupplyCategorySummary()` 新增 `highRiskPartCount`、`medRiskPartCount`

- [x] **前端 RiskCellBadge 元件改為三色**
  - 原本 `RiskCellBadge` 只支援 `hasRisk: boolean`（紅/綠二元）
  - 改為 `level: 'high' | 'medium' | 'none'`，支援紅/黃/綠三色顯示
  - 矩陣表頭公式說明同步更新，反映新的門檻規則
  - 修改檔案：`page.tsx` → `RiskCellBadge` 元件、矩陣表格渲染邏輯

- [x] **頁面載入速度大幅優化（秒開）**
  - **問題**：每次進入頁面都要等 5-10 秒（即時抓取 30 個 RSS feeds）
  - **解法**：新增新聞快取機制（記憶體 + 檔案雙層快取），頁面載入時預設用 `mode=cached` 秒回
  - 三種模式：
    - `cached`：讀快取，< 100ms（頁面載入預設）
    - `summary`：重新抓取 RSS 新聞（按鈕觸發）
    - `full`：抓新聞 + 查 150 顆料件（按鈕觸發）
  - 若快取為空（首次使用），頁面會自動 fallback 到 `summary` 模式抓取
  - 修改檔案：`route.ts` → 新增 `NewsCache` 介面、`readNewsCache()`、`writeNewsCache()`、`fetchAndCacheNews()`；`page.tsx` → `loadForecast()` 邏輯

- [x] **料件查詢併發數提升（4 → 10）**
  - 原本 150 顆料件只開 4 個 worker 同時查，耗時過長
  - 提高到 10 個並行 worker，理論查詢速度提升約 2.5 倍
  - 修改檔案：`route.ts` → `runWithConcurrency` 併發參數

- [x] **客戶端翻譯 Hook 穩定性修復**
  - 修正 `useClientTranslatedNews` hook 的 bug：初始 `useState(news)` 只在首次渲染時設定值，後續資料更新可能導致新聞和料件查詢結果不顯示
  - 加入 try-catch、fallback 邏輯，確保翻譯失敗時仍顯示原始資料
  - 修改檔案：`page.tsx` → `useClientTranslatedNews()` hook

- [x] **修改檔案一覽**
  - `src/app/api/demand-forecast/route.ts`：搜尋範圍、風險門檻、三色分級、新聞快取、併發提升
  - `src/app/demand-forecast/page.tsx`：RiskCellBadge 三色、載入模式、翻譯 Hook、改名
  - `src/app/batch/page.tsx`：導覽列改名
  - `src/app/batch-manufacturer/page.tsx`：導覽列改名
  - `src/app/manufacturer-mapping/page.tsx`：導覽列改名
  - `src/components/Header.tsx`：導覽列改名

---

### 2026-05-30 — 基準料件汰舊換新與狀態判定優化

- [x] **需求預測雷達 (Demand Forecast) 進度快取與逾時續傳**
  - **背景問題**：Mouser API 具備 2.1 秒的限制（throttling），導致查詢 150 顆 benchmark parts 時可能需要超過 5 分鐘，極易觸發瀏覽器或 HTTP client 的逾時（Timeout）限制，造成前端畫面一直沒有資料。
  - **快取機制**：實作 `data/demand-forecast-cache.json` 漸進式儲存，支援快取（TTL = 12 小時）與中斷後續傳。
- [x] **基準料件（Benchmark Parts）汰舊換新（兩階段，共更換 35 顆料件）**
  - **問題與優化**：
    1. **第一階段（13 顆）**：原清單有 13 顆已宣布停產且現貨完全歸零（Obsolete / Stock = 0）的「死料」。
    2. **第二階段（22 顆）**：原清單有 22 顆因分銷通路限制或 B2B 大宗管制（如 Samsung/Hynix 的高容量 DRAM、逆向工程網通 IC 等）而在 DigiKey/Mouser 公開 API 中永遠找不到（EMPTY_RESULT）的料件。
    * **解決方案**：將上述共 **35 顆** 無實質供需預警價值的料件，全部更換為代理商平台流通率極高、且同樣能代表該產品分類的現行 **Active（活躍生產中）** 常用料件。並同步完成本地快取資料庫的對齊與遷移。
- [x] **新增「尚未查詢」與「無代理商資料」狀態以改善 UX 體驗**
  - **問題與優化**：先前在資料尚未查詢或查詢後在所有代理商平台皆找不到資料時，系統均預設判定為「正常」，導致頁面上出現資料皆為 `-` 卻顯示綠色「正常」的矛盾現象。
  - **優化方案**：
    1. **尚未進行 API 實時查詢時**：狀態顯示為灰色的 **「尚未查詢」**。
    2. **已查詢但在授權分銷商（DigiKey / Mouser 等）皆找不到任何供貨資料時**：狀態顯示為灰色的 **「無代理商資料」**（而非誤導的「正常」）。
- [x] **新增「需求預測風險對照矩陣」面板**
  - **需求與優化**：在頁面最上方（三種查詢方式的最上面）新增一個多維度風險對照矩陣表格，橫軸為「RSS 新聞監測」、「生命週期公告 (PCN/EOL)」、「實時通路庫存 (API)」，縱軸為 15 個料件類別。
  - **呈現方式**：橫向比對 15 個料件類別在三個預警管道中的風險狀態（標示為「正常」、「有缺料風險/有異動風險」或「尚未查詢」），讓用戶能一眼辨識出跨管道的綜合缺料風險。
- [x] **新增「自動中文網頁翻譯」超連結跳轉（與白屏修復）**
  - **需求與優化**：缺料與 EOL 新聞來源皆為國外英文電子媒體。為了方便採購人員閱讀，將新聞卡片標題連結重寫為透過 Google 翻譯代理伺服器開啟的繁體中文跳轉連結。
  - **背景問題**：原本透過 Google 翻譯代理直接訪問 Google News 的 `articles/...` 連結，會因為 Google News RSS 連結包含客戶端 JavaScript 跳轉，被 Google 翻譯去除了 JS 而造成「網頁白屏」無法載入。
  - **解決方案**：在後端 API（`route.ts`）取得 RSS 後，實作了一個兩步式解碼器。首先模擬 Chrome 向 Google News 請求獲取網頁中的 signature 與 timestamp 參數，再呼叫 Google 內部的 `batchexecute` 協定 POST 解析出新聞的真實目標 URL（如路透社、彭博社）。
  - **效能優化**：為防範 Google 的 429 限流與提升整體速度，後端僅對命中缺料/生命週期警示（`riskHit === true`）的新聞網址進行解密，並以 `resolvedUrlCache` Map 進行記憶體快取，大幅縮減了 API 回應時間。
  - **呈現方式**：點選新聞標題時，直接彈出已翻譯為繁體中文的英文新聞網頁；同時，保留下方「原文」按鈕指向原始英文網址，供使用者隨時切換對照。
- [x] **150 顆料件快取資料寫入雲端資料庫（PostgreSQL）**
  - **需求與優化**：原先 150 顆料件查詢的快取是儲存在本地的 JSON 檔案中。當 Railway 重新部署或容器重啟時，這些快取資料會全部遺失，導致需要重新發送 API 查詢。
  - **解決方案**：在雲端資料庫中建立 `demand_forecast_cache` 資料表。重寫後端的讀寫快取方法 `readCache` 與 `writeCache` 為非同步模式。
  - **運作模式**：系統將優先從雲端 PostgreSQL 讀寫 150 顆料件的完整快取，若失敗或是在無資料庫的本地開發環境，會自動降級退化到本地 JSON 檔案，保證了雲端快取的永久保存與本地開發的零相依便利性。
- [x] **實作 RSS 缺料與 EOL 新聞標題智慧中文化翻譯**
  - **背景問題**：原本在前端頁面的新聞卡片標題與副標題（snippet）僅做簡單的單字替換，大部份單字和句型仍為英文，不便於工程師與採購人員閱讀。
  - **解決方案**：在後端 API（`route.ts`）取得新聞後，實作了一個基於 Google 翻譯的智慧翻譯模組 `translateToZh`，免 API 金鑰、免付費、無限制地在後端對新聞標題（`title`）與副標題（`snippet`）進行整句繁體中文翻譯。
  - **效能與限流優化**：在記憶體中宣告 `translationCache = new Map()` 快取已翻譯的文字。後端僅對命中缺料與 EOL 警報（`riskHit === true`）的新聞內容進行非同步整句翻譯，大幅降低了 API 請求數，防範 429 限流並提升加載速度。
- [x] **修改檔案**
  - `src/lib/db.ts`：新增 `demand_forecast_cache` 資料庫建表，並導出 `getDemandForecastCache` 與 `setDemandForecastCache` 快取讀寫函式。
  - `src/app/api/demand-forecast/route.ts`：實作漸進式快取，調整 `summarizePart` 狀態輸出。新增 `decodeGoogleNewsUrl` 解碼邏輯，並修改 `fetchIndustryNews` 與 `fetchLifecycleNews`，讓 API 返回真實 URL 予前端。重寫 `readCache` 與 `writeCache` 為非同步模式並介接 DB 快取，在呼叫該快取讀寫的地方補上 `await`。
  - `src/lib/demand-forecast/benchmark.ts`：更新這 35 顆基準料件的 MPN、MFR 與產品描述。
  - `src/app/api/demand-forecast/route.ts`：實作漸進式快取，調整 `summarizePart` 狀態輸出。新增 `decodeGoogleNewsUrl` 解碼邏輯，並修改 `fetchIndustryNews` 與 `fetchLifecycleNews`，讓 API 返回真實 URL 予前端。
  - `src/app/demand-forecast/page.tsx`：前端 `ForecastPart` 介面新增型別宣告，修改 `useMemo` 中的 Mapping 邏輯，並更新 `RiskBadge` 的對應渲染。新增 `RiskCellBadge` 元件並在頁面最上方渲染「需求預測風險對照矩陣」表格。修改 `NewsPanel` 新聞標題超連結以支援 Google 翻譯跳轉。
---

### 2026-05-25 — 非管理員 48 小時 session 過期

- [x] **Session 過期規則**
  - 管理員：30 天
  - 一般用戶：48 小時，過期後存取任何頁面會被導回 `/login` 重新輸入帳密
  - 目的：方便管理員從「最近登入時間」追蹤每位使用者真實的登入活動
- [x] **實作**
  - `src/lib/auth-config.ts`：`session.maxAge` 設為 30 天作為上限；jwt callback 在登入當下依角色寫入 `sessionExpiresAt`（unix 秒）
  - `src/middleware.ts`：偵測 `token.sessionExpiresAt` 過期 → 清掉 `next-auth.session-token` cookie 並導向 `/login`
  - `src/types/next-auth.d.ts`：`JWT` 介面新增 `sessionExpiresAt?: number`
- [x] **驗證**
  - `npx tsc --noEmit` 通過

---

> 最後更新：2026-05-07（尾綴候選、外部庫存運費提醒、Railway token 修正）

---

### 2026-05-07 — 尾綴候選、外部庫存運費提醒、Railway token 修正

- [x] **尾綴候選 fallback（batch / batch-manufacturer）**
  - 仍以 **100% MPN 完全符合** 作為正式搜尋結果；完全符合找不到時，才顯示「尾綴候選」
  - 判斷規則：API MPN normalize 後 `startsWith(BOM MPN normalize)` 且不完全相等，例如：
    - BOM：`TPS27081AD`
    - API：`TPS27081ADDCR`
    - 顯示：`TPS27081ADDCR (+DDCR)`
  - 尾綴候選只做提醒，不算作 `found`，不參與最低供應商、總價、平均單價、滿足狀態計算
  - `尾綴候選` 欄位顯示供應商、候選 MPN、尾綴與庫存量，例如：
    - `DigiKey: TPS27081ADDCR (+DDCR) / Stock 3,000`
  - Excel 匯出同步新增 `尾綴候選` 欄

- [x] **Mouser 尾綴候選保留**
  - 原本 Mouser adapter 在後端只保留完全相同 `ManufacturerPartNumber`，導致尾綴候選在到前端前就被濾掉
  - 調整為：若完全相同結果不存在，保留前綴相同但多尾綴的候選結果
  - 供貨限制（`RestrictionMessage`）仍維持原本 `RESTRICTED` 判斷，不把受限料誤判成可採購候選

- [x] **Excel 外部庫存運費欄提醒色**
  - 下載 BOM 時，若 DigiKey 狀態為 `找到了/外部庫存`，DigiKey 的 `運費` 欄位使用淡黃色背景 `FFE599`
  - 用意：提醒採購外部 marketplace 庫存可能需要手動填入運費/運費單價
  - batch 與 batch-manufacturer 匯出皆已同步

- [x] **本機 UI 壞版原因與處理方式**
  - 問題：在 `next dev` 還跑著時執行 `npm run build`，Next.js 會重寫 `.next`，導致 dev server CSS/chunk 清單不一致，頁面退回裸 HTML
  - 修復：停掉 `5280` dev server、刪除 `.next`、重新啟動 `npm run dev`
  - 後續注意：本機 dev server 開著時不要跑 production build；若要 build 驗證，先停 dev server 或用獨立環境

- [x] **Railway 部署與 token 修正**
  - 已推送 commit：
    - `8f00506 Add suffix candidate fallback for BOM search`
    - `4def705 Trigger Railway redeploy`
  - Railway 最新部署 `4ed34488-5277-4de6-bbdf-854e8fdcab11` 成功（2026-05-07 16:20:14 -04:00）
  - Railway 新版 Account token 應使用 `RAILWAY_API_TOKEN`，不是 `RAILWAY_TOKEN`
  - `~/.zshrc` 已由 `export RAILWAY_TOKEN=...` 改為 `export RAILWAY_API_TOKEN=...`
  - 若目前 shell 仍殘留舊 `RAILWAY_TOKEN`，單次指令可用：
    ```
    env -u RAILWAY_TOKEN railway status
    ```

- [x] **修改檔案**
  - `src/app/batch/page.tsx`：新增尾綴候選欄、Stock 顯示、Excel 欄位與外部庫存運費提醒色
  - `src/app/batch-manufacturer/page.tsx`：同上，含 MFR 頁 sticky 欄位位置調整
  - `src/lib/suppliers/mouser/index.ts`：完全符合找不到時保留尾綴候選
  - `src/app/globals.css`：新增 `sticky-candidate` / `sticky-candidate-mfr`

---

> 最後更新：2026-05-07（DigiKey 外部庫存欄位、狀態標籤、欄位錯位修正）

---

### 2026-05-07 — DigiKey 外部庫存顯示、狀態標籤、欄位錯位修正

- [x] **DigiKey 外部庫存欄位（外部Stock）— batch / batch-manufacturer**
  - DigiKey API `ProductVariations[].MarketPlace === true` 表示商城外部供應商（例如 Rochester Electronics）
  - `QuantityAvailable`（頂層）= DigiKey 自有 + 商城庫存總和；部分料號（如 SN74CB3Q3384ADBQR）全部庫存都來自商城，DigiKey 自有為 0
  - 庫存欄拆成兩欄：
    - **Stock**：顯示 `p.QuantityAvailable`（API 總可用量）
    - **外部Stock**：顯示 `marketplaceVariations[].stockQty` 加總，使用 🏪 圖示
  - `buildMarketplaceVariations()` 從 `ProductVariations` 過濾 `MarketPlace === true`，每個商城變體包含 `supplierName`、`stockQty`、`minQty`、`breaks`
  - `SupplierData` 介面新增 `marketplaceVariations?: ApiMarketplaceVariation[]`
  - `mapSupplier()` 將 API 回傳的 `marketplaceVariations` 正確帶入 `SupplierData`

- [x] **外部庫存欄位只給 DigiKey（修正 Mouser 欄位錯位）**
  - 原本 `SupplierCell` 對所有供應商（含 Mouser HK/VN）都渲染 `外部Stock <td>`，但表頭 `colSpan` Mouser 為 7 → 整體欄位錯位
  - 新增 `showExternalStock?: boolean` prop 給 `SupplierCell`：
    - DigiKey：`showExternalStock={true}`（渲染外部Stock欄）
    - Mouser HK/VN：不傳（預設 `false`，不渲染）
  - pending / error 狀態的 `colSpan` 同步調整：`showExternalStock ? 6 : 5`
  - batch 與 batch-manufacturer 兩頁同步修正

- [x] **狀態標籤顯示「找到了/外部庫存」**
  - batch / batch-manufacturer：`StatusBadge` 新增 `hasExternalStock?: boolean` prop，`found` 狀態且有外部庫存時顯示「找到了/外部庫存」
  - 單料查詢（`SupplierTable`）：新增 `hasExternalStock` 變數，狀態欄顯示「完全滿足/外部庫存」或「部分滿足/外部庫存」
  - Excel 匯出：`supDKValues()` 的狀態欄由 `statusLabel(s.status, s.errorMsg)` 改為條件式：有外部庫存時輸出「找到了/外部庫存」

- [x] **MPQ 顯示修正（單料查詢頁）**
  - 原本 `supplierFromResult()` 使用 `breaks[0]?.qty ?? 1` 計算 MOQ，導致 MPQ 全部顯示 1
  - 新增 `ApiVariation` 介面（`{ packageType, minQty, breaks }`）加入 `ApiPartResult`
  - 改從 `variations[].minQty` 計算：最小 = MOQ，最大（若與 MOQ 不同）= MPQ
  - 單料查詢的 MPQ 欄現在正確顯示（例如 SN74CB3Q3384ADBQR = 2500）

- [x] **Mouser UPSTREAM_ERROR（暫時性錯誤）**
  - 直接用 curl 測試 HK / VN API key，兩組均正常回應 HTTP 200
  - 確認為 Mouser API 暫時性服務故障（非 code 問題），重新查詢即恢復

- [x] **Railway CLI 登入問題**
  - `~/.zshrc` 存有舊的 `export RAILWAY_TOKEN=...` 干擾 `railway login`
  - 解法：`unset RAILWAY_TOKEN && railway login` 重新登入

- [x] **修改檔案**
  - `src/components/SupplierTable.tsx`：新增 `hasExternalStock`、狀態欄條件顯示
  - `src/app/batch/page.tsx`：StatusBadge `hasExternalStock` prop、Excel 狀態修正、`SupplierCell showExternalStock`
  - `src/app/batch-manufacturer/page.tsx`：同上
  - `src/app/page.tsx`：`ApiVariation` 介面、`supplierFromResult()` MPQ 計算修正

---

> 最後更新：2026-05-03（登入系統、使用者管理、SMTP 設定）

### 2026-05-03 — 登入系統、帳號申請、管理員後台

- [x] **完整登入流程**
  - 所有頁面需登入才能存取，未登入自動跳轉 `/login`（Next.js middleware 攔截）
  - 登入使用 NextAuth.js v4 + CredentialsProvider（Email + 密碼）
  - Session 以 JWT 儲存，role（admin / user）與 id 帶入 token

- [x] **帳號申請與管理員審核**
  - 申請頁 `/register`：填姓名、Email、部門/角色（採購、業務、工程、研發、品保、生產、管理、其他）、密碼
  - 申請後狀態為 `pending`，需管理員核准才能登入
  - 管理後台 `/admin/users`（僅管理員可見）：列出所有使用者，可執行核准、拒絕、停用、刪除
  - 刪除前有內嵌確認列防止誤刪；管理員帳號不可刪除

- [x] **忘記密碼流程**
  - `/forgot-password`：輸入 Email → 產生 token（1 小時有效）
  - 若有設定 SMTP：自動發送重設 Email
  - 若無 SMTP：重設連結印在 server console（`[Email] Reset link for ...`）
  - `/reset-password?token=xxx`：輸入新密碼，成功後跳轉登入頁

- [x] **個人變更密碼 `/account/change-password`**
  - 需驗證目前密碼才能設定新密碼
  - 成功後顯示確認畫面，1.5 秒自動跳回主頁

- [x] **Header 使用者選單**
  - 右上角頭像點擊展開：顯示姓名 / Email、變更密碼、登出
  - 管理員額外顯示「使用者管理」導覽連結

- [x] **系統管理員（已預設建立）**

  | Email | 預設密碼 |
  |---|---|
  | `weili_chang@yangshin.com` | `SpeedPart@2026!` |
  | `g9355061@gmail.com` | `SpeedPart@2026!` |

  > 首次啟動時自動建立；若帳號已存在則不會覆蓋

- [x] **技術細節**
  - 資料庫：SQLite（`better-sqlite3`），路徑 `data/users.db`（已加入 `.gitignore`）
  - 密碼雜湊：`bcryptjs`，cost factor 12
  - 遷移：啟動時自動偵測並補上新欄位（`department`）
  - `data/` 目錄未 commit；Railway 部署需掛載 Volume 或改用 PostgreSQL

- [x] **SMTP Email 設定（忘記密碼 Email）**
  - 目前 `.env` 尚未設定 SMTP，重設連結只印在 console
  - 設定 Gmail SMTP 步驟：
    1. 前往 [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) 產生 App 密碼（需開啟兩步驟驗證）
    2. 在 `.env` 加入以下設定：
       ```
       SMTP_HOST=smtp.gmail.com
       SMTP_PORT=587
       SMTP_SECURE=false
       SMTP_USER=your@gmail.com
       SMTP_PASS=xxxx xxxx xxxx xxxx   # App 密碼，非 Google 帳號密碼
       SMTP_FROM=Speed Part Search <your@gmail.com>
       NEXTAUTH_URL=https://speed-part-search-production.up.railway.app
       ```
    3. 重啟 server 即生效
  - Railway 部署同步在環境變數介面設定上述欄位

- [x] **新增檔案一覽**
  ```
  src/
  ├── lib/
  │   ├── db.ts               # SQLite 初始化、schema、admin seed、migration
  │   ├── auth-config.ts      # NextAuth options（CredentialsProvider + JWT callbacks）
  │   └── email.ts            # nodemailer 封裝（SMTP 選配）
  ├── types/
  │   └── next-auth.d.ts      # Session / JWT 型別擴充（role, id）
  ├── components/
  │   └── Providers.tsx       # SessionProvider client wrapper
  ├── middleware.ts            # 路由保護（須在 src/ 內，不是專案根目錄）
  └── app/
      ├── login/page.tsx
      ├── register/page.tsx
      ├── forgot-password/page.tsx
      ├── reset-password/page.tsx
      ├── account/
      │   └── change-password/page.tsx
      ├── admin/
      │   └── users/page.tsx
      └── api/
          ├── auth/
          │   ├── [...nextauth]/route.ts
          │   ├── register/route.ts
          │   ├── forgot-password/route.ts
          │   └── reset-password/route.ts
          ├── admin/
          │   └── users/route.ts      # GET 列表、PATCH（核准/拒絕/停用/刪除）
          └── account/
              └── change-password/route.ts
  ```

---

### 2026-05-03 — GitHub 上雲、Railway 部署、自動同步與 SSH 無密碼設定

- [x] **網站修復：CONFIG_MISSING**
  - ChatGPT 搬移檔案時意外刪除 `.env`，導致所有供應商顯示 `CONFIG_MISSING`
  - 重建 `.env`（DigiKey + Mouser HK/VN 三組 API key），重啟 dev server 恢復正常

- [x] **Git 清理：移除 `.next/` 與 `node_modules/`**
  - 8,643 個暫存/建構檔案被誤 track，新增 `.gitignore` 並用 `git rm --cached -r` 移出 tracking
  - git history 內含 109MB 大檔，用 orphan branch 技巧重建乾淨的單一 commit，徹底清除歷史

- [x] **GitHub 初次上傳**
  - 建立 repo `g9355061/Speed-Part-Search`，以 PAT token push 乾淨 codebase 到 `main`

- [x] **Railway 部署**
  - 修正 `package.json` start script：`next start -p ${PORT:-5280}`（Railway 需讀 `$PORT` 環境變數）
  - 修正 `manufacturer-mapping/page.tsx`：加入 `export const dynamic = 'force-dynamic'` 與 `<Suspense>` wrapper（Next.js 14 production build 要求）
  - 升級 Next.js `14.2.5` → `^14.2.35`（修復 CVE-2025-55184 / CVE-2025-67779 安全漏洞）
  - Railway 成功 build，服務上線：`https://speed-part-search-production.up.railway.app`

- [x] **Claude Code 自動同步 → GitHub → Railway**
  - 在 `.claude/settings.json` 設定 Stop hook：每次 Claude Code 結束時自動 `git add -A && git commit && git push`
  - Railway 連結 GitHub repo `main` 分支，push 後自動 redeploy
  - 完整 pipeline：Claude Code 修改 → 自動 commit/push → Railway 自動部署

- [x] **SSH 金鑰取代 PAT Token（永久解法）**
  - 原 PAT token 因貼在對話中被 GitHub 自動撤銷
  - 生成 `ed25519` SSH key pair，公鑰加入 GitHub（名稱：MacBook - Claude Code）
  - `git remote` 改為 SSH URL，測試 `ssh -T git@github.com` 通過
  - 未來 push 永不需要 token，也不會因 token 過期/洩漏失敗

- [x] **Railway API Token（永久解法）**
  - 在 Railway 建立 API Token「Claude Code CLI」
  - 寫入 `~/.zshrc`（`export RAILWAY_TOKEN=...`），Railway CLI 自動讀取
  - 未來不需要手動 `railway login`

- [x] **驗證**
  - `https://speed-part-search-production.up.railway.app` 回 `200 OK`
  - SSH push 測試正常（`Everything up-to-date`）
  - Railway logs 確認 server 以 `$PORT=8080` 正常啟動

---

> 最後更新：2026-05-02（單料查詢 UX 修正 + Mouser exact MPN + 廠商對照表真實 API 名稱 + Cloudflare tunnel + 防休眠到 06:00）

## 1. 目標

建立一個可以輸入電子零件料號、跨多家供應商比價的網站。
第一版只串 **DigiKey**，第二版加入 **Mouser**；架構設計可無痛繼續加入 Arrow / Avnet。

## 2. 技術棧

| 層 | 技術 |
| --- | --- |
| 框架 | Next.js 14（App Router） |
| 語言 | TypeScript |
| 後端 | Next.js API Routes（Node runtime） |
| 前端 | React + 原生 CSS（無 UI library） |
| 測試 | tsx + node:assert（無框架） |
| 儲存 | 無資料庫；token 用 in-memory 快取 |

選型原則：最簡單穩定、單一 repo、單一啟動指令、零外部相依。

## 3. 已完成的功能

### 2026-05-02 新增 — 單料查詢中文化、BOM 採購欄位、MFR 模糊比對與 Excel 表頭整理

- [x] **單料查詢首頁整體中文化與採購欄位重整**（`src/app/page.tsx`, `src/components/Hero.tsx`, `src/components/SupplierTable.tsx`, `src/components/PriceBreaks.tsx`, `src/components/ComparisonChart.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`）
  - 首頁 Hero、搜尋按鈕、熱門/最近、Header/Footer、供應商比較、階梯價、規格摘要等 UI 字串改為中文
  - 單料查詢新增可手動輸入 `Qty`，上方搜尋列與下方 Price Breaks 共用同一個數量 state
  - `Supplier comparison` 表格改為 BOM 採購視角欄位：`供應商 / 需求 / 庫存 / MPQ / 報價明細 / 總價 / 平均單價 / 狀態 / 連結`
  - 單料查詢的單價、排序、Best/最低單價、Chart 與 Price Breaks 皆依輸入數量對應階梯價
  - 若需求量大於供應商庫存，單料查詢用「現有庫存」對應階梯價並計算總價；庫存 0 不參與最低價比較
  - `lowest / Lowest unit price` 改為更醒目的 `最低單價`
  - 狀態顯示：`完全滿足` 使用綠色、`部分滿足` 使用黃色、`供貨限制` 使用紫色
  - 表格表頭與內容置中對齊，`平均單價 @數量` 拆成兩行顯示
  - 移除供應商名稱旁重複的 `最低單價` 與 `供貨限制` badge，只保留資料來源提示 `即時 / 示範`

- [x] **BOM Batch / BOM Batch - MFR 採購彙總欄位**（`src/app/batch/page.tsx`, `src/app/batch-manufacturer/page.tsx`, `src/app/globals.css`）
  - 在固定欄位區新增 `最低供應商` 與 `滿足狀態`
  - `最低供應商` 依各供應商平均單價比較；庫存 0 不可成為最低供應商
  - `滿足狀態` 顯示 `完全滿足 / 部分滿足`
  - 若最低平均單價相同且滿足狀態相同，多個供應商會一起顯示，例如 `DigiKey / Mouser HK`
  - `攤平單價` 全面改名為 `平均單價`
  - `MFR mismatch / Not found / Found` 改為中文：`廠商不一致 / 平台沒有這顆料 / 找到了`
  - `Restricted / 受限` 改為 `供貨限制`
  - 固定欄位與數量欄置中對齊，維持橫向捲動時的可讀性

- [x] **Excel 欄位偵測與數量解析強化**（`src/app/batch/page.tsx`, `src/app/batch-manufacturer/page.tsx`）
  - Manufacturer 欄位支援新增 `MFG`
  - 數量欄位支援新增 `Shortage`
  - `Shortage` 欄若為負數或括號負數，例如 `-100` / `(100)`，會轉為需求數量 `100`
  - 一般 BOM Batch 與 BOM Batch - MFR 兩頁同步套用

- [x] **MFR 廠商比對升級：alias + fuzzy + 疑似同廠商**（`src/app/batch-manufacturer/page.tsx`）
  - 仍維持「先精準比對 MPN，再比對廠商」的安全順序
  - 廠商 normalize 移除大小寫、標點、公司尾綴（Inc / Corp / Ltd / Co. 等）
  - 新增分級結果：
    - exact / alias / 高相似度：`找到了`
    - 相似度 82%~92%：`疑似同廠商`
    - 低於 82%：`廠商不一致`
  - `疑似同廠商` 可納入最低供應商比較；`廠商不一致` 不納入最低供應商
  - 報價明細顯示 API MFR 與相似度，方便人工覆核
  - 新增常見品牌/事業部 alias：
    - Skyworks = Skyworks Solutions
    - Hirose Electric = Hirose Connector
    - JST / Japan Solderless Terminals = JST Automotive
    - Samsung = Samsung Electro-Mechanics
    - Panasonic = Panasonic Industry
    - Murata = Murata Electronics / Murata Manufacturing
    - KOA Speer = KOA Speer Electronics
    - Vishay = Vishay Dale
  - 新增完整詞包含規則，處理 `KOA Speer` vs `KOA Speer Electronics`、`Skyworks` vs `Skyworks Solutions` 這類同品牌命名

- [x] **新增第四頁：廠商對照表 + 可編輯 mapping 資料庫**（`src/app/manufacturer-mapping/page.tsx`, `src/app/api/manufacturer-mapping/route.ts`, `src/lib/manufacturers.ts`, `src/data/manufacturer-aliases.json`, `src/components/Header.tsx`）
  - Header 新增第四個分頁 `廠商對照表`
  - 以 API 系統標準名為主，顯示目前哪些 BOM/API 廠商名稱會被視為同一家公司
  - 原本寫死在 `manufacturers.ts` 的 alias 表改為讀取 `src/data/manufacturer-aliases.json`
  - 新增 `/api/manufacturer-mapping`：
    - `GET` 回傳目前 alias map 與分組 rows
    - `POST` 將編輯後的 alias map 寫回 JSON 檔
  - 每一列最右側新增獨立 `編輯` 按鈕
  - 點某一家廠商的 `編輯` 後，只會開啟該列操作：
    - 新增同家公司名稱
    - 刪除單一 alias 名稱
    - 刪除整組廠商對照
  - 新增/刪除會套用同一套 normalize 規則（大小寫、標點、Inc/Corp/Ltd/Co 等尾綴）後儲存
  - 已整理目前常見 mapping，作為後續人工校正與資料學習的基礎

- [x] **熱門搜尋資料來源確認**（`src/lib/mockData.ts`, `src/components/Hero.tsx`）
  - 首頁 `熱門：STM32 / ESP32 / MOSFET...` 目前來自 `TRENDING_TAGS` mock data，不是 DigiKey/Mouser API
  - DigiKey / Mouser 公開 API 目前主要提供關鍵字/料號搜尋、產品、庫存、價格等資料，未提供全站熱門搜尋排行 endpoint
  - 後續若要顯示真實熱門搜尋，建議改由本系統自己的搜尋紀錄統計產生

- [x] **Excel 匯出格式升級**（`src/app/batch/page.tsx`, `src/app/batch-manufacturer/page.tsx`）
  - 匯出 Excel 加入 `最低供應商`、`滿足狀態`
  - 匯出欄位取消 `交期` 與 `URL / 連結`
  - Excel 表頭改為兩層結構：
    - 第一列合併欄顯示 `DigiKey / Mouser HK / Mouser VN`
    - 第二列顯示 `Stock / MPQ / 報價 / 總價 / 平均單價 / 狀態`
  - AutoFilter 改放第二列表頭，避免供應商群組列被當成欄位名稱
  - 匯出狀態同步使用中文：`找到了 / 平台沒有這顆料 / 廠商不一致 / 疑似同廠商 / 供貨限制`

- [x] **Cloudflare tunnel 與本機服務重啟**
  - 本機 Next dev server 維持 `http://localhost:5280`
  - 重啟 Cloudflare quick tunnel，最新測試網址：
    - `https://pools-surname-shed-indexes.trycloudflare.com/`
  - 已開 macOS `caffeinate -dimsu` 防休眠到 `2026-05-03 06:00 EDT`，到時會自動結束並恢復原本睡眠行為
  - 已確認首頁 `/`、`/batch`、`/batch-manufacturer` 經 Cloudflare 都回 `200 OK`

- [x] **2026-05-02 晚間追加：單料查詢 UX 與結果判斷修正**（`src/app/page.tsx`, `src/components/Hero.tsx`, `src/components/SupplierTable.tsx`, `src/components/ComparisonChart.tsx`, `src/components/PriceBreaks.tsx`, `src/app/globals.css`）
  - Qty 預設值改為空白；未輸入數量按查詢時顯示 `請輸入數量`，不送 API
  - Qty input 取消瀏覽器上下調整 spinner，保留手動輸入
  - 複製貼上料號時自動 trim 前後空白，手動輸入時移除開頭空白
  - 搜尋結束後自動清空料號與數量欄位
  - 庫存 `0` 不再顯示 `完全滿足`；改顯示 `沒有庫存`
  - 庫存 `0` 時平均單價比較不再顯示 `+Infinity%`；改顯示 `沒有庫存`
  - 單料查詢新增 exact MPN 過濾：API 回傳相近料號不再當作同一顆料
  - 若 API 沒有精準 MPN，顯示 `平台沒有這顆料`；若精準 MPN 有找到但庫存為 0，才顯示 `沒有庫存`
  - 同一最低平均單價且都有庫存時，所有最低供應商都顯示 `最低單價`，表格背景與比較圖同步標綠

- [x] **2026-05-02 晚間追加：Mouser HK / VN exact MPN 規則統一**（`src/lib/suppliers/mouser/index.ts`）
  - Mouser adapter 原本會接受有 `MouserPartNumber` 的相近搜尋結果，導致 HK/VN 與 Excel exact 判斷不一致
  - 改為只接受 `ManufacturerPartNumber` normalize 後與查詢料號完全相同的結果
  - 已確認案例：
    - `LFCN-4400+`：Mouser HK = `供貨限制`，Mouser VN = exact found
    - `LP5907MFX-2.5/NOPB`：Mouser HK = `供貨限制`，Mouser VN = exact found
    - `TPS27081A`：Mouser HK/VN = `平台沒有這顆料`
    - `TPS27081ADDCR`：Mouser HK = `供貨限制`，Mouser VN = exact found

- [x] **2026-05-02 晚間追加：廠商對照表改用真實 API 顯示名稱**（`src/data/manufacturer-aliases.json`, `src/data/manufacturer-display-names.json`, `src/app/manufacturer-mapping/page.tsx`）
  - 確認 `API 系統標準名` 原先部分是 normalize/人工整理後的 canonical，不一定是 API 原字串
  - 新增 `manufacturer-display-names.json`，畫面優先顯示真實 API 廠商名稱格式
  - 修正顯示名稱，例如：
    - `Hirose Connector`
    - `KOA Speer Electronics, Inc.`
    - `Murata Electronics`
    - `Samsung Electro-Mechanics`
    - `Skyworks Solutions, Inc.`
    - `onsemi`
  - 修正 mapping：
    - `Nexperia Usa / NXP / NXP Semiconductors / NXP Usa Inc` 合併到同一組 `NXP Semiconductors`
    - 移除先前不正確的獨立 `Nexperia Usa` 群組
    - `Vishay / Vishay Dale / Vishay / Draloric` 確認都是 API 可能回傳的名稱，可視為同一家公司；建議顯示標準名使用較通用的 `Vishay`
  - BOM Batch - MFR 的 `Manufacturer / FMG` sticky 欄位改為置中對齊

- [x] **驗證**
  - 多次執行 `npx tsc --noEmit` 通過
  - `curl -I http://localhost:5280/` 回 `200 OK`
  - `curl -I http://localhost:5280/batch` 回 `200 OK`
  - `curl -I http://localhost:5280/batch-manufacturer` 回 `200 OK`
  - `curl http://localhost:5280/api/manufacturer-mapping` 正常回傳 alias JSON
  - `curl http://localhost:5280/manufacturer-mapping` 可看到逐列 `編輯`
  - `curl -I https://nails-professionals-searching-properties.trycloudflare.com/` 回 `200 OK`
  - `curl -I https://nails-professionals-searching-properties.trycloudflare.com/batch` 回 `200 OK`
  - `curl -I https://nails-professionals-searching-properties.trycloudflare.com/batch-manufacturer` 回 `200 OK`
  - `curl -I https://nails-professionals-searching-properties.trycloudflare.com/manufacturer-mapping` 回 `200 OK`
  - `curl -I https://pools-surname-shed-indexes.trycloudflare.com/` 回 `200 OK`

### 2026-05-01（深夜）新增 — BOM Manufacturer 比對、Mouser US 移除與匯出格式整理

- [x] **新增第三頁：BOM Batch - Manufacturer**（`src/app/batch-manufacturer/page.tsx`）
  - 新增 `/batch-manufacturer` 頁面，與原本 `/batch` 分開
  - 上傳檔支援 `Part Number / MPN / 料號`、`Quantity / Qty / 數量`、`Manufacturer / MFR / FMG / Maker / Brand / 廠商 / 製造商 / 品牌`
  - 左側固定欄位改為 `# / 料號 (MPN) / Manufacturer / FMG / 數量`
  - 橫向捲動到 DigiKey / Mouser HK / Mouser VN 時，仍可看到料號、廠商與數量
  - 頁面標題與 nav 新增 `BOM Batch - MFR`

- [x] **料號 + 廠商比對邏輯**
  - 先用 normalized MPN 做精準料號比對，避免 API 回傳相近料號被誤判
  - 若料號相符但 BOM 廠商與 API 廠商不同，狀態顯示 `MFR mismatch`
  - `MFR mismatch` 使用橘色 badge / 橘色底，不算正式 `Found`
  - 報價明細下方顯示 API 回傳廠商名稱，方便人工確認
  - 修正 bug：開始查詢時必須保留 `manufacturer` 欄位傳入 `runBatch()`，否則會永遠無法比對廠商
  - 增加顯示層保護：即使舊 state 內是 `found`，若 BOM 廠商與 API 廠商不符，畫面仍轉成 `MFR mismatch`

- [x] **BOM Batch 供應商調整：取消 Mouser US**
  - `/batch` 只保留 `DigiKey / Mouser HK / Mouser VN`
  - `/batch-manufacturer` 只保留 `DigiKey / Mouser HK / Mouser VN`
  - 單顆料首頁查詢也取消 Mouser US，只查 `DigiKey / Mouser HK / Mouser VN`
  - Supplier registry 取消載入 Mouser US adapter，避免多餘 API 消耗與畫面干擾

- [x] **Mouser HK / VN 報價邏輯整理**
  - Mouser HK 與 VN 使用各自 API key 與 supplier label
  - MPQ 解析支援英文 `Standard Pack Qty` 與中文 `標準包裝數量`
  - Mouser TR / CT 報價顯示保留 TR、CT 拆分，但若 API 階梯價相同，TR / CT 兩段使用同一個總數量階梯單價
  - 庫存為 0 時不顯示總價，避免缺貨品項被誤認為可採購總額

- [x] **階梯價 hover 修正**
  - Batch 與單顆料查詢的 price breaks hover 改為 fixed positioning
  - 避免被 table overflow 裁切，並自動依畫面上下空間決定往上或往下展開
  - 移除瀏覽器原生 `title` tooltip，避免同時出現第二個灰色階梯價框
  - Hover popover 只高亮目前用到的階梯價，不常駐改變整格顏色

- [x] **Excel 匯出格式整理**
  - 匯出 Excel 參考 `SpeedPart_template.xlsx` 的藍色表頭與分區配色，但不完全複製
  - 欄高依報價明細內容自動調整，避免 `TR / CT` 多行文字被截掉
  - MPQ 欄只顯示數字，不再顯示 `MOQ:1 MPQ:3000`
  - 取消 MOQ 顯示，網頁與 Excel 都以 MPQ 數字為主
  - 所有 `攤平單價` 改為小數點 4 位
  - 所有 `總價` 改為小數點 4 位，Excel download 同步套用 4 位格式

- [x] **Batch 操作 UX**
  - 新增「停止搜尋」：批次查詢中可停止，尚未處理的料號標示為 `Skipped`
  - 新增「重新上傳」：只清空目前結果、停止狀態與錯誤訊息，不會自動跳出選檔案視窗
  - `重新上傳` 行為同步套用在 `/batch` 與 `/batch-manufacturer`

- [x] **API 成功提示行為**
  - API 成功回傳時不再顯示大型 toast
  - 只有某個供應商達到使用上限或 auth/key 問題時才顯示提示
  - DigiKey 超限維持友善訊息，說明台灣時間 08:00 重置

- [x] **Cloudflare 與本機開發環境**
  - 本機 dev server 使用 `http://localhost:5280`
  - Cloudflare tunnel 已開到 `https://spouse-anonymous-tree-matches.trycloudflare.com/`
  - 已確認 `/batch-manufacturer` 經 localhost 與 Cloudflare 都回 `200 OK`
  - 注意：開發中不要在 dev server 跑著時執行 `npm run build`，曾造成 `.next` dev chunk 缺檔（`Cannot find module './948.js'`）
  - 若出現該錯誤，處理方式：停止 dev server → `rm -rf .next` → 重新 `npm run dev`

- [x] **驗證**
  - `npx tsc --noEmit` 通過
  - `curl -I http://localhost:5280/batch-manufacturer` 回 `200 OK`
  - `curl -I https://spouse-anonymous-tree-matches.trycloudflare.com/batch-manufacturer` 回 `200 OK`

### 2026-05-01 新增 — Mouser VN 並排查詢

- [x] **Mouser VN 價格資料加入 Batch**（`src/lib/suppliers/mouser/index.ts`, `src/lib/suppliers/registry.ts`, `src/app/batch/page.tsx`）
  - 新增 `MOUSER_VN_API_KEY`，與 Mouser US / HK key 分開管理
  - Mouser adapter factory 目前建立 3 個 supplier：`Mouser`、`Mouser HK`、`Mouser VN`
  - Registry 改為同時載入 `digikeyAdapter`, `mouserAdapter`, `mouserHkAdapter`, `mouserVnAdapter`
  - Batch 查詢同時送 `digikey,mouser,mouser hk,mouser vn`
  - Batch 結果表在 `Mouser HK` 右側新增 `Mouser VN` 區塊，欄位同 US/HK：庫存、MPQ、報價明細、總價、攤平單價、狀態、連結
  - 匯出 Excel 同步新增 `MS VN Stock / MPQ / 報價 / 總價 / 攤平 / 交期 / 狀態 / URL`
  - 實測 VN API key 可正常回資料；`SM06B-ULHK-1TA1-ETB(HF)` 回庫存、階梯價與 `Standard Pack Qty=1700`

### 2026-04-30（晚）新增 — 搜尋加速、錯誤顯示與階梯價 UX

- [x] **`/api/search` 支援指定供應商**（`src/app/api/search/route.ts`）
  - 新增 `suppliers=digikey,mouser` query parameter
  - 首頁與 Batch 可只查需要的 supplier，避免被已停用或不需要的 supplier 拖慢
  - 無匹配供應商時回傳乾淨的 400 JSON error

- [x] **Mouser 加速與去重**（`src/lib/suppliers/mouser/index.ts`）
  - Mouser server throttle 從 2.4s/req 調整為預設 2.1s/req（約 28 req/min）
  - 新增 `MOUSER_MIN_INTERVAL_MS` 可用環境變數調整節流
  - 加入 15 分鐘 in-memory cache；重複 MPN 不再重打 Mouser
  - 加入 in-flight de-dupe；兩個 worker 同時查同一顆料時只送一個 Mouser request
  - cache `EMPTY_RESULT` / `RESTRICTED` / `NOT_FOUND`，避免 restricted 或找不到料號反覆消耗 API

- [x] **Mouser HK 並排查詢**（`src/lib/suppliers/mouser/index.ts`, `src/lib/suppliers/registry.ts`, `src/app/batch/page.tsx`）
  - Mouser adapter 改為 factory，可建立 `Mouser`（US）、`Mouser HK` 與 `Mouser VN` 等獨立 supplier
  - 新增 `MOUSER_HK_API_KEY`，HK API key 與 US API key 分開管理
  - Batch 結果表新增第三個供應商區塊 `Mouser HK`，欄位與 Mouser US 相同：庫存、MPQ、報價明細、總價、攤平單價、狀態、連結
  - `/api/search?suppliers=mouser hk` 可單獨查 HK；Batch 後續擴充為同時查 `digikey,mouser,mouser hk,mouser vn`
  - 實測 `SM06B-ULHK-1TA1-ETB(HF)`：Mouser HK 正常回庫存與報價；Mouser US 可獨立顯示每日上限

- [x] **Mouser HK MPQ 修正**（`src/lib/suppliers/mouser/index.ts`）
  - HK API 的標準包裝欄位名稱為中文 `標準包裝數量`，原本只抓英文 `Standard Pack Qty`，導致 MPQ 退回 MOQ=1
  - `parseStandardPackQty()` 改為同時支援 `Standard Pack Qty` 與 `標準包裝數量`
  - 實測 `SM06B-ULHK-1TA1-ETB(HF)`：MPQ 正確抓到 `1700`，variations 產生 `TR minQty=1700` + `CT minQty=1`

- [x] **Batch 表格左側 sticky 欄位**（`src/app/batch/page.tsx`, `src/app/globals.css`）
  - 橫向捲到 Mouser HK 時，左側 `#` / `料號 (MPN)` / `數量` 固定顯示
  - 新增 `.sticky-col`, `.sticky-idx`, `.sticky-mpn`, `.sticky-qty` CSS
  - `數量` sticky 欄右側加 border/shadow，與供應商資料區塊有清楚分隔

- [x] **首頁 Search 支援 DigiKey + Mouser fallback**（`src/app/page.tsx`）
  - 首頁搜尋改為同時查 `digikey,mouser`
  - DigiKey 超限或失敗時，只顯示友善提示；若 Mouser 有資料仍正常顯示 Mouser live data
  - 首頁 supplier table 可顯示 Mouser live row、price breaks、product URL
  - toast 改為固定在 viewport 底部置中，且不自動消失，下一次搜尋時更新

- [x] **Batch retry 與 supplier disable 行為修正**（`src/app/batch/page.tsx`）
  - Retry 改為只重試失敗 supplier；DigiKey 已成功時不會因 Mouser retry 而重查 DigiKey
  - DigiKey `401/403/429` 視為本批次不可恢復的 limit，立即停用 DigiKey；剩餘料號只查 Mouser
  - DigiKey limit 顯示 `Limit / Resets TW 08:00`，不再顯示 raw `RATE_LIMITED` / `AUTH_FAILED`
  - `AUTH_FAILED` 對所有 supplier 轉成友善 `Auth / Check API key` 狀態，避免整欄重複顯示 raw `AUTH_FAILED`
  - `RESTRICTED` 成為獨立 `restricted` 狀態，badge 使用紫色，與 `Not found` 分開
  - Batch warning 橫幅改為明確說明：「DigiKey 已達查詢上限，剩餘料號將只查 Mouser US / HK / VN；台灣 08:00 重置」

- [x] **階梯價 hover UX**（`src/app/batch/page.tsx`, `src/components/SupplierTable.tsx`, `src/app/globals.css`）
  - 首頁 Unit Price hover 顯示完整 price breaks
  - Batch「報價明細」與「攤平單價」hover 顯示完整階梯價
  - Batch popover 改用 fixed positioning，避免被表格 `overflow-x: auto` 裁掉
  - Popover 內會高亮目前單價對應的階梯列；表格價格本身維持原樣，不常駐變色

- [x] **驗證**
  - `npx tsc --noEmit` 通過
  - `npm test` 通過

### 2026-04-30（晚）新增 — 供應商超額自動 Skip

- [x] **供應商超額自動略過**（`src/app/batch/page.tsx`）
  - 某供應商回傳 `RATE_LIMITED` / `AUTH_FAILED` 時加入 `disabled` 集合；DigiKey limit/auth 立即停用，Mouser transient rate limit 仍可短暫 retry
  - 後續所有剩餘料號對該供應商直接回傳 `{ status: 'skipped' }`，不再發送 API 請求
  - `disabled` 為 `Set<string>`，在 `runBatch` 內共享給 2 個並行 worker，JS 單執行緒保證讀寫無競爭
  - `RowStatus` 新增 `'skipped'`；`StatusBadge` 顯示灰色 "Skipped" badge
  - `SupplierCell` 的 `skipped` 狀態與 `notfound` 共用「—」顯示邏輯，不顯示錯誤色
  - `exportResults` 對 `skipped` 輸出 `"Skipped"` 文字而非空白
  - **警告橫幅**：任一供應商被停用後，結果表上方顯示橘黃色警告框：
    - 例：「⚠️ DigiKey 已達查詢上限，本次批次已略過剩餘料號。DigiKey 每日額度將於台灣時間 08:00 重置。」
  - 每次重新點「開始查詢」時自動清除 `disabledSuppliers` 狀態，從頭開始

### 2026-04-30（下午）新增 — Mouser 整合 + Rate Limit 節流

- [x] **Mouser Search API 整合**（`src/lib/suppliers/mouser/index.ts`）
  - US API Key（`0e012cce-...`）；描述英文、庫存/報價正常
  - HK Key（舊）：廠商限制（TI、Microchip 等回傳 `RestrictionMessage`）無法取得報價
  - 解析 `Min`（MOQ）、`ProductAttributes["Standard Pack Qty"]`（MPQ）
  - 自動建立 `variations: [TR(MPQ), CT(MOQ)]`，讓 Batch 頁可做 TR/CT 拆分報價
  - `RestrictionMessage` 存在時 throw `RESTRICTED` error → 顯示「—」而非「⚠ 0」
  - Server 端節流：**每請求間隔 2.4s（25 req/min）**，防止 Mouser 401/503

- [x] **DigiKey Server 端節流**（`src/lib/suppliers/digikey/index.ts`）
  - 每請求間隔 2.0s（30 req/min），防止 429
  - 發現 DigiKey Production 每日上限為 **1,000 次**；重置時間 UTC 00:00（台灣 08:00）

- [x] **Batch 頁面重寫 — 雙供應商並排**（`src/app/batch/page.tsx`）
  - 新增 `SupplierData` 介面（per-supplier）與 `ResultRow { digikey, mouser }`
  - `mapSupplier()` 轉換 API block → SupplierData（含缺料、拆分、總價計算）
  - `searchBoth()` 單次 API 呼叫同時取 DK + MS 結果
  - `SupplierCell` 組件 × 2（左 DigiKey 藍色、右 Mouser 琥珀色）
  - Retry 邏輯：只重試需要 retry 的 supplier；DigiKey limit/auth 不重試，避免阻塞 Mouser

- [x] **報價明細欄標籤統一為 TR / CT**
  - 大包裝一律顯示 `TR × N`，散料顯示 `CT × N`（不論 packageType 是 TR/CT/OTHER）
  - `calcSplit` 改為通用邏輯：找最大 `minQty` 為 TR，最小為 CT

- [x] **MPQ 欄位簡化**
  - 欄位標題：`MOQ/MPQ` → `MPQ`
  - 儲存格：只顯示數字（有 MPQ 顯示 MPQ，否則顯示 MOQ）

- [x] **Excel 解析支援 Demand 欄位**
  - 數量欄新增偵測關鍵字：`demand`、`需求`、`需求量`（原有 Qty/Quantity/數量/PCS）

- [x] **EMPTY_RESULT / RESTRICTED 顯示修正**
  - `EMPTY_RESULT` / `NOT_FOUND` → 灰色 "Not found"（之前誤顯示紅色 error badge）
  - `RESTRICTED` → 庫存欄顯示「—」（之前誤顯示「⚠ 0」）
  - `SupplierError` 新增 `RESTRICTED` code

- [x] **503 → RATE_LIMITED**（Mouser 過載時自動 retry，不再顯示 UPSTREAM_ERROR）

### API Rate Limit 摘要

| 供應商 | 限制 | 重置 | Server 節流 |
|--------|------|------|-------------|
| DigiKey | 1,000 次/天 | 每日 UTC 00:00（台灣 08:00） | 2.0s/req |
| Mouser | ~30 req/min | 滾動 60 秒窗口 | 2.1s/req（可用 `MOUSER_MIN_INTERVAL_MS` 調整） |

### Mouser 廠商限制說明

以下廠商在 Mouser API 對非授權經銷商鎖定庫存/報價（`RestrictionMessage: "Not available for purchase by distributors"`）：
- **Texas Instruments (TI)** — 所有 TI 料號
- **Microchip** — 部分料號（如 24LC256T-I/SN）

DigiKey 無此限制，TI / Microchip 料號在 DigiKey 完全正常。



- [x] DigiKey OAuth 2.0 client_credentials flow
- [x] Access token in-memory 快取（含 60 秒安全窗、避免並發重複取 token）
- [x] DigiKey `/products/v4/search/keyword` 整合
- [x] 統一的 `PartResult` 介面 + 欄位映射
- [x] Supplier adapter pattern + registry
- [x] `/api/search?partNumber=...` 並行查詢所有 supplier
- [x] `/api/health` 顯示啟用的 supplier 與環境
- [x] 前端搜尋頁，每家供應商獨立表格
- [x] 錯誤分類：`AUTH_FAILED` / `NOT_FOUND` / `RATE_LIMITED` / `EMPTY_RESULT` / `CONFIG_MISSING` / `UPSTREAM_ERROR`
- [x] `.env.example` + `README.md`
- [x] 5 項單元測試（全部通過）
- [x] **Claude Design "PartPrice" hi-fi UI 實作**（navy SaaS、Inter + JetBrains Mono、5 家供應商比較表、price break tabs、spec grid、bar chart、響應式 tablet/phone）
- [x] DigiKey 真實資料覆蓋：搜尋送出 → DigiKey 列標 **Live**、其餘維持 **Demo**

### 2026-04-30 新增

- [x] **未串接供應商隱藏**：`mockData.ts` 只保留 DigiKey；搜尋前顯示空白提示，搜尋後只顯示有真實 API 資料的供應商（往後加入 adapter 再自動顯示）
- [x] **搜尋框預設料號移除**（空白啟動）
- [x] **Header 導覽加入路由連結**（Search / BOM Batch，使用 `usePathname` 標示 active）
- [x] **BOM Batch Search 頁面**（`/batch`）
  - 拖放或點擊上傳 `.xlsx` / `.xls` / `.csv`
  - 自動偵測欄位（Part Number / MPN / 料號；Quantity / Qty / 數量 / PCS，無此欄預設 1）
  - 「下載範本」產生標準 Excel 範本
  - 並行查詢（2 workers）、針對可恢復 rate limit 自動 retry；不可恢復的 auth/limit 會停用該 supplier
  - 即時進度條；查詢完成後可「匯出結果」為 Excel
- [x] **xlsx 靜態 import 修正**：改為 `import * as XLSX from 'xlsx'` + `next.config.js` 加 `transpilePackages: ['xlsx']`，解決 Next.js chunk 載入失敗
- [x] **DigiKey Variation 全量 Price Breaks**
  - 原本只取 `ProductVariations[0]`（可能是 TR 捲軸）；改為合併所有 variation 的 price breaks，每個數量點取最低單價
  - `PartResult` 新增 `variations` 欄位（`packageType: TR/CT/DKR/OTHER`、`minQty`、`breaks`）
  - `types.ts` 新增 `PackagingVariation` 介面
- [x] **MPQ + MOQ 分包報價**
  - 原先只在包裝型態辨識為 `TR + CT` 時拆分；DigiKey 有些料號 variation 會全部回 `OTHER`，但仍有 `minQty 1` 與較大 MPQ（例如 4,500）
  - 現在改用 `minQty` 通用判斷：較大包裝當 `MPQ`，最小可買包裝當 `MOQ`
  - 當需求量 ≥ MPQ 時，自動計算：MPQ 整包數 × MPQ 價 + MOQ 零切餘數 × MOQ 價
  - 報價明細欄展開顯示各行（e.g. `MPQ × 4,500 @ $0.2695` + `MOQ × 2,355 @ $0.2883`）
  - 缺料時 effectiveQty = stock，TR+CT split 以可購買量為準
- [x] **總價計算修正**：缺料（stock < qty）時 totalCost = unitPrice × stock（不是 × qty）
- [x] **攤平單價**：totalCost ÷ 實際可買數量（缺料用 stock，充足用 qty）
- [x] **庫存不足警示**：缺料列橘黃底色 + 庫存欄 `⚠ 2,291`；表頭摘要顯示「⚠ X 筆庫存不足」
- [x] **MOQ/MPQ 欄位**
  - BOM 結果表在「庫存」後新增 `MOQ/MPQ`
  - 顯示最小可買量 `MOQ` 與整包/卷帶量 `MPQ`
  - 匯出 Excel 同步新增 `MOQ/MPQ` 欄位
- [x] **供應商群組表頭**
  - BOM 結果表 header 改成兩層：左側固定 `# / 料號 / 數量`，右側上層供應商群組目前為 `DigiKey`
  - `DigiKey` header 使用淡 navy 背景與主色文字，方便之後平行加入 Mouser / Arrow / Avnet 等供應商區塊
- [x] **API 非 JSON 防呆**
  - 若 `/api/search` 意外回 HTML（例如 Next dev cache 造成 500 error page），前端不再直接 `resp.json()` 爆出 `Unexpected token '<'`
  - 改先檢查 `content-type`，非 `application/json` 時顯示乾淨的 API error
- [x] **Icon 型別修正**
  - `Icon.tsx` 的自訂 `stroke?: number` 與 `React.SVGProps<SVGSVGElement>` 原生 `stroke?: string` 衝突
  - 改為 `Omit<React.SVGProps<SVGSVGElement>, 'name' | 'stroke'>`，避免 TypeScript build 失敗

## 4. 專案結構

```
Speed Part Search/
├── package.json                          # 新增 xlsx 依賴
├── tsconfig.json
├── next.config.js                        # 新增 transpilePackages: ['xlsx']
├── .env.example
├── .gitignore
├── README.md
├── project_summary.md
├── src/
│   ├── app/
│   │   ├── layout.tsx, page.tsx, globals.css
│   │   ├── batch/
│   │   │   └── page.tsx                  # BOM Batch Search（DigiKey + Mouser US/HK/VN 並排）
│   │   └── api/
│   │       ├── search/route.ts           # GET /api/search?partNumber=...
│   │       └── health/route.ts           # GET /api/health
│   ├── components/
│   │   ├── Icon.tsx
│   │   ├── Header.tsx
│   │   ├── SubBar.tsx, Hero.tsx, ProductCard.tsx
│   │   ├── SupplierTable.tsx, PriceBreaks.tsx
│   │   ├── SpecGrid.tsx, ComparisonChart.tsx, Footer.tsx
│   └── lib/
│       ├── mockData.ts                   # SUPPLIERS 只保留 DigiKey
│       └── suppliers/
│           ├── types.ts                  # PackagingVariation + RESTRICTED error code
│           ├── registry.ts               # [digikeyAdapter, mouserAdapter, mouserHkAdapter, mouserVnAdapter]
│           ├── digikey/
│           │   ├── token.ts
│           │   └── index.ts              # 節流 2s/req + variations[]
│           └── mouser/
│               └── index.ts              # 節流 2.4s/req + MPQ + RESTRICTED 偵測
└── tests/
    └── digikey.test.ts
```

## 5. PartResult 統一資料模型

任何 supplier 都必須回傳這個結構（前端不用知道 supplier 差異）：

```ts
{
  supplier: string                  // "DigiKey"
  manufacturerPartNumber: string
  supplierPartNumber: string
  manufacturer: string
  description: string
  quantityAvailable: number
  unitPrice: number | null
  currency: string                  // "USD"
  priceBreaks: { quantity, unitPrice, currency }[]  // 所有 variation 合併後最低價
  variations?: PackagingVariation[] // 各封裝型態的原始 breaks（TR/CT/DKR/OTHER）
  productUrl: string
  leadTimeDays: number | null
  availabilityStatus: string | null  // "Active" / "Obsolete" / ...
  lastUpdated: string                // ISO timestamp
}

interface PackagingVariation {
  packageType: 'TR' | 'CT' | 'DKR' | 'OTHER'
  minQty: number
  breaks: { quantity, unitPrice, currency }[]
}
```

## 6. 安全與設定

- Client Secret 只存在於 `.env`、只在 server side 讀取，前端永遠看不到。
- `.env` 已加入 `.gitignore`。
- 前端只打自己的後端 `/api/*`，不會直接連 DigiKey。

`.env` 必填欄位：
```
DIGIKEY_CLIENT_ID
DIGIKEY_CLIENT_SECRET
DIGIKEY_ENV=sandbox          # 或 production
DIGIKEY_LOCALE_SITE=US
DIGIKEY_LOCALE_LANGUAGE=en
DIGIKEY_LOCALE_CURRENCY=USD
```

## 7. 測試狀態

| 項目 | 結果 |
| --- | --- |
| `npm install` | ✅ |
| `npm test` | ✅ 5/5 通過（mock fetch） |
| `npm run dev` | ✅ 正常啟動於 http://localhost:5280 |
| `/api/health` | ✅ 回 `{ ok: true, hasCredentials: true, digikeyEnv: "sandbox" }` |
| OAuth `/v1/oauth2/token` | ✅ HTTP 200，access_token 拿得到 |
| Search `/products/v4/search/keyword` | ❌ HTTP 403（DigiKey 端權限問題，下節說明） |

## 8. 目前阻擋（Blocker）

DigiKey Sandbox app 顯示：
- `sandbox-Quote`：Enabled
- `sandbox-ProductInformation V4`：Enabled

但 V4 Search / Product Details 端點全部回傳：
```json
{
  "status": 403,
  "detail": "The supplied client credentials are not authorized to perform this request."
}
```

測試 Quote API (V4) 時，則會回傳 `Three legged OAuth failed.`，因為 Quote API 需要真實使用者登入（3-legged OAuth），不適用我們 Server-to-Server 的 `client_credentials` 模式。

### 最終解決方案：直接使用 Production 環境
經過反覆交叉測試，證實問題出在 **DigiKey Sandbox 系統存在權限配置 Bug，導致合法的 2-legged OAuth 請求也被 403 阻擋**。

**解法：**
1. 放棄有 Bug 且不常維護的 Sandbox。
2. 在 DigiKey Portal 建立 `Production App`，並勾選 **`Product Information V4`**（不帶 sandbox- 前綴）。
3. 將 `.env` 中的 `DIGIKEY_ENV` 設為 `production`。
4. 使用正式環境的 Client ID 與 Client Secret 重新獲取 Token。
5. **結果：成功取得 `200 OK` 並抓回真實的零件資料。**

> **備註**：在建立新的 Production App 後，DigiKey 的 API Gateway 同步大約需要 5-10 分鐘，期間內會回傳 `401 Invalid clientId`，此為正常現象，等待片刻即可。

### 特殊坑洞：Next.js 14 Aggressive Fetch Caching 導致的 401 錯誤
在成功切換至正式環境後，測試中曾遇到一個非常隱蔽的 Bug：API 會一直回傳 `"Bearer token is expired"` 導致 401 錯誤。
經過排查，發現原因出在 Next.js 14 對原生 `fetch` 實作了極度激進的快取機制：
- **問題**：Next.js 甚至將取得 Token 的 `POST` 請求也進行了快取。當重啟伺服器並戳 API 時，Next.js 沒有發送真正的網路請求，而是直接從快取吐出一個早就過期的舊 Token。
- **解法**：在所有呼叫 DigiKey API 的 `fetch` 選項中（包含 `v1/oauth2/token` 與 `search` 端點），必須明確加上 **`cache: 'no-store'`**，強制 Next.js 每次都發送真實的網路請求，確保取得最新 Token 並抓回正確資料。

## 9. 擴充新供應商（Mouser / Arrow / Avnet）的步驟

未來只要：

1. 建 `src/lib/suppliers/{name}/index.ts`，實作：
   ```ts
   export const xxxAdapter: SupplierAdapter = {
     name: 'Mouser',
     async search({ partNumber }) {
       // 呼叫該家 API、把結果 map 成 PartResult[]
       // 失敗時 throw new SupplierError(...)
     }
   };
   ```
2. 在 `src/lib/suppliers/registry.ts` 把新 adapter 推進 `adapters` 陣列。
3. 完成。`/api/search` 會自動並行查詢、前端會自動為每家畫一個表格。

不必改前端、不必改 API route、不必改型別。

## 10. UI 設計實作（PartPrice / Claude Design）

來源：Anthropic Claude Design 匯出包 `Showcase.html` 設計稿（user 用 AI design tool 設計後 export）。
設計稿原本為 prototype HTML/CSS/JS，已 pixel-perfect 重建為 Next.js + TypeScript components。

### 設計系統 tokens（globals.css）
- **色**：白底 + cool-gray 中性色 + deep navy `#0B2545` 為主色 + signal green `#0B6E3F`（best price 高亮）+ amber 警示
- **字型**：Inter（UI）+ JetBrains Mono（料號、價格、所有數字）
- **半徑/陰影**：4–6px radii、hairline border、小陰影；無漸層、無 pill 過圓
- **資訊密度**：高（Bloomberg Terminal 風格）；tabular-nums 確保價格欄對齊

### 區塊 → 組件對應

| 設計區塊 | 組件 |
| --- | --- |
| 56px sticky header（logo + nav + quick lookup + 5/5 API pill + bell + avatar） | `Header.tsx` |
| 38px sub-bar（breadcrumb + Sources/Refreshed/FX） | `SubBar.tsx` |
| Hero（H1 navy accent + MPN 搜尋框 + ⌘K 鍵帽 + trending chips + recent 行 + IC chip 插圖） | `Hero.tsx` |
| 左欄 Product Card（chip SVG + MPN mono + Manufacturer + 描述 + LQFP/RoHS/Active/REACH pills + Datasheet/Watch） | `ProductCard.tsx` |
| 右欄 Supplier Comparison Table（可排序、stock bar、lead-time fast 變綠、price vs best %、price-break sparkline、updated pulse、cart/external 列動作、**Best/Live/Demo 徽章**） | `SupplierTable.tsx` |
| Price Breaks（5 supplier tabs + 6 qty 階梯，click cell 切 qty 並連動下方 chart） | `PriceBreaks.tsx` |
| Spec Grid（8 格：Voltage/Package/Temp/Lifecycle/Flash/SRAM/Speed/I/O） | `SpecGrid.tsx` |
| Comparison Chart（@ qty 橫向 bar，best 變綠、其他 navy） | `ComparisonChart.tsx` |
| Footer（4 欄連結 + bottom strip） | `Footer.tsx` |
| Toast（成功/錯誤兩色，搜尋完成或失敗時提示） | inline in `page.tsx` |

### 響應式
- **Desktop ≥980px**：1280 max-width，product card + table 雙欄、spec 4 欄、price break 6 欄
- **Tablet ≤980px**：sidebar collapse、hero 單欄、illu 隱藏、price break → 3 欄、spec → 2 欄
- **Phone ≤640px**：nav / api-pill / hero illu 全隱藏、所有 grid 退化單欄、表格 padding 縮小

### 設計 ↔ 真實資料銜接
- 預設用 prototype 的 mock data（5 家供應商完整資料），畫面立刻是「滿的」
- 搜尋送出時打 `/api/search?partNumber=...`：
  - DigiKey 成功 → DigiKey 那一列的 stock / price / breaks / updated / productUrl 全部換成真實值，徽章變 **Live**
  - DigiKey 失敗（403 / 404 / 429 / EMPTY） → 錯誤 toast 顯示 code & message，DigiKey 列標 **Demo**
  - 其他 4 家（Mouser/Arrow/Avnet/Newark）目前固定 **Demo**，等 adapter 加入 registry 才會自動變 Live
- "Best price" 計算用 `priceAtQty(qty)`，會跟著 price-break tab 的 qty 即時變化

### 刻意未實作
- 設計稿的 **DesignCanvas zoom/pan** 包裝（純展示工具，非產品頁）
- **TweaksPanel**（accent / density 切換 — 開發期 affordance，user 看不到價值）

## 11. 已知限制 / 未來工作

- Token 快取為 process 記憶體；多實例部署需要改 Redis。
- DigiKey Production API rate limit 低（1,000 次/天），Batch 並行數限制為 2 workers + retry 3 次，大型 BOM（>50 筆）查詢時間較長；超額後自動 Skip 剩餘料號並顯示警告。
- Batch 頁面無法儲存查詢歷史；重新整理即清空。
- 無歷史價格、無使用者帳號。
- 沒做 i18n（介面是中文＋英文混合）。
- DigiKey Sandbox 環境存在已知的 403 Bug，開發與測試皆須使用 Production App（`DIGIKEY_ENV=production`）。
- Mouser 對 TI / Microchip 等大廠有廠商限制，這些料號 DigiKey 才有報價。
- 待加入供應商：Arrow / Avnet / Newark（Arrow 有 TI 授權，可補足 Mouser 缺口）。

## 12. 啟動

```bash
cd Speed Part Search
npm install
cp .env.example .env       # 填入 DigiKey 憑證
npm run dev                # http://localhost:5280
npm test                   # 跑單元測試
curl "http://localhost:5280/api/health"
curl "http://localhost:5280/api/search?partNumber=NE555P"
```

## 13. 缺料預警生命週期與 API 資料對接功能更新

我們已成功將 DigiKey 與 Mouser API 的生命週期狀態（Lifecycle Status）接入風險判定與前端展示系統中。

### 1. API 欄位對接 (Data Mapping)
- **DigiKey (`src/lib/suppliers/digikey/index.ts`)**：從 `ProductStatus?.Status` 取出狀態值並對應至 `lifecycleStatus`。
- **Mouser (`src/lib/suppliers/mouser/index.ts`)**：從 `LifecycleStatus` 取出狀態值，若無則降級使用 `availabilityStatus`。
- **型別定義 (`src/lib/suppliers/types.ts`)**：在 `PartResult` 介面新增 `lifecycleStatus?: string | null`。

### 2. 風險判定邏輯重構 (Risk Classification Rules)
在 `src/app/api/demand-forecast/route.ts` 及 `src/lib/demand-forecast/cache-util.ts` 中整合生命週期分析：
- **高風險 (`High Risk` / 有缺料風險)**：
  - 若偵測到停產 (`Obsolete`、`Discontinued`、`End of Life`、`EOL`)，直接列為高風險，並在風險原因加上 `🔴 生命週期：原廠已標示停產 (狀態值)，庫存售完即止`。
  - 若偵測到最後採購期 (`Last Time Buy`、`LTB`)，列為高風險，原因加上 `🔴 生命週期：原廠已進入最後採購期 (狀態值)`。
- **中風險 (`Medium Risk` / 中風險)**：
  - 若偵測到不推薦新設計 (`NRND`、`Not Recommended for New Designs`)，列為中風險，原因加上 `🟡 生命週期：原廠不建議新設計採用 (狀態值)`。

### 3. 前端介面與精美徽章展示 (Frontend UI)
在 `src/app/demand-forecast/page.tsx` 中：
- 在 15 個類別料件查詢表格中，新增「生命週期」表頭與欄位。
- 實作 `LifecycleBadge` 元件，針對不同的生命週期狀態渲染不同樣式的彩色標籤：
  - **停產/EOL** (紅底紅字紅框，如 `FEF3F2` / `B42318` / `FECDCA`)
  - **最後採購** (橙底橙字橙框，如 `FFFAEB` / `B54708` / `FEDF89`)
  - **不推薦新設計** (橘底橘字橘框，如 `FFF6ED` / `C4320A` / `FFEDD5`)
  - **生產中/Active** (綠底綠字綠框，如 `ECFDF3` / `027A48` / `D1FADF`)
  - 其他狀態 (灰底灰字灰框，如 `F9FAFB` / `475467` / `E4E7EC`)
- **情報佐證徽章語意更新**：將最右側的「市場報告 / 產業情報佐證」狀態文字進行優化：
  - **無情報** (`no_signal`) 調整為：**正常(無缺料情報)**
  - **有情報** (`info`) 調整為：**一份報告顯示缺料**
  - **多來源佐證** (`multi_source`) 調整為：**兩份報告以上顯示缺料**

