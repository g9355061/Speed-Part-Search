interface Props {
  size?: 'sm' | 'md' | 'lg';
  showYas?: boolean;
}

export function BrandLogo({ size = 'md', showYas = true }: Props) {
  const markDim = size === 'lg' ? 32 : 26;
  const chipDim = size === 'lg' ? 16 : 14;
  const yasW = size === 'lg' ? 24 : 22;
  const yasH = size === 'lg' ? 20 : 18;
  const fontSize = size === 'lg' ? 16 : 14;

  return (
    <span className="brand-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span
        className="mark"
        style={{ width: markDim, height: markDim }}
        aria-hidden="true"
      >
        <svg width={chipDim} height={chipDim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="6" width="12" height="12" rx="1" />
          <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
        </svg>
      </span>
      {showYas && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg width={yasW} height={yasH} viewBox="0 0 56 46" fill="none" aria-hidden="true">
            <circle cx="13" cy="10" r="10" fill="#CC2200" />
            <circle cx="38" cy="19" r="7" fill="#CC2200" />
            <line x1="13" y1="10" x2="38" y2="19" stroke="#CC2200" strokeWidth="4" strokeLinecap="round" />
            <line x1="13" y1="10" x2="20" y2="36" stroke="#CC2200" strokeWidth="4" strokeLinecap="round" />
            <circle cx="20" cy="38" r="5" fill="#CC2200" />
          </svg>
          <span style={{ fontWeight: 700, fontSize, letterSpacing: '0.06em', color: '#1a1a1a' }}>YAS</span>
        </span>
      )}
      <span className="name" style={{ fontSize }}>
        SpeedPart<span className="dot">.</span>
      </span>
    </span>
  );
}
