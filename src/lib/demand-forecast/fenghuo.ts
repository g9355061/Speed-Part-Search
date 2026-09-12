import { getGenericCache, setGenericCache } from '@/lib/db';
import { DEMAND_CATEGORIES } from './benchmark';

/**
 * 華強電子網「烽火指數」（fh.hqew.com）——現貨市場的需求端指標（2026-09-12 導入）
 *
 * 首頁不需登入、伺服器端渲染，一次請求可取得：
 *   1. 市場三指數（搜索／庫存／價格，按月，2025/01 起）——寫在 script 的 IndexNew.mockData.market
 *   2. 「雲報價」30 顆當日熱料（型號／品牌／參考價）——HTML table
 * 「今日熱搜」與「熱度衝高」是 JS 載入的，第一版不碰。
 *
 * 設計原則（Danny 2026-09-12）：熱料清單**獨立於 150 顆基準料**，不混算、不互相比對，
 * 也先不跟 QQ 案件 BOM 比對（Danny 決定第一版只看熱料本身）。類別歸屬由品牌／料號規則決定，
 * 在風險矩陣自成第四欄「現貨熱搜」。
 *
 * 抓取由 GitHub Actions runner 執行再 POST 進來（Railway 的 IP 曾被華強封鎖且不會解封），
 * 程式端只負責解析與儲存。
 */

export const FENGHUO_SOURCE_URL = 'https://fh.hqew.com/';
export const FENGHUO_CACHE_KEY = 'fenghuo-index-v1';
const MAX_SNAPSHOTS = 26; // 半年

export interface FenghuoMarketPoint {
  month: string;          // "2026/08"
  search: number | null;
  stock: number | null;
  price: number | null;
}

export interface FenghuoHotPart {
  mpn: string;
  brand: string;          // 原文，如 "ST/意法"
  priceCny: number | null;
  categoryId: string | null;
}

export interface FenghuoSnapshot {
  fetchedAt: string;
  mpns: string[];
}

export interface FenghuoCache {
  version: 1;
  updatedAt: string;
  sourceUrl: string;
  market: FenghuoMarketPoint[];
  hotParts: FenghuoHotPart[];
  snapshots: FenghuoSnapshot[];   // 由舊到新，最後一筆＝hotParts 的那一次
}

// ==================== 解析 ====================

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function parsePrice(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** 市場三指數：找 `IndexNew.mockData.market = {...};`，用括號配對切出 JSON */
export function parseFenghuoMarket(html: string): FenghuoMarketPoint[] {
  const start = html.search(/IndexNew\.mockData\.market\s*=\s*\{/);
  if (start < 0) return [];
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(html.slice(braceStart, end + 1));
  } catch {
    return [];
  }
  const months: string[] = Array.isArray(parsed?.categories) ? parsed.categories.map(String) : [];
  const seriesMap = (key: string) => {
    const out = new Map<string, number>();
    for (const point of parsed?.[key]?.data ?? []) {
      const y = Number(point?.y);
      if (point?.dt && Number.isFinite(y)) out.set(String(point.dt), y);
    }
    return out;
  };
  const search = seriesMap('search');
  const stock = seriesMap('stock');
  const price = seriesMap('price');
  return months.map((month) => ({
    month,
    search: search.get(month) ?? null,
    stock: stock.get(month) ?? null,
    price: price.get(month) ?? null,
  }));
}

/** 雲報價表格：型號／品牌／參考價 */
export function parseFenghuoHotParts(html: string): FenghuoHotPart[] {
  const rowRegex = /class="product-name verf-detail"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td class="brand" title="([^"]*)">[^<]*<\/td>\s*<td><span class="price" title="([^"]*)">/g;
  const seen = new Set<string>();
  const parts: FenghuoHotPart[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(html)) !== null) {
    const mpn = decodeEntities(match[1]).toUpperCase();
    if (!mpn || seen.has(mpn)) continue;
    seen.add(mpn);
    const brand = decodeEntities(match[2]);
    parts.push({ mpn, brand, priceCny: parsePrice(decodeEntities(match[3])), categoryId: classifyHotPart(mpn, brand) });
  }
  return parts;
}

export function parseFenghuoHtml(html: string): { market: FenghuoMarketPoint[]; hotParts: FenghuoHotPart[] } {
  const market = parseFenghuoMarket(html);
  const hotParts = parseFenghuoHotParts(html);
  if (market.length === 0 && hotParts.length === 0) {
    throw new Error('烽火指數頁面解析不到市場指數與熱料表格（版面可能已改版）');
  }
  return { market, hotParts };
}

// ==================== 類別歸屬（品牌／料號規則） ====================
// 依序比對，先具體後籠統；C03（分離式）字首最雜放最後。全部不中再看品牌。
// 熱料多為通用料（STM32、IRF740、NE555），規則以現貨市場常見型號為主，不追求涵蓋全部。

