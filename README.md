# WhatsAppInSlack local development

The step-by-step local development notes, test evidence, troubleshooting, and file ownership map are documented in [`docs/development/LOCAL_DEVELOPMENT.md`](../../docs/development/LOCAL_DEVELOPMENT.md).

The mock lab connects Slack with Bolt Socket Mode and routes human text messages through `MessageRouter` to `MockWhatsAppAdapter`. Routing is restricted to `SLACK_CHANNEL_ID`. The mock stores captured message text and thread mappings in a Docker volume; it never opens a WhatsApp Web session or sends data to a WhatsApp account.

## Requirements

- Docker Compose
- `SLACK_BOT_TOKEN` (Bot User OAuth Token)
- `SLACK_APP_TOKEN` (App-Level Token with `connections:write`)
- `SLACK_CHANNEL_ID` for the shared Slack channel
- Socket Mode enabled in the Slack app, with message events subscribed
- Bot token granted `chat:write`; the bot must be a member of the destination channel

Copy `.env.example` to `.env` on the deployment host and set the values there. Never commit, print, or log token values. From this directory, start the app:

```powershell
docker compose --env-file ../../.env up --build -d
```

The HTTP port is bound to localhost only. It is not needed by the Slack Socket Mode connection. Verify status and inspect the mock inbox from the server or through an SSH tunnel:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/mock/whatsapp/messages
```

`/health` returns 200 with `slack: connected` only while the Socket Mode connection is up, and 503 (`degraded`) otherwise.

The app only forwards replies within a thread that has a registered mock conversation. Make a local `POST` to `http://127.0.0.1:3000/mock/whatsapp/send-test` for each simulated conversation. Each request posts a Slack root message and persists its thread mapping; send `{"conversationId": "<id>"}` as JSON to post a follow-up message into that conversation's existing thread; reply inside each Slack thread to exercise Socket Mode → `MessageRouter` → mock. The inbox keeps the latest 500 captured messages. `GET /debug/router` exposes message counters/rejection reasons, and `GET /mock/whatsapp/messages` exposes captured message content. Keep these endpoints bound to localhost.

Run the offline handler and adapter tests in the container:

```powershell
docker compose --env-file ../../.env run --build --rm --no-deps app npm test
```

Shut down the app with `docker compose down`. No real WhatsApp account is required for this test setup.

## Structure

- `app/app.js`: starts the local HTTP endpoints and Slack Bolt Socket Mode.
- `app/slackMessageHandler.js`: filters and normalizes incoming Slack events.
- `app/application/MessageRouter.js`: enforces channel and conversation routing in both directions, deduplication, retries, and failure notices.
- `app/application/EventDeduplicator.js`: remembers processed Slack/WhatsApp event keys (latest 5000, persisted).
- `app/adapters/createWhatsAppAdapter.js`: selects the adapter from `WHATSAPP_ADAPTER` (only `mock` today).
- `app/httpErrorHandler.js`: returns generic JSON errors instead of Express' default page, which echoes request fragments and stack traces.
- `app/slackFailureNotifier.js`: posts fixed notices in a thread for failed deliveries and unsupported attachments.
- `app/adapters/slack/ConversationRegistry.js`: maps Slack thread roots to conversation IDs and back, so a conversation keeps one thread.
- `app/persistence/JsonStateStore.js`: atomically stores mock messages and mappings in `/data/mock-state.json`.
- `app/slackMessagePublisher.js`: publishes simulated WhatsApp messages with Slack `chat.postMessage` and registers their thread mapping.
- `app/adapters/MockWhatsAppAdapter.js`: captures Slack messages locally and can simulate incoming WhatsApp text.
- `app/test/`: offline tests for event normalization, bot loop prevention, channel restriction, thread mapping, deduplication, retries, notices, persistence, and delivery to the mock.

Compose mounts the named `mock_state` volume at `/data`, so messages and thread mappings survive container replacement and restart. Do not run `docker compose down -v` unless you intend to delete this state. Back up the volume before moving or removing the deployment. The state includes Slack message text and should be handled as private team data.

The upstream repository is GPL-3.0; see [LICENSE](LICENSE).
