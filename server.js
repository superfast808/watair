require('dotenv/config');
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const sanitizeHtml = require('sanitize-html');
const multer = require('multer');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { db, settingsObject } = require('./src/db');
const { faqs } = require('./src/content');
const { signAdmin, readAdmin, requireAdmin, csrfFor, requireCsrf } = require('./src/auth');
const { startLegacyMediaImport, getMediaImportState, getMediaSummary, loadManifest, localAssetForLegacyUrl } = require('./src/media-import');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const isProd = process.env.NODE_ENV === 'production';
const baseUrl = (process.env.BASE_URL || 'http://localhost:' + PORT).replace(/\/$/, '');

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://www.watairuk.co.uk'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  strictTransportSecurity: isProd ? { maxAge: 15552000, includeSubDomains: false, preload: false } : false
}));
app.use(compression());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProd ? '7d' : 0,
  immutable: false
}));

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (req.path.startsWith('/admin')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.use((req, res, next) => {
  res.locals.settings = settingsObject();
  res.locals.path = req.path;
  res.locals.baseUrl = baseUrl;
  res.locals.admin = readAdmin(req);
  res.locals.currentYear = new Date().getFullYear();
  next();
});

const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

function parseProduct(row) {
  if (!row) return null;
  return { ...row, specs: JSON.parse(row.specs_json || '{}') };
}
function products(where = 'published=1', args = []) {
  return db.prepare(`SELECT * FROM products WHERE ${where} ORDER BY sort_order, capacity_lpd, id`).all(...args).map(parseProduct);
}

function productsForCategory(category) {
  let rows = products('published=1 AND LOWER(TRIM(category))=?', [category]);

  // Defensive fallback for older/editable databases where a category value
  // may have been altered but the capacity still makes the intended range clear.
  if (!rows.length && category === 'home-office') {
    rows = products('published=1 AND capacity_lpd < 80');
  }
  if (!rows.length && category === 'commercial-industrial') {
    rows = products('published=1 AND capacity_lpd >= 80');
  }

  return rows;
}
function getPage(slug) {
  return db.prepare('SELECT * FROM pages WHERE slug=? AND published=1').get(slug);
}
function renderPage(res, page, extra = {}) {
  if (!page) return res.status(404).render('404', { meta: { title: 'Page not found | WatAir UK', noindex: true } });
  const pageImages = {
    'how-it-works': '/uploads/imported/legacy/images/how-it-works/hydrologic-cycle.svg',
    'about': '/uploads/imported/legacy/media/1023/about-us-banner.jpg',
    'plastic-bottles': '/uploads/imported/legacy/media/1026/our-environment-banner.jpg',
    'mains-water': '/uploads/imported/legacy/media/1024/mains-water-banner.jpg',
    'resellers': '/uploads/imported/legacy/media/1027/contact-banner.jpg',
    'leasing': '/uploads/imported/legacy/media/1040/25l-1x.png'
  };
  return res.render('page', {
    page,
    meta: {
      title: page.seo_title || `${page.title} | WatAir UK`,
      description: page.seo_description || page.intro,
      image: page.hero_image || pageImages[page.slug] || '/uploads/imported/legacy/images/home/products.jpg'
    },
    ...extra
  });
}

app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1 AS ok').get();
    res.json({ ok: true, service: 'watair-next' });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ ok: false, service: 'watair-next' });
  }
});

app.get('/', (req, res) => {
  const featured = products('published=1 AND featured=1');
  const allProducts = products();
  res.render('home', {
    featured,
    allProducts,
    meta: {
      title: 'WatAir UK | Atmospheric Water Generators',
      description: 'Atmospheric Water Generation systems for homes, offices and industrial applications across the UK.',
      image: '/uploads/imported/legacy/images/home/products.jpg'
    }
  });
});