const MPN_RULES: Array<[RegExp, string]> = [
  // C08 TVS / ESD（要在 C03 之前，SMAJ/SMBJ 會被二極體規則吃掉）
  [/^(SMAJ|SMBJ|SMCJ|SMDJ|SMF\d|SM\d{1,2}T|P4KE|P6KE|1\.5KE|5KP|PESD|PRTR|IP4[0-9]|TPD\d|ESD\d|ESDA|USBLC|SP0\d|SP1\d|SP3\d|SRV05|SLVU|1SMB|1SMA|D3V3|D5V0|DF2B|DF3D|DF5A|AZ5\d|ULC|UDD|SD05|SD12|SD24|SD36|PGB[01]|RCLAMP|PSOT|SR05|CDSOT|CDDFN|PTVS|TISP|SE0\d|NUP\d|NZQ|ESD5|ESD7|ESD9|V\d{2,3}ZA|V\d{2,3}MLA|MOV|TMOV|S\d{2}K\d)/, 'C08'],
  // C13 光耦 / 數位隔離器（要在 C10 之前）
  [/^(TLP\d|PC8\d|PC9\d|PC1\d|PC3\d|EL8\d|EL3\d|EL1\d|LTV|MOC\d|4N2\d|4N3\d|6N1\d|CNY\d|H11|HCPL|HCNW|ACPL|ACNW|FOD\d|TCMT|VO\d|VOM|SFH6|ADUM|ISO7\d|ISO1\d|ISOW|SI86|SI84|SI87|SI88|NSI\d|CA-IS|PI1\d|ORPC|KPC|ACSL|MOCD|PS28|PS25|PS93|ISO12\d|ISO15\d|ISO22\d)/, 'C13'],
  // C14 乙太網路 / 網通
  [/^(LAN\d|KSZ|W5\d{3}|W7500|DP83|RTL8|88E\d|AR8\d|IP101|YT8\d|JL\d{3,4}|ENC28|ENC42|ADIN1|BCM5|VSC8|MAX2498|IP175|RTL9)/, 'C14'],
  // C10 介面 IC
  [/^(TJA1|MCP25|SN65|SN75|MAX3\d{2}|MAX485|MAX13\d|MAX22\d|SP3\d{2}|SP48\d|ADM\d{3}|ST485|ST3232|ST1480|ICL32|ADM485|CH340|CH341|CH9|CP210|FT2\d|FT23\d|PL2303|CY7C6|USB2\d|TUSB|PCA82|PCA95|PCF85|TCAN|ISO1050|LTC28\d|SN74LVC|SN74AHC|74HC|74LVC|74AHC|74LS|74HCT|CD4\d|CD74|MC74|NLSF|TXB0|TXS0|LSF0|PCA9\d|TCA9\d|FSUSB|TS3USB|PI3USB|PS8|PTN3|TPD12S)/, 'C10'],
  // C07 晶體 / 振盪器
  [/^(ABM\d|ABL\d|ABS\d|ABLS|ASV|ASE|ASF|ECS-|ECX|FA-\d|FC-\d|NX\d{4}|NT\d{4}|CX\d{4}|SIT\d|DSC\d|TSX|XRCGB|XRCF|CSTNE|CSTCE|CSTCR|CSTLS|SG-\d|SG\d{4}|KC\d{4}|KX\d|LFXTAL|HC-49|HC49|49S|49U|YSX|YXC|X\d{4}[A-Z]|7[AB]-\d|Q\d{2}FA|MC-\d{3}|FL\d{4})/, 'C07'],
  // C05 MCU / 處理器 / 可程式邏輯（FPGA 併入處理器類）
  [/^(STM32|STM8|GD32|ATMEGA|ATTINY|ATSAM|ATXMEGA|PIC1\d|PIC2\d|PIC3\d|DSPIC|TMS320|MSP430|LPC\d|MK\d{2}|MKL|MKE|MIMX|IMX\d|RA\dM|RX\d{2}|RL78|R5F|R7F|ESP32|ESP8266|EFM32|EFR32|NRF5|CC2\d{3}|CC13|CC26|XMC\d|S32K|SAMD|SAME|AT91|MC9S|MCF5|HT66|HT32|N76E|NUC1|M0\d{2}[A-Z]|APM32|CH32|CH5\d{2}|MM32|AIR32|SPC5|TC3\d{2}|EP\dC|EP4C|EP3C|10M\d|5CE|5CG|XC\dS|XC6|XC7|XCZU|LCMXO|ICE40|LFE\d|AM335|AM62|AM64|RK3\d|H616|A64|S5P|MT7\d{3}|BCM2|ZYNQ|CYCLONE|MAX10|EFM8|C8051|STC\d|STC8|STC1|W78E|W79E|MG32|HC32|APM32|AT32|CW32|LKS32|SC32|BL6\d|FM33|ES32)/, 'C05'],
  // C04 記憶體 / Flash
  [/^(W25[NQX]|W29|MT2[589]|MT4[0-9]|MT5[0-9]|MT6[0-9]|IS4[2-6]|IS6[1-7]|IS25|K4[A-Z]\d|K9[FK]|H5[A-Z]{2}|H9|MX25|MX66|MX30|MX35|MX29|S25F|S29|S34|AT45|AT24|AT25|24LC|24AA|24C\d|25LC|25AA|M24|M95|GD25|GD5F|N25Q|FM25|FM24|MR25|CY15|MB85|W9[0-9]{2}|NT5|AS4C|AS6C|SST2|SST3|SST39|THGB|SDIN|EMMC|CAT24|BR24|ZD25|P25Q|EN25|XT25|BY25|FT25|NAND|DDR\d|MT41|MT40|MT47|MT48|K4B|K4A|H5TQ|H5AN|IS43|IS46|W63|W97|NT6|NT5C)/, 'C04'],
  // C01 MLCC
  [/^(GRM|GCM|GRT|GJM|GCJ|GRJ|GQM|GMA|GMD|GNM|CL0[3-9]|CL1[0-9]|CL2[0-9]|CL3[0-9]|CC0[2-9]|CC1[0-9]|CGA\d|C0402|C0603|C0805|C1206|C1210|C1812|C2220|KGM|UMK|TMK|EMK|LMK|GMK|MMK|HMK|CGJ|ZRB|LLL|GRJ|KAM|KCM|KTS|CKG|C[0-9]{4}[CXYZ][0-9]|08055|06035|06031|12065|04025|0603[BXYZ]|0402[BXYZ]|0805[BXYZ]|1206[BXYZ]|VJ0|VJ1|CS[0-9]{4}|TCC|MC0|MCCA|0201|AC0|CT41|CGB)/, 'C01'],
  // C11 電感 / 磁珠
  [/^(LQ[GHMW]|DFE|MLZ|MLP|MLF|NLV|NLC|SRN|SRR|SRP|CDRH|VLS|VLC|VLF|XAL|XFL|XEL|BLM|MPZ|PE-\d|744\d|CMR|LBR|PIMB|DLW|ACM\d|NFM|IHLP|IHLM|SPM|CLF|FXL|MSS|LPS|DO\d{4}|SLF|NR\d{4}|CD\d{2}|SWPA|SMLS|SDCL|CBC|LQP|HCI|FCI|ETQ|ELL|ELC|TYS|TYA|SPH|PIO|MHCI|MCS|SCD|SBC|SMFP|VLCF|NRS|NRH|LQS|MWSA|MLE|MMZ|MPZ|BKP|HZ\d|FBMH|GZ\d{2}|CIB|CIS|CIM|PBY|PZ\d{4}|WLSB|WLSC|TB\d{4}|BL\d{2})/, 'C11'],
  // C12 鋁質 / 固態電容
  [/^(EEE|EEH|EEU|EEF|EEV|EKM|UUD|UWX|UCD|UPW|UVR|UVZ|UPM|UHE|UCS|UKL|UUX|UWT|APXS|APSA|APXT|A75\d|A76\d|PCJ|PCE|PCS|PCR|PCG|PLV|PLG|RVT|RVS|RVE|RNS|SVP|SVPF|SVT|SEP|SEPF|PXA|PXG|PXE|PSG|PSC|EMZR|EMVE|EMVA|EMVY|EMVJ|EKMQ|EKMR|EKZE|EKY|EKZN|CAT\d{2}|CD\d{3}|VZ[HKL]|RC0J|RC1|ESY|ESH|ESK|ESX|ESM|ESL|ESE|ETE|EXV|EZR|EZV|NHG|NRE|NRS|NLE|NAZ|NKX|NPC|NEV|NSS|NVX|UBT|UBY|ULD|UHW|UES|UZJ|ZLH|ZLJ|ZLR|ZLS|YXG|YXF|YXA|YXJ|YXH|TVX|RC3|TKR|TKS|TAP|TAJ|T49|T52|T55|T59|T95|TPS[A-E]\d|TCJ|TLJ|B41|B43|B45|B47|SMD\d|SG\d{3}|SS\d{3}|CE\d{3}|CG\d{3})/, 'C12'],
  // C02 PMIC / 穩壓 / 電源 IC
  [/^(LM2\d{3}|LM1117|LM317|LM337|LM78\d|LM79\d|LM5\d{3}|LM3[0-9]{3}|LM43|LM46|LM61|LM62|LM63|LM7\d{3}|LM8\d{3}|LM9\d{3}|LMR\d|LMZ\d|LMS\d|LMV7|78L05|78M05|78\d{2}|79\d{2}|AMS1117|AP2112|AP63|AP22|AP2[0-9]{3}|AP7\d|AP3\d|AP1\d{3}|AP5\d|AZ1117|AZ34|AZ2|ME6\d|ME2\d|MP\d{4}|MPQ|MPM|MPS\d|TPS[0-9]{4,5}|TPSM|LP\d{4}|LP5|LT\d{4}|LTC\d{4}|LTM\d|ADP\d{3,4}|ADM\d{4}|MIC\d{4}|MAX\d{4}|MAX1\d{4}|NCP\d|NCV\d|NCS\d|FAN\d|SC\d{4}|RT\d{4}|RTQ|SY\d{4}|SGM\d{4}|TLV\d{3,5}|TL431|TL43\d|XC6\d|XC9\d|BQ\d{4,5}|UCC\d|UC38\d|UC28\d|UC39\d|VIPER|L78\d|L79\d|L59\d|LD1117|LD39|LDL|LDK|L6\d{3}|SPX|ISL\d{4}|IRS2|IR2\d|UCD\d|CN3\d|XL\d{4}|MT3\d{3}|MT2\d{3}|HT7\d|HT71|HT73|TP4\d{3}|TP5\d{3}|IP5\d{3}|IP6\d{3}|SC8\d{3}|CS5\d{3}|XR\d{4}|BD9\d|BD7\d|RN5|R1\d{3}|NJM\d|NJU\d|ACT\d|AXP|RK8\d|PF\d{4}|MC34\d|MC33\d|PT\d{4}|ETA\d|SLM\d{4}|SGM|LN\d{4}|LR\d{4}|ZX\d{4}|HX\d{4}|CX\d{4}|FP6|FS\d{4}|G5\d{3}|APW|AON\d{4}|SE\d{4}|SGM|TCS|TPS|OB\d{4}|PN\d{4}|CR6\d{3}|DK\d{3}|LNK\d|TNY\d|TOP2\d|INN\d|NCP1|SSL|BP\d{4}|ICE\d|TEA1|TEA2|MC44|LD7\d{3}|OZ9|DIO\d{4}|SCT\d{4}|SC\d{3}|RY\d{4}|JW\d{4}|SGM2|SGM6|SGM8|LTC3|LTC4|LTC29|ADP1|ADP2|ADP3|ADP5|ADP7|TPS6|TPS7|TPS5|TPS2|TPS3|TPS4|TPS8|BQ2|BQ7|BQ4|BQ5|LTM4|LTM8|EN\d{4}|EP53|EP5|EN6)/, 'C02'],
  // C09 類比 / 感測器 / 通用類比
  [/^(AD\d{3,4}|ADA4|ADS\d|ADC\d|DAC\d|OPA\d|OP\d{2,3}|LM358|LM324|LM339|LM393|LM386|LM321|LM258|LM2904|LM2902|LMV\d|LMC\d|LMP\d|LMH\d|TL07|TL08|TL06|TL05|TLC\d|TLE20|MCP6|MCP33|MCP3|MCP4|MCP9|INA\d|AD8\d{2}|ACS7|TMP\d|LM35|LM75|LM73|LM95|DS18|SHT\d|BME\d|BMP\d|MPU\d|ICM-|LSM\d|ADXL|MMA8|HDC\d|AHT\d|DHT\d|MAX4\d{2}|MAX9\d{2}|TS\d{3}[A-Z]|LTC1|LTC2|LTC6|LT1\d{3}|LT6\d{3}|NE555|NE556|LM555|LM556|SE555|TLC555|ICM7|CD4046|ULN2|ULN28|UDN|TBD62|MC1413|SN75441|L293|L298|DRV8|TB6|A4988|A49|TMC2|MAX7219|MAX7221|HT16|TM16|TM17|AIP|CH45|REF\d{2}|REF3|REF5|LM4040|LM4041|TL4|TLV431|ADR\d|AS5\d{3}|MLX9|TMR\d|SS49|A32\d{2}|A13\d{2}|AH\d{3}|DRV5|HAL\d|VEML|TSL2|APDS|OPT3|BH17|LTR-|MAX31|ADT7|TC74|MCP98|SI70|HTU2|SHTC|BMI\d|BMA\d|LIS\d|MMA7|ADXRS|ICG|MS5\d{3}|LPS\d|HX71|CS12|ADS1|ADS8|NAU7|MCP3|AD7\d{3}|AD9\d{3}|ADAU|WM89|PCM\d{4}|ES8\d{3}|CS4\d{3}|TAS5|TPA\d|PAM8|MAX98|LM4871|LM4890|NS4|HT6|MIX2|XPT2|TDA\d|LA4|MAX9814|LMV3|LMV8|TS9|TSV|MCP60|MCP61|MCP62|MCP64|MCP65|MCP66|MCP60|OPA2|OPA4|AD82|AD86|AD87|ADA|LTC10|LTC20|LT10|LT12|LT13|LT14|LT15|LT16|LT17|LT18|LT19|LT60|LT61|LT62|LT63|LT66|LM7301|LM8261|LMV32|LMV33|LMV35|LMV35|LMV6|LM6|TLV2|TLV3|TLV9|TLV1|TL03|TL02|RS8|GS8|SGM8|SGM3|SGM4|SGM9|LMV|LPV|ISL2|ICL7)/, 'C09'],
  // C15 散熱 / 風扇 / 電源模組
  [/^(AFB|EFB|ASB|FFB|PFB|BFB|KDE|GM\d{4}|MB\d{5}|B\d{4}S|B\d{4}D|F\d{4}[A-Z]|URB|URA|VRB|VRA|WRA|WRB|LDE|LD\d{2}-|LH\d{2}-|LS\d{2}-|PSK|VSK|K78\d{2}|B24\d{2}|MDS\d|PXH|PYB|IRM-|LRS-|NES-|RS-\d|SE-\d|HLG|ELG|LPV|RD-\d|RQ-\d|RAC\d|R-78|ROE|REC\d|TMR\d|TEN\d|TEL\d|TEC\d|TMA\d|TME\d|TBA\d|NF-|ME\d{2}[A-Z]{2}|MF\d{2}[A-Z]{2}|EE\d{2}[A-Z]|HA\d{2}[A-Z]|A\d{4}S|B\d{4}XT|PD\d{2}|F\d{4}S|VX\d|NDH|NDS|NDY|PQMC|PQ48|PQ60|PVX|DCM|PRM|VTM|BCM|IEE|IAA|IEB|IHB|IHD|IHF|IHG|IHH|IHI|IHJ|IPT|IPU|PDQ|PDQE|PKM|PKU|PKY|PKB|PKR|PKV|CQB|SQB|FDD\d{2}-|WD\d{2}-|WRE|WRF|VRE|VRF|K78|LDD|LDH|LDB|LDU|LCC|LCM|MFS|MMS|MSP-|MPD|MVR|NMP|NPF|RPD|RPS|RPT|RSD|RSP|RST|SCP|SD-\d|SDR|SP-\d|SPV|TDR|UHP|USP|WDR|XLG|XLN|ELN|CEN|CLG|CLA|LPC-|LPF|LPH|LPL|LPP|APV|APC|OWA|PLC|PLM|PLN|PLP|PWM-\d|GS\d{2}A|GST|GSM|GE\d{2}|OWA|NGE|SGA|SGAS|PSA|PSC-|PSU|PS-\d)/, 'C15'],
  // C06 連接器
  [/^(\d{1,2}-\d{5,7}-\d|\d{6,7}-\d|DF\d{2}[A-Z]?-|FH\d{2}[A-Z]?-|BM\d{2}B|B\d{1,2}B-|S\d{1,2}B-|PHR-|PHD|XHP-|ZHR|GHR|SHR|SM\d{2}B|TSW-|SSW-|FTSH|TSM-|PPTC|SSQ-|SLW-|ESQ-|M20-|M50-|M80-|PPPC|USB4\d{3}|U254|10118|61400|MCV|1734\d|2100\d|2200\d|5075\d|5088\d|5118\d|5116\d|SFW|SFV|RJ45|HR\d{2}|SMA-|MCX|MMCX|U\.FL|IPEX|WR-|61[0-9]{7}|69[0-9]{7}|53[0-9]{5}|50[0-9]{5}|51[0-9]{5}|52[0-9]{5}|43[0-9]{5}|22[0-9]{5}|15[0-9]{5}|87[0-9]{5}|DF\d{2}|ZX\d{2}-|GT\d{2}-|HDC|ML\d{2}|CVILUX|TF-|KH-|SIM|HC-\d|XH-|PH-|ZH-|JST|MX-|MOLEX|CJT|DIP|SIP|IDC|FPC-|FFC-|WAFER|PBT|PBS|PZ254|PH2|XH2|VH3|KF\d{3,4}|DG\d{3}|MKDS|MSTB|FKC|PTSA|PTSM|SPT|FMC|DFMC|MCVW|EDG|DG2|DG3|DG1|OSTT|OST|ED\d{3})/, 'C06'],
  // C03 MOSFET / 分離式（含二極體、BJT、閘流體）——最雜，放最後
  [/^(IRF|IRL|IPP|IPB|IPD|IPA|IPW|IPT|IPI|BSC|BSS|BSP|BSZ|BSR|SI\d{4}|SIR|SIS|SIA|SIB|SQ[0-9]|SQJ|SQD|SQM|SQP|SQS|AO\d{4}|AOD|AON|AOT|AOZ\d|AOB|AOI|AOK|AOL|AOU|FDN|FDS|FDC|FDD|FDP|FDB|FDV|FDMS|FDMC|FQP|FQA|FQD|NTD|NTR|NTS|NTT|NTM|NTB|NTA|NTP|NVD|NVT|NVM|NVB|NVR|STP|STD|STB|STW|STL|STF|STN|STS|STU|STK|STY|2N7\d{3}|DMN|DMP|DMG|DMT|DMC|DML|DMH|ZXM|ZXT|ZVN|ZVP|ZXTN|ZXTP|PMV|PMF|PMBF|PMBT|PMN|PMP|PMT|PHB|PHP|PHD|PSMN|PMEG|RSR|RQ[0-9]|RJK|RUE|RSQ|RSS|RSH|RTR|RTQ|RTF|RUM|RZM|TK\d{2,3}|TPC|TPH|TPN|TPCA|TPCP|SUD|SUM|SUP|SUB|SUI|IRFZ|IRFP|IRFB|IRFR|IRFS|IRFU|IRFH|IRFI|IRLZ|IRLR|IRLL|IRLU|IRLML|IRLB|AUIRF|AUIRL|MMBT|MMBF|MMBD|MMSD|MMSZ|MMDT|BC8\d{2}|BC5\d{2}|BC3\d{2}|BC1\d{2}|BC2\d{2}|BCP|BCX|BCW|BCV|BCM|2N2\d{3}|2N3\d{3}|2N4\d{3}|2N5\d{3}|2N6\d{3}|2SC|2SA|2SD|2SB|2SK|2SJ|MJE|MJD|MJL|MJW|MJ1|TIP\d|BD1\d{2}|BD2\d{2}|BD9\d{2}|BUL|BUK|BUT|BUZ|BUX|1N4\d{3}|1N5\d{3}|1N9\d{2}|1N6\d{3}|1N7\d{3}|BAT\d|BAV|BAS|BAW|BAR|BZX|BZT|BZV|BZG|BZD|SS\d{2}[A-Z]?\b|SS\d{2}$|SK\d{2}$|SB\d{3}|MBR|MBRS|MBRA|MBRB|MBRD|MBRF|SR\d{3}|B\d{3}[A-Z]-|B\d{2}[0-9]{2}[A-Z]|US1|US2|US3|ES1|ES2|ES3|RS1|RS2|RS3|RB\d{3}|SBR|STPS|STTH|MUR|MURS|UF\d{3}|FR\d{3}|LL4\d{3}|LL41|1SS|DB1\d{2}|DB2\d{2}|GBU|GBJ|GBL|GBP|KBP|KBU|KBJ|KBL|MB\d{1,2}[SF]|MB10|S1[A-M]\b|S2[A-M]\b|S3[A-M]\b|S5[A-M]\b|S1M|S2M|S3M|S5M|SM\d{4}|BT1\d{2}|BTA\d|BTB\d|TYN\d|MCR\d|C106|FGH|IGP|IGW|IKW|IHW|IRG|IRGP|IRGB|IRGS|STGP|STGW|STGB|STGF|NGTB|FGA|FGL|RJH|GT\d{2}|IXG|IXT|IXF|IXY|APT|CS\d{2}-|HY\d{4}|CJ\d{3,4}|WSF|WSD|WSP|WST|WSK|KIA|KTC|KTD|KTA|KSA|KSC|KSD|KSB|KSP|SS8050|SS8550|S8050|S8550|S9012|S9013|S9014|S9015|S9018|C1815|A1015|C945|C2655|A1020|BSS138|BSS84|SI2301|SI2302|SI2305|SI2306|SI2307|SI2308|SI2309|SI2312|SI2333|SI2338|SI4|SI7|SI9|AO3400|AO3401|AO3407|AO3413|AO3414|AO3415|AO3416|AO3418|AO3422|AO4|AO6|CJ2301|CJ2302|CJ2305|CJ3400|CJ3401|CJ3407|CJ4407|CJ7|NCE\d|NCEP|WSF|WSD|VS-|VBE|VBP|VS\d{2}|VF\d{2}|HGT|MDD|MD\d{4}|PJ\d{4}|SVD|SVN|SVF|SVS|LBSS|LMBT|LBC|LR\d{4}|HXY|HXN|WMK|WMS|WMN|WMO|WMB|WM\d{4}|UT\d{4}|UTC|UMW|UNI|GS\d{4}|BL\d{4}|NEXPERIA|PBSS|PBHV|PDTC|PDTA|PUMB|PUMD|PUMH|PXN|PXT|PZT|PZM|BZB|PDZ|BAP|BB\d{3}|BF\d{3})/, 'C03'],
];

