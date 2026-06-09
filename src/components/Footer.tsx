'use client';

interface Props {
  refreshedAt: string;
}

export function Footer({ refreshedAt }: Props) {
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div>
          <div className="hdr-brand" style={{ marginBottom: 12 }}>
            <div className="mark">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" rx="1" />
                <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
              </svg>
            </div>
            <div className="name">SpeedPart<span className="dot">.</span></div>
          </div>
          <p className="disclaimer">
            價格與庫存資料來自供應商公開 API，僅供內部查詢與採購參考。SpeedPart 與各供應商或製造商無隸屬關係，商標歸原權利人所有。
          </p>
        </div>
        <div>
          <h4>功能</h4>
          <a>單料查詢</a><a>BOM 管理</a><a>追蹤清單</a><a>提醒</a>
        </div>
        <div>
          <h4>開發</h4>
          <a>API 文件</a><a>API 狀態</a><a>Webhook</a><a>更新紀錄</a>
        </div>
        <div>
          <h4>公司</h4>
          <a>關於</a><a>價格</a><a>條款</a><a>隱私</a>
        </div>
      </div>
      <div className="foot-bottom">
        <div>© 2026 SpeedPart Labs · 為採購團隊打造</div>
        <div className="api-info">
          <span>最後同步 {refreshedAt}</span>
        </div>
      </div>
    </footer>
  );
}
