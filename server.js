require('dotenv/config');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
const { version: appVersion } = require('./package.json');
const { db, settingsObject } = require('./src/db');
const { faqs } = require('./src/content');
const { signAdmin, readAdmin, requireAdmin, csrfFor, requireCsrf } = require('./src/auth');
const { startLegacyMediaImport, getMediaImportState, getMediaSummary, loadManifest, localAssetForLegacyUrl } = require('./src/media-import');
const {
  normaliseCurrency,
  parseMoneyToMinor,
  minorToInput,
  formatMoney,
  deliveryQuote,
  enabledGateways,
  createStripeCheckout,
  retrieveStripeSession,
  verifyStripeWebhook,
  createPayPalOrder,
  retrievePayPalOrder,
  capturePayPalOrder
} = require('./src/commerce');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const isProd = process.env.NODE_ENV === 'production';
const baseUrl = (process.env.BASE_URL || 'http://localhost:' + PORT).replace(/\/$/, '');

if (isProd) {
  const sessionSecret = String(process.env.SESSION_SECRET || '');
  if (sessionSecret.length < 32 || sessionSecret === 'replace-with-at-least-32-random-characters') {
    throw new Error('SESSION_SECRET must be a unique value of at least 32 characters in production.');
  }

  let productionBaseUrl;
  try {
    productionBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error('BASE_URL must be a valid absolute URL in production.');
  }
  if (productionBaseUrl.protocol !== 'https:') {
    throw new Error('BASE_URL must use https:// in production.');
  }
}

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
else if (isProd) console.warn('TRUST_PROXY is not set; configure it when running behind Plesk/nginx so rate limiting sees the real client IP.');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
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

// Stripe signs the exact raw payload, so its webhook must run before the
// general JSON body parser.
app.post('/payments/stripe/webhook', express.raw({ type: 'application/json', limit: '256kb' }), stripeWebhookHandler);

app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  // Public assets are not filename-fingerprinted, so keep cache lifetime modest
  // to ensure normal visitors receive CSS/JS updates without a hard refresh.
  maxAge: isProd ? '1h' : 0,
  immutable: false
}));

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  const privateCommercePath =
    req.path.startsWith('/buy/') ||
    req.path.startsWith('/checkout/') ||
    req.path.startsWith('/order/') ||
    req.path.startsWith('/payments/');

  if (req.path.startsWith('/admin') || privateCommercePath) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

function parseStoredDate(value) {
  if (!value) return null;
  const text = String(value);
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(text)
    ? text
    : text.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUkDateTime(value) {
  const date = parseStoredDate(value);
  return date ? date.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium',
    timeStyle: 'short'
  }) : '';
}

function formatUkDate(value) {
  const date = parseStoredDate(value);
  return date ? date.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium'
  }) : '';
}

app.use((req, res, next) => {
  res.locals.settings = settingsObject();
  res.locals.navigationItems = db.prepare('SELECT * FROM navigation_items WHERE active=1 ORDER BY sort_order,id').all();
  res.locals.path = req.path;
  res.locals.baseUrl = baseUrl;
  res.locals.admin = readAdmin(req);
  res.locals.currentYear = new Date().getFullYear();
  res.locals.assetVersion = appVersion;
  res.locals.formatUkDateTime = formatUkDateTime;
  res.locals.formatUkDate = formatUkDate;
  res.locals.formatMoney = formatMoney;
  res.locals.minorToInput = minorToInput;
  next();
});

const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

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
function commerceEnabled(settings = settingsObject()) {
  return String(settings.commerce_enabled || '0') === '1';
}

function sellableProduct(slug) {
  return parseProduct(db.prepare(
    'SELECT * FROM products WHERE slug=? AND published=1 AND sellable=1 AND price_minor>0'
  ).get(String(slug || '')));
}

function orderByPublicId(publicId) {
  return db.prepare('SELECT * FROM orders WHERE public_id=?').get(String(publicId || ''));
}

function setOrderStatus(publicId, status, gatewayRef = '') {
  const allowed = new Set(['pending','awaiting_payment','paid','processing','fulfilled','cancelled','refunded','failed']);
  if (!allowed.has(status)) return 0;
  const current = orderByPublicId(publicId);
  if (!current || current.status === 'refunded') return 0;

  const protectedPaidStates = new Set(['paid','processing','fulfilled']);
  const negativeStates = new Set(['pending','awaiting_payment','cancelled','failed']);
  if (protectedPaidStates.has(current.status) && negativeStates.has(status)) return 0;

  const progressRank = { paid: 1, processing: 2, fulfilled: 3 };
  if (progressRank[current.status] && progressRank[status] && progressRank[status] < progressRank[current.status]) return 0;

  return db.prepare(`
    UPDATE orders
    SET status=?,
        gateway_ref=CASE WHEN ?<>'' THEN ? ELSE gateway_ref END,
        updated_at=CURRENT_TIMESTAMP
    WHERE public_id=?
  `).run(status, gatewayRef, gatewayRef, publicId).changes;
}

