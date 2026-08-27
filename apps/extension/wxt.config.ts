import { defineConfig } from 'wxt';

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
    permissions: ['storage', 'alarms', 'scripting', 'sidePanel'],
    optional_permissions: ['identity'],
    host_permissions: ['http://localhost:4100/*'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],

    action: { default_title: 'AI English Pet' },
    side_panel: { default_path: 'sidepanel.html' },
  },
});
