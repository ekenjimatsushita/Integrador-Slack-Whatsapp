class ConversationRegistry {
  constructor() {
    this.conversationsByThread = new Map();
  }

  register(channelId, threadTs, conversationId) {
    if (![channelId, threadTs, conversationId].every(value => typeof value === 'string' && value.trim())) {
      throw new TypeError('channelId, threadTs, and conversationId are required.');
    }
    this.conversationsByThread.set(JSON.stringify([channelId, threadTs]), conversationId);
  }

  resolve(channelId, threadTs) {
    if (!channelId || !threadTs) return undefined;
    return this.conversationsByThread.get(JSON.stringify([channelId, threadTs]));
  }
}

module.exports = { ConversationRegistry };
