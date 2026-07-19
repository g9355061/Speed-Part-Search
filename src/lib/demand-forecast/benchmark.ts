// 基準料件名單（2026-07-10 重構為「角色制 + 彈性配額」）
//
// 設計：每顆料有明確任務（role），類別配額依重要性分配（總預算 150 顆）：
//   - thermometer 溫度計料：大宗共用、多源可替代的 jellybean——偵測「市場級」變化
//   - chokepoint  咽喉料：單一來源／無 pin-to-pin 替代／歷史配貨重災——偵測「單點斷供」
//   - field       實戰料：初始為常見實用料種子；待 search_logs 累積後由
//                 /api/demand-forecast/field-suggestions 建議替換成「使用者真實搜尋的料」
//
// 名單維護規則：
//   1. 新增料號必須先經 DigiKey/Mouser API 驗證「查得到 + Active + 有庫存」（2026-06-06 EMPTY_RESULT 教訓）。
//      本次新增 16 顆全數驗證通過（2026-07-10）。
//   2. 季度體檢：/api/demand-forecast/benchmark-health 檢查 EOL／連續無資料／死訊號（數字長期不動）／重複。
//   3. 換料會使該顆趨勢訊號靜默一週（無上週快照可比），屬預期行為。

export type PartRole = 'thermometer' | 'chokepoint' | 'field';

export const ROLE_LABEL: Record<PartRole, string> = {
  thermometer: '溫度計',
  chokepoint: '咽喉',
  field: '實戰',
};

export interface BenchmarkPart {
  categoryId: string;
  category: string;
  subCategory: string;
  mpn: string;
  manufacturer: string;
  family: string;
  role: PartRole;
}

