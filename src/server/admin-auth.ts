import crypto from 'node:crypto';
import * as cookie from 'cookie';

export const ADMIN_SESSION_COOKIE = 'kato_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 dni (1209600 s)
export const MAX_LOGIN_ATTEMPTS = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minut

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const loginAttemptsByIp = new Map<string, RateLimitEntry>();

/**
 * Odczytuje sekret administratora ze zmiennych środowiskowych.
 */
export function getAdminSecret(): string {
  const fromProcess = typeof process !== 'undefined' ? process.env?.ADMIN_SECRET : undefined;
  const fromImportMeta =
    typeof import.meta !== 'undefined' ? (import.meta as any).env?.ADMIN_SECRET : undefined;
  return String(fromProcess || fromImportMeta || '').trim();
}

/**
 * Sprawdza, czy zmienna środowiskowa ADMIN_SECRET została skonfigurowana.
 */
export function isAdminSecretConfigured(): boolean {
  return getAdminSecret().length > 0;
}

function sha256Digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Porównuje hasło z sekretem w sposób odporny na ataki czasowe (timingSafeEqual na skrótach SHA-256).
 */
export function verifyAdminPassword(candidate: string, expectedSecret = getAdminSecret()): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  if (!expectedSecret || typeof expectedSecret !== 'string') return false;

  const candidateHash = sha256Digest(candidate);
  const expectedHash = sha256Digest(expectedSecret);
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

function signSessionPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

/**
 * Tworzy podpisany token sesji administratora w formacie <issuedAtMs>.<expiresAtMs>.<hmacSha256Base64Url>.
 */
export function createAdminSessionToken(options: {
  secret?: string;
  nowMs?: number;
  ttlSeconds?: number;
} = {}): string {
  const secret = (options.secret ?? getAdminSecret()).trim();
  if (!secret) {
    throw new Error('ADMIN_SECRET is not configured');
  }
  const nowMs = options.nowMs ?? Date.now();
  const ttlSeconds = options.ttlSeconds ?? ADMIN_SESSION_TTL_SECONDS;
  const expiresAtMs = nowMs + ttlSeconds * 1000;
  const payload = `${nowMs}.${expiresAtMs}`;
  const signature = signSessionPayload(payload, secret);
  return `${payload}.${signature}`;
}

/**
 * Weryfikuje podpis HMAC-SHA256 oraz termin ważności tokenu sesji.
 */
export function verifyAdminSessionToken(
  token: string,
  options: { secret?: string; nowMs?: number } = {}
): boolean {
  if (!token || typeof token !== 'string') return false;
  const secret = (options.secret ?? getAdminSecret()).trim();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [issuedAtStr, expiresAtStr, signature] = parts;
  if (!/^\d+$/.test(issuedAtStr) || !/^\d+$/.test(expiresAtStr) || !signature) {
    return false;
  }

  const issuedAtMs = Number(issuedAtStr);
  const expiresAtMs = Number(expiresAtStr);
  const nowMs = options.nowMs ?? Date.now();

  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
    return false;
  }
  if (expiresAtMs <= nowMs) {
    return false;
  }
  if (issuedAtMs > nowMs + 60_000) {
    return false;
  }

  const expectedSignature = signSessionPayload(`${issuedAtStr}.${expiresAtStr}`, secret);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Określa, czy połączenie odbywa się po HTTPS (lub na Vercelu).
 */
export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }
  if (request.url.startsWith('https://')) {
    return true;
  }
  return process.env.VERCEL === '1' || process.env.DEPLOY_TARGET === 'vercel';
}

/**
 * Buduje nagłówek Set-Cookie dla aktywnej sesji administratora.
 */
export function buildAdminSessionCookieHeader(
  token: string,
  options: { secure?: boolean; maxAge?: number } = {}
): string {
  const maxAge = options.maxAge ?? ADMIN_SESSION_TTL_SECONDS;
  return cookie.serialize(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(options.secure),
    path: '/',
    maxAge,
    expires: new Date(Date.now() + maxAge * 1000),
  });
}

/**
 * Buduje nagłówek Set-Cookie czyszczący ciasteczko sesji administratora.
 */
