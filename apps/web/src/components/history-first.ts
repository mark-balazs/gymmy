/**
 * The first `popstate` listener in the document, inlined into the page by the
 * root layout so it is registered before any bundle runs.
 *
 * Next.js restores a Back or Forward synchronously, outside any transition,
 * so a `<ViewTransition>` never sees it and the page just swaps. The app takes
 * those moves over (`useHistorySlides` in `navigate.tsx`) and replays them as a
 * typed move that slides — which only works if it hears the event before
 * Next's own listener does, so it can stop it. Listeners on the window run in
 * the order they were added, capture or not (Chrome ignores the capture phase
 * at the target), and Next adds its own while the app hydrates. Being in the
 * document is the one way to be first.
 *
 * It does nothing by itself: it hands the event to whatever the app has put in
 * `window.__gymmyPopstate`, and there is nothing there outside the signed-in
 * app.
 *
 * A plain module, not a client one, so the server layout can read the string.
 */

export const POPSTATE_HOOK = '__gymmyPopstate';

export const HISTORY_FIRST = `addEventListener('popstate', function (e) {
  var take = window.${POPSTATE_HOOK};
  if (typeof take === 'function') take(e);
});`;
