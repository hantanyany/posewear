// Serve the real source UI with fixture catalogs. No preview process or network is needed.
const fs = require('node:fs');
const path = require('node:path');

const origin = 'http://posewear.test';
const source = path.resolve(__dirname, '../../src');

function serveSite(catalogs = {}) {
  return route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const name = url.pathname.slice(1) || 'index.html';
    if (name.endsWith('.json')) return route.fulfill({json:catalogs[name] || []});
    const file = path.join(source,name);
    return fs.existsSync(file) ? route.fulfill({path:file}) : route.fulfill({status:404,body:''});
  };
}

module.exports = {origin, serveSite};