// 類別配額（合計 150）：C01 MLCC 13、C02 PMIC 12、C03 MOSFET 12、C04 記憶體 14、C05 MCU 12、
// C06 連接器 8、C07 石英 9、C08 防護 6、C09 類比/感測 10、C10 介面 10、C11 電感 10、
// C12 鋁電/聚合物 9、C13 光耦/隔離 9、C14 乙太網 10、C15 散熱/電源模組 6
export const BENCHMARK_PARTS: BenchmarkPart[] = [
  // ── C01 MLCC（13）──────────────────────────────────────
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'GRM188R60J106ME47D', manufacturer: 'Murata', family: '0603 10uF 6.3V X5R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'GRM188R61A106KE69D', manufacturer: 'Murata', family: '0603 10uF 10V X5R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'CL21A106KPFNNNE', manufacturer: 'Samsung Electro-Mechanics', family: '0805 10uF 10V X5R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'GRM21BR61C106KE15L', manufacturer: 'Murata', family: '0805 10uF 16V X5R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'GRM155R60J475ME87D', manufacturer: 'Murata', family: '0402 4.7uF 6.3V X5R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'CL10A106MQ8NNNC', manufacturer: 'Samsung Electro-Mechanics', family: '0603 10uF 6.3V X5R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'C1608X5R1A106M080AC', manufacturer: 'TDK', family: '0603 10uF 10V X5R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'General decoupling 0.1uF', mpn: 'CC0603KRX7R9BB104', manufacturer: 'Yageo', family: '0603 0.1uF 50V X7R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'General decoupling 0.1uF', mpn: 'GRM155R71C104KA88D', manufacturer: 'Murata', family: '0402 0.1uF 16V X7R', role: 'thermometer' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'Large-case high-cap X7R (歷史配貨重災區)', mpn: 'GRM32ER71A476KE15L', manufacturer: 'Murata', family: '1210 47uF 10V X7R', role: 'chokepoint' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'Large-case high-cap X7R (歷史配貨重災區)', mpn: 'C2012X7R1A106K125AC', manufacturer: 'TDK', family: '0805 10uF 10V X7R', role: 'chokepoint' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'CL21A106KAYNNNE', manufacturer: 'Samsung Electro-Mechanics', family: '0805 10uF 25V X5R', role: 'field' },
  { categoryId: 'C01', category: 'MLCC', subCategory: 'High-capacitance 0402/0603/0805 X5R/X7R', mpn: 'CL05A106MQ5NUNC', manufacturer: 'Samsung Electro-Mechanics', family: '0402 10uF 6.3V X5R', role: 'field' },

  // ── C02 PMIC / Regulator（12）──────────────────────────
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: 'Buck, boost, LDO, power-management support', mpn: 'TPS54331DR', manufacturer: 'Texas Instruments', family: '3A step-down regulator', role: 'thermometer' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: 'Buck, boost, LDO, power-management support', mpn: 'TPS54560DDAR', manufacturer: 'Texas Instruments', family: '60V 5A buck regulator', role: 'thermometer' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: 'Buck, boost, LDO, power-management support', mpn: 'LM2596S-5.0/NOPB', manufacturer: 'Texas Instruments', family: '5V buck regulator', role: 'thermometer' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: 'Buck, boost, LDO, power-management support', mpn: 'MIC5219-3.3YM5-TR', manufacturer: 'Microchip', family: '3.3V LDO', role: 'thermometer' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: 'Buck, boost, LDO, power-management support', mpn: 'MP1584EN-LF-Z', manufacturer: 'Monolithic Power Systems', family: '3A buck regulator', role: 'thermometer' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: 'Buck, boost, LDO, power-management support', mpn: 'AP7333-33SAG-7', manufacturer: 'Diodes Inc.', family: '3.3V LDO', role: 'thermometer' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: '無直接替代的特殊電源 IC', mpn: 'TPS7A4700RGWR', manufacturer: 'Texas Instruments', family: 'Low-noise LDO', role: 'chokepoint' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: '無直接替代的特殊電源 IC', mpn: 'TPS61088RHLR', manufacturer: 'Texas Instruments', family: 'High-power boost converter', role: 'chokepoint' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: '無直接替代的特殊電源 IC', mpn: 'TPS51200DRCR', manufacturer: 'Texas Instruments', family: 'DDR termination regulator', role: 'chokepoint' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: '無直接替代的特殊電源 IC', mpn: 'LM5164DDAR', manufacturer: 'Texas Instruments', family: '100V synchronous buck', role: 'chokepoint' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: 'Buck, boost, LDO, power-management support', mpn: 'TPS62130RGTR', manufacturer: 'Texas Instruments', family: '3A synchronous buck', role: 'field' },
  { categoryId: 'C02', category: 'PMIC / Regulator', subCategory: 'Buck, boost, LDO, power-management support', mpn: 'TLV62569DBVR', manufacturer: 'Texas Instruments', family: '2A synchronous buck', role: 'field' },

  // ── C03 MOSFET / Power Discrete（12）───────────────────
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'Low-voltage and high-current switching devices', mpn: 'AO3400A', manufacturer: 'Alpha & Omega Semiconductor', family: 'N-channel MOSFET', role: 'thermometer' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'Low-voltage and high-current switching devices', mpn: 'AO3401A', manufacturer: 'Alpha & Omega Semiconductor', family: 'P-channel MOSFET', role: 'thermometer' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'Low-voltage and high-current switching devices', mpn: 'BSS138LT1G', manufacturer: 'onsemi', family: 'N-channel MOSFET (level shift)', role: 'thermometer' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'Low-voltage and high-current switching devices', mpn: 'FDN306P', manufacturer: 'onsemi', family: 'P-channel MOSFET', role: 'thermometer' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'Low-voltage and high-current switching devices', mpn: 'STD30NF06LT4', manufacturer: 'STMicroelectronics', family: '60V N-channel MOSFET', role: 'thermometer' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'Low-voltage and high-current switching devices', mpn: 'STL110N10F7', manufacturer: 'STMicroelectronics', family: '100V power MOSFET', role: 'thermometer' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: '原廠專屬製程，無 pin-to-pin 替代', mpn: 'CSD18540Q5B', manufacturer: 'Texas Instruments', family: 'NexFET power MOSFET', role: 'chokepoint' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: '原廠專屬製程，無 pin-to-pin 替代', mpn: 'CSD17577Q3A', manufacturer: 'Texas Instruments', family: 'NexFET power MOSFET', role: 'chokepoint' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: '原廠專屬製程，無 pin-to-pin 替代', mpn: 'BSC340N08NS3G', manufacturer: 'Infineon', family: '80V power MOSFET', role: 'chokepoint' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'SiC（AI 伺服器電源趨勢料）', mpn: 'C3M0060065D', manufacturer: 'Wolfspeed', family: '650V SiC MOSFET', role: 'chokepoint' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'Low-voltage and high-current switching devices', mpn: 'Si2302CDS-T1-GE3', manufacturer: 'Vishay', family: 'N-channel MOSFET', role: 'field' },
  { categoryId: 'C03', category: 'MOSFET / Power Discrete', subCategory: 'Low-voltage and high-current switching devices', mpn: 'DMG2305UX-7', manufacturer: 'Diodes Inc.', family: 'P-channel MOSFET', role: 'field' },

  // ── C04 Memory / Flash / DDR Proxy（14）────────────────
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'W25Q128JVSIQ', manufacturer: 'Winbond', family: '128Mb SPI NOR flash', role: 'thermometer' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'MX25L12835FMI-10G', manufacturer: 'Macronix', family: '128Mb SPI NOR flash', role: 'thermometer' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'MT25QL128ABA1ESE-0SIT', manufacturer: 'Micron', family: '128Mb SPI NOR flash', role: 'thermometer' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'S25FL128LAGMFI010', manufacturer: 'Infineon', family: '128Mb SPI NOR flash', role: 'thermometer' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'W25Q256JVEIQ', manufacturer: 'Winbond', family: '256Mb SPI NOR flash', role: 'thermometer' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'MX25L25645GM2I-08G', manufacturer: 'Macronix', family: '256Mb SPI NOR flash', role: 'thermometer' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: '稀有製程/單源記憶體', mpn: 'S29GL01GS11TFI010', manufacturer: 'Infineon', family: '1Gb parallel NOR flash', role: 'chokepoint' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: '稀有製程/單源記憶體', mpn: 'MT40A512M16GE-075E:B', manufacturer: 'Micron', family: 'DDR4 SDRAM', role: 'chokepoint' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: '稀有製程/單源記憶體', mpn: 'IS43LQ32128A-062BBLI', manufacturer: 'ISSI', family: 'LPDDR4 memory', role: 'chokepoint' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: '稀有製程/單源記憶體', mpn: 'FM25V10-G', manufacturer: 'Infineon', family: '1Mb SPI FRAM（單源）', role: 'chokepoint' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: '稀有製程/單源記憶體', mpn: 'AS4C128M16D3B-12BIN', manufacturer: 'Alliance Memory', family: 'DDR3 SDRAM', role: 'chokepoint' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'MT41K256M16TW-107:P', manufacturer: 'Micron', family: 'DDR3L SDRAM', role: 'field' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'IS43QR16256B-083RBLI', manufacturer: 'ISSI', family: 'DDR4 SDRAM', role: 'field' },
  { categoryId: 'C04', category: 'Memory / Flash / DDR Proxy', subCategory: 'NOR flash, DDR4, DDR5, LPDDR proxy parts', mpn: 'W9825G6KH-6', manufacturer: 'Winbond', family: 'SDRAM 256Mb', role: 'field' },

  // ── C05 MCU / Processor（12）───────────────────────────
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: 'Industrial, consumer, automotive MCU families', mpn: 'STM32F103C8T6', manufacturer: 'STMicroelectronics', family: 'Arm Cortex-M3 MCU', role: 'thermometer' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: 'Industrial, consumer, automotive MCU families', mpn: 'STM32F407VGT6', manufacturer: 'STMicroelectronics', family: 'Arm Cortex-M4 MCU', role: 'thermometer' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: 'Industrial, consumer, automotive MCU families', mpn: 'ATMEGA328P-AU', manufacturer: 'Microchip', family: '8-bit AVR MCU', role: 'thermometer' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: '車規/單源/高階 MCU（斷供高後果）', mpn: 'S32K144HFT0VLLT', manufacturer: 'NXP', family: 'Automotive MCU', role: 'chokepoint' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: '車規/單源/高階 MCU（斷供高後果）', mpn: 'TC277TP64F200NDC', manufacturer: 'Infineon', family: 'AURIX automotive MCU', role: 'chokepoint' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: '車規/單源/高階 MCU（斷供高後果）', mpn: 'STM32H743VIT6', manufacturer: 'STMicroelectronics', family: 'High-performance MCU', role: 'chokepoint' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: '車規/單源/高階 MCU（斷供高後果）', mpn: 'MK64FN1M0VLL12', manufacturer: 'NXP', family: 'Kinetis MCU', role: 'chokepoint' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: '車規/單源/高階 MCU（斷供高後果）', mpn: 'ESP32-S3-WROOM-1-N8', manufacturer: 'Espressif', family: 'WiFi/BLE 模組（單一原廠）', role: 'chokepoint' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: 'Industrial, consumer, automotive MCU families', mpn: 'STM32G474RET6', manufacturer: 'STMicroelectronics', family: 'Mixed-signal MCU', role: 'field' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: 'Industrial, consumer, automotive MCU families', mpn: 'ATSAME70Q21B-AN', manufacturer: 'Microchip', family: 'Arm Cortex-M7 MCU', role: 'field' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: 'Industrial, consumer, automotive MCU families', mpn: 'PIC32MX795F512L-80I/PT', manufacturer: 'Microchip', family: '32-bit MCU', role: 'field' },
  { categoryId: 'C05', category: 'MCU / Processor', subCategory: 'Industrial, consumer, automotive MCU families', mpn: 'CY8C4147AZI-S475', manufacturer: 'Infineon', family: 'PSoC MCU', role: 'field' },

  // ── C06 Connector（8）──────────────────────────────────
  { categoryId: 'C06', category: 'Connector', subCategory: 'FPC, board-to-board, wire-to-board, USB-C', mpn: 'SM02B-SRSS-TB(LF)(SN)', manufacturer: 'JST', family: 'Wire-to-board connector', role: 'thermometer' },
  { categoryId: 'C06', category: 'Connector', subCategory: 'FPC, board-to-board, wire-to-board, USB-C', mpn: 'S10B-PH-SM4-TB(LF)(SN)', manufacturer: 'JST', family: 'PH series connector', role: 'thermometer' },
  { categoryId: 'C06', category: 'Connector', subCategory: 'FPC, board-to-board, wire-to-board, USB-C', mpn: '53261-0271', manufacturer: 'Molex', family: 'Wire-to-board header', role: 'thermometer' },
  { categoryId: 'C06', category: 'Connector', subCategory: 'FPC, board-to-board, wire-to-board, USB-C', mpn: '10118194-0001LF', manufacturer: 'Amphenol ICC', family: 'USB connector', role: 'thermometer' },
  { categoryId: 'C06', category: 'Connector', subCategory: '精密連接器（Hirose 交期歷史震盪大）', mpn: 'FH12-10S-0.5SH(55)', manufacturer: 'Hirose', family: 'FPC/FFC connector', role: 'chokepoint' },
  { categoryId: 'C06', category: 'Connector', subCategory: '精密連接器（Hirose 交期歷史震盪大）', mpn: 'DF40C-60DP-0.4V(51)', manufacturer: 'Hirose', family: 'Board-to-board connector', role: 'chokepoint' },
  { categoryId: 'C06', category: 'Connector', subCategory: 'FPC, board-to-board, wire-to-board, USB-C', mpn: '505110-1092', manufacturer: 'Molex', family: 'FPC connector', role: 'field' },
  { categoryId: 'C06', category: 'Connector', subCategory: 'FPC, board-to-board, wire-to-board, USB-C', mpn: '503480-1000', manufacturer: 'Molex', family: 'FPC connector', role: 'field' },

  // ── C07 Crystal / Oscillator（9）───────────────────────
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '32.768 kHz plus 8/24/25 MHz timing parts', mpn: 'ECS-327-12.5-34B-TR', manufacturer: 'ECS', family: '32.768 kHz crystal', role: 'thermometer' },
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '32.768 kHz plus 8/24/25 MHz timing parts', mpn: 'ABM8G-25.000MHZ-18-D2Y-T', manufacturer: 'Abracon', family: '25 MHz crystal', role: 'thermometer' },
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '32.768 kHz plus 8/24/25 MHz timing parts', mpn: 'ABM3B-8.000MHZ-B2-T', manufacturer: 'Abracon', family: '8 MHz crystal', role: 'thermometer' },
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '32.768 kHz plus 8/24/25 MHz timing parts', mpn: 'AB38T-32.768KHZ', manufacturer: 'Abracon', family: '32.768 kHz crystal', role: 'thermometer' },
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '特定原廠時脈（NDK/SiTime/Microchip）', mpn: 'NX3225SA-25.000M-STD-CRS-2', manufacturer: 'NDK', family: '25 MHz crystal', role: 'chokepoint' },
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '特定原廠時脈（NDK/SiTime/Microchip）', mpn: 'SIT8008BI-73-33E-25.000000E', manufacturer: 'SiTime', family: '25 MHz MEMS oscillator', role: 'chokepoint' },
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '特定原廠時脈（NDK/SiTime/Microchip）', mpn: 'DSC1001CI2-025.0000', manufacturer: 'Microchip', family: '25 MHz oscillator', role: 'chokepoint' },
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '32.768 kHz plus 8/24/25 MHz timing parts', mpn: 'ABM10W-24.0000MHZ-8-D1X-T3', manufacturer: 'Abracon', family: '24 MHz crystal', role: 'field' },
  { categoryId: 'C07', category: 'Crystal / Oscillator', subCategory: '32.768 kHz plus 8/24/25 MHz timing parts', mpn: 'ECS-2520MV-250-CN-TR', manufacturer: 'ECS', family: '25 MHz oscillator', role: 'field' },

  // ── C08 TVS / ESD / Protection（6）─────────────────────
  { categoryId: 'C08', category: 'TVS / ESD / Protection', subCategory: 'USB, signal, and board-level surge protection', mpn: 'ESD5Z5.0T1G', manufacturer: 'onsemi', family: 'Single-line ESD diode', role: 'thermometer' },
  { categoryId: 'C08', category: 'TVS / ESD / Protection', subCategory: 'USB, signal, and board-level surge protection', mpn: 'TPD4E05U06DQAR', manufacturer: 'Texas Instruments', family: '4-channel ESD protection', role: 'thermometer' },
  { categoryId: 'C08', category: 'TVS / ESD / Protection', subCategory: 'USB, signal, and board-level surge protection', mpn: 'SP0503BAHTG', manufacturer: 'Littelfuse', family: 'Multi-line ESD array', role: 'thermometer' },
  { categoryId: 'C08', category: 'TVS / ESD / Protection', subCategory: 'USB, signal, and board-level surge protection', mpn: 'SMBJ5.0CA', manufacturer: 'Littelfuse', family: 'TVS diode', role: 'thermometer' },
  { categoryId: 'C08', category: 'TVS / ESD / Protection', subCategory: '特定原廠防護陣列', mpn: 'SRV05-4.TCT', manufacturer: 'Semtech', family: 'ESD protection array', role: 'chokepoint' },
  { categoryId: 'C08', category: 'TVS / ESD / Protection', subCategory: 'USB, signal, and board-level surge protection', mpn: 'USBLC6-2SC6', manufacturer: 'STMicroelectronics', family: 'USB ESD protection diode', role: 'field' },

  // ── C09 Analog / Sensor（10）───────────────────────────
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: 'Op amps, current monitors, temp and motion sensors', mpn: 'LM358DR', manufacturer: 'Texas Instruments', family: 'Dual op amp', role: 'thermometer' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: 'Op amps, current monitors, temp and motion sensors', mpn: 'LMV324IDR', manufacturer: 'Texas Instruments', family: 'Quad low-voltage op amp', role: 'thermometer' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: 'Op amps, current monitors, temp and motion sensors', mpn: 'TLV9062IDR', manufacturer: 'Texas Instruments', family: 'Dual op amp', role: 'thermometer' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: '單源感測/高精度類比', mpn: 'ACS712ELCTR-05B-T', manufacturer: 'Allegro MicroSystems', family: 'Hall current sensor（單源）', role: 'chokepoint' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: '單源感測/高精度類比', mpn: 'TMP117AIDRVR', manufacturer: 'Texas Instruments', family: 'Precision temperature sensor', role: 'chokepoint' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: '單源感測/高精度類比', mpn: 'INA226AIDGSR', manufacturer: 'Texas Instruments', family: 'Current/power monitor', role: 'chokepoint' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: 'Op amps, current monitors, temp and motion sensors', mpn: 'INA219AIDR', manufacturer: 'Texas Instruments', family: 'Current monitor', role: 'field' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: 'Op amps, current monitors, temp and motion sensors', mpn: 'LM75BDP,118', manufacturer: 'NXP', family: 'Temperature sensor', role: 'field' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: 'Op amps, current monitors, temp and motion sensors', mpn: 'LIS2DH12TR', manufacturer: 'STMicroelectronics', family: 'Accelerometer', role: 'field' },
  { categoryId: 'C09', category: 'Analog / Sensor', subCategory: 'Op amps, current monitors, temp and motion sensors', mpn: 'OPA197IDR', manufacturer: 'Texas Instruments', family: 'Precision op amp', role: 'field' },

  // ── C10 Interface IC（10）──────────────────────────────
  { categoryId: 'C10', category: 'Interface IC', subCategory: 'CAN, RS-485, USB-UART, Ethernet PHY/controller', mpn: 'MCP2562-E/SN', manufacturer: 'Microchip', family: 'CAN transceiver', role: 'thermometer' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: 'CAN, RS-485, USB-UART, Ethernet PHY/controller', mpn: 'MAX485ESA+', manufacturer: 'Analog Devices', family: 'RS-485 transceiver', role: 'thermometer' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: 'CAN, RS-485, USB-UART, Ethernet PHY/controller', mpn: 'ADM485ARZ', manufacturer: 'Analog Devices', family: 'RS-485 transceiver', role: 'thermometer' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: '單一原廠介面 IC（FTDI/SiLabs/WIZnet）', mpn: 'FT232RNL-REEL', manufacturer: 'FTDI', family: 'USB-UART bridge（單源）', role: 'chokepoint' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: '單一原廠介面 IC（FTDI/SiLabs/WIZnet）', mpn: 'CP2102N-A02-GQFN28R', manufacturer: 'Silicon Labs', family: 'USB-UART bridge（單源）', role: 'chokepoint' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: '單一原廠介面 IC（FTDI/SiLabs/WIZnet）', mpn: 'W5500', manufacturer: 'WIZnet', family: 'Ethernet controller（單源）', role: 'chokepoint' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: 'CAN, RS-485, USB-UART, Ethernet PHY/controller', mpn: 'SN65HVD230DR', manufacturer: 'Texas Instruments', family: 'CAN transceiver', role: 'field' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: 'CAN, RS-485, USB-UART, Ethernet PHY/controller', mpn: 'LAN8720A-CP-TR', manufacturer: 'Microchip', family: 'Ethernet PHY', role: 'field' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: 'CAN, RS-485, USB-UART, Ethernet PHY/controller', mpn: 'KSZ8081RNBCA-TR', manufacturer: 'Microchip', family: 'Ethernet PHY', role: 'field' },
  { categoryId: 'C10', category: 'Interface IC', subCategory: 'CAN, RS-485, USB-UART, Ethernet PHY/controller', mpn: 'MCP2515-I/SO', manufacturer: 'Microchip', family: 'CAN controller', role: 'field' },

  // ── C11 Inductor / Choke（10）──────────────────────────
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: 'Power inductors and EMI chokes for DC/DC and VRM', mpn: '74437368010', manufacturer: 'Wurth Elektronik', family: '1uH power inductor', role: 'thermometer' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: 'Power inductors and EMI chokes for DC/DC and VRM', mpn: '74437368022', manufacturer: 'Wurth Elektronik', family: '2.2uH power inductor', role: 'thermometer' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: 'Power inductors and EMI chokes for DC/DC and VRM', mpn: 'SRP4020TA-2R2M', manufacturer: 'Bourns', family: '2.2uH shielded inductor', role: 'thermometer' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: 'Power inductors and EMI chokes for DC/DC and VRM', mpn: 'SRP5030T-4R7M', manufacturer: 'Bourns', family: '4.7uH shielded inductor', role: 'thermometer' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: 'Power inductors and EMI chokes for DC/DC and VRM', mpn: 'SRP4020TA-1R0M', manufacturer: 'Bourns', family: '1uH power inductor', role: 'thermometer' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: 'Power inductors and EMI chokes for DC/DC and VRM', mpn: 'LQH43PN4R7M02L', manufacturer: 'Murata', family: '4.7uH inductor', role: 'thermometer' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: 'Power inductors and EMI chokes for DC/DC and VRM', mpn: 'NRS4018T100MDGJ', manufacturer: 'Taiyo Yuden', family: '10uH power inductor', role: 'thermometer' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: '大型功率電感/共模扼流圈', mpn: '7443551470', manufacturer: 'Wurth Elektronik', family: '47uH power inductor', role: 'chokepoint' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: '大型功率電感/共模扼流圈', mpn: '744231091', manufacturer: 'Wurth Elektronik', family: 'Common mode choke', role: 'chokepoint' },
  { categoryId: 'C11', category: 'Inductor / Choke', subCategory: 'Power inductors and EMI chokes for DC/DC and VRM', mpn: '74438335022', manufacturer: 'Wurth Elektronik', family: '2.2uH power inductor', role: 'field' },

  // ── C12 Aluminum / Polymer Capacitor（9）───────────────
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: 'Bulk capacitance for PSU, server, adapter boards', mpn: 'EEE-FK1V101P', manufacturer: 'Panasonic', family: '100uF 35V aluminum electrolytic', role: 'thermometer' },
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: 'Bulk capacitance for PSU, server, adapter boards', mpn: 'EEE-FK1E101P', manufacturer: 'Panasonic', family: '100uF 25V aluminum electrolytic', role: 'thermometer' },
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: 'Bulk capacitance for PSU, server, adapter boards', mpn: 'EEE-FT1V470AR', manufacturer: 'Panasonic', family: '47uF 35V aluminum electrolytic', role: 'thermometer' },
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: 'Bulk capacitance for PSU, server, adapter boards', mpn: 'UUD1H101MNL1GS', manufacturer: 'Nichicon', family: '100uF 50V aluminum electrolytic', role: 'thermometer' },
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: '聚合物電容（AI 伺服器 VRM 需求急升）', mpn: '6SVPC220M', manufacturer: 'Panasonic', family: '220uF polymer capacitor', role: 'chokepoint' },
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: '聚合物電容（AI 伺服器 VRM 需求急升）', mpn: '10SVPC270M', manufacturer: 'Panasonic', family: '270uF polymer capacitor', role: 'chokepoint' },
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: '聚合物電容（AI 伺服器 VRM 需求急升）', mpn: '25SVPF180M', manufacturer: 'Panasonic', family: '180uF polymer capacitor', role: 'chokepoint' },
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: 'Bulk capacitance for PSU, server, adapter boards', mpn: '875115352002', manufacturer: 'Wurth Elektronik', family: '220uF polymer capacitor', role: 'field' },
  { categoryId: 'C12', category: 'Aluminum / Polymer Capacitor', subCategory: 'Bulk capacitance for PSU, server, adapter boards', mpn: 'PLF1C101MDO1TD', manufacturer: 'Nichicon', family: '100uF polymer capacitor', role: 'field' },

  // ── C13 Optocoupler / Digital Isolator（9）─────────────
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: 'Isolation for PSU, industrial, EV and controls', mpn: 'PC817X2NSZ9F', manufacturer: 'Sharp', family: 'Photocoupler', role: 'thermometer' },
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: 'Isolation for PSU, industrial, EV and controls', mpn: 'TLP185(SE', manufacturer: 'Toshiba', family: 'Photocoupler', role: 'thermometer' },
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: 'Isolation for PSU, industrial, EV and controls', mpn: 'FOD817ASD', manufacturer: 'onsemi', family: 'Optocoupler', role: 'thermometer' },
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: 'Isolation for PSU, industrial, EV and controls', mpn: 'ACPL-217-56BE', manufacturer: 'Broadcom', family: 'Phototransistor optocoupler', role: 'thermometer' },
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: '數位隔離器（各原廠互不相容）', mpn: 'SI8641BB-B-IS1', manufacturer: 'Skyworks/Silicon Labs', family: 'Digital isolator', role: 'chokepoint' },
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: '數位隔離器（各原廠互不相容）', mpn: 'ADUM1401ARWZ', manufacturer: 'Analog Devices', family: 'Digital isolator', role: 'chokepoint' },
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: '數位隔離器（各原廠互不相容）', mpn: 'ISO7741FDBQR', manufacturer: 'Texas Instruments', family: 'Digital isolator', role: 'chokepoint' },
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: 'Isolation for PSU, industrial, EV and controls', mpn: 'HCPL-0631-500E', manufacturer: 'Broadcom', family: 'High-speed optocoupler', role: 'field' },
  { categoryId: 'C13', category: 'Optocoupler / Digital Isolator', subCategory: 'Isolation for PSU, industrial, EV and controls', mpn: 'TLP2361(TPL,E', manufacturer: 'Toshiba', family: 'High-speed optocoupler', role: 'field' },

  // ── C14 Ethernet / Networking IC（10）──────────────────
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: 'PHY, switch, retimer and networking support IC', mpn: 'DP83848IVV/NOPB', manufacturer: 'Texas Instruments', family: '10/100 Ethernet PHY', role: 'thermometer' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: 'PHY, switch, retimer and networking support IC', mpn: 'LAN8742A-CZ-TR', manufacturer: 'Microchip', family: 'Ethernet PHY', role: 'thermometer' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: 'PHY, switch, retimer and networking support IC', mpn: 'KSZ8081MNXIA-TR', manufacturer: 'Microchip', family: '10/100 Ethernet PHY', role: 'thermometer' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: '交換器/retimer（單源、AI 伺服器高速訊號）', mpn: 'KSZ8895MQXIA', manufacturer: 'Microchip', family: '5-port Ethernet switch', role: 'chokepoint' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: '交換器/retimer（單源、AI 伺服器高速訊號）', mpn: '88E1512-A0-NNP2I000', manufacturer: 'Marvell', family: 'Gigabit Ethernet PHY', role: 'chokepoint' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: '交換器/retimer（單源、AI 伺服器高速訊號）', mpn: 'PI3EQX1004ZHEX', manufacturer: 'Diodes Inc.', family: 'Signal retimer/equalizer', role: 'chokepoint' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: '交換器/retimer（單源、AI 伺服器高速訊號）', mpn: 'DS125BR820NJYT', manufacturer: 'Texas Instruments', family: 'High-speed retimer', role: 'chokepoint' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: '交換器/retimer（單源、AI 伺服器高速訊號）', mpn: 'AR8035-AL1B', manufacturer: 'Qualcomm Atheros', family: 'Gigabit Ethernet PHY', role: 'chokepoint' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: 'PHY, switch, retimer and networking support IC', mpn: 'KSZ9031RNXIC', manufacturer: 'Microchip', family: 'Gigabit Ethernet PHY', role: 'field' },
  { categoryId: 'C14', category: 'Ethernet / Networking IC', subCategory: 'PHY, switch, retimer and networking support IC', mpn: 'DP83867IRPAPR', manufacturer: 'Texas Instruments', family: 'Gigabit Ethernet PHY', role: 'field' },

  // ── C15 Thermal / Fan / Power Module（6）───────────────
  { categoryId: 'C15', category: 'Thermal / Fan / Power Module', subCategory: 'Fans, thermal interface, DC modules, power modules', mpn: 'R-78E3.3-0.5', manufacturer: 'RECOM Power', family: 'DC/DC converter module', role: 'thermometer' },
  { categoryId: 'C15', category: 'Thermal / Fan / Power Module', subCategory: 'Fans, thermal interface, DC modules, power modules', mpn: 'R-78E5.0-0.5', manufacturer: 'RECOM Power', family: 'DC/DC converter module', role: 'thermometer' },
  { categoryId: 'C15', category: 'Thermal / Fan / Power Module', subCategory: 'Fans, thermal interface, DC modules, power modules', mpn: 'OKI-78SR-5/1.5-W36-C', manufacturer: 'Murata Power', family: 'DC/DC converter module', role: 'thermometer' },
  { categoryId: 'C15', category: 'Thermal / Fan / Power Module', subCategory: '風扇/AC-DC 模組（單源）', mpn: 'IRM-20-5', manufacturer: 'Mean Well', family: 'AC/DC power module', role: 'chokepoint' },
  { categoryId: 'C15', category: 'Thermal / Fan / Power Module', subCategory: '風扇/AC-DC 模組（單源）', mpn: 'OD4010-12HHSS', manufacturer: 'Orion Fans', family: '40mm 12V fan', role: 'chokepoint' },
  { categoryId: 'C15', category: 'Thermal / Fan / Power Module', subCategory: 'Fans, thermal interface, DC modules, power modules', mpn: 'MF60151V1-1000U-A99', manufacturer: 'Sunon', family: '60mm 12V fan', role: 'field' },
];

