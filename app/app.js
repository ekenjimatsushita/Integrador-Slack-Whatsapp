const express = require('express');
const { App } = require('@slack/bolt');
const { MockWhatsAppAdapter } = require('./adapters/MockWhatsAppAdapter');
const { ConversationRegistry } = require('./adapters/slack/ConversationRegistry');
const { MessageRouter } = require('./application/MessageRouter');
const { createSlackMessageHandler } = require('./slackMessageHandler');
const { createSlackMessagePublisher } = require('./slackMessagePublisher');

async function main() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!botToken || !appToken) {
    throw new Error('SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be configured.');
  }

  const whatsappAdapter = new MockWhatsAppAdapter();
  const conversationRegistry = new ConversationRegistry();
  const messageRouter = new MessageRouter({
    whatsappAdapter,
    conversationRegistry,
    allowedChannelId: channelId,
  });
  const slackApp = new App({
    token: botToken,
    socketMode: true,
    appToken,
    logLevel: 'WARN',
  });
  slackApp.message(createSlackMessageHandler(messageRouter));
  if (channelId) {
    whatsappAdapter.onMessage(createSlackMessagePublisher({
      slackClient: slackApp.client,
      channelId,
      conversationRegistry,
    }));
  }

  const httpApp = express();
  httpApp.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok', slack: 'started', whatsappAdapter: 'mock' });
  });
  httpApp.get('/mock/whatsapp/messages', (_request, response) => {
    response.json({ messages: whatsappAdapter.listMessages() });
  });
  httpApp.get('/debug/router', (_request, response) => {
    response.json(messageRouter.getStats());
  });
  let testMessageAttempted = false;
  httpApp.post('/mock/whatsapp/send-test', async (_request, response) => {
    if (!channelId) {
      return response.status(503).json({ error: 'SLACK_CHANNEL_ID is not configured.' });
    }
    if (testMessageAttempted) {
      return response.status(409).json({ error: 'The test message was already attempted in this run.' });
    }

    testMessageAttempted = true;
    try {
      const timestamp = new Date().toISOString();
      const conversationId = `mock-conversation-${Date.now()}`;
      const [slackResponse] = await whatsappAdapter.receiveMessage({
        conversationId,
        text: `Teste real de integração MockWhatsAppAdapter → Slack (${timestamp}).`,
      });
      return response.status(200).json({
        status: 'sent',
        conversationId,
        threadTs: slackResponse.ts,
      });
    } catch (_error) {
      return response.status(502).json({ error: 'Slack did not accept the mock test message.' });
    }
  });

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

if (require.main === module) {
  main().catch((error) => {
    const safeCodes = new Set([
      'invalid_auth', 'not_authed', 'token_revoked', 'missing_scope', 'not_in_channel',
      'channel_not_found', 'account_inactive', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT',
      'EAI_AGAIN', 'EACCES', 'EADDRINUSE',
    ]);
    const possibleCode = error?.data?.error || error?.code;
    const safeCode = safeCodes.has(possibleCode) ? possibleCode : 'details-suppressed';
    const safeName = error?.name === 'TypeError' ? 'TypeError' : 'Error';
    console.error(`Startup failed (${safeName}; ${safeCode}). Check Socket Mode and Slack app configuration.`);
    process.exitCode = 1;
  });
}

module.exports = { main };