export function buildClearAdminSessionCookieHeader(options: { secure?: boolean } = {}): string {
  return cookie.serialize(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(options.secure),
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

/**
 * Zabezpiecza docelowy adres przekierowania po zalogowaniu przed atakami Open Redirect.
 */
export function sanitizeAdminRedirect(nextParam?: string | null, base = '/'): string {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const fallback = `${cleanBase}/admin/sources`;

  if (!nextParam || typeof nextParam !== 'string') {
    return fallback;
  }

  const trimmed = nextParam.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return fallback;
  }
  if (/[\r\n]/.test(trimmed)) {
    return fallback;
  }

  const adminPrefix = `${cleanBase}/admin`;
  if (trimmed === adminPrefix || trimmed.startsWith(`${adminPrefix}/`) || trimmed.startsWith(`${adminPrefix}?`)) {
    return trimmed;
  }

  return fallback;
}

/**
 * Sprawdza uwierzytelnienie administratora na podstawie ciasteczka kato_admin_session
 * albo nagłówka Authorization: Bearer <ADMIN_SECRET> / x-admin-secret.
 */
export async function isAdminAuthenticated(request: Request): Promise<boolean> {
  const secret = getAdminSecret();
  if (!secret) return false;

  const cookieHeader = request.headers.get('cookie') || '';
  if (cookieHeader) {
    const parsedCookies = cookie.parse(cookieHeader);
    const sessionToken = parsedCookies[ADMIN_SESSION_COOKIE];
    if (sessionToken && verifyAdminSessionToken(sessionToken, { secret })) {
      return true;
    }
  }

  const authHeader = request.headers.get('authorization') || '';
  if (/^Bearer\s+/i.test(authHeader)) {
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (verifyAdminPassword(bearerToken, secret)) {
      return true;
    }
  }

  const secretHeader = request.headers.get('x-admin-secret');
  if (secretHeader && verifyAdminPassword(secretHeader.trim(), secret)) {
    return true;
  }

  return false;
}

/**
 * Strażnik dla administracyjnych endpointów API.
 * Zwraca Response (503 lub 401) w razie braku dostępu, albo null gdy żądanie jest autoryzowane.
 */
export async function requireAdminApiAuth(request: Request): Promise<Response | null> {
  if (!isAdminSecretConfigured()) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          'Brak skonfigurowanej zmiennej środowiskowej ADMIN_SECRET na serwerze. Ustaw ADMIN_SECRET w pliku .env lub w ustawieniach Vercel.',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const authenticated = await isAdminAuthenticated(request);
  if (!authenticated) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Wymagane uwierzytelnienie administratora.',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  return null;
}

/**
 * Wyodrębnia identyfikator adresu IP klienta do ochrony przed brute-force.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  return 'local';
}

/**
 * Sprawdza, czy dany adres IP może wykonać kolejną próbę logowania.
 */
export function checkLoginRateLimit(
  ip: string,
  nowMs = Date.now()
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const entry = loginAttemptsByIp.get(ip);
  if (!entry || nowMs >= entry.resetAt) {
    if (entry && nowMs >= entry.resetAt) {
      loginAttemptsByIp.delete(ip);
    }
    return {
      allowed: true,
      remaining: MAX_LOGIN_ATTEMPTS,
      retryAfterSeconds: 0,
    };
  }

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - nowMs) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - entry.count),
    retryAfterSeconds: 0,
  };
}

/**
 * Rejestruje nieudaną próbę logowania dla danego adresu IP.
 */
export function recordFailedLoginAttempt(
  ip: string,
  nowMs = Date.now()
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const existing = loginAttemptsByIp.get(ip);
  if (!existing || nowMs >= existing.resetAt) {
    loginAttemptsByIp.set(ip, {
      count: 1,
      resetAt: nowMs + LOGIN_WINDOW_MS,
    });
    return {
      allowed: true,
      remaining: MAX_LOGIN_ATTEMPTS - 1,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  loginAttemptsByIp.set(ip, existing);

  if (existing.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - existing.count),
    retryAfterSeconds: 0,
  };
}

/**
 * Czyści licznik prób logowania dla IP (lub wszystkich IP, gdy brak argumentu).
 */
export function clearLoginRateLimit(ip?: string): void {
  if (ip) {
    loginAttemptsByIp.delete(ip);
  } else {
    loginAttemptsByIp.clear();
  }
}
