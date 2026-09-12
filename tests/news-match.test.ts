/**
 * 新聞分類比對與市場報告正文抽取（無框架，同 digikey.test.ts 模式）。執行：npm test
 * 2026-09-12：正式站實測誤中案例做成 fixture——這些以前全被貼錯類別、進了週報封面故事。
 */
import assert from 'node:assert/strict';
import { keywordMatches, matchesCategory, detectCategories, isBlockedNewsSource } from '../src/lib/demand-forecast/news-match';
import { extractArticle, extractPublishedAt, extractPageTitle } from '../src/lib/demand-forecast/market-report-fetcher';

// ---- 字邊界：子字串不再誤中 ----
assert.equal(keywordMatches('SK hynix expects a memory shortage - Overclocking.com', 'clock'), false, 'clock 不得命中 overclocking');
assert.equal(keywordMatches('Nepal rescue operations hit by equipment shortage; fans of the team', 'fan'), false, 'fan 只認大寫 FAN');
assert.equal(keywordMatches('Streaming hardware prices rising due to RAM shortage; are TVs next?', 'tvs'), false, 'tvs 不得命中 TVs（電視）');
assert.equal(keywordMatches('Nexperia TVS diode allocation tightens', 'tvs'), true, '大寫 TVS 要命中');
assert.equal(keywordMatches('Neither supply nor demand moved', 'nor'), false, '連接詞 nor 不算 NOR flash');
assert.equal(keywordMatches('NOR flash lead times stretch to 30 weeks', 'nor'), true);
assert.equal(keywordMatches('High-capacitance MLCC lead time hits 21 weeks', 'mlcc'), true);
assert.equal(keywordMatches('New RS-485 transceiver family launched', 'rs-485'), true, '含連字號的關鍵字');
assert.equal(keywordMatches('Samsung Electro-Mechanics raises MLCC prices', 'samsung electro-mechanics'), true);
assert.equal(keywordMatches('村田調漲積層陶瓷電容價格', '積層陶瓷電容'), true, '中文子字串');
assert.equal(keywordMatches('DDR5 RAM prices soar 485%', 'ddr'), true, '縮寫後接世代數字');
assert.equal(keywordMatches('HBM3E allocation tightens', 'hbm'), true);
assert.equal(keywordMatches('Automotive MCUs on allocation', 'mcu'), true, '縮寫複數');
assert.equal(keywordMatches('Board-to-board connectors lead time up', 'connector'), true, '一般字複數');
assert.equal(keywordMatches('RAMageddon hits consumer electronics', 'ram'), false, '縮寫後接字母不算');
assert.equal(keywordMatches('DDR5 RAM prices soar', 'ram'), true);

// ---- 正式站誤中案例 ----
assert.equal(matchesCategory('SK hynix expects a memory shortage to last until 2030 - Overclocking.com', 'C07'), false, 'DRAM 新聞不得貼晶體／振盪器');
assert.equal(matchesCategory('SK hynix expects a memory shortage to last until 2030 - Overclocking.com', 'C04'), true);
assert.equal(matchesCategory('Councils seek producer funding amid fridge processing capacity shortage', 'C15'), false, '冰箱新聞不得貼散熱／電源模組');
assert.equal(matchesCategory('AI data center boom worsens US power equipment shortage', 'C15'), false);
assert.equal(matchesCategory('Streaming hardware prices rising due to RAM shortage; are TVs next?', 'C08'), false, '電視新聞不得貼 TVS');
assert.equal(matchesCategory('Samsung Electro-Mechanics to widen MLCC price hikes', 'C04'), false, 'MLCC 新聞不得再貼記憶體');
assert.deepEqual(detectCategories('Samsung Electro-Mechanics to widen MLCC price hikes'), ['C01']);

