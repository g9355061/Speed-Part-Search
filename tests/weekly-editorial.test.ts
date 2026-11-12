import assert from 'node:assert/strict';
import {
  classifyNewsKind, rankCategoryNews, coverScore, suspectHotPrices, qualitativeChannelText,
  detectDivergence, divergenceNote, deterministicReview, sectionMaterialText,
  type ReviewSection, type ReviewDraft,
} from '../src/lib/demand-forecast/weekly-editorial';

// 以下案例取自 2026/11/09 期實際寄出的週報

// ---- 選題 ----
assert.equal(classifyNewsKind('STM32H7P：第一個 Cortex-M7，配備 ST 的 Neural-ART NPU 和硬體訊號處理器，價格不變'), 'launch');
assert.equal(classifyNewsKind('AI伺服器電容器短缺將於2027年達到頂峰，提振三星電機'), 'supply');
assert.equal(classifyNewsKind('三星電機推出新品並全線調漲 MLCC 30%'), 'supply', '同時像發表與漲價時算供應事件');
assert.equal(classifyNewsKind('某公司公布第三季財報'), 'other');

const mlccNews = [
  { titleZh: 'AI伺服器電容器短缺將於2027年達到頂峰，提振三星電機', source: 'The Korea Herald' },
  { titleZh: 'AI伺服器電容器短缺將於2027年初達到頂峰，提振對三星馬達的需求', source: 'www.malaysiasun.com' },
  { titleZh: 'AI資料中心吞噬MLCC供應：明年上半年短缺將達到頂峰', source: 'BigGo Finance' },
  { titleZh: '“AI伺服器MLCC短缺將在明年上半年達到頂峰”，提升三星馬達的價值', source: '머니투데이' },
];
const mlcc = rankCategoryNews(mlccNews);
assert.equal(mlcc.supplySources, 4);
assert.ok(mlcc.events.length < mlccNews.length, '同一事件的多家報導要併成一則');
assert.ok(mlcc.events[0].sources.length >= 2);
assert.equal(mlcc.launchOnly, false);

const mcu = rankCategoryNews([{ titleZh: 'STM32H7P：第一個 Cortex-M7，配備 ST 的 Neural-ART NPU 和硬體訊號處理器，價格不變', source: 'STMicroelectronics' }]);
assert.equal(mcu.supplySources, 0);
assert.equal(mcu.launchOnly, true);
assert.equal(mcu.score, 0, '產品發表不算新聞份量');

// 11/09：MLCC（4 家媒體、非交叉命中）必須排在只有單日熱搜的交叉命中類別前面
const mlccCover = coverScore({ newsScore: mlcc.score, crossHit: false, lifecycleCount: 0, marketReportCount: 0, hotSustained: 0, hotNew: 0 });
const analogCover = coverScore({ newsScore: 0, crossHit: true, lifecycleCount: 0, marketReportCount: 0, hotSustained: 1, hotNew: 2 });
const mcuCover = coverScore({ newsScore: mcu.score, crossHit: true, lifecycleCount: 0, marketReportCount: 0, hotSustained: 0, hotNew: 1 });
assert.ok(mlccCover > analogCover && mlccCover > mcuCover);
assert.ok(analogCover > mcuCover, '持續在榜的熱料比單日熱搜有份量');
const singleSource = rankCategoryNews([mlccNews[1]]);
assert.ok(coverScore({ newsScore: singleSource.score, crossHit: false, lifecycleCount: 0, marketReportCount: 0, hotSustained: 0, hotNew: 0 }) > analogCover,
  '單一來源的供應新聞也要排在只有熱搜的交叉命中類別前');

// ---- 素材合理性 ----
const hot = [
  { mpn: 'MT53E1G32D2FW-046 AAT:B', priceCny: 1512, categoryId: 'C04' },
  { mpn: 'REF200AU/2K5', priceCny: 350, categoryId: 'C09' },
  { mpn: 'TPA6304QDDVRQ1', priceCny: 2200, categoryId: 'C09' },
  { mpn: 'ICM-42688-P', priceCny: 40, categoryId: 'C09' },
  { mpn: 'PCF8593T/1,118', priceCny: 29.1, categoryId: 'C10' },
  { mpn: 'NOPRICE', priceCny: null, categoryId: 'C10' },
];
const suspect = suspectHotPrices(hot);
assert.ok(suspect.has('TPA6304QDDVRQ1'), '音訊放大器 ¥2200 不可引用');
assert.ok(!suspect.has('MT53E1G32D2FW-046 AAT:B'), '記憶體上千元合理');
assert.ok(!suspect.has('ICM-42688-P') && !suspect.has('PCF8593T/1,118') && !suspect.has('NOPRICE'));
assert.ok(suspectHotPrices([
  { mpn: 'A', priceCny: 1, categoryId: 'C02' }, { mpn: 'B', priceCny: 2, categoryId: 'C02' }, { mpn: 'C', priceCny: 500, categoryId: 'C02' },
]).has('C'), '比同類中位數高 20 倍以上');

