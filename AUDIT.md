# Vibehouse interaction audit — 2026-10-05

## Kept because it was already functional
- SPA clean-URL routing and navigation
- Search and product filtering
- Supabase/localStorage auth fallback
- Task add/toggle/delete persistence
- Supabase/localStorage waitlist persistence
- Product ownership and logo upload flow
- Launch builder validation and listing creation
- Listing edit/delete and tracked view/open counters
- Profile editing and profile photo flow
- Follow/unfollow persistence
- PWA install prompt fallback
- Contact form persistence + mail client handoff
- Prompt copy actions

## Fixed / improved
- Removed duplicate Dashboard/Contact rendering caused by the hub route override.
- Waitlist backend failures now roll back the optimistic local change instead of showing false success.
- Backend submission/storage errors now return `ok: false` instead of being mislabeled as offline success.
- Product demo video now opens a real video modal.
- Product PDF action now downloads the real bundled PDF asset.
- Added a real bundled Menu Maker demo MP4.
- Added a real bundled Invoice Nest guide PDF.
- Mini Tools are now functional: contrast checker, JSON formatter, regex tester, meta preview, slug generator, and Lorem generator.
- Characters now have a working local chat flow plus an optional server-side character API endpoint.
- Map page now provides functional region buttons that open map locations instead of displaying a placeholder.
- Image generation now creates a downloadable local SVG preview and supports an optional server-side image endpoint.
- Video generation now creates a short browser-generated WebM preview and supports an optional server-side video endpoint.
- Added configurable `IMAGE_API_URL`, `VIDEO_API_URL`, and `CHARACTER_API_URL` without exposing provider secrets in the frontend.
- Prompt copy now handles clipboard failure cleanly.

## Validation performed
- JavaScript syntax checks passed for `app.js`, `hub.js`, `profile.js`, `supabase.js`, and `config.js`.
- ZIP integrity check passed.
- Bundled MP4 and PDF assets exist and are non-empty.
- Local media references in product data resolve to bundled assets.

## Backend note
This is a static frontend with an optional Supabase backend. Supabase credentials were not supplied in the ZIP, so shared cloud auth/data cannot be live-tested against a real project from this environment. The offline/localStorage paths remain usable without credentials.

## 2026-10-06 update
- Fixed: refresh flashed the logged-out UI (init awaited the network before first paint). Now paints instantly from cache and reconciles quietly.
- Fixed: shared listings were pulled before the Supabase client existed, so they never loaded; pulled after init now, cached for instant paint.
- Added: roomy 4-step launch form with required logo, screenshots and demo video, uploaded to Supabase Storage.
- Added: product page video + gallery and card previews from real uploads only.
- Not live-tested against a Supabase project (no credentials in this environment). Syntax checks pass for all JS files.
