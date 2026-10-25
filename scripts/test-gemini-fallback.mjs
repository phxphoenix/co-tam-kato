import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  DEFAULT_FALLBACK_MODELS,
  FLASH_LITE_MIN_INTERVAL_MS,
  FLASH_FULL_MIN_INTERVAL_MS,
  FALLBACK_SWITCH_DELAY_MS,
  GEMINI_REQUEST_TIMEOUT_MS,
  exhaustedModels,
  lastCallTimestampByModel,
  getGeminiModels,
  getMinIntervalForModel,
  isTimeoutError,
  callGeminiWithFallback,
} from './daily-digest.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja Model Fallback i Rate Pacingu (Gemini API)');
console.log('======================================================\n');

function resetState() {
  exhaustedModels.clear();
  lastCallTimestampByModel.clear();
}

// ---------------------------------------------------------------------------
// 1. Hierarchia modeli (Single Source of Truth) i zmienna GEMINI_MODELS
// ---------------------------------------------------------------------------
console.log('--- 1. Hierarchia modeli i zmienna środowiskowa GEMINI_MODELS ---');

assert.deepEqual(
  DEFAULT_FALLBACK_MODELS,
  [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  'Domyślna tablica DEFAULT_FALLBACK_MODELS musi mieć dokładnie wymaganą kolejność 7 modeli'
);

const prevEnv = process.env.GEMINI_MODELS;
try {
  delete process.env.GEMINI_MODELS;
  assert.deepEqual(
    getGeminiModels(),
    DEFAULT_FALLBACK_MODELS,
    'Gdy GEMINI_MODELS nie jest ustawione, getGeminiModels() zwraca DEFAULT_FALLBACK_MODELS'
  );

  process.env.GEMINI_MODELS = ' gemini-3-flash , , gemini-2.5-flash-lite , gemini-2.5-flash ';
  assert.deepEqual(
    getGeminiModels(),
    ['gemini-3-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    'GEMINI_MODELS musi być dzielone po przecinku, trimowane i filtrowane z pustych wartości'
  );

  process.env.GEMINI_MODELS = '   ,  ';
  assert.deepEqual(
    getGeminiModels(),
    DEFAULT_FALLBACK_MODELS,
    'Pusty po przefiltrowaniu GEMINI_MODELS powinien wracać do DEFAULT_FALLBACK_MODELS'
  );
} finally {
  if (prevEnv === undefined) delete process.env.GEMINI_MODELS;
  else process.env.GEMINI_MODELS = prevEnv;
}

console.log('✅ Hierarchia modeli (DEFAULT_FALLBACK_MODELS oraz GEMINI_MODELS) zweryfikowana.');

// ---------------------------------------------------------------------------
// 2. Mechanizm Fallback (429 / 503), exhaustedModels oraz bufor 1500 ms
// ---------------------------------------------------------------------------
console.log('\n--- 2. Mechanizm Fallback dla 429/503 i pamięć stanu exhaustedModels ---');

resetState();
{
  const calledModels = [];
  const sleepCalls = [];
  const warnLogs = [];
  const infoLogs = [];
  let simulatedClock = 1_000_000;

  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = (...args) => warnLogs.push(args.join(' '));
  console.log = (...args) => infoLogs.push(args.join(' '));

  try {
    const mockFetch = async (url) => {
      const modelMatch = url.match(/models\/([^:]+):generateContent/);
      const model = modelMatch[1];
      calledModels.push(model);

      if (model === 'gemini-3.8-flash') {
        return {
          ok: false,
          status: 429,
          text: async () => '{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}',
        };
      }
      if (model === 'gemini-3.6-flash') {
        return {
          ok: false,
          status: 503,
          text: async () => '{"error":{"status":"UNAVAILABLE","message":"The model is overloaded"}}',
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '[{"title":"Test News"}]' }] } }],
        }),
      };
    };

    const mockSleep = async (ms) => {
      sleepCalls.push(ms);
      simulatedClock += ms;
    };

    const result = await callGeminiWithFallback({
      prompt: 'Test prompt',
      apiKey: 'test-key',
      fetchImpl: mockFetch,
      sleepImpl: mockSleep,
      nowImpl: () => simulatedClock,
    });

    assert.deepEqual(result, [{ title: 'Test News' }]);
    assert.deepEqual(
      calledModels,
      ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash'],
      'Powinien odpytać kolejno gemini-3.8-flash (429), gemini-3.6-flash (503) i zakończyć sukcesem na gemini-3-flash'
    );
    assert.deepEqual(
      sleepCalls,
      [FALLBACK_SWITCH_DELAY_MS, FALLBACK_SWITCH_DELAY_MS],
      'Przy przełączaniu na nowy model (fallback) powinien odczekać dokładnie 1500 ms (bez 12500 ms throttlingu)'
    );
    assert.equal(exhaustedModels.has('gemini-3.8-flash'), true);
    assert.equal(exhaustedModels.has('gemini-3.6-flash'), true);
    assert.equal(exhaustedModels.has('gemini-3-flash'), false);

    assert.ok(
      warnLogs.some((l) => l.includes('[Gemini Fallback] Model gemini-3.8-flash osiągnął limit') && l.includes('Przełączam na kolejny model z hierarchii...')),
      'Musi zalogować ostrzeżenie [Gemini Fallback] dla gemini-3.8-flash'
    );
    assert.ok(
      warnLogs.some((l) => l.includes('[Gemini Fallback] Model gemini-3.6-flash osiągnął limit') && l.includes('Przełączam na kolejny model z hierarchii...')),
      'Musi zalogować ostrzeżenie [Gemini Fallback] dla gemini-3.6-flash'
    );
    assert.ok(
      infoLogs.some((l) => l.includes('[Gemini Agent] Pomyślnie przetworzono przy użyciu modelu: gemini-3-flash')),
      'Musi zalogować diagnostyczny komunikat sukcesu [Gemini Agent]'
    );

    // Kolejne wywołanie w tym samym przebiegu musi pominąć modele z exhaustedModels
    // oraz zastosować RPM Guard dla gemini-3-flash (minął tylko 2000 ms z wymaganych 12500 ms)
    simulatedClock += 2000;
    const secondResult = await callGeminiWithFallback({
      prompt: 'Second prompt',
      apiKey: 'test-key',
      fetchImpl: mockFetch,
      sleepImpl: mockSleep,
      nowImpl: () => simulatedClock,
    });

    assert.deepEqual(secondResult, [{ title: 'Test News' }]);
    assert.equal(
      calledModels[calledModels.length - 1],
      'gemini-3-flash',
      'Drugie wywołanie musi od razu użyć gemini-3-flash, pomijając wyczerpane modele w exhaustedModels'
    );
    assert.equal(
      sleepCalls[sleepCalls.length - 1],
      FLASH_FULL_MIN_INTERVAL_MS - 2000,
      `Przed drugim wywołaniem tego samego pełnego modelu flash musi odczekać brakujące ${FLASH_FULL_MIN_INTERVAL_MS - 2000} ms (do 12500 ms)`
    );
  } finally {
    console.warn = origWarn;
    console.log = origLog;
  }
}

