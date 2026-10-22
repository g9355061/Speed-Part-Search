// 繁中翻譯共用模組（demand-forecast 新聞管線與週報共用）。
// 翻譯鏈：gtx 免費端點（快、零成本）→ Gemini（gtx 掛掉時接手，受 $5/月熔斷保護）→ 原文。
// gtx 是 Google 非官方端點、隨時可能改版斷掉；先前斷掉時輸出會退化成半英文，
// 這裡改由 Gemini 接手，只有兩者都失敗才回原文（呼叫端可再套 roughTranslateZh）。
import { getGenericCache, setGenericCache } from '@/lib/db';

const memoryCache = new Map<string, string>();

const GEMINI_USAGE_KEY = 'gemini_monthly_usage'; // 與週報 Gemini 合寫共用同一個月度熔斷
const GEMINI_COST_CAP_USD = 5.0;
const GEMINI_CALL_CAP = 4000;
// 2.5 Flash 已不開放給新 API key；3.8 常回 503（高需求）時退 3.7。
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash'];
// 成本估算用 3.8 Flash 2027 起的正式價（$1.50 / $7.50 per 1M tokens），寧可高估以免熔斷失效。
const INPUT_USD_PER_1K = 0.0015;
const OUTPUT_USD_PER_1K = 0.0075;

async function tryGtx(text: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`,
      { signal: controller.signal, cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map((part: any) => part?.[0] || '').join('').trim()
      : '';
    return translated || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryGemini(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const currentMonth = new Date().toISOString().slice(0, 7);
  let tracking: { month: string; cost: number; calls: number };
  try {
    tracking = (await getGenericCache(GEMINI_USAGE_KEY)) || { month: currentMonth, cost: 0, calls: 0 };
  } catch {
    tracking = { month: currentMonth, cost: 0, calls: 0 };
  }
  if (tracking.month !== currentMonth) {
    tracking = { month: currentMonth, cost: 0, calls: 0 };
  }
  if (tracking.cost >= GEMINI_COST_CAP_USD || tracking.calls >= GEMINI_CALL_CAP) {
    console.warn(`[TRANSLATE] Gemini monthly budget cap reached ($${tracking.cost.toFixed(4)} / ${tracking.calls} calls). Skipping.`);
    return null;
  }

  const prompt = `把下面的文字翻譯成臺灣慣用的繁體中文。專有名詞（公司名、料號、規格如 MLCC/DDR/MOSFET）保留原文。只輸出譯文，不要任何說明。\n\n${text}`;
  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
          }),
          signal: controller.signal,
        }
      );
      if (!resp.ok) continue;
      const json = await resp.json();
      const translated = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!translated) continue;

      const estimatedInputTokens = Math.ceil(prompt.length / 3.5);
      const estimatedOutputTokens = Math.ceil(translated.length * 2.5);
      tracking.cost += (estimatedInputTokens * INPUT_USD_PER_1K / 1000) + (estimatedOutputTokens * OUTPUT_USD_PER_1K / 1000);
      tracking.calls += 1;
      try {
        await setGenericCache(GEMINI_USAGE_KEY, tracking);
      } catch {
        // 熔斷計數寫入失敗不影響翻譯結果
      }
      return translated;
    } catch {
      // 逾時或網路錯誤：換下一個模型
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

/** 翻成繁體中文；已含中文或翻譯全數失敗時回原文。 */
export async function translateToZhTW(text: string): Promise<string> {
  if (!text) return '';
  const cleaned = text.trim();
  if (!cleaned || /[\u4e00-\u9fff]/.test(cleaned)) return cleaned;
  const hit = memoryCache.get(cleaned);
  if (hit) return hit;

  const translated = (await tryGtx(cleaned)) ?? (await tryGemini(cleaned));
  if (translated) {
    memoryCache.set(cleaned, translated);
    return translated;
  }
  return cleaned;
}
