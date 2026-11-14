#!/usr/bin/env node
// Reset (or create) a WatAir CMS admin password from the shell.
//
//   docker compose exec web node scripts/reset-admin-password.js            # list admins
//   docker compose exec web node scripts/reset-admin-password.js you@x.com  # prompts for password
//   docker compose exec web node scripts/reset-admin-password.js you@x.com --create
//
// Non-interactive: NEW_PASSWORD='...' node scripts/reset-admin-password.js you@x.com
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { validateAdminPassword } = require('../src/auth');

const dbPath = path.join(__dirname, '..', 'data', 'watair.db');
if (!fs.existsSync(dbPath)) {
  console.error('Database not found at ' + dbPath + '. Run this inside the WatAir container (docker compose exec web ...) or from the app folder.');
  process.exit(1);
}
const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');

const args = process.argv.slice(2);
const create = args.includes('--create');
const email = String(args.find(a => !a.startsWith('--')) || '').trim().toLowerCase();

function hiddenPrompt(question) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) {
      // Piped input: read one line.
      const rl = readline.createInterface({ input: process.stdin });
      rl.once('line', line => { resolve(line); rl.close(); });
      rl.once('close', () => resolve(''));
      return;
    }
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let value = '';
    // Pasted text arrives as one chunk, so handle it character by character.
    const onData = chunk => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
          process.stdout.write('\n'); resolve(value); return;
        } else if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        else if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  const admins = db.prepare('SELECT id,email,display_name FROM admins ORDER BY id').all();
  if (!email) {
    console.log('Admin accounts:');
    for (const a of admins) console.log('  ' + a.email + (a.display_name ? '  (' + a.display_name + ')' : ''));
    console.log('\nUsage: node scripts/reset-admin-password.js <email> [--create]');
    return;
  }
  const admin = db.prepare('SELECT id,email FROM admins WHERE email=?').get(email);
  if (!admin && !create) {
    console.error('No admin with email ' + email + '. Existing: ' + (admins.map(a => a.email).join(', ') || 'none') + '. Add --create to make a new admin.');
    process.exit(1);
  }
  if (!admin && !/^\S+@\S+\.\S+$/.test(email)) { console.error('Not a valid email address.'); process.exit(1); }

  let password = process.env.NEW_PASSWORD;
  if (!password) {
    password = await hiddenPrompt('New password for ' + email + ': ');
    const confirm = process.stdin.isTTY ? await hiddenPrompt('Confirm new password: ') : password;
    if (password !== confirm) { console.error('Passwords do not match. Nothing changed.'); process.exit(1); }
  }
  const problem = validateAdminPassword(password, email);
  if (problem) { console.error(problem + ' Nothing changed.'); process.exit(1); }

  const hash = bcrypt.hashSync(password, 12);
  if (admin) {
    // Bumping updated_at also signs out existing sessions for this account.
    db.prepare('UPDATE admins SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(hash, admin.id);
    console.log('Password updated for ' + email + '. Sign in at /admin/login.');
  } else {
    db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?)').run(email, hash);
    console.log('Admin created: ' + email + '. Sign in at /admin/login.');
  }
})().catch(e => { console.error(e.message); process.exit(1); });
