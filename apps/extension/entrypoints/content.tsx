import { createRoot, type Root } from 'react-dom/client';
import { PetHost } from '../src/pet/PetHost.js';
import petCss from '../src/pet/pet.css?inline';

const ROOT_ID = 'ai-english-pet-root';

/**
 * Content script. Runs in the isolated world and mounts the pet into an OPEN
 * shadow root — the boundary that keeps the host page's CSS out of the pet and
 * the pet's CSS out of the host page (§H).
 */
export default defineContentScript({
  // Narrow by default. "Let the pet follow me everywhere" is granted in
  // onboarding and registered at runtime, so install asks for very little.
  matches: ['https://www.google.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  main() {
    if (document.getElementById(ROOT_ID)) return;
    // Never mount inside a frame — one pet per page, not one per iframe.
    if (window.top !== window.self) return;

    const host = document.createElement('div');
    host.id = ROOT_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483000';

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = petCss;
    const mount = document.createElement('div');
    shadow.append(style, mount);

    document.documentElement.appendChild(host);

    let root: Root | null = createRoot(mount);
    root.render(<PetHost />);

    // bfcache / SPA navigation safety: tear down cleanly rather than leaking.
    addEventListener('pagehide', () => {
      root?.unmount();
      root = null;
      host.remove();
    }, { once: true });
  },
});
