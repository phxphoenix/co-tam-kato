import type { APIRoute } from 'astro';
import { updateArticleArchive } from './archive-service';

export const prerender = false;

const GITHUB_REPO = 'phxphoenix/co-tam-kato';

async function commitToGitHub(options: {
  token: string;
  repo: string;
  path: string;
  content: string;
  message: string;
}) {
  const { token, repo, path: filePath, content, message } = options;
  const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'co-tam-kato-archive',
  };

  const getRes = await fetch(url, { headers });
  if (!getRes.ok) {
    throw new Error(`Nie udało się pobrać pliku z GitHub API: status ${getRes.status}`);
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
      message,
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

    let persisted = 'fs';

    // Jeśli środowisko jest read-only (np. Vercel Serverless), podejmij próbę zapisu przez GitHub API
    if (result.readOnly && result.fileName && result.content) {
      const cookieHeader = request.headers.get('cookie') || '';
      const cookieMatch = cookieHeader.match(/keystatic-gh-access-token=([^;]+)/);
      const gitHubToken =
        process.env.GITHUB_TOKEN ||
        process.env.GH_TOKEN ||
        (cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined);

      if (gitHubToken) {
        try {
          await commitToGitHub({
            token: gitHubToken,
            repo: GITHUB_REPO,
            path: `src/content/news/${result.fileName}`,
            content: result.content,
            message: `chore(archive): ${archived ? 'archive' : 'unarchive'} article ${slug}`,
          });
          persisted = 'github';
        } catch (ghErr: any) {
          console.warn('[Archive API] Ostrzeżenie zapisu do GitHub API:', ghErr?.message);
          persisted = 'client';
        }
      } else {
        persisted = 'client';
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        slug,
        archived,
        manualOverride: typeof manualOverride === 'boolean' ? manualOverride : undefined,
        persisted,
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
