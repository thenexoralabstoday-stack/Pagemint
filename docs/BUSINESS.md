# Pagemint — business plan: pricing, billing, growth

Research date: September 2026.

## 1. What the market charges

| Site | Free tier | Paid | Notes |
|---|---|---|---|
| iLovePDF | 18 tools, per-tool size caps (~100–200 MB), no daily count limit | Premium ~$9/mo, Business custom | 33% off yearly; strongest SEO in the category |
| Smallpdf | 2 tasks/day, 21 tools | Pro $15/mo monthly or $10/mo yearly; Teams $8–12/seat | 7-day trial that converts to paid; upsell on the download screen |
| Sejda | 3 tasks/day, 50 MB, 200 pages | Week pass $5 (one-time), $7.50/mo, $63/yr desktop+web | The **week pass** is the smartest thing in the market: people need a PDF tool once |
| PDF24 | Everything free, no limits | none | Funded by ads/desktop brand; proves the demand for "local processing" |
| pdfFiller | trial only | $8 / $12 / $15 per month, yearly billing; e-signature only on $15 tier | Monthly billing costs ~2.5x yearly |
| Adobe Acrobat Pro | trial | $23.99/mo (promo $11.99 first 6 months), $28.79/seat teams | The price ceiling; nobody competes head-on |

Takeaways:
- The category price is **$7–15 per month**, with yearly at roughly $6–10 per month.
- Free tiers gate on **daily task count** (Smallpdf, Sejda) or **file size** (iLovePDF). Both work; task count converts better because it hits users mid-flow.
- Nobody but PDF24 sells privacy. "Your file never leaves your device" is the differentiator to lead with, and it is also why our costs are near zero.

## 2. Pagemint pricing (implemented in `js/billing.js`)

| Plan | Price | Limits |
|---|---|---|
| Free | $0 | 3 tasks/day, 25 MB per file, 3 files per batch, no OCR/AI |
| Pro | $9/mo, or $72/yr ($6/mo) | unlimited tasks, 500 MB, 50-file batch, OCR, AI |
| Pro week pass | $5 one-time | 7 days of Pro, does not renew |
| Team | $7/seat/mo, $60/seat/yr, min 3 seats | Pro for everyone plus central billing, seats, shared signature templates |

Why these numbers:
- $9 sits under Smallpdf and level with iLovePDF while the product does more (real text edit, redaction, AI).
- Yearly at 33% off matches the category and pushes people to prepay.
- The week pass captures the biggest segment, one-off users, who would otherwise churn after one month or never pay. Sejda reports it as their most popular plan.
- Team seats at $7 undercut Smallpdf Teams; minimum 3 seats makes the average contract 2.3x a Pro user.

## 3. Billing models worth using (all supported by the server)

1. **Subscription** (Stripe Checkout, mode=subscription). Core revenue.
2. **One-time pass** (mode=payment). Zero-commitment upsell shown at the exact moment a free user hits the daily limit.
3. **Seat-based team plan** with adjustable quantity in Checkout.
4. **Usage add-ons** for the parts that cost you money: AI pages and OCR minutes. Start with a generous daily cap inside Pro (200 AI calls/day is in `.env`), then sell "AI booster packs" only if abuse shows up.
5. **Lifetime deal** for launch: $79 once, limited to the first 500 buyers. AppSumo-style launches routinely bring $20–50k and thousands of users for tools like this. Cheap for you because processing is client-side.
6. **Student/non-profit** 50% off via a Stripe promotion code, mentioned on the pricing page; costs nothing, earns goodwill and backlinks.
7. **Merchant of record**: if you sell worldwide and do not want to file VAT/sales tax yourself, use Paddle or Lemon Squeezy instead of Stripe. Same checkout flow, they take ~5% plus fees and handle tax.

Payment UX rules that lift conversion (copied from the winners):
- Show the paywall **after** the work is done, at download time, never at upload. The user has already invested.
- Always show yearly as "$6/mo billed $72/yr" next to monthly. Default toggle to yearly.
- One-click cancel via Stripe Customer Portal. Say so on the pricing page.
- Send a magic link, not a password form. The `Account` page does this already.

## 4. Unit economics

- Cost per free user: near zero (static hosting, CDN). AI is the only per-use cost: about $0.01–0.05 per question at Opus pricing for a 50-page document with prompt caching, which is why AI is Pro-only and capped.
- Industry conversion for freemium PDF tools: 1–3% of monthly actives. At 100k monthly users and 2% Pro at $7 average, that is about $14k MRR.
- Break-even: a Cloudflare Pages site plus one small API instance is under $30/month.

## 5. Growth plan

1. **One page per tool for SEO.** iLovePDF and Smallpdf rank because `/merge-pdf`, `/compress-pdf`, `/pdf-to-jpg` are separate, fast, indexable pages with the tool at the top and 300 words of help text below. Create these as static HTML that loads the same `js/app.js` and opens the tool. Target long-tail phrases first: "redact pdf online free", "edit pdf text without uploading".
2. **Privacy angle everywhere.** Title tag: "Edit PDF online without uploading". Reddit, Hacker News, privacy subreddits and IT admins will link to it.
3. **Chrome extension** that opens any PDF in Pagemint. Extensions rank in the Chrome Web Store, a second search engine.
4. **Programmatic pages**: "Convert X to PDF" for 50 formats, "PDF tools for teachers/lawyers/real estate" landing pages.
5. **Product Hunt + lifetime deal launch** in the same week.
6. **Affiliate program** at 30% recurring via Rewardful or Lemon Squeezy affiliates. Bloggers who write "best PDF editor" lists live on affiliate links.
7. **API tier later**: developers pay $29–99/mo for a merge/convert API. Requires server processing, so only after the consumer side pays for itself.

## 6. Roadmap (in order of revenue impact)

1. Per-tool SEO pages and sitemap.
2. Password protect / unlock via `qpdf` compiled to WASM (top-3 searched PDF task, still missing).
3. Fill forms tool (pdf-lib supports AcroForms; UI only).
4. Word/Excel/PowerPoint conversion via a server worker with LibreOffice; this is the single most requested paid feature on every competitor.
5. Cloud storage integrations (Google Drive, Dropbox pickers).
6. Team features: shared templates, audit log, SSO.

## 7. Legal and trust checklist before charging

- Privacy policy that states files are processed locally and AI text is not retained.
- Terms with refund policy (14 days on yearly).
- Cookie banner only if you add analytics that need it; prefer Plausible or Fathom (no banner).
- Stripe tax settings or a merchant of record.
- Company details in the footer; EU customers expect an imprint.
