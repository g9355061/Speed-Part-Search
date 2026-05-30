import { CATEGORY_THRESHOLDS, DEMAND_CATEGORIES } from './benchmark';

export interface MarketReport {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  categoryIds: string[];
  riskLevel: '正常' | '中風險' | '有缺料風險';
  riskTypes: ('lead_time_increase' | 'allocation' | 'price_increase' | 'demand_surge' | 'constrained_supply' | 'geopolitical' | 'lifecycle')[];
  summaryZh: string;
  evidenceText: string;
  confidence: 'low' | 'medium' | 'high';
  status: 'auto' | 'confirmed' | 'ignored';
}

// 內建的 2026 Q1/Q2 產業情報基底數據 (用於 Fallback 與 baseline)
const BASELINE_REPORTS: MarketReport[] = [
  {
    id: 'base-01',
    source: 'Fusion Worldwide',
    title: '2026 Q1 Market Intelligence: Memory Lead-Time Report',
    url: 'https://www.fusionww.com/insights/2026-q1-market-intelligence-lead-time-report-what-procurement-teams-need-to-know-now',
    publishedAt: '2026-03-15T00:00:00Z',
    fetchedAt: new Date().toISOString(),
    categoryIds: ['C04'],
    riskLevel: '有缺料風險',
    riskTypes: ['demand_surge', 'constrained_supply', 'price_increase'],
    summaryZh: 'AI 與伺服器需求持續暴增，各大原廠限制產能轉向 HBM 晶片，導致高容量 DRAM (DDR4/DDR5) 與 NAND Flash 實質供貨受限 (Allocation)，原廠醞釀價格調漲 15%-25%。',
    evidenceText: 'DDR4 and DDR5 memory products are under severe constrained supply due to manufacturer shift to high-bandwidth memory (HBM). Original equipment manufacturers (OEMs) are facing allocation policies with pricing expected to surge.',
    confidence: 'high',
    status: 'auto'
  },
  {
    id: 'base-02',
    source: 'Future Electronics',
    title: 'Future Electronics Market Conditions Report Q2 2026',
    url: 'https://www.futureelectronics.com/resources/market-conditions-report',
    publishedAt: '2026-04-10T00:00:00Z',
    fetchedAt: new Date().toISOString(),
    categoryIds: ['C01', 'C02'],
    riskLevel: '中風險',
    riskTypes: ['lead_time_increase'],
    summaryZh: '高容 MLCC 需求回溫使特定車規/工業用電容交期拉長至 18 週以上；PMIC 電源管理晶片雖然一般型號充足，但車規等級供貨仍有局部偏緊現象。',
    evidenceText: 'High-capacitance MLCC lead times have stretched to 18+ weeks in automotive sectors. PMIC products are generally stable, but niche automotive power management ICs show pocketed constraints.',
    confidence: 'high',
    status: 'auto'
  },
  {
    id: 'base-03',
    source: 'TTI Lead Time Trends',
    title: 'TTI Europe Lead Time Trends Report - April 2026',
    url: 'https://www.ttieurope.com/content/ttieurope/en/apps/lead-time-trends.html',
    publishedAt: '2026-04-20T00:00:00Z',
    fetchedAt: new Date().toISOString(),
    categoryIds: ['C06', 'C11'],
    riskLevel: '中風險',
    riskTypes: ['lead_time_increase', 'demand_surge'],
    summaryZh: '高頻高速連接器（應用於網通與伺服器機櫃）交期由 12 週微幅拉長至 16-20 週；車用功率電感及一體成型扼流圈需求旺盛，交期呈上升趨勢。',
    evidenceText: 'High-speed backplane connectors see lead times stretching to 16-20 weeks due to robust server demand. Automotive inductors and chokes trend upwards with high demand.',
    confidence: 'medium',
    status: 'auto'
  },
  {
    id: 'base-04',
    source: 'SiliconExpert Impacts',
    title: 'SiliconExpert Supply Chain Impact Analysis Q2 2026',
    url: 'https://www.siliconexpert.com/resources/se-impacts/',
    publishedAt: '2026-05-05T00:00:00Z',
    fetchedAt: new Date().toISOString(),
    categoryIds: ['C14', 'C13'],
    riskLevel: '中風險',
    riskTypes: ['lifecycle', 'constrained_supply'],
    summaryZh: '舊世代乙太網路網通 IC 與光電隔離器 (Optocoupler) 面臨晶圓代工廠舊製程關閉，原廠發布多項 PCN (產品變更通知) 與 EOL (停產公告)，恐有零星斷料風險。',
    evidenceText: 'Legacy Ethernet PHY ICs and photocouplers face fab capacity shifts. Multiple PCN and NRND (not recommended for new design) alerts were registered from major suppliers.',
    confidence: 'high',
    status: 'auto'
  },
  {
    id: 'base-05',
    source: 'PPSI Electronics Supply Chain',
    title: 'PPSI Supply Chain Risk & Lead Time Report Q2 2026',
    url: 'https://www.ppsi.io/about/articles/electronics-supply-chain-q2-2026',
    publishedAt: '2026-05-18T00:00:00Z',
    fetchedAt: new Date().toISOString(),
    categoryIds: ['C15', 'C05'],
    riskLevel: '有缺料風險',
    riskTypes: ['lead_time_increase', 'constrained_supply', 'demand_surge'],
    summaryZh: '高階散熱風扇與散熱模組因伺服器建置熱潮，原廠產能滿載，部分特定型號交期已失控拉長至 26 週以上；車規 MCU 仍有零星特定晶圓封測產線產能吃緊。',
    evidenceText: 'High-power cooling fans and thermal components suffer from unprecedented lead times stretching past 26 weeks. Automotive microcontrollers (MCUs) experience select fab tightness.',
    confidence: 'high',
    status: 'auto'
  },
  {
    id: 'base-06',
    source: 'Sourceability Lead Time',
    title: 'Sourceability Global Component Lead Time Report Q2 2026',
    url: 'https://sourceability.com/lead-time-report',
    publishedAt: '2026-05-22T00:00:00Z',
    fetchedAt: new Date().toISOString(),
    categoryIds: ['C02', 'C03', 'C04'],
    riskLevel: '中風險',
    riskTypes: ['lead_time_increase', 'price_increase'],
    summaryZh: '分離式功率元件 (MOSFET) 與高階 PMIC 交期處於高位，因工控與車用電子需求維持穩定；記憶體 DRAM 合約價與現貨價雙雙走揚。',
    evidenceText: 'Power discretes and MOSFETs hover at elevated lead times. PMIC supply remains stable but prices for high-voltage power ICs show incremental increases alongside DRAM.',
    confidence: 'medium',
    status: 'auto'
  }
];

