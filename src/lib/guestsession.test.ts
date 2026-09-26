import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  forgetGuestSeat,
  readGuestDraft,
  readGuestSeat,
  rememberGuestSeat,
  saveGuestDraft,
} from './guestsession';

/** A Map-backed sessionStorage: Node has none. */
function stubSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  return store;
}

describe('guest seat', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = stubSessionStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('remembers the room and name, and forgets them with the draft', () => {
    expect(readGuestSeat()).toBeNull();
    rememberGuestSeat({ code: 'ABCD', name: 'Ida', avatar: '🦊' });
    expect(readGuestSeat()).toEqual({ code: 'ABCD', name: 'Ida', avatar: '🦊' });
    saveGuestDraft({ code: 'ABCD', roundIndex: 0, answers: { animal: 'ant' }, sent: null });
    forgetGuestSeat();
    expect(readGuestSeat()).toBeNull();
    expect(readGuestDraft('ABCD', 0)).toBeNull();
  });

  it('ignores a corrupt or incomplete entry', () => {
    store.set('categories-guest', '{not json');
    expect(readGuestSeat()).toBeNull();
    store.set('categories-guest', JSON.stringify({ code: 'ABCD' }));
    expect(readGuestSeat()).toBeNull();
    store.set('categories-guest', JSON.stringify({ code: '', name: 'Ida' }));
    expect(readGuestSeat()).toBeNull();
    store.set('categories-guest', JSON.stringify({ code: 'ABCD', name: 'Ida', avatar: 5 }));
    expect(readGuestSeat()).toEqual({ code: 'ABCD', name: 'Ida', avatar: undefined });
  });

  it('works without storage at all (private mode)', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => {
      rememberGuestSeat({ code: 'ABCD', name: 'Ida' });
      forgetGuestSeat();
    }).not.toThrow();
    expect(readGuestSeat()).toBeNull();
  });
});

describe('guest draft', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = stubSessionStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the words only for the same room's same round", () => {
    const draft = { code: 'ABCD', roundIndex: 1, answers: { animal: 'ant' }, sent: null };
    saveGuestDraft(draft);
    expect(readGuestDraft('ABCD', 1)).toEqual(draft);
    expect(readGuestDraft('ABCD', 2)).toBeNull();
    expect(readGuestDraft('WXYZ', 1)).toBeNull();
  });

  it('keeps what was already sent, so a rejoin can resend it', () => {
    const sent = { animal: 'ant', food: 'apple' };
    saveGuestDraft({ code: 'ABCD', roundIndex: 0, answers: sent, sent });
    expect(readGuestDraft('ABCD', 0)?.sent).toEqual(sent);
  });

  it('drops a draft whose words are not all strings', () => {
    store.set(
      'categories-guest-draft',
      JSON.stringify({ code: 'ABCD', roundIndex: 0, answers: { animal: 3 }, sent: null }),
    );
    expect(readGuestDraft('ABCD', 0)).toBeNull();
    store.set(
      'categories-guest-draft',
      JSON.stringify({ code: 'ABCD', roundIndex: 0, answers: {}, sent: ['ant'] }),
    );
    expect(readGuestDraft('ABCD', 0)).toBeNull();
  });
});