async function notifyOrderIfNeeded(publicId) {
  if (!process.env.SMTP_HOST || !process.env.CONTACT_TO) return;
  const order = orderByPublicId(publicId);
  if (!order || !['paid','awaiting_payment'].includes(order.status)) return;

  const claim = db.prepare(`
    UPDATE orders SET notified_at='sending'
    WHERE public_id=? AND (notified_at IS NULL OR notified_at='')
  `).run(order.public_id);
  if (!claim.changes) return;

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    const orderRef = order.public_id.slice(0,8).toUpperCase();
    const paid = order.status === 'paid';
    const subject = paid
      ? `WatAir order ${orderRef}: payment received`
      : `WatAir order ${orderRef}: manual payment requested`;
    const summary = [
      `Order: ${order.public_id}`,
      `Status: ${order.status}`,
      `Product: ${order.product_name} x ${order.quantity}`,
      `Products: ${formatMoney(order.unit_price_minor * order.quantity, order.currency)}`,
      `Delivery: ${formatMoney(order.delivery_minor, order.currency)}`,
      `Total: ${formatMoney(order.total_minor, order.currency)}`,
      `Gateway: ${order.gateway}`,
      '',
      `Customer: ${order.customer_name}`,
      `Email: ${order.customer_email}`,
      `Phone: ${order.customer_phone || '-'}`,
      `Address: ${order.address1}${order.address2 ? ', ' + order.address2 : ''}, ${order.city}${order.region ? ', ' + order.region : ''}, ${order.postcode}, ${order.country_code}`
    ].join('\n');

    await transport.sendMail({
      from: process.env.SMTP_FROM || 'WatAir Website <website@watair.co.uk>',
      to: process.env.CONTACT_TO,
      replyTo: order.customer_email,
      subject,
      text: summary
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM || 'WatAir Website <website@watair.co.uk>',
      to: order.customer_email,
      subject: paid ? `WatAir order ${orderRef} confirmed` : `WatAir order ${orderRef} received`,
      text: `Hello ${order.customer_name},\n\n${paid ? 'We have received payment for your WatAir order.' : 'We have received your WatAir order. The team will contact you about the manual payment arrangement.'}\n\n${order.product_name} x ${order.quantity}\nDelivery: ${formatMoney(order.delivery_minor, order.currency)}\nTotal: ${formatMoney(order.total_minor, order.currency)}\n\nOrder status: ${baseUrl}/order/${order.public_id}\nRefunds and returns: ${baseUrl}/refunds\n\nWatAir`
    });

    db.prepare("UPDATE orders SET notified_at=CURRENT_TIMESTAMP WHERE public_id=? AND notified_at='sending'").run(order.public_id);
  } catch (err) {
    db.prepare("UPDATE orders SET notified_at='' WHERE public_id=? AND notified_at='sending'").run(order.public_id);
    console.error('Order email notification failed:', err.message);
  }
}

function gatewayConfiguration() {
  return {
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    paypalEnvironment: String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox'
  };
}

function paypalPaymentMatches(payload, order) {
  const unit = payload?.purchase_units?.[0];
  const captured = unit?.payments?.captures?.[0];
  const amountValue = Math.round(Number(captured?.amount?.value || 0) * 100);
  const amountMatches = amountValue === Number(order.total_minor);
  const currencyMatches = String(captured?.amount?.currency_code || '').toUpperCase() === String(order.currency || '').toUpperCase();
  const referenceMatches = String(unit?.custom_id || unit?.reference_id || '') === order.public_id;
  return Boolean(
    payload?.status === 'COMPLETED' &&
    captured?.status === 'COMPLETED' &&
    amountMatches &&
    currencyMatches &&
    referenceMatches
  );
}

async function stripeWebhookHandler(req, res) {
  const event = verifyStripeWebhook(
    req.body,
    req.get('stripe-signature'),
    process.env.STRIPE_WEBHOOK_SECRET
  );
  if (!event) return res.status(400).send('Invalid Stripe signature');

  const session = event?.data?.object;
  const publicId = String(session?.metadata?.order_id || session?.client_reference_id || '');
  const order = publicId ? orderByPublicId(publicId) : null;

  if (order) {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const amountMatches = Number(session.amount_total) === Number(order.total_minor);
      const currencyMatches = String(session.currency || '').toUpperCase() === String(order.currency || '').toUpperCase();
      if (amountMatches && currencyMatches && session.payment_status === 'paid') {
        setOrderStatus(order.public_id, 'paid', String(session.id || ''));
        await notifyOrderIfNeeded(order.public_id);
      }
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      setOrderStatus(order.public_id, event.type.endsWith('failed') ? 'failed' : 'cancelled', String(session?.id || ''));
    }
  }

  res.json({ received: true });
}

function getPage(slug) {
  return db.prepare('SELECT * FROM pages WHERE slug=? AND published=1').get(slug);
}
function renderPage(res, page, extra = {}) {
  if (!page) return res.status(404).render('404', { meta: { title: 'Page not found | WatAir UK', noindex: true } });
  const pageImages = {
    'how-it-works': '/uploads/imported/legacy/images/how-it-works/hydrologic-cycle.svg',
    'water-quality-maintenance': '/images/pw-hr-20l.webp',
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
  res.setHeader('Cache-Control', 'no-store');
  try {
    db.prepare('SELECT 1 AS ok').get();
    res.json({ ok: true, service: 'watair-next', version: appVersion });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ ok: false, service: 'watair-next', version: appVersion });
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
      description: 'Atmospheric Water Generation systems from 20 to 10,000 litres per day for homes, workplaces and industrial applications.',
      image: '/uploads/imported/legacy/media/1027/contact-banner.jpg'
    }
  });
});