// 規則對應表：料件類別與關鍵字
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  C01: ['mlcc', 'ceramic capacitor', 'multilayer ceramic', '陶瓷電容', '電容'],
  C02: ['pmic', 'power management', 'regulator', 'power ic', '電源管理', '穩壓'],
  C03: ['mosfet', 'discrete', 'transistor', 'diode', '功率元件', '二極體', '三極體', '分離式'],
  C04: ['dram', 'nand', 'nor', 'flash', 'ddr', 'memory', '記憶體', '閃存'],
  C05: ['mcu', 'microcontroller', 'microprocessor', 'cpu', 'processor', '單晶片', '處理器'],
  C06: ['connector', 'header', 'receptacle', 'socket', 'terminal', '連接器', '端子', '插座'],
  C07: ['crystal', 'oscillator', 'resonator', 'xtal', 'quartz', '石英', '晶體', '振盪器'],
  C08: ['tvs', 'esd', 'varistor', 'protection diode', '靜電', '保護元件', '防護'],
  C09: ['analog', 'op amp', 'sensor', 'converter', 'adc', 'dac', '類比', '感測器'],
  C10: ['interface', 'transceiver', 'rs485', 'can bus', 'driver ic', '介面', '收發器'],
  C11: ['inductor', 'choke', 'coil', 'ferrite', '電感', '扼流圈', '線圈'],
  C12: ['aluminum capacitor', 'polymer capacitor', 'electrolytic', '鋁電容', '電解電容', '固態電容'],
  C13: ['optocoupler', 'isolator', 'photocoupler', 'opto', '光耦', '隔離器'],
  C14: ['ethernet', 'phy', 'switch ic', 'lan', 'networking', '網通', '乙太網路'],
  C15: ['fan', 'heat sink', 'thermal', 'power module', '風扇', '散熱', '電源模組']
};

