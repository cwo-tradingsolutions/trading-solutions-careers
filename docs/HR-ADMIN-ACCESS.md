# HR Admin access

Draft. Do not merge until Kelly's GO. No deploy and no env change is part of this change.

HR Admin signs in with a corporate Google account. The shared password is a vault emergency key. It is off unless `HR_ADMIN_PASSWORD_LOGIN_ENABLED` is on, and Kelly retires it 7 days after Google sign-in is live. It is not a Bearer token, not an `x-admin-secret`, and it does not sign sessions.

The browser session is the `hr_admin_session` cookie `requireAdmin` already checks. It lasts 8 hours, is signed with `HR_ADMIN_SESSION_SECRET`, and must carry an email. Cookies signed with `ADMIN_SECRET`, and cookies with no email, are rejected.

The OAuth redirect URI comes from `NEXT_PUBLIC_APP_URL`, so Vercel and Cloud Run behind the Google load balancer use the same value. IAP (`x-goog-iap-jwt-assertion`) is accepted only on Cloud Run (`K_SERVICE` set and `VERCEL` / `VERCEL_ENV` unset). On Vercel the header is ignored.

## Env vars for the staging and prod cutover

Set the same names on the staging host and on production (Vercel Production and the Cloud Run service). Values are different per host. Do not commit them. Each secret is at least 16 characters (`openssl rand -base64 32`). Do not reuse one value for another name.

| Name | Staging and prod | Who uses it |
|---|---|---|
| `GOOGLE_ADMIN_OAUTH_CLIENT_ID` | both, when Google sign-in is turned on | The HR Admin OAuth client. Not the Gmail client (`GOOGLE_CLIENT_ID`). |
| `GOOGLE_ADMIN_OAUTH_CLIENT_SECRET` | both | Server only, token exchange. |
| `HR_ADMIN_ALLOWED_EMAILS` | both | Comma-separated `@tradingsolutions.com` emails. Case and surrounding space are ignored. Other domains are ignored. Empty or unset admits nobody through Google or IAP. |
| `HR_ADMIN_SESSION_SECRET` | both, required | The app only. Signs `hr_admin_session` and the OAuth state cookie. Missing or shorter than 16 characters: no session is issued and admin APIs return 500. |
| `HR_ADMIN_PASSWORD_LOGIN_ENABLED` | off at cutover | Vault break-glass. On only for `1`, `true`, `yes`, or `on`. Retired 7 days after Google sign-in is live. |
| `ADMIN_SECRET` | both, rotated | Vault password checked only by `POST /api/hr-admin/login` while the flag is on. Also signs candidate portal links (`src/lib/portal-token.ts`). Not accepted as Bearer, cookie, or `x-admin-secret`. |
| `ADMIN_SCRIPTS_SECRET` | both, if those jobs still run | One-shot scripts and the battery header. Unset: those calls fail closed. The HR session does not need it. |
| `IAP_AUDIENCE` | Cloud Run only | Expected `aud` of the IAP JWT. Leave unset on Vercel. Unset on Cloud Run: the header never grants a session. |
| `NEXT_PUBLIC_APP_URL` | already set | Public origin. Redirect URI is `{origin}/api/hr-admin/login/google/callback`. |

`HR_ADMIN_ALLOWED_EMAILS` example (not a prod list): `kelly@tradingsolutions.com, jointheteam@tradingsolutions.com`.

### Who calls `ADMIN_SCRIPTS_SECRET`

Send it as `Authorization: Bearer` or `x-admin-secret`. It does not open the rest of HR Admin.

| Route | Who | Header they use today |
|---|---|---|
| `POST /api/admin/seed-linkedin-apps` and its GET dry-run | Engineering, one-shot LinkedIn Recruiter import | `Authorization: Bearer` |
| `POST /api/headhunting/sync-from-neon` | Engineering, one-shot copy from Neon talent pool into Supabase | `Authorization: Bearer` |
| `POST /api/headhunting/reseed-scenarios` | Engineering, reseed Elevare scenarios for the TS model | `x-admin-secret` or Bearer |
| Batería routes (`/api/bateria/*`) and `POST /api/candidates/[id]/files` | Battery tooling. The HR browser uses the session cookie instead | `x-admin-secret` |

A logged-in HR session can still call the seed and reseed routes. `ADMIN_SECRET` cannot.

## Google ID token

Accepted only when all of these hold: signature valid, `iss` is `https://accounts.google.com` or `accounts.google.com`, `aud` is `GOOGLE_ADMIN_OAUTH_CLIENT_ID`, `exp` is in the future, `email_verified` is true, `hd` is `tradingsolutions.com`, the email's domain is `tradingsolutions.com`, `nonce` matches the login cookie, and the email is on the allowlist. `hd` on the authorize URL is only a hint.

