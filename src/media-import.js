const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');

const LEGACY_ORIGIN = 'https://www.watairuk.co.uk';
const ALLOWED_HOSTS = new Set(['watairuk.co.uk', 'www.watairuk.co.uk']);
const ROOT_DIR = path.join(__dirname, '..', 'public', 'uploads', 'imported', 'legacy');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');

const PAGE_LIMIT = 220;
const ASSET_LIMIT = 750;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 600 * 1024 * 1024;

const ASSET_EXTENSIONS = new Set([
  '.jpg','.jpeg','.png','.gif','.webp','.svg','.avif','.bmp','.ico',
  '.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.zip'
]);

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  pagesScanned: 0,
  assetsFound: 0,
  assetsImported: 0,
  bytesImported: 0,
  skipped: 0,
  errors: [],
  current: '',
  message: 'Ready'
};

function publicUrlFor(localPath) {
  return '/' + path.relative(path.join(__dirname, '..', 'public'), localPath).split(path.sep).join('/');
}

function ensureRoot() {
  fs.mkdirSync(ROOT_DIR, { recursive: true });
}

function resetState() {
  Object.assign(state, {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    pagesScanned: 0,
    assetsFound: 0,
    assetsImported: 0,
    bytesImported: 0,
    skipped: 0,
    errors: [],
    current: '',
    message: 'Starting import…'
  });
}

function snapshot() {
  return { ...state, errors: [...state.errors] };
}

