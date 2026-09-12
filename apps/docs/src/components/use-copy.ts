import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy-to-clipboard with a short confirmation flag.
 *
 * The timer is owned by a ref and cleared on unmount, because the gallery swaps
 * the whole page on a hash change: a copy on the Button page followed
 * immediately by a click into Select would otherwise land `setCopied` on an
 * unmounted component.
 */
export function useCopy(): [copied: boolean, copy: (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded webviews.
      setCopied(false);
    }
  }, []);

  return [copied, copy];
}
