import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  getLearnedWords: vi.fn(() => Promise.resolve([])),
  addLearnedWord: vi.fn(() => Promise.resolve()),
  removeLearnedWord: vi.fn(() => Promise.resolve()),
}));

type Validation = typeof import('./validation');

// Verdicts, the one-at-a-time queue and the failure cooldown are module
// state, so every case imports a fresh copy.
async function loadValidation(): Promise<Validation> {
  vi.resetModules();
  return import('./validation');
}

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

function stubFetch(routes: Record<string, () => Response | Promise<Response>>): FetchMock {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
    const hit = Object.entries(routes).find(([needle]) => url.includes(needle));
    return hit ? Promise.resolve(hit[1]()) : Promise.reject(new TypeError('Failed to fetch'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const search =
  (...matches: string[]) =>
  (): Response =>
    Response.json({
      search: matches.map((text, i) => ({ id: `Q${String(i + 1)}`, match: { text } })),
    });
const ask = (answer: boolean) => (): Response => Response.json({ boolean: answer });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('inWikidataCategory', () => {
  it('cannot judge a category it has no class for, and does not go online for it', async () => {
    const fetchMock = stubFetch({});
    const { inWikidataCategory } = await loadValidation();
    await expect(inWikidataCategory('spoon', 'object', 'en')).resolves.toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a word Wikidata has never heard of as a non-fit and remembers that', async () => {
    const fetchMock = stubFetch({ wbsearchentities: search() });
    const { inWikidataCategory } = await loadValidation();
    await expect(inWikidataCategory('Blorptle', 'animal', 'en')).resolves.toBe('nofit');
    await expect(inWikidataCategory('blorptle', 'animal', 'en')).resolves.toBe('nofit');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps only entities whose label is exactly the word, not prefix matches', async () => {
    const fetchMock = stubFetch({ wbsearchentities: search('okapi tree', 'okapi cake') });
    const { inWikidataCategory } = await loadValidation();
    await expect(inWikidataCategory('okapi', 'animal', 'en')).resolves.toBe('nofit');
    expect(fetchMock.mock.calls.some(([url]) => url.includes('sparql'))).toBe(false);
  });

  it('asks the graph whether any candidate is in the class and reports fit / nofit', async () => {
    const fetchMock = stubFetch({ wbsearchentities: search('okapi'), sparql: ask(true) });
    const { inWikidataCategory } = await loadValidation();
    await expect(inWikidataCategory('okapi', 'animal', 'en')).resolves.toBe('fit');
    const sparqlUrl = fetchMock.mock.calls.find(([url]) => url.includes('sparql'))?.[0] ?? '';
    const query = decodeURIComponent(sparqlUrl.split('query=')[1] ?? '');
    expect(query).toContain('VALUES ?item { wd:Q1 }');
    expect(query).toContain('wd:Q729');

    stubFetch({ wbsearchentities: search('anvil'), sparql: ask(false) });
    await expect(inWikidataCategory('anvil', 'animal', 'en')).resolves.toBe('nofit');
  });

  it('after a failed query it skips Wikidata for a minute, then tries again', async () => {
    const failing = stubFetch({
      wbsearchentities: search('rhea'),
      sparql: () => new Response('', { status: 429 }),
    });
    const { inWikidataCategory } = await loadValidation();
    await expect(inWikidataCategory('rhea', 'animal', 'en')).resolves.toBe('error');
    const sparqlCalls = failing.mock.calls.filter(([url]) => url.includes('sparql')).length;
    expect(sparqlCalls).toBe(1);

    const during = stubFetch({ wbsearchentities: search('emu'), sparql: ask(true) });
    vi.advanceTimersByTime(59_000);
    await expect(inWikidataCategory('emu', 'animal', 'en')).resolves.toBe('error');
    expect(during).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    await expect(inWikidataCategory('emu', 'animal', 'en')).resolves.toBe('fit');
  });

  it('a dead network counts as a failure too', async () => {
    stubFetch({});
    const { inWikidataCategory } = await loadValidation();
    await expect(inWikidataCategory('kiwi', 'animal', 'en')).resolves.toBe('error');
  });

  it('runs one check at a time so the public endpoint is never hit in a burst', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const word = decodeURIComponent(url.split('search=')[1]?.split('&')[0] ?? 'x');
      const body = url.includes('sparql')
        ? { boolean: true }
        : { search: [{ id: 'Q1', match: { text: word } }] };
      return new Promise((resolve) =>
        setTimeout(() => {
          inFlight -= 1;
          resolve(Response.json(body));
        }, 10),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const { inWikidataCategory } = await loadValidation();

    const pending = Promise.all([
      inWikidataCategory('ant', 'animal', 'en'),
      inWikidataCategory('bee', 'animal', 'en'),
      inWikidataCategory('cat', 'animal', 'en'),
    ]);
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toEqual(['fit', 'fit', 'fit']);
    expect(maxInFlight).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('a failing entity search starts the cooldown too, without asking the graph', async () => {
    const failing = stubFetch({
      wbsearchentities: () =>
        Response.json({ search: [{ id: 'Q1', match: { text: 'saola' } }] }, { status: 500 }),
      sparql: ask(true),
    });
    const { inWikidataCategory } = await loadValidation();
    await expect(inWikidataCategory('saola', 'animal', 'en')).resolves.toBe('error');
    expect(failing.mock.calls.some(([url]) => url.includes('sparql'))).toBe(false);

    const during = stubFetch({ wbsearchentities: search('emu'), sparql: ask(true) });
    vi.advanceTimersByTime(59_000);
    await expect(inWikidataCategory('emu', 'animal', 'en')).resolves.toBe('error');
    expect(during).not.toHaveBeenCalled();
  });

  it('a queued check reuses a verdict that landed meanwhile, or gives up once Wikidata is down', async () => {
    const fetchMock = stubFetch({ wbsearchentities: search('okapi'), sparql: ask(true) });
    const { inWikidataCategory } = await loadValidation();
    const twice = await Promise.all([
      inWikidataCategory('okapi', 'animal', 'en'),
      inWikidataCategory('Okapi', 'animal', 'en'),
    ]);
    expect(twice).toEqual(['fit', 'fit']);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one search and one ask, not two of each

    const down = stubFetch({ wbsearchentities: () => new Response('', { status: 503 }) });
    const fresh = await loadValidation();
    const behind = await Promise.all([
      fresh.inWikidataCategory('rhea', 'animal', 'en'),
      fresh.inWikidataCategory('emu', 'animal', 'en'),
    ]);
    expect(behind).toEqual(['error', 'error']);
    expect(down).toHaveBeenCalledTimes(1); // emu was queued behind the failure and never fetched
  });
});
