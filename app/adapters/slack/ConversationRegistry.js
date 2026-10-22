class ConversationRegistry {
  constructor({ initialMappings = [], stateStore } = {}) {
    this.conversationsByThread = new Map();
    this.threadsByConversation = new Map();
    this.stateStore = stateStore;
    for (const mapping of initialMappings) {
      this.remember(mapping.channelId, mapping.threadTs, mapping.conversationId);
    }
  }

  remember(channelId, threadTs, conversationId) {
    this.conversationsByThread.set(JSON.stringify([channelId, threadTs]), conversationId);
    // The most recently registered thread wins if older state holds several threads per conversation.
    this.threadsByConversation.set(JSON.stringify([channelId, conversationId]), threadTs);
  }

  async register(channelId, threadTs, conversationId) {
    if (![channelId, threadTs, conversationId].every(value => typeof value === 'string' && value.trim())) {
      throw new TypeError('channelId, threadTs, and conversationId are required.');
    }
    this.remember(channelId, threadTs, conversationId);
    if (this.stateStore) await this.stateStore.saveConversation({ channelId, threadTs, conversationId });
  }

  resolve(channelId, threadTs) {
    if (!channelId || !threadTs) return undefined;
    return this.conversationsByThread.get(JSON.stringify([channelId, threadTs]));
  }

  findThread(channelId, conversationId) {
    if (!channelId || !conversationId) return undefined;
    return this.threadsByConversation.get(JSON.stringify([channelId, conversationId]));
  }
}

module.exports = { ConversationRegistry };
