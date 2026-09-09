import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRoom, type GuestInfo, type HostRoom, reopenRoom, STALE_AFTER_MS } from './p2p';
import { FakeConn, FakePeer, flush, sentTypes, stubNoTurnEndpoint } from './p2p.test-helpers';

vi.mock('peerjs', async () => {
  const { FakePeer: Peer } = await import('./p2p.test-helpers');
  return { default: Peer };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-04T18:00:00Z'));
  FakePeer.reset();
  stubNoTurnEndpoint();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openRoom(): Promise<{ room: HostRoom; peer: FakePeer }> {
  const pending = createRoom();
  await flush();
  const peer = FakePeer.last();
  peer.emit('open');
  return { room: await pending, peer };
}

function connectAndHello(
  peer: FakePeer,
  name: string,
  extra: Record<string, unknown> = {},
): { conn: FakeConn; playerId: string } {
  const conn = new FakeConn();
  peer.emit('connection', conn);
  conn.emit('data', { type: 'hello', name, ...extra });
  const welcome = conn.sent.find((m) => (m as { type: string }).type === 'welcome') as
    { playerId: string } | undefined;
  return { conn, playerId: welcome?.playerId ?? '' };
}

const roundMsg = {
  type: 'round' as const,
  roundIndex: 0,
  roundCount: 3,
  letter: 'B',
  seconds: 60,
  categories: [{ id: 'animal', label: 'Animal', emoji: '🐾' }],
};

describe('host room after lock', () => {
  it('turns a stranger away with "busy" and closes the connection after the flush delay', async () => {
    const { room, peer } = await openRoom();
    connectAndHello(peer, 'Ida');
    room.lock();

    const stranger = connectAndHello(peer, 'Mallory');
    expect(stranger.conn.sent).toEqual([{ type: 'busy' }]);
    expect(room.guests().map((g) => g.name)).toEqual(['Ida']);
    vi.advanceTimersByTime(499);
    expect(stranger.conn.closed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(stranger.conn.closed).toBe(true);
  });

  it('keeps the seat of a guest who drops mid-game and stays quiet about it', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    const ido = connectAndHello(peer, 'Ido');
    room.lock();
    const before = ido.conn.sent.length;

    ida.conn.emit('close');

    expect(room.guests().map((g) => g.name)).toEqual(['Ida', 'Ido']);
    expect(ido.conn.sent).toHaveLength(before);
    room.broadcast({ type: 'received' });
    expect(sentTypes(ida.conn)).not.toContain('received');
    expect(sentTypes(ido.conn)).toContain('received');
  });

  it('lets a dropped player back in by name, with the same id and the round replayed', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    room.lock();
    room.broadcast(roundMsg);
    ida.conn.emit('close');
    vi.advanceTimersByTime(10_000);

    const back = connectAndHello(peer, 'ida', { deviceId: 'dev-new' });

    expect(back.playerId).toBe(ida.playerId);
    expect(back.conn.sent).toEqual([
      { type: 'welcome', playerId: ida.playerId },
      { type: 'roster', names: ['Ida'] },
      { ...roundMsg, seconds: 50 },
    ]);
    expect(room.guests()[0]?.deviceId).toBe('dev-new');
    room.broadcast({ type: 'received' });
    expect(sentTypes(back.conn)).toContain('received');
  });

  it('replays an untimed round unchanged and the timer floor is zero', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    room.lock();
    room.broadcast({ ...roundMsg, seconds: null });
    ida.conn.emit('close');
    const back = connectAndHello(peer, 'Ida');
    expect(back.conn.sent[2]).toEqual({ ...roundMsg, seconds: null });

    back.conn.emit('close');
    room.broadcast(roundMsg);
    vi.advanceTimersByTime(90_000);
    const again = connectAndHello(peer, 'Ida');
    expect(again.conn.sent[2]).toEqual({ ...roundMsg, seconds: 0 });
  });

  it('prefers the final scores over the last round when both were sent', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    room.lock();
    room.broadcast(roundMsg);
    const scores = { type: 'scores' as const, rows: [{ name: 'Ida', score: 10 }], winner: 'Ida' };
    room.broadcast(scores);
    ida.conn.emit('close');
    const back = connectAndHello(peer, 'Ida');
    expect(back.conn.sent[2]).toEqual(scores);
    expect(back.conn.sent).toHaveLength(3);
  });

  it('replays a device vote in progress to a player who comes back', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    room.lock();
    room.broadcast(roundMsg);
    const vote = {
      type: 'vote' as const,
      voteId: 'v-1',
      word: 'blorp',
      category: { id: 'animal', label: 'Animal', emoji: '🐾' },
    };
    room.broadcast(vote);
    ida.conn.emit('close');
    const back = connectAndHello(peer, 'Ida');
    expect(back.conn.sent[2]).toEqual(vote);
    expect(back.conn.sent).toHaveLength(3);
  });

  it('replays the last round results until the next round starts', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    room.lock();
    room.broadcast(roundMsg);
    const results = {
      type: 'results' as const,
      roundIndex: 0,
      roundCount: 3,
      letter: 'B',
      categories: [
        {
          id: 'animal',
          label: 'Animal',
          emoji: '🐾',
          answers: [
            {
              playerId: ida.playerId,
              name: 'Ida',
              word: 'bear',
              status: 'valid' as const,
              points: 10,
            },
          ],
        },
      ],
      standings: [{ name: 'Ida', score: 10 }],
    };
    room.broadcast(results);
    ida.conn.emit('close');
    const back = connectAndHello(peer, 'Ida');
    expect(back.conn.sent[2]).toEqual(results);

    back.conn.emit('close');
    room.broadcast({ ...roundMsg, roundIndex: 1 });
    const again = connectAndHello(peer, 'Ida');
    expect(again.conn.sent[2]).toEqual({ ...roundMsg, roundIndex: 1 });
  });

  it('lists only the players whose device is connected right now', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    const ido = connectAndHello(peer, 'Ido');
    room.lock();
    expect(room.connectedIds()).toEqual([ida.playerId, ido.playerId]);
    ida.conn.emit('close');
    expect(room.connectedIds()).toEqual([ido.playerId]);
    connectAndHello(peer, 'Ida');
    expect(room.connectedIds()).toEqual([ida.playerId, ido.playerId]);
  });

  it('drops a silent seat from the connected list until its next ping, and never forwards pings', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    const ido = connectAndHello(peer, 'Ido');
    room.lock();
    const forwarded: unknown[] = [];
    room.onGuestMessage((_, msg) => {
      forwarded.push(msg);
    });

    vi.advanceTimersByTime(STALE_AFTER_MS);
    expect(room.connectedIds()).toEqual([ida.playerId, ido.playerId]);
    vi.advanceTimersByTime(1);
    expect(room.connectedIds()).toEqual([]); // a dead tab rarely closes the connection

    ido.conn.emit('data', { type: 'ping' });
    expect(room.connectedIds()).toEqual([ido.playerId]);
    ida.conn.emit('data', { type: 'vote', voteId: 'v-1', choice: 'yes' }); // any message counts
    expect(room.connectedIds()).toEqual([ida.playerId, ido.playerId]);
    expect(forwarded).toEqual([{ type: 'vote', voteId: 'v-1', choice: 'yes' }]);
  });

  it('refuses a name-only hello for a seat whose player is still connected', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    room.lock();
    const impostor = connectAndHello(peer, 'Ida');
    expect(impostor.conn.sent).toEqual([{ type: 'busy' }]);
    room.broadcast({ type: 'received' });
    expect(sentTypes(ida.conn)).toContain('received');
    expect(sentTypes(impostor.conn)).not.toContain('received');
  });

  it('hands a live seat to the same device and closes the stale connection', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida', { deviceId: 'dev-1' });
    room.lock();
    const back = connectAndHello(peer, 'Whatever', { deviceId: 'dev-1' });

    expect(back.playerId).toBe(ida.playerId);
    expect(ida.conn.closed).toBe(true);
    expect(room.guests()).toEqual([{ playerId: ida.playerId, name: 'Ida', deviceId: 'dev-1' }]);
    ida.conn.emit('close');
    room.broadcast({ type: 'received' });
    expect(sentTypes(back.conn)).toContain('received');
    expect(room.guests()).toHaveLength(1);
  });

  it('in the lobby a returning device keeps its seat but takes the new name and avatar', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida', { deviceId: 'dev-1', avatar: '🦋' });
    connectAndHello(peer, 'Ido');
    const back = connectAndHello(peer, 'Ido', { deviceId: 'dev-1', avatar: '🐙' });

    expect(back.playerId).toBe(ida.playerId);
    expect(room.guests()).toEqual([
      { playerId: ida.playerId, name: 'Ido 2', avatar: '🐙', deviceId: 'dev-1' },
      expect.objectContaining({ name: 'Ido' }),
    ]);
    expect(back.conn.sent).toEqual([
      { type: 'welcome', playerId: ida.playerId },
      { type: 'roster', names: ['Ido 2', 'Ido'] },
    ]);
  });

  it('close() tells every guest the game ended, then destroys the peer after the flush delay', async () => {
    const { room, peer } = await openRoom();
    const ida = connectAndHello(peer, 'Ida');
    room.lock();
    room.close();
    expect(ida.conn.sent.at(-1)).toEqual({ type: 'ended' });
    expect(room.guests()).toEqual([]);
    expect(peer.destroyed).toBe(false);
    vi.advanceTimersByTime(500);
    expect(peer.destroyed).toBe(true);
  });
});

