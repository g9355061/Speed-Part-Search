'use client';

interface Props {
  mpn: string | null;
  category: string | null;
  hasSearched: boolean;
  liveCount: number;
  totalCount: number;
  refreshedAt: string;
}

export function SubBar({ mpn, category, hasSearched, liveCount, totalCount, refreshedAt }: Props) {
  return (
    <div className="subbar">
      <span className="crumb">單料查詢</span>
      {hasSearched && mpn ? (
        <>
          {category && (
            <>
              <span className="sep">/</span>
              <span className="crumb">{category}</span>
            </>
          )}
          <span className="sep">/</span>
          <span className="crumb curr mono">{mpn}</span>
        </>
      ) : (
        <>
          <span className="sep">/</span>
          <span className="crumb curr">準備查詢</span>
        </>
      )}
      <div className="right">
        <span className="stat"><span className="k">來源</span><span className="v">{liveCount}/{totalCount}</span></span>
        <span className="stat"><span className="k">更新</span><span className="v">{refreshedAt}</span></span>
        <span className="stat"><span className="k">幣別</span><span className="v">USD</span></span>
      </div>
    </div>
  );
}
