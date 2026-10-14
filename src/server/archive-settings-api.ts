import type { APIRoute } from 'astro';
import { getArchiveSettings, updateArchiveSettings, validateArchivePeriod } from './archive-settings-service';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const settings = getArchiveSettings();
    return new Response(JSON.stringify({ success: true, ...settings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Błąd serwera' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ success: false, error: 'Content-Type musi być application/json' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const rawVal = body?.archiveAfterDays;

    const validation = validateArchivePeriod(rawVal);
    if (!validation.valid) {
      return new Response(JSON.stringify({ success: false, error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = updateArchiveSettings(validation.value);
    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Zaktualizowano okres archiwizacji do ${result.settings?.archiveAfterDays} dni.`,
        settings: result.settings,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Błąd serwera' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
