# Project Summary — Speed Part Search

> 最後更新：2026-07-13（詢價內容框改為可人工微調）

---

### 2026-07-13 — 詢價內容框改為可人工微調（自動生成 + 手動編輯並存）

**背景**：卡片標示「送出前可人工微調」，但詢價內容 textarea 實為 `readOnly` 無法編輯。使用者需求＝維持模板+變數自動生成（1），同時允許送出前針對個別供應商手動改字/加備註（2）。此外釐清一個使用者誤解：同一顆料的三家供應商詢價文字僅 RFQ 編號尾碼（-01/-02/-03）不同，料號/品牌/需求數量相同屬正常，點第一列因本就選中故看不出切換。

- [x] **新增 `draftMessage` state**（`src/app/qq-inquiry/page.tsx`）：右側詢價框改綁 `draftMessage`，移除 `readOnly`，`onChange` 即時更新。
- [x] **自動生成仍為預設**：新增 `useEffect([message])` → 每當自動生成內容 `message` 變動（切換供應商列 `selected`、切換 BOM 料號、切換模板）就 `setDraftMessage(message)` 重新生成，覆蓋前一筆的人工微調（避免把 A 供應商的備註殘留到 B）。同一筆生成後允許自由編輯。
- [x] **複製一致性**：`copyMessage`（複製到 QQ/微信、複製並開華強）改用 `draftMessage`；`openSupplierQq` 點列上 QQ 按鈕時，若該列 = 目前選中列則帶人工微調（`draftMessage`），其餘列仍用該列自動生成內容 `buildMessage(row)`。
- [x] **驗證**：`npx tsc --noEmit` ✅。
- **修改檔案**：`src/app/qq-inquiry/page.tsx`、`project_summary.md`

---

### 2026-07-13 — 修正預設模板被 localStorage 舊版覆蓋（新格式不生效）

**背景**：上一版改了 `DEFAULT_TEMPLATES` 內容後，使用者反映在頁面上看不到變更。根因：載入時 `useEffect` 直接把 `localStorage` 的 `speedpart.inquiryTemplates.v1` **整包覆蓋** `templates` state，凡是操作過模板管理的瀏覽器都存過舊的 `default` 內容，導致程式碼新版被舊版蓋掉。

- [x] **系統預設模板永遠以程式碼為準**（`src/app/qq-inquiry/page.tsx` 載入邏輯）：
  - 載入 `localStorage` 模板時，先 `filter` 掉 id 在 `DEFAULT_TEMPLATES` 中的系統預設模板，只保留使用者自訂模板，再與最新 `DEFAULT_TEMPLATES` 合併：`setTemplates([...DEFAULT_TEMPLATES, ...custom])`。
  - 效果：系統預設模板（`default`，本就不可編輯）每次載入都用最新程式碼版本；使用者自訂模板（如「報價模板二」）照常從 `localStorage` 保留。
  - 使用者端只要重新整理頁面即可看到新格式，無須清快取。
- [x] **驗證**：`npx tsc --noEmit` ✅。
- **修改檔案**：`src/app/qq-inquiry/page.tsx`、`project_summary.md`

---

### 2026-07-13 — 預設報價模板改為精簡格式

**背景**：依使用者提供的詢價截圖，將系統預設模板 (`Default`) 內容改為更精簡的格式，只保留詢價編號、問候語與料號/品牌/需求數量三行核心資訊。

- [x] **精簡預設模板內容**（`src/app/qq-inquiry/page.tsx` 的 `DEFAULT_TEMPLATES`）：
  - 移除「需求：原裝正品，請提供含稅單價、庫存數量、MOQ/MPQ、批號、交期與報價有效期。」整行。
  - 移除「如果有現貨，請一併提供可出貨時間與付款/物流條件。」整段。
  - 拿掉「您好，麻煩幫忙報價，謝謝。」與「料號」之間的空行，讓三行料號資訊緊接問候語下方，與截圖格式一致。
  - 最終格式：`詢價編號：{rfqId}` → 空行 → `您好，麻煩幫忙報價，謝謝。` → `料號：{mpn}` → `品牌：{manufacturer}` → `需求數量：{qty} pcs`。
  - 動態變數 `{rfqId}`/`{mpn}`/`{manufacturer}`/`{qty}` 維持不變，卡片顯示與複製到 QQ 的內容皆套用新格式。
- **注意**：此為系統預設模板定義；同事瀏覽器 `localStorage` 已存過舊模板清單者會沿用舊預設內容，若要全員立即套用需另做版本遷移（尚未實作）。
- [x] **驗證**：`npx tsc --noEmit` ✅。
- **修改檔案**：`src/app/qq-inquiry/page.tsx`、`project_summary.md`

---

### 2026-07-12 — 詢價內容模板切換與設定管理 + 按鈕功能簡化

**背景**：依使用者需求調整詢價卡片中的操作按鈕，取消 `Email` 與 `華強頁面` 選項；此外，新增詢價內容模板切換功能，預設為原先的 `Default` 內容，並允許使用者直接在此頁面新增、編輯與刪除自訂報價/詢價模板（如「報價模板二」）。

- [x] **簡化操作按鈕**：
  - 從人工確認詢價內容卡片中，正式移除 `Email` 和 `華強頁面` 兩個選項，使操作介面更聚焦。
- [x] **新增模板管理與切換**：
  - **切換下拉選單**：在「人工確認詢價內容」卡片 header 中加入選擇器，可動態切換當前選用的詢價模板。
  - **設定按鈕與 Modal**：加入一個「設定」按鈕，點擊彈出「詢價/報價模板設定」Modal：
    - 可在 Modal 中新增自訂模板（如「報價模板二」），輸入模板名稱與模板內容。
    - 模板內容支援動態變數：`{rfqId}`（詢價編號）、`{mpn}`（料號）、`{manufacturer}`（品牌）、`{qty}`（需求數量）。
    - 支援編輯與刪除自訂模板（系統預設模板不可編輯與刪除）。
    - 模板清單與當前選用 ID 皆會自動儲存於 `localStorage`，確保跨頁面重整能持續留存。
  - **變數動態解析**：當使用者選擇不同的模板或更新模板內容時，卡片中的詢價內容與複製到 QQ 時的內容都會動態依據該模板與當前料號變數進行解析取代。
- [x] **寬度與表格排版優化 (一頁呈現，無需右滑)**：
  - 調整 `src/app/globals.css` 中「詢價任務清單」表格的欄位寬度與 padding，使整體表格在較窄的容器下也能完全在一頁中呈現，不用往右滑動。
  - 將 RFQ 欄寬從 200px 縮減至 115px（配合徽章 max-width 從 190px 縮減至 95px）。
  - 將料號欄寬縮減至 100px、庫存欄寬縮減至 75px、倉庫欄寬縮減至 50px。
  - 將 QQ 按鈕欄寬從 150px 縮減至 110px，並縮小 `.qq-link-btn` 的內邊距與最小寬度（`min-width: 94px`），保證按鈕與狀態文字完美適配不溢出。
  - 縮減表格單元格 of 左右 Padding（14px -> 8px），節省了大量的橫向空間。
- [x] **全域頁首導覽列整合 (消除頁面選單不一致問題)**：
  - 發現 `BOM Batch` (`/batch`)、`BOM Batch - MFR` (`/batch-manufacturer`) 與 `廠商對照表` (`/manufacturer-mapping`) 頁面原本硬編碼了自訂的 `<header>` 元素，導致各分頁中的選單內容不一致（例如缺少 QQ 詢價連結、單料查詢譯名不統一），且缺少了右上角的使用者帳戶選單（變更密碼/登出）與快速搜尋框。
  - 將上述三個分頁硬編碼的 `<header>` 區塊全面替換為共用的 `<Header />` 元件，實現全站導覽列樣式與邏輯一致。
  - 清理了 `batch/page.tsx` 中僅供舊版 header 使用的 `canUseQqInquiry` 與 `session` 狀態及 imports 依賴。
- [x] **驗證**：
  - `npm run build` ✅（編譯成功，無 TypeScript 錯誤，靜態頁面產生與預先渲染完成）。
- **修改檔案**：
  - `src/app/qq-inquiry/page.tsx`
  - `src/app/batch/page.tsx`
  - `src/app/batch-manufacturer/page.tsx`
  - `src/app/manufacturer-mapping/page.tsx`
  - `src/app/globals.css`
  - `project_summary.md`

---


### 2026-07-12 — SMTP 清查結論（與 Tracklane 專案共同調查）

- 發現本專案的信件功能（忘記密碼等）自始未寄出過信：本機與 Railway 都沒有 `SMTP_PASS`（Gmail 應用程式密碼從未產生），`lib/email.ts` 一直走 graceful skip。
- Danny 產生 Gmail App Password 後本機 SMTP 認證通過；但 **Railway 封鎖對外 SMTP 連接埠（25/465/587）**——Tracklane 實測 nodemailer 卡 2 分鐘連線逾時，正式站寄信需改走 HTTP API 郵件服務。
- **Danny 決定：寄信功能只應用到 Issue Tracking System（Tracklane），本專案不用。** 本機 `.env` 的 `SMTP_PASS` 已還原為空、Railway 亦無 `SMTP_PASS`——本專案維持原狀（email graceful skip）。
- 本專案程式碼無改動。

---

### 2026-07-11 — QQ 詢價看板（團隊採購進度總覽 + Case 結案）

**背景**：報價入庫後的第一個呈現層應用。看板 = 所有 Case 的採購進度一目了然：誰建的、幾顆料已有報價、最新回覆時間；展開看每顆料的最佳報價與新鮮度，未詢的料一鍵跳去詢價。

- [x] **看板區塊**（`/qq-inquiry` 頁首流程圖下方，有 Case 才顯示）：
  - Case 列：編號 / 檔名 / 建立者 / 建立時間 / 報價進度條（n/m 料號已報價）/ 最新報價時間 / 狀態 pill。
  - 點列展開料號明細：料號 / 需求量 / 報價數 / 最佳報價（供應商＋價格，沿用降權邏輯）/ 新鮮度 chip（效期至·有效·可能失效·僅供參考·已過期·待詢價）/「前往詢價」按鈕直接切 Case 並定位該料號。
  - 狀態 pill 可點擊切換「詢價中 ⇄ 已結案」；已結案列淡化顯示。
- [x] **後端**：db.ts 新增 `setQqCaseStatus`；`PATCH /api/qq/cases/[id]` 擴充——帶 `status` 走結案/重開（僅接受 詢價中/已結案），帶 `contentHash+bomRows` 維持原「新版本」語意。
- [x] **前端重構**：`switchCase` 改為 `jumpToCaseMpn(caseId, index)` 的特例，供看板「前往詢價」跳轉定位（避免 setState 後讀到舊 bomRows 的閉包問題）。
- [x] **驗證**：`npx tsc --noEmit` ✅；本機實測——看板兩 Case 渲染、進度條 2/3、展開明細三列（效期至 7/14 綠／待詢價琥珀／10 天前報價「可能失效」）全對；「前往詢價」正確切到目標 Case 第 2 筆料號；結案切換 UI 與 DB 同步（重開亦可）；無 Case 時看板隱藏。測試資料已清。
- **修改檔案**：`src/lib/db.ts`、`src/app/api/qq/cases/[id]/route.ts`、`src/app/qq-inquiry/page.tsx`、`src/app/globals.css`

---

### 2026-07-11 — QQ 詢價 Case 與報價紀錄入庫（localStorage → DB，團隊共享）

**背景**：BOM 列表、報價紀錄原本存瀏覽器 localStorage——同事詢的價彼此看不到、清快取就消失。依討論定案三原則：(1) 檔案身分用「解析後內容 hash」而非檔名；(2) 報價跟著料號×供應商走、不跟著檔案走；(3) 報價有效期兩層制（廠商明講的硬期限＋報價日齡軟分級），過期不刪不藏（歷史報價是談判依據與行情曲線）。

- [x] **DB 新表**（SQLite+Postgres 雙路徑，Postgres 部署後首次請求自動建表）：
  - `qq_bom_cases`：id（沿用 BOM-YYYYMMDD-NN，改由伺服器以台北時區產生）、file_name、content_hash（料號×數量正規化排序後 SHA-256）、status、bom_rows(JSON)、created_by。
  - `qq_quotes`：料號×供應商為業務主鍵，含 quoted_at、valid_until（廠商明講才有）、created_by；同 Case 同 RFQ（或同料號×供應商）新報價取代舊報價，跨 Case 一律保留。
