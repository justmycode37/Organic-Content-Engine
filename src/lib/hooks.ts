import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText } from '../api/client';

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Loads on mount and whenever deps change. Keeps the last data while refreshing and ignores stale responses. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const latest = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    const id = ++latest.current;
    setState(s => ({ ...s, loading: true }));
    load().then(
      data => { if (id === latest.current) setState({ data, error: null, loading: false }); },
      error => { if (id === latest.current) setState(s => ({ data: s.data, error: errorText(error), loading: false })); },
    );
  }, deps);
  useEffect(() => {
    reload();
    return () => {
      // A request can finish after its view unmounts (or its dependencies change).
      // Invalidate it so it cannot update state in a component that is no longer active.
      latest.current += 1;
    };
  }, [reload]);
  return { ...state, reload };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Counts the way the server does: user-perceived characters. */
export function countChars(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count += 1;
  return count;
}
