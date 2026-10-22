const fs = require('node:fs/promises');
const path = require('node:path');

const STATE_VERSION = 1;

class JsonStateStore {
  constructor({ filePath }) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new TypeError('A state file path is required.');
    }

    this.filePath = filePath;
    this.state = { version: STATE_VERSION, conversations: [], messages: [], processedEvents: [] };
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await fs.chmod(path.dirname(this.filePath), 0o700);

    try {
      const contents = await fs.readFile(this.filePath, 'utf8');
      const state = JSON.parse(contents);
      if (state.version !== STATE_VERSION || !Array.isArray(state.conversations) || !Array.isArray(state.messages)) {
        throw new Error('The persisted mock state has an unsupported format.');
      }
      if (state.processedEvents === undefined) state.processedEvents = [];
      if (!Array.isArray(state.processedEvents)) {
        throw new Error('The persisted mock state has an unsupported format.');
      }
      this.state = state;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.persist();
    }
  }

  listConversations() {
    return this.state.conversations.map(mapping => ({ ...mapping }));
  }

  listMessages() {
    return this.state.messages.map(message => ({ ...message, metadata: { ...message.metadata } }));
  }

  listProcessedEvents() {
    return [...this.state.processedEvents];
  }

  async saveConversation({ channelId, threadTs, conversationId }) {
    const key = JSON.stringify([channelId, threadTs]);
    const existingIndex = this.state.conversations.findIndex(mapping =>
      JSON.stringify([mapping.channelId, mapping.threadTs]) === key);
    const mapping = { channelId, threadTs, conversationId };

    if (existingIndex === -1) this.state.conversations.push(mapping);
    else this.state.conversations[existingIndex] = mapping;

    await this.persist();
  }

  async appendMessage(message, maxMessages) {
    this.state.messages.push({ ...message, metadata: { ...message.metadata } });
    if (this.state.messages.length > maxMessages) {
      this.state.messages.splice(0, this.state.messages.length - maxMessages);
    }
    await this.persist();
  }

  async appendProcessedEvent(eventKey, maxEvents) {
    this.state.processedEvents.push(eventKey);
    if (this.state.processedEvents.length > maxEvents) {
      this.state.processedEvents.splice(0, this.state.processedEvents.length - maxEvents);
    }
    await this.persist();
  }

  persist() {
    const write = this.writeQueue.catch(() => {}).then(async () => {
      const temporaryPath = `${this.filePath}.tmp`;
      await fs.writeFile(temporaryPath, JSON.stringify(this.state), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaryPath, this.filePath);
      await fs.chmod(this.filePath, 0o600);
    });
    this.writeQueue = write;
    return write;
  }
}

module.exports = { JsonStateStore };
