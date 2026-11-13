'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BrandLogo } from './BrandLogo';
import { canAccessQqInquiry } from '@/lib/permissions';

interface Props {
  refreshedAt?: string;
}

export function Footer({ refreshedAt }: Props) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const canUseQqInquiry = canAccessQqInquiry(session?.user);

  return (
    <footer className="foot">
      <div className="foot-inner">
        <div>
          <div className="hdr-brand" style={{ marginBottom: 12 }}>
            <BrandLogo size="md" />
          </div>
          <p className="disclaimer">
            價格與庫存資料來自供應商公開 API，僅供內部查詢與採購參考。SpeedPart 與各供應商或製造商無隸屬關係，商標歸原權利人所有。
          </p>
        </div>
        <div>
          <h4>功能導覽</h4>
          <Link href="/">單料查詢</Link>
          <Link href="/batch-manufacturer">BOM Batch</Link>
          {canUseQqInquiry && <Link href="/qq-inquiry">QQ 詢價</Link>}
          <Link href="/manufacturer-mapping">廠商對照表</Link>
        </div>
        <div>
          <h4>系統管理</h4>
          {isAdmin && <Link href="/demand-forecast">缺料預測</Link>}
          {isAdmin && <Link href="/admin/users">使用者管理</Link>}
          <Link href="/account/change-password">變更密碼</Link>
          <a href="/api/health" target="_blank" rel="noreferrer">API 健康狀態</a>
        </div>
      </div>
      <div className="foot-bottom">
        <div>© 2026 SpeedPart · YAS 內部採購查詢平台</div>
        {refreshedAt && (
          <div className="api-info">
            <span>最後同步 {refreshedAt}</span>
          </div>
        )}
      </div>
    </footer>
  );
}