// 品牌兜底：純粹只做某一類的品牌
const BRAND_RULES: Array<[RegExp, string]> = [
  [/MURATA|村田|SAMSUNG ELECTRO|三星电机|YAGEO|国巨|WALSIN|华新|TAIYO|太阳诱电|FENGHUA|风华|KYOCERA AVX|AVX/i, 'C01'],
  [/NEXPERIA|安世|AOS|万国|CJ\/长晶|长晶|JSMSEMI|HOTTECH|VBSEMI|MDD|辰达|GOODARK|固锝|SLKOR|萨科微|NCE|新洁能|WAYON|维安/i, 'C03'],
  [/WINBOND|华邦|MICRON|美光|SK HYNIX|海力士|ISSI|芯成|MACRONIX|旺宏|GIGADEVICE|兆易|KIOXIA|铠侠|SANDISK|闪迪|ETRON|钰创|ESMT|晶豪|PUYA|普冉|BOYA|博雅|XTX|芯天下|ZBIT|ZETTA|FUDAN|复旦微/i, 'C04'],
  [/ESPRESSIF|乐鑫|NORDIC|RENESAS|瑞萨|ALTERA|阿尔特拉|XILINX|赛灵思|LATTICE|莱迪思|GOWIN|高云|ANLOGIC|安路|WCH|沁恒|NUVOTON|新唐|HOLTEK|盛群|SINOWEALTH|中颖|ARTERY|雅特力|GEEHY|极海|HDSC|华大|XHSC|小华|SILABS|芯科|CYPRESS|赛普拉斯/i, 'C05'],
  [/TE CONNECTIVITY|泰科|MOLEX|莫仕|AMPHENOL|安费诺|HIROSE|广濑|JST|日压|SAMTEC|HARWIN|PHOENIX|菲尼克斯|JAE|日本航空|FCI|CVILUX|瀚荃|DEGSON|高松|XKB|星坤|HRS|WEIDMULLER|魏德米勒|DINKLE|町洋|WAGO|万可|HDGC|LEMO|雷莫|SUNKYE|华丰|KF\/|NINGBO KANGNIAN|康年/i, 'C06'],
  [/EPSON|爱普生|NDK|TXC|台晶|YXC|扬兴|ABRACON|艾普凌|ECS|SITIME|RIVER|大河|HOSONIC|鸿星|KDS|大真空|CITIZEN|西铁城|RAKON|RALTRON|CRYSTEK|SEIKO|JGHC|晶技|YSX|玉晶|SJK|晶科|ZHIXIN|YANGXING|YXC|JXCS/i, 'C07'],
  [/LITTELFUSE|力特|SEMTECH|升特|BOURNS|伯恩斯|PROTEK|普罗泰克|SOCAY|硕凯|UNSEMI|PROTECTION|LEIDITECH|雷卯|TVS|BRIGHTKING|君耀|AMAZING|晶焱|SEMTECH|WAYON|PRISEMI|芯导/i, 'C08'],
  [/SENSIRION|盛思锐|BOSCH|博世|INVENSENSE|TDK-INVENSENSE|MELEXIS|迈来芯|ALLEGRO|AMS OSRAM|艾迈斯|HONEYWELL|霍尼韦尔|TE SENSOR|MEMSIC|美新|QST|矽睿|SENODIA|深迪|ASAIR|奥松|AHT|GXCAS|广芯|SGMICRO|圣邦/i, 'C09'],
  [/COILCRAFT|线艺|SUNLORD|顺络|CHILISIN|奇力新|CODACA|科达嘉|CYNTEC|乾坤|WÜRTH|WURTH|伍尔特|BOURNS INDUCT|TAI-TECH|台庆|MAGLAYERS|美磊|SXN|色尔特|FERROCORE|风华电感|MERITEK|美利达|SUMIDA|胜美达|TOKO|东光|ABC TAIWAN|ABC/i, 'C11'],
  [/NICHICON|尼吉康|RUBYCON|红宝石|NIPPON CHEMI-CON|CHEMI-CON|黑金刚|贵弥功|PANASONIC ALU|松下电容|ELNA|伊娜|KEMET|基美|LELON|立隆|CAPXON|丰宾|AISHI|艾华|MAN YUE|万裕|SAMWHA|三和|JIANGHAI|江海|YMIN|永铭|SUNCON|三洋电容|LTEC|钰邦|APAQ|钰邦|JACKCON|冠坤|YAGEO ALU/i, 'C12'],
  [/EVERLIGHT|亿光|LITEON|光宝|SHARP|夏普|COSMO|冠西|AVAGO|BROADCOM OPTO|安华高|2PAI|荣湃|CHIPANALOG|川土微|NOVOSENSE|纳芯微|ORIENT|奥伦德|ISOCOM|KENTO|MORNSUN ISO/i, 'C13'],
  [/WIZNET|微知纳特|REALTEK|瑞昱|MARVELL|美满|MOTORCOMM|裕太|JLSEMI|景略|BROADCOM|博通|IC PLUS|九旸|MICREL|CORTINA|MAXLINEAR|AQUANTIA/i, 'C14'],
  [/DELTA FAN|台达风扇|SUNON|建准|NIDEC|尼得科|NMB|美蓓亚|ADDA|协禧|MEAN WELL|明纬|RECOM|TRACO|MORNSUN|金升阳|CUI|XP POWER|VICOR|BEL POWER|ARTESYN|雅特生|COSEL|科索|TDK-LAMBDA|MURATA POWER|ZLG|致远电源|HI-LINK|海凌科|DELTA ELECTRONICS|台达/i, 'C15'],
  // 大廠的類比／電源兜底：無字首規則命中時，這幾家最常見的現貨是穩壓與電源 IC
  [/^(TI|德州仪器|TEXAS INSTRUMENTS|ADI|亚德诺|ANALOG DEVICES|MPS|芯源|MONOLITHIC|RICHTEK|立锜|SILERGY|矽力杰|TOREX|特瑞仕|SG MICRO|圣邦微|3PEAK|思瑞浦|LINEAR|凌力尔特|MAXIM|美信|POWER INTEGRATIONS|PI|ONSEMI|安森美|MICROCHIP|微芯)/i, 'C02'],
];

