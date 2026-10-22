const express = require('express');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { JsonStateStore } = require('./persistence/JsonStateStore');
const { App, SocketModeReceiver } = require('@slack/bolt');
const { createWhatsAppAdapter } = require('./adapters/createWhatsAppAdapter');
const { ConversationRegistry } = require('./adapters/slack/ConversationRegistry');
const { EventDeduplicator } = require('./application/EventDeduplicator');
const { MessageRouter } = require('./application/MessageRouter');
const { createSlackFailureNotifier } = require('./slackFailureNotifier');
const { createSlackMessageHandler } = require('./slackMessageHandler');
const { createSlackMessagePublisher } = require('./slackMessagePublisher');

const SOCKET_STATES = ['connecting', 'authenticated', 'connected', 'reconnecting', 'disconnecting', 'disconnected'];

async function main() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!botToken || !appToken) {
    throw new Error('SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be configured.');
  }

  const stateStore = new JsonStateStore({
    filePath: process.env.STATE_FILE || path.join('/data', 'mock-state.json'),
  });
  await stateStore.initialize();
  const whatsappAdapter = createWhatsAppAdapter(process.env.WHATSAPP_ADAPTER || 'mock', { stateStore });
  const conversationRegistry = new ConversationRegistry({
    initialMappings: stateStore.listConversations(),
    stateStore,
  });
  const receiver = new SocketModeReceiver({ appToken, logLevel: 'WARN' });
  let slackConnection = 'connecting';
  for (const state of SOCKET_STATES) receiver.client.on(state, () => { slackConnection = state; });
  const slackApp = new App({ token: botToken, receiver, logLevel: 'WARN' });
  const messageRouter = new MessageRouter({
    whatsappAdapter,
    conversationRegistry,
    allowedChannelId: channelId,
    deduplicator: new EventDeduplicator({ stateStore }),
    failureNotifier: createSlackFailureNotifier({ slackClient: slackApp.client }),
    slackPublisher: channelId ? createSlackMessagePublisher({
      slackClient: slackApp.client,
      channelId,
      conversationRegistry,
      sourceLabel: whatsappAdapter.sourceLabel,
    }) : undefined,
  });
  const handleSlackMessage = createSlackMessageHandler(messageRouter);
  slackApp.message(async (args) => {
    const result = await handleSlackMessage(args);
    if (result?.reason === 'delivery-failed') console.warn('Slack → WhatsApp delivery failed after retries.');
  });
  // Logs only an error code: Slack and provider errors can carry message content.
  slackApp.error(async (error) => {
    console.error(`Slack listener error (${error?.code || error?.data?.error || 'details-suppressed'}).`);
  });
  whatsappAdapter.onMessage(message => messageRouter.routeFromWhatsApp(message));

  const httpApp = express();
  httpApp.get('/health', (_request, response) => {
    const connected = slackConnection === 'connected';
    response.status(connected ? 200 : 503).json({
      status: connected ? 'ok' : 'degraded',
      slack: slackConnection,
      whatsappAdapter: whatsappAdapter.name,
    });
  });
  httpApp.get('/debug/router', (_request, response) => {
    response.json(messageRouter.getStats());
  });
  if (whatsappAdapter.name === 'mock') registerMockEndpoints(httpApp, { channelId, whatsappAdapter });

  const port = Number(process.env.PORT || 3000);
  await slackApp.start();
  console.log('Slack Socket Mode connection started.');
  const server = httpApp.listen(port, '0.0.0.0', () => {
    console.log(`Local HTTP endpoints listening on port ${port}.`);
  });

  const shutdown = async () => {
    await slackApp.stop();
    server.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

function registerMockEndpoints(httpApp, { channelId, whatsappAdapter }) {
  httpApp.get('/mock/whatsapp/messages', (_request, response) => {
    response.json({ messages: whatsappAdapter.listMessages() });
  });
  httpApp.post('/mock/whatsapp/send-test', express.json({ limit: '1kb' }), async (request, response) => {
    if (!channelId) {
      return response.status(503).json({ error: 'SLACK_CHANNEL_ID is not configured.' });
    }
    // An existing conversationId posts into its current thread instead of creating a new one.
    const requestedId = request.body?.conversationId;
    if (requestedId !== undefined && (typeof requestedId !== 'string' || !/^[\w-]{1,100}$/.test(requestedId))) {
      return response.status(400).json({ error: 'conversationId must be 1-100 letters, digits, _ or -.' });
    }

    try {
      const timestamp = new Date().toISOString();
      const conversationId = requestedId || `mock-conversation-${randomUUID()}`;
      const [result] = await whatsappAdapter.receiveMessage({
        conversationId,
        messageId: `mock-message-${randomUUID()}`,
        text: `Teste real de integração MockWhatsAppAdapter → Slack (${timestamp}).`,
      });
      if (!result?.published) throw new Error('The mock message was not published.');
      return response.status(200).json({
        status: 'sent',
        conversationId,
        threadTs: result.threadTs,
        createdThread: result.createdThread,
      });
    } catch (_error) {
      return response.status(502).json({ error: 'Slack did not accept the mock test message.' });
    }
  });
}

if (require.main === module) {
  main().catch((error) => {
    const safeCodes = new Set([
      'invalid_auth', 'not_authed', 'token_revoked', 'missing_scope', 'not_in_channel',
      'channel_not_found', 'account_inactive', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT',
      'EAI_AGAIN', 'EACCES', 'EADDRINUSE', 'unsupported_whatsapp_adapter',
    ]);
    const possibleCode = error?.data?.error || error?.code;
    const safeCode = safeCodes.has(possibleCode) ? possibleCode : 'details-suppressed';
    const safeName = error?.name === 'TypeError' ? 'TypeError' : 'Error';
    console.error(`Startup failed (${safeName}; ${safeCode}). Check Socket Mode and Slack app configuration.`);
    process.exitCode = 1;
  });
}

module.exports = { main };
