import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hasCamera, roomCodeFromScan, startQrScan } from './qrscan';

// jsQR is a real boundary (a large chunk fetched on demand): the tests hand it
// frames and script its answers instead of decoding pixels.
const { jsqrMock } = vi.hoisted(() => ({ jsqrMock: vi.fn() }));
vi.mock('jsqr', () => ({ default: jsqrMock }));

describe('roomCodeFromScan', () => {
  it('extracts the code from the host join URL', () => {
    expect(roomCodeFromScan('https://kategoria.pages.dev/?join=ABCD')).toBe('ABCD');
  });

  it('handles a path before the query and extra params', () => {
    expect(roomCodeFromScan('http://localhost:5173/app/?lang=he&join=wxyz')).toBe('wxyz');
  });

  it('falls back to the raw payload when it is not a URL', () => {
    expect(roomCodeFromScan('  ABCD ')).toBe('ABCD');
  });

  it('keeps a URL without a join param as-is and returns empty for an empty payload', () => {
    expect(roomCodeFromScan('https://example.com/')).toBe('https://example.com/');
    expect(roomCodeFromScan('')).toBe('');
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  jsqrMock.mockReset();
});

interface FakeContext {
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
}

function fakeContext(): FakeContext {
  return {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  };
}

/** Camera and document stand-ins; the canvas the scanner creates is handed back for inspection. */
function stubCamera(ctx: FakeContext | null = null): {
  stop: ReturnType<typeof vi.fn>;
  canvas: { width: number; height: number };
} {
  const stop = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
  });
  vi.stubGlobal('document', { createElement: () => canvas });
  return { stop, canvas };
}

interface FakeVideo {
  play: () => Promise<void>;
  srcObject: unknown;
  readyState: number;
  videoWidth: number;
  videoHeight: number;
}

/** A 320x240 video element; `ready` means a frame is available to decode. */
function fakeVideo(play: () => Promise<void> = () => Promise.resolve(), ready = false): FakeVideo {
  return { play, srcObject: null, readyState: ready ? 4 : 0, videoWidth: 320, videoHeight: 240 };
}

const asVideo = (video: FakeVideo): HTMLVideoElement => video as unknown as HTMLVideoElement;

/** Frames are answered in order; an Error entry makes that frame's detect() reject. */
function stubDetector(frames: (string | null | Error)[]): {
  ctorOptions: unknown[];
  detect: ReturnType<typeof vi.fn>;
} {
  const ctorOptions: unknown[] = [];
  const detect = vi.fn(() => {
    const next = frames.shift() ?? null;
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next === null ? [] : [{ rawValue: next }]);
  });
  class FakeBarcodeDetector {
    detect = detect;
    constructor(options: unknown) {
      ctorOptions.push(options);
    }
  }
  vi.stubGlobal('BarcodeDetector', FakeBarcodeDetector);
  return { ctorOptions, detect };
}

