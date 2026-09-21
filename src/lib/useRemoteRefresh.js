import { useEffect, useRef } from "react";

// Runs `check` on a timer while the tab is visible, and immediately when the
// tab/app comes back into view or the network returns — the moment a phone
// wakes up is exactly when its data is most likely to be stale. `check` is
// read through a ref, so it always sees the latest component state without
// the timer restarting on every render. Overlapping runs and bursts (focus
// and visibilitychange usually fire together) are collapsed into one.
export function useRemoteRefresh(check, { intervalMs = 30000, enabled = true, minGapMs = 5000 } = {}) {
  const checkRef = useRef(check);
  checkRef.current = check;
  const busyRef = useRef(false);
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const run = async () => {
      if (document.visibilityState !== "visible") return;
      if (busyRef.current || Date.now() - lastRunRef.current < minGapMs) return;
      busyRef.current = true;
      lastRunRef.current = Date.now();
      try {
        await checkRef.current();
      } catch {
        // A failed check just means try again next time.
      } finally {
        busyRef.current = false;
      }
    };
    const timer = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
    };
  }, [intervalMs, enabled, minGapMs]);
}
