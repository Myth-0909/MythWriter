type MotionMatchMedia = (query: string) => { matches: boolean };

interface MotionPreferenceOptions {
  respectReducedMotion?: boolean;
  matchMedia?: MotionMatchMedia;
}

export function shouldReduceMotion({
  respectReducedMotion = true,
  matchMedia = typeof window === "undefined" ? undefined : window.matchMedia.bind(window),
}: MotionPreferenceOptions = {}) {
  if (!respectReducedMotion || !matchMedia) return false;

  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