// ---- 股票評論站黑名單 ----
assert.equal(isBlockedNewsSource('timothysykes.com'), true);
assert.equal(isBlockedNewsSource('StocksToTrade', 'https://stockstotrade.com/news/x'), true);
assert.equal(isBlockedNewsSource('Some Blog', 'https://www.tradingview.com/news/x'), true, '網域也要擋');
assert.equal(isBlockedNewsSource('The Korea Herald', 'https://www.koreaherald.com/article/1'), false);
assert.equal(isBlockedNewsSource("Tom's Hardware"), false);

// ---- 市場報告正文抽取 ----
const PAGE = `<!doctype html><html><head>
<title>Q3 Market Conditions Report | Future Electronics</title>
<meta property="og:title" content="Q3 Market Conditions Report" />
<meta property="article:published_time" content="2026-08-14T09:00:00Z" />
</head><body>
<header><nav><a href="/x">Windows 10 sunset procurement deadline</a><a href="/y">NVIDIA exclusive offer for EMEA</a></nav></header>
<main><article>
<h1>Q3 Market Conditions Report</h1>
<p>Lead times continue to extend across most technology areas. Product categories currently facing allocation from multiple suppliers include DRAM, storage solutions, NOR flash, MOSFET, MLCC and aluminum capacitors.</p>
<p>Please subscribe to our newsletter for weekly updates and accept cookies.</p>
<p>High-capacitance MLCC lead time is averaging 21 weeks as of August, five weeks longer than at the start of the year, with allocation expanding at Samsung Electro-Mechanics and Murata.</p>
<p>DRAM contract pricing rose 13 to 18 percent quarter over quarter according to TrendForce, and supply constraints on commodity DRAM are expected to persist while HBM absorbs wafer capacity at SK hynix and Micron.</p>
<p>MOSFET and small-signal discrete lead times from Nexperia and onsemi remain elevated in the 26 to 40 week range, with automotive-grade parts on allocation.</p>
</article></main>
<footer><p>All rights reserved. Privacy policy. Contact us for procurement support and component inventory services.</p></footer>
</body></html>`;

const article = extractArticle(PAGE, new Date('2026-09-12T00:00:00Z'));
assert.equal(article.title, 'Q3 Market Conditions Report');
assert.equal(article.publishedAt, '2026-08-14T09:00:00.000Z');
assert.ok(article.text.includes('21 weeks'), '正文要保留');
assert.ok(!article.text.includes('Windows 10 sunset'), '導覽列不得進正文');
assert.ok(!article.text.includes('NVIDIA exclusive'), '導覽列不得進正文');
assert.ok(!article.text.includes('subscribe to our newsletter'), '訂閱／cookie 段落要濾掉');
assert.ok(!article.text.includes('All rights reserved'), '頁尾不得進正文');
assert.equal(article.contentHash.length, 32);

// 內容沒變 → hash 不變；改一個數字 → hash 變
const same = extractArticle(PAGE.replace('<nav>', '<nav class="v2">'), new Date('2026-09-12T00:00:00Z'));
assert.equal(same.contentHash, article.contentHash, '導覽列改版不影響 hash');
const changed = extractArticle(PAGE.replace('21 weeks', '24 weeks'), new Date('2026-09-12T00:00:00Z'));
assert.notEqual(changed.contentHash, article.contentHash, '正文數字變了 hash 要變');

// 日期解析：未來與過舊都不採信
assert.equal(extractPublishedAt('<meta property="article:published_time" content="2031-01-01T00:00:00Z">', new Date('2026-09-12')), null);
assert.equal(extractPublishedAt('<time datetime="2012-05-01">', new Date('2026-09-12')), null);
assert.equal(extractPublishedAt('<script>{"datePublished":"2026-07-24T10:00:00+08:00"}</script>', new Date('2026-09-12')), '2026-07-24T02:00:00.000Z');
assert.equal(extractPageTitle('<title>Lead Time Trends - TTI Europe</title>'), 'Lead Time Trends');

console.log('news-match.test.ts: all assertions passed');
