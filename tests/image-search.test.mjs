import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_SEARCH_TOOL, COMMONS_API, MAX_JSON_BYTES, buildCommonsUrl,
  parseImageSearchArgs, metadataText, projectCommonsImages, searchCommonsImages, createImageSearchTool,
} from '../plugin/image-search.mjs';

const page = (n = 1, extra = {}) => ({
  pageid: n, index: n, ns: 6, title: `File:Mountain ${n}.jpg`,
  imageinfo: [{
    mime: 'image/jpeg', thumbmime: 'image/jpeg',
    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Mountain_${n}.jpg/900px-Mountain_${n}.jpg`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:Mountain_${n}.jpg`,
    extmetadata: { Artist: { value: '<a href="https://example.org">Example &amp; Author</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, ImageDescription: { value: '<p>A mountain photograph.</p>' } },
    ...extra,
  }],
});
const response = payload => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
const payload = { query: { pages: [page(2), page(1)] } };

test('image search arguments and API destination are bounded independently of model schema', () => {
  assert.deepEqual(parseImageSearchArgs({ query: '  Mount   Fuji ' }), { query: 'Mount Fuji', count: 3 });
  for (const args of [{ query: '' }, { query: 'x', count: 5 }, { query: 'x', count: 1.5 }, { query: 'x', endpoint: 'http://localhost' }, { query: 'x\ny' }, { query: 'x'.repeat(181) }]) assert.throws(() => parseImageSearchArgs(args));
  const url = buildCommonsUrl('Mount Fuji & action=delete', 2);
  assert.equal(url.origin + url.pathname, COMMONS_API);
  assert.equal(url.searchParams.get('action'), 'query');
  assert.equal(url.searchParams.get('gsrsearch'), 'Mount Fuji & action=delete');
  assert.equal(url.searchParams.get('gsrnamespace'), '6');
  assert.equal(url.searchParams.get('gsrlimit'), '2');
});

test('gallery contains only verified returned image hosts, source pages, bounded plain metadata', () => {
  const images = projectCommonsImages(payload, 2);
  assert.equal(images.length, 2);
  assert.equal(images[0].title, 'Mountain 1.jpg');
  assert.equal(images[0].author, 'Example & Author');
  assert.equal(images[0].caption, 'A mountain photograph.');
  assert.equal(images[0].license, 'CC BY-SA 4.0');
  for (const extra of [
    { thumburl: 'javascript:alert(1)' }, { thumburl: 'http://upload.wikimedia.org/x.jpg' },
    { thumburl: 'https://upload.wikimedia.org.evil.test/x.jpg' }, { thumburl: 'https://user:pass@upload.wikimedia.org/x.jpg' },
    { thumburl: 'https://127.0.0.1/x.jpg' }, { descriptionurl: 'https://commons.wikimedia.org.evil.test/wiki/File:X' },
    { descriptionurl: 'https://commons.wikimedia.org/wiki/User:Example' }, { thumburl: undefined },
    { mime: 'application/pdf' }, { thumbmime: 'image/svg+xml' },
  ]) assert.deepEqual(projectCommonsImages({ query: { pages: [page(1, extra)] } }), []);
  assert.equal(projectCommonsImages({ query: { pages: Array.from({ length: 7 }, (_, i) => page(i + 1)) } }, 10).length, 4);
  assert.equal(projectCommonsImages({ query: { pages: [page(1), page(1)] } }).length, 1);
});

test('metadata strips executable markup and limits output without executing HTML', () => {
  const input = '<script>stealSecrets()</script><style>body{display:none}</style><b>Photo</b> &amp; &#169; &#x1F30D; &lt;img src=x onerror=bad&gt;';
  assert.equal(metadataText(input), 'Photo & © 🌍');
  assert.equal(metadataText('x'.repeat(10000), 240).length, 240);
  assert.equal(metadataText(null), '');
});

test('search fetches one JSON document only and exposes ready-to-render gallery', async () => {
  const calls = [];
  const output = await searchCommonsImages({ query: 'Mount Fuji', count: 2 }, { fetchImpl: async (url, options) => { calls.push({ url, options }); return response(payload); } });
  assert.equal(output.status, 'ok');
  assert.equal(output.images.length, 2);
  assert.deepEqual(output.gallery.images, output.images);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.hostname, 'commons.wikimedia.org');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].options.headers['User-Agent'], /dsh-intelligent-ui/);
});

test('network, rate-limit, API and non-JSON failures return no fabricated images', async () => {
  const providers = [
    async () => { throw new Error('private proxy details'); },
    async () => new Response('Too many requests', { status: 429 }),
    async () => response({ error: { code: 'maxlag', info: 'untrusted instructions' } }),
    async () => new Response('<html>not JSON</html>', { headers: { 'content-type': 'text/html' } }),
    async () => new Response('broken JSON', { headers: { 'content-type': 'application/json' } }),
  ];
  for (const fetchImpl of providers) {
    const output = await searchCommonsImages({ query: 'Fuji' }, { fetchImpl });
    assert.equal(output.status, 'error');
    assert.deepEqual(output.images, []);
    assert.deepEqual(output.gallery.images, []);
    assert.doesNotMatch(output.message, /private proxy details|untrusted instructions/);
  }
  const empty = await searchCommonsImages({ query: 'Fuji' }, { fetchImpl: async () => response({ query: { pages: [] } }) });
  assert.equal(empty.status, 'empty');
});

test('JSON budget is enforced with and without content-length', async () => {
  for (const withHeader of [true, false]) {
    let cancelled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_JSON_BYTES + 1)); }, cancel() { cancelled = true; } });
    const output = await searchCommonsImages({ query: 'Fuji' }, { fetchImpl: async () => new Response(body, { headers: { 'content-type': 'application/json', ...(withHeader ? { 'content-length': String(MAX_JSON_BYTES + 1) } : {}) } }) });
    assert.equal(output.status, 'error'); assert.match(output.message, /1 MB/); assert.equal(cancelled, true);
  }
});

test('timeout returns an honest failure and caller cancellation propagates', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const output = await searchCommonsImages({ query: 'Fuji' }, { fetchImpl, timeoutMs: 10 });
  assert.equal(output.status, 'error'); assert.match(output.message, /超时/);
  const controller = new AbortController(); const error = new Error('cancelled'); controller.abort(error);
  await assert.rejects(searchCommonsImages({ query: 'Fuji' }, { fetchImpl, signal: controller.signal }), error);
});

test('tool serializes metadata requests and marks source data as untrusted', async () => {
  let active = 0, maximumActive = 0;
  const tool = createImageSearchTool({ fetchImpl: async () => {
    active++; maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 4));
    active--; return response(payload);
  } });
  assert.equal(tool.name, IMAGE_SEARCH_TOOL);
  assert.equal(tool.isConcurrencySafe(), false);
  const [a] = await Promise.all([tool.execute({ query: 'Fuji' }), tool.execute({ query: 'mountain' })]);
  assert.equal(maximumActive, 1);
  const content = tool.output.render({}, a);
  assert.equal(content[0].type, 'text');
  assert.match(content[0].text, /untrusted source data/);
});