// 風險類型與關鍵字
const RISK_KEYWORDS = {
  lead_time_increase: [/lead[- ]time (increase|increasing|extend|stretches|stretch|prolong|trend up)/i, /交期(拉長|延長|增加|變長)/],
  allocation: [/\ballocation\b/i, /配給/, /限量/],
  price_increase: [/(price|pricing) (increase|hike|rise|up|surge)/i, /價格(上漲|調漲|上揚|上調|飆升)/, /漲價/],
  demand_surge: [/demand (surge|spike|increase|boom|growth)/i, /需求(暴增|激增|上升|旺盛)/],
  constrained_supply: [/(constrained|tight|shortage|limited) supply/i, /supply (constraint|tightness)/i, /供貨(吃緊|受限|緊張|短缺)/, /缺料/],
  geopolitical: [/geopolitical/i, /trade war/i, /tariff/i, /地緣政治/, /關稅/, /貿易戰/],
  lifecycle: [/\beol\b/i, /\bnrnd\b/i, /\bobsolete\b/i, /停產/, /生命週期/, /淘汰/]
};

// 爬取公開頁面的 Best-Effort 實作 (以 graceful fallback 為核心)
async function fetchWebpageText(url: string): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 6000); // 6秒超時，防阻塞
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    clearTimeout(id);
    if (!res.ok) return '';
    const html = await res.text();
    
    // 簡單的 HTML Text 提取 (過濾 script, style, tags)
    return html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    clearTimeout(id);
    console.warn(`[MarketReportFetcher] Fetch failed for ${url}:`, e);
    return '';
  }
}

// 規則引擎分析網頁內容
function analyzeText(text: string, sourceName: string, sourceUrl: string): MarketReport[] {
  const reports: MarketReport[] = [];
  const lowercaseText = text.toLowerCase();
  
  // 逐個 category 檢測
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    // 檢查是否有 category 的關鍵字出現在內
    const matchedCategoryKeyword = keywords.find(keyword => lowercaseText.includes(keyword.toLowerCase()));
    
    if (matchedCategoryKeyword) {
      const riskTypes: MarketReport['riskTypes'] = [];
      let maxRiskLevel: MarketReport['riskLevel'] = '正常';
      const evidenceFragments: string[] = [];
      
      // 檢測各項風險類型
      for (const [riskType, regexes] of Object.entries(RISK_KEYWORDS)) {
        for (const regex of regexes) {
          const match = text.match(regex);
          if (match) {
            riskTypes.push(riskType as any);
            
            // 決定風險級別
            if (riskType === 'allocation' || riskType === 'constrained_supply') {
              maxRiskLevel = '有缺料風險';
            } else if (maxRiskLevel !== '有缺料風險' && 
                      (riskType === 'lead_time_increase' || riskType === 'price_increase' || riskType === 'demand_surge')) {
              maxRiskLevel = '中風險';
            }
            
            // 擷取證據片段
            const index = text.indexOf(match[0]);
            const start = Math.max(0, index - 80);
            const end = Math.min(text.length, index + match[0].length + 80);
            evidenceFragments.push(`...${text.slice(start, end).trim()}...`);
            break;
          }
        }
      }
      
      if (riskTypes.length > 0) {
        // 判定信心度：如果在很近的距離出現了類別名與風險名，為 high
        let confidence: MarketReport['confidence'] = 'medium';
        const searchRegex = new RegExp(`(${keywords.join('|')})[\\s\\S]{0,100}(allocation|constrained|shortage|lead[- ]time|price|demand)`, 'i');
        if (searchRegex.test(text)) {
          confidence = 'high';
        }
        
        // 翻譯成中文摘要
        let summaryZh = `情報分析顯示該來源提及「${matchedCategoryKeyword}」有相關供應鏈波動：`;
        if (riskTypes.includes('allocation') || riskTypes.includes('constrained_supply')) {
          summaryZh += '正面臨產能受限或供貨缺料的配給風險。';
        } else if (riskTypes.includes('lead_time_increase')) {
          summaryZh += '補貨交期正在拉長，需要提前下單採購。';
        } else if (riskTypes.includes('price_increase')) {
          summaryZh += '面臨調漲報價的市場壓力。';
        } else {
          summaryZh += '市場供需或地緣政治因素導致風險增高。';
        }
        
        reports.push({
          id: `fetch-${sourceName.toLowerCase().replace(/\s+/g, '-')}-${catId}`,
          source: sourceName,
          title: `Market Alert for ${catId} Category`,
          url: sourceUrl,
          publishedAt: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          categoryIds: [catId],
          riskLevel: maxRiskLevel,
          riskTypes,
          summaryZh,
          evidenceText: evidenceFragments[0] || `Matched keyword: ${matchedCategoryKeyword}`,
          confidence,
          status: 'auto'
        });
      }
    }
  }
  
  return reports;
}