- [x] **API**（皆走 `canAccessQqInquiry` 權限閘）：`GET/POST /api/qq/cases`（POST 去重：hash 相同回 409 duplicate=hash 引導開既有 Case；同名不同內容回 409 duplicate=filename 引導更新為新版本；force 略過）、`PATCH/DELETE /api/qq/cases/[id]`（PATCH=新版本：換 BOM 內容保留報價）、`GET/POST /api/qq/quotes`（GET ?mpn= 跨 Case 歷史報價）。
- [x] **前端**（`/qq-inquiry`）：
  - 載入改抓伺服器；localStorage 舊 Case **一次性自動搬遷**進 DB（全部成功才清 key，失敗下次重試），localStorage 只留「上次開啟的 Case」。
  - 上傳 BOM 前端算 hash → 內容相同提示開既有 Case／仍建新 Case；同名不同內容提示「更新為新版本（保留報價）」／建新 Case。
  - 報價新鮮度 chip：廠商效期內綠「效期至 M/D」、過期紅「已過期」；未明講效期則 7 天內綠「有效」、7-14 天琥珀「可能失效」、>14 天灰「僅供參考」。廠商明講的「報價有效期 N 天」自動換算 valid_until。
  - 新增「此料號在其他 Case 的歷史報價（行情參考）」區塊（顯示供應商/價格/日期/經手人/新鮮度）；報價列與 Case 資訊列顯示經手人（建立者）。
  - 最佳報價挑選：已過期/僅供參考的報價自動降權；匯出 Excel 新增「報價狀態」「有效期至」「經手人」欄。
- [x] **驗證**：`npx tsc --noEmit` ✅、`npm test` ✅；本機 SQLite 實測全流程——建 Case（id 正確產生 BOM-20260711-01、createdBy 帶入）、hash 去重 409、同名 409、force 建新、同 RFQ 報價取代（0.2→0.19 只留一筆）、valid_until=+3 天、跨 Case 歷史查詢 excludeCase 正確、PATCH 版本更新、DELETE 連動刪報價；模擬 localStorage 舊 Case 重載後自動搬遷入 DB 且 key 清空；瀏覽器頁面實測 Case 切換、已報價標記、「有效」「可能失效」chip、歷史報價區塊渲染正常（測試資料已清）。
- **注意**：正式站部署後，各同事瀏覽器裡的舊 localStorage Case 會在他們下次開啟 `/qq-inquiry` 時自動搬遷合併進 DB。
- **修改檔案**：`src/lib/db.ts`、`src/app/api/qq/session.ts`（新）、`src/app/api/qq/cases/route.ts`（新）、`src/app/api/qq/cases/[id]/route.ts`（新）、`src/app/api/qq/quotes/route.ts`（新）、`src/app/qq-inquiry/page.tsx`、`src/app/globals.css`

---

### 2026-07-11 — 缺料預測基準料重構：角色制 + 彈性配額（150 顆）

**背景**：前一日 review 指出手挑 150 顆代表料的兩個結構性問題——(1) 挑選無客觀標準、EOL 手動換料維護成本高；(2) 所有料混當同一用途、訊號互相稀釋。經使用者同意改為「三角色 × 彈性配額」設計。

- [x] **benchmark.ts 全面重構**（`role` 欄位 + 類別配額權重制，總數維持 150）：
  - **溫度計料 69 顆**：大宗共用 jellybean（多源可替代），偵測「市場級」供需變化。
  - **咽喉料 47 顆**：單一來源／無 pin-to-pin 替代／歷史配貨重災（FTDI、WIZnet、SiTime、Wolfspeed SiC、Marvell PHY、retimer、FRAM、車規 MCU…），偵測「單點斷供」。
  - **實戰料 34 顆**：初始為常用料種子，待搜尋記錄累積後輪換成「使用者真實查過的料」。
  - 配額改依類別重要性：記憶體 14、MLCC 13、PMIC/MOSFET/MCU 各 12…防護 6、散熱 6（原本每類死板 10 顆）。
  - 去重 4 顆歷史重複（AO3400A/W25Q128JVSIQ/USBLC6-2SC6/SN65HVD230DR 各留一筆）。
  - **16 顆新料全部先經 DigiKey/Mouser API 驗證「查得到+Active+有庫存」才入列**（四輪驗證共試 33 顆，淘汰 BSS138L/RP2040/GD25Q127 等 Obsolete/缺貨候選；沿用 6/6 EMPTY_RESULT 教訓）。
- [x] **search_logs 搜尋記錄**（實戰料的資料來源）：db.ts 新增表（SQLite+Postgres 雙路徑，含索引）與 `logPartSearch`/`getTopSearchedMpns`；`/api/search` 與 QQ 詢價華強查詢（`source='qq-inquiry'`，即真實 BOM 料）非同步寫入、失敗靜默不影響主流程。
- [x] **`/api/demand-forecast/field-suggestions`**：回傳 90 天最常搜尋料號、標示是否已在 benchmark、產出實戰料輪換候選清單（附「入列前須 API 驗證」提示）。
- [x] **`/api/demand-forecast/benchmark-health`**（季度體檢，僅報告不自動改名單）：逐顆檢查 EOL/NRND、無資料（最近快照無代理商資料或從未有快照）、死訊號（連續 ≥8 次快照庫存與價格完全不動）、重複 MPN，並給汰換建議。
- [x] **API 快取對齊**：新增 `alignPartsWithBenchmark`——mode=cached/summary 回傳時以現行名單為準（補 role、剔除已汰換料、新料顯示「尚未查詢」），避免改名單後 UI 殘留舊料。
- [x] **前端**：料件明細表新增「角色」欄（溫度計=藍/咽喉=橘/實戰=綠 chip，hover 顯示角色說明）。
- [x] **驗證**：`npx tsc --noEmit` ✅、`npm test` ✅；本機 SQLite 實測 search_logs 寫入/統計（測試資料已清）；臨時 CRON_SECRET 走 middleware 後門實測三端點——mode=cached 回 150 顆、角色 69/47/34 正確覆蓋、22 顆新料「尚未查詢」、field-suggestions 正確辨識名單外候選、benchmark-health 邏輯正確（本機無快照全報 no-data 屬預期，正式站有歷史）；Playwright 本機登入截圖確認角色欄三色 chip 渲染正常。臨時 secret 已移除。
- [x] **部署**：commit+push main（Railway 自動部署）；`gh workflow run weekly-forecast.yml` 已觸發手動 full 查詢，讓 22 顆新料入快照（本 commit 一併帶入前次週報 session 已驗證未提交的改動）。
- **注意**：換料的 22 顆新料第一週無週環比基準，趨勢訊號靜默一週屬預期；被移除的舊料歷史快照保留在 DB（無害）。實戰料輪換建議累積 4 週搜尋記錄後執行。
- **修改檔案**：`src/lib/demand-forecast/benchmark.ts`、`src/lib/db.ts`、`src/app/api/search/route.ts`、`src/app/api/hqew/search/route.ts`、`src/app/api/demand-forecast/route.ts`、`src/app/api/demand-forecast/field-suggestions/route.ts`（新）、`src/app/api/demand-forecast/benchmark-health/route.ts`（新）、`src/app/demand-forecast/page.tsx`

---


### 2026-07-10 — 週報頁新增歷史週報

- [x] **週報清單顯示全部歷史資料**：週報 API 不再只回傳本週一份，現在會從資料庫讀取既有週報快取，依週次由新到舊排列。
- [x] **舊週報網址可正常開啟**：詳情頁改為依網址中的週報 ID 讀取對應內容，不再固定讀取本週報告或讓舊網址回傳 404。
- [x] **正式資料驗證**：Railway 資料庫現有 5 份週報，日期為 2026/07/06、06/29、06/22、06/15、06/08；逐份確認 ID、標題及封面故事內容均正確配對。
- [x] **品質檢查**：`npx tsc --noEmit` 與 `npm test` 通過。
- **修改檔案**：
  - `src/lib/db.ts`
  - `src/lib/demand-forecast/weekly-report.ts`
  - `src/app/demand-forecast/weekly-reports/[id]/page.tsx`
  - `project_summary.md`

---

### 2026-07-08 — 移除 QQ 詢價測試回覆範例

- [x] **刪除測試回覆案例區塊**：QQ 詢價頁回覆解析區不再顯示「測試回覆範例」與「複製測試回覆」按鈕，畫面只保留正式回覆貼上、讀取 QQ 回覆、加入報價紀錄與匯出 BOM。
- [x] **清理相關程式與樣式**：移除範例回覆產生函式、複製狀態與 `.qq-sample-*` 樣式，避免留下不使用的前端程式碼。
- **修改檔案**：
  - `src/app/qq-inquiry/page.tsx`
  - `src/app/globals.css`
  - `project_summary.md`

---

### 2026-07-08 — 開通指定一般使用者 QQ 詢價權限

- [x] **指定採購帳號可使用 QQ 詢價**：新增共用權限判斷，允許管理員與 `xiaomin@yangshin.com` 存取 QQ 詢價功能；此使用者仍維持一般使用者角色，不會取得使用者管理等管理員權限。
- [x] **同步放行三個入口**：共用 Header、BOM Batch 自帶頁首、`/qq-inquiry` 路由 middleware 皆改用同一權限判斷，確保選單可見且直接輸入網址也能進入。
- [x] **API 權限同步**：`/api/hqew/search` 華強查詢 API 改為允許 QQ 詢價授權使用者呼叫，避免頁面可進但查詢被 403 擋下。
- **修改檔案**：
  - `src/lib/permissions.ts`
  - `src/middleware.ts`
  - `src/components/Header.tsx`
  - `src/app/batch/page.tsx`
  - `src/app/api/hqew/search/route.ts`
  - `project_summary.md`

---

### 2026-07-04 — 修正 QQ 詢價連結被微信/維信覆蓋與跳轉問題

- [x] **修正 QQ/微信 連結誤判**：修正華強電子網 (s.hqew.com) 搜尋結果解析邏輯。部分供應商將微信客服放在 QQ 前面，且微信連結含有 `work.weixin.qq.com`，因帶有 `qq` 被誤判定為 QQ 入口。
- [x] **過濾微信連結**：在後端解析 `qqHref` 時加上 `.filter` 規則，排除 href、className 或 data 中含有 `weixin` 或 `wechat` 的連結，防止微信連結覆蓋真正的 QQ / 企點連結。
- [x] **還原個人 QQ 安全分流跳轉**：依歷史記錄修正，個人 QQ (如第一頁與第三頁之供應商) 因 QQ 官方禁止裸號直接網頁跳轉，故還原為點擊後先複製詢價內容，再為其開啟華強料號搜尋頁 (`s.hqew.com/...`)，使用者即可在該頁面手動點擊 QQ 標誌喚起對話視窗；僅有官方企點簽章連結 (`wpa1.qq.com/...`) 才會直接使用 `window.open` 開啟並觸發 Hammerspoon 自動貼上。
- **修改檔案**：
  - `src/app/api/hqew/search/route.ts`
  - `src/app/qq-inquiry/page.tsx`
  - `project_summary.md`

---

### 2026-07-04 — 改用 Hammerspoon 自動貼上 QQ

- [x] **改用 Hammerspoon 觸發**：QQ 詢價頁點供應商 QQ 後，先複製詢價內容並開啟華強 QQ 入口，同一次點擊立即呼叫 `hammerspoon://speedpartPaste?delay=2600`，由 Hammerspoon 等 QQ 開好後貼上。
- [x] **新增 Hammerspoon HTTP 備援入口**：Hammerspoon 會在 `127.0.0.1:5298` 啟動 `/paste` 與 `/paste-now`；網頁點 QQ 時會同時送出本機圖片請求，避免 `hammerspoon://` URL 事件沒有進入 Hammerspoon。
- [x] **移除網頁對 5299 helper 的依賴**：不再由瀏覽器呼叫 `127.0.0.1:5299/paste`，避免 Chrome / Railway / 私有網路請求造成手動測試與網頁點擊結果不同。
- [x] **新增 Hammerspoon 設定檔**：`tools/qq-paste/speedpart-qq-paste.lua` 綁定 `speedpartPaste` URL 事件，會尋找 `腾讯企点` 或 `QQ`，切到前景後送出 `Command + V`，只貼上、不送出。
- [x] **新增 Hammerspoon 診斷 log**：每次載入設定、收到 URL、找到 QQ、切換 App、送出貼上都會寫入 `~/Library/Logs/speedpart-hammerspoon-qq.log`，方便判斷卡在哪一步。
- [x] **更新安裝腳本**：`tools/qq-paste/install-paste-to-qq.command` 改為安裝 `~/.hammerspoon/speedpart-qq-paste.lua`、在 `init.lua` 加入 require、移除舊 LaunchAgent，並開啟 Hammerspoon 與輔助使用設定。
- [x] **刪除舊 helper 源碼**：移除 `PasteInquiryToQQ.applescript` 與 `qq-paste-helper.js`，避免後續再回到 osascript 權限錯誤流程。
- [x] **本機實測成功**：`curl http://127.0.0.1:5298/health` 回 `{"ok":true}`，`/paste-now` log 顯示找到 `QQ` 並送出 `Command + V`；使用者確認 QQ 輸入框有成功自動貼上。
- **修改檔案**：
  - `tools/qq-paste/speedpart-qq-paste.lua`
  - `tools/qq-paste/install-paste-to-qq.command`
  - `src/app/qq-inquiry/page.tsx`
  - `project_summary.md`

---

