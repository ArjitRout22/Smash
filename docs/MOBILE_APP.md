# Mobile apps (free) — Android APK + iPhone install

Smash is a PWA, so both platforms get a real app-like experience for ₹0 (no Play
Store / App Store fees). Both now open on a **branded splash** (no white screen).

## Android — free APK via PWABuilder (TWA)

A TWA wraps the live site (smashhero.app) in a full-screen Android app that
auto-updates. No Android Studio needed.

1. Go to <https://www.pwabuilder.com>, enter `https://smashhero.app`, **Package
   for Android** → **Generate**.
2. Download the zip. It contains a **signed `.apk`** (for sideloading/sharing), an
   `.aab` (for the Play Store later), and a **signing key** — **back this key up**;
   you need it to ship updates.
3. Open `assetlinks.json` (or the "Digital Asset Links" value) from the zip and copy:
   - the **package name** (e.g. `app.smashhero.twa`)
   - the **SHA-256 fingerprint**
4. Put them into `public/.well-known/assetlinks.json` in this repo (replace the
   placeholders) and deploy. Verify it's live:
   `https://smashhero.app/.well-known/assetlinks.json` (must return the JSON).
   This is what removes the browser URL bar (true full-screen app).
5. Share the `.apk` (WhatsApp/Drive link). Users tap it → "install from unknown
   sources" → done.

**Effort:** ~1 hour, almost all in the PWABuilder UI. **Cost:** free.
The white-screen-on-open is handled by the TWA splash (from the manifest
`background_color` + icon).

## iPhone — free "Add to Home Screen" (PWA)

Apple has no free sideloading; a native `.ipa` needs a $99/yr Apple Developer
account. The free, no-account equivalent is the installable PWA:

1. Open `https://smashhero.app` in **Safari** (must be Safari).
2. **Share → Add to Home Screen**. (The app shows an install guide for this.)
3. It gets a home-screen icon (`apple-icon.png`), runs full-screen, and now opens
   on a **branded launch splash** — the `apple-touch-startup-image` set generated
   by `scripts/gen-ios-splash.mjs` (public/splash/, wired in `layout.tsx`) — so no
   white screen on cold open.

To regenerate the iOS splashes after an icon change:
```bash
node scripts/gen-ios-splash.mjs
```
(uses `public/icon-512.png` on the `#0b1120` brand background).
