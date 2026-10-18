import type { APIRoute } from 'astro';
import {
  updateArticleArchive,
  applyArchiveFrontmatter,
  getServerRuntimeArchiveStates,
  saveServerRuntimeArchiveState,
  type ArchiveItemState,
} from './archive-service.ts';
import { resolveGitHubAuth } from './github-auth.ts';

export const prerender = false;

const GITHUB_REPO = 'phxphoenix/co-tam-kato';

let lastGitHubCommitsFetch = 0;
let cachedGitHubCommitStates: Record<string, ArchiveItemState> = {};

async function fetchRecentGitHubArchiveStates(token?: string): Promise<Record<string, ArchiveItemState>> {
  const now = Date.now();
  if (now - lastGitHubCommitsFetch < 4000 && Object.keys(cachedGitHubCommitStates).length > 0) {
    return cachedGitHubCommitStates;
  }

  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'co-tam-kato-archive',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=30`, {
      headers,
    });
    if (!res.ok) {
      return cachedGitHubCommitStates;
    }

    const commits = (await res.json()) as Array<{
      commit?: { message?: string; committer?: { date?: string } };
    }>;

    if (!Array.isArray(commits)) {
      return cachedGitHubCommitStates;
    }

    const states: Record<string, ArchiveItemState> = {};
    // Przeglądamy od najstarszego do najnowszego spośród ostatnich 30 commitów
    for (let i = commits.length - 1; i >= 0; i--) {
      const msg = commits[i]?.commit?.message || '';
      const dateStr = commits[i]?.commit?.committer?.date;
      const updatedAt = dateStr ? new Date(dateStr).getTime() : now;

      const match = msg.match(/^chore\(archive\):\s*(archive|unarchive)\s+article\s+([^\s\r\n]+)/i);
      if (match) {
        const action = match[1].toLowerCase();
        const slug = match[2].replace(/\.(md|mdx)$/, '');
        const archived = action === 'archive';
        states[slug] = {
          archived,
          ...(archived ? {} : { manualOverride: true }),
          updatedAt,
        };
      }
    }

    cachedGitHubCommitStates = states;
    lastGitHubCommitsFetch = now;
    return states;
  } catch {
    return cachedGitHubCommitStates;
  }
}

async function commitToGitHub(options: {
  token: string;
  repo: string;
  path: string;
  archived: boolean;
  manualOverride?: boolean;
  fallbackContent?: string;
  message: string;
}) {
  const { token, repo, path: filePath, archived, manualOverride, fallbackContent, message } = options;
  const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'co-tam-kato-archive',
  };

  const getRes = await fetch(url, { headers });
  if (!getRes.ok) {
    const err = new Error(`Nie udało się pobrać pliku z GitHub API: status ${getRes.status}`);
    (err as any).status = getRes.status;
    throw err;
  }

  const fileData = (await getRes.json()) as { sha?: string; content?: string; encoding?: string };
  if (!fileData?.sha) {
    throw new Error('Brak SHA pliku w odpowiedzi GitHub API');
  }

  let finalContent = fallbackContent;
  if (fileData.content) {
    const remoteRaw = Buffer.from(fileData.content.replace(/\s/g, ''), 'base64').toString('utf8');
    const updated = applyArchiveFrontmatter(remoteRaw, archived, manualOverride);
    if (updated.success && updated.content) {
      finalContent = updated.content;
    }
  }

  if (!finalContent) {
    throw new Error('Brak treści pliku do zapisania w GitHub API');
  }

  const base64Content = Buffer.from(finalContent, 'utf8').toString('base64');
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
    const err = new Error(`GitHub API commit failed (${putRes.status}): ${errText}`);
    (err as any).status = putRes.status;
    throw err;
  }

  return await putRes.json();
}

function buildResponseHeaders(setCookieHeaders?: string[], noStore = true): Headers {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (noStore) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  if (setCookieHeaders?.length) {
    for (const cookieStr of setCookieHeaders) {
      headers.append('Set-Cookie', cookieStr);
    }
  }
  return headers;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await resolveGitHubAuth(request);
    const localStates = getServerRuntimeArchiveStates();
    const isVercel = process.env.VERCEL === '1' || process.env.DEPLOY_TARGET === 'vercel';

    const mergedStates: Record<string, ArchiveItemState> = { ...localStates };

    if (isVercel || auth.token) {
      const ghStates = await fetchRecentGitHubArchiveStates(auth.token);
      for (const [slug, ghState] of Object.entries(ghStates)) {
        const existing = mergedStates[slug];
        if (!existing || !existing.updatedAt || (ghState.updatedAt && ghState.updatedAt >= existing.updatedAt)) {
          mergedStates[slug] = ghState;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        states: mergedStates,
        authenticated: Boolean(auth.token) || !isVercel,
      }),
      {
        status: 200,
        headers: buildResponseHeaders(auth.setCookieHeaders, true),
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Internal server error' }),
      {
        status: 500,
        headers: buildResponseHeaders(undefined, true),
      }
    );
  }
};

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

    const cleanSlug = String(slug).replace(/\.(md|mdx)$/, '');
    const result = updateArticleArchive(cleanSlug, archived, manualOverride);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let persisted = 'fs';
    let setCookieHeaders: string[] | undefined;

    // Jeśli środowisko jest read-only (np. Vercel Serverless), podejmij próbę zapisu przez GitHub API
    if (result.readOnly) {
      const fileName = result.fileName || `${cleanSlug}.md`;
      const auth = await resolveGitHubAuth(request);
      setCookieHeaders = auth.setCookieHeaders;

      let activeToken = auth.token;

      if (activeToken) {
        const tryCommit = async (tokenToUse: string) => {
          await commitToGitHub({
            token: tokenToUse,
            repo: GITHUB_REPO,
            path: `src/content/news/${fileName}`,
            archived,
            manualOverride,
            fallbackContent: result.content,
            message: `chore(archive): ${archived ? 'archive' : 'unarchive'} article ${cleanSlug}`,
          });
        };

        try {
          await tryCommit(activeToken);
          persisted = 'github';
          saveServerRuntimeArchiveState(cleanSlug, archived, manualOverride);
          cachedGitHubCommitStates[cleanSlug] = {
            archived,
            ...(typeof manualOverride === 'boolean' ? { manualOverride } : {}),
            updatedAt: Date.now(),
          };
        } catch (ghErr: any) {
          // Jeśli ciasteczko keystatic-gh-access-token wygasło (401), spróbujmy odświeżyć przez refresh token
          if ((ghErr?.status === 401 || ghErr?.status === 403) && auth.refreshTokenFn) {
            const refreshed = await auth.refreshTokenFn();
            if (refreshed.token) {
              setCookieHeaders = refreshed.setCookieHeaders;
              try {
                await tryCommit(refreshed.token);
                persisted = 'github';
                saveServerRuntimeArchiveState(cleanSlug, archived, manualOverride);
                cachedGitHubCommitStates[cleanSlug] = {
                  archived,
                  ...(typeof manualOverride === 'boolean' ? { manualOverride } : {}),
                  updatedAt: Date.now(),
                };
              } catch (retryErr: any) {
                console.warn('[Archive API] Ponowna próba zapisu do GitHub API nie powiodła się:', retryErr?.message);
                persisted = 'client';
              }
            } else {
              persisted = 'client';
            }
          } else {
            console.warn('[Archive API] Ostrzeżenie zapisu do GitHub API:', ghErr?.message);
            persisted = 'client';
          }
        }
      } else {
        persisted = 'client';
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        slug: cleanSlug,
        archived,
        manualOverride: typeof manualOverride === 'boolean' ? manualOverride : undefined,
        persisted,
      }),
      {
        status: 200,
        headers: buildResponseHeaders(setCookieHeaders, true),
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
