/**
 * Camera QR scanning for the join screen. Prefers the native BarcodeDetector
 * (fast, hardware-backed on Android Chrome) and falls back to jsQR decoding
 * video frames through a canvas everywhere else (notably iOS Safari).
 * jsQR is loaded on demand — it is the largest module in the app and most
 * players never need it.
 */

type JsQrDecode = (typeof import('jsqr'))['default'];

// The Shape Detection API isn't in TypeScript's DOM lib yet — declare the slice we use.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

const SCAN_INTERVAL_MS = 200;

/** Whether this browser can open a camera at all (secure context + getUserMedia). */
export function hasCamera(): boolean {
  // mediaDevices is absent (not just empty) on insecure origins — the DOM types don't say so.
  const devices = (globalThis as { navigator?: { mediaDevices?: MediaDevices } }).navigator
    ?.mediaDevices;
  return typeof devices?.getUserMedia === 'function';
}

/**
 * Pull a room code out of whatever the QR encoded: the host's join URL
 * (`…?join=ABCD`) or a bare code. Returns '' when there's nothing usable.
 */
export function roomCodeFromScan(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  try {
    const fromUrl = new URL(trimmed).searchParams.get('join');
    if (fromUrl !== null) return fromUrl.trim();
  } catch {
    // not a URL — treat the payload as the code itself
  }
  return trimmed;
}

function nativeDetector(): BarcodeDetectorLike | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

function decodeWithCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  jsQR: JsQrDecode,
): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width === 0 || height === 0) return null;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  return jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

/**
 * Open the rear camera into `video` and call `ondetect` with the first QR
 * payload found. Resolves with a stop function that releases the camera;
 * rejects when the camera can't be opened (denied, missing, insecure context).
 */
export async function startQrScan(
  video: HTMLVideoElement,
  ondetect: (text: string) => void,
): Promise<() => void> {
  const detector = nativeDetector();
  // No native detector: fetch the jsQR chunk while the camera prompt is up.
  const decoderLoad = detector ? null : import('jsqr');
  // The load is awaited (and its failure reported) below; this keeps a chunk
  // failure from surfacing as an unhandled rejection when the camera prompt
  // fails first and that await is never reached.
  void decoderLoad?.catch(() => undefined);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  video.srcObject = stream;
  let decode: JsQrDecode | null = null;
  try {
    await video.play();
    if (decoderLoad) decode = (await decoderLoad).default;
  } catch (e) {
    // Autoplay policy / interruption / chunk failed to load: release the
    // camera before failing, otherwise the recording indicator stays on
    // until a reload.
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
    throw e;
  }

  const canvas = document.createElement('canvas');
  let stopped = false;
  let busy = false;

  const stop = (): void => {
    stopped = true;
    clearInterval(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const tick = async (): Promise<void> => {
    if (stopped || busy || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;
    busy = true;
    try {
      let text: string | null = null;
      if (detector) {
        const [found] = await detector.detect(video);
        text = found?.rawValue ?? null;
      } else if (decode) {
        text = decodeWithCanvas(video, canvas, decode);
      }
      if (text !== null) {
        stop();
        ondetect(text);
      }
    } catch (e) {
      console.error('QR decode failed', e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), SCAN_INTERVAL_MS);
  return stop;
}
