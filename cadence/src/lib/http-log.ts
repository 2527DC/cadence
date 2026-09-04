// Every request and response, logged.
//
// Wired in as the `fetch` Supabase uses (src/lib/supabase.ts), so it sees everything —
// auth, PostgREST queries, RPC calls, storage uploads — in one place. Nothing has to
// remember to log itself.
//
// WHAT IS REDACTED, AND WHY IT IS NOT OPTIONAL
//
// "Log every request and response" cannot be taken literally here. The sign-in request
// body contains a plaintext password; the response contains an access token and a
// refresh token. A refresh token is a long-lived credential — anyone holding it can mint
// sessions as you until it is revoked. Metro's console output goes to a terminal, gets
// scrolled through, pasted into bug reports and screen-shared.
//
// So the shape of every request and response is logged, and the credentials inside them
// are replaced with a marker that says one was there. That keeps the log useful for
// debugging — you can still see that a token came back, and how long it was — without
// turning the terminal into a place credentials live.

/** Off in a release build. A production app should not narrate itself. */
const ENABLED = __DEV__;

/** Response bodies longer than this are cut; a week of tasks is a lot of JSON. */
const MAX_BODY = 900;

/** Field names whose values never reach the log, at any depth. */
const SECRET_KEYS = new Set([
  'password',
  'new_password',
  'current_password',
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'id_token',
  'token',
  'apikey',
  'api_key',
  'secret',
  'authorization',
]);

let counter = 0;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      // Say that it was there and how big it was. That is enough to tell "no token
      // came back" from "a token came back and something else is wrong".
      out[k] = typeof v === 'string' ? `«redacted ${v.length} chars»` : '«redacted»';
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function summarise(body: string): string {
  if (!body) return '';
  try {
    return JSON.stringify(redact(JSON.parse(body)));
  } catch {
    // Not JSON — a storage upload, a form post. Never log the bytes.
    return `«${body.length} bytes, not JSON»`;
  }
}

const clip = (s: string) => (s.length > MAX_BODY ? `${s.slice(0, MAX_BODY)}… (${s.length} total)` : s);

/**
 * The path and query, without the project host — the host is the same every time and
 * only makes the line harder to scan. Query values are kept: `?week_start=eq.2026-08-31`
 * is usually the thing you are trying to see.
 */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/(rest|auth|storage)\/v1/, '/$1') + u.search;
  } catch {
    return url;
  }
}

/**
 * A `fetch` that logs. Same signature as the global, so it drops straight into
 * createClient({ global: { fetch: loggingFetch } }).
 */
export const loggingFetch: typeof fetch = async (input, init) => {
  if (!ENABLED) return fetch(input, init);

  const id = ++counter;
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const started = Date.now();

  const reqBody = typeof init?.body === 'string' ? clip(summarise(init.body)) : '';
  console.log(`→ #${id} ${method} ${shortUrl(url)}${reqBody ? ` ${reqBody}` : ''}`);

  try {
    const res = await fetch(input, init);
    const ms = Date.now() - started;

    // The body is a one-shot stream, so it has to be cloned before anything reads it.
    // Reading `res` itself here would leave the caller with an empty body — a very
    // confusing bug to have introduced with a logger.
    let text = '';
    try {
      text = await res.clone().text();
    } catch {
      text = '«body could not be read»';
    }

    const mark = res.ok ? '←' : '✗';
    console.log(`${mark} #${id} ${res.status} ${method} ${shortUrl(url)} ${ms}ms ${clip(summarise(text))}`);
    return res;
  } catch (err) {
    // A network failure, not an HTTP error. Offline, DNS, a dropped tunnel — worth
    // distinguishing in the log, because the app treats the two differently.
    const ms = Date.now() - started;
    console.log(
      `✗ #${id} NETWORK ${method} ${shortUrl(url)} ${ms}ms ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
};
