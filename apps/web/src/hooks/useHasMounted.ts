'use client';

import { useState, useEffect } from 'react';

/**
 * Returns true after the component has mounted on the client.
 *
 * Use this to defer browser-only rendering until after hydration so the
 * server HTML and first client render produce identical markup.
 *
 * @example
 * const mounted = useHasMounted();
 * if (!mounted) return <StablePlaceholder />;
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * Returns a stable date string (YYYY-MM-DD) that is the same on server and
 * client during the initial render. After mount, updates to the real date.
 *
 * Use this instead of `const today = new Date()` at render time.
 *
 * @example
 * const todayStr = useClientDateString();
 * // First render: '1970-01-01', after mount: actual date in local tz
 */
export function useClientDateString(): string {
  const [dateStr, setDateStr] = useState('1970-01-01'); // stable default
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setDateStr(today.toLocaleDateString('en-CA'));
  }, []);
  return dateStr;
}