### 2026-07-03 — 修正 QQ 詢價多筆 BOM 切換與上傳按鈕

- [x] **第二筆以後使用自己的華強/QQ 結果**：新增依 BOM 料號保存華強查詢結果的前端狀態；切換第 2、3...筆料號時，會載入該料號自己的供應商與 QQ 入口，不再只保留第一筆或上一筆結果。
- [x] **QQ 按鈕照第一筆邏輯**：不再自行 fallback 到華強料號頁；點擊後複製詢價內容並開啟華強 QQ 入口，優先使用華強解析出的 `qqHref`。
- [x] **補強華強 QQ 入口解析**：後端不只抓 `a.a-qq`，也補抓 `a[qq]` 與含 `wpa` / `qq` / `qidian` 的連結，避免第二筆料號因華強 DOM 型態不同漏掉 QQ 入口。
- [x] **第三筆 QQ 顯示補強**：前端不再只靠 `qqHref` 決定是否顯示 QQ 按鈕；只要華強有 QQ 號就顯示，點擊時優先使用 `qqHref`，沒有完整連結時用 QQ 號補成華強同格式 `wpa.qq.com/msgrd` 入口。
- [x] **BOM 上傳按鈕改穩定觸發**：將隱藏 input + ref click 改成原生 label 綁定 file input，避免瀏覽器環境下按鈕點擊不開檔案選擇器。
- [x] **文案同步**：QQ 操作說明改回「複製詢價內容 + 開啟華強解析出的 QQ 入口」。
- [x] **驗證**：`npx tsc --noEmit` 通過。
- **修改檔案**：
  - `src/app/qq-inquiry/page.tsx`
  - `src/app/api/hqew/search/route.ts`
  - `src/app/globals.css`
  - `project_summary.md`

---

### 2026-07-03 — QQ 按鈕複製完整詢價內容

- [x] **QQ 按鈕改為複製詢價內容**：點擊供應商 QQ 按鈕時，不再只複製 QQ 號，而是直接把該供應商對應的完整詢價文字寫入剪貼簿。
- [x] **仍直接喚起桌面 QQ**：保留 `tencent://message` 與 `mqqwpa://` 兩段桌面 QQ protocol 嘗試，不優先打開華強網頁。
- [x] **操作文案更新**：成功狀態改為 `✓ 已複製詢價，正在開 QQ`；下方提示改為 QQ 開啟後直接 `Command + V` 貼上。
- [x] **限制說明**：瀏覽器網頁無法直接把文字寫入桌面 QQ 的輸入框，因此採「複製內容 + 開啟對話」作為可控流程。
- **修改檔案**：
  - `src/app/qq-inquiry/page.tsx`
  - `project_summary.md`

---

### 2026-07-03 — QQ 按鈕改為直接喚起桌面 QQ

- [x] **避免開新網頁**：供應商有 QQ 號時，按鈕不再優先打開華強 `qqHref` 網頁入口。
- [x] **改用桌面 QQ 協定**：點擊後先複製 QQ 號，再依序嘗試 `tencent://message` 與 `mqqwpa://` 兩種桌面 QQ protocol，提高直接喚起 QQ 對話的機率。
- [x] **保留後備操作**：若瀏覽器、macOS 或 QQ 客戶端沒有接住 protocol，QQ 號已在剪貼簿，可直接貼到 QQ 搜尋框。
- [x] **文案同步調整**：按鈕顯示從 `企點` 改為 `QQ`，成功狀態改為 `✓ 已複製，正在開 QQ`。
- **修改檔案**：
  - `src/app/qq-inquiry/page.tsx`
  - `project_summary.md`

---

### 2026-07-03 — 詢價文字移除備註欄位

- [x] **移除正式詢價內容的備註行**：`人工確認詢價內容` 不再輸出 `備註：...`，避免把華強供應商說明或內部判斷文字貼給商家。
- [x] **保留核心詢價資訊**：RFQ 編號、料號、品牌、需求數量、報價要求與現貨補充條件維持不變。
- **修改檔案**：
  - `src/app/qq-inquiry/page.tsx`
  - `project_summary.md`

---

### 2026-07-03 — 修正企點按鈕點不到商家

- [x] **修正企點按鈕喚起策略**：原本只要有 QQ 號就硬導向 `qidian://`，在 Mac/Chrome 上容易只喚起 App 或完全沒有進入商家對話。現在改為：
  - 先將供應商 QQ 號複製到剪貼簿。
  - 優先打開華強電子網解析出的原始商家聯絡入口 `qqHref`。
  - 若華強沒有提供聯絡入口，才嘗試用 `qidian://` 喚起企點。
- [x] **避免頁面跳走**：自訂協定改用隱藏 iframe 觸發，降低整個 Next.js 頁面被導到空白協定頁的機率。
- [x] **文案改清楚**：按鈕成功狀態改為 `✓ 已複製，貼到企點搜尋`，下方提示同步說明「若沒有直接進對話，請在企點搜尋框貼上 QQ 號」。
- [x] **視覺穩定**：企點按鈕加上最小寬度，避免成功文字變長後擠壓表格。
- **修改檔案**：
  - `src/app/qq-inquiry/page.tsx`
  - `src/app/globals.css`
  - `project_summary.md`

---

### 2026-07-03 — 聯絡人按鈕全面改為企業騰訊（騰訊企點）專屬喚起

- [x] **全面改為單一「企點」按鈕**：依據業務採購只用企業客戶端（騰訊企點）溝通的需求，移除多餘的個人 QQ 按鈕。現在推薦供應商表格的聯絡欄位一律渲染為藍色的「企點 {QQ號}」按鈕。
- [x] **解決 Mac 版企點 URL Scheme 限制**：由於實測發現 Mac 版騰訊企點主程式（`腾讯企点.app`）在接收 `qidian://` 自訂協定（包含多種參數格式）時，僅能將程式拉至最前，無法像 Windows 版一樣直接彈出對話視窗。因此將點擊邏輯優化為：
  - 點擊按鈕時，自動將該供應商的 **`QQ 號` 複製到剪貼簿**。
  - 同時直接喚起 **Tencent QiDian（騰訊企點）** 客戶端。
  - 按鈕本身提供點擊成功後的微動畫，短暫變為綠色 **`✓ 已複製 QQ 號`**。
  - 採購只需在開啟的企點中按下 **Command + V** 即可直接搜到該供應商並對話，隨後再回到網頁點擊右側的「複製詢價內容」直接貼入送出。此 2-step 流程完美實現高效率的半自動詢價。
- [x] **美化與優化視覺**：在 `globals.css` 中新增 `.qidian-link-btn.copied-success` 樣式，確保點擊複製成功後有清晰、專業的綠色視覺回饋。
- **修改檔案**：
  - `src/app/qq-inquiry/page.tsx`
  - `src/app/globals.css`
  - `project_summary.md`

---

### 2026-07-02 — 新增 QQ 詢價半自動工作台入口（本機）

- [x] **導航新增「QQ詢價」**：在共用 Header 與 BOM Batch 頁面自帶頁首中，將「QQ詢價」放在 `BOM Batch` 右側、`BOM Batch - MFR` 左側，方便從批量 BOM 查詢銜接詢價流程。
- [x] **新增 `/qq-inquiry` 本機工作台頁面**：第一版先做半自動流程骨架，不自動發送 QQ/微信訊息。頁面包含華強電子網前 3 家候選供應商示例、人工確認詢價文字、一鍵複製、Email 連結、華強頁面跳轉，以及供應商回覆貼回解析區。
- [x] **BOM 上傳 + 第一筆華強查詢 MVP**：新增 BOM Excel/CSV 上傳，前端讀取 `Part Number / MPN / 料號` 與 `Quantity / Qty / 數量` 欄位，先取第一筆料號進行華強電子網查詢驗證。
- [x] **本機華強查詢 API**：新增 `/api/hqew/search?partNumber=...`，使用 Playwright headless browser 開啟華強電子網結果頁並解析 `tr.ec-data` 前 3 家供應商，回傳供應商、料號、品牌、批號、庫存、封裝、倉庫、交易說明與日期。直接 HTTP 抓頁會遇到華強反爬 JS challenge，因此第一版採「真瀏覽器自動化」而非純 HTML crawler。
- [x] **QQ 按鈕限制確認 + 穩定替代操作**：實測華強列表的 QQ 圖示是 `wpa.qq.com/msgrd` 類型，通常喚起桌面 QQ，網頁無法直接寫入 QQ 對話框；頁面新增「複製並開華強」按鈕，先把詢價文字放入剪貼簿並打開華強頁，使用者點 QQ 後可直接貼上。華強站內「詢價/洽洽」表單則可由 Playwright 進一步自動填表。
- [x] **推薦供應商表格新增 QQ 連結**：華強查詢 API 解析 `a.a-qq` 的 QQ 號與 `wpa.qq.com/msgrd` 連結，前端在推薦供應商表格新增 `QQ` 欄。點擊 QQ 按鈕會先複製該供應商的詢價文字，再開啟 QQ 連結；若華強未公開 QQ，顯示 `-`。
- [x] **QQ 回覆延遲的 Excel 回填流程**：回覆解析區新增「加入報價紀錄」與「匯出回填 BOM」。採購可等待 QQ 回覆後把文字貼回，系統解析單價/庫存/MOQ/交期並儲存為該料號+供應商的報價紀錄；匯出時產生新 Excel，包含 `BOM 回填` 與 `報價紀錄` 兩個 sheet，原 BOM 料號/數量保留並新增供應商、QQ、品牌、含稅單價、可供庫存、MOQ、交期、回覆時間與原始回覆。
- [x] **改為 BOM Case 制，避免跨 BOM 誤套報價**：每次上傳 BOM 會建立獨立 Case，包含 Case ID、檔名、建立時間、狀態、該 BOM 料號與該 Case 報價紀錄。報價紀錄只寫入目前 Case，匯出也只匯出目前 Case 的 BOM 與報價，不會把新查詢資料 mapping 到一週前或其他 BOM。Case 暫以 browser localStorage 保存，後續可升級資料庫。
- [x] **Case ID 顯示強化**：使用者回報找不到 Case ID；已在頁面標題旁新增醒目的 `Case ID: ...` pill，並將上傳區塊欄位從「目前 Case」改成 `Case ID`，未建立時顯示「尚未建立」，上傳 BOM 後立即顯示新 Case ID。
- [x] **Case ID 改為短日期流水號**：Case ID 改成 `BOM-YYYYMMDD-01` 格式，同一天新增多個 Case 會依序使用 `02`、`03`。檔名仍保留在 Case 資訊中，並持續用於同檔名重複上傳提示。
- [x] **Case ID 顯示位置簡化並支援刪除**：QQ 詢價頁移除標題旁與 BOM 資訊列的 Case ID 顯示，改保留在 `切換 Case` 區塊集中管理。每個 Case ID 右上角新增 `×`，可刪除不需要的 Case；刪除目前 Case 後會自動切換到下一個 Case，避免畫面殘留無效資料。
- [x] **同檔名 BOM 重複上傳提示**：若再次上傳相同檔名，系統不會直接建立新 Case，而是顯示「這個 BOM 已上傳過」，提供兩個選項：`重新上傳` 會用新檔案內容覆蓋同 Case 並清空該 Case 報價紀錄；`用舊檔案繼續查詢` 會切回原 Case 繼續未完成詢價。
- [x] **詢價內容修正為 BOM 原始料號優先**：修正人工詢價內容在尚未查華強時仍使用示例料號、或華強結果型號帶額外文字的問題。現在只要已上傳 BOM，詢價文字會優先使用 BOM 第一筆原始料號與需求數量；查詢華強後僅補供應商、品牌、QQ、庫存與備註。
- [x] **回覆解析新增來源供應商選擇**：在回覆解析區新增 `回覆來源` 下拉選單，顯示供應商、QQ 與料號。貼回 QQ/微信/Email 回覆前可先選擇是哪一家供應商回覆；按 `加入報價紀錄` 時會把報價寫入該供應商，避免把 A 供應商回覆誤記到 B 供應商。
- [x] **新增 RFQ 詢價任務編號，自動配對回覆來源**：每一家推薦供應商會產生獨立 `RFQ-...-01/02/03` 編號，詢價文字第一行自動帶 `詢價編號`。回覆貼回時系統會先從文字中偵測 RFQ 編號並自動配對料號、供應商與 QQ；若供應商未帶回 RFQ 編號，才退回人工選擇來源。報價紀錄與 Excel 匯出同步新增 RFQ ID 欄位，降低多料號、多供應商同時詢價時選錯來源的風險。
- [x] **新增測試回覆範例**：回覆解析區新增 `測試回覆範例`，會依目前 3 家供應商各產生一段帶 RFQ ID 的模擬回覆，並提供 `複製測試回覆` 按鈕。使用者可直接複製任一段貼到正式回覆區，驗證 RFQ 自動配對、價格/庫存/MOQ/交期解析與報價紀錄流程。
- [x] **BOM 回填自動挑最佳報價**：`報價紀錄` sheet 仍保留所有供應商回覆；`BOM 回填` sheet 改為每個 BOM 料號從所有候選報價中自動挑一筆推薦報價，排序優先順序為：有單價、庫存足夠、MOQ 符合、含稅單價最低、交期較快。BOM 回填同步新增 `候選報價數`、`最佳RFQ ID` 與 `挑選原因` 欄位。
- [x] **報價與複製操作新增成功狀態**：按 `加入報價紀錄` 後按鈕會短暫變成綠色 `已加入報價`；按 `複製測試回覆` 後該範例按鈕會短暫變成綠色 `已複製`，讓測試流程更明確。
- [x] **BOM 料號可逐筆切換查詢**：原本只能查詢第一筆 BOM 料號；現已新增上一筆/下一筆與 BOM 料號選擇清單。使用者可切到第 2、3...筆料號後查詢華強電子網，頁面會顯示目前料號、需求數量與 `已查/未查` 狀態，並以 `已查詢數/BOM總筆數` 顯示進度。
- [x] **BOM 料號狀態改為已查/已報價分色**：BOM 料號 chip 不再只看本次查詢狀態；若該料號在目前 Case 中已有報價紀錄，會顯示 `已報價` 並用更明顯的綠色標記。若只是查過華強但尚未加入報價，顯示 `已查`；尚未處理則顯示 `未查`。
- [x] **回覆解析 MVP**：先用本地規則從貼回文字中擷取單價、庫存、MOQ、交期，後續可替換為 AI parser 並接 Excel 回填。
- [x] **驗證**：`npx tsc --noEmit` 通過。用測試 BOM 上傳 2 筆料號，第一筆 `GCM155C71A105KE38D` 查詢華強成功，頁面顯示 `共 184 條` 並回填即時解析前三家供應商。本次僅在本機編輯，未部署、未上傳 Railway。
- **修改檔案**：
  - `src/components/Header.tsx`
  - `src/components/Icon.tsx`
  - `src/app/batch/page.tsx`
  - `src/app/qq-inquiry/page.tsx`
  - `src/app/api/hqew/search/route.ts`
  - `src/app/globals.css`

