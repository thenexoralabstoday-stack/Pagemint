# Pagemint — browser-native PDF toolbox

Copyright (c) 2026 Nexora Labs. All rights reserved.  
Contact: thenexoralabstoday@gmail.com

Every PDF tool the big sites offer (merge, split, organise, compress, convert, watermark, page numbers, crop, flatten, metadata, OCR) plus a real editor (retype existing text, add text, whiteout, highlight, boxes, freehand, signatures, images, **true redaction**) and AI summarise/chat. Files are processed entirely in the browser; only the AI tool sends extracted text to your server.

```
index.html          app shell (landing, tools, pricing, account, workspace)
css/app.css         design system, light + dark
js/app.js           router, workspace, plan chip, paywall, file ingest
js/engine.js        pdf.js (render/text) + pdf-lib (write) wrappers
js/billing.js       plans, limits, usage counter, API client
js/tools/*.js       one module per tool family; index.js is the registry
server/             Express API: magic-link auth, Stripe Checkout + webhooks + portal, Claude AI endpoint
test/smoke.test.js  Playwright end-to-end run of every tool
docs/BUSINESS.md    competitor research, pricing, billing model, growth plan
docs/IDEAS.md       other sites you can build to earn money
_legacy/            the v1 single-file editor
```

## Run locally

```bash
npm install                # playwright for the tests
npm run serve              # static site on http://localhost:8080
```

Optional API (billing + AI):

```bash
cd server && npm install
cp .env.example .env       # fill in Stripe + Claude keys
npm start                  # http://localhost:4242
```

The front end talks to `http://localhost:4242` automatically when served from localhost. In production set `window.PAGEMINT_API = 'https://api.yourdomain.com'` before `js/app.js` loads, or serve both from the same origin.

Without the API everything except checkout, sign-in and AI works. On the Account page there is a **Unlock Pro locally (dev)** button to test Pro features.

## Tests

```bash
npm run serve   # in one terminal
npm test        # in another: opens every tool with test.pdf, downloads results to test/out, fails on console errors
```

## Stripe setup (15 minutes)

1. Create a product **Pagemint Pro** with prices: monthly $9 recurring, yearly $72 recurring, weekly pass $5 one-time.
2. Create **Pagemint Team** with prices: monthly $7 and yearly $60 per seat (recurring, quantity adjustable).
3. Copy the `price_...` IDs into `server/.env`.
4. Enable the Customer Portal in Stripe settings so "Manage billing" works.
5. Webhook: `stripe listen --forward-to localhost:4242/api/webhook` in dev; in production add an endpoint for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

## Deploy

- Static site: Cloudflare Pages, Netlify, Vercel or any bucket. No build step.
- API: Railway, Render, Fly.io. Replace `server/db.js` with Postgres before you have thousands of users; the interface is three functions.
- Add per-tool landing pages (`/merge-pdf`, `/compress-pdf`, ...) for SEO. See `docs/BUSINESS.md`.

## Known limits

- Password protect / unlock is not included: pdf-lib cannot encrypt. Add `qpdf` WASM or a server job when you need it.
- Existing-text editing re-sets the line in Helvetica/Times/Courier, not the original embedded font.
- Compress "Medium" and "Strong" rasterise pages (text becomes an image). "Light" keeps text.
