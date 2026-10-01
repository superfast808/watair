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
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(compression());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));

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
      image: pageImages[page.slug] || '/uploads/imported/legacy/images/home/products.jpg'
    },
    ...extra
  });
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'watair-next' }));

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
  products: products('published=1 AND category=?', ['home-office']), category: 'home-office',
  meta: { title: 'Home & Office Atmospheric Water Generators | WatAir UK', description: 'Compact water-from-air systems for homes and workplaces.', image: '/uploads/imported/legacy/media/1003/pw-hr-30l.png' }
}));
app.get('/products/commercial-industrial', (req, res) => res.render('products', {
  products: products('published=1 AND category=?', ['commercial-industrial']), category: 'commercial-industrial',
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
app.get('/faqs', (req, res) => res.render('faqs', {
  faqs,
  meta: { title: 'Atmospheric Water Generator FAQs | WatAir UK', description: 'Answers to common questions about water-from-air technology, installation and operation.', image: '/uploads/imported/legacy/images/home/products.jpg' }
}));

app.get('/contact', (req, res) => {
  const selectedProduct = req.query.product
    ? parseProduct(db.prepare('SELECT * FROM products WHERE slug=? AND published=1').get(String(req.query.product)))
    : null;
  res.render('contact', {
    sent: req.query.sent === '1', error: null, selectedProduct,
    meta: { title: 'Contact WatAir UK', description: 'Talk to WatAir about atmospheric water generation for your home, workplace or industrial application.', image: '/uploads/imported/legacy/media/1027/contact-banner.jpg' }
  });
});
app.post('/contact', contactLimiter, async (req, res) => {
  const { name, company = '', email, phone = '', interest = '', message, website = '' } = req.body;
  if (website) return res.redirect('/contact?sent=1');
  if (!name || !email || !message || String(message).length > 5000) {
    return res.status(400).render('contact', { sent: false, error: 'Please complete your name, email and message.', selectedProduct: null, meta: { title: 'Contact WatAir UK' } });
  }
  db.prepare(`INSERT INTO enquiries(name,company,email,phone,interest,message,ip) VALUES(?,?,?,?,?,?,?)`)
    .run(String(name).slice(0,150), String(company).slice(0,150), String(email).slice(0,254), String(phone).slice(0,80), String(interest).slice(0,120), String(message).slice(0,5000), req.ip || '');

  if (process.env.SMTP_HOST && process.env.CONTACT_TO) {
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
      });
      await transport.sendMail({
        from: process.env.SMTP_FROM || 'WatAir Website <website@localhost>',
        to: process.env.CONTACT_TO,
        replyTo: email,
        subject: `WatAir website enquiry: ${interest || 'General'}`,
        text: `Name: ${name}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone}\nInterest: ${interest}\n\n${message}`
      });
    } catch (err) {
      console.error('SMTP notification failed:', err.message);
    }
  }
  res.redirect('/contact?sent=1');
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

app.get('/favicon.ico', (req,res) => res.redirect(302, '/favicon.svg'));

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
  res.cookie('watair_admin', signAdmin(admin), { httpOnly: true, secure: isProd, sameSite: 'strict', maxAge: 8*60*60*1000, path: '/' });
  res.redirect('/admin');
});
app.post('/admin/logout', requireAdmin, requireCsrf, (req,res) => {
  res.clearCookie('watair_admin', { path: '/' });
  res.redirect('/admin/login');
});

app.use('/admin', requireAdmin, (req,res,next) => { res.locals.csrf = csrfFor(req); next(); });
app.get('/admin', (req,res) => {
  const mediaSummary = getMediaSummary();
  const stats = {
    pages: db.prepare('SELECT COUNT(*) c FROM pages').get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    enquiries: db.prepare("SELECT COUNT(*) c FROM enquiries WHERE status='new'").get().c,
    media: mediaSummary.count
  };
  const enquiries = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 8').all();
  res.render('admin/dashboard', { stats, enquiries, mediaSummary, importState: getMediaImportState(), meta: { title: 'WatAir CMS' } });
});

