'use client';
import { Icon } from './Icon';

interface Props {
  query: string;
  setQuery: (q: string) => void;
  qtyInput: string;
  setQtyInput: (qty: string) => void;
  onSearch: (q: string) => void;
  loading: boolean;
}

function HeroIllu() {
  return (
    <div className="hero-illu" aria-hidden="true">
      <svg width="280" height="220" viewBox="0 0 280 220" fill="none">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#EEF1F4" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="280" height="220" fill="url(#grid)" />
        <path d="M0 110 L70 110 L70 60 L130 60" stroke="#CDD3DB" strokeWidth="1.5" fill="none" />
        <path d="M0 160 L50 160 L50 130 L130 130" stroke="#CDD3DB" strokeWidth="1.5" fill="none" />
        <path d="M280 80 L210 80 L210 100 L160 100" stroke="#CDD3DB" strokeWidth="1.5" fill="none" />
        <path d="M280 170 L220 170 L220 140 L160 140" stroke="#CDD3DB" strokeWidth="1.5" fill="none" />
        <circle cx="0" cy="110" r="2" fill="#CDD3DB" />
        <circle cx="0" cy="160" r="2" fill="#CDD3DB" />
        <circle cx="280" cy="80" r="2" fill="#CDD3DB" />
        <circle cx="280" cy="170" r="2" fill="#CDD3DB" />
        <rect x="90" y="50" width="100" height="100" rx="4" fill="#0B2545" />
        <rect x="96" y="56" width="88" height="88" rx="2" fill="none" stroke="#1F4D8C" strokeWidth="0.5" />
        <circle cx="105" cy="65" r="3" fill="none" stroke="#1F4D8C" strokeWidth="1" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect key={`pl${i}`} x="82" y={62 + i * 10} width="8" height="4" fill="#97A0AE" />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect key={`pr${i}`} x="190" y={62 + i * 10} width="8" height="4" fill="#97A0AE" />
        ))}
        <text x="140" y="98" textAnchor="middle" fill="#97A0AE" fontFamily="monospace" fontSize="9" letterSpacing="1">STM32F103</text>
        <text x="140" y="112" textAnchor="middle" fill="#6B7787" fontFamily="monospace" fontSize="7" letterSpacing="0.5">C8T6 · LQFP48</text>
        <g opacity="0.95">
          <rect x="20" y="30" width="58" height="22" rx="3" fill="#FFFFFF" stroke="#E3E7EC" />
          <circle cx="30" cy="41" r="2" fill="#0B6E3F" />
          <text x="38" y="45" fill="#3D4A5C" fontFamily="monospace" fontSize="10" fontWeight="600">$2.66</text>
        </g>
        <g opacity="0.95">
          <rect x="208" y="30" width="58" height="22" rx="3" fill="#FFFFFF" stroke="#E3E7EC" />
          <circle cx="218" cy="41" r="2" fill="#97A0AE" />
          <text x="226" y="45" fill="#3D4A5C" fontFamily="monospace" fontSize="10" fontWeight="600">$2.84</text>
        </g>
        <g opacity="0.95">
          <rect x="200" y="180" width="58" height="22" rx="3" fill="#FFFFFF" stroke="#E3E7EC" />
          <circle cx="210" cy="191" r="2" fill="#97A0AE" />
          <text x="218" y="195" fill="#3D4A5C" fontFamily="monospace" fontSize="10" fontWeight="600">$2.95</text>
        </g>
        <g opacity="0.95">
          <rect x="14" y="178" width="58" height="22" rx="3" fill="#FFFFFF" stroke="#E3E7EC" />
          <circle cx="24" cy="189" r="2" fill="#97A0AE" />
          <text x="32" y="193" fill="#3D4A5C" fontFamily="monospace" fontSize="10" fontWeight="600">$3.12</text>
        </g>
      </svg>
    </div>
  );
}

export function Hero({ query, setQuery, qtyInput, setQtyInput, onSearch, loading }: Props) {
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };
  const updateQty = (value: string) => {
    const cleaned = value.replace(/[^\d,]/g, '');
    setQtyInput(cleaned);
  };
  return (
    <section className="hero">
      <div className="hero-inner">
        <div>
          <h1>即時比較 <span className="accent">供應商價格</span><br />快速查詢電子零件。</h1>
          <p className="lede">
            輸入料號與需求數量，即時比對 DigiKey、Mouser HK、Mouser VN 的庫存、MOQ、交期與階梯價。
          </p>
          <form className="search-box" onSubmit={submit}>
            <Icon name="search" className="s-ic" size={18} />
            <input
              className="mono"
              placeholder="輸入料號 — 例如 STM32F103C8T6 / TPS7A47 / ATMEGA328P"
              value={query}
              onChange={(e) => setQuery(e.target.value.trimStart())}
              onPaste={(e) => {
                e.preventDefault();
                setQuery(e.clipboardData.getData('text').trim());
              }}
              autoFocus
            />
            <label className="search-qty">
              <span>Qty</span>
              <input
                className="mono qty-input"
                type="number"
                min="1"
                step="1"
                value={qtyInput}
                onChange={(e) => updateQty(e.target.value)}
              />
            </label>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Icon name="search" size={14} stroke={2.2} />
              {loading ? '查詢中…' : '查詢'}
            </button>
          </form>
        </div>
        <HeroIllu />
      </div>
    </section>
  );
}
