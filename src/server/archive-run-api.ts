import type { APIRoute } from 'astro';
// @ts-ignore - archive-worker jest modułem ESM w scripts/
import { runArchiveWorker } from '../../scripts/archive-worker.mjs';
import { validateArchivePeriod } from './archive-settings-service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    let customDays: number | undefined = undefined;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        if (body?.customDays !== undefined) {
          const valResult = validateArchivePeriod(body.customDays);
          if (!valResult.valid) {
            return new Response(JSON.stringify({ success: false, error: valResult.error }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          customDays = valResult.value;
        }
      } catch {
        // Ignoruj błąd parsowania pustego body
      }
    }

    const workerResult = await runArchiveWorker({
      force: true,
      checkScheduledHour: false,
      customDays,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Worker archiwizacji został pomyślnie wykonany.',
        ...workerResult,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || 'Błąd wykonania workera archiwizacji',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