export function classifyHotPart(mpn: string, brand: string): string | null {
  const upper = mpn.toUpperCase().trim();
  for (const [regex, categoryId] of MPN_RULES) {
    if (regex.test(upper)) return categoryId;
  }
  for (const [regex, categoryId] of BRAND_RULES) {
    if (regex.test(brand)) return categoryId;
  }
  return null;
}

const CATEGORY_ZH: Record<string, string> = {
  C01: '積層陶瓷電容', C02: '電源管理與穩壓 IC', C03: '功率 MOSFET / 分離式元件', C04: '記憶體 / Flash / DDR',
  C05: 'MCU / 處理器', C06: '連接器', C07: '晶體 / 振盪器', C08: 'TVS / ESD 保護元件', C09: '類比 IC / 感測器',
  C10: '介面 IC', C11: '電感 / 扼流圈', C12: '鋁質 / 固態電容', C13: '光耦 / 數位隔離器', C14: '乙太網路 / 網通 IC',
  C15: '散熱 / 風扇 / 電源模組',
};

export function fenghuoCategoryLabel(categoryId: string | null) {
  if (!categoryId) return '未歸類';
  return CATEGORY_ZH[categoryId] ?? DEMAND_CATEGORIES.find((c) => c.categoryId === categoryId)?.category ?? categoryId;
}

