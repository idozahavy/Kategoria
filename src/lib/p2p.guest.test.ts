import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type GuestSession, joinRoom } from './p2p';
import {
  type FakeConn,
  FakePeer,
  flush,
  stubNoTurnEndpoint,
  stubStorage,
} from './p2p.test-helpers';

vi.mock('peerjs', async () => {
  const { FakePeer: Peer } = await import('./p2p.test-helpers');
  return { default: Peer };
});

beforeEach(() => {
  vi.useFakeTimers();
  FakePeer.reset();
  stubNoTurnEndpoint();
  stubStorage({ 'categories-device-id': 'dev-1' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Drive a join up to the point where the host connection is open. */
async function connect(
  code = 'abcd',
  name = 'Ida',
  avatar?: string,
): Promise<{ pending: Promise<GuestSession>; peer: FakePeer; conn: FakeConn }> {
  const pending = joinRoom(code, name, avatar);
  pending.catch(() => undefined); // failure cases assert on it explicitly
  await flush();
  const peer = FakePeer.last();
  peer.emit('open');
  const link = peer.connections[0];
  if (!link) throw new Error('joinRoom did not connect');
  link.conn.emit('open');
  return { pending, peer, conn: link.conn };
}

describe('joinRoom handshake', () => {
  it('connects reliably to the normalized room id and says hello with its device id', async () => {
    const { peer, conn } = await connect(' ab cd ', 'Ida', '🦋');
    expect(peer.id).toBeNull();
    expect(peer.connections[0]?.id).toBe('kidcategories-v1-ABCD');
    expect(peer.connections[0]?.options).toEqual({ reliable: true });
    expect(conn.sent).toEqual([{ type: 'hello', name: 'Ida', deviceId: 'dev-1', avatar: '🦋' }]);
  });

  it('leaves the avatar key out entirely when none was chosen', async () => {
    const { conn } = await connect('abcd', 'Ida');
    expect(conn.sent[0]).toEqual({ type: 'hello', name: 'Ida', deviceId: 'dev-1' });
    expect(Object.keys(conn.sent[0] as object)).not.toContain('avatar');
  });

  it('mints and stores a device id the first time this browser joins', async () => {
    const store = stubStorage();
    const { conn } = await connect();
    const hello = conn.sent[0] as { deviceId: string };
    expect(hello.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.get('categories-device-id')).toBe(hello.deviceId);
  });

  it('resolves the session with the welcomed player id', async () => {
    const { pending, conn } = await connect();
    conn.emit('data', { type: 'welcome', playerId: 'guest-3-42' });
    await expect(pending).resolves.toMatchObject({ playerId: 'guest-3-42' });
  });

  it('a "busy" answer before welcome means the room is not open to us', async () => {
    const { pending, peer, conn } = await connect();
    conn.emit('data', { type: 'busy' });
    await expect(pending).rejects.toThrow('not-found');
    expect(peer.destroyed).toBe(true);
  });

  it('an unknown room id fails as not-found, other broker errors as network', async () => {
    const first = joinRoom('abcd', 'Ida');
    await flush();
    FakePeer.last().emit('error', { type: 'peer-unavailable' });
    await expect(first).rejects.toThrow('not-found');

    const second = joinRoom('abcd', 'Ida');
    await flush();
    FakePeer.last().emit('error', { type: 'socket-error' });
    await expect(second).rejects.toThrow('network');
  });

  it('a connection that closes before welcome fails as network', async () => {
    const { pending, conn } = await connect();
    conn.emit('close');
    await expect(pending).rejects.toThrow('network');
  });

  it('a connection error before welcome fails as network and frees the peer', async () => {
    const { pending, peer, conn } = await connect();
    conn.emit('error', new Error('ice failed'));
    await expect(pending).rejects.toThrow('network');
    expect(peer.destroyed).toBe(true);
  });

  it('gives up as network when no welcome arrives within 12 s', async () => {
    const { pending, peer } = await connect();
    vi.advanceTimersByTime(12_000);
    await expect(pending).rejects.toThrow('network');
    expect(peer.destroyed).toBe(true);
  });
});

describe('joined session', () => {
  async function joined(): Promise<{ session: GuestSession; peer: FakePeer; conn: FakeConn }> {
    const { pending, peer, conn } = await connect();
    conn.emit('data', { type: 'welcome', playerId: 'guest-1-1' });
    return { session: await pending, peer, conn };
  }

  it('forwards later host messages to onMessage and sends answers over the connection', async () => {
    const { session, conn } = await joined();
    const seen: unknown[] = [];
    session.onMessage((m) => seen.push(m));
    const roster = { type: 'roster', names: ['Ida'] };
    conn.emit('data', roster);
    conn.emit('data', { type: 'nonsense' });
    expect(seen).toEqual([roster]);

    session.send({ type: 'answers', roundIndex: 0, answers: { animal: 'ant' } });
    expect(conn.sent.at(-1)).toEqual({
      type: 'answers',
      roundIndex: 0,
      answers: { animal: 'ant' },
    });
  });

  it('reports the host going away through onClose, once per close or error', async () => {
    const { session, conn } = await joined();
    const onClose = vi.fn();
    session.onClose(onClose);
    conn.emit('close');
    conn.emit('error');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('close() tears down both the connection and the peer', async () => {
    const { session, peer, conn } = await joined();
    session.close();
    expect(conn.closed).toBe(true);
    expect(peer.destroyed).toBe(true);
  });
});
