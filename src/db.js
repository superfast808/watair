const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { products, pages } = require('./content');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'watair.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(col => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  eyebrow TEXT DEFAULT '',
  hero TEXT NOT NULL,
  intro TEXT DEFAULT '',
  body_html TEXT DEFAULT '',
  seo_title TEXT DEFAULT '',
  seo_description TEXT DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  category TEXT NOT NULL,
  capacity_lpd INTEGER NOT NULL DEFAULT 0,
  summary TEXT DEFAULT '',
  specs_json TEXT NOT NULL DEFAULT '{}',
  image_url TEXT DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  interest TEXT DEFAULT '',
  message TEXT NOT NULL,
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'new'
);
`);

ensureColumn('pages', 'hero_image', "TEXT DEFAULT ''");
ensureColumn('pages', 'hero_style', "TEXT DEFAULT ''");
ensureColumn('admins', 'display_name', "TEXT DEFAULT ''");

const defaultProductImages = {
  'pw-hr-20l': '/images/pw-hr-20l.webp',
  'pw-hr-25l-low-power-consumption': '/uploads/imported/legacy/media/1040/25l-1x.png',
  'pw-hr-30l': '/uploads/imported/legacy/media/1003/pw-hr-30l.png',
  'pw-hr-60l': '/uploads/imported/legacy/media/1004/pw-hr-60l.png',
  'pw-hr-80l-low-power-consumption': '/uploads/imported/legacy/media/1050/80l-product-small-2.png',
  'pw-hr-100l': '/uploads/imported/legacy/media/1005/pw-hr-100l.png',
  'pw-hr-100l-low-power-consumption': '/uploads/imported/legacy/media/1053/100-l-product.png',
  'pw-hr-250l': '/uploads/imported/legacy/media/1006/pw-hr-250l.png',
  'pw-hr-250l-low-power-consumption': '/uploads/imported/legacy/media/1054/250l-product.png',
  'pw-hr-500l': '/uploads/imported/legacy/media/1007/pw-hr-500l.png',
  'pw-hr-500l-low-power-consumption': '/uploads/imported/legacy/media/1072/500l-product.png',
  'pw-hr-1000l': '/uploads/imported/legacy/media/1008/pw-hr-1000l.png',
  'pw-hr-1000l-low-power-consumption': '/uploads/imported/legacy/media/1056/500l-product.png',
  'pw-hr-2000l-low-power-consumption': '/uploads/imported/legacy/media/1058/2000l-product.png',
  'pw-hr-3000l': '/uploads/imported/legacy/media/1009/pw-hr-3000l.png',
  'pw-hr-4000l-low-power-consumption': '/uploads/imported/legacy/media/1064/4000l-product.png',
  'pw-hr-5000l': '/uploads/imported/legacy/media/1010/pw-hr-5000l.png',
  'pw-hr-5500l-low-power-consumption': '/uploads/imported/legacy/media/1066/5500-product.png',
  'pw-hr-8000l-low-power-consumption': '/uploads/imported/legacy/media/1068/8000l-product.png',
  'pw-hr-10000l': '/uploads/imported/legacy/media/1001/pw-hr-10000l.png',
  'pw-hr-10000l-low-power-consumption': '/uploads/imported/legacy/media/1070/10000l-pro.png'
};

function seed() {
  const productCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (!productCount) {
    const insert = db.prepare(`INSERT INTO products
      (slug,name,subtitle,category,capacity_lpd,summary,specs_json,featured,sort_order)
      VALUES (@slug,@name,@subtitle,@category,@capacity_lpd,@summary,@specs_json,@featured,@sort_order)`);
    const tx = db.transaction(() => products.forEach((p, i) => insert.run({
      slug: p.slug,
      name: p.name,
      subtitle: p.subtitle || '',
      category: p.category,
      capacity_lpd: p.capacity_lpd,
      summary: p.summary,
      specs_json: JSON.stringify(p.specs || {}),
      featured: ['pw-hr-20l','pw-hr-80l-low-power-consumption','pw-hr-10000l-low-power-consumption'].includes(p.slug) ? 1 : 0,
      sort_order: i
    })));
    tx();
  }

  const imageUpdate = db.prepare(`
    UPDATE products
    SET image_url=?
    WHERE slug=? AND (image_url IS NULL OR TRIM(image_url)='')
  `);
  const imageTx = db.transaction(() => {
    Object.entries(defaultProductImages).forEach(([slug, image]) => imageUpdate.run(image, slug));
  });
  imageTx();

  // Once the owner's legacy library has been imported, move any remaining
  // product references off the old host and onto the local repository copy.
  db.prepare(`
    UPDATE products
    SET image_url = REPLACE(image_url, 'https://www.watairuk.co.uk/', '/uploads/imported/legacy/')
    WHERE image_url LIKE 'https://www.watairuk.co.uk/%'
  `).run();

  // Seed any newly introduced core page without overwriting CMS edits to existing pages.
  const insertPage = db.prepare(`INSERT OR IGNORE INTO pages
    (slug,title,eyebrow,hero,intro,body_html,seo_title,seo_description)
    VALUES (@slug,@title,@eyebrow,@hero,@intro,@body,@seo_title,@seo_description)`);
  const pageTx = db.transaction(() => pages.forEach(p => insertPage.run({
    ...p,
    seo_title: `${p.title} | WatAir UK`,
    seo_description: p.intro.slice(0, 160)
  })));
  pageTx();

  const defaults = {
    site_name: 'WatAir UK',
    email: 'info@watairuk.co.uk',
    phone: '0141 442 0201',
    hero_title: 'Water from air. Wherever you need it.',
    hero_text: 'Atmospheric Water Generation for homes, workplaces and industrial-scale applications, producing fresh water directly from ambient air.',
    hero_image: '/uploads/imported/legacy/media/1027/contact-banner.jpg',
    hero_image_style: 'photo',
    footer_text: 'Atmospheric Water Generation solutions for the UK and Overseas.',
    company_location: 'Glasgow, United Kingdom'
  };
  const set = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  Object.entries(defaults).forEach(([k,v]) => set.run(k,v));

  db.prepare(`UPDATE settings SET value='Water from air. Wherever you need it.'
    WHERE key='hero_title' AND value='Fresh water. Made from air.'`).run();

  db.prepare(`
    UPDATE settings
    SET value = REPLACE(value, 'https://www.watairuk.co.uk/', '/uploads/imported/legacy/')
    WHERE key='hero_image' AND value LIKE 'https://www.watairuk.co.uk/%'
  `).run();

  // Owner-approved October 2026 catalogue refresh. Run once so existing CMS
  // databases receive the same range changes as fresh installations.
  const catalogueRefreshKey = 'owner_catalogue_refresh_2026_10';
  if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get(catalogueRefreshKey)) {
    const approved20Specs = {
      'Output': 'Hot & cold',
      'Storage capacity': '8 Litres',
      'Water generated': '20 Litres/day at 30°C & 80% RH',
      'Water temperature': 'Cold 6°C / Hot 82°C',
      'Working temperature': '15–45°C',
      'Working humidity': '30–99% RH',
      'Dimensions': '53.1 × 30.7 × 58 cm',
      'Net weight': '29 kg',
      'Refrigerant': 'R134a',
      'Input power': '370 W production + 500 W heating',
      'Power supply': 'AC 110V 60Hz / AC 220V 50Hz',
      'Filtration & sterilisation': 'Air filter + softening + sediment + ultrafiltration membrane + post-carbon + LED-UV',
      'Display': 'LCD touch screen'
    };
    const retiredSlugs = [
      'pw-hr-100l',
      'pw-hr-250l',
      'pw-hr-500l',
      'pw-hr-1000l',
      'pw-hr-3000l',
      'pw-hr-5000l',
      'pw-hr-10000l'
    ];

    const refresh = db.transaction(() => {
      const old20 = db.prepare("SELECT id FROM products WHERE slug='pw-hr-15l'").get();
      const current20 = db.prepare("SELECT id FROM products WHERE slug='pw-hr-20l'").get();

      if (old20 && !current20) {
        db.prepare(`
          UPDATE products SET
            slug='pw-hr-20l',
            name='PW HR-20L',
            subtitle='Desktop / Countertop',
            category='home-office',
            capacity_lpd=20,
            summary='Compact desktop and countertop atmospheric water generator with hot and cold drinking water for homes and workplaces.',
            specs_json=?,
            image_url='/images/pw-hr-20l.webp',
            published=1,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(JSON.stringify(approved20Specs), old20.id);
      } else if (current20) {
        db.prepare(`
          UPDATE products SET
            name='PW HR-20L',
            subtitle='Desktop / Countertop',
            category='home-office',
            capacity_lpd=20,
            summary='Compact desktop and countertop atmospheric water generator with hot and cold drinking water for homes and workplaces.',
            specs_json=?,
            image_url='/images/pw-hr-20l.webp',
            published=1,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(JSON.stringify(approved20Specs), current20.id);
        if (old20) db.prepare('DELETE FROM products WHERE id=?').run(old20.id);
      }

      db.prepare('UPDATE products SET featured=0').run();
      for (const slug of ['pw-hr-20l','pw-hr-80l-low-power-consumption','pw-hr-10000l-low-power-consumption']) {
        db.prepare('UPDATE products SET featured=1 WHERE slug=? AND published=1').run(slug);
      }
      for (const slug of retiredSlugs) {
        db.prepare('DELETE FROM products WHERE slug=?').run(slug);
      }

      db.prepare("DELETE FROM pages WHERE slug='leasing'").run();

      db.prepare("INSERT INTO settings(key,value) VALUES('hero_image','/uploads/imported/legacy/media/1027/contact-banner.jpg') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
      db.prepare("INSERT INTO settings(key,value) VALUES('hero_text','Atmospheric Water Generation for homes, workplaces and industrial-scale applications, producing fresh water directly from ambient air.') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
      db.prepare("INSERT INTO settings(key,value) VALUES('hero_image_style','photo') ON CONFLICT(key) DO UPDATE SET value='photo'").run();
      db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(catalogueRefreshKey, new Date().toISOString());
    });
    refresh();
  }

  // Follow-up cleanup is deliberately separate so databases that already ran
  // the first owner refresh also get the final hard removals and approved hero.
  const catalogueCleanupKey = 'owner_catalogue_cleanup_2026_10_v2';
  if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get(catalogueCleanupKey)) {
    const retiredSlugs = [
      'pw-hr-100l',
      'pw-hr-250l',
      'pw-hr-500l',
      'pw-hr-1000l',
      'pw-hr-3000l',
      'pw-hr-5000l',
      'pw-hr-10000l'
    ];
    const cleanup = db.transaction(() => {
      for (const slug of retiredSlugs) db.prepare('DELETE FROM products WHERE slug=?').run(slug);
      db.prepare("DELETE FROM products WHERE slug='pw-hr-15l'").run();

      db.prepare("INSERT INTO settings(key,value) VALUES('hero_image','/uploads/imported/legacy/media/1027/contact-banner.jpg') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
      db.prepare("INSERT INTO settings(key,value) VALUES('hero_image_style','photo') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
      db.prepare("INSERT INTO settings(key,value) VALUES('hero_text','Atmospheric Water Generation for homes, workplaces and industrial-scale applications, producing fresh water directly from ambient air.') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();

      db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(catalogueCleanupKey, new Date().toISOString());
    });
    cleanup();
  }

  // Owner-approved positioning refresh. Apply once to existing databases, then
  // leave the value editable in the CMS thereafter.
  const positioningRefreshKey = 'owner_positioning_refresh_2026_10_v1';
  if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get(positioningRefreshKey)) {
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO settings(key,value) VALUES('footer_text','Atmospheric Water Generation solutions for the UK and Overseas.') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
      db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(positioningRefreshKey, new Date().toISOString());
    });
    tx();
  }

  // Remove incidental UK-only wording from editable core pages while
  // preserving the approved "UK and Overseas" positioning line.
  const globalCopyRefreshKey = 'owner_global_copy_refresh_2026_10_v1';
  if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get(globalCopyRefreshKey)) {
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE pages
        SET intro='WatAir promotes Atmospheric Water Generation technology from compact home and office systems to large commercial and industrial installations.',
            updated_at=CURRENT_TIMESTAMP
        WHERE slug='about'
          AND intro='WatAir UK was formed to promote Atmospheric Water Generation technology across the UK, from compact home and office systems to large industrial installations.'
      `).run();

      const how = db.prepare("SELECT id,body_html FROM pages WHERE slug='how-it-works'").get();
      if (how?.body_html) {
        const oldBlock = '<h2>Designed for the UK climate</h2><p>Output depends on temperature and relative humidity. The UK’s generally humid climate can make atmospheric water generation particularly relevant, while each model has its own operating range shown on the product specification page.</p>';
        const newBlock = '<h2>Designed around real operating conditions</h2><p>Output depends on temperature and relative humidity, so expected performance should always be assessed against the conditions at the installation site. Each model has its own operating range shown on the product specification page.</p>';
        const refreshed = how.body_html.replace(oldBlock, newBlock);
        if (refreshed !== how.body_html) {
          db.prepare('UPDATE pages SET body_html=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(refreshed, how.id);
        }
      }

      db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(globalCopyRefreshKey, new Date().toISOString());
    });
    tx();
  }

  const adminCount = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (!adminCount) {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || '');
    const production = process.env.NODE_ENV === 'production';
    const usingExampleCredentials =
      email === 'admin@example.com' ||
      password === 'replace-with-a-long-unique-password';

    if (production && usingExampleCredentials) {
      throw new Error('Refusing to create the first production admin with example credentials. Set a real ADMIN_EMAIL and unique ADMIN_PASSWORD.');
    }
    if (production && (!email || !password)) {
      throw new Error('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD before the first production boot.');
    }
    if (production && !/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error('ADMIN_EMAIL must be a valid email address before the first production boot.');
    }
    if (production && (password.length < 14 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      throw new Error('ADMIN_PASSWORD must be at least 14 characters and contain at least one letter and one number.');
    }

    if (email && password) {
      const hash = bcrypt.hashSync(password, 12);
      db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?)').run(email, hash);
    } else {
      const hash = bcrypt.hashSync('ChangeMe-Development-Only!', 12);
      db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?)').run('admin@localhost', hash);
      console.warn('DEV ONLY admin: admin@localhost / ChangeMe-Development-Only!');
    }
  }
}

function settingsObject() {
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
}

seed();
module.exports = { db, settingsObject };
