function createSlackMessagePublisher({ slackClient, channelId, conversationRegistry }) {
  if (!slackClient || !slackClient.chat || typeof slackClient.chat.postMessage !== 'function') {
    throw new TypeError('A Slack client with chat.postMessage is required.');
  }
  if (typeof channelId !== 'string' || !channelId.trim()) {
    throw new TypeError('SLACK_CHANNEL_ID is required to publish a message.');
  }
  if (!conversationRegistry || typeof conversationRegistry.register !== 'function') {
    throw new TypeError('A conversation registry is required.');
  }

  return async function publishWhatsAppMessage(message) {
    if (!message || typeof message.text !== 'string' || !message.text.trim()) {
      throw new TypeError('A non-empty mock WhatsApp message is required.');
    }
    if (typeof message.conversationId !== 'string' || !message.conversationId.trim()) {
      throw new TypeError('A conversationId is required to create a Slack thread mapping.');
    }

    const response = await slackClient.chat.postMessage({
      channel: channelId,
      text: `WhatsApp (mock): ${message.text}`,
    });
    if (!response || response.ok !== true || !response.ts) {
      throw new Error('Slack rejected the mock message.');
    }
    await conversationRegistry.register(channelId, response.ts, message.conversationId);
    return response;
  };
}

module.exports = { createSlackMessagePublisher };
