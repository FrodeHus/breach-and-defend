// public/analytics.mjs
// Anonymous usage counts through Cloudflare Web Analytics (the beacon in index.html): no cookies, no identifiers.
// It has no custom events, so a game played is reported as a page view of a virtual path. The beacon reports
// same-document navigations; the address is put back at once, so a reload can never land on a missing page.
// Where the Navigation API exists the beacon sees a replaceState, which spares the Back button an extra entry;
// older browsers only have their pushState watched.
export function trackGame(
  mode,
  {history = globalThis.history, location = globalThis.location, navigation = globalThis.navigation} = {},
) {
  try {
    const here = location.pathname + location.search + location.hash;
    history[navigation ? 'replaceState' : 'pushState'](history.state, '', `/played/${mode}`);
    history.replaceState(history.state, '', here);
  } catch {
    // Counting is best effort: a sandboxed frame or a throttled History API must not stop a game.
  }
}
