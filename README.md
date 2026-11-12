# WatAir Next

A clean-room rebuild of the WatAir UK website: modern public site, structured 20–10,000 litre/day product catalogue, SEO continuity, contact lead capture and a lightweight owner-friendly CMS.

## Stack

- Node.js 22 + Express
- EJS server-rendered pages
- SQLite in WAL mode
- Password-protected CMS with multiple admin users
- Docker deployment behind Plesk/nginx
- Generated PDF product datasheets
- Local owner-approved media library

## Main public routes

- `/`
- `/products`
- `/products/home-office`
- `/products/commercial-industrial`
- `/products/:slug`
- `/products/:slug/datasheet.pdf`
- `/how-it-works`
- `/faqs`
- `/environment/plastic-bottles`
- `/environment/mains-water`
- `/about`
- `/resellers`
- `/privacy`
- `/terms`
- `/refunds`
- `/cookies`
- `/contact`
- `/buy/:slug` for opted-in sellable products
- `/order/:publicId` for customer order status
- `/sitemap.xml`
- `/robots.txt`
- `/.well-known/security.txt`
- `/health`

Legacy WatAir paths are redirected with HTTP 301s to preserve search continuity during migration.

## Deployment

```bash
cp .env.example .env
# Edit .env with the production URL, administrator details and SMTP settings.
# Generate SESSION_SECRET with something like: openssl rand -hex 32

docker compose up -d --build
docker compose ps
curl http://127.0.0.1:${HOST_PORT:-8093}/health
```

The application binds to `127.0.0.1` on the host and is intended to sit behind Plesk/nginx, which terminates HTTPS.

Before launch, `BASE_URL` must be the final canonical HTTPS domain. On the live site, canonical tags, Open Graph metadata, JSON-LD and the sitemap use this configured domain regardless of internal Host headers passed through by Plesk/nginx. The public robots file allows public crawling, avoiding accidental site-wide blocking when the proxy rewrites a hostname.

For a test/staging deployment, explicitly set **`SITE_NOINDEX=1`** in its `.env` (leave `0` on the live site). This emits `noindex` in both HTML and the `X-Robots-Tag` response header, suppresses its sitemap, and uses the preview hostname in canonical tags. The preview robots file allows crawling so engines can read the noindex. Protect genuinely private staging with authentication rather than robots.txt alone.

## Persistent data

Docker persists:

- `./data` — SQLite database
- `./public/uploads` — CMS-uploaded media and imported owner-approved legacy media

Back these up together. Do not treat the Docker image itself as the backup.

## CMS

The first administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on first boot. Production startup deliberately refuses missing/example first-admin credentials or a weak initial password. Additional administrators are managed inside the CMS.

CMS features include:

- page editing with a visual content editor
- page hero image selection
- product create/edit/publish workflows
- row-based technical specification editing
- product and page media picker
- media upload/library management
- enquiry inbox with read/delete controls
- multiple administrator accounts and password resets
- homepage/global settings
- SMTP mail configuration and test delivery from Site settings
- primary navigation management: rename, hide, reorder and add custom links/CTAs
- editable About-page overseas project showcase with three media slots and captions
- water-quality, hygiene and maintenance guidance linked from products, checkout and legal terms
- SEO titles and descriptions
- production-readiness checks on the dashboard
- per-product sellable/price/delivery-class controls
- commerce settings, payment-provider status and delivery-rule management
- ecommerce order inbox and fulfilment-status controls

## E-commerce

E-commerce is deliberately disabled by default. Existing products also default to non-sellable, so deploying a commerce-capable release cannot expose prices or payment buttons until an administrator opts in.

The checkout supports:

- Stripe hosted Checkout for card payments
- PayPal Checkout through the PayPal Orders API
- manual payment/invoice orders
- delivery pricing rules by product delivery class, country and optional postcode prefixes
- configurable maximum quantity per product
- stored order/customer/delivery snapshots in SQLite
- Stripe webhook verification and PayPal server-side capture verification
- customer/admin order email notifications when SMTP is configured
- editable Terms of sale, Refunds & returns, Privacy and Cookie notices
- a cookie/preference control ready for future optional analytics or marketing integrations

Payment credentials stay in the server environment rather than SQLite. Configure the relevant values from `.env.example`, then enable the provider under **CMS → Commerce**. Stripe is only exposed to customers when both its secret key and webhook secret are present, so payment confirmation cannot accidentally run without webhook verification. Full payment-card details are not handled or stored by the WatAir application.

Product prices are currently treated as the final customer-facing product amount. The application does not separately calculate VAT/sales tax; agree the intended tax treatment before enabling live sales.

For Stripe, configure the live webhook endpoint as:

`POST https://watairuk.co.uk/payments/stripe/webhook`

and subscribe at minimum to Checkout Session completion/expiry and asynchronous payment success/failure events.

PayPal uses sandbox unless `PAYPAL_ENV=live`.

## Contact enquiries

Contact submissions use layered anti-spam protection: rate limiting, two honeypot fields, a signed time-limited browser token, conservative junk-pattern scoring, 30-minute duplicate suppression and optional Cloudflare Turnstile verification.

For production Turnstile protection, create a **Managed** widget in Cloudflare, add the production/staging hostnames to that widget, then configure:

