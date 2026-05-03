import { SupplierError } from '../types';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

const SAFETY_WINDOW_MS = 60_000; // 提前 60 秒視為過期

export function getDigiKeyBaseUrl(): string {
  const env = (process.env.DIGIKEY_ENV ?? 'sandbox').toLowerCase();
  return env === 'production'
    ? 'https://api.digikey.com'
    : 'https://sandbox-api.digikey.com';
}

export async function getDigiKeyAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - SAFETY_WINDOW_MS > now) {
    return cached.accessToken;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const clientId = process.env.DIGIKEY_CLIENT_ID;
    const clientSecret = process.env.DIGIKEY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new SupplierError(
        'DigiKey',
        'CONFIG_MISSING',
        'Missing DIGIKEY_CLIENT_ID or DIGIKEY_CLIENT_SECRET in environment'
      );
    }

    const url = `${getDigiKeyBaseUrl()}/v1/oauth2/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });
    console.log('[DEBUG] Token Request URL:', url);
    console.log('[DEBUG] Token Request Client ID:', clientId);
    console.log('[DEBUG] Token Request Client Secret:', clientSecret.substring(0, 5) + '...');

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 401 || resp.status === 400) {
        throw new SupplierError(
          'DigiKey',
          'AUTH_FAILED',
          `OAuth token request failed (${resp.status}): ${text}`,
          resp.status
        );
      }
      throw new SupplierError(
        'DigiKey',
        'UPSTREAM_ERROR',
        `OAuth token request failed (${resp.status}): ${text}`,
        resp.status
      );
    }

    const data = (await resp.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    if (!data.access_token) {
      throw new SupplierError(
        'DigiKey',
        'AUTH_FAILED',
        'OAuth response missing access_token'
      );
    }

    cached = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 600) * 1000,
    };
    return cached.accessToken;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// 測試用：清除 token 快取
export function _resetDigiKeyTokenCache() {
  cached = null;
  inflight = null;
}