console.log('✅ Fallback 429/503, bufor 1500 ms, pamięć exhaustedModels oraz logowanie diagnostyczne działają poprawnie.');

// ---------------------------------------------------------------------------
// 3. Ochrona limitów minutowych (RPM / TPM Guard) dla modeli lite (4500 ms) vs full (12500 ms)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Ochrona limitów minutowych (RPM / TPM Guard): 4500 ms (lite) vs 12500 ms (full) ---');

for (const liteModel of ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']) {
  assert.equal(
    getMinIntervalForModel(liteModel),
    4500,
    `Model ${liteModel} musi mieć minimalny odstęp 4500 ms`
  );
}

for (const fullModel of ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash', 'gemini-2.5-flash']) {
  assert.equal(
    getMinIntervalForModel(fullModel),
    12500,
    `Model ${fullModel} musi mieć minimalny odstęp 12500 ms`
  );
}

resetState();
{
  let clock = 500_000;
  const sleeps = [];
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: '[]' }] } }],
    }),
  });
  const mockSleep = async (ms) => {
    sleeps.push(ms);
    clock += ms;
  };

  // Pierwsze wywołanie lite modelu - bez czekania
  await callGeminiWithFallback({
    prompt: 'Lite 1',
    apiKey: 'key',
    models: ['gemini-3.5-flash-lite'],
    fetchImpl: mockFetch,
    sleepImpl: mockSleep,
    nowImpl: () => clock,
  });
  assert.equal(sleeps.length, 0, 'Pierwsze wywołanie modelu nie powinno czekać');

  // Drugie wywołanie lite modelu po 1000 ms -> powinno odczekać 3500 ms (do 4500 ms)
  clock += 1000;
  await callGeminiWithFallback({
    prompt: 'Lite 2',
    apiKey: 'key',
    models: ['gemini-3.5-flash-lite'],
    fetchImpl: mockFetch,
    sleepImpl: mockSleep,
    nowImpl: () => clock,
  });
  assert.deepEqual(sleeps, [3500], 'Drugie wywołanie modelu lite po 1000 ms musi odczekać 3500 ms (łącznie 4500 ms)');
}

