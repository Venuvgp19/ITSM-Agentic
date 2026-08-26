'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a flat string-keyed state object in sync with the URL's query string,
 * so filters/search/sort/page survive a refresh and can be shared via link.
 * Values equal to their default are omitted from the URL to keep it clean.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [state, setState] = useState<T>(defaults);
  const hydrated = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const val = params.get(key);
      if (val !== null) (next as Record<string, string>)[key] = val;
    }
    setState(next);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    for (const key of Object.keys(state)) {
      const val = state[key];
      if (val && val !== defaults[key]) params.set(key, val);
    }
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [state]);

  const patch = (updates: Partial<T>) => setState((prev) => ({ ...prev, ...updates }));

  return { state, setState, patch };
}
