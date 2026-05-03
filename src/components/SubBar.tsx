'use client';

interface Props {
  query: string;
  category: string;
  liveCount: number;
  totalCount: number;
  refreshedAt: string;
}

export function SubBar({ query, category, liveCount, totalCount, refreshedAt }: Props) {
  return (
    <div className="subbar">
      <span className="crumb">單料查詢</span>
      <span className="sep">/</span>
      <span className="crumb">{category}</span>
      <span className="sep">/</span>
      <span className="crumb curr mono">{query}</span>
      <div className="right">
        <span className="stat"><span className="k">來源</span><span className="v">{liveCount}/{totalCount}</span></span>
        <span className="stat"><span className="k">更新</span><span className="v">{refreshedAt}</span></span>
        <span className="stat"><span className="k">幣別</span><span className="v">USD</span></span>
      </div>
    </div>
  );
}