console.log('✅ Throttling RPM/TPM Guard (4500 ms dla lite, 12500 ms dla full) zweryfikowany.');

// ---------------------------------------------------------------------------
// 4. Błędy niebędące limitami (np. 400 Bad Request, błąd parsowania JSON) NIE przełączają modelu
// ---------------------------------------------------------------------------
console.log('\n--- 4. Brak przełączania modelu przy błędach 400 Bad Request i błędach parsowania ---');

resetState();
{
  const calledModels400 = [];
  const mockFetch400 = async (url) => {
    const model = url.match(/models\/([^:]+):generateContent/)[1];
    calledModels400.push(model);
    return {
      ok: false,
      status: 400,
      text: async () => '{"error":{"status":"INVALID_ARGUMENT","message":"Bad Request"}}',
    };
  };

  await assert.rejects(
    () =>
      callGeminiWithFallback({
        prompt: 'Bad request test',
        apiKey: 'key',
        fetchImpl: mockFetch400,
      }),
    /HTTP 400/,
    'Błąd HTTP 400 musi zostać rzucony natychmiast'
  );
  assert.deepEqual(
    calledModels400,
    ['gemini-3.8-flash'],
    'Przy błędzie 400 Bad Request skrypt NIE MOŻE przełączać na kolejny model'
  );
  assert.equal(
    exhaustedModels.has('gemini-3.8-flash'),
    false,
    'Błąd 400 nie powinien dodawać modelu do exhaustedModels'
  );
}

resetState();
{
  const calledModelsParse = [];
  const mockFetchInvalidJson = async (url) => {
    const model = url.match(/models\/([^:]+):generateContent/)[1];
    calledModelsParse.push(model);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'To nie jest poprawny JSON' }] } }],
      }),
    };
  };

  await assert.rejects(
    () =>
      callGeminiWithFallback({
        prompt: 'Parse error test',
        apiKey: 'key',
        fetchImpl: mockFetchInvalidJson,
      }),
    SyntaxError,
    'Błąd parsowania JSON musi zostać rzucony natychmiast'
  );
  assert.deepEqual(
    calledModelsParse,
    ['gemini-3.8-flash'],
    'Przy błędzie parsowania odpowiedzi skrypt NIE MOŻE przełączać na kolejny model'
  );
}

