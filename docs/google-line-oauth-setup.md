# Google and LINE OAuth setup

Production callback URLs for the Railway service:

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
| `JWT_SECRET` | Strong server-side session signing secret |
| `DATABASE_URL` | MySQL connection string used by this application |

`VITE_APP_ID` is not required by this Google/LINE session flow. Keep any unrelated legacy variables unchanged.

## Provider console setup

1. In Google Cloud Console, create a Web application OAuth client and add the exact Google callback URL to Authorized redirect URIs. Enable the `openid`, `email`, and `profile` scopes.
2. In LINE Developers, use a LINE Login channel, add the exact LINE callback URL as its Callback URL, and enable the `openid` and `profile` scopes. Enable `email` only if LINE has granted the channel permission to request it.
3. Confirm the corresponding Client ID/Channel ID and secret values are set in the Railway production service. Do not paste secrets into chat or commit them.

## Database migration

The login flow requires the `auth_identities` table from `drizzle/0001_linked_auth_identities.sql`. Confirm `DATABASE_URL` targets the existing Railway MySQL service, take a database backup, and apply this migration once. Do not run a broad schema push against production for this one-table change.

## Important behavior

- A Google identity and a LINE identity create separate accounts on first login.
- Matching email addresses do not automatically merge accounts.
- A user can link the other provider from the Account Connections section while signed in.
- Ledger records remain scoped to the authenticated internal user ID.
- OAuth callback errors return to the login screen with `?auth=failed`.
