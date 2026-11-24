# Cogni browser DevTools

This workspace builds the same Cogni panel for Chromium and Firefox.

```bash
npm run build --workspace @inttegro/cogni-browser-devtools
```

Load `dist/chromium` as an unpacked extension in a Chromium browser. In Firefox, open
`about:debugging`, choose **This Firefox**, and load `dist/firefox/manifest.json` as a temporary
add-on.

The generated manifests target Chromium 121 or newer and Firefox 142 or newer. Chromium uses a
Manifest V3 service worker; Firefox uses a Manifest V3 background script. The extension keeps
prediction metadata local to the inspected browser and declares no external data collection.

The inspected application must install the Cogni page bridge. React applications can render
`CogniDevtoolsConnector` from `@inttegro/cogni-devtools/react`; the embedded `CogniDevtools`
component installs the same bridge automatically.

Safari is not part of the validated browser matrix. Apple provides a WebExtension converter, but a
Safari release still requires an Xcode build, signing, and Safari-specific testing.