export const DEMAND_CATEGORIES = Array.from(
  new Map(BENCHMARK_PARTS.map((part) => [part.categoryId, {
    categoryId: part.categoryId,
    category: part.category,
    subCategory: part.subCategory,
  }])).values()
);

// 類別新聞關鍵字（單一事實來源）：demand-forecast 的新聞歸類與週報的素材比對共用這一份。
// 2026-07-19 由 route.ts 的 CATEGORY_KEYWORDS 與 weekly-report.ts 的 WEEKLY_CATEGORY_KEYWORDS
// 聯集合併而來——先前兩份各自維護已出現漂移，同一則新聞在預測頁與週報的歸類會不一致。
export const CATEGORY_NEWS_KEYWORDS: Record<string, string[]> = {
  C01: ['mlcc', 'ceramic capacitor', 'capacitor', 'murata', 'tdk', 'samsung electro-mechanics', '積層陶瓷電容', '電容', '高容'],
  C02: ['pmic', 'power management', 'regulator', 'buck converter', 'ldo', 'texas instruments', '電源管理', '穩壓'],
  C03: ['mosfet', 'power discrete', 'discrete', 'nexperia', 'infineon', 'onsemi', 'vishay', '功率', '分離式'],
  C04: ['ddr', 'dram', 'memory', 'flash', 'nand', 'nor', 'hbm', 'micron', 'sk hynix', 'samsung', '記憶體', '內存'],
  C05: ['mcu', 'microcontroller', 'processor', 'automotive mcu', 'stm32', 'nxp', 'renesas', 'infineon aurix', '處理器', '微控制器'],
  C06: ['connector', 'fpc', 'ffc', 'board-to-board', 'wire-to-board', 'te connectivity', 'molex', 'hirose', '連接器'],
  C07: ['crystal', 'oscillator', 'clock', 'timing component', '晶體', '振盪器'],
  C08: ['tvs', 'esd', 'esd protection', 'surge protection', 'protection diode', '保護元件'],
  C09: ['analog ic', 'analog', 'sensor', 'op amp', 'current sensor', 'temperature sensor', '感測器', '類比'],
  C10: ['interface ic', 'interface', 'can transceiver', 'rs-485', 'usb bridge', 'ethernet phy', '介面'],
  C11: ['inductor', 'choke', 'power inductor', 'common mode choke', '電感', '扼流圈'],
  C12: ['aluminum capacitor', 'polymer capacitor', 'electrolytic capacitor', 'electrolytic', '鋁質', '固態電容'],
  C13: ['optocoupler', 'digital isolator', 'isolator', 'isolation ic', '光耦', '隔離器'],
  C14: ['ethernet', 'networking ic', 'networking', 'phy', 'switch ic', 'retimer', '網通', '乙太網路'],
  C15: ['fan', 'thermal', 'cooling', 'power module', 'dc dc module', 'ac dc module', '散熱', '風扇', '電源模組'],
};