app.get('/products', (req, res) => res.render('products', {
  products: products(), category: 'all',
  meta: { title: 'Atmospheric Water Generators | WatAir UK', description: 'Explore WatAir atmospheric water generators from compact 20 litre-per-day home and office systems to 10,000 litre-per-day industrial units.', image: '/uploads/imported/legacy/images/home/products.jpg' }
}));
app.get('/products/home-office', (req, res) => res.render('products', {
  products: productsForCategory('home-office'), category: 'home-office',
  meta: { title: 'Home & Office Atmospheric Water Generators | WatAir UK', description: 'Compact water-from-air systems from 20 to 60 litres per day for homes and workplaces.', image: '/uploads/imported/legacy/media/1003/pw-hr-30l.png' }
}));
app.get('/products/commercial-industrial', (req, res) => res.render('products', {
  products: productsForCategory('commercial-industrial'), category: 'commercial-industrial',
  meta: { title: 'Commercial & Industrial Atmospheric Water Generators | WatAir UK', description: 'Commercial and industrial water-from-air systems from 80 to 10,000 litres per day.', image: '/uploads/imported/legacy/media/1066/5500-product.png' }
}));

// Owner-approved range consolidation. Preserve existing links and search equity
// while directing retired variants to the replacement model that remains live.
const productRedirects = {
  'pw-hr-15l': 'pw-hr-20l',
  'pw-hr-100l': 'pw-hr-100l-low-power-consumption',
  'pw-hr-250l': 'pw-hr-250l-low-power-consumption',
  'pw-hr-500l': 'pw-hr-500l-low-power-consumption',
  'pw-hr-1000l': 'pw-hr-1000l-low-power-consumption',
  'pw-hr-3000l': 'pw-hr-4000l-low-power-consumption',
  'pw-hr-5000l': 'pw-hr-5500l-low-power-consumption',
  'pw-hr-10000l': 'pw-hr-10000l-low-power-consumption'
};
for (const [oldSlug, replacementSlug] of Object.entries(productRedirects)) {
  app.get(`/products/${oldSlug}`, (req,res) => res.redirect(301, `/products/${replacementSlug}`));
  app.get(`/products/${oldSlug}/datasheet.pdf`, (req,res) => res.redirect(301, `/products/${replacementSlug}/datasheet.pdf`));
}
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

  const commerceSettings = settingsObject();
  const commerceGateways = enabledGateways(commerceSettings);
  const deliveryRuleCount = db.prepare(
    "SELECT COUNT(*) c FROM delivery_rules WHERE active=1 AND (delivery_class=? OR delivery_class='*')"
  ).get(String(product.delivery_class || 'standard').toLowerCase()).c;
  const canBuyOnline =
    commerceEnabled(commerceSettings) &&
    Boolean(product.sellable) &&
    Number(product.price_minor) > 0 &&
    commerceGateways.length > 0 &&
    deliveryRuleCount > 0;

  res.render('product', {
    product, related, family, previousProduct, nextProduct,
    canBuyOnline,
    commerceGateways,
    meta: { title: `${product.name}${product.subtitle ? ' – ' + product.subtitle : ''} | WatAir UK`, description: product.summary, image: product.image_url }
  });
});

function checkoutViewData(product, req, overrides = {}) {
  const settings = settingsObject();
  return {
    product,
    gateways: enabledGateways(settings),
    csrf: csrfFor(req),
    error: null,
    formValues: {},
    meta: {
      title: `Buy ${product.name} | WatAir`,
      description: `Secure checkout for ${product.name}.`,
      noindex: true,
      image: product.image_url
    },
    ...overrides
  };
}

app.get('/buy/:slug', (req,res) => {
  const settings = settingsObject();
  const product = sellableProduct(req.params.slug);
  if (!product || !commerceEnabled(settings)) return res.redirect(302, '/products/' + encodeURIComponent(req.params.slug));
  const gateways = enabledGateways(settings);
  const deliveryRules = db.prepare(
    "SELECT COUNT(*) c FROM delivery_rules WHERE active=1 AND (delivery_class=? OR delivery_class='*')"
  ).get(String(product.delivery_class || 'standard').toLowerCase()).c;
  if (!gateways.length || !deliveryRules) {
    return res.status(503).render('checkout', checkoutViewData(product, req, {
      gateways,
      error: !gateways.length
        ? 'Online payment is not configured yet. Please contact WatAir to order this product.'
        : 'Online delivery is not configured for this product yet. Please contact WatAir to order it.'
    }));
  }
  res.render('checkout', checkoutViewData(product, req, { gateways }));
});