console.log('✅ Błędy 400 Bad Request oraz błędy parsowania JSON zatrzymują wywołanie bez przełączania modelu.');

// ---------------------------------------------------------------------------
// 5. Spójność konfiguracji GitHub Actions (.github/workflows/daily-digest.yml)
// ---------------------------------------------------------------------------
console.log('\n--- 5. Spójność zmiennej GEMINI_MODELS i timeout-minutes w GitHub Actions ---');

{
  const workflowPath = path.resolve('.github/workflows/daily-digest.yml');
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  assert.match(
    workflowContent,
    /timeout-minutes:\s*15/,
    'Workflow daily-digest.yml musi zawierać timeout-minutes: 15'
  );

  const envMatch = workflowContent.match(/GEMINI_MODELS:\s*"([^"]+)"/);
  assert.ok(envMatch, 'Workflow daily-digest.yml musi definiować zmienną GEMINI_MODELS');

  const parsedFromYaml = getGeminiModels(envMatch[1]);
  assert.deepEqual(
    parsedFromYaml,
    DEFAULT_FALLBACK_MODELS,
    'Wartość GEMINI_MODELS w daily-digest.yml musi być w 100% spójna z hierarchią w daily-digest.mjs'
  );
}

console.log('✅ Konfiguracja .github/workflows/daily-digest.yml jest spójna ze skryptem agenta.');

// ---------------------------------------------------------------------------
// 6. Obsługa timeoutów (AbortSignal.timeout, UND_ERR_*, HTTP 504, stream body) w Fallbacku
// ---------------------------------------------------------------------------
console.log('\n--- 6. Obsługa timeoutów (AbortSignal.timeout, UND_ERR_HEADERS_TIMEOUT, HTTP 504, body stream) ---');