app.get('/admin/media', (req,res) => {
  res.render('admin/media', {
    summary: getMediaSummary(),
    importState: getMediaImportState(),
    reqQuery: req.query,
    meta: { title: 'Media Import | WatAir CMS' }
  });
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
app.get('/admin/pages', (req,res) => res.render('admin/pages', { pages: db.prepare('SELECT * FROM pages ORDER BY title').all(), meta: { title: 'Pages | WatAir CMS' } }));
app.get('/admin/pages/:id', (req,res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id=?').get(req.params.id);
  if (!page) return res.status(404).send('Page not found');
  res.render('admin/page-edit', { page, meta: { title: `Edit ${page.title} | WatAir CMS` } });
});
app.post('/admin/pages/:id', requireCsrf, (req,res) => {
  const body = sanitizeHtml(String(req.body.body_html || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1','h2','h3','section','div','span']),
    allowedAttributes: { '*': ['class'], 'a': ['href','target','rel'] }
  });
  db.prepare(`UPDATE pages SET title=?,eyebrow=?,hero=?,intro=?,body_html=?,seo_title=?,seo_description=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(req.body.title, req.body.eyebrow, req.body.hero, req.body.intro, body, req.body.seo_title, req.body.seo_description, req.body.published ? 1 : 0, req.params.id);
  res.redirect(`/admin/pages/${req.params.id}?saved=1`);
});
app.get('/admin/products', (req,res) => res.render('admin/products', { products: products('1=1'), meta: { title: 'Products | WatAir CMS' } }));
app.get('/admin/products/:id', (req,res) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
  if (!product) return res.status(404).send('Product not found');
  res.render('admin/product-edit', { product, meta: { title: `Edit ${product.name} | WatAir CMS` } });
});
app.post('/admin/products/:id', requireCsrf, (req,res) => {
  let specs = {};
  try { specs = JSON.parse(req.body.specs_json || '{}'); } catch { return res.status(400).send('Specifications must be valid JSON'); }
  db.prepare(`UPDATE products SET name=?,subtitle=?,category=?,capacity_lpd=?,summary=?,specs_json=?,image_url=?,featured=?,published=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(req.body.name, req.body.subtitle, req.body.category, Number(req.body.capacity_lpd || 0), req.body.summary, JSON.stringify(specs), req.body.image_url || '', req.body.featured ? 1 : 0, req.body.published ? 1 : 0, Number(req.body.sort_order || 0), req.params.id);
  res.redirect(`/admin/products/${req.params.id}?saved=1`);
});
app.get('/admin/settings', (req,res) => res.render('admin/settings', { values: settingsObject(), meta: { title: 'Settings | WatAir CMS' } }));
app.post('/admin/settings', requireCsrf, (req,res) => {
  const allowed = ['site_name','email','phone','hero_title','hero_text','hero_image','footer_text','company_location'];
  const upsert = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(() => allowed.forEach(k => upsert.run(k, String(req.body[k] || '').slice(0,2000))));
  tx();
  res.redirect('/admin/settings?saved=1');
});
app.get('/admin/enquiries', (req,res) => res.render('admin/enquiries', { enquiries: db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC').all(), meta: { title: 'Enquiries | WatAir CMS' } }));
app.post('/admin/enquiries/:id/read', requireCsrf, (req,res) => {
  db.prepare("UPDATE enquiries SET status='read' WHERE id=?").run(req.params.id);
  res.redirect('/admin/enquiries');
});

const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req,file,cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req,file,cb) => cb(null, ['image/jpeg','image/png','image/webp','image/svg+xml'].includes(file.mimetype))
});
app.post('/admin/upload', requireCsrf, upload.single('image'), (req,res) => {
  if (!req.file) return res.status(400).send('No valid image supplied');
  res.json({ url: '/uploads/' + req.file.filename });
});

app.use((req,res) => res.status(404).render('404', { meta: { title: 'Page not found | WatAir UK', description: 'The requested page could not be found.', noindex: true } }));
app.use((err,req,res,next) => {
  console.error(err);
  res.status(500).send(isProd ? 'Something went wrong.' : `<pre>${String(err.stack || err)}</pre>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`WatAir listening on ${PORT}`));