app.post('/checkout/quote/:slug', checkoutLimiter, (req,res) => {
  const settings = settingsObject();
  const product = sellableProduct(req.params.slug);
  if (!product || !commerceEnabled(settings)) return res.status(404).json({ error: 'Product is not available for online purchase.' });

  const requestedQty = Math.floor(Number(req.body.quantity || 1));
  const quantity = Number.isFinite(requestedQty)
    ? Math.max(1, Math.min(Number(product.max_order_qty || 1), requestedQty))
    : 1;
  const rule = deliveryQuote(db, product, req.body.country_code, req.body.postcode);
  if (!rule) return res.status(404).json({ error: 'Delivery is not configured for that destination. Please contact WatAir.' });

  const currency = normaliseCurrency(settings.commerce_currency);
  const subtotal = Number(product.price_minor) * quantity;
  const delivery = Number(rule.price_minor || 0);
  res.json({
    currency,
    quantity,
    subtotal_minor: subtotal,
    delivery_minor: delivery,
    total_minor: subtotal + delivery,
    delivery_label: rule.name,
    delivery_formatted: formatMoney(delivery, currency),
    total_formatted: formatMoney(subtotal + delivery, currency)
  });
});

app.post('/checkout/:slug', checkoutLimiter, requireCsrf, async (req,res) => {
  const settings = settingsObject();
  const product = sellableProduct(req.params.slug);
  if (!product || !commerceEnabled(settings)) return res.status(404).send('Product is not available for online purchase.');

  const gateways = enabledGateways(settings);
  if (cleanFormValue(req.body.website, 500)) return res.redirect(303, '/products/' + encodeURIComponent(product.slug));
  const gateway = cleanFormValue(req.body.gateway, 30);
  const gatewayAllowed = gateways.some(item => item.id === gateway);
  const maxQty = Math.max(1, Number(product.max_order_qty || 1));
  const quantity = Math.max(1, Math.min(maxQty, Math.floor(Number(req.body.quantity || 1)) || 1));
  const formValues = {
    customer_name: cleanFormValue(req.body.customer_name, 150),
    customer_email: cleanFormValue(req.body.customer_email, 254).toLowerCase(),
    customer_phone: cleanFormValue(req.body.customer_phone, 80),
    address1: cleanFormValue(req.body.address1, 180),
    address2: cleanFormValue(req.body.address2, 180),
    city: cleanFormValue(req.body.city, 120),
    region: cleanFormValue(req.body.region, 120),
    postcode: cleanFormValue(req.body.postcode, 24),
    country_code: cleanFormValue(req.body.country_code, 2).toUpperCase(),
    quantity,
    gateway,
    accept_terms: req.body.accept_terms === '1'
  };

  const missing = !formValues.customer_name || !validEmail(formValues.customer_email) ||
    !formValues.address1 || !formValues.city || !formValues.postcode ||
    !/^[A-Z]{2}$/.test(formValues.country_code) || !formValues.accept_terms || !gatewayAllowed;
  const rule = missing ? null : deliveryQuote(db, product, formValues.country_code, formValues.postcode);

  if (missing || !rule) {
    const error = missing
      ? 'Please complete the required contact, delivery, payment and terms fields.'
      : 'Delivery is not configured for that destination. Please contact WatAir before ordering.';
    return res.status(400).render('checkout', checkoutViewData(product, req, { gateways, error, formValues }));
  }

  const currency = normaliseCurrency(settings.commerce_currency);
  const unitPrice = Math.max(0, Number(product.price_minor || 0));
  const delivery = Math.max(0, Number(rule.price_minor || 0));
  const total = unitPrice * quantity + delivery;
  const publicId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO orders(
      public_id,product_id,product_slug,product_name,quantity,currency,
      unit_price_minor,delivery_minor,total_minor,
      customer_name,customer_email,customer_phone,
      address1,address2,city,region,postcode,country_code,
      gateway,status,notes,terms_accepted_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    publicId, product.id, product.slug, product.name, quantity, currency,
    unitPrice, delivery, total,
    formValues.customer_name, formValues.customer_email, formValues.customer_phone,
    formValues.address1, formValues.address2, formValues.city, formValues.region,
    formValues.postcode, formValues.country_code,
    gateway, gateway === 'manual' ? 'awaiting_payment' : 'pending',
    'Delivery rule: ' + rule.name,
    new Date().toISOString()
  );

  const order = orderByPublicId(publicId);

  try {
    if (gateway === 'manual') {
      await notifyOrderIfNeeded(publicId);
      return res.redirect(303, '/order/' + encodeURIComponent(publicId));
    }

    if (gateway === 'stripe') {
      const session = await createStripeCheckout({
        order,
        baseUrl,
        secret: process.env.STRIPE_SECRET_KEY
      });
      if (!session?.id || !session?.url) throw new Error('Stripe did not return a checkout session.');
      db.prepare('UPDATE orders SET gateway_ref=?,updated_at=CURRENT_TIMESTAMP WHERE public_id=?')
        .run(String(session.id), publicId);
      return res.redirect(303, session.url);
    }

    if (gateway === 'paypal') {
      const paypalOrder = await createPayPalOrder({
        order,
        baseUrl,
        brandName: settings.site_name || 'WatAir'
      });
      const approveUrl = paypalOrder?.links?.find(link => link.rel === 'payer-action' || link.rel === 'approve')?.href;
      if (!paypalOrder?.id || !approveUrl) throw new Error('PayPal did not return an approval link.');
      db.prepare('UPDATE orders SET gateway_ref=?,updated_at=CURRENT_TIMESTAMP WHERE public_id=?')
        .run(String(paypalOrder.id), publicId);
      return res.redirect(303, approveUrl);
    }

    throw new Error('Unsupported payment gateway.');
  } catch (err) {
    console.error('Checkout provider error:', err.message);
    setOrderStatus(publicId, 'failed');
    return res.status(502).render('checkout', checkoutViewData(product, req, {
      gateways,
      error: 'The payment provider could not be reached. No completed payment has been recorded. Please try again or contact WatAir.',
      formValues
    }));
  }
});