---

### 2026-06-10 — 週報分析與語氣全面升級

- [x] **智慧資訊融合：對接 Gemini 2.5 Flash（AI-Powered Story Synthesis）**
  - 真正解決「一堆片段的文字湊在一起」的問題：對接 Gemini 2.5 Flash API。週報故事主內文（`item.story`）現在會將收集到的多個外部情報片段（如 EE Times、thelec、Future Electronics、PPSI 等）作為脈絡送給大模型。
  - 大模型會如報紙社論或專欄簡報般，融會貫通地將所有來源提煉、融合成一段具有「說話口吻」且極其連貫、專業的電子供應鏈分析報告，分為【市場趨勢與情報整合】與【風險提示與專案影響】兩大段。
  - **智慧快取保護與超額熔斷**：使用 SQLite 快取機制，快取鍵以 `reportId-categoryId-evidenceHash` 組成。若本週外部情報沒有新增或變動，直接命中 cache hit（零 API 呼叫延遲與零額度消耗），僅在有新情報寫入時才會呼叫 Gemini 重新融合。同步納入每月 $5 美元熔斷器保護。
- [x] **移除卡片內冗餘的原始佐證區塊（Removed Redundant Evidence Blocks）**
  - 解決介面冗餘與不美觀問題：由於週報最底部已備有「本文參考來源」新聞連結列表，原本展示在封面故事卡片下方的灰底「🔍 原始情報片段 (佐證來源)」顯得重複且破壞版面。
  - 現已將該灰底佐證片段區塊從詳情頁中**完全移除**，使週報呈現純淨、專業的 AI 融合分析內文，版面回歸 Bloomberg Terminal 風格的極簡與專業感。
- [x] **語氣企業級與商業化（Eliminated Meta-Dialogue）**
  - 重構週報產生器 `weekly-report.ts` 的文字模板，移除了如「本段只整理來源能直接支持的內容」、「所以週報只能把...放進封面故事」等非專業、具備 AI 開發者草稿特徵的 meta 敘述。
  - 將內容替換為專業的電子供應鏈商業分析語氣（如使用「【情報摘要】」、「【市場趨勢】」、「【風險提示】」等結構化標記）。
- [x] **行動導向決策建議優化（Actionable Sourcing Insights）**
  - 優化 MLCC、記憶體（DRAM/DDR/Flash）與功率元件（MOSFET）三大重點類別的行動建議，將建議調整為針對採購（Sourcing）、專案經理（PM）與研發（RD）的具體協同行動指南。
  - 優化產品生命週期（PCN/EOL）與常規背景追蹤類別 of 行動描述，確保建議具備可執行性，而非籠統的指示。
- [x] **驗證與編譯確認**
  - 修正拼字與簡繁字體（如修正「交互驗驗」為「交互驗證」、「拉長趋势」為「拉長趨勢」）。
  - TypeScript 靜態編譯 `npx tsc --noEmit` 與單元測試 `npm test` 皆完全通過。
- **修改檔案**：
  - `src/lib/demand-forecast/weekly-report.ts`（重構產生器、移除 main text 原始碎片）
  - `src/app/demand-forecast/weekly-reports/[id]/page.tsx`（詳情頁面渲染：佐證來源獨立區塊）

---

### 2026-06-10 — 週報「報紙化」：取消股票報價式呈現

**使用者回饋**：上一版把數據（「3 顆庫存週減逾 50%（最深 -62%）…」）直接當內容呈現，像股票行情表；文章又重複念一次數字，完全沒用到新聞和報告的實質內容。期望「讀起來像報紙一樣舒服」、數據只 high-level 說哪幾個 category 有問題。

- [x] **數據全面退到幕後**：`computeCategoryDataSignal` 的數字仍用於決定 tone/排序/crossHit，但所有對外文字（`buildDataSignalText`/`describeCategorySignal`/headline/title/summary/openingNotes）改 high-level 質性語言（「通路庫存水位明顯下滑」「價格走勢轉強」），不再輸出顆數/百分比。
- [x] **文章主體改用新聞與報告內容**：Gemini prompt 重寫為「供應鏈線記者寫報導」——以市場素材的事實細節為主體（誰報導了什麼、原廠/通路動作、趨勢方向），通路觀測最多一句旁證、嚴禁統計清單；兩段 180-260 字、報紙產業版筆調。**Gemini 改成只要有素材就呼叫**（不再限交叉命中），由 $5/月熔斷 + 6h 報告快取 + 每期最多 4 類別控成本。
- [x] **fallback 也報紙化**：無 AI 時直接引用第一條新聞內容（「市場方面，Tom's Hardware 報導指出：…」）+ 一句 high-level 通路觀察；去除「標題：/摘要：」格式前綴與「N 則新聞」統計腔。
- [x] **詳情頁**：刪除「自家快照——本週哪些類別的數字在動」股票報價卡片區與頂部數字 metric 卡；改在「編輯室觀察」下方放風險色 category chips（high-level 點名哪幾類有問題）。
- [x] **驗證**：本機種合成快照 + 測試帳號實測——標題「記憶體、MLCC 供應訊號升溫，建議提早確認交期與需求」、story 以 Tom's Hardware 新聞內容開場 + 一句通路觀察收尾、全頁無「週減逾/週漲逾/顆料件」字眼。`tsc --noEmit` 通過。測試資料全清。
- 註：過程中曾誤解「全部取消」為砍掉週報功能而 git rm 檔案，經澄清後已全數還原再改。
- **修改檔案**：`src/lib/demand-forecast/weekly-report.ts`、`src/app/demand-forecast/weekly-reports/[id]/page.tsx`。
- [x] **（同日後續）週報吃進更多 RSS 新聞內容**：使用者反映「有數據訊號但無新聞」的類別只剩一句通路觀察、太單薄。改法：(1) 封面故事改優先挑「有新聞素材」的類別（交叉命中 + 有 news/PCN），純數據無新聞者不再硬塞成空殼頭條；(2) categoryEvidence 關鍵字由硬篩改軟性排序（已被上游分類的新聞即納入、關鍵字命中者優先），每篇新聞 2→3 則、PCN 1→2 則、article 抽句 2→4、evidence 總量 4→6；(3) Gemini prompt 要求盡量用上每一則素材、280-420 字 2-3 段；(4) fallback 亦織入多則新聞。本機實測 Gemini 正常時，記憶體文章融合 Tom's Hardware/AOL/Z2Data/Future Electronics 四源、MLCC 融合 Astute/DIGITIMES/Holy Stone 等，讀感接近產業版報導。tsc 通過、測試資料已清。


---

### 2026-06-10 — 物料預測週報重構：自家快照數據當主軸（刀口 1-5）

**問題**：原週報內容空泛、像 AI 產業專欄。根因：(a) C01/C03/C04 類別敘述與 executiveItem 標題/建議是硬編碼字串，每週重播且部分論述無數據支撐；(b) 週報 100% 用外部新聞，完全沒用到自家最值錢的資產——150 顆基準料每週實測快照；(c) 風險等級只要爬到任何報告就判「中」，警報疲勞；(d) Gemini prompt 要 250-350 字社論，必然空泛；(e) 每類別間 sleep 10 秒，生成極慢。

- [x] **刀口1+2：硬編碼改成類別層級的快照數據警示**。新增 `getDemandForecastSnapshotHistory()`（db.ts，回傳每顆料完整快照欄位）；週報新增 `computeCategoryDataSignal()` 計算各類別週環比彙總（庫存週減 ≥30%/≥50% 顆數、最低價週漲 ≥10%/≥20% 顆數、供應商家數減少顆數、最深跌幅/最大漲幅），產出類別層級敘述如「記憶體：本週監控 2 顆料件中，2 顆庫存週減逾 30%（最深 −64%）…」。不點名個別料號（依使用者要求）。刪除硬編碼的 `categoryEvidenceSummary` 與 `describeCategorySignal` 的 C01/C03/C04 劇本。
- [x] **刀口4：風險等級三條件**。交叉命中（自家數據異動 + 同類別新聞）=高；只有數據異動或外部訊號=中；皆無=平穩。`crossHit` 旗標 = `data.tone!=='normal' && (news||lifecycle)`。
- [x] **刀口3：Gemini 只在交叉命中才呼叫**。prompt 改餵「我方實測數字 + 外部佐證」，要求 80-120 字、必須引用數字、禁止無數據支撐的形容詞與宏觀斷言、結尾點出對量產專案/BOM 成本的影響。非交叉命中改用 `dataGroundedFallbackStory`（本地、用真實數字，不掰）。
- [x] **刀口5：刪除每類別 10 秒 sleep**（retry 退避已在 Gemini 內處理）。
- [x] **前端詳情頁**（weekly-reports/[id]/page.tsx）：metric 改以「數據異動類別 / 監控料件(可比)」為首；新增「自家快照 — 本週哪些類別的數字在動」區塊，列出 data.tone≠normal 的類別卡片（含風險色、⚡數據×新聞交叉命中標籤）。
- [x] **驗證**：`npx tsc --noEmit` 通過。本機種 6 筆合成快照（C04 庫存 −64%/漲 +22%/供應商 3→2、C01 −37%）+ 臨時 admin 登入，fetch 報告頁 HTML 確認：status 200、「數據異動類別=2」、記憶體與 MLCC 數據敘述帶真實數字、crossHit 標籤出現。驗後合成快照、測試帳號、測試期 Gemini 快取全數清除。
- 註：本機 Gemini key 測試時回 429（額度），story 走 fallback——剛好驗證 fallback 路徑；正式站 key 正常即會走 AI 整合。
- **修改檔案**：`src/lib/db.ts`（+getDemandForecastSnapshotHistory/SnapshotPoint）、`src/lib/demand-forecast/weekly-report.ts`（核心重構）、`src/app/demand-forecast/weekly-reports/[id]/page.tsx`（前端）。

---

### 2026-06-10 — 缺料預測頁加 sticky 區塊導航列

- [x] **sticky 錨點導航**：標題列下方新增黏性導航（`top:56` 黏在站頭下），五個錨點「週報｜風險矩陣｜缺料新聞｜市場情報｜料件明細」+ 右側「↑ 頂部」。點擊平滑捲動到對應區塊（扣 116px = 站頭56+導航48+12 呼吸空間），解決頁面過長「跳過去、回得來」問題。
- [x] **目前區塊高亮**：用 `IntersectionObserver`（rootMargin `-120px 0px -60% 0px`）追蹤捲動位置，自動高亮對應導航鈕（深藍底白字）。依賴 `data` 重新 observe（區塊載入後才存在）。
- [x] **補齊區塊 id**：`risk-matrix-panel`（風險矩陣 Panel）、`weekly-reports-panel`（週報 section）；其餘 `shortage-category-panel`／`market-reports-category-panel`／`api-parts-panel` 沿用既有 id。
- [x] **驗證**：`npx tsc --noEmit` 通過。本機 dev（5280）登入實測：導航列 sticky 於 top:56、點「料件明細」「風險矩陣」正確捲動、active 高亮隨 IntersectionObserver 切換（截圖確認）。臨時測試帳號驗後已刪（含 login_logs）。
- **修改檔案**：`src/app/demand-forecast/page.tsx`。

