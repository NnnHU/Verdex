/**
 * Verdex — useElapsed: a ticking elapsed-seconds counter for running turns.
 *
 * Returns the number of whole seconds elapsed since `fromTs`, updating every
 * second while `running` is true. Stops ticking when not running (returns the
 * final elapsed at the moment running flipped false, so the stopped time stays
 * visible). Cheap: one setInterval, cleared on unmount/stop.
 */
import { useEffect, useState } from "react";

export function useElapsed(running: boolean, fromTs: number | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || fromTs === null) return;
    // Seed immediately so the first second isn't blank.
    setElapsed(Math.max(0, Math.floor((Date.now() - fromTs) / 1000)));
    const id = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - fromTs) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, fromTs]);
  return elapsed;
}

export default useElapsed;
