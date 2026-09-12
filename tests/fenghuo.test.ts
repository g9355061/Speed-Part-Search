/**
 * 華強烽火指數解析／歸類／上榜歷史（無框架，同 digikey.test.ts 模式）。執行：npm test
 * fixture 節錄自 2026-09-12 正式抓取的首頁：market JSON 片段＋雲報價表格 3 列。
 */
import assert from 'node:assert/strict';
import { parseFenghuoHtml, classifyHotPart, computeMarketTrend, buildFenghuoView, type FenghuoCache } from '../src/lib/demand-forecast/fenghuo';

const PAGE = `<html><body>
<script>
IndexNew.mockData.hotModels = [];
IndexNew.mockData.market = {"categories":["2025/08","2026/06","2026/07","2026/08"],"search":{"name":"搜索指数","color":"#246bfd","data":[{"y":830,"dt":"2025/08"},{"y":1034,"dt":"2026/06"},{"y":1082,"dt":"2026/07"},{"y":1001,"dt":"2026/08"}]},"stock":{"name":"库存指数","data":[{"y":1200,"dt":"2025/08"},{"y":1421,"dt":"2026/06"},{"y":1394,"dt":"2026/07"},{"y":1438,"dt":"2026/08"}]},"price":{"name":"价格指数","data":[{"y":1100,"dt":"2025/08"},{"y":1261,"dt":"2026/06"},{"y":1306,"dt":"2026/07"},{"y":1393,"dt":"2026/08"}]}};
</script>
<table class="model-table"><tbody>
<tr><td><a href="/detail/STM32F103C8T6.html" title="STM32F103C8T6" class="product-name verf-detail" target="_blank">STM32F103C8T6</a></td><td class="brand" title="ST/意法">ST/意法</td><td><span class="price" title="￥6.44">￥6.44</span></td></tr>
<tr><td><a href="/detail/x.html" title="GCM188R71H104KA57D" class="product-name verf-detail" target="_blank">GCM188R71H104KA57D</a></td><td class="brand" title="MURATA/村田">MURATA/村田</td><td><span class="price" title="￥0.071">￥0.071</span></td></tr>
<tr><td><a href="/detail/y.html" title="PGB1010603NR" class="product-name verf-detail" target="_blank">PGB1010603NR</a></td><td class="brand" title="LITTELFUSE/力特">LITTELFUSE/力特</td><td><span class="price" title="￥0.124">￥0.124</span></td></tr>
</tbody></table></body></html>`;

const { market, hotParts } = parseFenghuoHtml(PAGE);
assert.equal(market.length, 4);
assert.deepEqual(market[3], { month: '2026/08', search: 1001, stock: 1438, price: 1393 });
assert.equal(hotParts.length, 3);
assert.deepEqual(hotParts[0], { mpn: 'STM32F103C8T6', brand: 'ST/意法', priceCny: 6.44, categoryId: 'C05' });
assert.equal(hotParts[1].categoryId, 'C01');
assert.equal(hotParts[2].categoryId, 'C08');

const trend = computeMarketTrend(market)!;
assert.equal(trend.month, '2026/08');
assert.ok(Math.abs(trend.search!.momPct! - (-7.486)) < 0.01, '搜索指數月增');
assert.ok(Math.abs(trend.search!.yoyPct! - 20.6) < 0.1, '搜索指數年增（對 2025/08）');
assert.equal(trend.tone, 'loosening', '搜索降＋庫存升＝轉鬆');
assert.ok(trend.text.includes('2026 年 08 月'));

// 版面改版：兩塊都抓不到要丟錯，不能靜默寫入空快取
assert.throws(() => parseFenghuoHtml('<html><body>changed</body></html>'), /改版/);

// ---- 歸類規則（正式站 30 顆熱料抽樣）----
const cases: Array<[string, string, string | null]> = [
  ['IRF740', 'INFINEON/英飞凌', 'C03'], ['1N4148WT', 'ONSEMI/安森美', 'C03'], ['SI2333CDS-T1-GE3', 'VISHAY/威世', 'C03'],
  ['LM2676SX-ADJ', 'TI/德州仪器', 'C02'], ['78L05', 'ST/意法', 'C02'], ['BQ24610RGER', 'TI/德州仪器', 'C02'],
  ['W5500', 'WIZNET/微知纳特', 'C14'], ['PCA82C250T', 'NXP/恩智浦', 'C10'], ['ISO124P', 'TI/德州仪器', 'C13'],
  ['NE555DR', 'TI/德州仪器', 'C09'], ['AD7606BSTZ', 'ADI/亚德诺', 'C09'], ['TMS320F28335PGFA', 'TI/德州仪器', 'C05'],
  ['EP2C5T144C8N', 'ALTERA/阿尔特拉', 'C05'], ['W25Q128JVSIQ', 'WINBOND/华邦', 'C04'], ['GRM31CR71H475KA12L', 'MURATA/村田', 'C01'],
  ['SMAJ5.0A', 'LITTELFUSE/力特', 'C08'], ['TLP521-1', 'TOSHIBA/东芝', 'C13'], ['ABM8-8.000MHZ', 'ABRACON', 'C07'],
  ['XYZ-UNKNOWN-1', 'SOMEBRAND', null],
];
for (const [mpn, brand, expected] of cases) {
  assert.equal(classifyHotPart(mpn, brand), expected, `${mpn} 應歸 ${expected}`);
}

// ---- 快照歷史：新上榜／連續次數 ----
const cache: FenghuoCache = {
  version: 1, updatedAt: '2026-09-14T00:00:00Z', sourceUrl: 'https://fh.hqew.com/', market, hotParts,
  snapshots: [
    { fetchedAt: '2026-08-31T00:00:00Z', mpns: ['STM32F103C8T6', 'GCM188R71H104KA57D'] },
    { fetchedAt: '2026-09-07T00:00:00Z', mpns: ['STM32F103C8T6'] },
    { fetchedAt: '2026-09-14T00:00:00Z', mpns: ['STM32F103C8T6', 'GCM188R71H104KA57D', 'PGB1010603NR'] },
  ],
};
const view = buildFenghuoView(cache);
const byMpn = Object.fromEntries(view.hotParts.map((p) => [p.mpn, p]));
assert.equal(byMpn.STM32F103C8T6.weeksOnList, 3);
assert.equal(byMpn.STM32F103C8T6.isNew, false);
assert.equal(byMpn.GCM188R71H104KA57D.isNew, true, '上次不在榜、本次在榜＝新上榜');
assert.equal(byMpn.GCM188R71H104KA57D.weeksOnList, 1, '不連續，從本次重算');
assert.deepEqual(view.categoryCounts.C05, { categoryId: 'C05', total: 1, fresh: 0 });
assert.deepEqual(view.categoryCounts.C01, { categoryId: 'C01', total: 1, fresh: 1 });
assert.equal(buildFenghuoView({ ...cache, snapshots: [cache.snapshots[2]] }).hotParts[0].isNew, false, '首次快照不判新上榜');

console.log('fenghuo.test.ts: all assertions passed');