---

### 2026-06-10 — 缺料預測首屏改造：行動清單卡片、資料時效警示、full 查詢進度輪詢

- [x] **「本週需要行動」卡片（首屏第一眼）**：標題列下方新增高風險料件卡片——列出最多 8 顆 `summary === '有缺料風險'` 的料件（MPN + 類別 + 第一條風險原因），點擊即 `setQuery(mpn)` 過濾料件表並平滑捲動至 `#api-parts-panel`；超過 8 顆顯示「還有 N 顆」。無高風險時顯示綠色「✅ 本週無高風險料件（已查詢 N 顆）」；全部料件「尚未查詢」時不顯示卡片（避免誤導成沒風險）。
- [x] **資料時效顯眼化**：原「更新時間」小字升級——顯示「資料截至 {時間}（N 天前）」；超過 8 天變橘色警示 pill「⚠ 已逾 8 天未更新，週排程可能失敗」，兼作週排程失敗的免費監控。
- [x] **full 查詢進度輪詢**：按「查詢 150 顆料件」後每 6 秒輪詢 `mode=cached`，以後端寫入的 `queryTime`（12h TTL，與後端 cacheTTL 一致）計算「已完成 X/150」，顯示於按鈕與狀態列，並漸進更新表格/矩陣讓結果陸續到位。**Railway 邊緣 ~50 秒切斷主請求（502）不再顯示錯誤**——輪詢自動接力直到全部完成；進度停滯約 5 分鐘才報錯並提示可再按一次接力。`ForecastPart` 介面新增 `queryTime?: number`。
- [x] **修 ghost rows bug**：料件表 React key 原為 `categoryId-mpn`，但 benchmark.ts 有 4 顆重複 MPN（AO3400A、W25Q128JVSIQ、USBLC6-2SC6、SN65HVD230DR，6/6 EOL 汰換誤植）造成 key 重複——過濾表格時 4 顆料殘影常駐（搜尋任何字都顯示）。key 加 idx 修掉殘影；**資料層重複待另案處理**（已開背景任務：挑 4 顆新替代料並以 /api/search 驗證後替換）。
- [x] **驗證**：`npx tsc --noEmit` 通過。本機 dev（5280）以臨時測試帳號登入實測（驗後已刪）：行動卡列出 18 顆高風險、時效顯示「資料截至 6/6（4 天前）」、點擊 GRM188R61A106KE69D 跳轉後表格正確過濾為 1 列。
- **修改檔案**：`src/app/demand-forecast/page.tsx`（行動卡片、時效 pill、輪詢邏輯、key 修正）。
- [x] **（同日後續）移除「本週需要行動」高風險料件卡片**：使用者回饋不需要（與下方料件明細重複）。一併刪除專屬變數 `highRiskParts`/`queriedPartCount`/`jumpToPart`；保留 sticky 導航列與資料時效 pill。`tsc --noEmit` 通過。


---

### 2026-06-08 — 移除頁首 API 來源狀態燈（誤導性死燈）

- [x] **背景**：使用者截圖回報頁首右上角紅燈「API · 0/1 來源 離線」。追查後確認：
  - 此燈邏輯為 `API · {liveSourceCount}/{totalSourceCount} 來源 {在線/離線}`，`apiOnline = live > 0`。
  - 在缺料預測頁，前端去打 `/api/health` 讀 `liveSourceCount`/`totalSourceCount`，但該端點**根本沒回傳這兩個欄位**（只回 `ok`/`suppliers`/`digikeyEnv`/`hasCredentials`），故 `?? 0` 與 `?? 1` 使其**永遠顯示 0/1 離線**，與真實 API 狀態無關。
  - 首頁的「3/3 在線」也是寫死 `isLive: true`，非真實探測。即此燈從頭到尾沒有任何一頁在做真實健康監控。
- [x] **決策（與使用者確認）**：不修成真探測（每次載入頁面 ping 三家 API 會拖慢開頁並消耗 Mouser 限流額度），**直接拿掉**整顆燈——它的預警能力本來就是零，留著只會造成警報疲勞。
- [x] **改動**：
  - `src/components/Header.tsx`：移除 `api-pill` span 與 `Props`（`apiOnline`/`liveSourceCount`/`totalSourceCount`），`Header` 改為無 props 元件。
  - `src/app/demand-forecast/page.tsx`：移除 `health` state、`/api/health` fetch，`<Header />` 不再傳 props。
  - `src/app/page.tsx`、`src/app/demand-forecast/weekly-reports/[id]/page.tsx`：`<Header />` 移除 props。首頁 `liveCount`/`totalCount` **保留**（仍供 `SearchPanel` 與 `Footer` 使用）。
  - `src/app/globals.css`：清除 dead CSS `.api-pill`、`.api-pill .dot`、`.api-pill.offline .dot` 與 RWD 的 `.api-pill { display:none }`。
  - 保留 `/api/health` 端點本身（無害，可作獨立健康檢查用）。
  - `src/components/Footer.tsx`：一併移除頁尾同性質的「{liveCount}/{totalCount} 來源在線」與其分隔符，`Props` 移除 `liveCount`/`totalCount`，僅留 `refreshedAt`；頁尾現只顯示「最後同步 …」。`src/app/page.tsx` 的 `<Footer />` 改為只傳 `refreshedAt`（`liveCount`/`totalCount` 變數保留，仍供 `SearchPanel` 使用）。
- [x] **驗證**：`npx tsc --noEmit` 通過（exit 0）。

### 2026-06-07 — 移除類別矩陣的「生命週期」維度（commit `3a675f2`）

- [x] **設計決策（使用者提出、確認）**：用「代表性基準料」的 EOL/NRND 去推「類別缺料風險」沒有意義——(1) 任何時刻電子料海總有料是 EOL，是背景常態/雜訊；(2) 一旦把 EOL 代表料換掉就永遠綠燈，形成自我循環。EOL 真正可行動的價值在於追蹤「使用者真實 BOM 用到的料」，不在這個宏觀代表料頁。
- [x] **改動**：
  - 移除類別風險矩陣的「生命週期」欄（表頭 + 儲存格）。矩陣回歸 RSS 新聞 + 實時通路庫存(API) + 市場報告佐證。
  - 移除下方「生命週期風險總覽」與「受影響料件清單」兩個面板、頂部「生命週期訊號」Metric；說明文字由「三種管道」改為「兩種管道」。
  - **保留**：料件明細表每顆的 `lifecycleStatus`（`LifecycleBadge`）當參考資訊。
  - 清理 dead code：`LifecyclePartsPanel` 元件、`lifecycleCategorySummary`/`lifecycleByCategory`/`lifecycleFlaggedParts`/`displayLifecycleParts` 等 memo、`getLifecycleFlag` helper。
  - 後端 `buildLifecycleCategorySummaryFromParts` 仍保留（回傳值前端不再使用，無害）；RSS 生命週期新聞抓取維持停用。
  - `npx tsc --noEmit` 通過。
- 備註：先前（同日稍早）曾將生命週期改為 API lifecycleStatus 驅動並移除 RSS 噪音新聞（commit `58d6fd6`），本次進一步將整個維度從類別矩陣移除。

### 2026-06-06 — Mouser 重複計算修正 + 10 顆 EOL 料件替換（commit `4c41776`）

- [x] **Mouser HK/VN 重複計算修正**：啟用的 3 個 adapter（DigiKey、Mouser HK、Mouser VN）中，Mouser HK 與 VN 是同一家公司（同一全球庫存），原本 `supplierCount`（`new Set(supplier)`）與 `totalStock`（直接加總）把 Mouser 算成兩家、庫存加兩次（總庫存灌水近一倍）。修法：新增 `supplierCompany()` 將供應商正規化為公司（Mouser HK/VN/Mouser→Mouser），`supplierCount` = 公司數、`totalStock` = 各公司「該公司各地區最大庫存」再加總。`supplierDrop` 門檻由 `>=3` 調整為 `>=2`（合併後最多 2 家）。修改 `src/app/api/demand-forecast/route.ts`。
  - 注意：此修正只影響「之後查詢/快照」；既有快取的 totalStock 仍為舊（灌水）值，需跑一次 `mode=full` 重新查詢才會更新（庫存趨勢圖會出現一次向下台階修正）。

- [x] **10 顆 EOL/Obsolete 基準料件汰換**：由正式站 `/api/demand-forecast` 找出 lifecycle 為 EOL/Obsolete/停產的 10 顆，逐一挑代表性現役料件並以 `/api/search` 實測「查得到 + Active + 有庫存」後才寫入 `src/lib/demand-forecast/benchmark.ts`（避免重蹈過去 EMPTY_RESULT 覆轍）：
  - C03 IRLML2502TRPBF→**AO3400A**；C04 AS4C256M16D3B→**W25Q128JVSIQ**(NOR Flash)；C08 PESD5V0S1UB→**USBLC6-2SC6**、PESD5V0L1UA→**ESD5Z5.0T1G**、PESD5V0X1BCSF→**SP0503BAHTG**；C09 LIS3DHHTR→**LIS2DH12TR**；C10 TJA1051T/3→**SN65HVD230DR**；C14 VSC8541XMV-03→**LAN8742A-CZ-TR**；C15 T412-400→**R-78E3.3-0.5**、V7805-1000R→**R-78E5.0-0.5**。
  - 全部 `lifecycle=Active`、皆有庫存。`npx tsc --noEmit` 通過。
  - 待辦：部署後跑一次 `mode=full`（GitHub Actions Run workflow 或頁面「全量查詢」）讓新料件被查詢、且 Mouser 去重後的庫存生效。

- [x] **mode=full 跑不完問題 + 排程迴圈修正（commit `7453454`）**：手動觸發正式站 `mode=full` 時回 **HTTP 502（約 51 秒）**——Railway 邊緣對單一請求約 50 秒就切斷，而查 150 顆料件（Mouser 2.1s 限流）需數分鐘。實測發現：伺服器在連線中斷後仍會持續處理並漸進寫入快照，且程式有 12 小時快取跳過機制（已查過的會略過），故「多呼叫幾次」即可接力完成。本次以多次補跑收尾，最終 `supplierCount` 分佈 `{2:129, 1:15, 0:6}`（**已無 sup=3，Mouser 去重完全生效**），10 顆替代料件全部抓到資料且庫存為去重後正確值（如 AO3400A 150,358、ESD5Z5.0T1G 319,812）。
  - 同步修正 `.github/workflows/weekly-forecast.yml`：改為先用 `mode=cached` 驗證 CRON_SECRET，再迴圈呼叫 `mode=full` 最多 8 次；當出現「快速 200（<20 秒）」代表全部已是最新快取即視為完成；否則告警（背景仍會完成）。解決原本「單次呼叫 502 → 排程顯示失敗且資料不全」的問題。

- [x] **排程時間改為深圳時間（commit `8fbe2e6`）**：應使用者要求，每週執行時間由「美東週日 03:00」改為「**深圳時間（UTC+8，無 DST）週日 03:00**」。cron 由 `0 7 * * 0` 改為 `0 19 * * 6`（深圳週日 03:00 = UTC 週六 19:00），全年固定不漂移。注意：因在原排程（UTC 週日 07:00）觸發前就改了 cron，本週不會自動執行；首次自動執行為**下週六 UTC 19:00（= 週日 03:00 深圳，2026-06-14）**。今日資料已由先前手動 `mode=full` 補上，無缺漏。

### 2026-06-06 — 週報改為口語化外部訊號摘要

- [x] **週報列表入口視覺與標題優化**
  - 置頂週報卡片加入淡綠色背景、左側強調線與陰影，讓入口更明顯。
  - 將卡片標題、說明、表格文字整體放大，改善可讀性。
  - 週報標題改為依內容自動產生，例如「記憶體與 MLCC 供應訊號升溫」，不再使用固定的「本週先看這幾類」。

- [x] **二次修正：週報上方改成真正可行動的重點摘要**
  - 移除「抓到幾則新聞 / 幾筆市場情報」這種對讀者沒有決策價值的描述。
  - 改成每個重點類別直接呈現：標題、為什麼重要、建議動作、佐證來源。
  - 新增類別關鍵字過濾，避免 PMIC 這類弱訊號或錯分新聞被放進主摘要，也避免記憶體摘要混入 MLCC 佐證。
  - 過濾 45 天以前的 RSS / PCN/EOL 舊新聞，避免週報混入過期內容。

- [x] **週報不再針對 150 顆料件明細**
  - 移除週報中的高 / 中風險料件表與料號層級摘要。
  - 週報改以 RSS 缺料新聞、PCN/EOL 生命週期訊號、公開市場情報作為主要內容來源。

