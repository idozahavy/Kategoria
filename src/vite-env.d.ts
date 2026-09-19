/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Turnstile site key (public) — unset means no bot check on /turn-credentials. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** Umami Cloud website id (public) — unset means no analytics (see README → Analytics). */
  readonly VITE_UMAMI_WEBSITE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
