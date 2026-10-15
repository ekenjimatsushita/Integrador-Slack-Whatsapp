const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JsonStateStore } = require('../persistence/JsonStateStore');

async function createStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whatsapp-mock-state-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'mock-state.json');
  const store = new JsonStateStore({ filePath });
  await store.initialize();
  return { filePath, store };
}

test('initializes an empty state file and restores mappings and messages after reload', async (t) => {
  const { filePath, store } = await createStore(t);
  const mapping = {
    channelId: 'C_LAB',
    threadTs: '1710000000.000001',
    conversationId: 'mock-conversation-1',
  };
  const message = {
    conversationId: mapping.conversationId,
    text: 'Mensagem de laboratório',
    metadata: { channelId: mapping.channelId, threadTs: mapping.threadTs },
    receivedAt: '2026-10-15T12:00:00.000Z',
  };

  await store.saveConversation(mapping);
  await store.appendMessage(message, 500);

  const reloadedStore = new JsonStateStore({ filePath });
  await reloadedStore.initialize();

  assert.deepEqual(reloadedStore.listConversations(), [mapping]);
  assert.deepEqual(reloadedStore.listMessages(), [message]);
});

test('updates a mapping for the same channel and thread instead of duplicating it', async (t) => {
  const { store } = await createStore(t);
  const first = {
    channelId: 'C_LAB',
    threadTs: '1710000000.000001',
    conversationId: 'mock-conversation-old',
  };
  const replacement = { ...first, conversationId: 'mock-conversation-new' };

  await store.saveConversation(first);
  await store.saveConversation(replacement);

  assert.deepEqual(store.listConversations(), [replacement]);
});

test('keeps only the newest messages up to the configured limit', async (t) => {
  const { filePath, store } = await createStore(t);

  for (let index = 1; index <= 3; index += 1) {
    await store.appendMessage({
      conversationId: 'mock-conversation-1',
      text: `Mensagem ${index}`,
      metadata: { sequence: index },
      receivedAt: `2026-10-15T12:00:0${index}.000Z`,
    }, 2);
  }

  const reloadedStore = new JsonStateStore({ filePath });
  await reloadedStore.initialize();
  assert.deepEqual(reloadedStore.listMessages().map(message => message.text), ['Mensagem 2', 'Mensagem 3']);
});

test('serializes concurrent writes without losing messages or corrupting JSON', async (t) => {
  const { filePath, store } = await createStore(t);
  const messages = Array.from({ length: 25 }, (_, index) => ({
    conversationId: 'mock-conversation-concurrent',
    text: `Concurrent message ${index}`,
    metadata: { sequence: index },
    receivedAt: `2026-10-15T12:00:${String(index).padStart(2, '0')}.000Z`,
  }));

  await Promise.all(messages.map(message => store.appendMessage(message, 500)));

  const persistedState = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const reloadedStore = new JsonStateStore({ filePath });
  await reloadedStore.initialize();

  assert.equal(persistedState.messages.length, messages.length);
  assert.deepEqual(reloadedStore.listMessages(), messages);
});

test('rejects persisted state with an unsupported schema version', async (t) => {
  const { filePath } = await createStore(t);
  await fs.writeFile(filePath, JSON.stringify({ version: 2, conversations: [], messages: [] }));

  const reloadedStore = new JsonStateStore({ filePath });
  await assert.rejects(() => reloadedStore.initialize(), /unsupported format/);
});

test('rejects malformed persisted JSON instead of silently replacing it', async (t) => {
  const { filePath } = await createStore(t);
  await fs.writeFile(filePath, '{not-json');

  const reloadedStore = new JsonStateStore({ filePath });
  await assert.rejects(() => reloadedStore.initialize(), SyntaxError);
  assert.equal(await fs.readFile(filePath, 'utf8'), '{not-json');
});
