# HR Admin access

Draft. Do not merge until Kelly's GO. No deploy and no env change is part of this change.

HR Admin signs in with a corporate Google account. The shared `ADMIN_SECRET` password stays in the code as break-glass and is off unless `HR_ADMIN_PASSWORD_LOGIN_ENABLED` is turned on. The browser session is still the signed `hr_admin_session` cookie that `requireAdmin` already checks. It now lasts 8 hours and, for Google and IAP, carries the person's email. Audit fields that used to store a generic actor (`hr-admin`, or `kelly` on reject) store that email instead.

This path is the same on Vercel and on Cloud Run behind a Google HTTPS load balancer. The OAuth redirect URI is taken from `NEXT_PUBLIC_APP_URL`, not from the request host, so a spoofed `Host` header cannot move it. On Cloud Run the load balancer may also send `x-goog-iap-jwt-assertion`. When that header is present it is checked against Google's IAP keys. When it is absent, Google sign-in still works.

## Env vars

Set these on Vercel (Production) and on the Cloud Run service. Do not commit values.

| Name | Required | Purpose |
|---|---|---|
| `GOOGLE_ADMIN_OAUTH_CLIENT_ID` | for Google sign-in | OAuth client id. Not the Gmail client (`GOOGLE_CLIENT_ID`). |
| `GOOGLE_ADMIN_OAUTH_CLIENT_SECRET` | for Google sign-in | OAuth client secret. Server only. |
| `HR_ADMIN_ALLOWED_EMAILS` | for Google and IAP | Comma-separated `@tradingsolutions.com` emails. Case and surrounding space are ignored. Any other domain is ignored. Empty or unset admits nobody. |
| `HR_ADMIN_PASSWORD_LOGIN_ENABLED` | no | Break-glass. Off unless the value is `1`, `true`, `yes`, or `on`. |
| `IAP_AUDIENCE` | only for IAP | Expected `aud` of `x-goog-iap-jwt-assertion`. Unset: the header never grants a session. |
| `NEXT_PUBLIC_APP_URL` | already set | Public origin. Redirect URI is `{origin}/api/hr-admin/login/google/callback`. |
| `ADMIN_SECRET` | already set | Signs `hr_admin_session`. Also still the break-glass password. |

`HR_ADMIN_ALLOWED_EMAILS` example (not a prod list): `kelly@tradingsolutions.com, jointheteam@tradingsolutions.com`.

A Google ID token is accepted only when all of these hold: signature valid, `iss` is `https://accounts.google.com` or `accounts.google.com`, `aud` is `GOOGLE_ADMIN_OAUTH_CLIENT_ID`, `exp` is in the future, `email_verified` is true, `hd` is `tradingsolutions.com`, the email's domain is `tradingsolutions.com`, `nonce` matches the login cookie, and the email is on the allowlist. `hd` on the authorize URL is only a hint.

IAP uses the same allowlist and the same `hd` rule. `email_verified` may be omitted on an IAP JWT; an explicit `false` is rejected. `iss` must be `https://cloud.google.com/iap` and `aud` must equal `IAP_AUDIENCE`.

The server must be able to reach Google's token and certificate endpoints (`oauth2.googleapis.com`, `www.googleapis.com`, and `www.gstatic.com` when IAP is used). The browser goes to `accounts.google.com`. No new firewall change is required on the current Vercel or Cloud Run egress.

`NEXT_PUBLIC_APP_URL` is already a build-arg for the Cloud Run image and a Vercel env var. The route reads the runtime value when it is set, and otherwise the value compiled into the server. Production for both hosts is `https://careers.tradingsolutions.com`.

## OAuth client

Create it in the GCP project **wellness-experience-management**. Do not reuse the Gmail client.

1. APIs & Services → OAuth consent screen.
2. User type **Internal**. That limits the consent screen to `tradingsolutions.com` accounts. It is not a substitute for `HR_ADMIN_ALLOWED_EMAILS`.
3. App name: `Trading Solutions HR Admin`. Scopes: `openid`, `email`, `profile` (the default non-sensitive ones). Save.
4. APIs & Services → Credentials → Create credentials → OAuth client ID → **Web application**.
5. Name: `HR Admin careers`.
6. Authorized JavaScript origins: `https://careers.tradingsolutions.com`
7. Authorized redirect URIs, exactly one for this host:

`https://careers.tradingsolutions.com/api/hr-admin/login/google/callback`

That URI is what both Vercel and the load balancer in front of Cloud Run present, because both are served at `careers.tradingsolutions.com`. Do not add the `*.run.app` host unless `NEXT_PUBLIC_APP_URL` is that host. A second origin needs its own redirect URI and the same path suffix.

8. Copy the client id into `GOOGLE_ADMIN_OAUTH_CLIENT_ID` and the secret into `GOOGLE_ADMIN_OAUTH_CLIENT_SECRET`.

Logout is the existing control: `DELETE /api/hr-admin/login` clears the session cookie. The session expires after 8 hours. The return path after login is a relative `/hr-admin` path stored in the signed state cookie. The callback ignores any other return URL.

State, nonce, and PKCE (`S256`) live in the httpOnly cookie `hr_admin_oauth` for 10 minutes. The code verifier is not put in the query string.

## IAP audience

On the load balancer, IAP's JWT `aud` looks like `/projects/PROJECT_NUMBER/global/backendServices/BACKEND_SERVICE_ID`. Put that exact string in `IAP_AUDIENCE`. The login page POSTs `/api/hr-admin/login/iap`. The load balancer attaches the header to that request. Vercel does not, so the button is the way in there.

## Rollback

Turn the shared password back on. No code rollback.

On Vercel and on Cloud Run, set:

```
HR_ADMIN_PASSWORD_LOGIN_ENABLED=1
```

`1`, `true`, `yes`, and `on` all work. The password form comes back and `POST /api/hr-admin/login` checks `ADMIN_SECRET` again. Each attempt is logged with a warning (`break-glass password login`). Google can stay configured.

To stop Google and IAP without deploying code, clear `HR_ADMIN_ALLOWED_EMAILS`. An empty allowlist admits nobody through either path. Removing `GOOGLE_ADMIN_OAUTH_CLIENT_ID` hides a working client and the start route returns the login page with a configuration error. Leave `ADMIN_SECRET` in place: it still signs the session cookie.
