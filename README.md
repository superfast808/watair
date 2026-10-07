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

Before launch, `BASE_URL` must be the final canonical HTTPS domain. Requests made on that live hostname use it for canonical tags, Open Graph metadata, JSON-LD and the sitemap. Requests made on a different test/staging hostname self-reference that hostname instead and are marked noindex, so sharing a preview link does not advertise or redirect users toward the production domain.

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
