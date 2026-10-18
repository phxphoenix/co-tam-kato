import * as cookie from 'cookie';

const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function base64UrlDecode(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64url'));
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(secret);
  const key = await crypto.subtle.importKey('raw', encoded, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt,
      hash: 'SHA-256',
      info: new Uint8Array(0),
    },
    key,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptValue(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(secret, salt);
  const encoded = encoder.encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const full = new Uint8Array(SALT_LENGTH + IV_LENGTH + encrypted.byteLength);
  full.set(salt);
  full.set(iv, SALT_LENGTH);
  full.set(new Uint8Array(encrypted), SALT_LENGTH + IV_LENGTH);
  return base64UrlEncode(full);
}

async function decryptValue(encrypted: string, secret: string): Promise<string> {
  const decoder = new TextDecoder();
  const decoded = base64UrlDecode(encrypted);
  const salt = decoded.slice(0, SALT_LENGTH);
  const key = await deriveKey(secret, salt);
  const iv = decoded.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const value = decoded.slice(SALT_LENGTH + IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, value);
  return decoder.decode(decrypted);
}

export interface ResolvedGitHubAuth {
  token?: string;
  source?: 'env' | 'cookie' | 'refreshed';
  setCookieHeaders?: string[];
  refreshTokenFn?: () => Promise<{ token?: string; setCookieHeaders?: string[] }>;
}

/**
 * Rozwiązuje token dostępu do GitHub API:
 * 1. Zmienna środowiskowa GITHUB_TOKEN / GH_TOKEN
 * 2. Ciasteczko keystatic-gh-access-token
 * 3. Automatyczne odświeżenie wygasłego tokenu z ciasteczka keystatic-gh-refresh-token (ważnego 6 miesięcy)
 */
export async function resolveGitHubAuth(request: Request): Promise<ResolvedGitHubAuth> {
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = cookie.parse(cookieHeader);
  const accessToken = cookies['keystatic-gh-access-token'];
  const refreshTokenCookie = cookies['keystatic-gh-refresh-token'];

  const refreshAccessToken = async (): Promise<{ token?: string; setCookieHeaders?: string[] }> => {
    if (!refreshTokenCookie) return {};

    const clientId =
      process.env.KEYSTATIC_GITHUB_CLIENT_ID || (import.meta as any).env?.KEYSTATIC_GITHUB_CLIENT_ID;
    const clientSecret =
      process.env.KEYSTATIC_GITHUB_CLIENT_SECRET || (import.meta as any).env?.KEYSTATIC_GITHUB_CLIENT_SECRET;
    const secret =
      process.env.KEYSTATIC_SECRET || (import.meta as any).env?.KEYSTATIC_SECRET;

    if (!clientId || !clientSecret || !secret || secret.length < 32) {
      return {};
    }

    try {
      const refreshToken = await decryptValue(refreshTokenCookie, secret);
      const url = new URL('https://github.com/login/oauth/access_token');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('client_secret', clientSecret);
      url.searchParams.set('grant_type', 'refresh_token');
      url.searchParams.set('refresh_token', refreshToken);

      const tokenRes = await fetch(url.toString(), {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });

      if (!tokenRes.ok) return {};
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        expires_in?: number;
        refresh_token?: string;
        refresh_token_expires_in?: number;
      };

      if (!tokenData.access_token || !tokenData.refresh_token) {
        return {};
      }

      const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
      const expiresIn = tokenData.expires_in || 28800;
      const refreshExpiresIn = tokenData.refresh_token_expires_in || 15897600;

      const setCookieHeaders = [
        cookie.serialize('keystatic-gh-access-token', tokenData.access_token, {
          sameSite: 'lax',
          secure: isProd,
          maxAge: expiresIn,
          expires: new Date(Date.now() + expiresIn * 1000),
          path: '/',
        }),
        cookie.serialize(
          'keystatic-gh-refresh-token',
          await encryptValue(tokenData.refresh_token, secret),
          {
            sameSite: 'lax',
            secure: isProd,
            httpOnly: true,
            maxAge: refreshExpiresIn,
            expires: new Date(Date.now() + refreshExpiresIn * 1000),
            path: '/',
          }
        ),
      ];

      return {
        token: tokenData.access_token,
        setCookieHeaders,
      };
    } catch {
      return {};
    }
  };

  if (accessToken) {
    return {
      token: accessToken,
      source: 'cookie',
      refreshTokenFn: refreshAccessToken,
    };
  }

  if (refreshTokenCookie) {
    const refreshed = await refreshAccessToken();
    if (refreshed.token) {
      return {
        token: refreshed.token,
        source: 'refreshed',
        setCookieHeaders: refreshed.setCookieHeaders,
      };
    }
  }

  return {};
}