describe('reopenRoom', () => {
  const players: GuestInfo[] = [
    { playerId: 'guest-1-1', name: 'Ida', avatar: '🦋', deviceId: 'dev-1' },
    { playerId: 'guest-2-1', name: 'Ido' },
  ];

  async function reopen(code = 'ABCD'): Promise<{ room: HostRoom; peer: FakePeer }> {
    const pending = reopenRoom(code, players);
    await flush();
    const peer = FakePeer.last();
    peer.emit('open');
    return { room: await pending, peer };
  }

  it('reopens under the normalized code with a locked, empty seat per known player', async () => {
    const { room, peer } = await reopen(' ab cd ');
    expect(room.code).toBe('ABCD');
    expect(peer.id).toBe('kidcategories-v1-ABCD');
    expect(room.guests()).toEqual(players);

    const stranger = connectAndHello(peer, 'Mallory');
    expect(stranger.conn.sent).toEqual([{ type: 'busy' }]);
  });

  it('lets known players back into their original seats by name or device', async () => {
    const { room, peer } = await reopen();
    const ido = connectAndHello(peer, 'ido');
    const ida = connectAndHello(peer, 'New name', { deviceId: 'dev-1' });
    expect(ido.playerId).toBe('guest-2-1');
    expect(ida.playerId).toBe('guest-1-1');
    expect(room.guests().map((g) => g.name)).toEqual(['Ida', 'Ido']);
  });

  it('retries after two seconds while the broker still holds the old peer', async () => {
    const pending = reopenRoom('ABCD', players);
    await flush();
    FakePeer.last().emit('error', { type: 'unavailable-id' });
    await flush();
    expect(FakePeer.instances).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    await flush();
    expect(FakePeer.instances).toHaveLength(2);
    FakePeer.last().emit('open');
    await expect(pending).resolves.toMatchObject({ code: 'ABCD' });
  });

  it('rejects with a network error on other broker errors', async () => {
    const pending = reopenRoom('ABCD', players);
    await flush();
    FakePeer.last().emit('error', { type: 'network' });
    await expect(pending).rejects.toThrow('network');
    expect(FakePeer.last().destroyed).toBe(true);
  });
});
