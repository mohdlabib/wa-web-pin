# WA Web PIN Lock

A Chrome / Edge extension (Manifest V3) that locks **WhatsApp Web** (`https://web.whatsapp.com`) behind a PIN on desktop.

- Locks every time WhatsApp Web loads.
- Auto-locks after a configurable idle time (default 5 minutes, `0` disables it).
- Manual lock: **Ctrl+Shift+L**.
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
   You can reopen settings at any time by clicking the extension icon.
5. Open `https://web.whatsapp.com` and install it as an app:
   - Chrome: address bar install icon, or **⋮ → Cast, save and share → Install page as app**.
   - Edge: **⋯ → Apps → Install WhatsApp Web**.

   The installed app window runs the extension too, so it opens locked.

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
- `extension/background.js` — opens settings on install and from the toolbar icon.
