const test = require('node:test');
const assert = require('node:assert/strict');
const { MockWhatsAppAdapter } = require('../adapters/MockWhatsAppAdapter');
const { ConversationRegistry } = require('../adapters/slack/ConversationRegistry');
const { MessageRouter } = require('../application/MessageRouter');
const { createSlackMessageHandler } = require('../slackMessageHandler');
const { createSlackMessagePublisher } = require('../slackMessagePublisher');

const ALLOWED_CHANNEL = 'C_ALLOWED';
const ROOT_TS = '1710000000.000001';
const CONVERSATION_ID = 'wa-conversation-42';

function setup() {
  const whatsappAdapter = new MockWhatsAppAdapter();
  const conversationRegistry = new ConversationRegistry();
  conversationRegistry.register(ALLOWED_CHANNEL, ROOT_TS, CONVERSATION_ID);
  const messageRouter = new MessageRouter({
    whatsappAdapter,
    conversationRegistry,
    allowedChannelId: ALLOWED_CHANNEL,
  });
  const handler = createSlackMessageHandler(messageRouter);
  return { whatsappAdapter, conversationRegistry, messageRouter, handler };
}

function humanReply(overrides = {}) {
  return {
    message: {
      text: 'Resposta para o mock',
      user: 'U_HUMAN',
      channel: ALLOWED_CHANNEL,
      thread_ts: ROOT_TS,
      ts: '1710000000.000002',
      ...overrides,
    },
  };
}

test('Bolt human message reaches MessageRouter with normalized Slack fields', async () => {
  const received = [];
  const handler = createSlackMessageHandler({
    async route(message) {
      received.push(message);
      return { forwarded: false, reason: 'conversation-not-found' };
    },
  });

  await handler({
    message: {
      text: 'Mensagem humana',
      user: 'U_HUMAN',
      channel: ALLOWED_CHANNEL,
      ts: '1710000000.000010',
    },
  });

  assert.deepEqual(received, [{
    id: '1710000000.000010',
    platform: 'slack',
    channelId: ALLOWED_CHANNEL,
    senderId: 'U_HUMAN',
    senderIsBot: false,
    text: 'Mensagem humana',
    threadTs: undefined,
  }]);
});

test('a reply in a mapped Slack thread reaches the right mock conversation', async () => {
  const { handler, whatsappAdapter } = setup();

  const result = await handler(humanReply());

  assert.deepEqual(result, { forwarded: true, conversationId: CONVERSATION_ID });
  assert.deepEqual(whatsappAdapter.listMessages().map(({ conversationId, text, metadata }) => ({
    conversationId,
    text,
    metadata,
  })), [{
    conversationId: CONVERSATION_ID,
    text: 'Resposta para o mock',
    metadata: {
      channelId: ALLOWED_CHANNEL,
      senderId: 'U_HUMAN',
      threadTs: ROOT_TS,
      messageId: '1710000000.000002',
    },
  }]);
});

test('the bot own message is filtered before it can loop into the mock', async () => {
  const { handler, whatsappAdapter } = setup();

  const result = await handler(humanReply({
    text: 'Mensagem publicada pelo bot',
    user: 'U_BOT',
    bot_id: 'B_BOT',
    bot_profile: { id: 'B_BOT' },
  }));

  assert.deepEqual(result, { forwarded: false, reason: 'unsupported-message' });
  assert.equal(whatsappAdapter.listMessages().length, 0);
});

test('a message from another Slack channel is rejected by MessageRouter', async () => {
  const { handler, whatsappAdapter } = setup();

  const result = await handler(humanReply({ channel: 'C_OTHER' }));

  assert.deepEqual(result, { forwarded: false, reason: 'channel-not-allowed' });
  assert.equal(whatsappAdapter.listMessages().length, 0);
});

test('an allowed-channel reply without a registered parent thread is not routed', async () => {
  const { handler, whatsappAdapter } = setup();

  const result = await handler(humanReply({ thread_ts: '1710000999.000009' }));

  assert.deepEqual(result, { forwarded: false, reason: 'conversation-not-found' });
  assert.equal(whatsappAdapter.listMessages().length, 0);
});

test('a mock WhatsApp conversation is mapped to the Slack root thread for later replies', async () => {
  const { conversationRegistry, handler, whatsappAdapter } = setup();
  const adapter = new MockWhatsAppAdapter();
  const publisher = createSlackMessagePublisher({
    channelId: ALLOWED_CHANNEL,
    conversationRegistry,
    slackClient: {
      chat: {
        async postMessage(request) {
          assert.equal(request.channel, ALLOWED_CHANNEL);
          return { ok: true, channel: ALLOWED_CHANNEL, ts: '1710000000.000050' };
        },
      },
    },
  });
  adapter.onMessage(publisher);

  await adapter.receiveMessage({ conversationId: 'wa-conversation-new', text: 'Nova conversa mock' });
  const result = await handler(humanReply({
    thread_ts: '1710000000.000050',
    text: 'Resposta na conversa nova',
  }));

  assert.deepEqual(result, { forwarded: true, conversationId: 'wa-conversation-new' });
  assert.equal(whatsappAdapter.listMessages()[0].conversationId, 'wa-conversation-new');
  assert.equal(whatsappAdapter.listMessages()[0].text, 'Resposta na conversa nova');
});

test('a Slack API rejection does not create a thread mapping', async () => {
  const conversationRegistry = new ConversationRegistry();
  const publish = createSlackMessagePublisher({
    channelId: ALLOWED_CHANNEL,
    conversationRegistry,
    slackClient: { chat: { async postMessage() { return { ok: false }; } } },
  });

  await assert.rejects(
    () => publish({ conversationId: CONVERSATION_ID, text: 'Mensagem de teste' }),
    /Slack rejected the mock message/,
  );
  assert.equal(conversationRegistry.resolve(ALLOWED_CHANNEL, ROOT_TS), undefined);
});