app.get('/products', (req, res) => res.render('products', {
  products: products(), category: 'all',
  meta: { title: 'Atmospheric Water Generators | WatAir UK', description: 'Explore WatAir atmospheric water generators from compact home and office systems to 10,000 litre-per-day industrial units.', image: '/uploads/imported/legacy/images/home/products.jpg' }
}));
app.get('/products/home-office', (req, res) => res.render('products', {
  products: productsForCategory('home-office'), category: 'home-office',
  meta: { title: 'Home & Office Atmospheric Water Generators | WatAir UK', description: 'Compact water-from-air systems for homes and workplaces.', image: '/uploads/imported/legacy/media/1003/pw-hr-30l.png' }
}));
app.get('/products/commercial-industrial', (req, res) => res.render('products', {
  products: productsForCategory('commercial-industrial'), category: 'commercial-industrial',
  meta: { title: 'Commercial & Industrial Atmospheric Water Generators | WatAir UK', description: 'Commercial and industrial water-from-air systems from 80 to 10,000 litres per day.', image: '/uploads/imported/legacy/media/1010/pw-hr-5000l.png' }
}));
app.get('/products/:slug/datasheet.pdf', (req, res) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE slug=? AND published=1').get(req.params.slug));
  if (!product) return res.status(404).send('Product not found');

  const categoryLabel = product.category === 'home-office' ? 'Home & Office' : 'Commercial & Industrial';
  const filename = `watair-${product.slug}-datasheet.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 48, info: {
    Title: `${product.name} WatAir Technical Datasheet`,
    Author: 'WatAir UK',
    Subject: 'Atmospheric Water Generator technical datasheet'
  }});
  doc.pipe(res);

  const navy = '#062632';
  const aqua = '#23c4dc';
  const muted = '#607981';
  const pageWidth = doc.page.width;

  doc.rect(0, 0, pageWidth, 126).fill(navy);
  doc.fillColor(aqua).fontSize(10).font('Helvetica-Bold').text('WATAIR UK · ATMOSPHERIC WATER GENERATION', 48, 38);
  doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text(product.name, 48, 57, { width: 360 });
  if (product.subtitle) doc.fillColor('#bfeaf0').fontSize(11).font('Helvetica').text(product.subtitle, 48, 91);
  doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text(String(product.capacity_lpd), 455, 55, { width: 90, align: 'right' });
  doc.fillColor('#9dc3cb').fontSize(9).font('Helvetica').text('LITRES / DAY', 455, 87, { width: 90, align: 'right' });

  doc.fillColor(navy).fontSize(9).font('Helvetica-Bold').text(categoryLabel.toUpperCase(), 48, 154);
  doc.fillColor(muted).fontSize(11).font('Helvetica').text(product.summary, 48, 174, { width: 500, lineGap: 3 });

  let y = Math.max(224, doc.y + 22);
  doc.fillColor(navy).fontSize(16).font('Helvetica-Bold').text('Technical specification', 48, y);
  y += 30;

  Object.entries(product.specs).forEach(([key, value], index) => {
    if (y > 720) {
      doc.addPage();
      y = 55;
    }
    if (index % 2 === 0) doc.rect(48, y - 6, 499, 27).fill('#f3f8f9');
    doc.fillColor(muted).fontSize(9.5).font('Helvetica').text(key, 58, y, { width: 205 });
    doc.fillColor(navy).fontSize(9.5).font('Helvetica-Bold').text(String(value), 270, y, { width: 265 });
    y += 27;
  });

  y += 22;
  if (y > 675) { doc.addPage(); y = 55; }
  doc.fillColor(navy).fontSize(14).font('Helvetica-Bold').text('Important performance note', 48, y);
  doc.fillColor(muted).fontSize(9.5).font('Helvetica').text(
    'Rated water production depends on ambient temperature and relative humidity. Actual site output may differ from the stated rating. Confirm site conditions, electrical requirements, storage and intended use with WatAir before final specification.',
    48, y + 23, { width: 499, lineGap: 2 }
  );

  const footerY = doc.page.height - 66;
  doc.moveTo(48, footerY - 12).lineTo(547, footerY - 12).strokeColor('#d5e3e6').stroke();
  doc.fillColor(navy).fontSize(9).font('Helvetica-Bold').text('WatAir UK', 48, footerY);
  doc.fillColor(muted).fontSize(8.5).font('Helvetica').text(
    `${settingsObject().email}  ·  ${settingsObject().phone}  ·  watair.co.uk`,
    48, footerY + 15
  );
  doc.fillColor('#829aa1').fontSize(7.5).text('Generated from the current published WatAir product specification.', 48, footerY + 30);

  doc.end();
});

app.get('/products/:slug', (req, res) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE slug=? AND published=1').get(req.params.slug));
  if (!product) return res.status(404).render('404', { meta: { title: 'Product not found | WatAir UK', noindex: true } });

  const family = products('published=1 AND category=?', [product.category]);
  const currentIndex = family.findIndex(p => p.id === product.id);
  const previousProduct = currentIndex > 0 ? family[currentIndex - 1] : null;
  const nextProduct = currentIndex >= 0 && currentIndex < family.length - 1 ? family[currentIndex + 1] : null;
  const related = family
    .filter(p => p.id !== product.id)
    .sort((a,b) => Math.abs(a.capacity_lpd - product.capacity_lpd) - Math.abs(b.capacity_lpd - product.capacity_lpd))
    .slice(0, 3);

  res.render('product', {
    product, related, family, previousProduct, nextProduct,
    meta: { title: `${product.name}${product.subtitle ? ' – ' + product.subtitle : ''} | WatAir UK`, description: product.summary, image: product.image_url }
  });
});

app.get('/how-it-works', (req, res) => renderPage(res, getPage('how-it-works')));
app.get('/about', (req, res) => renderPage(res, getPage('about')));
app.get('/environment/plastic-bottles', (req, res) => renderPage(res, getPage('plastic-bottles')));
app.get('/environment/mains-water', (req, res) => renderPage(res, getPage('mains-water')));
app.get('/resellers', (req, res) => renderPage(res, getPage('resellers')));
app.get('/leasing', (req, res) => renderPage(res, getPage('leasing')));
app.get('/privacy', (req, res) => renderPage(res, getPage('privacy')));
app.get('/faqs', (req, res) => res.render('faqs', {
  faqs,
  meta: { title: 'Atmospheric Water Generator FAQs | WatAir UK', description: 'Answers to common questions about water-from-air technology, installation and operation.', image: '/uploads/imported/legacy/images/home/products.jpg' }
}));

app.get('/contact', (req, res) => {
  const selectedProduct = req.query.product
    ? parseProduct(db.prepare('SELECT * FROM products WHERE slug=? AND published=1').get(String(req.query.product)))
    : null;
  res.render('contact', {
    sent: req.query.sent === '1',
    error: null,
    selectedProduct,
    formValues: {},
    meta: { title: 'Contact WatAir UK', description: 'Talk to WatAir about atmospheric water generation for your home, workplace or industrial application.', image: '/uploads/imported/legacy/media/1027/contact-banner.jpg' }
  });
});

function cleanFormValue(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

app.post('/contact', contactLimiter, async (req, res) => {
  const name = cleanFormValue(req.body.name, 150);
  const company = cleanFormValue(req.body.company, 150);
  const email = cleanFormValue(req.body.email, 254).toLowerCase();
  const phone = cleanFormValue(req.body.phone, 80);
  const message = cleanFormValue(req.body.message, 5000);
  const website = cleanFormValue(req.body.website, 500);
  const productSlug = cleanFormValue(req.body.product, 160);
  const selectedProduct = productSlug
    ? parseProduct(db.prepare('SELECT * FROM products WHERE slug=? AND published=1').get(productSlug))
    : null;

  const allowedInterests = new Set([
    'Home & Office',
    'Commercial & Industrial',
    'Leasing',
    'Reseller opportunity',
    'General enquiry'
  ]);
  const requestedInterest = cleanFormValue(req.body.interest, 120);
  const interest = allowedInterests.has(requestedInterest) ? requestedInterest : '';

  if (website) return res.redirect(303, '/contact?sent=1');

  const formValues = { name, company, email, phone, interest, message };
  if (!name || !validEmail(email) || !message) {
    return res.status(400).render('contact', {
      sent: false,
      error: !validEmail(email) ? 'Please enter a valid email address.' : 'Please complete your name, email and message.',
      selectedProduct,
      formValues,
      meta: { title: 'Contact WatAir UK', description: 'Talk to WatAir about atmospheric water generation for your home, workplace or industrial application.' }
    });
  }

  db.prepare(`INSERT INTO enquiries(name,company,email,phone,interest,message,ip) VALUES(?,?,?,?,?,?,?)`)
    .run(name, company, email, phone, interest, message, String(req.ip || '').slice(0, 120));

  if (process.env.SMTP_HOST && process.env.CONTACT_TO) {
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
      });
      await transport.sendMail({
        from: process.env.SMTP_FROM || 'WatAir Website <website@watair.co.uk>',
        to: process.env.CONTACT_TO,
        replyTo: email,
        subject: `WatAir website enquiry: ${interest || 'General'}`,
        text: `Name: ${name}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone}\nInterest: ${interest || 'General'}\n\n${message}`
      });
    } catch (err) {
      console.error('SMTP notification failed:', err.message);
    }
  }

  res.redirect(303, '/contact?sent=1');
});

// Legacy URL continuity / SEO redirects
app.get(['/atmospheric-water-generators', '/atmospheric-water-generators/'], (req,res) => res.redirect(301, '/products'));
app.get(['/atmospheric-water-generators/home-office', '/atmospheric-water-generators/home-office/'], (req,res) => res.redirect(301, '/products/home-office'));
app.get(['/atmospheric-water-generators/commercial-industrial', '/atmospheric-water-generators/commercial-industrial/'], (req,res) => res.redirect(301, '/products/commercial-industrial'));
app.get('/atmospheric-water-generators/:category/:slug', (req,res) => res.redirect(301, `/products/${req.params.slug}`));
app.get(['/contact-us', '/contact-us.aspx'], (req,res) => res.redirect(301, '/contact'));
app.get('/helping-the-environment/mains-water', (req,res) => res.redirect(301, '/environment/mains-water'));
app.get('/helping-the-environment/plastic-bottles', (req,res) => res.redirect(301, '/environment/plastic-bottles'));
app.get('/how-it-works/faqs', (req,res) => res.redirect(301, '/faqs'));
app.get('/about-us', (req,res) => res.redirect(301, '/about'));
app.get('/become-a-reseller', (req,res) => res.redirect(301, '/resellers'));
app.get(['/reseller', '/reseller/'], (req,res) => res.redirect(301, '/resellers'));
app.get(['/privacy-policy', '/privacy-policy/'], (req,res) => res.redirect(301, '/privacy'));

app.get('/favicon.ico', (req,res) => res.redirect(302, '/favicon.svg'));

app.get('/.well-known/security.txt', (req,res) => {
  const email = settingsObject().email || 'info@watairuk.co.uk';
  res.type('text/plain').send(`Contact: mailto:${email}\nCanonical: ${baseUrl}/.well-known/security.txt\nExpires: 2027-12-31T23:59:59Z\nPreferred-Languages: en\n`);
});

app.get('/robots.txt', (req,res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, ch => ({
    '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'
  })[ch]);
}

function sitemapDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0,10) : null;
}

app.get('/sitemap.xml', (req,res) => {
  const pageRows = db.prepare('SELECT slug,updated_at FROM pages WHERE published=1').all();
  const pageUpdated = Object.fromEntries(pageRows.map(row => [row.slug, sitemapDate(row.updated_at)]));
  const productRows = products();
  const latestDate = [
    ...pageRows.map(row => row.updated_at),
    ...productRows.map(row => row.updated_at)
  ].filter(Boolean).sort().at(-1);
  const siteLastmod = sitemapDate(latestDate);

  const entries = [
    { path: '/', lastmod: siteLastmod },
    { path: '/products', lastmod: siteLastmod },
    { path: '/products/home-office', lastmod: siteLastmod },
    { path: '/products/commercial-industrial', lastmod: siteLastmod },
    { path: '/how-it-works', lastmod: pageUpdated['how-it-works'] },
    { path: '/faqs', lastmod: siteLastmod },
    { path: '/about', lastmod: pageUpdated.about },
    { path: '/environment/plastic-bottles', lastmod: pageUpdated['plastic-bottles'] },
    { path: '/environment/mains-water', lastmod: pageUpdated['mains-water'] },
    { path: '/resellers', lastmod: pageUpdated.resellers },
    { path: '/leasing', lastmod: pageUpdated.leasing },
    { path: '/privacy', lastmod: pageUpdated.privacy },
    { path: '/contact', lastmod: siteLastmod },
    ...productRows.map(product => ({
      path: '/products/' + product.slug,
      lastmod: sitemapDate(product.updated_at)
    }))
  ];

  const body = entries.map(entry => {
    const loc = xmlEscape(baseUrl + entry.path);
    const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : '';
    return `  <url><loc>${loc}</loc>${lastmod}</url>`;
  }).join('\n');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );
});

// Admin
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const uploadExtensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

function safeUploadName(originalName, mimetype) {
  const originalExt = path.extname(originalName || '');
  const base = path.basename(originalName || 'image', originalExt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  const ext = uploadExtensions[mimetype] || '.bin';
  return `${Date.now()}-${base}${ext}`;
}

function hasValidImageSignature(filePath, mimetype) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (mimetype === 'image/jpeg') {
      return bytes >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimetype === 'image/png') {
      return bytes >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    }
    if (mimetype === 'image/webp') {
      return bytes >= 12 && buffer.subarray(0,4).toString('ascii') === 'RIFF' && buffer.subarray(8,12).toString('ascii') === 'WEBP';
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req,file,cb) => cb(null, safeUploadName(file.originalname, file.mimetype))
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req,file,cb) => {
    if (!uploadExtensions[file.mimetype]) return cb(new Error('Please upload a JPG, PNG or WebP image.'));
    cb(null, true);
  }
});

function uploadedMediaAssets() {
  const typeByExt = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };
  try {
    return fs.readdirSync(uploadDir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => {
        const ext = path.extname(entry.name).toLowerCase();
        if (!typeByExt[ext]) return null;
        const filePath = path.join(uploadDir, entry.name);
        const stat = fs.statSync(filePath);
        return {
          source: 'upload',
          name: entry.name,
          public_url: '/uploads/' + entry.name,
          content_type: typeByExt[ext],
          bytes: stat.size,
          updated_at: stat.mtime.toISOString()
        };
      })
      .filter(Boolean)
      .sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
  } catch {
    return [];
  }
}

function allAdminImages() {
  const imported = getMediaSummary().assets
    .filter(asset => String(asset.content_type || '').startsWith('image/'))
    .map(asset => ({
      source: 'imported',
      name: path.basename(asset.local_path),
      public_url: asset.public_url,
      content_type: asset.content_type,
      bytes: asset.bytes,
      updated_at: null
    }));
  return [...uploadedMediaAssets(), ...imported];
}

function specsFromBody(body) {
  const names = Array.isArray(body.spec_name) ? body.spec_name : body.spec_name != null ? [body.spec_name] : [];
  const values = Array.isArray(body.spec_value) ? body.spec_value : body.spec_value != null ? [body.spec_value] : [];
  const specs = {};
  names.forEach((name,index) => {
    const key = String(name || '').trim();
    const value = String(values[index] || '').trim();
    if (key && value) specs[key.slice(0,120)] = value.slice(0,500);
  });
  return specs;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';
}

function uniqueProductSlug(name) {
  const base = slugify(name);
  let slug = base;
  let i = 2;
  while (db.prepare('SELECT 1 FROM products WHERE slug=?').get(slug)) slug = `${base}-${i++}`;
  return slug;
}

function cleanPageBody(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1','h2','h3','section','div','span']),
    allowedAttributes: { '*': ['class'], 'a': ['href','target','rel'] }
  });
}

app.get('/admin/login', (req,res) => {
  if (readAdmin(req)) return res.redirect('/admin');
  res.render('admin/login', { error: null, meta: { title: 'WatAir CMS Login' } });
});
app.post('/admin/login', loginLimiter, (req,res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  const admin = db.prepare('SELECT * FROM admins WHERE email=?').get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).render('admin/login', { error: 'Incorrect email or password.', meta: { title: 'WatAir CMS Login' } });
  }
  db.prepare('UPDATE admins SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(admin.id);
  res.cookie('watair_admin', signAdmin(admin), { httpOnly: true, secure: isProd, sameSite: 'strict', maxAge: 8*60*60*1000, path: '/' });
  res.redirect('/admin');
});
app.post('/admin/logout', requireAdmin, requireCsrf, (req,res) => {
  res.clearCookie('watair_admin', { path: '/' });
  res.redirect('/admin/login');
});

app.use('/admin', requireAdmin, (req,res,next) => {
  const current = db.prepare('SELECT id,email,display_name,updated_at FROM admins WHERE id=?').get(req.admin.sub);
  if (!current) {
    res.clearCookie('watair_admin', { path: '/' });
    return res.redirect('/admin/login');
  }

  const updatedAt = Math.floor(new Date(current.updated_at + 'Z').getTime() / 1000);
  if (Number.isFinite(updatedAt) && req.admin.iat && req.admin.iat < updatedAt) {
    res.clearCookie('watair_admin', { path: '/' });
    return res.redirect('/admin/login');
  }

  res.locals.adminAccount = current;
  res.locals.csrf = csrfFor(req);
  next();
});

app.get('/admin', (req,res) => {
  const mediaSummary = getMediaSummary();
  const uploads = uploadedMediaAssets();
  const stats = {
    pages: db.prepare('SELECT COUNT(*) c FROM pages').get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    enquiries: db.prepare("SELECT COUNT(*) c FROM enquiries WHERE status='new'").get().c,
    media: mediaSummary.count + uploads.length
  };
  const enquiries = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 6').all();
  const recentProducts = products('1=1').slice(0, 6);
  const missingImages = db.prepare("SELECT COUNT(*) c FROM products WHERE published=1 AND (image_url IS NULL OR TRIM(image_url)='')").get().c;
  const missingSpecs = db.prepare("SELECT COUNT(*) c FROM products WHERE published=1 AND (specs_json IS NULL OR TRIM(specs_json)='' OR specs_json='{}')").get().c;
  const releaseChecks = [
    {
      label: 'Canonical HTTPS URL',
      ok: baseUrl.startsWith('https://'),
      detail: baseUrl
    },
    {
      label: 'Enquiry email notifications',
      ok: Boolean(process.env.SMTP_HOST && process.env.CONTACT_TO),
      detail: process.env.SMTP_HOST && process.env.CONTACT_TO ? 'SMTP is configured' : 'Configure SMTP_HOST and CONTACT_TO before launch'
    },
    {
      label: 'Privacy notice',
      ok: Boolean(getPage('privacy')),
      detail: getPage('privacy') ? 'Published and linked in the footer' : 'Privacy page is not published'
    },
    {
      label: 'Published product images',
      ok: missingImages === 0,
      detail: missingImages ? `${missingImages} published product(s) need an image` : 'All published products have imagery'
    },
    {
      label: 'Published product specifications',
      ok: missingSpecs === 0,
      detail: missingSpecs ? `${missingSpecs} published product(s) need specifications` : 'All published products have specifications'
    }
  ];
  res.render('admin/dashboard', {
    stats, enquiries, recentProducts, mediaSummary, uploads, releaseChecks, importState: getMediaImportState(),
    meta: { title: 'WatAir CMS' }
  });
});

app.get('/admin/media', (req,res) => {
  res.render('admin/media', {
    summary: getMediaSummary(),
    uploads: uploadedMediaAssets(),
    importState: getMediaImportState(),
    reqQuery: req.query,
    meta: { title: 'Media Library | WatAir CMS' }
  });
});

app.get('/admin/media/assets.json', (req,res) => {
  res.json({ assets: allAdminImages() });
});

app.get('/admin/media/status', (req,res) => {
  res.json(getMediaImportState());
});

app.post('/admin/media/import', requireCsrf, async (req,res) => {
  await startLegacyMediaImport();
  res.redirect('/admin/media');
});

app.post('/admin/media/relink', requireCsrf, (req,res) => {
  const manifest = loadManifest();
  let changed = 0;
  const rows = db.prepare("SELECT id,image_url FROM products WHERE image_url LIKE 'http%'").all();
  const updateProduct = db.prepare('UPDATE products SET image_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');
  const tx = db.transaction(() => {
    rows.forEach(row => {
      const local = localAssetForLegacyUrl(row.image_url, manifest);
      if (local) {
        updateProduct.run(local, row.id);
        changed++;
      }
    });
    const hero = db.prepare("SELECT value FROM settings WHERE key='hero_image'").get();
    if (hero?.value?.startsWith('http')) {
      const localHero = localAssetForLegacyUrl(hero.value, manifest);
      if (localHero) {
        db.prepare("UPDATE settings SET value=? WHERE key='hero_image'").run(localHero);
        changed++;
      }
    }
  });
  tx();
  res.redirect('/admin/media?relinked=' + changed);
});

app.post('/admin/upload', requireCsrf, (req,res,next) => {
  upload.single('image')(req,res,err => {
    if (err) return res.status(400).json({ error: err.message || 'Image upload failed.' });
    next();
  });
}, (req,res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid image supplied.' });

  if (!hasValidImageSignature(req.file.path, req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'The uploaded file does not appear to be a valid JPG, PNG or WebP image.' });
  }

  res.json({
    url: '/uploads/' + req.file.filename,
    name: req.file.filename,
    bytes: req.file.size,
    content_type: req.file.mimetype
  });
});

app.post('/admin/media/delete', requireCsrf, (req,res) => {
  const requested = path.basename(String(req.body.filename || ''));
  if (!requested || requested !== String(req.body.filename || '')) return res.status(400).send('Invalid file name');
  const target = path.join(uploadDir, requested);
  if (!target.startsWith(uploadDir + path.sep)) return res.status(400).send('Invalid file');
  if (fs.existsSync(target)) fs.unlinkSync(target);
  res.redirect('/admin/media?deleted=1');
});

app.get('/admin/pages', (req,res) => {
  res.render('admin/pages', {
    pages: db.prepare('SELECT * FROM pages ORDER BY title').all(),
    meta: { title: 'Website Pages | WatAir CMS' }
  });
});
app.get('/admin/pages/:id', (req,res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id=?').get(req.params.id);
  if (!page) return res.status(404).send('Page not found');
  res.render('admin/page-edit', { page, meta: { title: `Edit ${page.title} | WatAir CMS` } });
});
app.post('/admin/pages/:id', requireCsrf, (req,res) => {
  const body = cleanPageBody(req.body.body_html);
  db.prepare(`UPDATE pages SET title=?,eyebrow=?,hero=?,intro=?,body_html=?,hero_image=?,hero_style=?,seo_title=?,seo_description=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(
      String(req.body.title || '').slice(0,180),
      String(req.body.eyebrow || '').slice(0,120),
      String(req.body.hero || '').slice(0,300),
      String(req.body.intro || '').slice(0,1200),
      body,
      String(req.body.hero_image || '').slice(0,1200),
      ['photo','graphic',''].includes(req.body.hero_style) ? req.body.hero_style : '',
      String(req.body.seo_title || '').slice(0,250),
      String(req.body.seo_description || '').slice(0,500),
      req.body.published ? 1 : 0,
      req.params.id
    );
  res.redirect(`/admin/pages/${req.params.id}?saved=1`);
});

