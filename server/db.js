// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Tiny JSON-file store. Swap for Postgres/SQLite when you have real traffic; the shape stays the same.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, 'data', 'db.json');
fs.mkdirSync(path.dirname(FILE), { recursive: true });

const empty = { users: {}, magic: {}, sessions: {} };
let data = empty;
try { data = { ...empty, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* first run */ }

let timer = null;
export const db = {
  data,
  user(email) { return (data.users[email] ||= { email, plan: 'free', expires: null, stripeCustomerId: null, subscriptionId: null, createdAt: Date.now() }); },
  findByCustomer(id) { return Object.values(data.users).find(u => u.stripeCustomerId === id); },
  save() { clearTimeout(timer); timer = setTimeout(() => fs.writeFileSync(FILE, JSON.stringify(data, null, 2)), 50); },
};