```env
TURNSTILE_SITE_KEY=your-public-site-key
TURNSTILE_SECRET_KEY=your-private-secret-key
TURNSTILE_EXPECTED_HOSTNAME=watairuk.co.uk
```

The site key is intentionally sent to the browser; the secret key is used only by the server-side Siteverify call. If both keys are absent, the existing layered anti-spam controls remain active and the CMS launch checklist reports Turnstile as incomplete. If only one key is supplied, contact submissions fail closed until the configuration is corrected.

Every successful contact submission is stored in SQLite. SMTP can be configured under **CMS → Site settings → Email delivery**; the `.env` SMTP values remain the fallback until CMS mail settings are saved. A temporary SMTP failure therefore does not discard the enquiry. The SMTP password is kept outside normal site settings, encrypted at rest using `SESSION_SECRET`, and is never displayed back in the CMS. If `SESSION_SECRET` is intentionally changed, re-enter the CMS SMTP password afterwards.

The privacy notice describes enquiry and order information retained by the website, including the Turnstile security service. The cookie-preference control keeps optional analytics and marketing categories off unless the visitor opts in; no optional analytics or advertising integration is currently loaded by the application itself.

## Release checks

Before DNS cutover:

1. Set `BASE_URL=https://watairuk.co.uk`.
2. Set a unique `SESSION_SECRET` of at least 32 characters and confirm production starts without configuration warnings.
3. Set `TRUST_PROXY=1` when Plesk/nginx is the single reverse proxy so rate limiting sees the real client IP.
4. Confirm the real administrator accounts and remove unused access.
5. Configure SMTP under **CMS → Site settings → Email delivery**, use **Save & send test email**, then submit a real contact-form test.
6. Review every published product image and technical specification against the approved source material.
7. Review the editable Terms of sale, Refunds & returns, Privacy and Cookie notices against the final business process.
8. If e-commerce will be enabled, configure at least one payment provider, create delivery rules, opt specific products into online sales and complete a low-value live payment/refund test.
9. Confirm the CMS dashboard launch checks are green.
10. Verify Plesk/nginx HTTPS and reverse proxy to the configured `HOST_PORT`.
11. Test the home page, both range pages, several products, PDF downloads, FAQs, contact form, privacy page, sitemap and robots file.
12. Test important legacy URLs and confirm they return 301 redirects.
13. Back up both `data/` and `public/uploads/` immediately before DNS changes.
14. Keep the legacy hosting/database backup available during the cutover window.

## Post-launch

- watch Docker/Plesk logs for errors
- confirm real enquiries arrive both in the CMS and by email
- submit the sitemap in the relevant search-console account
- monitor 404s and add redirects for any legacy URLs discovered after launch
- take regular backups of the SQLite database and uploaded media

## Editorial Studio, news and daily social publishing

Navigate to **CMS → Editorial Studio** at /admin/editorial. The journal is at /news (RSS: /news/feed.xml). The first install seeds three original, factual evergreen articles about atmospheric water generation, humidity and system selection; the administrator can update or unpublish them. Published articles are included in /sitemap.xml and emit Article JSON-LD plus canonical and Open Graph metadata.

This is a first-party content calendar connected to Buffer, using the same website-first approach as the KJIHC publishing setup:

1. Connect the WatAir accounts to Buffer, then paste the personal API key under Editorial Studio → API configuration (or set BUFFER_API_KEY in the server environment).
2. Paste an OpenAI API key (or set OPENAI_API_KEY). GPT-5.4 mini is the fixed model; keys are AES-256-GCM encrypted inside the existing app_secrets table when saved in the CMS. Rotate SESSION_SECRET only with an associated key re-entry.
3. Click **Sync connected Buffer channels**, choose the default destination channels (Facebook, Instagram, LinkedIn and any others connected to this Buffer account), and save. Only checked channels are eligible for automatic publishing.
4. Use the AI writing desk to generate social posts or educational article drafts. Generated articles remain drafts until manually published. Social posts can be revised, assigned an image from the CMS media library or products, linked to an article/product URL, saved as drafts, scheduled for a date or published immediately.
5. **Daily autopilot is disabled by default.** Enable it after credentials and channels are ready. It creates one varied post every Europe/London calendar day at the selected time; draws facts from the published articles, product catalogue and existing guidance; and submits it to each selected channel. Publication happens through Buffer, whose status should be monitored there.
6. The built-in worker wakes every minute and catches due content after a normal server restart. Each channel has its own persisted delivery record and Buffer remote ID. Uncertain network outcomes are marked needs_review and are not retried automatically, preventing duplicate publishing.

Important: a personal Buffer API key reaches the channels in the connected Buffer account, so select the WatAir channels deliberately. A new channel is never selected for the daily automation until an administrator enables it. Buffer image publishing requires the image URL to be publicly accessible from outside the server; /public/uploads is backed by the existing persistent volume.

Platform-specific notes: Facebook and Instagram use required platform post-type metadata, Facebook/LinkedIn and supported networks can use a page link preview when there is no separate image, and Instagram uses its image plus link metadata. Instagram captions do not provide clickable links for normal feed posts. Some other networks (especially Pinterest and YouTube) need board/video options and are flagged for manual attention rather than submitting an invalid generic post.

Daily automation and schedules require the WatAir Node process running; do not enable a second independent scheduler using the same database. No service posts until keys, channels and the automatic publishing switch are explicitly configured.
