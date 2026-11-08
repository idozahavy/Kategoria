import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRoom } from './p2p';
import { FakePeer, flush } from './p2p.test-helpers';
import { getTurnstileToken } from './turnstile';

vi.mock('peerjs', async () => {
  const { FakePeer: Peer } = await import('./p2p.test-helpers');
  return { default: Peer };
});

vi.mock('./turnstile', () => ({ getTurnstileToken: vi.fn(() => Promise.resolve(null)) }));
const turnstileMock = vi.mocked(getTurnstileToken);

// A successful TURN lookup is remembered for the whole page load (module
// state), so this file holds only that case; the not-remembered failure cases
// live in p2p.host.test.ts where they cannot poison later tests. The tests
// run in order: each later one moves the clock past the previous credentials.

beforeEach(() => {
  FakePeer.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  turnstileMock.mockReset();
  turnstileMock.mockImplementation(() => Promise.resolve(null));
});

async function openRoom(): Promise<FakePeer> {
  const pending = createRoom();
  await flush();
  const peer = FakePeer.last();
  peer.emit('open');
  await pending;
  return peer;
}

const HOUR_MS = 60 * 60 * 1000;
/** Host peers also carry the room's broker token. */
const ANY_TOKEN = expect.any(String) as unknown;

describe('TURN credentials for the peer', () => {
  it('asks /turn-credentials once and hands the ice servers to every peer afterwards', async () => {
    const iceServers = [{ urls: 'turn:relay.example', username: 'u', credential: 'c' }];
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(Response.json({ iceServers })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await openRoom();
    const second = await openRoom();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/turn-credentials');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body');
    expect(first.options).toEqual({ config: { iceServers }, token: ANY_TOKEN });
    expect(second.options).toEqual({ config: { iceServers }, token: ANY_TOKEN });
  });

  it('asks again once the remembered credentials near their TTL', async () => {
    const iceServers = [{ urls: 'turn:relay.example', username: 'u2', credential: 'c2' }];
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ iceServers })));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(Date.now() + HOUR_MS);
    await openRoom();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 31 * 60_000);
    const later = await openRoom();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(later.options).toEqual({ config: { iceServers }, token: ANY_TOKEN });
  });

  it('sends the Turnstile token as JSON when the bot check is configured', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10 * HOUR_MS);
    turnstileMock.mockImplementation(() => Promise.resolve('ts-token'));
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ iceServers: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await openRoom();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ turnstileToken: 'ts-token' });
  });
});