assert.equal(GEMINI_REQUEST_TIMEOUT_MS, 60000, 'Domyślny timeout pojedynczego zapytania Gemini musi wynosić 60000 ms (60s)');
assert.equal(
  isTimeoutError(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
  true,
  'DOMException TimeoutError z AbortSignal.timeout musi być rozpoznawany jako timeout'
);
assert.equal(
  isTimeoutError(new TypeError('fetch failed', { cause: Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' }) })),
  true,
  'Undici UND_ERR_HEADERS_TIMEOUT wewnątrz error.cause musi być rozpoznawany jako timeout'
);
assert.equal(
  isTimeoutError(new Error('Invalid JSON'), 400, 'INVALID_ARGUMENT'),
  false,
  'Zwykły błąd 400 nie może być rozpoznawany jako timeout'
);

resetState();
{
  const calledModelsTimeout = [];
  const sleepCallsTimeout = [];
  const warnLogsTimeout = [];
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = (...args) => warnLogsTimeout.push(args.join(' '));
  console.log = () => {};

  try {
    const mockFetchTimeouts = async (url, init) => {
      const model = url.match(/models\/([^:]+):generateContent/)[1];
      calledModelsTimeout.push(model);

      // Model 1: rzeczywiste przerwanie przez AbortSignal.timeout(requestTimeoutMs)
      // (symulujemy otwarte gniazdo sieciowe za pomocą ref-owanego timera, tak jak w prawdziwym fetch)
      if (model === 'gemini-3.8-flash') {
        await new Promise((_, reject) => {
          const openSocketTimer = setTimeout(() => {}, 5000);
          if (init?.signal?.aborted) {
            clearTimeout(openSocketTimer);
            reject(init.signal.reason);
            return;
          }
          init?.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(openSocketTimer);
              reject(init.signal.reason);
            },
            { once: true }
          );
        });
      }

      // Model 2: błąd sieciowy Undici z kodem UND_ERR_HEADERS_TIMEOUT w cause
      if (model === 'gemini-3.6-flash') {
        throw new TypeError('fetch failed', {
          cause: Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' }),
        });
      }

      // Model 3: odpowiedź HTTP 504 DEADLINE_EXCEEDED z Google API
      if (model === 'gemini-3-flash') {
        return {
          ok: false,
          status: 504,
          text: async () => '{"error":{"code":504,"status":"DEADLINE_EXCEEDED","message":"Deadline expired before operation could complete."}}',
        };
      }

      // Model 4: nagłówki 200 OK przyszły, ale strumień body zawiesił się i rzucił TimeoutError przy response.json()
      if (model === 'gemini-3.5-flash-lite') {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
          },
        };
      }

      // Model 5: sukces!
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '[{"title":"Po timeoutach dziala"}]' }] } }],
        }),
      };
    };

    const result = await callGeminiWithFallback({
      prompt: 'Timeout fallback test',
      apiKey: 'key',
      requestTimeoutMs: 30,
      fetchImpl: mockFetchTimeouts,
      sleepImpl: async (ms) => {
        sleepCallsTimeout.push(ms);
      },
    });

    assert.deepEqual(result, [{ title: 'Po timeoutach dziala' }]);
    assert.deepEqual(
      calledModelsTimeout,
      [
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-3-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
      ],
      'Powinien przełączyć kolejno przez wszystkie 4 warianty timeoutów aż do gemini-3.1-flash-lite'
    );
    assert.deepEqual(
      sleepCallsTimeout,
      [
        FALLBACK_SWITCH_DELAY_MS,
        FALLBACK_SWITCH_DELAY_MS,
        FALLBACK_SWITCH_DELAY_MS,
        FALLBACK_SWITCH_DELAY_MS,
      ],
      'Każdy fallback po timeoucie musi odczekać FALLBACK_SWITCH_DELAY_MS (1500 ms)'
    );
    assert.equal(exhaustedModels.has('gemini-3.8-flash'), true);
    assert.equal(exhaustedModels.has('gemini-3.6-flash'), true);
    assert.equal(exhaustedModels.has('gemini-3-flash'), true);
    assert.equal(exhaustedModels.has('gemini-3.5-flash-lite'), true);
    assert.equal(exhaustedModels.has('gemini-3.1-flash-lite'), false);
    assert.equal(warnLogsTimeout.length, 4, 'Powinny zostać zapisane 4 ostrzeżenia [Gemini Fallback] o przekroczeniu czasu oczekiwania');
    assert.ok(
      warnLogsTimeout.every((l) => l.includes('[Gemini Fallback]') && l.includes('przekroczył czas oczekiwania')),
      'Każdy log timeoutu musi zawierać frazę "przekroczył czas oczekiwania"'
    );
  } finally {
    console.warn = origWarn;
    console.log = origLog;
  }
}

// Sprawdzenie, że timeout na wszystkich modelach kończy się rzuceniem wyjątku
resetState();
{
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const calledAllTimeout = [];
    await assert.rejects(
      () =>
        callGeminiWithFallback({
          prompt: 'All timeout',
          apiKey: 'key',
          models: ['gemini-3.8-flash', 'gemini-2.5-flash-lite'],
          fetchImpl: async (url) => {
            calledAllTimeout.push(url.match(/models\/([^:]+):generateContent/)[1]);
            throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
          },
          sleepImpl: async () => {},
        }),
      /aborted due to timeout/,
      'Gdy wszystkie modele z listy przekroczą timeout, funkcja musi rzucić błąd timeoutu'
    );
    assert.deepEqual(calledAllTimeout, ['gemini-3.8-flash', 'gemini-2.5-flash-lite']);
  } finally {
    console.warn = origWarn;
  }
}

console.log('✅ Obsługa timeoutów (AbortSignal.timeout, UND_ERR_*, HTTP 504, odczyt body) w Fallbacku działa bezbłędnie.');
console.log('\n🎉 Wszystkie testy Model Fallback i Rate Pacingu zakończone sukcesem (100% PASS)!\n');
