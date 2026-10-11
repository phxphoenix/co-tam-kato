import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const isOAuthRoute =
    context.url.pathname.includes('/api/keystatic/github/') ||
    context.url.pathname.includes('/github/oauth/') ||
    context.url.pathname.includes('/github/login');

  if (isOAuthRoute) {
    const forwardedHost = context.request.headers.get('x-forwarded-host') || context.request.headers.get('host');
    const forwardedProto = context.request.headers.get('x-forwarded-proto') || 'https';

    if (forwardedHost) {
      const url = new URL(context.request.url);
      url.hostname = forwardedHost.split(':')[0];
      url.protocol = `${forwardedProto}:`;
      url.port = '';

      // Override the request with the real domain from Vercel headers
      const newRequest = new Request(url.toString(), context.request);
      return next(newRequest);
    }
  }

  return next();
});
