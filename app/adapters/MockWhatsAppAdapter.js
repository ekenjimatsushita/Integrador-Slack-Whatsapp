class MockWhatsAppAdapter {
  constructor({ maxMessages = 500, initialMessages = [], stateStore } = {}) {
    this.maxMessages = maxMessages;
    this.messages = initialMessages.map(message => ({ ...message, metadata: { ...message.metadata } }));
    this.messageListeners = [];
    this.stateStore = stateStore;
    this.name = 'mock';
    this.sourceLabel = 'WhatsApp (mock)';
  }

  async sendMessage(outboundMessage) {
    if (!outboundMessage || typeof outboundMessage.conversationId !== 'string' || !outboundMessage.conversationId.trim()) {
      throw new TypeError('A conversationId is required.');
    }
    if (typeof outboundMessage.text !== 'string' || !outboundMessage.text.trim()) {
      throw new TypeError('A non-empty message text is required.');
    }

    const message = {
      conversationId: outboundMessage.conversationId,
      text: outboundMessage.text,
      metadata: { ...outboundMessage.metadata },
      receivedAt: new Date().toISOString(),
    };

    if (this.stateStore) {
      await this.stateStore.appendMessage(message, this.maxMessages);
      this.messages = this.stateStore.listMessages();
    } else {
      this.messages.push(message);
      if (this.messages.length > this.maxMessages) this.messages.shift();
    }
    return message;
  }

  listMessages() {
    return this.messages.map(message => ({ ...message, metadata: { ...message.metadata } }));
  }

  onMessage(listener) {
    this.messageListeners.push(listener);
  }

  async receiveMessage(message) {
    if (!message || typeof message.conversationId !== 'string' || !message.conversationId.trim()) {
      throw new TypeError('A conversationId is required.');
    }
    if (typeof message.text !== 'string' || !message.text.trim()) {
      throw new TypeError('A non-empty mock WhatsApp message is required.');
    }

    return Promise.all(this.messageListeners.map(listener => listener({ ...message })));
  }
}

module.exports = { MockWhatsAppAdapter };