app.get('/payments/stripe/return', async (req,res) => {
  const order = orderByPublicId(req.query.order);
  const sessionId = cleanFormValue(req.query.session_id, 220);
  if (!order || order.gateway !== 'stripe' || !sessionId) return res.redirect('/products');

  try {
    const session = await retrieveStripeSession(sessionId, process.env.STRIPE_SECRET_KEY);
    const publicId = String(session?.metadata?.order_id || session?.client_reference_id || '');
    const amountMatches = Number(session?.amount_total) === Number(order.total_minor);
    const currencyMatches = String(session?.currency || '').toUpperCase() === String(order.currency || '').toUpperCase();
    if (publicId === order.public_id && amountMatches && currencyMatches && session.payment_status === 'paid') {
      setOrderStatus(order.public_id, 'paid', String(session.id || ''));
      await notifyOrderIfNeeded(order.public_id);
    }
  } catch (err) {
    console.error('Stripe return verification failed:', err.message);
  }
  res.redirect(303, '/order/' + encodeURIComponent(order.public_id));
});

app.get('/payments/paypal/return', async (req,res) => {
  const order = orderByPublicId(req.query.order);
  const paypalOrderId = cleanFormValue(req.query.token, 220);
  if (!order || order.gateway !== 'paypal' || !paypalOrderId) return res.redirect('/products');
  if (['paid','processing','fulfilled','refunded'].includes(order.status)) {
    return res.redirect(303, '/order/' + encodeURIComponent(order.public_id));
  }

  try {
    if (order.gateway_ref && order.gateway_ref !== paypalOrderId) throw new Error('PayPal order reference does not match.');
    const capture = await capturePayPalOrder(paypalOrderId);
    if (paypalPaymentMatches(capture, order)) {
      setOrderStatus(order.public_id, 'paid', paypalOrderId);
      await notifyOrderIfNeeded(order.public_id);
    } else {
      setOrderStatus(order.public_id, 'failed', paypalOrderId);
    }
  } catch (err) {
    console.error('PayPal capture response:', err.message);
    try {
      const authoritative = await retrievePayPalOrder(paypalOrderId);
      if (paypalPaymentMatches(authoritative, order)) {
        setOrderStatus(order.public_id, 'paid', paypalOrderId);
        await notifyOrderIfNeeded(order.public_id);
      } else {
        setOrderStatus(order.public_id, 'failed', paypalOrderId);
      }
    } catch (verifyErr) {
      console.error('PayPal verification failed:', verifyErr.message);
      setOrderStatus(order.public_id, 'failed', paypalOrderId);
    }
  }
  res.redirect(303, '/order/' + encodeURIComponent(order.public_id));
});

app.get('/order/:publicId', (req,res) => {
  let order = orderByPublicId(req.params.publicId);
  if (!order) return res.status(404).render('404', { meta: { title: 'Order not found | WatAir', noindex: true } });
  if (req.query.payment === 'cancelled' && order.status === 'pending') {
    setOrderStatus(order.public_id, 'cancelled');
    order = orderByPublicId(order.public_id);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.render('order', {
    order,
    meta: {
      title: 'Order status | WatAir',
      description: 'WatAir order status.',
      noindex: true
    }
  });
});

app.get('/how-it-works', (req, res) => renderPage(res, getPage('how-it-works')));
app.get('/water-quality-maintenance', (req, res) => renderPage(res, getPage('water-quality-maintenance')));
app.get('/about', (req, res) => renderPage(res, getPage('about')));
app.get('/environment/plastic-bottles', (req, res) => renderPage(res, getPage('plastic-bottles')));
app.get('/environment/mains-water', (req, res) => renderPage(res, getPage('mains-water')));
app.get('/resellers', (req, res) => renderPage(res, getPage('resellers')));
app.get(['/leasing','/leasing/'], (req, res) => res.redirect(301, '/contact'));
app.get('/privacy', (req, res) => renderPage(res, getPage('privacy')));
app.get('/terms', (req, res) => renderPage(res, getPage('terms')));
app.get('/refunds', (req, res) => renderPage(res, getPage('refunds')));
app.get('/cookies', (req, res) => renderPage(res, getPage('cookies')));
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
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nDisallow: /buy/\nDisallow: /checkout/\nDisallow: /order/\nDisallow: /payments/\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, ch => ({
    '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'
  })[ch]);
}