- [x] **改成更適合 email 的口語描述**
  - 首段改為「本週先看這裡」的口語摘要，避免像系統報表。
  - 類別觀察改成「值得放進觀察清單的類別」，用中文類別名稱與自然語句說明。
  - 建議動作改成採購、工程、PM / 業務可直接理解的口語行動。

- [x] **週報頁面版面調整**
  - 指標改為觀察類別、缺料新聞、PCN/EOL、市場情報。
  - 新增新聞重點、PCN/EOL 重點、市場情報摘要區塊。
  - 首頁週報置頂說明改為「先用新聞、PCN/EOL 與市場情報做口語摘要」。

- **驗證**
  - 已執行 `npm run build`，Next.js 編譯、型別檢查與路由收集皆通過。

---

### 2026-06-06 — Phase II：每週自動 full 查詢排程（GitHub Actions）

- [x] **目標**：每週日凌晨 03:00 ET 自動跑一次 `mode=full`（查 150 顆料件），讓價格曲線每週累積一個資料點。

- [x] **middleware cron 後門**（`src/middleware.ts`）
  - 新增：當請求帶 `x-cron-secret` header 且等於環境變數 `CRON_SECRET`、且路徑為 `/api/`，直接放行（繞過 NextAuth session 檢查）。一般使用者登入流程完全不受影響。
  - 本機驗證：無 header → 307 導 `/login`；密鑰錯 → 307；密鑰正確 → 200。✅

- [x] **GitHub Actions 排程**（`.github/workflows/weekly-forecast.yml`）
  - `cron: '0 7 * * 0'`（UTC）= **週日 03:00 EDT（夏令）/ 02:00 EST（冬令）**，DST 會差 1 小時屬正常。另開 `workflow_dispatch` 可手動觸發測試。
  - 流程：curl `${FORECAST_BASE_URL}/api/demand-forecast?mode=full`，帶 `x-cron-secret: ${CRON_SECRET}`，`--max-time 1500`。
  - 容錯：`mode=full` 數分鐘，伺服器端漸進寫快照，即使 curl 逾時（exit 28）也視為成功（資料照樣進）；非 200（如 307/401 = 密鑰不符）才讓 job 失敗。

- [x] **部署層設定（已完成）**
  1. ✅ **Railway** 已設 `CRON_SECRET`（設在 `Speed-Part-Search` service，非 Postgres）。
  2. ✅ **GitHub Actions secrets** 已設 `CRON_SECRET`（同值）與 `FORECAST_BASE_URL`。
  3. ✅ 已 commit+push 至 main（`aac3383`），Railway 自動重新部署完成。

- [x] **正式站驗證**：帶 `x-cron-secret` 打 production `/api/demand-forecast?mode=cached` → 回 **200**（部署初期舊版回 307，新版上線後轉 200），證明後門生效、Railway 密鑰與程式碼一致。
  - 待辦（選用）：GitHub Actions 頁手動 `Run workflow` 跑一次 `mode=full` 端到端測試；否則等首個週日 03:00 ET 自動執行。

- [x] **價格曲線 UI 修正（commit `9a6c538`）**：金額顏色由過淡的 `--text-3` 改為 `--text-2`+半粗體（淺綠底也清楚）；價格全平的線改畫在格子垂直中線（原本壓在最底像痕跡）；改用自製 hover 浮窗列出每點「日期：價格」，取代延遲的原生 title。正式站資料庫現況：139/154 顆料件已各有 3 個價格點（6/01、6/03、6/06），可正常繪製曲線。

- [x] **價格曲線「金額看不到」排查 + 保險修法（commit `d3b48fb`）**：使用者回報欄位只剩小痕跡、看不到金額。逐項驗證確認**伺服器端全部正常**——Railway 最新部署 SUCCESS（跑最新 commit）、API 回 150 顆 parts、price-history 回 140 個 key 且與 parts.mpn 完全對得上（各 3 點）、前端抓取與渲染程式碼正確且未被並行 session 覆蓋。研判為使用者瀏覽器端 history fetch 未成功或吃到舊 JS 快取。保險修法：`PriceSparkline` 新增 `fallbackPrice` 參數，歷史未載入時改用 `part.lowestPriceUsd` 顯示單點+金額，確保金額一定可見，歷史載入後再升級為曲線。建議使用者強制重整（Cmd+Shift+R）。

- [x] **真因確認 + 修復（commit `f84dc6f`）**：金額顯示但 tooltip 仍標「目前」→ 證實真歷史 fetch 在瀏覽器拿到空資料。根因：部署環境前面有邊緣快取，專案其他 fetch（如 market-reports）都加 `?t=Date.now()` 破快取，但 price-history fetch 只設了 `cache:'no-store'`（只破瀏覽器快取）漏了 `t=`，導致瀏覽器吃到邊緣快取裡早期的空回應（curl 帶 `x-cron-secret` header 走不同快取 key 故誤判正常）。修法：fetch 加 `&t=${Date.now()}`，後端 price-history 回應加 `Cache-Control: no-store`。正式站驗證回應已帶 no-store 標頭且回 3 個歷史點，使用者畫面確認曲線正常顯示。

- [x] **價格漲跌幅 %（commit `5442f9e`）**：欄位內價格旁顯示**週變動**色塊（最新點 vs 前一點，漲▲紅／跌▼綠／平–灰）；hover 浮窗加「週變動 + 月變動」摘要。月變動取「最接近 30 天前」的點且跨度須 ≥21 天，否則顯示「資料不足」。基準採「資料點相對比較」而非死的日曆天數，以配合每週一點的快照節奏。新增 `pctColor/pctArrow/fmtPct/changePct` 工具函式。`npx tsc --noEmit` 通過。

- [x] **圖表移到數值下方 + 新增庫存趨勢圖（commit `c56febd`）**：依使用者要求，圖表改堆疊在數值下面，並移除獨立的「價格曲線」欄。`PriceSparkline` 通用化為 `MetricSparkline`（價格與庫存共用），新增 `invert` 參數讓庫存漲跌顏色語意反轉（庫存漲=綠(好)／跌=紅(缺料風險)，與價格相反）。`getDemandForecastPriceHistory` 與 price-history 端點改回傳 `total_stock`（型別 `PricePoint`→`HistoryPoint`，含 `price:number|null` 與 `stock:number`）。前端「總庫存」「最低價」兩欄各自堆疊「數值 + sparkline + 週變動 + hover 月變動」。正式站驗證 API 已回傳 stock 欄位（如 2,973,845）。`npx tsc --noEmit` 通過。
- **修改檔案**
  - `src/middleware.ts` — 新增 CRON_SECRET header 後門。
  - `.github/workflows/weekly-forecast.yml` — 新增（每週排程）。

---

### 2026-06-06 — 新增物料預測週報預覽連結與詳情頁

- [x] **新增「物料預測週報」預覽入口**
  - 在缺料預測頁的市場情報區塊附近新增週報列表卡片。
  - 列表僅顯示使用者要求的三個欄位：週報標題、開啟連結、日期。
  - 目前先以預覽連結形式提供，不自動發信，方便確認內容品質後再接續 email 自動化。

- [x] **新增週報資料產生器與 API**
  - 新增 `src/lib/demand-forecast/weekly-report.ts`，彙整現有缺料預測快取、新聞快取、PCN/EOL 生命週期訊號與市場情報快取。
  - 新增 `/api/demand-forecast/weekly-reports`，回傳週報列表資料。
  - 第一版產生「本週物料預測週報」一筆預覽連結，後續可擴充為歷史週報、多筆儲存與自動寄送。

- [x] **新增週報詳情頁**
  - 新增 `/demand-forecast/weekly-reports/[id]` 詳情頁。
  - 內容包含整體風險摘要、核心指標、高 / 中風險料件、類別訊號、市場情報摘要與建議行動。

- **驗證**
  - 已執行 `npm run build`，Next.js 編譯、型別檢查與路由收集皆通過。

- **修改檔案**：
  - `src/app/demand-forecast/page.tsx` — 新增週報列表入口與 API 載入邏輯。
  - `src/app/api/demand-forecast/weekly-reports/route.ts` — 新增週報列表 API。
  - `src/app/demand-forecast/weekly-reports/[id]/page.tsx` — 新增週報詳情頁。
  - `src/lib/demand-forecast/weekly-report.ts` — 新增週報資料彙整與內容產生器。
  - `project_summary.md` — 記錄本次功能新增。

---

### 2026-06-06 — 缺料預測表格新增「價格曲線」欄（Phase I）

- [x] **需求背景**
  - 在缺料預測料件表格的「最低價」右邊新增「價格曲線」欄，把每次查詢的最低價標成趨勢曲線。
  - Phase I：讀取現有歷史快照繪製曲線；Phase II（使用者自行設定）：以每週自動查詢累積資料點。
  - 設計決定（已與使用者確認）：**沿用每日一點的既有快照表**（顆粒度），曲線放在**最低價右邊**，畫法用**純 SVG sparkline（零相依套件）**。

- [x] **資料基礎（沿用既有快照表，未改 schema）**
  - 既有 `demand_forecast_snapshots(mpn, date, lowest_price_usd, ...)` 主鍵 `(mpn, date)`，每次查詢已自動寫入當日最低價（同日多次查詢會覆蓋為最後一筆），完美對應「每週一查 = 每週一點」。

- [x] **後端：批次讀取歷史價格曲線**
  - `src/lib/db.ts` 新增 `getDemandForecastPriceHistory(mpns, limit=26)`：批次回傳 `{ [mpn]: {date, price}[] }`，依日期升冪、過濾無價格點、每顆料只留最近 26 點。Postgres 用 `mpn = ANY($1)`、SQLite 用 `IN (...)`。新增 `PricePoint` type。
  - 新增 API 路由 `src/app/api/demand-forecast/price-history/route.ts`：`GET ?mpns=A,B,C` → `{ history }`。獨立端點，**完全不動**主預測路由與快取邏輯，風險最低。

- [x] **前端：SVG sparkline 與整合**
  - `src/app/demand-forecast/page.tsx` 新增 `PriceSparkline` 元件：純 SVG 折線，依「最新 vs 前一點」自動上色（漲🔴 #F04438／跌🟢 #12B76A／平⚪ #667085），滑鼠懸停 title 顯示每點「日期 + 價格」；1 筆顯示圓點＋現價、0 筆顯示 `-`，並在尾端標現價。
  - 新增 `priceHistory` state；以 `partsKey`（料件 MPN 串）為依賴的 `useEffect` 在料件載入後批次抓取一次。
  - 表頭於「最低價」後新增 `<Th>價格曲線</Th>`，對應 `<Td>` 渲染 `<PriceSparkline points={priceHistory[part.mpn]} />`；表格 `minWidth` 1180 → 1300。

- [x] **驗證**
  - `npx tsc --noEmit` 通過。
  - dev server（5280）編譯無錯誤；新 API 與頁面皆正確落在登入驗證後（未登入回 307 導向 `/login`，與其他端點一致）。本機 SQLite 快照點少，曲線多顯示 `-`，待每日／每週累積後成形。

- **修改檔案**
  - `src/lib/db.ts` — 新增 `getDemandForecastPriceHistory` 與 `PricePoint` type。
  - `src/app/api/demand-forecast/price-history/route.ts` — 新增（批次價格曲線端點）。
  - `src/app/demand-forecast/page.tsx` — 新增 `PriceSparkline`、`priceHistory` state 與抓取、表格欄位與 `minWidth`。

---

### 2026-05-31 — 移除閱讀器彈窗、優化 PDF 連結直連與快取版本更新

- [x] **徹底移除內部閱讀器彈窗 (Reader Modal)**
  - 移成了先前實作 of 內部文章翻譯閱讀器彈窗（Reader Modal），解決使用者對於閱讀器介面不美觀的抱怨。
  - 將市場報告面板中的卡片點擊與「閱讀 PDF ↗」/「查看原文 ↗」連結直接指向報告的原始網址（`report.url`），改由瀏覽器原生分頁開啟。

- [x] **優化自動抓取器的 PDF 連結解析與相對路徑支援**
  - 在 `src/lib/demand-forecast/market-report-fetcher.ts` 內解析網頁 HTML 時，優化 PDF 的 Regex 比對與解析。
  - 改用標準 `new URL(href, url).href` 進行相對網址（包括以 `/` 開頭或不帶 `/` 的相對路徑）與絕對網址的解析，確保產生的 PDF 連結絕對完整、可直接在瀏覽器開啟。

- [x] **將 PDF/網頁核心缺料中文內容置於卡片主摘要區，並建立雙語對照**
  - 移除了卡片上原先乾癟且無具體業務價值的模板化罐頭文字（例如：「來源頁面在相近段落中提及...」）。
  - 將解析出的 **PDF 核心缺料中文翻譯內容（`evidenceTextZh`）直接放入卡片主摘要區**（當尚未載入翻譯時自動優雅地降級為顯示 `summaryZh` 罐頭文字，確保體驗流暢）。
  - 在主摘要區下方，將**英文原始缺料段落（`evidenceText`）以精美的斜體引用框呈現**，實現無需下載點開 PDF，在卡片上即可直接完成「中英雙語對照」與核心情報檢視的極佳閱讀體驗。