export const CATEGORY_THRESHOLDS: Record<string, { minStock: number; lowStock: number }> = {
  C01: { minStock: 5000, lowStock: 20000 },      // MLCC
  C02: { minStock: 500, lowStock: 3000 },        // PMIC / Regulator
  C03: { minStock: 1000, lowStock: 5000 },       // MOSFET / Power Discrete
  C04: { minStock: 300, lowStock: 2000 },        // Memory / Flash / DDR Proxy
  C05: { minStock: 200, lowStock: 1500 },        // MCU / Processor
  C06: { minStock: 500, lowStock: 3000 },        // Connector
  C07: { minStock: 800, lowStock: 4000 },        // Crystal / Oscillator
  C08: { minStock: 3000, lowStock: 15000 },      // TVS / ESD / Protection
  C09: { minStock: 800, lowStock: 4000 },        // Analog / Sensor
  C10: { minStock: 400, lowStock: 2500 },        // Interface IC
  C11: { minStock: 2000, lowStock: 10000 },      // Inductor / Choke
  C12: { minStock: 1500, lowStock: 8000 },       // Aluminum / Polymer Capacitor
  C13: { minStock: 500, lowStock: 3000 },        // Optocoupler / Digital Isolator
  C14: { minStock: 150, lowStock: 1000 },        // Ethernet / Networking IC
  C15: { minStock: 100, lowStock: 800 },         // Thermal / Fan / Power Module
};
