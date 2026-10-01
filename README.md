# WatAir Next

A clean-room rebuild of the WatAir UK website: modern public site, product catalogue, SEO continuity, contact lead capture and a lightweight CMS. The visual direction is deliberately more editorial and premium than the legacy site, while retaining WatAir's existing information architecture and product range.

## Stack

- Node.js 22 + Express
- EJS server-rendered pages for strong SEO and fast first paint
- SQLite (WAL mode) for content, catalogue, settings and leads
- Lightweight password-protected CMS
- Docker-first deployment, suitable for Linux Plesk + nginx reverse proxy

## Main routes

- `/`
- `/products`
- `/products/home-office`
- `/products/commercial-industrial`
- `/products/:slug`
- `/how-it-works`
- `/faqs`
- `/environment/plastic-bottles`
- `/environment/mains-water`
- `/about`
- `/resellers`
- `/leasing`
- `/contact`
- `/admin`

Legacy WatAir paths are redirected with HTTP 301s to preserve search equity during migration.

## Local / staging deployment

```bash
cp .env.example .env
# Edit .env and set secure SESSION_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD

docker compose up -d --build
curl http://127.0.0.1:8093/health
```

The default host binding is `127.0.0.1:8093` so the application is intended to sit behind Plesk/nginx rather than expose Node directly.

## Plesk reverse proxy

Point the selected domain/subdomain to:

```text
http://127.0.0.1:8093
```

Let Plesk/nginx terminate HTTPS. Set `BASE_URL` to the final canonical HTTPS URL before launch.

## Persistent data

Docker persists:

- `./data` — SQLite database
- `./public/uploads` — CMS-uploaded media

Back both up together.

## CMS

The initial administrator is created on the first boot from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. In production there is deliberately no hard-coded fallback password.

CMS functions currently include:

- edit editorial pages and SEO metadata
- edit product content/specifications/visibility/order
- edit site-wide contact and hero settings
- view and mark contact enquiries
- image-upload endpoint ready for richer media controls

## Content migration notes

The first-pass seed content is based on the public WatAir site as it existed in October 2026. Product specifications are structured in the database so they can be corrected without code changes.

The homepage temporarily references the legacy site's group product image. Before production cutover, migrate approved WatAir-owned imagery into `/public/uploads` (or the repository) and update the hero image in CMS. Do not rely on the old host after DNS cutover.

## Production checklist

1. Import/approve original WatAir images and logo assets.
2. Verify every product specification against the customer's source material.
3. Configure SMTP and test contact notifications.
4. Set strong production secrets.
5. Add Plesk/nginx reverse proxy and SSL.
6. Test all old `.aspx` and current URLs for correct 301 redirects.
7. Crawl staging for 404s, titles, canonicals and sitemap coverage.
8. Back up the legacy site and database before DNS change.
9. Change DNS only after customer sign-off.
10. Monitor logs and enquiries after launch.
