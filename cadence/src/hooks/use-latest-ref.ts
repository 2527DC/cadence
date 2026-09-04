import { useEffect, useRef, type RefObject } from 'react';

/**
 * A ref that always holds the most recent value, without writing to it during render.
 *
 * The pattern this replaces — `const ref = useRef(v); ref.current = v;` — is what most
 * of this codebase used, and React 19's `react-hooks/refs` rule rejects it. The
 * objection is real, not stylistic: with the React Compiler enabled (see
 * app.config.ts `experiments.reactCompiler`) a render may be retried or discarded, so a
 * value written during render can be written more than once, or written and thrown away.
 * Refs are meant to be read and written outside render.
 *
 * Assigning in an effect keeps the useful property — long-lived callbacks (a
 * PanResponder, an audio status listener, a timer) read the latest props without being
 * torn down and rebuilt on every render — while keeping render itself pure.
 *
 * The one thing to know: the ref is one render behind until effects flush. That is fine
 * for anything called from an event, a gesture or an async continuation, which is every
 * use here. It is NOT fine if you need the value during render — read the prop directly
 * for that.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  // No dependency array on purpose: this must run after every render, since any render
  // may be the one that changed the value.
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
