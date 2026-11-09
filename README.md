# WA Web PIN Lock

A Chrome / Edge extension (Manifest V3) that locks **WhatsApp Web** (`https://web.whatsapp.com`) behind a PIN on desktop.

- Locks when WhatsApp Web opens (or reloads). It does **not** lock on its own after that unless you enable idle auto-lock in settings (off by default).
- Lock any time with:
  - the floating lock button on WhatsApp Web (drag it to move it; its position is remembered, and it can be hidden in settings),
  - the keyboard shortcut **Alt+Shift+L** (change it at `edge://extensions/shortcuts` or `chrome://extensions/shortcuts`),
  - the extension's toolbar icon (opens settings when the active tab is not WhatsApp Web).
- 5 wrong attempts trigger a 30-second cooldown.
- The PIN is stored only as a salted PBKDF2-SHA256 hash in `chrome.storage.local`; it never leaves the browser.
- While locked, keyboard and mouse input to WhatsApp is blocked and PIN keystrokes are hidden from the page.

## Why an extension and not a PWA hosted on Vercel?

`web.whatsapp.com` forbids being embedded in another site (`X-Frame-Options` / CSP `frame-ancestors`), so a PWA hosted on Vercel cannot show WhatsApp Web inside it. Proxying WhatsApp through a server would break the app and route your WhatsApp session through a third party. WhatsApp Web is already an installable PWA, so the extension adds the PIN lock directly on top of it instead.

## Install (desktop)

1. Download this repository (`Code → Download ZIP`) and extract it, or `git clone` it.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. The settings page opens automatically. Enter your PIN (4–12 digits) twice and click **Save PIN**.
   To reopen settings later, right-click the extension icon → **Extension options**.
5. Open `https://web.whatsapp.com` and install it as an app:
   - Chrome: address bar install icon, or **⋮ → Cast, save and share → Install page as app**.
   - Edge: **⋯ → Apps → Install WhatsApp Web**.

   The installed app window runs the extension too, so it opens locked. Inside the app window, use the floating button or **Alt+Shift+L** to lock it.

## Limitations

This is a convenience lock against casual access, not a security boundary:

- Anyone with access to the computer's browser profile can disable the extension or use DevTools.
- Desktop notifications from WhatsApp Web are still shown while locked. Turn off message previews in WhatsApp settings if that matters.
- For stronger protection, also use a locked OS user account. WhatsApp Web also has its own built-in screen lock (Settings → Privacy → Screen lock).

## Development

```bash
npm install
npm test
```

`npm test` loads the extension in headless Chromium with Playwright and runs it against a stubbed `web.whatsapp.com` page (no network access needed).

Files:

- `extension/manifest.json` — extension manifest.
- `extension/content.js` — lock overlay injected into WhatsApp Web.
- `extension/pin.js` — PIN hashing and verification shared by the overlay and settings page.
- `extension/options.html`, `extension/options.js` — settings page.
- `extension/background.js` — keyboard shortcut and toolbar icon handling; opens settings on install.
