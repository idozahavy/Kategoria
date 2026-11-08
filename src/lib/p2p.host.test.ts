import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRoom,
  getActiveRoom,
  type HostRoom,
  onActiveRoomStatus,
  type RoomStatus,
  setActiveRoom,
} from './p2p';
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

/** A host peer's options without TURN: only the room's broker token. */
const STUN_ONLY = { token: expect.any(String) as unknown };

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
    expect(peer.options).toEqual(STUN_ONLY);
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
    expect(first.peer.options).toEqual(STUN_ONLY);
    expect(second.peer.options).toEqual(STUN_ONLY);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a malformed body or a thrown fetch as no TURN', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ iceServers: [{ urls: 42 }] })));
    expect((await openRoom()).peer.options).toEqual(STUN_ONLY);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect((await openRoom()).peer.options).toEqual(STUN_ONLY);
  });

  it('treats a body that is not an object (array, null, string) as no TURN', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json([{ urls: 'stun:x' }])));
    expect((await openRoom()).peer.options).toEqual(STUN_ONLY);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(null)));
    expect((await openRoom()).peer.options).toEqual(STUN_ONLY);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json('stun:x')));
    expect((await openRoom()).peer.options).toEqual(STUN_ONLY);
  });
});

describe('host room lobby: returning device', () => {
  it('keeps the avatar a device chose earlier when its new hello carries none', async () => {
    const { room, peer } = await openRoom();
    const ida = seatGuest(peer, 'Ida', { deviceId: 'dev-1', avatar: '🦋' });
    const back = seatGuest(peer, 'Ida', { deviceId: 'dev-1' });
    expect(back.playerId).toBe(ida.playerId);
    expect(room.guests()).toEqual([
      { playerId: ida.playerId, name: 'Ida', avatar: '🦋', deviceId: 'dev-1' },
    ]);

    const changed = seatGuest(peer, 'Ida', { deviceId: 'dev-1', avatar: '🐸' });
    expect(changed.playerId).toBe(ida.playerId);
    expect(room.guests().map((g) => g.avatar)).toEqual(['🐸']);
  });

  it('ignores a connection that leaves without ever saying hello', async () => {
    const { room, peer } = await openRoom();
    const onGuests = vi.fn();
    room.onGuestsChange(onGuests);
    seatGuest(peer, 'Ida');
    expect(onGuests).toHaveBeenCalledTimes(1);

    const stranger = new FakeConn();
    peer.emit('connection', stranger);
    stranger.emit('close');
    expect(onGuests).toHaveBeenCalledTimes(1);
    expect(room.guests().map((g) => g.name)).toEqual(['Ida']);
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
      status: () => 'online',
      onStatusChange: () => undefined,
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

  it("reports the hosted room's status, ignores a replaced room, and null once none is hosted", async () => {
    const seen: (RoomStatus | null)[] = [];
    onActiveRoomStatus((s) => seen.push(s));
    const first = await openRoom();
    const second = await openRoom();
    setActiveRoom(first.room);
    first.peer.dropBroker();
    setActiveRoom(second.room);
    first.peer.emit('open'); // the replaced room is closed; its news no longer matters
    second.peer.dropBroker();
    setActiveRoom(null);
    onActiveRoomStatus(null);
    expect(seen).toEqual([null, 'online', 'offline', 'online', 'offline', null]);
  });
});

describe('staying on the broker', () => {
  it('takes the room back on the same peer after the broker drops it; phones stay connected', async () => {
    const { room, peer } = await openRoom();
    const ida = seatGuest(peer, 'Ida');
    const seen: RoomStatus[] = [];
    room.onStatusChange((s) => seen.push(s));

    peer.dropBroker();
    expect(room.status()).toBe('offline');
    vi.advanceTimersByTime(999);
    expect(peer.reconnects).toBe(0);
    vi.advanceTimersByTime(1);
    expect(peer.reconnects).toBe(1);
    peer.emit('open');

    expect(room.status()).toBe('online');
    expect(seen).toEqual(['offline', 'online']);
    expect(FakePeer.instances).toHaveLength(1);
    expect(ida.conn.closed).toBe(false);
    room.broadcast({ type: 'received' });
    expect(sentTypes(ida.conn)).toContain('received');
  });

  it('waits longer between failed attempts, and tries at once when the network returns', async () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    const { peer } = await openRoom();

    peer.dropBroker();
    vi.advanceTimersByTime(1000);
    expect(peer.reconnects).toBe(1);
    peer.dropBroker(); // that attempt failed too
    vi.advanceTimersByTime(1999);
    expect(peer.reconnects).toBe(1);
    vi.advanceTimersByTime(1);
    expect(peer.reconnects).toBe(2);
    peer.dropBroker();
    win.dispatchEvent(new Event('online'));
    expect(peer.reconnects).toBe(3);
  });

  it('tries at once when the page becomes visible again (a phone screen waking up)', async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', doc);
    const { peer } = await openRoom();
    peer.dropBroker();
    vi.advanceTimersByTime(1000);
    peer.dropBroker();
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(peer.reconnects).toBe(2);
  });

  it('cuts a reconnect that hangs after 12 s and tries again', async () => {
    const { room, peer } = await openRoom();
    peer.dropBroker();
    vi.advanceTimersByTime(1000);
    expect(peer.reconnects).toBe(1);
    vi.advanceTimersByTime(12_000);
    expect(room.status()).toBe('offline');
    vi.advanceTimersByTime(2000);
    expect(peer.reconnects).toBe(2);
  });

  it('a closed room stops trying', async () => {
    const { room, peer } = await openRoom();
    peer.dropBroker();
    room.close();
    vi.advanceTimersByTime(60_000);
    expect(peer.reconnects).toBe(0);
  });

  it('sends each connected phone a heartbeat every 4 s', async () => {
    const { room, peer } = await openRoom();
    const ida = seatGuest(peer, 'Ida');
    const bo = seatGuest(peer, 'Bo');
    bo.conn.emit('close'); // left the lobby
    vi.advanceTimersByTime(8000);
    expect(sentTypes(ida.conn).filter((t) => t === 'ping')).toHaveLength(2);
    expect(sentTypes(bo.conn)).not.toContain('ping');
    room.close();
    vi.advanceTimersByTime(8000);
    expect(sentTypes(ida.conn).filter((t) => t === 'ping')).toHaveLength(2);
  });
});
