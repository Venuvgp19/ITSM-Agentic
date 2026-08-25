const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'posted_approvals.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

// Maps approval id -> { channel, ts, status }
let cache = load();

module.exports = {
  get(id) {
    return cache[id];
  },
  set(id, entry) {
    cache[id] = { ...cache[id], ...entry };
    save(cache);
  },
  has(id) {
    return Object.prototype.hasOwnProperty.call(cache, id);
  },
};