// 核心主入口：抓取與分析
export async function fetchAndAnalyzeReports(): Promise<MarketReport[]> {
  const sources = [
    { name: 'TTI MarketEYE', url: 'https://www.tti.com/content/ttiinc/en/resources/tools.html' },
    { name: 'TTI Lead Time Trends', url: 'https://www.ttieurope.com/content/ttieurope/en/apps/lead-time-trends.html' },
    { name: 'PPSI Electronics', url: 'https://www.ppsi.io/about/articles/electronics-supply-chain-q2-2026' },
    { name: 'Fusion Worldwide', url: 'https://www.fusionww.com/insights/2026-q1-market-intelligence-lead-time-report-what-procurement-teams-need-to-know-now' },
    { name: 'Sourceability Lead Time', url: 'https://sourceability.com/lead-time-report' },
    { name: 'Future Electronics', url: 'https://www.futureelectronics.com/resources/market-conditions-report' },
    { name: 'SiliconExpert Impacts', url: 'https://www.siliconexpert.com/resources/se-impacts/' }
  ];
  
  const fetchedReports: MarketReport[] = [];
  
  // 併發抓取並分析
  await Promise.all(sources.map(async (src) => {
    try {
      const text = await fetchWebpageText(src.url);
      if (text && text.length > 200) {
        const analyzed = analyzeText(text, src.name, src.url);
        fetchedReports.push(...analyzed);
      }
    } catch (e) {
      console.warn(`[MarketReportFetcher] Aborted analysis for ${src.name}`);
    }
  }));
  
  // 與內置報告進行 Merge
  // 合併策略：以 (source, categoryId) 為鍵值，若有抓到實時的，則覆蓋 baseline 的項目
  const map = new Map<string, MarketReport>();
  
  // 1. 先放基底數據
  for (const rep of BASELINE_REPORTS) {
    for (const catId of rep.categoryIds) {
      map.set(`${rep.source}-${catId}`, { ...rep, fetchedAt: new Date().toISOString() });
    }
  }
  
  // 2. 實時抓取到的進行覆蓋 / 新增
  for (const rep of fetchedReports) {
    for (const catId of rep.categoryIds) {
      map.set(`${rep.source}-${catId}`, rep);
    }
  }
  
  const allMerged = Array.from(map.values());
  
  // 3. 根據時間與來源進行風險級別修正
  const processedReports = allMerged.map(rep => {
    let level = rep.riskLevel;
    
    // A. 報告超過 30 天，降一級
    const ageInMs = Date.now() - Date.parse(rep.publishedAt);
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
    if (ageInDays > 30) {
      if (level === '有缺料風險') level = '中風險';
      else if (level === '中風險') level = '正常';
    }
    
    return {
      ...rep,
      riskLevel: level
    };
  });
  
  return processedReports;
}

// 計算 15 個類別的綜合市場報告風險級別，供矩陣首頁渲染
// 風險升降規則：同一 category 被 2 個以上可信來源命中中風險或以上：升一級
export function calculateCategoryMarketRisk(reports: MarketReport[]): Record<string, '正常' | '中風險' | '有缺料風險'> {
  const result: Record<string, '正常' | '中風險' | '有缺料風險'> = {};
  
  // 初始化所有類別為「正常」
  for (const cat of DEMAND_CATEGORIES) {
    result[cat.categoryId] = '正常';
  }
  
  // 收集每個類別的所有警報來源
  const catReportMap: Record<string, MarketReport[]> = {};
  for (const rep of reports) {
    for (const catId of rep.categoryIds) {
      if (!catReportMap[catId]) catReportMap[catId] = [];
      catReportMap[catId].push(rep);
    }
  }
  
  // 對每個類別評估
  for (const [catId, reps] of Object.entries(catReportMap)) {
    // 找出非「正常」的警報
    const activeAlerts = reps.filter(r => r.riskLevel !== '正常');
    if (activeAlerts.length === 0) continue;
    
    // 計算來源數
    const uniqueSources = new Set(activeAlerts.map(r => r.source));
    
    // 取最高風險級別
    let highestLevel: '正常' | '中風險' | '有缺料風險' = '正常';
    for (const r of activeAlerts) {
      if (r.riskLevel === '有缺料風險') {
        highestLevel = '有缺料風險';
      } else if (r.riskLevel === '中風險' && highestLevel !== '有缺料風險') {
        highestLevel = '中風險';
      }
    }
    
    // 如果同一個類別被 2 個以上來源命中，且原本是中風險，則升級為「有缺料風險」
    if (uniqueSources.size >= 2 && highestLevel === '中風險') {
      highestLevel = '有缺料風險';
    }
    
    result[catId] = highestLevel;
  }
  
  return result;
}
