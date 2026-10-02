# WatAir Next

A clean-room rebuild of the WatAir UK website: modern public site, structured product catalogue, SEO continuity, contact lead capture and a lightweight owner-friendly CMS.

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
- `/leasing`
- `/privacy`
- `/contact`
- `/sitemap.xml`
- `/robots.txt`
- `/.well-known/security.txt`
- `/health`

Legacy WatAir paths are redirected with HTTP 301s to preserve search continuity during migration.

## Deployment

```bash
cp .env.example .env
# Edit .env with the production URL, secrets and SMTP details.

docker compose up -d --build
docker compose ps
curl http://127.0.0.1:${HOST_PORT:-8093}/health
```

The application binds to `127.0.0.1` on the host and is intended to sit behind Plesk/nginx, which terminates HTTPS.

Before launch, `BASE_URL` must be the final canonical HTTPS domain because it drives canonical tags, Open Graph metadata, JSON-LD and the sitemap.

## Persistent data

Docker persists:

- `./data` — SQLite database
- `./public/uploads` — CMS-uploaded media and imported owner-approved legacy media

Back these up together. Do not treat the Docker image itself as the backup.

## CMS

The first administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on first boot. Additional administrators are managed inside the CMS.

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
- SEO titles and descriptions
- production-readiness checks on the dashboard

## Contact enquiries

Every successful contact submission is stored in SQLite. If SMTP is configured, a notification is also sent to `CONTACT_TO`. A temporary SMTP failure therefore does not discard the enquiry.

The privacy notice describes the information retained by the website. The public site does not currently use non-essential analytics or advertising cookies.

## Release checks

Before DNS cutover:

1. Set `BASE_URL=https://watair.co.uk`.
2. Set a unique `SESSION_SECRET` of at least 32 characters.
3. Confirm the real administrator accounts and remove unused access.
4. Configure SMTP and send a real contact-form test.
5. Review every published product image and technical specification against the approved source material.
6. Review the editable Privacy Notice with the site owner and update it if their internal retention/privacy process requires different wording.
7. Confirm the CMS dashboard launch checks are green.
8. Verify Plesk/nginx HTTPS and reverse proxy to the configured `HOST_PORT`.
9. Test the home page, both range pages, several products, PDF downloads, FAQs, contact form, privacy page, sitemap and robots file.
10. Test important legacy URLs and confirm they return 301 redirects.
11. Back up both `data/` and `public/uploads/` immediately before DNS changes.
12. Keep the legacy hosting/database backup available during the cutover window.

## Post-launch

- watch Docker/Plesk logs for errors
- confirm real enquiries arrive both in the CMS and by email
- submit the sitemap in the relevant search-console account
- monitor 404s and add redirects for any legacy URLs discovered after launch
- take regular backups of the SQLite database and uploaded media
