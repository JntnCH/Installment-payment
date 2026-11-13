# Authentication setup: Telegram, Google, and LINE

Production OAuth callback URLs for the Railway service:

- Google: `https://installment-payment-production.up.railway.app/api/auth/google/callback`
- LINE: `https://installment-payment-production.up.railway.app/api/auth/line/callback`

## Railway variables

Set these in Railway Variables. Never commit secret values to GitHub.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Exact Google callback URL above |
| `LINE_CHANNEL_ID` | LINE Login channel ID |
| `LINE_CHANNEL_SECRET` | LINE Login channel secret |
| `LINE_REDIRECT_URI` | Exact LINE callback URL above |
| `TELEGRAM_BOT_TOKEN` | BotFather token used only by the backend to verify Mini App initData |
| `JWT_SECRET` | Strong server-side session signing secret |
| `DATABASE_URL` | MySQL connection string used by this application |

## Telegram Mini App setup

1. Create or select the Telegram bot in `@BotFather`.
2. Configure its Mini App / Web App URL to `https://installment-payment-production.up.railway.app/`.
3. Add the bot token as `TELEGRAM_BOT_TOKEN` in the Railway service Variables. Never expose it in frontend variables or commit it.
4. Open the app from the bot's Mini App button. The frontend sends Telegram's raw `initData` to the backend; the backend verifies its HMAC signature and timestamp before creating a session.
5. The Telegram authentication button is available only when the app is opened inside Telegram. A normal browser can continue using Google or LINE.

## Google and LINE setup

1. In Google Cloud Console, create a Web application OAuth client and add the exact Google callback URL to Authorized redirect URIs. Enable the `openid`, `email`, and `profile` scopes.
2. In LINE Developers, use a LINE Login channel, add the exact LINE callback URL as its Callback URL, and enable the `openid` and `profile` scopes. Enable `email` only if LINE has granted the channel permission to request it.
3. Confirm the corresponding Client ID/Channel ID and secret values are set in the Railway production service. Do not paste secrets into chat or commit them.

## Database migration

The login flow requires the `auth_identities` table from `drizzle/0001_linked_auth_identities.sql`. This migration now allows `google`, `line`, and `telegram` identities. Confirm `DATABASE_URL` targets the existing Railway MySQL service, take a database backup, and apply this migration once. Do not run a broad schema push against production for this one-table change.

## Account behavior and security

- Telegram, Google, and LINE identities can each sign in to the same internal account after being explicitly linked.
- First-time sign-in with an unlinked provider creates a separate account; matching email addresses never merge accounts automatically.
- A signed-in user can link another provider from Account Connections. Telegram linking requires opening the app inside the Telegram Mini App.
- Telegram `initData` is verified on the backend using the bot token; the bot token is never sent to the browser.
- Telegram initData older than 24 hours is rejected.
- Ledger records remain scoped to the authenticated internal user ID.
- Google and LINE OAuth callback errors return to the login screen with `?auth=failed`.
