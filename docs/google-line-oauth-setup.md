# Google and LINE OAuth setup

The application uses these callback URLs. Replace `<RAILWAY_DOMAIN>` with the public Railway domain:

- Google: `https://<RAILWAY_DOMAIN>/api/auth/google/callback`
- LINE: `https://<RAILWAY_DOMAIN>/api/auth/line/callback`

## Railway variables

Set these in Railway Variables. Never commit the secret values to GitHub.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Exact Google callback URL above |
| `LINE_CHANNEL_ID` | LINE Login channel ID |
| `LINE_CHANNEL_SECRET` | LINE Login channel secret |
| `LINE_REDIRECT_URI` | Exact LINE callback URL above |
| `JWT_SECRET` | Existing strong session signing secret |
| `VITE_APP_ID` | Existing application ID required by session validation |
| `DATABASE_URL` | Existing MySQL connection string |

Keep the existing Railway deployment and all unrelated variables unchanged.

## Provider console setup

1. In Google Cloud Console, create a Web application OAuth client and add the exact Google callback URL to Authorized redirect URIs. Enable the Google user information scopes `openid`, `email`, and `profile`.
2. In LINE Developers, use a LINE Login channel, add the exact LINE callback URL as its Callback URL, and enable the `openid`, `profile`, and `email` scopes where available.
3. Set the corresponding credentials in Railway Variables.

## Database migration

The login flow requires the `auth_identities` table from `drizzle/0001_linked_auth_identities.sql`. Back up the Railway database before applying this migration. Do not run a schema push against production until the migration has been reviewed and approved.

## Important behavior

- A Google identity and a LINE identity create separate accounts on first login.
- Matching email addresses do not automatically merge accounts.
- Each ledger record continues to be scoped by the authenticated internal user ID.
- OAuth callback errors return to the login screen with `?auth=failed`.
