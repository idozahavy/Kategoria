/**
 * Umami Cloud analytics — anonymous, cookie-free counts of visitors, screens
 * and games played (see README → Analytics). Without a website id (CI builds,
 * deploys that skipped the setup) and in `vite dev` nothing loads and every
 * call is a no-op, so local play never pollutes the numbers. Never throws: an
 * ad blocker or offline start simply drops the counts.
 */

import type { Screen } from './types';

type UmamiValue = string | number | boolean;
export type UmamiData = Record<string, UmamiValue>;

/** What the tracker sends with a page view; `url` is overridden per screen. */
interface UmamiPageProps {
  url: string;
  [key: string]: unknown;
}

interface UmamiApi {
  track(name: string, data?: UmamiData): unknown;
  track(mutate: (props: UmamiPageProps) => UmamiPageProps): unknown;
}

declare global {
  interface Window {
    umami?: UmamiApi;
  }
}

/** Every custom event the app reports, so the dashboard vocabulary stays small. */
export type AnalyticsEvent =
  'game_start' | 'round_end' | 'game_finish' | 'game_resume' | 'room_create' | 'room_join';

const SCRIPT_URL = 'https://cloud.umami.is/script.js';
/** Calls made before the script arrives wait here; more than this means it never will. */
const MAX_PENDING = 20;
/** A tracker that hasn't loaded by then never will (blocked, captive portal); stop queueing. */
const LOAD_TIMEOUT_MS = 15_000;

type Status = 'off' | 'loading' | 'ready' | 'failed';
type Call = (api: UmamiApi) => void;

let status: Status = 'off';
let pending: Call[] = [];

/**
 * Injects the tracker once. Returns whether analytics are active for this
 * build; page views are reported manually via `trackScreen` (the app has no
 * router, so the tracker's own auto-tracking would only ever see `/`).
 */
export function initAnalytics(): boolean {
  if (status !== 'off') return status !== 'failed';
  const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
  if (websiteId === undefined || websiteId === '' || import.meta.env.DEV) return false;
  if (typeof document === 'undefined') return false;
  const script = document.createElement('script');
  script.src = SCRIPT_URL;
  script.defer = true;
  script.dataset.websiteId = websiteId;
  script.dataset.autoTrack = 'false';
  const fail = (): void => {
    status = 'failed';
    pending = [];
  };
  const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
  script.onload = () => {
    clearTimeout(timer);
    if (status !== 'loading') return; // gave up already — stay consistent with initAnalytics()
    status = 'ready';
    const api = typeof window === 'undefined' ? undefined : window.umami;
    const queued = pending;
    pending = [];
    if (api === undefined) return;
    for (const call of queued) call(api);
  };
  script.onerror = () => {
    clearTimeout(timer);
    fail();
  };
  document.head.append(script);
  status = 'loading';
  return true;
}

function dispatch(call: Call): void {
  if (status === 'loading') {
    if (pending.length < MAX_PENDING) pending.push(call);
    return;
  }
  if (status !== 'ready' || typeof window === 'undefined') return;
  const api = window.umami;
  if (api === undefined) return;
  try {
    call(api);
  } catch (error) {
    console.error('analytics call failed', error);
  }
}

/** Reports a screen as a page view (`/` for home, `/round`, …). */
export function trackScreen(screen: Screen): void {
  const url = screen === 'home' ? '/' : `/${screen}`;
  dispatch((api) => {
    void api.track((props) => ({ ...props, url }));
  });
}

/** Reports one custom event with optional plain-value data. */
export function trackEvent(name: AnalyticsEvent, data?: UmamiData): void {
  dispatch((api) => {
    void api.track(name, data);
  });
}
