import type { APIRoute } from 'astro';
import {
  buildAdminSessionCookieHeader,
  buildClearAdminSessionCookieHeader,
  checkLoginRateLimit,
  clearLoginRateLimit,
  createAdminSessionToken,
  getClientIp,
  isAdminAuthenticated,
  isAdminSecretConfigured,
  isSecureRequest,
  recordFailedLoginAttempt,
  verifyAdminPassword,
} from './admin-auth.ts';

export const prerender = false;

function jsonResponse(
  data: Record<string, any>,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

export const GET: APIRoute = async ({ params, request }) => {
  if (params.action === 'session') {
    const configured = isAdminSecretConfigured();
    const authenticated = configured ? await isAdminAuthenticated(request) : false;
    return jsonResponse({ authenticated, configured }, 200);
  }

  return jsonResponse({ success: false, error: 'Nieznana akcja uwierzytelniania.' }, 404);
};

export const POST: APIRoute = async ({ params, request }) => {
  const action = params.action;
  const secure = isSecureRequest(request);

  if (action === 'logout') {
    return jsonResponse(
      { success: true },
      200,
      { 'Set-Cookie': buildClearAdminSessionCookieHeader({ secure }) }
    );
  }

  if (action === 'login') {
    if (!isAdminSecretConfigured()) {
      return jsonResponse(
        {
          success: false,
          error:
            'Zmienna środowiskowa ADMIN_SECRET nie została skonfigurowana na serwerze. Ustaw ADMIN_SECRET w .env lub na Vercelu.',
        },
        503
      );
    }

    const clientIp = getClientIp(request);
    const rateStatus = checkLoginRateLimit(clientIp);
    if (!rateStatus.allowed) {
      return jsonResponse(
        {
          success: false,
          error: `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${Math.ceil(rateStatus.retryAfterSeconds / 60)} min.`,
          retryAfterSeconds: rateStatus.retryAfterSeconds,
        },
        429,
        { 'Retry-After': String(rateStatus.retryAfterSeconds) }
      );
    }

    let password = '';
    try {
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return jsonResponse({ success: false, error: 'Content-Type musi być application/json.' }, 400);
      }
      const body = (await request.json()) as { password?: unknown };
      password = typeof body?.password === 'string' ? body.password : '';
    } catch {
      return jsonResponse({ success: false, error: 'Nieprawidłowy format żądania JSON.' }, 400);
    }

    if (!password || !verifyAdminPassword(password)) {
      const afterAttempt = recordFailedLoginAttempt(clientIp);
      if (!afterAttempt.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Przekroczono limit prób logowania. Konto zablokowane na ${Math.ceil(afterAttempt.retryAfterSeconds / 60)} min.`,
            retryAfterSeconds: afterAttempt.retryAfterSeconds,
          },
          429,
          { 'Retry-After': String(afterAttempt.retryAfterSeconds) }
        );
      }

      return jsonResponse(
        {
          success: false,
          error: 'Nieprawidłowe hasło administratora.',
          remainingAttempts: afterAttempt.remaining,
        },
        401
      );
    }

    clearLoginRateLimit(clientIp);
    const token = createAdminSessionToken();

    return jsonResponse(
      { success: true },
      200,
      { 'Set-Cookie': buildAdminSessionCookieHeader(token, { secure }) }
    );
  }

  return jsonResponse({ success: false, error: 'Nieznana akcja uwierzytelniania.' }, 404);
};
