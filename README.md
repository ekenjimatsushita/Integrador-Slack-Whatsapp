# WhatsAppInSlack local development

The step-by-step local development notes, test evidence, troubleshooting, and file ownership map are documented in [`docs/development/LOCAL_DEVELOPMENT.md`](../../docs/development/LOCAL_DEVELOPMENT.md).

The local development version connects Slack with Bolt Socket Mode and routes human text messages through `MessageRouter` to `MockWhatsAppAdapter`. Routing is restricted to `SLACK_CHANNEL_ID`. The mock stores received messages in process memory; it never opens a WhatsApp Web session or sends data to a WhatsApp account.

## Requirements

- Docker Compose
- `SLACK_BOT_TOKEN` (Bot User OAuth Token)
- `SLACK_APP_TOKEN` (App-Level Token with `connections:write`)
- `SLACK_CHANNEL_ID` for the one-message real Slack publish test
- Socket Mode enabled in the Slack app, with message events subscribed
- Bot token granted `chat:write`; the bot must be a member of the destination channel

Keep both token values in the workspace `.env` file or environment. Never commit, print, or log their values. From this directory, start the app using the workspace env file:

```powershell
docker compose --env-file ../../.env up --build -d
```

The HTTP port is bound to localhost only. Verify status and inspect the mock inbox:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/mock/whatsapp/messages
```

The app only forwards replies within a thread that has a registered mock conversation. To create one real Slack root message and its in-memory conversation mapping, make one local `POST` to `http://127.0.0.1:3000/mock/whatsapp/send-test`. The response includes `conversationId` and `threadTs`; reply to that message in Slack to exercise Socket Mode → `MessageRouter` → mock. The route permits one attempt per app run. `GET /debug/router` exposes only message counters/rejection reasons, and `GET /mock/whatsapp/messages` exposes the local mock inbox. Keep the service bound to localhost.

Run the offline handler and adapter tests in the container:

```powershell
docker compose --env-file ../../.env run --build --rm --no-deps app npm test
```

Shut down the app with `docker compose down`. No real WhatsApp account is required for this test setup.

## Structure

- `app/app.js`: starts the local HTTP endpoints and Slack Bolt Socket Mode.
- `app/slackMessageHandler.js`: filters and normalizes incoming Slack events.
- `app/application/MessageRouter.js`: enforces channel and conversation routing.
- `app/adapters/slack/ConversationRegistry.js`: maps Slack thread roots to mock conversation IDs in memory.
- `app/slackMessagePublisher.js`: publishes simulated WhatsApp messages with Slack `chat.postMessage` and registers their thread mapping.
- `app/adapters/MockWhatsAppAdapter.js`: captures Slack messages locally and can simulate incoming WhatsApp text.
- `app/test/`: offline tests for event normalization, bot loop prevention, channel restriction, thread mapping, and delivery to the mock.

The conversation registry is intentionally in memory for this mock phase; mappings reset when the container restarts. Persistent thread mappings are a separate development step.

The upstream repository is GPL-3.0; see [LICENSE](LICENSE).
