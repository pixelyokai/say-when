/**
 * Runs `open` once the current tap or click has finished.
 *
 * Opening a dialog, sheet or drawer from inside a click handler mounts its
 * "tap outside to close" listener while that same click is still bubbling.
 * On touch screens Base UI listens for `click` (so scrolling doesn't dismiss),
 * so the very tap that opened it closes it again. Deferring by one task lets
 * the gesture finish first. Use it for overlays opened from our own handlers;
 * coss `*Trigger` components don't need it.
 */
export function afterGesture(open: () => void): void {
  window.setTimeout(open, 0);
}
