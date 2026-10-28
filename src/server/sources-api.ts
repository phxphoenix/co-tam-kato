import type { APIRoute } from 'astro';
import {
  getAllSources,
  getPaginationSettings,
  addSource,
  updateSource,
  updatePaginationSettings,
  type AddSourceInput,
  type UpdateSourceInput,
  type PaginationSettings,
} from './sources-service';

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
    'User-Agent': 'co-tam-kato-sources',
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

async function getGitHubToken(request: Request): Promise<string | undefined> {
  const { resolveGitHubAuth } = await import('./github-auth.ts');
  const auth = await resolveGitHubAuth(request);
  return auth.token;
}

export const GET: APIRoute = async () => {
  try {
    const sources = getAllSources();
    const paginationSettings = getPaginationSettings();
    return new Response(JSON.stringify({ success: true, sources, paginationSettings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Błąd odczytu źródeł' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Content-Type musi być application/json' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const body = (await request.json()) as AddSourceInput;
    const result = addSource(body);

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let persisted = 'fs';

    if (result.readOnly && result.content) {
      const token = await getGitHubToken(request);
      if (token) {
        try {
          await commitToGitHub({
            token,
            repo: GITHUB_REPO,
            path: 'config/sources.md',
            content: result.content,
            message: `chore(sources): add new source "${result.source?.name}" (ID ${result.source?.id})`,
          });
          persisted = 'github';
        } catch (ghErr: any) {
          console.warn('[Sources API] Ostrzeżenie zapisu do GitHub API:', ghErr?.message);
          persisted = 'client';
        }
      } else {
        persisted = 'client';
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: result.source,
        sources: result.sources,
        persisted,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Błąd serwera' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Content-Type musi być application/json' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const body = (await request.json()) as UpdateSourceInput & {
      paginationSettings?: Partial<PaginationSettings>;
      homePageSize?: number;
      archivePageSize?: number;
      adminArchivePageSize?: number;
    };

    const isPaginationUpdate =
      body.paginationSettings !== undefined ||
      (!body.id &&
        (body.homePageSize !== undefined ||
          body.archivePageSize !== undefined ||
          body.adminArchivePageSize !== undefined));

    if (isPaginationUpdate) {
      const settingsInput = body.paginationSettings || {
        homePageSize: body.homePageSize,
        archivePageSize: body.archivePageSize,
        adminArchivePageSize: body.adminArchivePageSize,
      };
      const result = updatePaginationSettings(settingsInput);

      if (!result.success) {
        return new Response(JSON.stringify({ success: false, error: result.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      let persisted = 'fs';

      if (result.readOnly && result.content) {
        const token = await getGitHubToken(request);
        if (token) {
          try {
            await commitToGitHub({
              token,
              repo: GITHUB_REPO,
              path: 'config/sources.md',
              content: result.content,
              message: `chore(sources): update pagination settings in config/sources.md`,
            });
            persisted = 'github';
          } catch (ghErr: any) {
            console.warn('[Sources API] Ostrzeżenie zapisu do GitHub API:', ghErr?.message);
            persisted = 'client';
          }
        } else {
          persisted = 'client';
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          paginationSettings: result.paginationSettings,
          sources: result.sources,
          persisted,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const result = updateSource(body);

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let persisted = 'fs';

    if (result.readOnly && result.content) {
      const token = await getGitHubToken(request);
      if (token) {
        try {
          await commitToGitHub({
            token,
            repo: GITHUB_REPO,
            path: 'config/sources.md',
            content: result.content,
            message: `chore(sources): update source "${result.source?.name}" (ID ${result.source?.id})`,
          });
          persisted = 'github';
        } catch (ghErr: any) {
          console.warn('[Sources API] Ostrzeżenie zapisu do GitHub API:', ghErr?.message);
          persisted = 'client';
        }
      } else {
        persisted = 'client';
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: result.source,
        sources: result.sources,
        persisted,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Błąd serwera' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const PUT: APIRoute = async (context) => {
  return PATCH(context);
};
