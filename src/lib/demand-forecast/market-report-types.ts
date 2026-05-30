// ==================== 市場情報 — 型別定義 ====================

/** 情報信號級別（全自動模式） */
export type MarketSignalLevel =
  | 'no_signal'                // 成功取得來源，但沒找到相關情報
  | 'source_unavailable'       // 來源被封鎖/表單/逾時/解析失敗
  | 'info'                     // 自動擷取到 1 個來源的情報
  | 'multi_source';            // 多個來源命中情報

/** 來源的抓取模式 */
export type SourceFetchMode =
  | 'fixed_article'    // 固定文章頁 URL
  | 'article_list'     // 文章列表頁，需先找最新文章連結
  | 'rss'              // RSS feed
  | 'pdf'              // PDF 報告
  | 'gated_form'       // 表單下載，需填寫才能取得
  | 'manual_only';     // 僅限人工取得

/** 來源的回應狀態 */
export type SourceStatus =
  | 'ok'               // 成功取得並解析
  | 'blocked'          // 被封鎖 (403/401)
  | 'form_required'    // 頁面是表單下載
  | 'parse_failed'     // 取得但解析失敗
  | 'timeout'          // 回應逾時
  | 'no_new_report'    // 成功取得但沒新報告
  | 'manual_required'; // 此來源需人工取得

/** 擷取方式 */
export type ExtractionMethod =
  | 'html_scrape'      // HTML 頁面擷取
  | 'rss_parse'        // RSS feed 解析
  | 'pdf_extract';     // PDF 內容擷取

/** 信心度 */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/** 風險類型 */
export type RiskType =
  | 'lead_time_increase'
  | 'allocation'
  | 'price_increase'
  | 'demand_surge'
  | 'constrained_supply'
  | 'geopolitical'
  | 'lifecycle';

/** 市場情報報告 */
export interface MarketReport {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string | null;  // null = 無法從內容判定發布日期
  fetchedAt: string;
  categoryIds: string[];
  signalLevel: MarketSignalLevel;
  riskTypes: RiskType[];
  summaryZh: string;
  evidenceText: string;
  confidence: ConfidenceLevel;
  status: 'auto';
  extractionMethod: ExtractionMethod;
  sourceStatus: SourceStatus;
}

/** 單一來源的抓取結果 */
export interface SourceFetchResult {
  sourceId: string;
  name: string;
  url: string;
  fetchMode: SourceFetchMode;
  sourceStatus: SourceStatus;
  reports: MarketReport[];
  warning?: string;
  error?: string;
}

/** 整批抓取結果 */
export interface MarketReportsFetchResult {
  reports: MarketReport[];
  sourceResults: SourceFetchResult[];
  fetchedAt: string;
  schemaVersion: number;
}

export const MARKET_REPORTS_SCHEMA_VERSION = 4;
