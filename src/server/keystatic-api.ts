import type { APIRoute } from 'astro';
import { makeGenericAPIRouteHandler } from '@keystatic/core/api/generic';
import { parseString } from 'set-cookie-parser';
import config from '../../keystatic.config';

export const prerender = false;

const getHandler = () => {
  return makeGenericAPIRouteHandler(
    {
      config,
      clientId: process.env.KEYSTATIC_GITHUB_CLIENT_ID || (import.meta as any).env?.KEYSTATIC_GITHUB_CLIENT_ID,
      clientSecret: process.env.KEYSTATIC_GITHUB_CLIENT_SECRET || (import.meta as any).env?.KEYSTATIC_GITHUB_CLIENT_SECRET,
      secret: process.env.KEYSTATIC_SECRET || (import.meta as any).env?.KEYSTATIC_SECRET,
    },
    {
      slugEnvName: 'PUBLIC_KEYSTATIC_GITHUB_APP_SLUG',
    }
  );
};

export const ALL: APIRoute = async (context) => {
  const reqUrl = new URL(context.request.url);
  const isProd = import.meta.env.PROD || process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  let proxiedUrl = reqUrl.toString();
  // On Vercel / production serverless runtime, requests arrive with host=localhost:xxx.
  // Rewrite to public production domain so that GitHub OAuth redirect_uri uses the public URL.
  if (isProd && (reqUrl.hostname === 'localhost' || reqUrl.hostname === '127.0.0.1')) {
    const forwardedHost = context.request.headers.get('x-forwarded-host') || context.request.headers.get('host') || 'co-tam-kato.vercel.app';
    const forwardedProto = context.request.headers.get('x-forwarded-proto') || 'https';
    const cleanHost = forwardedHost.split(':')[0];
    const targetUrl = new URL(reqUrl.pathname + reqUrl.search, `${forwardedProto}://${cleanHost}`);
    proxiedUrl = targetUrl.toString();
  }

  const handler = getHandler();
  const proxiedRequest = new Request(proxiedUrl, context.request);
  const { body, headers, status } = await handler(proxiedRequest);

  const headersInADifferentStructure = new Map<string, string[]>();
  if (headers) {
    if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        if (!headersInADifferentStructure.has(key.toLowerCase())) {
          headersInADifferentStructure.set(key.toLowerCase(), []);
        }
        headersInADifferentStructure.get(key.toLowerCase())!.push(value);
      }
    } else if (typeof (headers as any).entries === 'function') {
      for (const [key, value] of (headers as any).entries()) {
        headersInADifferentStructure.set(key.toLowerCase(), [value]);
      }
      if ('getSetCookie' in headers && typeof (headers as any).getSetCookie === 'function') {
        const setCookieHeaders = (headers as any).getSetCookie();
        if (setCookieHeaders?.length) {
          headersInADifferentStructure.set('set-cookie', setCookieHeaders);
        }
      }
    } else {
      for (const [key, value] of Object.entries(headers)) {
        headersInADifferentStructure.set(key.toLowerCase(), [value as string]);
      }
    }
  }

  const setCookieHeaders = headersInADifferentStructure.get('set-cookie');
  headersInADifferentStructure.delete('set-cookie');

  if (setCookieHeaders) {
    for (const setCookieValue of setCookieHeaders) {
      const { name, value, ...options } = parseString(setCookieValue);
      const sameSite = options.sameSite?.toLowerCase();
      context.cookies.set(name, value, {
        domain: options.domain,
        expires: options.expires,
        httpOnly: options.httpOnly,
        maxAge: options.maxAge,
        path: options.path,
        sameSite: sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none' ? (sameSite as any) : undefined,
      });
    }
  }

  return new Response(body as any, {
    status,
    headers: [...headersInADifferentStructure.entries()].flatMap(([key, val]) => val.map((x) => [key, x] as [string, string])),
  });
};
