/**
 * 華強頁面判讀 fixture 測試（無框架，同 digikey.test.ts 模式）。執行：npm test
 * 重點：HTTP 200 但沒有「共 N 条／无结果」標誌的頁面（驗證頁、改版頁）
 * 不得被當成「合法查無」——那會回空結果並被 3 小時快取放大。
 */
import assert from 'node:assert/strict';
import { parseHqewTotalCount, isLegitimateEmptyHqewPage } from '../src/lib/qq/hqew-parse';

// fixture 1：正常結果頁（節錄）
const NORMAL_PAGE = `
型号 品牌 批号 库存 封装 仓库所在地
TXB0104YZTR TI 24+ 68000 BGA12 深圳
共 192 条 记录 上一页 1 2 3 下一页
`;

// fixture 2：合法查無頁
const ZERO_PAGE = `
很抱歉，没有找到与"ZZZNOTAREALPART9988"相关的供应商
共 0 条 记录
无结果？试试全站搜索
`;

// fixture 3：華強 403 封鎖頁原文（2026-07-15 正式站實際擷取，75 字元）
const BLOCK_PAGE = '您的请求过于频繁，已被网站管理员设置拦截，请联系网站客服人员进行解封！';

// fixture 4：HTTP 200 的安全驗證頁（無任何「共 N 条」統計）
const CAPTCHA_PAGE = `
安全验证
请完成下方验证后继续访问
拖动滑块完成拼图
`;

function run() {
  // 共 N 条 解析
  assert.equal(parseHqewTotalCount(NORMAL_PAGE), 192);
  assert.equal(parseHqewTotalCount(ZERO_PAGE), 0);
  assert.equal(parseHqewTotalCount(BLOCK_PAGE), null, '封鎖頁抓不到統計應回 null 而非 0');
  assert.equal(parseHqewTotalCount(CAPTCHA_PAGE), null);
  assert.equal(parseHqewTotalCount(''), null);
  console.log('✓ parseHqewTotalCount：抓不到「共 N 条」回 null，不假設為 0');

  // 合法空結果判定
  assert.equal(isLegitimateEmptyHqewPage(ZERO_PAGE), true);
  assert.equal(isLegitimateEmptyHqewPage(BLOCK_PAGE), false, '封鎖頁不得當成合法查無');
  assert.equal(isLegitimateEmptyHqewPage(CAPTCHA_PAGE), false, '驗證頁不得當成合法查無');
  assert.equal(isLegitimateEmptyHqewPage(NORMAL_PAGE), false);
  assert.equal(isLegitimateEmptyHqewPage(''), false);
  console.log('✓ isLegitimateEmptyHqewPage：只認「共 0 条／无结果」明確標誌');
}

run();
console.log('All hqew-parse tests passed.');
