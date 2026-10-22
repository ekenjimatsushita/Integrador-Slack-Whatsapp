const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { httpErrorHandler } = require('../httpErrorHandler');

async function startServer(t) {
  const app = express();
  app.post('/echo', express.json({ limit: '1kb' }), (_request, response) => response.json({ ok: true }));
  app.get('/boom', () => { throw new Error('internal detail'); });
  app.use(httpErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('malformed JSON returns a generic 400 without echoing the body or a stack trace', async (t) => {
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"conversationId": CONTEUDO-PRIVADO',
  });
  const body = await response.text();

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(body), { error: 'Invalid request.' });
  assert.doesNotMatch(body, /CONTEUDO|node_modules|SyntaxError/);
});

test('an oversized body keeps its 413 status with a generic message', async (t) => {
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: 'a'.repeat(3000) }),
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'Invalid request.' });
});

test('an unexpected error returns a generic 500 without internal details', async (t) => {
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/boom`);
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(body), { error: 'Internal error.' });
  assert.doesNotMatch(body, /internal detail/);
});