function sitemapDate(value) {
  const date = parseStoredDate(value);
  return date ? date.toISOString().slice(0,10) : null;
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
    { path: '/water-quality-maintenance', lastmod: pageUpdated['water-quality-maintenance'] },
    { path: '/faqs', lastmod: siteLastmod },
    { path: '/about', lastmod: pageUpdated.about },
    { path: '/environment/plastic-bottles', lastmod: pageUpdated['plastic-bottles'] },
    { path: '/environment/mains-water', lastmod: pageUpdated['mains-water'] },
    { path: '/resellers', lastmod: pageUpdated.resellers },
    { path: '/privacy', lastmod: pageUpdated.privacy },
    { path: '/terms', lastmod: pageUpdated.terms },
    { path: '/refunds', lastmod: pageUpdated.refunds },
    { path: '/cookies', lastmod: pageUpdated.cookies },
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
  const commerceSettings = settingsObject();
  const commerceOn = commerceEnabled(commerceSettings);
  const sellableProducts = db.prepare("SELECT COUNT(*) c FROM products WHERE published=1 AND sellable=1 AND price_minor>0").get().c;
  const activeDeliveryRules = db.prepare("SELECT COUNT(*) c FROM delivery_rules WHERE active=1").get().c;
  const activeGateways = enabledGateways(commerceSettings);
  const commerceReady = !commerceOn || (sellableProducts > 0 && activeDeliveryRules > 0 && activeGateways.length > 0);
  const legalCommercePagesReady = ['terms','refunds','privacy','cookies'].every(slug => Boolean(getPage(slug)));
  let canonicalHost = '';
  try { canonicalHost = new URL(baseUrl).hostname.toLowerCase(); } catch {}
  const canonicalReady = baseUrl.startsWith('https://') && ['watair.co.uk','www.watair.co.uk'].includes(canonicalHost);
  const sessionSecretReady =
    String(process.env.SESSION_SECRET || '').length >= 32 &&
    process.env.SESSION_SECRET !== 'replace-with-at-least-32-random-characters';
  const trustProxyReady = Boolean(process.env.TRUST_PROXY);

  const releaseChecks = [
    {
      label: 'Session signing secret',
      ok: sessionSecretReady,
      detail: sessionSecretReady ? 'A production session secret is configured' : 'Set a unique SESSION_SECRET of at least 32 characters'
    },
    {
      label: 'Reverse-proxy client IP handling',
      ok: trustProxyReady,
      detail: trustProxyReady ? `TRUST_PROXY is set to ${process.env.TRUST_PROXY}` : 'Set TRUST_PROXY=1 behind the Plesk/nginx reverse proxy'
    },
    {
      label: 'Final canonical URL',
      ok: canonicalReady,
      detail: canonicalReady ? baseUrl : `Currently ${baseUrl} — set BASE_URL to the final WatAir domain before launch`
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
    },
    {
      label: 'E-commerce configuration',
      ok: commerceReady,
      detail: !commerceOn
        ? 'Online sales are safely disabled'
        : commerceReady
          ? `${sellableProducts} sellable product(s), ${activeDeliveryRules} delivery rule(s), ${activeGateways.length} payment option(s)`
          : 'Commerce is enabled but needs a sellable product, delivery rule and configured payment option'
    },
    {
      label: 'Commerce legal pages',
      ok: legalCommercePagesReady,
      detail: legalCommercePagesReady ? 'Terms, refunds, privacy and cookie notices are published' : 'One or more commerce legal pages are missing'
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
  res.render('admin/products', {
    products: products('1=1'),
    reqQuery: req.query,
    meta: { title: 'Products | WatAir CMS' }
  });
});

app.get('/admin/products/new', (req,res) => {
  res.render('admin/product-edit', {
    isNew: true,
    product: {
      id: null, slug: '', name: '', subtitle: '', category: 'home-office',
      capacity_lpd: 0, summary: '', specs: {}, image_url: '',
      featured: 0, published: 0, sort_order: 999,
      sellable: 0, price_minor: 0, delivery_class: 'standard', max_order_qty: 1
    },
    meta: { title: 'Add Product | WatAir CMS' }
  });
});

app.post('/admin/products/new', requireCsrf, (req,res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).send('Product name is required');
  const slug = uniqueProductSlug(name);
  const specs = specsFromBody(req.body);
  const priceMinor = parseMoneyToMinor(req.body.price);
  if (req.body.sellable && (priceMinor === null || priceMinor <= 0)) return res.status(400).send('A valid price is required for a sellable product.');
  const result = db.prepare(`INSERT INTO products
    (slug,name,subtitle,category,capacity_lpd,summary,specs_json,image_url,featured,published,sort_order,
     sellable,price_minor,delivery_class,max_order_qty,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
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
      Number(req.body.sort_order || 999),
      req.body.sellable ? 1 : 0,
      priceMinor || 0,
      String(req.body.delivery_class || 'standard').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').slice(0,60) || 'standard',
      Math.max(1, Math.min(25, Number(req.body.max_order_qty || 1)))
    );
  res.redirect(`/admin/products/${result.lastInsertRowid}?created=1`);
});

app.get('/admin/products/:id', (req,res) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
  if (!product) return res.status(404).send('Product not found');
  res.render('admin/product-edit', {
    isNew: false,
    product,
    reqQuery: req.query,
    meta: { title: `Edit ${product.name} | WatAir CMS` }
  });
});

app.post('/admin/products/:id', requireCsrf, (req,res) => {
  const specs = specsFromBody(req.body);
  const priceMinor = parseMoneyToMinor(req.body.price);
  if (req.body.sellable && (priceMinor === null || priceMinor <= 0)) return res.status(400).send('A valid price is required for a sellable product.');
  db.prepare(`UPDATE products
    SET name=?,subtitle=?,category=?,capacity_lpd=?,summary=?,specs_json=?,image_url=?,featured=?,published=?,sort_order=?,
        sellable=?,price_minor=?,delivery_class=?,max_order_qty=?,updated_at=CURRENT_TIMESTAMP
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
      req.body.sellable ? 1 : 0,
      priceMinor || 0,
      String(req.body.delivery_class || 'standard').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').slice(0,60) || 'standard',
      Math.max(1, Math.min(25, Number(req.body.max_order_qty || 1))),
      req.params.id
    );
  res.redirect(`/admin/products/${req.params.id}?saved=1`);
});

