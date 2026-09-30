class MessageRouter {
  constructor({ whatsappAdapter, conversationRegistry, allowedChannelId }) {
    if (!whatsappAdapter || typeof whatsappAdapter.sendMessage !== 'function') {
      throw new TypeError('A WhatsApp adapter is required.');
    }
    if (!conversationRegistry || typeof conversationRegistry.resolve !== 'function') {
      throw new TypeError('A conversation registry is required.');
    }

    this.whatsappAdapter = whatsappAdapter;
    this.conversationRegistry = conversationRegistry;
    this.allowedChannelId = allowedChannelId;
    this.stats = { received: 0, forwarded: 0, rejected: {} };
  }

  async route(message) {
    this.stats.received += 1;
    const reject = (reason) => {
      this.stats.rejected[reason] = (this.stats.rejected[reason] || 0) + 1;
      return { forwarded: false, reason };
    };

    if (!message || message.platform !== 'slack') {
      return reject('unsupported-platform');
    }
    if (message.senderIsBot) {
      return reject('bot-message');
    }
    if (!this.allowedChannelId || message.channelId !== this.allowedChannelId) {
      return reject('channel-not-allowed');
    }
    if (typeof message.text !== 'string' || !message.text.trim()) {
      return reject('empty-message');
    }

    const conversationId = this.conversationRegistry.resolve(message.channelId, message.threadTs);
    if (!conversationId) {
      return reject('conversation-not-found');
    }

    await this.whatsappAdapter.sendMessage({
      conversationId,
      text: message.text,
      metadata: {
        channelId: message.channelId,
        senderId: message.senderId,
        threadTs: message.threadTs,
        messageId: message.id,
      },
    });
    this.stats.forwarded += 1;
    return { forwarded: true, conversationId };
  }

  getStats() {
    return {
      received: this.stats.received,
      forwarded: this.stats.forwarded,
      rejected: { ...this.stats.rejected },
    };
  }
}

module.exports = { MessageRouter };
