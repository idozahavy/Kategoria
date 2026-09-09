import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRoom, getActiveRoom, type HostRoom, setActiveRoom } from './p2p';
import { FakeConn, FakePeer, flush, sentTypes, stubNoTurnEndpoint } from './p2p.test-helpers';

vi.mock('peerjs', async () => {
  const { FakePeer: Peer } = await import('./p2p.test-helpers');
  return { default: Peer };
});

beforeEach(() => {
  vi.useFakeTimers();
  FakePeer.reset();
  stubNoTurnEndpoint();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setActiveRoom(null);
});

/** Open a room on the fake broker and hand back the room plus its peer. */
async function openRoom(): Promise<{ room: HostRoom; peer: FakePeer }> {
  const pending = createRoom();
  await flush();
  const peer = FakePeer.last();
  peer.emit('open');
  return { room: await pending, peer };
}

/** A guest connection that already said hello; returns its conn and welcome id. */
function seatGuest(
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

describe('createRoom', () => {
  it('resolves a room whose code is the typed part of the peer id', async () => {
    const { room, peer } = await openRoom();
    expect(room.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    expect(peer.id).toBe(`kidcategories-v1-${room.code}`);
    expect(peer.options).toEqual({});
  });

  it('retries with a fresh peer when the broker reports the id as taken', async () => {
    const pending = createRoom();
    await flush();
    const first = FakePeer.last();
    first.emit('error', { type: 'unavailable-id' });
    await flush();
    expect(first.destroyed).toBe(true);
    expect(FakePeer.instances).toHaveLength(2);
    const second = FakePeer.last();
    second.emit('open');
    const room = await pending;
    expect(second.id).toBe(`kidcategories-v1-${room.code}`);
  });

  it('gives up with a network error after three taken ids', async () => {
    const pending = createRoom();
    for (let i = 0; i < 3; i++) {
      await flush();
      FakePeer.last().emit('error', { type: 'unavailable-id' });
    }
    await expect(pending).rejects.toThrow('network');
    expect(FakePeer.instances).toHaveLength(3);
  });

  it('rejects with a network error on any other broker error', async () => {
    const pending = createRoom();
    await flush();
    const peer = FakePeer.last();
    peer.emit('error', { type: 'server-error' });
    await expect(pending).rejects.toThrow('network');
    expect(peer.destroyed).toBe(true);
  });

  it('rejects with a network error when the broker never answers within 12 s', async () => {
    const pending = createRoom();
    await flush();
    const peer = FakePeer.last();
    vi.advanceTimersByTime(11_999);
    expect(peer.destroyed).toBe(false);
    vi.advanceTimersByTime(1);
    await expect(pending).rejects.toThrow('network');
    expect(peer.destroyed).toBe(true);
  });
});

describe('host room lobby', () => {
  it('seats a guest on hello: welcome with an id, then the roster', async () => {
    const { room, peer } = await openRoom();
    const rosterChanges: string[][] = [];
    room.onGuestsChange((guests) => rosterChanges.push(guests.map((g) => g.name)));

    const { conn, playerId } = seatGuest(peer, 'Ida', { avatar: '🦋', deviceId: 'dev-1' });

    expect(playerId).toMatch(/^guest-1-\d+$/);
    expect(conn.sent).toEqual([
      { type: 'welcome', playerId },
      { type: 'roster', names: ['Ida'] },
    ]);
    expect(room.guests()).toEqual([{ playerId, name: 'Ida', avatar: '🦋', deviceId: 'dev-1' }]);
    expect(rosterChanges).toEqual([['Ida']]);
  });

  it('numbers a second guest who picks a name already taken, ignoring case', async () => {
    const { room, peer } = await openRoom();
    seatGuest(peer, 'Ida');
    const second = seatGuest(peer, 'ida');
    const third = seatGuest(peer, 'IDA');
    expect(room.guests().map((g) => g.name)).toEqual(['Ida', 'ida 2', 'IDA 3']);
    expect(second.conn.sent[1]).toEqual({ type: 'roster', names: ['Ida', 'ida 2'] });
    expect(third.playerId).not.toBe(second.playerId);
  });

  it('falls back to "Player" for a blank name and trims long ones to 20 chars', async () => {
    const { room, peer } = await openRoom();
    seatGuest(peer, '   ');
    seatGuest(peer, 'x'.repeat(30));
    expect(room.guests().map((g) => g.name)).toEqual(['Player', 'x'.repeat(20)]);
  });

  it('keeps emoji and image avatars, drops anything else', async () => {
    const { room, peer } = await openRoom();
    seatGuest(peer, 'A', { avatar: '🦋' });
    seatGuest(peer, 'B', { avatar: 'data:image/webp;base64,AAAA' });
    seatGuest(peer, 'C', { avatar: 'data:text/html,<script>' });
    seatGuest(peer, 'D', { avatar: 'not-an-emoji' });
    expect(room.guests().map((g) => g.avatar)).toEqual([
      '🦋',
      'data:image/webp;base64,AAAA',
      undefined,
      undefined,
    ]);
  });

  it('ignores malformed data and a second hello on the same connection', async () => {
    const { room, peer } = await openRoom();
    const conn = new FakeConn();
    peer.emit('connection', conn);
    conn.emit('data', { type: 'hack', name: 'x' });
    conn.emit('data', 'hello');
    expect(conn.sent).toEqual([]);
    expect(room.guests()).toEqual([]);

    conn.emit('data', { type: 'hello', name: 'Ida' });
    conn.emit('data', { type: 'hello', name: 'Ido' });
    expect(room.guests().map((g) => g.name)).toEqual(['Ida']);
    expect(sentTypes(conn)).toEqual(['welcome', 'roster']);
  });

  it('delivers answers only from a seated guest, tagged with its player id', async () => {
    const { room, peer } = await openRoom();
    const received: [string, unknown][] = [];
    room.onGuestMessage((id, msg) => received.push([id, msg]));

    const stranger = new FakeConn();
    peer.emit('connection', stranger);
    stranger.emit('data', { type: 'answers', roundIndex: 0, answers: { animal: 'ant' } });
    expect(received).toEqual([]);

    const { conn, playerId } = seatGuest(peer, 'Ida');
    const answers = { type: 'answers', roundIndex: 0, answers: { animal: 'ant' } };
    conn.emit('data', answers);
    expect(received).toEqual([[playerId, answers]]);
  });

  it('a guest who leaves the lobby is dropped and the others get the new roster', async () => {
    const { room, peer } = await openRoom();
    const ida = seatGuest(peer, 'Ida');
    const ido = seatGuest(peer, 'Ido');
    ida.conn.emit('close');
    expect(room.guests().map((g) => g.name)).toEqual(['Ido']);
    expect(ido.conn.sent.at(-1)).toEqual({ type: 'roster', names: ['Ido'] });
  });

  it('broadcast reaches every seated guest; sendTo reaches exactly one', async () => {
    const { room, peer } = await openRoom();
    const ida = seatGuest(peer, 'Ida');
    const ido = seatGuest(peer, 'Ido');
    room.broadcast({ type: 'ended' });
    room.sendTo(ido.playerId, { type: 'received' });
    room.sendTo('nobody', { type: 'received' });
    expect(sentTypes(ida.conn)).toEqual(['welcome', 'roster', 'roster', 'ended']);
    expect(sentTypes(ido.conn)).toEqual(['welcome', 'roster', 'ended', 'received']);
  });

  it('onGuestMessage: unsubscribing clears only a handler that is still current', async () => {
    const { room, peer } = await openRoom();
    const { conn } = seatGuest(peer, 'Ida');
    const first: unknown[] = [];
    const second: unknown[] = [];
    const stopFirst = room.onGuestMessage((_, msg) => {
      first.push(msg);
    });
    const stopSecond = room.onGuestMessage((_, msg) => {
      second.push(msg);
    });
    stopFirst(); // a screen tearing down late must not drop the next screen's handler
    const ballot = { type: 'vote', voteId: 'v-1', choice: 'yes' };
    conn.emit('data', ballot);
    expect(first).toEqual([]);
    expect(second).toEqual([ballot]);
    stopSecond();
    conn.emit('data', ballot);
    expect(second).toHaveLength(1);
  });
});

describe('TURN lookup failures (never remembered)', () => {
  it('goes STUN-only on a failed endpoint and asks again for the next room', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('nope', { status: 503 })));
    vi.stubGlobal('fetch', fetchMock);
    const first = await openRoom();
    const second = await openRoom();
    expect(first.peer.options).toEqual({});
    expect(second.peer.options).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a malformed body or a thrown fetch as no TURN', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ iceServers: [{ urls: 42 }] })));
    expect((await openRoom()).peer.options).toEqual({});
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect((await openRoom()).peer.options).toEqual({});
  });
});