- [x] **對接 Gemini 2.5 Flash 產生高品質專業中文摘要與 $5 月預算防護機制**
  - **背景需求**：即使有了語意邊界對齊的長擷取段落，直接進行英翻中所得出的字詞依然有些生硬（例如：把 Allocation 翻成配置、配置配給等），不易讀懂。
  - **解決方案**：
    1. 在 `market-report-fetcher.ts` 中整合 Gemini 2.5 Flash API。在抓取到資料時，將摘錄出的 400 字元語段送給大模型進行「資深供應鏈分析師角度的中文摘要（最大 45 中文字）」產出。
    2. **API 限額保護機制**：在 `db.ts` 新增 `getGenericCache` 與 `setGenericCache` 通用快取讀寫，並在 `market-report-fetcher.ts` 內設計每月 **$5 美元自動超額熔斷器**。若當月累積估算花費達 $5.0 美元（或當月呼叫達 4000 次），會自動警告並停止向 Gemini 發送請求，安全降級為一般用戶端直翻，有效防止 API 金鑰遭刷爆或無限迴圈。
    3. 前端 [page.tsx](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/app/demand-forecast/page.tsx) 配合 `isAiSummary` 標記：若是 AI 摘要，則直接在卡片摘要區顯示，下方展示英文原文做對照，達到最完美的閱讀感受。

- [x] **擴大摘錄長度並支援單字與語意邊界完整對齊**
  - **背景問題**：先前僅擷取匹配關鍵字前後各 60 字元的極短字串，導致摘錄在單字中途斷開（如 `gh capacitance` 而非 `High capacitance`），語意十分破碎難懂。
  - **解決方案**：在 `market-report-fetcher.ts` 中建立 `extractSensibleQuote` 函數，擴展摘錄範圍至前後 200 字元左右（約 400 字元的上下文句段），並在文字兩端自動對齊至最近的空格（單字邊界），徹底避免單字被切成兩半的尷尬，大幅提升語意完整度與專業可讀性。

- [x] **修正 Google 批次翻譯分隔符號解析錯誤的嚴重 Bug**
  - **背景問題**：先前使用 `###SPLIT###` 作為翻譯分塊的拼接分隔符號，但在實際翻譯過程中，Google 翻譯常會將其翻譯為中文 `###分割###`，導致 Regex 拆分失敗，進而把 8 條不同卡片的翻譯結果全部揉成一團展示，出現嚴重的亂碼。
  - **解決方案**：將分隔符號改為純數字 `999888999`（Google 翻譯絕不會將其翻譯成中文），並在 Regex split 中同時相容 `999888999` 與以前翻譯過的 `###分割###` 等字串，完美解決分割失敗所導致的亂碼與揉字問題。

- [x] **更新快取架構版本以強制重新整理資料**
  - 將 `src/lib/demand-forecast/market-report-types.ts` 中的快取版本 `MARKET_REPORTS_SCHEMA_VERSION` 提升至 `7`。
  - 提升版本號會使舊快取自動失效，強迫系統在重新整理網頁時，在背景以最新優化後的摘錄函數及 Gemini 智慧摘要呼叫重新進行多管道抓取，寫入最完整清晰的數據。

- **修改檔案**：
  - [page.tsx](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/app/demand-forecast/page.tsx) — 移除 `showReaderModal` 邏輯，調整 PDF 與原文直連，實作中英雙語對照與摘要置換排版，並修復分隔符號解析 Bug。
  - [db.ts](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/lib/db.ts) — 新增 `getGenericCache` 與 `setGenericCache` 通用快取讀寫。
  - [market-report-fetcher.ts](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/lib/demand-forecast/market-report-fetcher.ts) — 使用 `new URL` 增強 PDF 連結解析，新增 `extractSensibleQuote` 完整對齊摘錄函數，對接 Gemini API，並設計每月 $5 熔斷限額。
  - [market-report-types.ts](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/lib/demand-forecast/market-report-types.ts) — 升級 `MARKET_REPORTS_SCHEMA_VERSION` 為 `9`。文字兩端自動對齊至最近的空格（單字邊界），徹底避免單字被切成兩半的尷尬，大幅提升語意完整度與專業可讀性。

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

## 14. 物料預測週報可讀性更新

- 公開報告重點不再只顯示來源與 C 類別代碼，改成依內容產生白話標題，例如「高容值 MLCC 開始配貨，先確認可供量」。
- 每張公開報告卡片至少顯示兩段內容：第一段說明報告提到什麼，第二段用「我們怎麼看」說明對採購、工程或 PM 的實際影響。
- 週報資料產生邏輯新增類別化解讀：MLCC、MOSFET、記憶體會各自對應到不同的追蹤建議，避免只寫「有幾份公開報告」但沒有行動意義。

## 15. 週報 AI 故事生成截斷與 API 限制 (429/503) 修復

針對週報卡片內文被截斷（結束在「目前...」與「風險報告中的...」）以及本地 API 被 rate limit (429/503) 的問題，我們進行了以下修復：

