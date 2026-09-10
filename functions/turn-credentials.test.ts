import { afterEach, describe, expect, it, vi } from 'vitest';

import { onRequestPost } from './turn-credentials';

const env = { TURN_KEY_ID: 'key-1', TURN_API_TOKEN: 'secret-token' };

function request(
  headers: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' },
  body?: unknown,
): Request {
  return new Request('https://kategoria.pages.dev/turn-credentials', {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function stubUpstream(impl: (url: string) => Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /turn-credentials', () => {
  it('refuses cross-site callers before touching the TURN API', async () => {
    const fetchMock = stubUpstream(() => Promise.resolve(Response.json({})));
    const res = await onRequestPost({ request: request({ 'Sec-Fetch-Site': 'cross-site' }), env });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the Origin header when Sec-Fetch-Site is missing', async () => {
    stubUpstream(() => Promise.resolve(Response.json({ iceServers: [] })));
    const same = await onRequestPost({
      request: request({ Origin: 'https://kategoria.pages.dev' }),
      env,
    });
    const other = await onRequestPost({
      request: request({ Origin: 'https://evil.example' }),
      env,
    });
    const none = await onRequestPost({ request: request({}), env });
    expect(same.status).toBe(200);
    expect(other.status).toBe(403);
    expect(none.status).toBe(403);
  });

  it('answers 503 when the TURN secrets are not configured', async () => {
    const fetchMock = stubUpstream(() => Promise.resolve(Response.json({})));
    const res = await onRequestPost({ request: request(), env: { TURN_KEY_ID: 'key-1' } });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'turn-not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mints 2 h credentials with the bearer token and passes the ice servers through', async () => {
    const body = { iceServers: [{ urls: 'turn:relay', username: 'u', credential: 'c' }] };
    const fetchMock = stubUpstream(() => Promise.resolve(Response.json(body)));

    const res = await onRequestPost({ request: request(), env });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    await expect(res.json()).resolves.toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' });
    expect(JSON.parse(init.body as string)).toEqual({ ttl: 7_200 });
  });

  it('reports an upstream failure as 502, whether it answered badly or not at all', async () => {
    stubUpstream(() => Promise.resolve(new Response('down', { status: 500 })));
    const bad = await onRequestPost({ request: request(), env });
    expect(bad.status).toBe(502);
    await expect(bad.json()).resolves.toEqual({ error: 'turn-upstream' });

    stubUpstream(() => Promise.reject(new Error('timeout')));
    const thrown = await onRequestPost({ request: request(), env });
    expect(thrown.status).toBe(502);
  });

  it('ignores a Turnstile token while no secret is configured', async () => {
    const fetchMock = stubUpstream(() => Promise.resolve(Response.json({ iceServers: [] })));
    const res = await onRequestPost({
      request: request(undefined, { turnstileToken: 'tok' }),
      env,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('rtc.live.cloudflare.com');
  });
});

describe('POST /turn-credentials with Turnstile configured', () => {
  const guarded = { ...env, TURNSTILE_SECRET_KEY: 'ts-secret' };
  /** What a curl script forging the browser header looks like. */
  const forged = { 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9' };

  function stubVerifyThenMint(verify: () => Promise<Response>): ReturnType<typeof vi.fn> {
    return stubUpstream((url) =>
      url.startsWith('https://challenges.cloudflare.com/')
        ? verify()
        : Promise.resolve(Response.json({ iceServers: [{ urls: 'turn:relay' }] })),
    );
  }

  it('refuses a same-origin-looking request that carries no token (forged headers)', async () => {
    const fetchMock = stubUpstream(() => Promise.resolve(Response.json({ success: true })));
    const noBody = await onRequestPost({ request: request(forged), env: guarded });
    const badJson = await onRequestPost({
      request: new Request('https://kategoria.pages.dev/turn-credentials', {
        method: 'POST',
        headers: forged,
        body: 'not json',
      }),
      env: guarded,
    });
    const emptyToken = await onRequestPost({
      request: request(forged, { turnstileToken: '' }),
      env: guarded,
    });
    for (const res of [noBody, badJson, emptyToken]) {
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'turnstile-required' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifies the token with the secret and caller IP before minting', async () => {
    const fetchMock = stubVerifyThenMint(() => Promise.resolve(Response.json({ success: true })));
    const res = await onRequestPost({
      request: request(forged, { turnstileToken: 'tok-1' }),
      env: guarded,
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ iceServers: [{ urls: 'turn:relay' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(JSON.parse(init.body as string)).toEqual({
      secret: 'ts-secret',
      response: 'tok-1',
      remoteip: '203.0.113.9',
    });
  });

  it('rejects a token Turnstile does not accept and never touches the TURN API', async () => {
    const fetchMock = stubVerifyThenMint(() =>
      Promise.resolve(Response.json({ success: false, 'error-codes': ['invalid-input-response'] })),
    );
    const res = await onRequestPost({
      request: request(forged, { turnstileToken: 'replayed' }),
      env: guarded,
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'turnstile-failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed with 502 when siteverify is down or answers badly', async () => {
    stubVerifyThenMint(() => Promise.resolve(new Response('down', { status: 500 })));
    const bad = await onRequestPost({
      request: request(forged, { turnstileToken: 'tok' }),
      env: guarded,
    });
    expect(bad.status).toBe(502);
    await expect(bad.json()).resolves.toEqual({ error: 'turnstile-upstream' });

    const fetchMock = stubVerifyThenMint(() => Promise.reject(new Error('timeout')));
    const thrown = await onRequestPost({
      request: request(forged, { turnstileToken: 'tok' }),
      env: guarded,
    });
    expect(thrown.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a JSON body that is not an object as carrying no token', async () => {
    const fetchMock = stubUpstream(() => Promise.resolve(Response.json({ success: true })));
    const asString = await onRequestPost({ request: request(forged, 'tok-1'), env: guarded });
    const asArray = await onRequestPost({ request: request(forged, ['tok-1']), env: guarded });
    for (const res of [asString, asArray]) {
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'turnstile-required' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves remoteip out of the verification when the caller IP is unknown', async () => {
    const fetchMock = stubVerifyThenMint(() => Promise.resolve(Response.json({ success: true })));
    const res = await onRequestPost({
      request: request({ 'Sec-Fetch-Site': 'same-origin' }, { turnstileToken: 'tok-2' }),
      env: guarded,
    });
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ secret: 'ts-secret', response: 'tok-2' });
  });

  it('reads a siteverify answer without a success flag as a failed check', async () => {
    const noFlag = stubVerifyThenMint(() => Promise.resolve(Response.json({})));
    const res = await onRequestPost({
      request: request(forged, { turnstileToken: 'tok-3' }),
      env: guarded,
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'turnstile-failed' });
    expect(noFlag).toHaveBeenCalledTimes(1);
  });
});
