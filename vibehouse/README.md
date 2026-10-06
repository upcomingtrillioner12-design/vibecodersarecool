# Vibehouse — The platform for vibe-coded tools and products

Complete, production-ready frontend with **Supabase backend integration**.  
Works fully offline (localStorage) out of the box. Add your Supabase keys to go live.

---

## Quick start (offline)

```bash
cd vibehouse
npx serve .
# or: python3 -m http.server 8080
```

Open the URL. Navigation, search, products, waitlist, tasks, profiles, launch flow, mini tools, character chat, media previews and local generation work without a backend. Supabase is optional for shared/authenticated data.

---

## Connect Supabase (5 minutes)

### 1. Create project
- Go to https://supabase.com → New project
- Wait for it to finish provisioning

### 2. Run the schema
- Supabase Dashboard → **SQL Editor** → New query
- Paste the entire contents of `supabase-schema.sql`
- Click **Run**

### 3. Get your keys
- Settings → **API**
- Copy **Project URL** and **anon public** key

### 4. Paste into the app
Open `js/config.js` and fill:

```js
window.VIBEHOUSE_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  USE_SUPABASE: true,
};
```

Reload the site. Auth, waitlist, tasks, and launch submissions will now use Supabase.

---

## What's included

| Feature | Offline | With Supabase |
|---------|---------|---------------|
| Home / Search / Filters / Leaderboard / Deals | Yes | Yes |
| 12 real products + detail pages | Yes | Can load from DB |
| Waitlist toggle | localStorage | waitlist table |
| Tasks board | localStorage | tasks table |
| Auth (sign up / log in) | localStorage | Supabase Auth + profiles |
| **Launch / Advertise page** | localStorage | submissions table |
| Generate Images / Videos | Local browser generator + optional server endpoint | Optional API endpoint via config |
| Mini tools, Characters, Prompts, Map | Yes | — |

---

## Launch page

Route: `#launch` (sidebar → **Launch / Advertise**)

Fields:
- Product name, one-liner, long description
- Category, pricing tier
- Website / demo URL, logo URL
- Maker name, email, Twitter

On submit:
- Always saved to localStorage (vh_submissions)
- If Supabase is connected → also inserted into submissions table with status: pending

---

## File structure

```
vibehouse/
├── index.html              # App shell + routing
├── css/styles.css          # Design system
├── js/
│   ├── config.js           # ← PUT YOUR KEYS HERE
│   ├── data.js             # Products, news, stats (seed data)
│   ├── supabase.js         # Supabase client + data layer
│   └── app.js              # All UI logic & pages
├── supabase-schema.sql     # Run this in Supabase SQL Editor
└── README.md
```

---

## Optional: Firebase

Set USE_FIREBASE: true and fill the Firebase config object in js/config.js.

---

## Image / Video generation

UI is ready on #generate-images and #generate-videos.  
Wire your provider (Replicate, Fal, OpenAI, Runway, Luma, Kling) inside the button handlers in app.js.

---

## Clean URLs

After deploy, URLs look like:

- `/` — Home
- `/search` — Search
- `/ai/daxeon` — Product page (no .html)
- `/launch` — Launch form
- `/profile/aarav-mehta` — Maker profile

No `#` hash and no `.html` in the address bar.

**How it works:** History API + SPA fallback.

**Deploy:**
- **Vercel** — `vercel.json` is included (rewrites to index.html)
- **Netlify** — `netlify.toml` + `_redirects` included
- **Cloudflare Pages / any static host** — use the SPA fallback rule

Local preview with clean paths:
```bash
npx serve .
# then open /ai/daxeon on your site
```

---
## Product types and buttons

| Type | Access | Builder provides | Button |
|------|--------|------------------|--------|
| Web App | Redirect to live URL | Live URL | Open App |
| AI Agent | Redirect | Service URL + description | Try / Connect (maker picks) |
| AI Model | Redirect / API endpoint | Hugging Face link or API URL | Use Model |
| Mobile App | App Store redirect | apps.apple.com link (+ optional Google Play) | Get on App Store |
| APK | Not hosted | Link to builder's own site | Visit Site |

- Launch form (`/launch`, login required) validates every link per type (https only, App Store host for mobile, direct .apk/.aab/.zip file links rejected, duplicates rejected).
- Product page shows the right button, counts views and clicks, and lets the owner edit links or delete the listing.
- `/dashboard` lists your launches with views, opens and click-through. `/contact` sends mail to upcomingtrillioner12@gmail.com.
- Re-run `supabase-schema.sql` (safe to re-run) to get shared listings, owner-only edit/delete, and counters. Without keys everything is stored in the browser.

## Profiles

- `/profile/me`: edit display name, @username (unique), headline, bio, website, X/Twitter; click the photo to change it.
- Every account gets a unique @username automatically at first login; the top bar shows it.
- Your profile shows on your product cards ("by"), the Maker box, and your public profile page. `/profile/<username>` works too.
- Supabase: re-run `supabase-schema.sql`. Emails are now private; other people's profiles are read through the `public_profiles` view.

## Launch media (new)

The launch form (`/launch`, login required) is now 4 steps: **Type → Details → Media → Review**.

- Large, roomy inputs: full description (up to 4,000 characters), features, supported inputs, pricing details, version and release notes, GitHub link.
- **Required media:** logo, at least 1 screenshot (up to 8) and a demo video (YouTube / Vimeo / Loom / direct .mp4 link, or a file up to 50 MB).
- Files upload to the Supabase Storage bucket `listing-media`; everything else goes into the `listings` table.
- Product pages show the real video and screenshot gallery; product cards show the first screenshot (or the video thumbnail), features and price. Placeholder file names from the seed data are never rendered.
- **Run the updated `supabase-schema.sql` once** (SQL Editor) to add the new columns and the storage bucket. It is safe to re-run.
- Offline (no keys): images are compressed and kept in the browser; for video, paste a link.

## Refresh behaviour

The page paints from a local snapshot of the signed-in user and the last-loaded listings, then confirms with Supabase in the background. It only repaints if something actually changed, so refreshing no longer flashes the logged-out page. Listings are now pulled after the Supabase client is ready (they previously never loaded after a refresh).
