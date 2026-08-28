/**
 * "Let the pet follow me everywhere."
 *
 * Asking for `<all_urls>` at install is the single biggest Chrome Web Store
 * review risk in a product like this, and it asks the learner to trust us with
 * every page they visit before they have seen the pet do anything. So the
 * broad host permission is optional, requested from a click during onboarding,
 * and the content script for it is registered at runtime.
 *
 * The *request* has to happen in the popup: chrome.permissions.request needs a
 * user gesture, and a service worker has none. Everything after that — keeping
 * the registration in step with the grant — lives here.
 */
export const EVERYWHERE_ORIGINS = ['https://*/*', 'http://*/*'];
const SCRIPT_ID = 'pet-everywhere';
const CONTENT_SCRIPT = 'content-scripts/content.js';

export async function hasFollowEverywhere(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: EVERYWHERE_ORIGINS });
  } catch {
    return false;
  }
}

/**
 * Makes the registered scripts match the granted permissions.
 *
 * Called on install, on every grant and revoke, and on worker start-up:
 * registrations survive a restart but a permission can be revoked from
 * chrome://extensions while the browser is closed, and a script registered
 * without its permission simply fails to inject on every page load.
 */
export async function syncRegistration(): Promise<boolean> {
  const granted = await hasFollowEverywhere();

  let registered: chrome.scripting.RegisteredContentScript[] = [];
  try {
    registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  } catch {
    registered = [];
  }

  try {
    if (granted && registered.length === 0) {
      await chrome.scripting.registerContentScripts([
        {
          id: SCRIPT_ID,
          matches: EVERYWHERE_ORIGINS,
          js: [CONTENT_SCRIPT],
          runAt: 'document_idle',
          allFrames: false,
          persistAcrossSessions: true,
        },
      ]);
    } else if (!granted && registered.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    }
  } catch {
    // A failed registration is a pet that only appears on google.com — not a
    // reason to break the worker.
  }

  return granted;
}

export async function revokeFollowEverywhere(): Promise<void> {
  try {
    await chrome.permissions.remove({ origins: EVERYWHERE_ORIGINS });
  } catch {
    /* already gone */
  }
  await syncRegistration();
}