// ==================== 儲存與快照歷史 ====================

export async function readFenghuoCache(): Promise<FenghuoCache | null> {
  try {
    const cached = await getGenericCache(FENGHUO_CACHE_KEY);
    if (cached && cached.version === 1 && Array.isArray(cached.hotParts)) return cached as FenghuoCache;
  } catch (err) {
    console.warn('[Fenghuo] cache read failed:', err);
  }
  return null;
}

/**
 * 解析並寫入快取。同一天重複抓取只覆蓋最後一筆快照（不會灌出多筆同日紀錄）。
 * 市場指數若這次解析為空，沿用上次的（頁面偶爾只改版一半）。
 */
export async function ingestFenghuoHtml(html: string, now = new Date()): Promise<FenghuoCache> {
  const { market, hotParts } = parseFenghuoHtml(html);
  const previous = await readFenghuoCache();
  const fetchedAt = now.toISOString();
  const today = fetchedAt.slice(0, 10);
  const snapshots = (previous?.snapshots ?? []).filter((s) => s.fetchedAt.slice(0, 10) !== today);
  if (hotParts.length > 0) snapshots.push({ fetchedAt, mpns: hotParts.map((p) => p.mpn) });
  const next: FenghuoCache = {
    version: 1,
    updatedAt: fetchedAt,
    sourceUrl: FENGHUO_SOURCE_URL,
    market: market.length > 0 ? market : (previous?.market ?? []),
    hotParts: hotParts.length > 0 ? hotParts : (previous?.hotParts ?? []),
    snapshots: snapshots.slice(-MAX_SNAPSHOTS),
  };
  await setGenericCache(FENGHUO_CACHE_KEY, next);
  return next;
}

