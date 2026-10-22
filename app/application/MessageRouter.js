const DEFAULT_RETRY = { attempts: 3, baseDelayMs: 500 };

const wait = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));

class MessageRouter {
  constructor({
    whatsappAdapter,
    conversationRegistry,
    allowedChannelId,
    slackPublisher,
    failureNotifier,
    deduplicator,
    retry = DEFAULT_RETRY,
    sleep = wait,
  }) {
    if (!whatsappAdapter || typeof whatsappAdapter.sendMessage !== 'function') {
      throw new TypeError('A WhatsApp adapter is required.');
    }
    if (!conversationRegistry || typeof conversationRegistry.resolve !== 'function') {
      throw new TypeError('A conversation registry is required.');
    }

    this.whatsappAdapter = whatsappAdapter;
    this.conversationRegistry = conversationRegistry;
    this.allowedChannelId = allowedChannelId;
    this.slackPublisher = slackPublisher;
    this.failureNotifier = failureNotifier;
    this.deduplicator = deduplicator;
    this.retry = { ...DEFAULT_RETRY, ...retry };
    this.sleep = sleep;
    this.inboundInFlight = new Set();
    this.stats = {
      received: 0,
      forwarded: 0,
      rejected: {},
      inbound: { received: 0, published: 0, rejected: {} },
    };
  }

  // Slack → WhatsApp
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
    const hasText = typeof message.text === 'string' && message.text.trim();
    if (!hasText && !message.hasFiles) {
      return reject('empty-message');
    }

    const conversationId = this.conversationRegistry.resolve(message.channelId, message.threadTs);
    if (!conversationId) {
      return reject('conversation-not-found');
    }
    if (message.hasFiles) {
      await this.notify(message, 'unsupported-media');
      return reject('unsupported-media');
    }
    // Claimed before sending: a redelivered Slack event must never send the same text twice.
    if (this.deduplicator && message.id
      && !(await this.deduplicator.claim(`slack:${message.channelId}:${message.id}`))) {
      return reject('duplicate');
    }

    try {
      await this.withRetry(() => this.whatsappAdapter.sendMessage({
        conversationId,
        text: message.text,
        metadata: {
          channelId: message.channelId,
          senderId: message.senderId,
          threadTs: message.threadTs,
          messageId: message.id,
        },
      }));
    } catch (_error) {
      await this.notify(message, 'delivery-failed');
      return reject('delivery-failed');
    }
    this.stats.forwarded += 1;
    return { forwarded: true, conversationId };
  }

  // WhatsApp → Slack
  async routeFromWhatsApp(message) {
    const inbound = this.stats.inbound;
    inbound.received += 1;
    const reject = (reason) => {
      inbound.rejected[reason] = (inbound.rejected[reason] || 0) + 1;
      return { published: false, reason };
    };

    if (typeof this.slackPublisher !== 'function') {
      throw new Error('Slack publisher is not configured.');
    }
    if (!message || typeof message.conversationId !== 'string' || !message.conversationId.trim()) {
      throw new TypeError('A conversationId is required.');
    }
    if (typeof message.text !== 'string' || !message.text.trim()) {
      throw new TypeError('A non-empty WhatsApp message is required.');
    }

    // Claimed only after Slack accepts it, so a provider redelivery after a failure is still published.
    const eventKey = message.messageId ? `whatsapp:${message.messageId}` : undefined;
    if (eventKey && (this.inboundInFlight.has(eventKey) || this.deduplicator?.has(eventKey))) {
      return reject('duplicate');
    }

    if (eventKey) this.inboundInFlight.add(eventKey);
    try {
      const response = await this.withRetry(() => this.slackPublisher({
        conversationId: message.conversationId,
        text: message.text,
      }));
      if (eventKey && this.deduplicator) await this.deduplicator.claim(eventKey);
      inbound.published += 1;
      return {
        published: true,
        conversationId: message.conversationId,
        threadTs: response.threadTs,
        createdThread: response.createdThread,
      };
    } catch (error) {
      reject('publish-failed');
      throw error;
    } finally {
      if (eventKey) this.inboundInFlight.delete(eventKey);
    }
  }

  async withRetry(operation) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= this.retry.attempts || error?.retryable === false) throw error;
        await this.sleep(this.retry.baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  async notify(message, reason) {
    if (typeof this.failureNotifier !== 'function') return;
    try {
      await this.failureNotifier({ channelId: message.channelId, threadTs: message.threadTs, reason });
    } catch (_error) {
      this.stats.rejected['notify-failed'] = (this.stats.rejected['notify-failed'] || 0) + 1;
    }
  }

  getStats() {
    return {
      received: this.stats.received,
      forwarded: this.stats.forwarded,
      rejected: { ...this.stats.rejected },
      inbound: {
        received: this.stats.inbound.received,
        published: this.stats.inbound.published,
        rejected: { ...this.stats.inbound.rejected },
      },
    };
  }
}

module.exports = { MessageRouter };
