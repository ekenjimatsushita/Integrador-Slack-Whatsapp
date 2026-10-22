const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createWhatsAppAdapter } = require('../adapters/createWhatsAppAdapter');
const { MockWhatsAppAdapter } = require('../adapters/MockWhatsAppAdapter');
const { ConversationRegistry } = require('../adapters/slack/ConversationRegistry');
const { EventDeduplicator } = require('../application/EventDeduplicator');
const { MessageRouter } = require('../application/MessageRouter');
const { JsonStateStore } = require('../persistence/JsonStateStore');
const { createSlackFailureNotifier, NOTICES } = require('../slackFailureNotifier');
const { createSlackMessageHandler } = require('../slackMessageHandler');
const { createSlackMessagePublisher } = require('../slackMessagePublisher');

const CHANNEL = 'C_ALLOWED';
const ROOT_TS = '1710000000.000001';
const CONVERSATION_ID = 'wa-conversation-42';

function fakeSlackClient() {
  const posts = [];
  let counter = 100;
  return {
    posts,
    chat: {
      async postMessage(request) {
        posts.push(request);
        counter += 1;
        return { ok: true, channel: request.channel, ts: `1710000000.000${counter}` };
      },
    },
  };
}

function setup({ whatsappAdapter = new MockWhatsAppAdapter(), stateStore } = {}) {
  const slackClient = fakeSlackClient();
  const conversationRegistry = new ConversationRegistry();
  conversationRegistry.register(CHANNEL, ROOT_TS, CONVERSATION_ID);
  const messageRouter = new MessageRouter({
    whatsappAdapter,
    conversationRegistry,
    allowedChannelId: CHANNEL,
    deduplicator: new EventDeduplicator({ stateStore }),
    failureNotifier: createSlackFailureNotifier({ slackClient }),
    slackPublisher: createSlackMessagePublisher({ slackClient, channelId: CHANNEL, conversationRegistry }),
    sleep: async () => {},
  });
  const handler = createSlackMessageHandler(messageRouter);
  return { slackClient, conversationRegistry, messageRouter, handler, whatsappAdapter };
}

function humanReply(overrides = {}) {
  return {
    message: {
      text: 'Resposta humana',
      user: 'U_HUMAN',
      channel: CHANNEL,
      thread_ts: ROOT_TS,
      ts: '1710000000.000002',
      ...overrides,
    },
  };
}

async function createStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whatsapp-reliability-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'state.json');
  const store = new JsonStateStore({ filePath });
  await store.initialize();
  return { filePath, store };
}

test('later WhatsApp messages of a conversation are posted in its existing Slack thread', async () => {
  const { slackClient, messageRouter, conversationRegistry } = setup();

  const first = await messageRouter.routeFromWhatsApp({ conversationId: 'wa-new', messageId: 'm1', text: 'Oi' });
  const second = await messageRouter.routeFromWhatsApp({ conversationId: 'wa-new', messageId: 'm2', text: 'Tudo bem?' });

  assert.equal(first.createdThread, true);
  assert.equal(second.createdThread, false);
  assert.equal(second.threadTs, first.threadTs);
  assert.equal(slackClient.posts[0].thread_ts, undefined);
  assert.equal(slackClient.posts[1].thread_ts, first.threadTs);
  assert.equal(conversationRegistry.resolve(CHANNEL, first.threadTs), 'wa-new');
});

test('the conversation thread is found again after a restart from persisted mappings', async (t) => {
  const { filePath, store } = await createStore(t);
  await new ConversationRegistry({ stateStore: store }).register(CHANNEL, ROOT_TS, CONVERSATION_ID);

  const reloaded = new JsonStateStore({ filePath });
  await reloaded.initialize();
  const registry = new ConversationRegistry({ initialMappings: reloaded.listConversations() });

  assert.equal(registry.findThread(CHANNEL, CONVERSATION_ID), ROOT_TS);
});

test('a redelivered WhatsApp message is published to Slack only once', async () => {
  const { slackClient, messageRouter } = setup();
  const message = { conversationId: 'wa-new', messageId: 'wamid.1', text: 'Oi' };

  const results = await Promise.all([
    messageRouter.routeFromWhatsApp(message),
    messageRouter.routeFromWhatsApp(message),
  ]);
  const later = await messageRouter.routeFromWhatsApp(message);

  assert.equal(results.filter(result => result.published).length, 1);
  assert.deepEqual(later, { published: false, reason: 'duplicate' });
  assert.equal(slackClient.posts.length, 1);
});

test('a WhatsApp message whose Slack publication failed can be delivered when the provider retries', async () => {
  let failing = true;
  const conversationRegistry = new ConversationRegistry();
  const slackClient = fakeSlackClient();
  const publisher = createSlackMessagePublisher({ slackClient, channelId: CHANNEL, conversationRegistry });
  const messageRouter = new MessageRouter({
    whatsappAdapter: new MockWhatsAppAdapter(),
    conversationRegistry,
    allowedChannelId: CHANNEL,
    deduplicator: new EventDeduplicator(),
    slackPublisher: async (message) => {
      if (failing) throw new Error('slack unavailable');
      return publisher(message);
    },
    sleep: async () => {},
  });
  const message = { conversationId: 'wa-new', messageId: 'wamid.2', text: 'Oi' };

  await assert.rejects(() => messageRouter.routeFromWhatsApp(message), /slack unavailable/);
  failing = false;
  const result = await messageRouter.routeFromWhatsApp(message);

  assert.equal(result.published, true);
  assert.equal(messageRouter.getStats().inbound.rejected['publish-failed'], 1);
});