app.get('/admin/products', (req,res) => {
  res.render('admin/products', { products: products('1=1'), meta: { title: 'Products | WatAir CMS' } });
});

app.get('/admin/products/new', (req,res) => {
  res.render('admin/product-edit', {
    isNew: true,
    product: {
      id: null, slug: '', name: '', subtitle: '', category: 'home-office',
      capacity_lpd: 0, summary: '', specs: {}, image_url: '',
      featured: 0, published: 0, sort_order: 999
    },
    meta: { title: 'Add Product | WatAir CMS' }
  });
});

app.post('/admin/products/new', requireCsrf, (req,res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).send('Product name is required');
  const slug = uniqueProductSlug(name);
  const specs = specsFromBody(req.body);
  const result = db.prepare(`INSERT INTO products
    (slug,name,subtitle,category,capacity_lpd,summary,specs_json,image_url,featured,published,sort_order,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .run(
      slug,
      name.slice(0,180),
      String(req.body.subtitle || '').slice(0,180),
      req.body.category === 'commercial-industrial' ? 'commercial-industrial' : 'home-office',
      Number(req.body.capacity_lpd || 0),
      String(req.body.summary || '').slice(0,2500),
      JSON.stringify(specs),
      String(req.body.image_url || '').slice(0,1200),
      req.body.featured ? 1 : 0,
      req.body.published ? 1 : 0,
      Number(req.body.sort_order || 999)
    );
  res.redirect(`/admin/products/${result.lastInsertRowid}?created=1`);
});

app.get('/admin/products/:id', (req,res) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
  if (!product) return res.status(404).send('Product not found');
  res.render('admin/product-edit', {
    isNew: false,
    product,
    meta: { title: `Edit ${product.name} | WatAir CMS` }
  });
});

app.post('/admin/products/:id', requireCsrf, (req,res) => {
  const specs = specsFromBody(req.body);
  db.prepare(`UPDATE products
    SET name=?,subtitle=?,category=?,capacity_lpd=?,summary=?,specs_json=?,image_url=?,featured=?,published=?,sort_order=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?`)
    .run(
      String(req.body.name || '').slice(0,180),
      String(req.body.subtitle || '').slice(0,180),
      req.body.category === 'commercial-industrial' ? 'commercial-industrial' : 'home-office',
      Number(req.body.capacity_lpd || 0),
      String(req.body.summary || '').slice(0,2500),
      JSON.stringify(specs),
      String(req.body.image_url || '').slice(0,1200),
      req.body.featured ? 1 : 0,
      req.body.published ? 1 : 0,
      Number(req.body.sort_order || 0),
      req.params.id
    );
  res.redirect(`/admin/products/${req.params.id}?saved=1`);
});

function validateAdminPassword(password, email = '') {
  const value = String(password || '');
  if (value.length < 14) return 'Password must be at least 14 characters long.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Password must contain at least one letter and one number.';
  if (email && value.toLowerCase().includes(String(email).split('@')[0].toLowerCase())) return 'Password should not contain the email username.';
  return null;
}

app.get('/admin/users', (req,res) => {
  const admins = db.prepare('SELECT id,email,display_name,created_at,updated_at FROM admins ORDER BY created_at,id').all();
  res.render('admin/users', {
    admins,
    currentAdminId: Number(req.admin.sub),
    error: req.query.error || '',
    created: req.query.created === '1',
    updated: req.query.updated === '1',
    deleted: req.query.deleted === '1',
    meta: { title: 'Admin Users | WatAir CMS' }
  });
});

app.post('/admin/users', requireCsrf, (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const displayName = String(req.body.display_name || '').trim().slice(0,120);
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm_password || '');

  if (!/^\S+@\S+\.\S+$/.test(email)) return res.redirect('/admin/users?error=' + encodeURIComponent('Enter a valid email address.'));
  if (password !== confirm) return res.redirect('/admin/users?error=' + encodeURIComponent('The two passwords do not match.'));
  const passwordError = validateAdminPassword(password, email);
  if (passwordError) return res.redirect('/admin/users?error=' + encodeURIComponent(passwordError));
  if (db.prepare('SELECT 1 FROM admins WHERE email=?').get(email)) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('An admin user with that email address already exists.'));
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO admins(email,display_name,password_hash) VALUES(?,?,?)').run(email, displayName, hash);
  res.redirect('/admin/users?created=1');
});

app.post('/admin/users/:id/password', requireCsrf, (req,res) => {
  const target = db.prepare('SELECT id,email FROM admins WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).send('Admin user not found');

  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm_password || '');
  if (password !== confirm) return res.redirect('/admin/users?error=' + encodeURIComponent('The two passwords do not match.'));
  const passwordError = validateAdminPassword(password, target.email);
  if (passwordError) return res.redirect('/admin/users?error=' + encodeURIComponent(passwordError));

  db.prepare('UPDATE admins SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(bcrypt.hashSync(password, 12), target.id);
  res.redirect('/admin/users?updated=1');
});

app.post('/admin/users/:id/delete', requireCsrf, (req,res) => {
  const id = Number(req.params.id);
  if (id === Number(req.admin.sub)) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('You cannot delete the account you are currently signed in with.'));
  }
  const count = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (count <= 1) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('The last admin account cannot be deleted.'));
  }
  db.prepare('DELETE FROM admins WHERE id=?').run(id);
  res.redirect('/admin/users?deleted=1');
});

app.get('/admin/settings', (req,res) => {
  res.render('admin/settings', { values: settingsObject(), meta: { title: 'Site Settings | WatAir CMS' } });
});
app.post('/admin/settings', requireCsrf, (req,res) => {
  const allowed = ['site_name','email','phone','hero_title','hero_text','hero_image','hero_image_style','footer_text','company_location'];
  const upsert = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(() => allowed.forEach(k => upsert.run(k, String(req.body[k] || '').slice(0,2000))));
  tx();
  res.redirect('/admin/settings?saved=1');
});

app.get('/admin/enquiries', (req,res) => {
  res.render('admin/enquiries', {
    enquiries: db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC').all(),
    reqQuery: req.query,
    meta: { title: 'Enquiries | WatAir CMS' }
  });
});
app.post('/admin/enquiries/:id/read', requireCsrf, (req,res) => {
  db.prepare("UPDATE enquiries SET status='read' WHERE id=?").run(req.params.id);
  res.redirect('/admin/enquiries');
});

app.post('/admin/enquiries/:id/delete', requireCsrf, (req,res) => {
  db.prepare('DELETE FROM enquiries WHERE id=?').run(req.params.id);
  res.redirect('/admin/enquiries?deleted=1');
});

app.use((req,res) => res.status(404).render('404', { meta: { title: 'Page not found | WatAir UK', description: 'The requested page could not be found.', noindex: true } }));
app.use((err,req,res,next) => {
  console.error(err);
  if (!isProd) return res.status(500).send(`<pre>${String(err.stack || err)}</pre>`);
  res.status(500).render('500', {
    meta: {
      title: 'Something went wrong | WatAir UK',
      description: 'The requested page could not be loaded.',
      noindex: true
    }
  });
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`WatAir listening on ${PORT}`));

function shutdown(signal) {
  console.log(`${signal} received; shutting down WatAir cleanly.`);
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