describe('startQrScan camera lifecycle', () => {
  it('releases the camera when playback is refused (autoplay policy)', async () => {
    const { stop } = stubCamera();
    const video = fakeVideo(() => Promise.reject(new Error('NotAllowedError')));
    await expect(startQrScan(asVideo(video), () => undefined)).rejects.toThrow('NotAllowedError');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it('keeps the camera open after a successful start until stop() is called', async () => {
    const { stop } = stubCamera();
    const video = fakeVideo();
    const stopScan = await startQrScan(asVideo(video), () => undefined);
    expect(stop).not.toHaveBeenCalled();
    expect(video.srcObject).not.toBeNull();
    stopScan();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });
});

describe('startQrScan decoding (polls every 200 ms once the camera is live)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('HTMLMediaElement', { HAVE_ENOUGH_DATA: 4 });
  });

  it('hands the first payload the native detector finds to ondetect, then releases the camera', async () => {
    const detector = stubDetector([null, 'https://kategoria.pages.dev/?join=ABCD']);
    const { stop } = stubCamera();
    const ondetect = vi.fn();
    await startQrScan(asVideo(fakeVideo(undefined, true)), ondetect);
    expect(detector.ctorOptions).toEqual([{ formats: ['qr_code'] }]);

    await vi.advanceTimersByTimeAsync(200);
    expect(ondetect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(ondetect).toHaveBeenCalledWith('https://kategoria.pages.dev/?join=ABCD');
    expect(stop).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(ondetect).toHaveBeenCalledTimes(1);
    expect(detector.detect).toHaveBeenCalledTimes(2);
  });

  it('waits for the video to have data, and a frame the detector chokes on is logged, not fatal', async () => {
    const detector = stubDetector([new Error('frame lost'), 'ABCD']);
    stubCamera();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const video = fakeVideo();
    const ondetect = vi.fn();
    await startQrScan(asVideo(video), ondetect);

    await vi.advanceTimersByTimeAsync(600);
    expect(detector.detect).not.toHaveBeenCalled();

    video.readyState = 4;
    await vi.advanceTimersByTimeAsync(200);
    expect(error).toHaveBeenCalledWith('QR decode failed', expect.any(Error));
    expect(ondetect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(ondetect).toHaveBeenCalledWith('ABCD');
  });

  it('decodes frames through a canvas with jsQR where there is no native detector', async () => {
    const ctx = fakeContext();
    const { canvas, stop } = stubCamera(ctx);
    jsqrMock.mockReturnValueOnce(null).mockReturnValueOnce({ data: 'WXYZ' });
    const video = fakeVideo(undefined, true);
    const ondetect = vi.fn();
    await startQrScan(asVideo(video), ondetect);

    await vi.advanceTimersByTimeAsync(200);
    expect(ondetect).not.toHaveBeenCalled();
    expect(canvas).toMatchObject({ width: 320, height: 240 });
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 320, 240);
    expect(jsqrMock).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 320, 240, {
      inversionAttempts: 'dontInvert',
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(ondetect).toHaveBeenCalledWith('WXYZ');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('falls back to jsQR when the native detector cannot be constructed', async () => {
    vi.stubGlobal('BarcodeDetector', function ThrowingDetector(): never {
      throw new Error('unsupported format');
    });
    stubCamera(fakeContext());
    jsqrMock.mockReturnValueOnce({ data: 'QRST' });
    const ondetect = vi.fn();
    await startQrScan(asVideo(fakeVideo(undefined, true)), ondetect);
    await vi.advanceTimersByTimeAsync(200);
    expect(ondetect).toHaveBeenCalledWith('QRST');
  });

  it('does not draw or decode a frame while the video has no dimensions yet', async () => {
    const ctx = fakeContext();
    stubCamera(ctx);
    jsqrMock.mockReturnValue({ data: 'LMNO' });
    const video = fakeVideo(undefined, true);
    video.videoWidth = 0;
    const ondetect = vi.fn();
    await startQrScan(asVideo(video), ondetect);
    await vi.advanceTimersByTimeAsync(200); // 0 x 240: nothing to draw
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(jsqrMock).not.toHaveBeenCalled();
    video.videoWidth = 320;
    await vi.advanceTimersByTimeAsync(200);
    expect(ondetect).toHaveBeenCalledWith('LMNO');
  });

  it('skips decoding quietly when the canvas has no 2d context', async () => {
    stubCamera(null);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    jsqrMock.mockReturnValue({ data: 'never' });
    const ondetect = vi.fn();
    await startQrScan(asVideo(fakeVideo(undefined, true)), ondetect);
    await vi.advanceTimersByTimeAsync(600);
    expect(jsqrMock).not.toHaveBeenCalled();
    expect(ondetect).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('hasCamera', () => {
  it('is true only where getUserMedia exists (a secure context with media devices)', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.resolve() } });
    expect(hasCamera()).toBe(true);
    vi.stubGlobal('navigator', { mediaDevices: {} });
    expect(hasCamera()).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(hasCamera()).toBe(false);
  });
});
