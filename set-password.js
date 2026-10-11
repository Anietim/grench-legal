'use strict';
// Developer tool: set the owner's password from the terminal.
//   node set-password.js "NewPassword123"
// Works whether the server is running or not. Keep this file out of public reach.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error('Usage: node set-password.js "NewPassword"   (at least 10 characters)'); process.exit(1); }
const dir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')); fs.mkdirSync(dir, { recursive: true });
const salt = crypto.randomBytes(16).toString('hex');
const rec = { user: 'owner', mustChange: false, salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify(rec, null, 2));
console.log('Done. The owner can now log in with username "owner" and the password you just set.');