// ==================== 衍生視圖 ====================

export interface FenghuoMarketTrend {
  month: string;                 // 最新月份
  search: { value: number; momPct: number | null; yoyPct: number | null } | null;
  stock: { value: number; momPct: number | null; yoyPct: number | null } | null;
  price: { value: number; momPct: number | null; yoyPct: number | null } | null;
  /** 一句話：搜索升＋庫存降＝轉緊 */
  tone: 'tightening' | 'loosening' | 'flat';
  text: string;
}

function pct(curr: number | null | undefined, prev: number | null | undefined) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function computeMarketTrend(market: FenghuoMarketPoint[]): FenghuoMarketTrend | null {
  const valid = market.filter((p) => p.search != null || p.stock != null || p.price != null);
  if (valid.length === 0) return null;
  const latest = valid[valid.length - 1];
  const prev = valid[valid.length - 2];
  const yearAgo = valid.find((p) => {
    const [y, m] = p.month.split('/').map(Number);
    const [ly, lm] = latest.month.split('/').map(Number);
    return y === ly - 1 && m === lm;
  });
  const build = (key: 'search' | 'stock' | 'price') =>
    latest[key] == null ? null : { value: latest[key]!, momPct: pct(latest[key], prev?.[key]), yoyPct: pct(latest[key], yearAgo?.[key]) };
  const search = build('search');
  const stock = build('stock');
  const price = build('price');

  const searchUp = (search?.momPct ?? 0) >= 5;
  const stockDown = (stock?.momPct ?? 0) <= -3;
  const priceUp = (price?.momPct ?? 0) >= 3;
  const searchDown = (search?.momPct ?? 0) <= -5;
  const stockUp = (stock?.momPct ?? 0) >= 3;
  const tone: FenghuoMarketTrend['tone'] =
    (searchUp && (stockDown || priceUp)) || (stockDown && priceUp) ? 'tightening'
      : (searchDown && stockUp) ? 'loosening'
        : 'flat';

  const fmt = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
  const monthLabel = latest.month.replace('/', ' 年 ') + ' 月';
  const text = `華強烽火指數 ${monthLabel}：搜索指數月增 ${fmt(search?.momPct ?? null)}、庫存指數 ${fmt(stock?.momPct ?? null)}、價格指數 ${fmt(price?.momPct ?? null)}`
    + (tone === 'tightening' ? '，現貨市場整體轉緊。' : tone === 'loosening' ? '，現貨市場整體轉鬆。' : '，現貨市場大盤平穩。');
  return { month: latest.month, search, stock, price, tone, text };
}

