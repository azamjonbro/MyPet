import { defineConfig } from 'wxt';

// The manifest has to name the API we talk to, and that host differs between a
// local backend and the deployed one. Deriving the permission from the same
// VITE_API_BASE the fetch code reads keeps the two from ever drifting apart —
// a mismatch here is a silent "failed to fetch" in the service worker.
try {
  process.loadEnvFile?.('.env');
} catch {
  /* no .env — fall back to localhost below */
}

const apiBase = process.env.VITE_API_BASE ?? 'http://localhost:4100/api/v1';
const apiHost = `${new URL(apiBase).origin}/*`;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: 'AI English Pet',
    description: 'A small companion that helps you learn English while you browse.',
    version: '0.1.0',

    // §16 / §H — minimum install-time permissions.
    // The pet only runs on google.com out of the box; "let the pet follow me
    // everywhere" is granted at runtime from onboarding and registered with
    // chrome.scripting.registerContentScripts.
    permissions: ['storage', 'alarms', 'scripting', 'sidePanel', 'notifications'],
    optional_permissions: ['identity'],
    host_permissions: [apiHost],
    optional_host_permissions: ['https://*/*', 'http://*/*'],

    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: { default_title: 'AI English Pet' },
    side_panel: { default_path: 'sidepanel.html' },
  },
});
