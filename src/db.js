const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { products, pages } = require('./content');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'watair.db'));
db.pragma('journal_mode = WAL');
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

const legacyProductImages = {
  'pw-hr-15l': 'https://www.watairuk.co.uk/media/1002/pw-hr-15l.png',
  'pw-hr-25l-low-power-consumption': 'https://www.watairuk.co.uk/media/1040/25l-1x.png',
  'pw-hr-30l': 'https://www.watairuk.co.uk/media/1003/pw-hr-30l.png',
  'pw-hr-60l': 'https://www.watairuk.co.uk/media/1004/pw-hr-60l.png',
  'pw-hr-80l-low-power-consumption': 'https://www.watairuk.co.uk/media/1050/80l-product-small-2.png',
  'pw-hr-100l': 'https://www.watairuk.co.uk/media/1005/pw-hr-100l.png',
  'pw-hr-100l-low-power-consumption': 'https://www.watairuk.co.uk/media/1053/100-l-product.png',
  'pw-hr-250l': 'https://www.watairuk.co.uk/media/1006/pw-hr-250l.png',
  'pw-hr-250l-low-power-consumption': 'https://www.watairuk.co.uk/media/1054/250l-product.png',
  'pw-hr-500l': 'https://www.watairuk.co.uk/media/1007/pw-hr-500l.png',
  'pw-hr-500l-low-power-consumption': 'https://www.watairuk.co.uk/media/1072/500l-product.png',
  'pw-hr-1000l': 'https://www.watairuk.co.uk/media/1008/pw-hr-1000l.png',
  'pw-hr-1000l-low-power-consumption': 'https://www.watairuk.co.uk/media/1056/500l-product.png',
  'pw-hr-2000l-low-power-consumption': 'https://www.watairuk.co.uk/media/1058/2000l-product.png',
  'pw-hr-3000l': 'https://www.watairuk.co.uk/media/1009/pw-hr-3000l.png',
  'pw-hr-4000l-low-power-consumption': 'https://www.watairuk.co.uk/media/1064/4000l-product.png',
  'pw-hr-5000l': 'https://www.watairuk.co.uk/media/1010/pw-hr-5000l.png',
  'pw-hr-5500l-low-power-consumption': 'https://www.watairuk.co.uk/media/1066/5500-product.png',
  'pw-hr-8000l-low-power-consumption': 'https://www.watairuk.co.uk/media/1068/8000l-product.png',
  'pw-hr-10000l': 'https://www.watairuk.co.uk/media/1001/pw-hr-10000l.png',
  'pw-hr-10000l-low-power-consumption': 'https://www.watairuk.co.uk/media/1070/10000l-pro.png'
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
      featured: [0,2,16].includes(i) ? 1 : 0,
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
    Object.entries(legacyProductImages).forEach(([slug, image]) => imageUpdate.run(image, slug));
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
    hero_text: 'Atmospheric Water Generation for homes, workplaces and industrial-scale water resilience.',
    hero_image: 'https://www.watairuk.co.uk/images/home/products.jpg',
    footer_text: 'Atmospheric Water Generation solutions for the UK.',
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

  const adminCount = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (!adminCount) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      const hash = bcrypt.hashSync(password, 12);
      db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?)').run(email.toLowerCase(), hash);
    } else if (process.env.NODE_ENV !== 'production') {
      const hash = bcrypt.hashSync('ChangeMe-Development-Only!', 12);
      db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?)').run('admin@localhost', hash);
      console.warn('DEV ONLY admin: admin@localhost / ChangeMe-Development-Only!');
    } else {
      console.warn('No admin created. Set ADMIN_EMAIL and ADMIN_PASSWORD, then restart before first use.');
    }
  }
}

function settingsObject() {
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
}

seed();
module.exports = { db, settingsObject };
