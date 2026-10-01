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
const { db, settingsObject } = require('./src/db');
const { faqs } = require('./src/content');
const { signAdmin, readAdmin, requireAdmin, csrfFor, requireCsrf } = require('./src/auth');

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
  if (!page) return res.status(404).render('404', { meta: { title: 'Page not found | WatAir UK' } });
  return res.render('page', {
    page,
    meta: { title: page.seo_title || `${page.title} | WatAir UK`, description: page.seo_description || page.intro },
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
      description: 'Atmospheric Water Generation systems for homes, offices and industrial applications across the UK.'
    }
  });
});

app.get('/products', (req, res) => res.render('products', {
  products: products(), category: 'all',
  meta: { title: 'Atmospheric Water Generators | WatAir UK', description: 'Explore WatAir atmospheric water generators from compact home and office systems to 10,000 litre-per-day industrial units.' }
}));
app.get('/products/home-office', (req, res) => res.render('products', {
  products: products('published=1 AND category=?', ['home-office']), category: 'home-office',
  meta: { title: 'Home & Office Atmospheric Water Generators | WatAir UK', description: 'Compact water-from-air systems for homes and workplaces.' }
}));
app.get('/products/commercial-industrial', (req, res) => res.render('products', {
  products: products('published=1 AND category=?', ['commercial-industrial']), category: 'commercial-industrial',
  meta: { title: 'Commercial & Industrial Atmospheric Water Generators | WatAir UK', description: 'Commercial and industrial water-from-air systems from 80 to 10,000 litres per day.' }
}));
app.get('/products/:slug', (req, res) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE slug=? AND published=1').get(req.params.slug));
  if (!product) return res.status(404).render('404', { meta: { title: 'Product not found | WatAir UK' } });
  const related = products('published=1 AND category=? AND id<>?', [product.category, product.id]).slice(0, 3);
  res.render('product', {
    product, related,
    meta: { title: `${product.name}${product.subtitle ? ' – ' + product.subtitle : ''} | WatAir UK`, description: product.summary }
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
  meta: { title: 'Atmospheric Water Generator FAQs | WatAir UK', description: 'Answers to common questions about water-from-air technology, installation and operation.' }
}));

app.get('/contact', (req, res) => res.render('contact', {
  sent: req.query.sent === '1', error: null,
  meta: { title: 'Contact WatAir UK', description: 'Talk to WatAir about atmospheric water generation for your home, workplace or industrial application.' }
}));
app.post('/contact', contactLimiter, async (req, res) => {
  const { name, company = '', email, phone = '', interest = '', message, website = '' } = req.body;
  if (website) return res.redirect('/contact?sent=1');
  if (!name || !email || !message || String(message).length > 5000) {
    return res.status(400).render('contact', { sent: false, error: 'Please complete your name, email and message.', meta: { title: 'Contact WatAir UK' } });
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

app.get('/robots.txt', (req,res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${baseUrl}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req,res) => {
  const urls = ['/', '/products', '/products/home-office', '/products/commercial-industrial', '/how-it-works', '/faqs', '/about', '/environment/plastic-bottles', '/environment/mains-water', '/resellers', '/leasing', '/contact'];
  products().forEach(p => urls.push('/products/' + p.slug));
  const body = urls.map(u => `<url><loc>${baseUrl}${u}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
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
  const stats = {
    pages: db.prepare('SELECT COUNT(*) c FROM pages').get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    enquiries: db.prepare("SELECT COUNT(*) c FROM enquiries WHERE status='new'").get().c
  };
  const enquiries = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 8').all();
  res.render('admin/dashboard', { stats, enquiries, meta: { title: 'WatAir CMS' } });
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

app.use((req,res) => res.status(404).render('404', { meta: { title: 'Page not found | WatAir UK' } }));
app.use((err,req,res,next) => {
  console.error(err);
  res.status(500).send(isProd ? 'Something went wrong.' : `<pre>${String(err.stack || err)}</pre>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`WatAir listening on ${PORT}`));
