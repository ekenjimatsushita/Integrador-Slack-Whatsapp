class EventDeduplicator {
  constructor({ maxEvents = 5000, stateStore } = {}) {
    this.maxEvents = maxEvents;
    this.stateStore = stateStore;
    this.order = stateStore ? stateStore.listProcessedEvents().slice(-maxEvents) : [];
    this.processed = new Set(this.order);
  }

  has(eventKey) {
    return this.processed.has(eventKey);
  }

  // Returns true the first time a key is seen; later calls with the same key return false.
  async claim(eventKey) {
    if (typeof eventKey !== 'string' || !eventKey.trim()) {
      throw new TypeError('An event key is required.');
    }
    if (this.processed.has(eventKey)) return false;

    this.processed.add(eventKey);
    this.order.push(eventKey);
    if (this.order.length > this.maxEvents) this.processed.delete(this.order.shift());
    if (this.stateStore) await this.stateStore.appendProcessedEvent(eventKey, this.maxEvents);
    return true;
  }
}

module.exports = { EventDeduplicator };
