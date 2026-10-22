const { MockWhatsAppAdapter } = require('./MockWhatsAppAdapter');

// Only the mock exists today; a real provider adapter is added here once its account is available.
const SUPPORTED_ADAPTERS = ['mock'];

function createWhatsAppAdapter(name = 'mock', { stateStore } = {}) {
  if (name === 'mock') {
    return new MockWhatsAppAdapter({
      initialMessages: stateStore ? stateStore.listMessages() : [],
      stateStore,
    });
  }

  const error = new Error(`Unsupported WHATSAPP_ADAPTER. Supported values: ${SUPPORTED_ADAPTERS.join(', ')}.`);
  error.code = 'unsupported_whatsapp_adapter';
  throw error;
}

module.exports = { createWhatsAppAdapter, SUPPORTED_ADAPTERS };