app.post('/admin/products/:id/delete', requireCsrf, (req,res) => {
  const product = db.prepare('SELECT id,name,slug FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.status(404).send('Product not found');

  const confirmation = String(req.body.delete_confirmation || '').trim();
  if (confirmation !== product.name) {
    return res.redirect(`/admin/products/${product.id}?delete_error=1`);
  }

  db.prepare('DELETE FROM products WHERE id=?').run(product.id);
  res.redirect('/admin/products?product_deleted=1');
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

function cleanExternalUrl(value) {
  const text = String(value || '').trim().slice(0, 500);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:','https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function cleanNavigationUrl(value) {
  const text = String(value || '').trim().slice(0, 500);
  if (!text) return '';
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  if (text.startsWith('#')) return text;
  if (/^(mailto:|tel:)/i.test(text)) return text.replace(/[\r\n]/g, '');
  try {
    const url = new URL(text);
    if (!['http:','https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function navigationRows() {
  return db.prepare('SELECT * FROM navigation_items ORDER BY sort_order,id').all();
}

app.get('/admin/navigation', (req,res) => {
  res.render('admin/navigation', {
    items: navigationRows(),
    reqQuery: req.query,
    meta: { title: 'Navigation | WatAir CMS' }
  });
});

app.post('/admin/navigation/new', requireCsrf, (req,res) => {
  const label = String(req.body.label || '').trim().slice(0, 100);
  const url = cleanNavigationUrl(req.body.url);
  const style = req.body.style === 'cta' ? 'cta' : 'link';
  if (!label || !url) return res.status(400).send('A label and valid internal or external URL are required.');

  const nextOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order),0) n FROM navigation_items').get().n || 0) + 10;
  db.prepare(`
    INSERT INTO navigation_items(label,url,item_type,style,sort_order,active,new_window)
    VALUES(?,?,'custom',?,?,1,?)
  `).run(label, url, style, nextOrder, req.body.new_window ? 1 : 0);

  res.redirect('/admin/navigation?created=1');
});

app.post('/admin/navigation/:id', requireCsrf, (req,res) => {
  const item = db.prepare('SELECT * FROM navigation_items WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).send('Navigation item not found.');

  const label = String(req.body.label || '').trim().slice(0, 100);
  if (!label) return res.status(400).send('Navigation label is required.');

  const isSimple = item.item_type === 'custom' || item.builtin_key === 'contact';
  const url = isSimple ? cleanNavigationUrl(req.body.url) : item.url;
  if (isSimple && !url) return res.status(400).send('A valid navigation URL is required.');

  const requestedOrder = Number.parseInt(req.body.sort_order, 10);
  const sortOrder = Number.isFinite(requestedOrder)
    ? Math.max(-9999, Math.min(99999, requestedOrder))
    : Number(item.sort_order || 100);
  const style = isSimple && req.body.style === 'cta' ? 'cta' : 'link';

  db.prepare(`
    UPDATE navigation_items
    SET label=?,url=?,style=?,sort_order=?,active=?,new_window=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    label,
    url,
    style,
    sortOrder,
    req.body.active ? 1 : 0,
    isSimple && req.body.new_window ? 1 : 0,
    item.id
  );

  res.redirect('/admin/navigation?saved=1');
});

app.post('/admin/navigation/:id/move', requireCsrf, (req,res) => {
  const rows = navigationRows();
  const index = rows.findIndex(item => Number(item.id) === Number(req.params.id));
  if (index < 0) return res.status(404).send('Navigation item not found.');

  const direction = req.body.direction === 'up' ? -1 : req.body.direction === 'down' ? 1 : 0;
  const targetIndex = index + direction;
  if (!direction || targetIndex < 0 || targetIndex >= rows.length) return res.redirect('/admin/navigation');

  const normalized = rows.map((item, i) => ({ ...item, normalizedOrder: (i + 1) * 10 }));
  const current = normalized[index];
  const target = normalized[targetIndex];

  const tx = db.transaction(() => {
    normalized.forEach(item => {
      db.prepare('UPDATE navigation_items SET sort_order=? WHERE id=?').run(item.normalizedOrder, item.id);
    });
    db.prepare('UPDATE navigation_items SET sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(target.normalizedOrder, current.id);
    db.prepare('UPDATE navigation_items SET sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(current.normalizedOrder, target.id);
  });
  tx();

  res.redirect('/admin/navigation?moved=1');
});

app.post('/admin/navigation/:id/delete', requireCsrf, (req,res) => {
  const item = db.prepare('SELECT * FROM navigation_items WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).send('Navigation item not found.');
  if (item.item_type !== 'custom') return res.status(400).send('Built-in navigation items can be hidden but not deleted.');
  db.prepare('DELETE FROM navigation_items WHERE id=?').run(item.id);
  res.redirect('/admin/navigation?deleted=1');
});

app.get('/admin/settings', (req,res) => {
  res.render('admin/settings', { values: settingsObject(), meta: { title: 'Site Settings | WatAir CMS' } });
});
app.post('/admin/settings', requireCsrf, (req,res) => {
  const allowed = ['site_name','email','phone','hero_title','hero_text','hero_image','hero_image_style','catalogue_hero_eyebrow','catalogue_hero_title','catalogue_hero_text','catalogue_hero_image','catalogue_hero_image_style','footer_text','company_location','facebook_url','instagram_url','linkedin_url'];
  const socialKeys = new Set(['facebook_url','instagram_url','linkedin_url']);
  const upsert = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(() => allowed.forEach(k => {
    const value = socialKeys.has(k)
      ? cleanExternalUrl(req.body[k])
      : String(req.body[k] || '').slice(0,2000);
    upsert.run(k, value);
  }));
  tx();
  res.redirect('/admin/settings?saved=1');
});

app.get('/admin/commerce', (req,res) => {
  res.render('admin/commerce', {
    settings: settingsObject(),
    gatewayConfig: gatewayConfiguration(),
    deliveryRules: db.prepare('SELECT * FROM delivery_rules ORDER BY priority,id').all(),
    meta: { title: 'Commerce | WatAir CMS' }
  });
});

app.post('/admin/commerce/settings', requireCsrf, (req,res) => {
  const currency = normaliseCurrency(req.body.commerce_currency);
  const values = {
    commerce_enabled: req.body.commerce_enabled ? '1' : '0',
    commerce_currency: currency,
    commerce_stripe_enabled: req.body.commerce_stripe_enabled ? '1' : '0',
    commerce_paypal_enabled: req.body.commerce_paypal_enabled ? '1' : '0',
    commerce_manual_enabled: req.body.commerce_manual_enabled ? '1' : '0',
    commerce_price_note: String(req.body.commerce_price_note || '').trim().slice(0,300)
  };
  const upsert = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(() => Object.entries(values).forEach(([key,value]) => upsert.run(key,value)));
  tx();
  res.redirect('/admin/commerce?saved=1');
});

function deliveryRuleValues(body) {
  const priceMinor = parseMoneyToMinor(body.price);
  if (priceMinor === null || priceMinor < 0) return null;
  const deliveryClass = String(body.delivery_class || 'standard')
    .trim().toLowerCase().replace(/[^a-z0-9_*-]+/g,'-').slice(0,60) || 'standard';
  const countryCode = String(body.country_code || 'GB').trim().toUpperCase();
  if (countryCode !== '*' && !/^[A-Z]{2}$/.test(countryCode)) return null;
  return {
    name: String(body.name || '').trim().slice(0,120),
    deliveryClass,
    countryCode,
    postcodePrefixes: String(body.postcode_prefixes || '').toUpperCase().replace(/[^A-Z0-9, *-]/g,'').slice(0,500),
    priceMinor,
    priority: Math.max(-10000, Math.min(10000, Number(body.priority || 100))),
    active: body.active ? 1 : 0
  };
}

app.post('/admin/commerce/delivery-rules', requireCsrf, (req,res) => {
  const rule = deliveryRuleValues({ ...req.body, active: true });
  if (!rule?.name) return res.status(400).send('A valid delivery rule name, country and price are required.');
  db.prepare(`
    INSERT INTO delivery_rules(name,delivery_class,country_code,postcode_prefixes,price_minor,priority,active)
    VALUES(?,?,?,?,?,?,?)
  `).run(rule.name,rule.deliveryClass,rule.countryCode,rule.postcodePrefixes,rule.priceMinor,rule.priority,rule.active);
  res.redirect('/admin/commerce?rule_created=1');
});

app.post('/admin/commerce/delivery-rules/:id', requireCsrf, (req,res) => {
  const rule = deliveryRuleValues(req.body);
  if (!rule?.name) return res.status(400).send('A valid delivery rule name, country and price are required.');
  db.prepare(`
    UPDATE delivery_rules
    SET name=?,delivery_class=?,country_code=?,postcode_prefixes=?,price_minor=?,priority=?,active=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(rule.name,rule.deliveryClass,rule.countryCode,rule.postcodePrefixes,rule.priceMinor,rule.priority,rule.active,req.params.id);
  res.redirect('/admin/commerce?rule_saved=1');
});

app.post('/admin/commerce/delivery-rules/:id/delete', requireCsrf, (req,res) => {
  db.prepare('DELETE FROM delivery_rules WHERE id=?').run(req.params.id);
  res.redirect('/admin/commerce?rule_deleted=1');
});

app.get('/admin/orders', (req,res) => {
  res.render('admin/orders', {
    orders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC,id DESC LIMIT 500').all(),
    meta: { title: 'Orders | WatAir CMS' }
  });
});

app.post('/admin/orders/:id/status', requireCsrf, (req,res) => {
  const allowed = new Set(['pending','awaiting_payment','paid','processing','fulfilled','cancelled','refunded','failed']);
  const status = String(req.body.status || '');
  if (!allowed.has(status)) return res.status(400).send('Invalid order status.');
  db.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,req.params.id);
  res.redirect('/admin/orders');
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
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
