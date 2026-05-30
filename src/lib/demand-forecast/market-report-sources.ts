import type { SourceFetchMode } from './market-report-types';

// ==================== 來源設定檔 ====================
// 每個來源有自己的抓取策略，不再用同一套 fixed URL HTML 抓取

export interface MarketReportSourceConfig {
  id: string;
  name: string;
  homepageUrl: string;
  fetchMode: SourceFetchMode;
  enabled: boolean;
  /** 用於 article_list 模式：列表頁 URL */
  listUrl?: string;
  /** 用於 fixed_article 模式：固定文章 URL */
  fixedUrl?: string;
  /** 允許的 article URL domain patterns */
  allowedDomains?: string[];
  /** 是否需要管理員人工取得 */
  requiresManualReview: boolean;
  /** 來源備註 */
  notes: string;
}

export const MARKET_REPORT_SOURCES: MarketReportSourceConfig[] = [
  {
    id: 'ppsi',
    name: 'PPSI Electronics',
    homepageUrl: 'https://www.ppsi.io',
    fetchMode: 'article_list',
    enabled: true,
    listUrl: 'https://www.ppsi.io/about/articles',
    allowedDomains: ['ppsi.io'],
    requiresManualReview: false,
    notes: '可自動抓取 articles 列表頁，再進入最新文章解析。',
  },
  {
    id: 'fusion',
    name: 'Fusion Worldwide',
    homepageUrl: 'https://www.fusionww.com',
    fetchMode: 'article_list',
    enabled: true,
    listUrl: 'https://www.fusionww.com/insights',
    allowedDomains: ['fusionww.com'],
    requiresManualReview: false,
    notes: '可自動抓取 insights 列表頁，找最新 market intelligence 文章。',
  },
  {
    id: 'future',
    name: 'Future Electronics',
    homepageUrl: 'https://www.futureelectronics.com',
    fetchMode: 'fixed_article',
    enabled: true,
    fixedUrl: 'https://www.futureelectronics.com/resources/market-conditions-report',
    allowedDomains: ['futureelectronics.com'],
    requiresManualReview: false,
    notes: 'Resources/report 頁面，嘗試直接解析。可能為表單頁。',
  },
  {
    id: 'siliconexpert',
    name: 'SiliconExpert',
    homepageUrl: 'https://www.siliconexpert.com',
    fetchMode: 'manual_only',
    enabled: true,
    fixedUrl: 'https://www.siliconexpert.com/resources/se-impacts/',
    allowedDomains: ['siliconexpert.com'],
    requiresManualReview: true,
    notes: '多半是 resources list 或需登入，標為 manual_only。',
  },
  {
    id: 'sourceability',
    name: 'Sourceability',
    homepageUrl: 'https://sourceability.com',
    fetchMode: 'gated_form',
    enabled: true,
    fixedUrl: 'https://sourceability.com/lead-time-report',
    allowedDomains: ['sourceability.com'],
    requiresManualReview: true,
    notes: '報告需填寫表單下載，無法自動擷取內容。',
  },
  {
    id: 'tti-leadtime',
    name: 'TTI Lead Time Trends',
    homepageUrl: 'https://www.ttieurope.com',
    fetchMode: 'fixed_article',
    enabled: true,
    fixedUrl: 'https://www.ttieurope.com/content/ttieurope/en/apps/lead-time-trends.html',
    allowedDomains: ['ttieurope.com', 'tti.com'],
    requiresManualReview: false,
    notes: '嘗試自動抓取；若 403 或無法解析，標為 blocked/manual_required。',
  },
  {
    id: 'tti-marketeye',
    name: 'TTI MarketEYE',
    homepageUrl: 'https://www.tti.com',
    fetchMode: 'fixed_article',
    enabled: true,
    fixedUrl: 'https://www.tti.com/content/ttiinc/en/resources/tools.html',
    allowedDomains: ['tti.com'],
    requiresManualReview: false,
    notes: '嘗試自動抓取；多為工具導覽頁，可能解析不到報告內容。',
  },
];
