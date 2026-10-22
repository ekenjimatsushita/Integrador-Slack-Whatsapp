const NOTICES = {
  'delivery-failed': ':warning: Esta mensagem não foi entregue ao WhatsApp após novas tentativas. Envie novamente mais tarde.',
  'unsupported-media': ':warning: Anexos ainda não são enviados ao WhatsApp. Esta mensagem não foi entregue; envie somente texto.',
};

function createSlackFailureNotifier({ slackClient }) {
  if (!slackClient || !slackClient.chat || typeof slackClient.chat.postMessage !== 'function') {
    throw new TypeError('A Slack client with chat.postMessage is required.');
  }

  // Posts only a fixed notice in the thread; never echoes the original message text.
  return async function notifyFailure({ channelId, threadTs, reason }) {
    const text = NOTICES[reason];
    if (!text || !channelId || !threadTs) return undefined;
    return slackClient.chat.postMessage({ channel: channelId, thread_ts: threadTs, text });
  };
}

module.exports = { createSlackFailureNotifier, NOTICES };
