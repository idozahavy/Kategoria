import { describe, expect, it } from 'vitest';

import { isGuestMessage, isIceServerArray, makeRoomCode, normalizeRoomCode } from './p2p';

describe('room codes', () => {
  it('makes 4-letter codes from the kid-safe alphabet', () => {
    for (let i = 0; i < 20; i++) {
      expect(makeRoomCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    }
  });

  it('normalizes typed codes: trim, uppercase, strip inner spaces', () => {
    expect(normalizeRoomCode(' ab cd ')).toBe('ABCD');
    expect(normalizeRoomCode('wxyz')).toBe('WXYZ');
  });
});

describe('isGuestMessage (untrusted P2P input)', () => {
  it('accepts a well-formed hello, with null treated as absent for optionals', () => {
    expect(isGuestMessage({ type: 'hello', name: 'Ida' })).toBe(true);
    expect(isGuestMessage({ type: 'hello', name: 'Ida', avatar: null, deviceId: null })).toBe(true);
    expect(isGuestMessage({ type: 'hello', name: 'Ida', avatar: '🦋', deviceId: 'abc' })).toBe(
      true,
    );
  });

  it('accepts well-formed answers', () => {
    expect(isGuestMessage({ type: 'answers', roundIndex: 0, answers: { animal: 'ant' } })).toBe(
      true,
    );
  });

  it('accepts a well-formed ballot and rejects a bad one', () => {
    expect(isGuestMessage({ type: 'vote', voteId: 'v-1', choice: 'yes' })).toBe(true);
    expect(isGuestMessage({ type: 'vote', voteId: 'v-1', choice: 'no' })).toBe(true);
    expect(isGuestMessage({ type: 'vote', voteId: '', choice: 'yes' })).toBe(false);
    expect(isGuestMessage({ type: 'vote', voteId: 'x'.repeat(65), choice: 'yes' })).toBe(false);
    expect(isGuestMessage({ type: 'vote', voteId: 'v-1', choice: 'maybe' })).toBe(false);
    expect(isGuestMessage({ type: 'vote', choice: 'yes' })).toBe(false);
  });

  it('accepts the bare heartbeat', () => {
    expect(isGuestMessage({ type: 'ping' })).toBe(true);
  });

  it('rejects malformed or hostile payloads', () => {
    expect(isGuestMessage(null)).toBe(false);
    expect(isGuestMessage('hello')).toBe(false);
    expect(isGuestMessage({ type: 'hello' })).toBe(false); // no name
    expect(isGuestMessage({ type: 'hello', name: 42 })).toBe(false);
    expect(isGuestMessage({ type: 'hello', name: 'A', deviceId: 'x'.repeat(65) })).toBe(false);
    expect(isGuestMessage({ type: 'answers', roundIndex: '0', answers: {} })).toBe(false);
    expect(isGuestMessage({ type: 'answers', roundIndex: 0, answers: { a: 1 } })).toBe(false);
    expect(isGuestMessage({ type: 'answers', roundIndex: 0, answers: { a: 'x'.repeat(41) } })).toBe(
      false,
    );
    expect(
      isGuestMessage({
        type: 'answers',
        roundIndex: 0,
        answers: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`c${String(i)}`, 'ok'])),
      }),
    ).toBe(false);
    expect(
      isGuestMessage({ type: 'answers', roundIndex: 0, answers: { ['k'.repeat(65)]: 'ok' } }),
    ).toBe(false);
    expect(isGuestMessage({ type: 'answers', roundIndex: 0, answers: null })).toBe(false);
    expect(isGuestMessage({ type: 'nonsense' })).toBe(false);
  });
});

describe('isIceServerArray (/turn-credentials response)', () => {
  it('accepts the Cloudflare Realtime shape (stun entry + turn entry with creds)', () => {
    expect(
      isIceServerArray([
        { urls: ['stun:stun.cloudflare.com:3478'] },
        {
          urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443'],
          username: 'u',
          credential: 'c',
        },
      ]),
    ).toBe(true);
    expect(isIceServerArray([{ urls: 'stun:stun.cloudflare.com:3478' }])).toBe(true);
  });

  it('rejects shapes that would break the RTCPeerConnection config', () => {
    expect(isIceServerArray(undefined)).toBe(false);
    expect(isIceServerArray({})).toBe(false);
    expect(isIceServerArray([])).toBe(false);
    expect(isIceServerArray([{ username: 'u' }])).toBe(false); // no urls
    expect(isIceServerArray([{ urls: [] }])).toBe(false);
    expect(isIceServerArray([{ urls: [42] }])).toBe(false);
    expect(isIceServerArray([{ urls: 'turn:x', username: 42 }])).toBe(false);
  });
});
