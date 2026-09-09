import { vi } from 'vitest';

/**
 * In-memory stand-ins for PeerJS used by the p2p tests: `vi.mock('peerjs')`
 * swaps the real broker/WebRTC layer for these so rooms and joins can be
 * driven by emitting the events the real objects would.
 */

type Handler = (...args: unknown[]) => void;

class Emitter {
  private readonly handlers = new Map<string, Handler[]>();

  on(event: string, cb: Handler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args);
  }
}

export class FakeConn extends Emitter {
  readonly sent: unknown[] = [];
  closed = false;

  send(msg: unknown): void {
    this.sent.push(msg);
  }

  close(): void {
    this.closed = true;
  }
}

export class FakePeer extends Emitter {
  static instances: FakePeer[] = [];

  /** Host peers pass their id; guest peers pass only options. */
  readonly id: string | null;
  readonly options: unknown;
  destroyed = false;
  readonly connections: { id: string; options: unknown; conn: FakeConn }[] = [];

  constructor(idOrOptions?: unknown, options?: unknown) {
    super();
    if (typeof idOrOptions === 'string') {
      this.id = idOrOptions;
      this.options = options;
    } else {
      this.id = null;
      this.options = idOrOptions;
    }
    FakePeer.instances.push(this);
  }

  destroy(): void {
    this.destroyed = true;
  }

  connect(id: string, options: unknown): FakeConn {
    const conn = new FakeConn();
    this.connections.push({ id, options, conn });
    return conn;
  }

  static reset(): void {
    FakePeer.instances = [];
  }

  static last(): FakePeer {
    const peer = FakePeer.instances[FakePeer.instances.length - 1];
    if (!peer) throw new Error('no Peer was constructed');
    return peer;
  }
}

/** Captured before any test installs fake timers — flush() must yield to the real event loop. */
const realSetTimeout = globalThis.setTimeout;

/**
 * Let the awaited TURN lookup, the lazy `import('peerjs')` and promise chains
 * settle before the Peer exists. The dynamic import resolves through the
 * module loader (real I/O, not a microtask), hence one real macrotask first.
 */
export async function flush(rounds = 10): Promise<void> {
  await new Promise<void>((resolve) => {
    realSetTimeout(resolve, 0);
  });
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

/** `fetch` that fails like a missing /turn-credentials endpoint would (STUN-only). */
export function stubNoTurnEndpoint(): void {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
}

export function stubStorage(seed: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  return store;
}

/** The messages a fake connection received, typed loosely for assertions. */
export function sentTypes(conn: FakeConn): string[] {
  return conn.sent.map((m) => (m as { type: string }).type);
}
