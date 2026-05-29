// ===== Automatic update / cache-buster =====
// Students (and teachers) on a stale cached build are reloaded automatically
// the moment a newer version is published — no manual hard-refresh needed.
//
// How it works:
//   • The HTML head defines window.APP_VERSION = <build number>. Because that
//     number lives in the HTML, a device running an OLD cached HTML still
//     reports its OLD number here — exactly the "what am I actually running"
//     value we need to compare.
//   • The teacher device publishes ITS version to Firebase (a live channel that
//     is never cached). Every device listens.
//   • If the published version is higher than the one this device is running,
//     we force a reload with a fresh cache-busting URL so the browser refetches
//     the HTML + all scripts from scratch.

(function () {
  const CURRENT = window.APP_VERSION || 0;
  const RELOAD_KEY = 'combat:reloadedForVersion';

  function hardReloadFresh() {
    try {
      const url = new URL(location.href);
      // Changing the query string makes the HTML document a different URL, which
      // defeats even aggressive iOS/home-screen caches: the browser must refetch.
      url.searchParams.set('fresh', Date.now().toString(36));
      location.replace(url.toString());
    } catch (e) {
      // Absolute fallback
      location.reload();
    }
  }

  // Don't yank a student out of an active quiz/battle — wait until they're back
  // in the lobby, then update.
  function isMidMatch() {
    return typeof Game !== 'undefined' && (Game.state === 'quiz' || Game.state === 'combat');
  }

  function scheduleReload() {
    if (isMidMatch()) {
      console.warn('[Update] New version ready — will update as soon as this match ends.');
      setTimeout(scheduleReload, 3000);
      return;
    }
    hardReloadFresh();
  }

  function check(latest) {
    if (typeof latest !== 'number' || latest <= CURRENT) return;

    // Loop guard: if we already reloaded targeting this version (or newer) but
    // we're STILL behind, the new build probably hasn't propagated to the CDN
    // yet. Stop reloading and just wait — the next listener fire will retry once
    // the server catches up (sessionStorage is per-tab, so a fresh open retries).
    const already = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
    if (already >= latest) {
      console.warn(`[Update] Running v${CURRENT}, latest v${latest}, but already reloaded — waiting for deploy to propagate.`);
      return;
    }

    console.warn(`[Update] New version v${latest} available (running v${CURRENT}) — auto-updating…`);
    sessionStorage.setItem(RELOAD_KEY, String(latest));
    scheduleReload();
  }

  function subscribe() {
    if (typeof Firebase === 'undefined' || !Firebase.isInitialized || !Firebase.isInitialized()) {
      return setTimeout(subscribe, 500); // retry until Firebase is ready
    }
    if (typeof Firebase.listenToAppVersion === 'function') {
      Firebase.listenToAppVersion(check);
      console.log(`[Update] Version watcher active (running v${CURRENT}).`);
    }
  }

  subscribe();
})();
