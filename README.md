# Pagemint — browser-native PDF toolbox

Copyright (c) 2026 Nexora Labs. All rights reserved.  
Contact: thenexoralabstoday@gmail.com

Every PDF tool the big sites offer (merge, split, organise, compress, convert, watermark, page numbers, crop, flatten, metadata, OCR) plus a real editor (retype existing text, add text, whiteout, highlight, boxes, freehand, signatures, images, **true redaction**) and AI summarise/chat. Files are processed entirely in the browser; only the AI tool sends extracted text to your server.

```
index.html          app shell (landing, tools, pricing, account, workspace)
css/app.css         design system, light + dark
js/app.js           router, workspace, plan chip, paywall, file ingest
js/legal.js         terms, privacy and refund policy text
js/engine.js        pdf.js (render/text) + pdf-lib (write) wrappers
js/billing.js       plans, limits, usage counter, API client
js/tools/*.js       one module per tool family; index.js is the registry
server/             serves the app + API: magic-link auth, Stripe Checkout + portal, Claude AI endpoint
test/smoke.test.js  Playwright end-to-end run of every tool
docs/BUSINESS.md    competitor research, pricing, billing model, growth plan
docs/IDEAS.md       other sites you can build to earn money
_legacy/            the v1 single-file editor
```

## Run locally

```bash
cd server && npm install && cd ..
cp server/.env.example server/.env   # optional: add Stripe / Resend / Claude keys
node server/index.js                 # app + API on http://localhost:4242
```

Without keys everything except checkout, emailed sign-in links and AI works; sign-in links and contact
messages are printed to the server log instead. On localhost the Account page shows an
**Unlock Pro locally (dev)** button for testing Pro features; it never appears on the live site.

## How it stays up on a free host

The server keeps no data of its own, so restarts and redeploys lose nothing:

- **Plans come from Stripe.** A customer's plan is looked up from their Stripe subscriptions and
  7-day-pass payments by email (cached for a minute). There is no local database to lose or drift.
- **Sign-in is stateless.** Magic links and sessions are HMAC-signed with `SESSION_SECRET`.
- **One origin.** `server/index.js` serves the app (`index.html`, `css/`, `js/`) and the API together.
  Nothing else in the repo is served.

## Tests

```bash
cd server && npm test        # plan resolution + token signing (no Stripe account needed)
node server/index.js         # in one terminal
BASE=http://localhost:4242 npm test   # in another: every tool with test.pdf, fails on console errors
```

## Stripe setup

1. Create a product **Pagemint Pro** with three prices: $9 monthly (recurring), $72 yearly (recurring),
   $5 one-time (the 7-day pass).
2. Put the three `price_...` IDs in `STRIPE_PRICE_PRO_MONTHLY`, `_YEARLY` and `_WEEKLY`.
3. Enable the **Customer Portal** (Settings -> Billing -> Customer portal) so "Manage billing" works.
4. Optional webhook for instant cancellations: endpoint `https://<your-app>/api/webhook` with
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
   then set `STRIPE_WEBHOOK_SECRET`. Without it, changes still show up within a minute.

Teams are sold by email for now: seat management is not built, so there is no Team checkout.

## Deploy on Render

1. Render -> New -> Blueprint -> pick this repository. `render.yaml` creates one free web service.
2. Fill in the secret values it asks for (Stripe keys and prices, Resend, Anthropic).
   `SESSION_SECRET` is generated for you.
3. Open `https://<service>.onrender.com/api/health` to check what is configured.

The free plan sleeps after 15 minutes without traffic; the first request after that takes about a minute.
To email sign-in links to customers, verify a domain in Resend and set `MAIL_FROM` to an address on it.

## Known limits

- Password protect / unlock is not included: pdf-lib cannot encrypt. Add `qpdf` WASM or a server job when you need it.
- Existing-text editing re-sets the line in Helvetica/Times/Courier, not the original embedded font.
- Compress "Medium" and "Strong" rasterise pages (text becomes an image). "Light" keeps text.
