import type { APIRoute } from 'astro';
import { getArchiveSettings, updateArchiveSettings, validateArchivePeriod } from './archive-settings-service';

export const prerender = false;

const GITHUB_REPO = 'phxphoenix/co-tam-kato';

async function commitSettingsToGitHub(token: string, content: string) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/src/content/settings/archive.json`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'co-tam-kato-archive',
  };

  const getRes = await fetch(url, { headers });
  if (!getRes.ok) {
    throw new Error(`Nie udało się pobrać archive.json z GitHub API: status ${getRes.status}`);
  }
  const fileData = (await getRes.json()) as { sha?: string };
  if (!fileData?.sha) {
    throw new Error('Brak SHA pliku w odpowiedzi GitHub API');
  }

  const base64Content = Buffer.from(content, 'utf8').toString('base64');
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'chore(archive): update archiveAfterDays retention settings',
      content: base64Content,
      sha: fileData.sha,
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub API commit failed (${putRes.status}): ${errText}`);
  }

  return await putRes.json();
}

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

    // Jeśli środowisko jest read-only (np. Vercel), sprawdźmy czy możemy dokonać commita przez GitHub API
    if ((result as any).readOnly && result.settings) {
      const cookieHeader = request.headers.get('cookie') || '';
      const cookieMatch = cookieHeader.match(/keystatic-gh-access-token=([^;]+)/);
      const gitHubToken =
        process.env.GITHUB_TOKEN ||
        process.env.GH_TOKEN ||
        (cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined);

      if (gitHubToken) {
        try {
          await commitSettingsToGitHub(gitHubToken, JSON.stringify(result.settings, null, 2) + '\n');
        } catch (ghErr: any) {
          console.warn('[Archive Settings API] Ostrzeżenie zapisu do GitHub API:', ghErr?.message);
        }
      }
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