test('a redelivered Slack event is sent to WhatsApp only once', async () => {
  const { handler, whatsappAdapter } = setup();

  const first = await handler(humanReply());
  const second = await handler(humanReply());

  assert.equal(first.forwarded, true);
  assert.deepEqual(second, { forwarded: false, reason: 'duplicate' });
  assert.equal(whatsappAdapter.listMessages().length, 1);
});

test('processed event keys survive a restart', async (t) => {
  const { filePath, store } = await createStore(t);
  await new EventDeduplicator({ stateStore: store }).claim('slack:C:1');

  const reloaded = new JsonStateStore({ filePath });
  await reloaded.initialize();
  const deduplicator = new EventDeduplicator({ stateStore: reloaded });

  assert.equal(await deduplicator.claim('slack:C:1'), false);
  assert.equal(await deduplicator.claim('slack:C:2'), true);
});

test('the deduplicator forgets the oldest keys beyond its limit', async () => {
  const deduplicator = new EventDeduplicator({ maxEvents: 2 });
  await deduplicator.claim('a');
  await deduplicator.claim('b');
  await deduplicator.claim('c');

  assert.equal(deduplicator.has('a'), false);
  assert.equal(deduplicator.has('c'), true);
});

test('a transient WhatsApp failure is retried and then delivered', async () => {
  const adapter = new MockWhatsAppAdapter();
  const send = adapter.sendMessage.bind(adapter);
  let calls = 0;
  adapter.sendMessage = async (message) => {
    calls += 1;
    if (calls < 3) throw new Error('timeout');
    return send(message);
  };
  const { handler, slackClient } = setup({ whatsappAdapter: adapter });

  const result = await handler(humanReply());

  assert.equal(result.forwarded, true);
  assert.equal(calls, 3);
  assert.equal(slackClient.posts.length, 0);
});

test('a WhatsApp failure after all retries is reported in the Slack thread without echoing the text', async () => {
  const adapter = new MockWhatsAppAdapter();
  let calls = 0;
  adapter.sendMessage = async () => { calls += 1; throw new Error('provider down'); };
  const { handler, slackClient, messageRouter } = setup({ whatsappAdapter: adapter });

  const result = await handler(humanReply({ text: 'Conteúdo privado' }));

  assert.deepEqual(result, { forwarded: false, reason: 'delivery-failed' });
  assert.equal(calls, 3);
  assert.deepEqual(slackClient.posts, [{ channel: CHANNEL, thread_ts: ROOT_TS, text: NOTICES['delivery-failed'] }]);
  assert.equal(messageRouter.getStats().rejected['delivery-failed'], 1);
});

test('a non-retryable WhatsApp failure is not retried', async () => {
  const adapter = new MockWhatsAppAdapter();
  let calls = 0;
  adapter.sendMessage = async () => {
    calls += 1;
    const error = new Error('outside the allowed window');
    error.retryable = false;
    throw error;
  };
  const { handler } = setup({ whatsappAdapter: adapter });

  const result = await handler(humanReply());

  assert.equal(result.reason, 'delivery-failed');
  assert.equal(calls, 1);
});

test('a file shared in a mapped thread is not sent and the thread receives a notice', async () => {
  const { handler, slackClient, whatsappAdapter } = setup();

  const result = await handler(humanReply({ subtype: 'file_share', text: '', files: [{ id: 'F1' }] }));

  assert.deepEqual(result, { forwarded: false, reason: 'unsupported-media' });
  assert.equal(whatsappAdapter.listMessages().length, 0);
  assert.deepEqual(slackClient.posts, [{ channel: CHANNEL, thread_ts: ROOT_TS, text: NOTICES['unsupported-media'] }]);
});

test('a file shared outside a mapped thread is ignored without a notice', async () => {
  const { handler, slackClient } = setup();

  const result = await handler(humanReply({ subtype: 'file_share', thread_ts: undefined, files: [{ id: 'F1' }] }));

  assert.deepEqual(result, { forwarded: false, reason: 'conversation-not-found' });
  assert.equal(slackClient.posts.length, 0);
});

test('edited and deleted Slack messages are still ignored', async () => {
  const { handler, whatsappAdapter } = setup();

  for (const subtype of ['message_changed', 'message_deleted']) {
    assert.deepEqual(await handler(humanReply({ subtype })), { forwarded: false, reason: 'unsupported-message' });
  }
  assert.equal(whatsappAdapter.listMessages().length, 0);
});

test('state files written before deduplication existed are still loaded', async (t) => {
  const { filePath } = await createStore(t);
  await fs.writeFile(filePath, JSON.stringify({ version: 1, conversations: [], messages: [] }));

  const store = new JsonStateStore({ filePath });
  await store.initialize();

  assert.deepEqual(store.listProcessedEvents(), []);
});

test('the adapter factory builds the mock and rejects unknown providers', () => {
  assert.equal(createWhatsAppAdapter('mock').name, 'mock');
  assert.throws(() => createWhatsAppAdapter('meta'), error => error.code === 'unsupported_whatsapp_adapter');
});