function normaliseLegacyUrl(value, base = LEGACY_ORIGIN) {
  if (!value) return null;
  const clean = String(value).trim().replace(/^['"]|['"]$/g, '');
  if (!clean || clean.startsWith('data:') || clean.startsWith('javascript:') || clean.startsWith('#')) return null;
  try {
    const url = new URL(clean, base);
    if (!['http:','https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function isAllowedPageUrl(url) {
  return url && ALLOWED_HOSTS.has(url.hostname.toLowerCase()) && !ASSET_EXTENSIONS.has(path.extname(url.pathname).toLowerCase());
}

function isLikelyAssetUrl(url) {
  if (!url || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return false;
  const ext = path.extname(url.pathname).toLowerCase();
  if (ASSET_EXTENSIONS.has(ext)) return true;
  return /\/(media|images?|uploads?|content|assets)\//i.test(url.pathname);
}

function stripHash(url) {
  const next = new URL(url.toString());
  next.hash = '';
  return next;
}

function urlKey(url) {
  const next = stripHash(url);
  return next.toString();
}

function safeRelativePath(url, contentType = '') {
  let pathname = decodeURIComponent(url.pathname || '/').replace(/\\/g, '/');
  pathname = pathname.replace(/^\/+/, '').replace(/\.\.(\/|\\)/g, '');
  if (!pathname || pathname.endsWith('/')) pathname += 'index';

  let ext = path.extname(pathname);
  if (!ext) {
    const type = String(contentType).split(';')[0].trim().toLowerCase();
    const byType = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/avif': '.avif',
      'application/pdf': '.pdf'
    };
    ext = byType[type] || '.bin';
    pathname += ext;
  }

  const parts = pathname.split('/').filter(Boolean).map(part =>
    part.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
  );

  if (url.search) {
    const last = parts.pop();
    const currentExt = path.extname(last);
    const base = last.slice(0, currentExt ? -currentExt.length : undefined);
    const q = crypto.createHash('sha1').update(url.search).digest('hex').slice(0, 8);
    parts.push(`${base}-${q}${currentExt || ext}`);
  }

  return parts.join('/');
}

function extractCssUrls(css, baseUrl) {
  const urls = [];
  const re = /url\(([^)]+)\)/gi;
  let match;
  while ((match = re.exec(css))) {
    const url = normaliseLegacyUrl(match[1].trim(), baseUrl);
    if (url && isLikelyAssetUrl(url)) urls.push(url);
  }
  return urls;
}

function extractSrcset(value, baseUrl) {
  return String(value || '')
    .split(',')
    .map(part => part.trim().split(/\s+/)[0])
    .map(v => normaliseLegacyUrl(v, baseUrl))
    .filter(url => url && isLikelyAssetUrl(url));
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return { generated_at: null, source: LEGACY_ORIGIN, pages: [], assets: [], skipped_external: [] };
  }
}

function getMediaSummary() {
  const manifest = loadManifest();
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const images = assets.filter(a => String(a.content_type || '').startsWith('image/'));
  const documents = assets.filter(a => !String(a.content_type || '').startsWith('image/'));
  return {
    generatedAt: manifest.generated_at || null,
    count: assets.length,
    images: images.length,
    documents: documents.length,
    bytes: assets.reduce((n,a) => n + Number(a.bytes || 0), 0),
    assets
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...options,
      headers: {
        'user-agent': 'WatAir-owner-authorised-media-migration/1.0',
        'accept': options.accept || '*/*',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function discoverSitemapPages(queue, seenPages) {
  try {
    const res = await fetchWithTimeout(new URL('/sitemap.xml', LEGACY_ORIGIN), {}, 12000);
    if (!res.ok) return;
    const body = await res.text();
    const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
    let match;
    while ((match = re.exec(body))) {
      const url = normaliseLegacyUrl(match[1], LEGACY_ORIGIN);
      if (!url || !isAllowedPageUrl(url)) continue;
      const key = urlKey(url);
      if (!seenPages.has(key)) queue.push(url);
    }
  } catch (err) {
    state.errors.push(`Sitemap: ${err.message}`);
  }
}

async function importAsset(url, discoveredFrom, manifestAssets, importedBySource) {
  const sourceKey = urlKey(url);
  if (importedBySource.has(sourceKey) || manifestAssets.length >= ASSET_LIMIT) return;
  importedBySource.add(sourceKey);
  state.assetsFound = importedBySource.size;
  state.current = sourceKey;

  try {
    const res = await fetchWithTimeout(url, { headers: { accept: 'image/*,application/pdf,application/octet-stream;q=0.7,*/*;q=0.2' } }, 25000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const finalUrl = new URL(res.url);
    if (!ALLOWED_HOSTS.has(finalUrl.hostname.toLowerCase())) {
      state.skipped++;
      return;
    }

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_ASSET_BYTES) {
      state.skipped++;
      return;
    }
    if (state.bytesImported + contentLength > MAX_TOTAL_BYTES) {
      state.skipped++;
      return;
    }

    const contentType = res.headers.get('content-type') || '';
    if (/^text\/html/i.test(contentType)) {
      state.skipped++;
      return;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_ASSET_BYTES || state.bytesImported + buffer.length > MAX_TOTAL_BYTES) {
      state.skipped++;
      return;
    }

    const rel = safeRelativePath(url, contentType);
    const localPath = path.join(ROOT_DIR, rel);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    let changed = true;
    if (fs.existsSync(localPath)) {
      const existing = fs.readFileSync(localPath);
      changed = crypto.createHash('sha256').update(existing).digest('hex') !== sha256;
    }
    if (changed) fs.writeFileSync(localPath, buffer);

    manifestAssets.push({
      source_url: sourceKey,
      final_url: finalUrl.toString(),
      local_path: path.relative(path.join(__dirname, '..'), localPath).split(path.sep).join('/'),
      public_url: publicUrlFor(localPath),
      content_type: contentType.split(';')[0],
      bytes: buffer.length,
      sha256,
      discovered_from: discoveredFrom
    });

    state.assetsImported = manifestAssets.length;
    state.bytesImported += buffer.length;
  } catch (err) {
    state.errors.push(`${sourceKey}: ${err.message}`);
    if (state.errors.length > 80) state.errors = state.errors.slice(-80);
  }
}

async function startLegacyMediaImport() {
  if (state.running) return snapshot();
  resetState();
  ensureRoot();

  (async () => {
    const queue = [new URL('/', LEGACY_ORIGIN)];
    const seenPages = new Set();
    const queuedPages = new Set([urlKey(queue[0])]);
    const discoveredAssets = new Map();
    const cssQueue = new Map();
    const skippedExternal = new Set();

    try {
      await discoverSitemapPages(queue, seenPages);
      queue.forEach(u => queuedPages.add(urlKey(u)));

      while (queue.length && seenPages.size < PAGE_LIMIT) {
        const pageUrl = queue.shift();
        const key = urlKey(pageUrl);
        if (seenPages.has(key)) continue;
        seenPages.add(key);

        state.pagesScanned = seenPages.size;
        state.current = key;
        state.message = `Scanning page ${state.pagesScanned}…`;

        try {
          const res = await fetchWithTimeout(pageUrl, { headers: { accept: 'text/html,application/xhtml+xml' } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const finalPage = new URL(res.url);
          if (!ALLOWED_HOSTS.has(finalPage.hostname.toLowerCase())) continue;

          const html = await res.text();
          const $ = cheerio.load(html);

          $('img[src],source[src]').each((_, el) => {
            const url = normaliseLegacyUrl($(el).attr('src'), finalPage);
            if (url && isLikelyAssetUrl(url)) discoveredAssets.set(urlKey(url), { url, from: key });
          });

          $('img[srcset],source[srcset]').each((_, el) => {
            extractSrcset($(el).attr('srcset'), finalPage).forEach(url => discoveredAssets.set(urlKey(url), { url, from: key }));
          });

          $('[style]').each((_, el) => {
            extractCssUrls($(el).attr('style'), finalPage).forEach(url => discoveredAssets.set(urlKey(url), { url, from: key }));
          });

          $('meta[property="og:image"],meta[name="twitter:image"]').each((_, el) => {
            const url = normaliseLegacyUrl($(el).attr('content'), finalPage);
            if (url && isLikelyAssetUrl(url)) discoveredAssets.set(urlKey(url), { url, from: key });
          });

          $('link[rel="stylesheet"][href]').each((_, el) => {
            const url = normaliseLegacyUrl($(el).attr('href'), finalPage);
            if (url && ALLOWED_HOSTS.has(url.hostname.toLowerCase())) cssQueue.set(urlKey(url), url);
          });

          $('a[href]').each((_, el) => {
            const url = normaliseLegacyUrl($(el).attr('href'), finalPage);
            if (!url) return;

            if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
              if (/\.(jpe?g|png|gif|webp|svg|avif|pdf)(\?|$)/i.test(url.pathname)) skippedExternal.add(url.toString());
              return;
            }

            if (isLikelyAssetUrl(url)) {
              discoveredAssets.set(urlKey(url), { url, from: key });
              return;
            }

            if (isAllowedPageUrl(url)) {
              url.search = '';
              url.hash = '';
              const pageKey = urlKey(url);
              if (!seenPages.has(pageKey) && !queuedPages.has(pageKey) && queuedPages.size < PAGE_LIMIT * 2) {
                queue.push(url);
                queuedPages.add(pageKey);
              }
            }
          });

          if (discoveredAssets.size >= ASSET_LIMIT) break;
        } catch (err) {
          state.errors.push(`${key}: ${err.message}`);
          if (state.errors.length > 80) state.errors = state.errors.slice(-80);
        }
      }

      state.message = 'Scanning stylesheets for background media…';
      for (const cssUrl of [...cssQueue.values()].slice(0, 80)) {
        try {
          const res = await fetchWithTimeout(cssUrl, { headers: { accept: 'text/css' } }, 12000);
          if (!res.ok) continue;
          const css = await res.text();
          extractCssUrls(css, cssUrl).forEach(url => discoveredAssets.set(urlKey(url), { url, from: cssUrl.toString() }));
        } catch {
          // A stylesheet failure should not fail the import.
        }
      }

      const assets = [];
      const importedBySource = new Set();
      state.message = `Importing ${Math.min(discoveredAssets.size, ASSET_LIMIT)} discovered assets…`;

      for (const item of [...discoveredAssets.values()].slice(0, ASSET_LIMIT)) {
        await importAsset(item.url, item.from, assets, importedBySource);
      }

      const manifest = {
        generated_at: new Date().toISOString(),
        source: LEGACY_ORIGIN,
        limits: {
          pages: PAGE_LIMIT,
          assets: ASSET_LIMIT,
          max_asset_bytes: MAX_ASSET_BYTES,
          max_total_bytes: MAX_TOTAL_BYTES
        },
        pages: [...seenPages],
        assets: assets.sort((a,b) => a.local_path.localeCompare(b.local_path)),
        skipped_external: [...skippedExternal].sort(),
        errors: [...state.errors]
      };

      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

      state.message = `Complete — ${assets.length} assets imported from ${seenPages.size} pages.`;
      state.finishedAt = new Date().toISOString();
      state.running = false;
      state.current = '';
    } catch (err) {
      state.errors.push(err.message);
      state.message = `Import failed: ${err.message}`;
      state.finishedAt = new Date().toISOString();
      state.running = false;
      state.current = '';
    }
  })();

  return snapshot();
}

function localAssetForLegacyUrl(sourceUrl, manifest = loadManifest()) {
  try {
    const source = new URL(sourceUrl);
    const pathname = source.pathname;
    const match = (manifest.assets || []).find(asset => {
      try {
        return new URL(asset.source_url).pathname === pathname;
      } catch {
        return false;
      }
    });
    return match?.public_url || null;
  } catch {
    return null;
  }
}

module.exports = {
  LEGACY_ORIGIN,
  startLegacyMediaImport,
  getMediaImportState: snapshot,
  getMediaSummary,
  loadManifest,
  localAssetForLegacyUrl
};
