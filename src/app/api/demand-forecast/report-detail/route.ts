import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: '缺少 url 參數' }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000); // 10秒逾時

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 3600 } // 快取 1 小時
    });

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`無法取得網頁內容：HTTP ${res.status}`);
    }

    const html = await res.text();
    
    // 移除不必要的區塊（script, style, iframe, nav, footer, header 等）
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');

    // 擷取所有 <p> 段落
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs: string[] = [];
    let match;
    while ((match = pRegex.exec(cleanHtml)) !== null) {
      const clean = match[1]
        .replace(/<[^>]+>/g, '') // 移除巢狀 HTML 標籤
        .replace(/\s+/g, ' ')
        .trim();
      
      // 過濾太短、或是 cookie/廣告提示的無效段落
      if (
        clean.length > 40 && 
        !clean.toLowerCase().includes('cookie') && 
        !clean.toLowerCase().includes('privacy policy') && 
        !clean.toLowerCase().includes('terms of service') &&
        !clean.toLowerCase().includes('subscribe') &&
        !clean.includes('©')
      ) {
        paragraphs.push(clean);
      }
    }

    // 擷取網頁標題
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '市場情報報告';

    return NextResponse.json({
      title: pageTitle,
      paragraphs: paragraphs.slice(0, 12), // 僅取前 12 個核心段落，確保載入速度與閱讀焦點
      url
    });
  } catch (err: any) {
    console.error('[ReportDetailAPI] Error:', err);
    return NextResponse.json(
      { error: err.message || '無法解析該網頁內容，請嘗試原文連結。' },
      { status: 500 }
    );
  }
}