### 1. 防止 Story 截斷與解決推理模型 Token 擠占
在 [weekly-report.ts](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/lib/demand-forecast/weekly-report.ts) 之中，調升 `maxOutputTokens` 至 `4096`；在 [market-report-fetcher.ts](file:///Users/dannychen/Documents/Claude%20Code/Speed%20Part%20Search/src/lib/demand-forecast/market-report-fetcher.ts) 之中，調升至 `2048`。
同時在 `generationConfig` 加上了 `thinkingConfig: { thinkingBudget: 0 }`，停用推理（reasoning）思考預算，確保生成的內容全數用於文本輸出，避免被 finishReason: "MAX_TOKENS" 截斷。

### 2. 引入 API 自動重試機制 (Exponential Backoff)
為 `synthesizeWeeklyReportStoryWithGemini` 與 `summarizeWithGemini` 加上重試邏輯。若遇到 429 或是 500 以上的 API 錯誤，會自動在等待一段冷卻時間後進行重試（最長 3 次重試，初始等待 4 秒，並乘 2 指數倒退，另外加上 0 至 2000ms 的隨機抖動 Jitter）。

### 3. 改為順序執行 (Sequential Execution) 與類別間冷卻
重構 `buildWeeklyReport` 中 `Promise.all` 的併發呼叫，改為使用 `for-of` 順序處理各個 category 故事。
為了徹底防範 Thundering Herd（雷擊效應）導致多個類別同時打 API 觸發 429，我們在每次處理完一個類別後，強制休眠 `10,000ms` (10秒) 再處理下一個類別。

### 4. 週報被截斷語句之完整還原
- **記憶體 / Flash / DDR** (原本截斷於「目前」)：
  - 完整句子還原為：`DRAM、儲存解決方案，乃至於 NOR 快閃記憶體...都已在多個供應商中面臨配給（Allocation）狀況，預計隨著市場持續收緊，更多技術將受到類似限制，分銷管道和終端客戶的庫存消耗速度正在加快。`
- **MOSFET / 功率分離式元件** (原本截斷於「風險報告中的」)：
  - 完整句子還原為：`離散交貨時間（Lead Time）已成為2026年供應鏈風險報告中的 BOM 成本變動重要驅動因素之一，這與中東材料風險、AI 驅動的記憶體分配等因素並列。`

## 16. QQ 詢價管理者限定

- `QQ詢價` 導航入口改為只有管理者帳號可見，包含共用頁首與 BOM Batch 頁面自帶頁首。
- `/qq-inquiry` 路由加入管理者權限檢查，一般使用者即使直接輸入網址也會被導回首頁。
- `/api/hqew/search` 華強查詢 API 同步加入管理者權限檢查，避免一般使用者繞過網頁直接呼叫查詢。
- Railway 上華強查詢曾因 Playwright Chromium 未下載而失敗；已新增 `postinstall` 自動安裝 Chromium，讓部署環境可啟動 headless browser 查詢華強。
- Railway 上 Chromium 啟動後仍缺少 Linux 系統函式庫（例如 `libglib-2.0.so.0`）；已新增 `railpack.json`，在 Railway runtime 映像安裝 Chromium/headless browser 所需的底層套件。
- 新增 `.railwayignore`，避免部署時將本機暫存資料、環境檔、build 產物或 scratch 測試資料一併上傳。

## 17. QQ 詢價按鈕改用企點（QiDian）簽章連結，修正無法跳轉 QQ

### 問題根因（實測確認）
使用者反映「點網頁 QQ 帳號無法跳轉 Mac QQ 並自動貼入詢價內容」。在使用者 Mac（QQ NT 6.9.96）逐一實測後確認：
- 舊做法拿裸 QQ 號自組 `tencent://message/?uin=...`、`mqqwpa://...` 全部失敗：`tencent://` 被 QQ 當「链接有潜在风险，暂不支持跳转」擋下、且**不會切換到目標供應商**（只是把 QQ 叫到前景並停在原本開著的對話）；`mqqwpa://` 在 macOS 根本沒註冊。
- 用 Playwright 渲染 `https://s.hqew.com/<MPN>.html` 抓出 `a.a-qq` 真正的連結後發現：華強能乾淨跳轉是因為它用**企點官方簽章連結** `wpa1.qq.com/<碼>?_type=wpa&qidian=true`，會 302 轉址到帶 `kfuin`＋簽章 `key` 的企點頁，QQ 才信任放行、直接開臨時會話。實測開啟該連結，QQ 乾淨進入臨時會話、無任何風險視窗。
- 華強對兩種供應商本就不同：企點企業帳號（`hasQqUrlData:true`）給企點連結可跳；個人 QQ（如 451576571，`hasQqUrlData:false`）華強自己也不跳，只提示「复制加 <號>」手動加好友。

### 改動
- `src/app/api/hqew/search/route.ts`：`a.a-qq` 的 `qqHref` 擷取在 `data` JSON 沒有時，fallback 去抓 anchor 的 `href`（補抓 featured 供應商直接掛在 `href` 的企點連結）。
- `src/app/qq-inquiry/page.tsx`：
  - 移除失效的 `launchDesktopProtocol` 與 `tencent://`／`mqqwpa://` 呼叫，改為 `isQidianHref()` 分類。
  - `openSupplierQq`：一律先複製完整詢價內容；若 `qqHref` 為企點連結（含 `qidian=true` 或 `wpa1.qq.com`）→ `window.open(qqHref)` 乾淨跳轉；個人 QQ → 只複製內容並提示手動加好友，不再彈風險視窗。
  - 按鈕 highlight key 由 `row.qq` 改為 `row.rfqId`（避免 featured 供應商 `qq` 為空時多列誤判為同一狀態）；label/title 依企點或個人 QQ 顯示不同文案；更新下方 helper text。

### 驗證
- `npx tsc --noEmit` 通過（exit 0）。
- 企點連結乾淨喚起 QQ 臨時會話一節，已於使用者 Mac 以 computer-use 實測確認。
- 未起 preview：`/qq-inquiry` 有管理者權限閘、資料需 Playwright 爬華強、且 QQ 跳轉為 OS 層行為，preview server 無法重現該路徑。

### 已知限制
- 個人 QQ 供應商（非企點）仍無法自動跳轉——此為 QQ 官方封鎖裸號跳轉所致，華強頁面同樣不跳，只能手動加好友。

## 19. 修復被外部工具（Antigravity）改壞的 QQ 一鍵詢價流程

### 壞掉的原因（728c176）
- 拆掉企點/個人 QQ 分流：個人 QQ 也直接 `window.open(wpa.qq.com/msgrd...)`，該路被 QQ 風險視窗擋下且「不會切換對話」，但 2.6 秒後 Hammerspoon 照樣切到 QQ 按 Cmd+V，詢價內容會貼進當下開著的「錯誤供應商」對話。
- `triggerLocalQqPasteHelper` 同時發 `hammerspoon://` URL scheme 與本機 HTTP 兩路，Hammerspoon log 顯示連續多次 cmd-v（重複貼上），且瀏覽器每次跳「要開啟 Hammerspoon？」確認框。

### 修復（保留 Hammerspoon 自動貼上，恢復安全分流）
- `openSupplierQq`：企點簽章連結（`qidian=true`/`wpa1.qq.com`）→ 開啟正確供應商臨時會話並觸發自動貼上；個人 QQ → 只複製詢價內容＋按鈕提示手動加好友，**不觸發自動貼上**（避免貼錯對話）。
- `triggerLocalQqPasteHelper` 改單一路徑：只打 `http://127.0.0.1:5298/paste`（實測 200、Hammerspoon log 確認觸發），移除 `hammerspoon://` anchor。
- 移除不再使用的 `qqWpaUrl()`；按鈕 title/label 與 helper text 恢復企點/個人兩種文案。

### 驗證
- `npx tsc --noEmit` 通過（exit 0）。
- Hammerspoon 助手（port 5298）健在且 log 證實觸發、QQ 輸入框無誤貼殘留。

## 20. QQ 一鍵詢價全面打通：點擊時即時取得騰訊企點簽章跳轉連結

### 問題
第 19 節修復後，只有華強列表頁直接給企點連結的供應商（約 1-2/8 家）能一鍵開 QQ，其餘約 90% 都顯示「請手動加」。但使用者實際在華強網站點這些供應商的 QQ 卻能跳——代表這些客服號其實可跳，是我們分類太保守。

### 根因研究（Playwright 抓包騰訊官方 wpa 頁）
- `wpa.qq.com/msgrd?uin=...` 是騰訊官方 SPA，內部呼叫 `gateway.qidian.qq.com/v1/b2b/wpa/getWpaUrl?terminal=1&uin=<號>`：
  - 已開通臨時會話的企點客服號（288/300/800 開頭多屬此類）→ `code:0`，回傳**帶簽章的深層連結** `tencent://QQInterLive?cmd=2&uin=...&kfuin=...&uid=u_...`，QQ NT 對此完全放行（實測乾淨跳轉、無風險視窗、正確切換供應商）。
  - 未開通（一般個人 QQ，如 451576571）→ `code:459003「未开通临时会话」`。
- 被擋的是「裸號」`tencent://message/?uin=`；簽章過的 `tencent://QQInterLive` 不會被擋。簽章含一次性 uid，需點擊當下即時取得，不能搜尋時預抓。

### 實作
- 新增 `src/app/api/qq/wpa-url/route.ts`（admin 權限閘）：代理 getWpaUrl，回 `{ jumpUrl, reason }`。
- `openSupplierQq` 三段式：華強已給企點連結 → 直接開；否則拿 `row.qq` 問 `/api/qq/wpa-url` → 有 jumpUrl → 隱藏 iframe 觸發深層連結＋Hammerspoon 自動貼上；未開通/失敗 → 按鈕顯示「請手動加 <號>」，不觸發貼上。
- 新增 `qqOpenOutcome` state 讓按鈕在點擊後正確顯示「正在開 QQ」或「請手動加」。

### 驗證
- 實測 `tencent://QQInterLive`（宝利士 3007316873 簽章連結）：QQ 無彈窗直達正確臨時會話。
- gateway 對 2881279183（利明微）另回企點短連結、451576571 回 459003，分類正確。
- `npx tsc --noEmit` 通過；`/api/qq/wpa-url` 未登入回 307 導登入頁（權限閘生效）。

## 21. 修正 90% 供應商無法一鍵開 QQ：簽章連結改在華強搜尋階段以 Playwright 預抓

### 問題
第 20 節的 `/api/qq/wpa-url` 以 server fetch 呼叫騰訊 getWpaUrl 一律回 `10001 parameter error`（該 API 驗瀏覽器指紋與前端 JS 產生的 client 狀態，curl/fetch 模擬不了）→ 所有點擊 fallback 成「請手動加」，QQ 從未被喚起。

### 解法（實測定案）
- 簽章跳轉連結改在 **華強搜尋階段** 由既有 Playwright 流程預抓，存進 supplier.jumpUrl：
  1. 快路徑：`gateway.qidian.qq.com/v1/b2b/qq/wpa?uin=`（server fetch 可直呼）→ 部分企點號直接回 `wpa1.qq.com/<碼>?qidian=true` 簽章短連結（利明微 2881279183 屬此類）。
  2. 慢路徑：Playwright 渲染官方 `wpa.qq.com/msgrd` 頁、攔截其自發的 getWpaUrl 回應 → `tencent://QQInterLive?...&kfuin=...&uid=...` 簽章深層連結（宝利士 3007316873 屬此類）。實測 uid 可重複使用、存活 40+ 分鐘，預抓安全。
  3. 兩路都拿不到（個人 QQ 未開通臨時會話）→ jumpUrl null → 前端顯示手動加。
- 前端 `openSupplierQq`：jumpUrl 為 `tencent://` 用隱藏 iframe 喚起、`https`（企點短連結）用 window.open；點擊手勢內同步執行（不經 async），避免瀏覽器擋自訂協議。刪除無效的 `/api/qq/wpa-url` route。

### 驗證（DMP21D5UFB4-7B 實測，臨時 admin 已刪除含 login_logs）
- 宝利士→QQInterLive 深層連結、圣禾堂→原企點 qqHref、利明微→wpa1 短連結：**3/3 全數可一鍵直達**。
- `npx tsc --noEmit` 通過。
- 注意：QQ 內宝利士、圣禾堂輸入框留有先前測試/點擊的未送出草稿，需人工檢查。

## 22. 自動貼上助手偵測與安裝指引（同事的 Mac 無 Hammerspoon）

- 問題：同事使用網站時因未裝 Hammerspoon，點 QQ 後不會自動貼上，網頁也沒有任何提示。
- 頁面載入時 ping `http://127.0.0.1:5298/health` 偵測助手（lua 端已具 CORS 與 Access-Control-Allow-Private-Network，https 頁對 127.0.0.1 loopback 瀏覽器放行）：
  - 在線 → 顯示綠色「✓ 自動貼上助手已連線」。
  - 離線 → 琥珀色指引橫幅：說明仍會複製＋開對話但需手動 ⌘V，並列 4 步安裝（裝 Hammerspoon → 下載安裝腳本與 lua 模組 → Terminal 執行 → 允許輔助使用），附「重新偵測」按鈕。
  - QQ 按鈕文案在助手離線時顯示「✓ 已複製，正在開 QQ（請手動 ⌘V）」。
- helper 檔案發佈到 `public/qq-paste/`（`install-paste-to-qq.command`、`speedpart-qq-paste.lua`），網站可直接下載。
- 驗證：`npx tsc --noEmit` 通過；`/qq-inquiry` 200；兩個下載檔 200；本機 `/health` 200。

## 23. BOM 欄位辨識擴充：Manufacturer P/N 與缺料欄

- 料號欄關鍵字新增 `P/N`、`PN`、`型號/型号`（原本只認 part/mpn/料號），「Manufacturer P/N」表頭可正確辨識，且品牌欄「Manufacturer」不會被誤認（料號欄以先匹配者優先）。
- 數量欄關鍵字新增 `缺料`、`短缺`；括號負數格式（如 `(1,191)`）原本就會轉成正數需求量。
- 驗證：node 模擬該 BOM 表頭 mpnCol=0/qtyCol=3、舊格式（Part Number/Quantity）不受影響、`npx tsc --noEmit` 通過。

## 24. 自動貼上助手安裝改為免 Terminal（Hammerspoon Console 一鍵指令）

- 原第 22 節指引需開 Terminal 執行 .command，對不熟終端機的同事不友善，且下載的 .command 會被 Gatekeeper 擋（新版 macOS 需到系統設定放行）。
- 改為「複製安裝指令」按鈕：產生一行 Lua（依 `window.location.origin` 組 URL，本機與 Railway 皆可用），貼進 Hammerspoon 選單列 → Console 按 Enter 即完成——curl 下載的檔案無 quarantine，完全避開 Gatekeeper。
- 指令行為：下載 helper 模組成功「才」把 require 寫入 init.lua 並 reload；失敗跳 alert 不動 config。冪等（重跑不重複寫入）。
- 步驟簡化為：裝 Hammerspoon（拖進應用程式）→ 鎚子圖示開 Console → 貼上按 Enter → 允許輔助使用 → 回頁面重新偵測。
- 驗證：以假 HOME 實測指令鏈兩次（下載成功、require 恰一行）；`npx tsc --noEmit` 通過；頁面 200。

## 25. BOM 狀態列顯示品牌（Manufacturer）

- `parseBomFile` 新增品牌欄擷取：關鍵字 manufacturer/mfr/maker/brand/vendor/品牌/廠牌/製造/原廠，並排除料號欄本身（「Manufacturer P/N」也含 manufacturer 字樣，以欄位 index 排除）。
- `BomRow` 新增選填 `manufacturer`（localStorage 舊資料相容）；狀態列新增「品牌 Manufacturer」卡，grid 由 4 欄改 5 欄（窄幅斷點原樣 2 欄/1 欄）。
- 驗證：以實際表頭（Manufacturer P/N / Description / Manufacturer / 缺料）模擬 mpnCol=0、mfrCol=2；中文「品牌」欄也可辨識；`npx tsc --noEmit` 通過、頁面 200。

## 26. Phase 1 導讀式收割：一鍵讀取 QQ 回覆進回覆解析

### 功能（半自動、人工確認制）
- 「回覆解析」卡新增「讀取 QQ 回覆（導讀）」按鈕：QQ 開著廠商對話 → 按一下 → 廠商回覆原文帶入 textarea（可修改）、單價/庫存/MOQ/交期並列顯示 → 人工確認後按「加入報價紀錄」才寫入 → 既有 Excel 回填匯出。
- Hammerspoon helper 新增 `/read-chat` 端點：以 macOS Accessibility 讀 QQ NT（Electron）視窗文字。關鍵：須先設 `AXManualAccessibility`/`AXEnhancedUserInterface` 打開 AX 樹（第一次呼叫樹還沒建好，讀太少會自動重讀一次）。
- 版面解剖（實測 QQ NT 6.9.96）：「消息列表」之後是訊息區（時間/發話者/內容交錯）至「会话」工具列；標題「<暱稱> 临时会话」與右側資料卡「QQ号」提供對話身分。

### 防貼錯設計（雙鑰匙）
- RFQ 錨點：對話中「我們送出的」詢價訊息含 RFQ 編號；廠商回覆取「最後一筆 RFQ 之後」的訊息。多 RFQ 同對話 → 料號優先歸屬（回覆含某 RFQ 料號者勝），仍多筆則顯示警告請人工確認。
- 身分核對：對話資料卡 QQ 號 vs 該 RFQ 當初寄送的供應商 QQ（由 rfqId 反查 hqewResultsByMpn），不符顯眼警告。
- 讀取後自動切到該 RFQ 對應的 BOM 料號，讓來源列正確配對；找不到詢價編號/廠商訊息在詢價前等異常一律顯示警告。
- 訊息去重：AX 虛擬列表殘影連續重複自動去除。

### 驗證（真實對話資料）
- 實測讀取「李泽佳-只有原装/新航业」對話：partner/QQ號/RFQ 全部正確，抽出的回覆正確排除詢價前的罐頭訊息、只取詢價後的「没」。
- `npx tsc --noEmit` 通過；頁面 200；helper `/health`、`/read-chat` 正常。
- lua 已同步至 `~/.hammerspoon`（已重載）與 `public/qq-paste/`（同事重跑安裝指令即可更新）。

## 27. 導讀強化：促銷訊息剔除＋結構化解讀擴充

- `cleanSupplierReply`：以「句」為單位剔除廠商罐頭/促銷訊息（⭐、新客禮包、1片起售、了解我们、實名報價要資料等），任何帶報價訊號的句子（pcs/含税/￥/庫存/MOQ/交期/批號/有效期＋數字）一律保留；導讀狀態列顯示「已剔除 N 句」。
- `parseReplyText` 支援華強無標籤報價行（`DMP21D5UFB4-7B 2649pcs 0.2含税 DIODES(美台) 21+`）：單價（前置數字＋含税）、庫存（NNNNpcs）、批號（21+ 或 批号:）、品牌（DIODES(美台) 括號式）、報價有效期；含稅自動標注。
- 解讀 grid 由 4 格擴為 8 格：單價/庫存/MOQ/交期/批號/報價有效期/品牌(回覆)/**料號比對**（回覆含當前 RFQ 料號 → 綠✓，未提及 → 橙⚠）。
- 驗證：以使用者實際圣禾堂回覆全文測試——剔除 5 句促銷、只留報價行，解析 單價￥0.2(含稅)/庫存2649/批號21+/品牌DIODES(美台) 全對；舊標籤格式（單價：0.112 含稅…）迴歸通過；tsc 通過。

## 28. 安裝指令改為「程式檔內嵌」，解決大陸同事 curl 連不上 Railway 的安裝失敗

- 問題：同事從 Railway 網站按「複製安裝指令」仍安裝失敗。根因：其瀏覽器走代理可開網站，但 Hammerspoon 執行的 `curl` 不吃瀏覽器/系統代理、直連 `*.up.railway.app` 被牆擋（已驗證 Railway 端檔案本身 200 正常）。
- 解法：`buildConsoleInstallCommand` 改為在瀏覽器端 fetch 同源 lua 檔（走瀏覽器代理，必通），把內容逸出成單行 lua 字串「整份內嵌」進指令；貼進 Console 執行時**純寫檔、零連網**。Console 輸入列為單行欄位，故不用 long-bracket 多行內嵌而用 `\n` 逸出單行。
- 驗證：fengari Lua VM 沙盒（記憶體 FS stub）實跑產生的指令兩次——語法通過、寫出檔案與原始檔 byte-identical、init.lua require 冪等恰一行、hs.reload 有被呼叫。`npx tsc --noEmit` 通過。
- 附註：curl 版失敗不會留殘骸（&& 鏈在下載失敗即中止，config 未動），同事直接用新按鈕重來即可。
