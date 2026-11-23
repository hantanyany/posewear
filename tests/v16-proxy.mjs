// Pages 转发策略。替换 fetch，验证允许的请求和上游地址。
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/proxy.js';

const site = 'https://posewear-iyoo.pages.dev';
const relay = 'relay.example.com';
const custom = { 'x-proxy-custom': '1' };
const requests = [];

globalThis.fetch = async (url, init) => {
  requests.push({ url, redirect: init.redirect });
  return new Response('{}', { headers: { 'content-type': 'application/json' } });
};

async function status(target, headers = {}, origin = site) {
  const request = new Request(site + '/api/proxy', {
    method: 'POST',
    headers: { origin, 'x-target-url': target, ...headers },
    body: '{}'
  });
  const response = await onRequest({ request, env: { POSEWEAR_PROXY_HOSTS: relay } });
  return response.status;
}

const path = '/v1/images/generations';
assert.equal(await status('https://api.openai.com' + path), 200);
assert.equal(await status('https://' + relay + path, custom), 200);
assert.equal(await status('https://' + relay + path), 403);
assert.equal(await status('https://unconfigured.example.com' + path, custom), 403);
assert.equal(await status('https://' + relay + ':8443' + path, custom), 400);
assert.equal(await status('http://' + relay + path, custom), 400);
assert.equal(await status('https://api.openai.com:8443' + path), 400);
assert.equal(await status('https://' + relay + '/v1/chat/completions', custom), 403);
assert.equal(await status('https://api.openai.com' + path, {}, 'https://other.example.com'), 403);
assert.deepEqual(requests, [
  { url: 'https://api.openai.com' + path, redirect: 'manual' },
  { url: 'https://' + relay + path, redirect: 'manual' }
]);
console.log('PASS Pages proxy configuration and forwarding');