const tight = { level: 'high', trend: 'tightening', pending: false, consecutiveTightWeeks: 7, externalPrimary: false };
const calm = { level: 'normal', trend: 'stable', pending: false, consecutiveTightWeeks: 0, externalPrimary: false };
const channel = qualitativeChannelText('MCU / 處理器', tight, '本站每週通路監測顯示，MCU / 處理器本週補貨交期明顯拉長。');
assert.ok(!/\d/.test(channel), `通路觀測不可帶數字：${channel}`);
assert.ok(channel.includes('轉緊') && channel.includes('補貨交期明顯拉長'));
assert.ok(qualitativeChannelText('MLCC', calm, 'MLCC本週通路供應平穩，庫存、交期與價格未見明顯波動。').includes('平穩'));

// ---- 落差 ----
assert.equal(detectDivergence({ supplySources: 4, newsCount: 4, state: calm }), 'news-ahead');
assert.equal(detectDivergence({ supplySources: 4, newsCount: 4, state: tight }), null);
assert.equal(detectDivergence({ supplySources: 0, newsCount: 0, state: tight }), 'channel-ahead');
assert.equal(detectDivergence({ supplySources: 4, newsCount: 4, state: { ...calm, externalPrimary: true } }), null, '記憶體以新聞為準，不算落差');
assert.equal(detectDivergence({ supplySources: 1, newsCount: 1, state: calm }), null, '單一來源不足以說新聞喊缺');
assert.equal(detectDivergence({ supplySources: 4, newsCount: 4, state: null }), null);
assert.ok(divergenceNote('news-ahead').includes('落差') && divergenceNote(null) === '');

// ---- 審稿（程式規則） ----
const sections: ReviewSection[] = [
  {
    categoryId: 'C01', categoryName: 'MLCC / 積層陶瓷電容', channelText: 'MLCC 的代理商通路供應平穩。',
    evidence: ['The Korea Herald〔另有 BigGo Finance 同步報導〕：AI 伺服器電容器短缺將於 2027 年達到頂峰，高容 MLCC 交期已達 35 週。'],
    divergenceNote: divergenceNote('news-ahead'), followUp: '（2026/11/02）觀察高容 MLCC 交期是否突破 35 週。', newsWeight: '本週有 4 家媒體報導此類別的供應面消息',
  },
  {
    categoryId: 'C05', categoryName: 'MCU / 處理器', channelText: channel,
    spotText: 'STM32F103C8T6（ST/意法，參考價 ¥4.78；本週新上榜）',
    evidence: ['STMicroelectronics〔產品發表，非供應事件〕：STM32H7P 在 350 MHz 下支援 125 ℃。'],
  },
];
const material = sectionMaterialText(sections[0], 0);
assert.ok(material.includes('【落差】') && material.includes('上期後續觀察') && material.includes('新聞份量'));

const good: ReviewDraft = {
  leadHeadline: 'AI伺服器搶料，高容MLCC交期拉長至35週',
  lede: '導言',
  items: [
    { categoryId: 'C01', headline: 'MLCC短缺估2027年見頂，交期達35週', story: ['內文'], watchpoint: '觀察', action: '針對高容 MLCC 向代理商確認在途量並評估第二供應商。' },
    { categoryId: 'C05', headline: 'STM32F103C8T6 登華強熱搜，參考價 ¥4.78', story: ['內文'], watchpoint: '觀察', action: '盤點 STM32 系列至 Q4 的需求並確認代理商可供量。' },
  ],
};
assert.deepEqual(deterministicReview(good, sections), [], '型號與 Q4 這類代號不算數字宣稱');

// 11/09 實際寄出的標題與行動建議：數字來自本站通路觀測，必須被擋下
const bad: ReviewDraft = {
  leadHeadline: 'STM32H7P 升級 350MHz 高溫性能，MCU 現貨交期拉長 16 週',
  lede: '導言',
  items: [
    { categoryId: 'C05', headline: '意法推出 STM32H7P，MCU 通路庫存低檔交期拉長 16 週', story: ['內文'], watchpoint: '', action: '建議 PM 將 MCU 採購下單時間提前 16 週。' },
  ],
};
const badIssues = deterministicReview(bad, sections);
assert.ok(badIssues.some((issue) => issue.includes('整期頭條的數字 16')));
assert.ok(badIssues.some((issue) => issue.includes('標題的數字 16')));
assert.ok(badIssues.some((issue) => issue.includes('行動建議的數字 16')));
assert.ok(badIssues.some((issue) => issue.includes('MLCC') && issue.includes('缺少這一篇')));

// 本地範本標題（Gemini 失敗時的罐頭句）一律算空洞
assert.ok(deterministicReview({ ...good, leadHeadline: 'MCU、PMIC 供應訊號升溫，建議提早確認交期與需求' }, sections).some((issue) => issue.includes('整期頭條空洞')));

console.log('weekly editorial: news kinds, event clustering, cover order, hot price sanity, qualitative channel text, divergence, rule-based review passed');
