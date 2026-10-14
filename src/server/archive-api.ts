import type { APIRoute } from 'astro';
import { updateArticleArchive } from './archive-service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { slug, archived, manualOverride } = body;

    if (!slug || typeof archived !== 'boolean') {
      return new Response(JSON.stringify({ error: 'Invalid parameters: slug and archived (boolean) are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = updateArticleArchive(slug, archived, manualOverride);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        slug,
        archived,
        manualOverride: typeof manualOverride === 'boolean' ? manualOverride : undefined,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
