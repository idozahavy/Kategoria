import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type GuestSession, isHostMessage, joinRoom } from './p2p';
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

  it('BUG-001: forwards every real message shape a host screen actually sends', async () => {
    const { session, conn } = await joined();
    const seen: unknown[] = [];
    session.onMessage((m) => seen.push(m));
    const category = { id: 'animal', label: 'Animal', emoji: '🐶' };
    const standingRow = { name: 'Ida', score: 10, colorIndex: 0, delta: 3, isWinner: false };
    // Same shape but with the avatar key present as null — PeerJS's binary
    // serialization turns an omitted/undefined field into null on the wire.
    const standingRowWithNullAvatar = { ...standingRow, avatar: null };
    const legit = [
      { type: 'welcome', playerId: 'guest-1-1' },
      { type: 'roster', names: ['Ida', 'Ido'] },
      { type: 'busy' },
      {
        type: 'round',
        roundIndex: 0,
        roundCount: 3,
        letter: 'A',
        seconds: 60,
        totalSeconds: 60,
        categories: [category],
      },
      // A mid-round rebroadcast after a host reload sends null timers.
      {
        type: 'round',
        roundIndex: 0,
        roundCount: 0,
        letter: 'A',
        seconds: null,
        totalSeconds: null,
        categories: [category],
      },
      { type: 'received' },
      { type: 'vote', voteId: 'v1', word: 'ant', category, ownerIds: ['guest-1-1'] },
      {
        type: 'results',
        roundIndex: 0,
        roundCount: 3,
        letter: 'A',
        categories: [
          {
            ...category,
            answers: [
              { playerId: 'guest-1-1', name: 'Ida', word: 'ant', status: 'valid', points: 2 },
            ],
          },
        ],
        standings: [standingRow, standingRowWithNullAvatar],
        isUniqueScoring: true,
      },
      { type: 'scores', rows: [standingRow], winner: 'Ida' },
      { type: 'ended' },
    ];
    for (const msg of legit) conn.emit('data', msg);
    expect(seen).toEqual(legit);
  });

  it('BUG-001: rejects host messages whose payload does not match the declared type', async () => {
    const { session, conn } = await joined();
    const seen: unknown[] = [];
    session.onMessage((m) => seen.push(m));
    const category = { id: 'animal', label: 'Animal', emoji: '🐶' };
    const malformed = [
      { type: 'welcome' }, // missing playerId
      { type: 'roster', names: 'Ida' }, // names not an array
      { type: 'round', roundIndex: 0, roundCount: 3, letter: 'A', seconds: 60 }, // no categories/totalSeconds
      {
        type: 'round',
        roundIndex: 0,
        roundCount: 3,
        letter: 'A',
        seconds: 60,
        totalSeconds: 60,
        categories: [{ id: 'x' }],
      }, // category missing fields
      { type: 'vote', voteId: 'v1', word: 'ant', category, ownerIds: 'guest-1-1' }, // ownerIds not an array
      {
        type: 'results',
        roundIndex: 0,
        roundCount: 3,
        letter: 'A',
        categories: [
          {
            ...category,
            answers: [{ playerId: 'g', name: 'I', word: 'ant', status: 'bogus', points: 2 }],
          },
        ],
        standings: [],
        isUniqueScoring: true,
      }, // invalid AnswerStatus
      {
        type: 'scores',
        rows: [{ name: 'Ida', score: 10, colorIndex: 0, delta: 3 }],
        winner: 'Ida',
      }, // standing row missing isWinner
      { type: 'hack', payload: 'evil' },
    ];
    for (const msg of malformed) conn.emit('data', msg);
    expect(seen).toEqual([]);
  });

  it('accepts the speed-bonus flag on results only as a boolean', () => {
    const results = {
      type: 'results',
      roundIndex: 0,
      roundCount: 3,
      letter: 'A',
      categories: [],
      standings: [],
      isUniqueScoring: true,
    };
    expect(isHostMessage({ ...results, hasSpeedScoring: true })).toBe(true);
    expect(isHostMessage(results)).toBe(true); // an older host leaves it out
    expect(isHostMessage({ ...results, hasSpeedScoring: 'yes' })).toBe(false);
  });

  it('BUG-001: isHostMessage rejects a payload that only has a valid type field', () => {
    expect(isHostMessage({ type: 'round' })).toBe(false);
    expect(isHostMessage({ type: 'scores' })).toBe(false);
    expect(isHostMessage({ type: 'welcome' })).toBe(false);
  });

  it('reports the host going away through onClose once, even when close and error both fire', async () => {
    const { session, conn } = await joined();
    const onClose = vi.fn();
    session.onClose(onClose);
    conn.emit('close');
    conn.emit('error');
    // One outage, one reconnect: a second call would start a second loop.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close() tears down both the connection and the peer', async () => {
    const { session, peer, conn } = await joined();
    session.close();
    expect(conn.closed).toBe(true);
    expect(peer.destroyed).toBe(true);
  });

  it('BUG-002: a peer error after join fires onClose exactly once, even with a cascade', async () => {
    const { session, peer } = await joined();
    const onClose = vi.fn();
    session.onClose(onClose);
    // A dropped broker connection can raise error, then disconnected, then
    // close for the same underlying failure — the guest room must treat that
    // as a single "the host is gone" event, not three.
    peer.emit('error', { type: 'network' });
    peer.emit('disconnected');
    peer.emit('close');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('BUG-002: a peer "disconnected" alone (no error) still closes the guest room', async () => {
    const { session, peer } = await joined();
    const onClose = vi.fn();
    session.onClose(onClose);
    peer.emit('disconnected');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('BUG-002: intentionally closing the session does not also fire onClose from the peer', async () => {
    const { session, peer } = await joined();
    const onClose = vi.fn();
    session.onClose(onClose);
    session.onClose(null); // screens unsubscribe before an intentional close, exactly like Join.svelte
    session.close();
    peer.emit('close');
    expect(onClose).not.toHaveBeenCalled();
  });
});