describe('active room singleton', () => {
  function fakeRoom(): { room: HostRoom; closed: () => number } {
    let closed = 0;
    const room: HostRoom = {
      code: 'ABCD',
      guests: () => [],
      broadcast: () => undefined,
      sendTo: () => undefined,
      onGuestsChange: () => undefined,
      onGuestMessage: () => () => undefined,
      connectedIds: () => [],
      lock: () => undefined,
      close: () => {
        closed += 1;
      },
    };
    return { room, closed: () => closed };
  }

  it('closes the previous room when a different one takes over', () => {
    const a = fakeRoom();
    const b = fakeRoom();
    setActiveRoom(a.room);
    setActiveRoom(b.room);
    expect(a.closed()).toBe(1);
    expect(b.closed()).toBe(0);
    expect(getActiveRoom()).toBe(b.room);
  });

  it('leaves the room alone when set to itself again', () => {
    const a = fakeRoom();
    setActiveRoom(a.room);
    setActiveRoom(a.room);
    expect(a.closed()).toBe(0);
    expect(getActiveRoom()).toBe(a.room);
  });

  it('clearing closes the room and leaves none active', () => {
    const a = fakeRoom();
    setActiveRoom(a.room);
    setActiveRoom(null);
    expect(a.closed()).toBe(1);
    expect(getActiveRoom()).toBeNull();
  });
});