IAP uses the same allowlist and the same `hd` rule. If `email_verified` is present it must be true. If it is absent, the rest of the checks still apply. `iss` must be `https://cloud.google.com/iap` and `aud` must equal `IAP_AUDIENCE`.

The server must reach Google's token and certificate endpoints (`oauth2.googleapis.com`, `www.googleapis.com`, and `www.gstatic.com` when IAP is used). The browser goes to `accounts.google.com`.

`NEXT_PUBLIC_APP_URL` is already a build-arg for the Cloud Run image and a Vercel env var. The route reads the runtime value when it is set, and otherwise the value compiled into the server. Production for both hosts is `https://careers.tradingsolutions.com`.

## OAuth client

Create it in the GCP project **wellness-experience-management**. Do not reuse the Gmail client.

1. APIs & Services → OAuth consent screen.
2. User type **Internal**. That limits the consent screen to `tradingsolutions.com` accounts. It is not a substitute for `HR_ADMIN_ALLOWED_EMAILS`.
3. App name: `Trading Solutions HR Admin`. Scopes: `openid`, `email`, `profile`. Save.
4. APIs & Services → Credentials → Create credentials → OAuth client ID → **Web application**.
5. Name: `HR Admin careers`.
6. Authorized JavaScript origins: `https://careers.tradingsolutions.com`
7. Authorized redirect URI, exactly:

`https://careers.tradingsolutions.com/api/hr-admin/login/google/callback`

That URI is what both Vercel and the load balancer in front of Cloud Run present. Do not add the `*.run.app` host unless `NEXT_PUBLIC_APP_URL` is that host.

8. Copy the client id into `GOOGLE_ADMIN_OAUTH_CLIENT_ID` and the secret into `GOOGLE_ADMIN_OAUTH_CLIENT_SECRET`.

Logout is `DELETE /api/hr-admin/login`. The session expires after 8 hours. The return path is a relative `/hr-admin` path with no `..` (including percent-encoded forms). State, nonce, and PKCE (`S256`) live in the httpOnly cookie `hr_admin_oauth` for 10 minutes.

The cookie `Secure` flag follows the request protocol (`x-forwarded-proto` or the request URL) or, when that is not https, an https `NEXT_PUBLIC_APP_URL`. It does not follow `NODE_ENV`.

## IAP audience

On the load balancer, IAP's JWT `aud` looks like `/projects/PROJECT_NUMBER/global/backendServices/BACKEND_SERVICE_ID`. Put that string in `IAP_AUDIENCE` on Cloud Run only. The login page POSTs `/api/hr-admin/login/iap`. Vercel never turns that into a session.

## Cutover: rotate `ADMIN_SECRET`

Do this when Google sign-in is switched on. Order matters.

1. Generate three different values. Put the session signer in `HR_ADMIN_SESSION_SECRET` and the script key in `ADMIN_SCRIPTS_SECRET`. Do not copy the current `ADMIN_SECRET` into either.
2. Deploy the app that requires the email claim and the new signer. Every existing `hr_admin_session` cookie stops working, including ones minted from the old password and ones with no email. People sign in with Google.
3. Rotate `ADMIN_SECRET` to a new vault value. The old value must stop working. From this deploy it is not accepted as Bearer, as `x-admin-secret`, or as a session signature. It is only the break-glass password, and only while `HR_ADMIN_PASSWORD_LOGIN_ENABLED` is on.
4. Rotating `ADMIN_SECRET` also invalidates candidate portal links. Those links are `HMAC(id + email, ADMIN_SECRET)`. Send new links after the rotation if anyone still has an old one.
5. Update any curl or job that called seed-linkedin-apps, sync-from-neon, reseed-scenarios, or battery routes with `ADMIN_SECRET`. Point them at `ADMIN_SCRIPTS_SECRET`. If a job is unused, leave `ADMIN_SCRIPTS_SECRET` unset so the call fails closed.
6. Keep the password flag off. If the vault key is needed in the 7 days after go-live, set `HR_ADMIN_PASSWORD_LOGIN_ENABLED=1` on that host only. The form comes back and `POST /api/hr-admin/login` checks `ADMIN_SECRET`. Each attempt is logged with a warning (`break-glass password login`). The session it creates is signed with `HR_ADMIN_SESSION_SECRET` and the email claim `break-glass@tradingsolutions.com`. Bearer and `x-admin-secret` still do not accept `ADMIN_SECRET`.
7. On day 7, turn the flag off (unset it) and rotate `ADMIN_SECRET` once more so the retired password is not the value stored in the vault.

To stop Google and IAP without a code rollback, clear `HR_ADMIN_ALLOWED_EMAILS`.
