// 華強頁面文字判讀的純函式（自 api/hqew/search/route.ts 抽出，供 fixture 測試）。
// 背景：華強被防爬阻擋時可能回 HTTP 200 的驗證頁/空殼頁；先前「抓不到共 N 条就當 0」
// 會把這種頁面誤判成「合法查無」回空結果——加上 3 小時快取後，假空結果還會被快取住。

/** 從頁面文字抓「共 N 条」統計；抓不到回 null（不可假設為 0）。 */
export function parseHqewTotalCount(bodyText: string): number | null {
  const m = bodyText.match(/共\s*([0-9]+)\s*条/);
  return m ? Number(m[1]) : null;
}

/**
 * 是否為「合法的查無結果」頁：必須明確出現「共 0 条」或「无结果」字樣。
 * 頁面既沒有供應商列表、也沒有這些標誌 → 視為被擋或改版，呼叫端應拋錯（錯誤不進快取）。
 */
export function isLegitimateEmptyHqewPage(bodyText: string): boolean {
  return /共\s*0\s*条/.test(bodyText) || /无结果|無結果/.test(bodyText);
}
