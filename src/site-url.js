// Watair's authoritative production hostname. Do not derive public-facing URLs
// from arbitrary Host headers or a stale BASE_URL in the Docker environment.
const CANONICAL_SITE_URL = 'https://watairuk.co.uk';

function isPreview() {
  return /^(1|true|yes|on)$/i.test(String(process.env.SITE_NOINDEX || '').trim());
}

function publicSiteOrigin() {
  if (process.env.NODE_ENV === 'production' && !isPreview()) {
    return CANONICAL_SITE_URL;
  }
  return String(process.env.BASE_URL || CANONICAL_SITE_URL).replace(/\/+$/, '');
}

module.exports = { CANONICAL_SITE_URL, publicSiteOrigin, isPreview };
