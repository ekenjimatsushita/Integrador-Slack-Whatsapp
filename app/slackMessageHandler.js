function createSlackMessageHandler(messageRouter, { botUserId } = {}) {
  if (!messageRouter || typeof messageRouter.route !== 'function') {
    throw new TypeError('A MessageRouter is required.');
  }

  return async function handleSlackMessage({ message }) {
    if (!message || message.subtype || message.bot_id || message.bot_profile || !message.user) {
      return { forwarded: false, reason: 'unsupported-message' };
    }
    if (botUserId && message.user === botUserId) {
      return { forwarded: false, reason: 'bot-message' };
    }

    return messageRouter.route({
      id: message.ts,
      platform: 'slack',
      channelId: message.channel,
      senderId: message.user,
      senderIsBot: false,
      text: message.text,
      threadTs: message.thread_ts,
    });
  };
}

module.exports = { createSlackMessageHandler };