export interface FenghuoHotPartView extends FenghuoHotPart {
  categoryLabel: string;
  weeksOnList: number;     // 含本次，連續出現在幾次快照
  isNew: boolean;          // 上一次快照沒有、本次有（首次快照一律 false：無從判斷）
}

export interface FenghuoCategoryCount {
  categoryId: string;
  total: number;
  fresh: number;           // 本週新上榜
}

export interface FenghuoView {
  available: boolean;
  updatedAt: string | null;
  sourceUrl: string;
  market: FenghuoMarketPoint[];
  trend: FenghuoMarketTrend | null;
  hotParts: FenghuoHotPartView[];
  categoryCounts: Record<string, FenghuoCategoryCount>;
  snapshotCount: number;
  hasPrevious: boolean;
}

export function buildFenghuoView(cache: FenghuoCache | null): FenghuoView {
  if (!cache) {
    return { available: false, updatedAt: null, sourceUrl: FENGHUO_SOURCE_URL, market: [], trend: null, hotParts: [], categoryCounts: {}, snapshotCount: 0, hasPrevious: false };
  }
  const snapshots = cache.snapshots;
  const latestIdx = snapshots.length - 1;
  const previousSet = latestIdx >= 1 ? new Set(snapshots[latestIdx - 1].mpns) : null;

  const hotParts: FenghuoHotPartView[] = cache.hotParts.map((part) => {
    let weeks = 0;
    for (let i = latestIdx; i >= 0; i--) {
      if (snapshots[i].mpns.includes(part.mpn)) weeks++;
      else break;
    }
    return {
      ...part,
      categoryLabel: fenghuoCategoryLabel(part.categoryId),
      weeksOnList: Math.max(1, weeks),
      isNew: previousSet ? !previousSet.has(part.mpn) : false,
    };
  });

  const categoryCounts: Record<string, FenghuoCategoryCount> = {};
  for (const cat of DEMAND_CATEGORIES) {
    const inCat = hotParts.filter((p) => p.categoryId === cat.categoryId);
    categoryCounts[cat.categoryId] = {
      categoryId: cat.categoryId,
      total: inCat.length,
      fresh: inCat.filter((p) => p.isNew).length,
    };
  }

  return {
    available: true,
    updatedAt: cache.updatedAt,
    sourceUrl: cache.sourceUrl,
    market: cache.market,
    trend: computeMarketTrend(cache.market),
    hotParts,
    categoryCounts,
    snapshotCount: snapshots.length,
    hasPrevious: !!previousSet,
  };
}

export async function getFenghuoView(): Promise<FenghuoView> {
  return buildFenghuoView(await readFenghuoCache());
}
