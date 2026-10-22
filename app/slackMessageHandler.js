// file_share is the only subtype accepted, so attachments can be rejected with a notice instead of silently.
const ACCEPTED_SUBTYPES = new Set(['file_share']);

function createSlackMessageHandler(messageRouter, { botUserId } = {}) {
  if (!messageRouter || typeof messageRouter.route !== 'function') {
    throw new TypeError('A MessageRouter is required.');
  }

  return async function handleSlackMessage({ message }) {
    if (!message || message.bot_id || message.bot_profile || !message.user) {
      return { forwarded: false, reason: 'unsupported-message' };
    }
    if (message.subtype && !ACCEPTED_SUBTYPES.has(message.subtype)) {
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
      hasFiles: Array.isArray(message.files) && message.files.length > 0,
    });
  };
}

module.exports = { createSlackMessageHandler };
