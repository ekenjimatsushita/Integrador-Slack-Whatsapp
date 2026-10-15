class ConversationRegistry {
  constructor({ initialMappings = [], stateStore } = {}) {
    this.conversationsByThread = new Map();
    this.stateStore = stateStore;
    for (const mapping of initialMappings) {
      this.conversationsByThread.set(
        JSON.stringify([mapping.channelId, mapping.threadTs]),
        mapping.conversationId,
      );
    }
  }

  async register(channelId, threadTs, conversationId) {
    if (![channelId, threadTs, conversationId].every(value => typeof value === 'string' && value.trim())) {
      throw new TypeError('channelId, threadTs, and conversationId are required.');
    }
    this.conversationsByThread.set(JSON.stringify([channelId, threadTs]), conversationId);
    if (this.stateStore) await this.stateStore.saveConversation({ channelId, threadTs, conversationId });
  }

  resolve(channelId, threadTs) {
    if (!channelId || !threadTs) return undefined;
    return this.conversationsByThread.get(JSON.stringify([channelId, threadTs]));
  }
}

module.exports = { ConversationRegistry };
