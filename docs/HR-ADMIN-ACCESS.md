# HR Admin access

Draft. Do not merge until Kelly's GO. No deploy and no env change is part of this change.

HR Admin signs in with a corporate Google account. The shared password is a vault emergency key. It is off unless `HR_ADMIN_PASSWORD_LOGIN_ENABLED` is on, and Kelly retires it 7 days after Google sign-in is live. It is not a Bearer token, not an `x-admin-secret`, and it does not sign sessions.

The browser session is the `hr_admin_session` cookie `requireAdmin` already checks. It lasts 8 hours, is signed with `HR_ADMIN_SESSION_SECRET`, and must carry an email that is still on `HR_ADMIN_ALLOWED_EMAILS`. Removing an address ends that session on the next request. Cookies signed with `ADMIN_SECRET`, and cookies with no email, are rejected. The break-glass email `break-glass@tradingsolutions.com` is not on the allowlist; it works only while the password flag is on.

The OAuth redirect URI comes from `NEXT_PUBLIC_APP_URL`, so Vercel and Cloud Run behind the Google load balancer use the same value. IAP (`x-goog-iap-jwt-assertion`) is accepted only on Cloud Run (`K_SERVICE` set and `VERCEL` / `VERCEL_ENV` unset). On Vercel the header is ignored.

## Env vars for the staging and prod cutover

Set the same names on the staging host and on production (Vercel Production and the Cloud Run service). Values are different per host. Do not commit them. Each secret is at least 16 characters (`openssl rand -base64 32`). Do not reuse one value for another name.

| Name | Staging and prod | Who uses it |
|---|---|---|
| `GOOGLE_ADMIN_OAUTH_CLIENT_ID` | both, when Google sign-in is turned on | The HR Admin OAuth client. Not the Gmail client (`GOOGLE_CLIENT_ID`). |
| `GOOGLE_ADMIN_OAUTH_CLIENT_SECRET` | both | Server only, token exchange. |
| `HR_ADMIN_ALLOWED_EMAILS` | both | Comma-separated `@tradingsolutions.com` emails. Re-checked on every request. Cloud Run value: `cwo@tradingsolutions.com,jointheteam@tradingsolutions.com`. Empty admits nobody through Google, IAP, or an existing session. |
| `HR_ADMIN_SESSION_SECRET` | both, required before a candidate-facing deploy | Signs the session. Missing, shorter than 16 characters, or equal to another auth secret: `[hr-admin] FATAL` in the log. On Cloud Run the process exits and `/api/health` is 503 `{ok:false}`, so the HTTP probe never marks the revision Ready. On Vercel production the dynamic site returns 500 (fail closed), including `/api/health`; that host does not serve the 503 body. Load this secret in Vercel Production before deploying. Rollback there is to promote the previous deployment. Cloud Run secret: `prd-careers-hr-admin-session-secret` / `stg-careers-hr-admin-session-secret`. |
| `HR_ADMIN_PASSWORD_LOGIN_ENABLED` | `0` at cutover | Vault break-glass. On only for `1`, `true`, `yes`, or `on`. The password itself must be at least 16 characters. Retired 7 days after Google sign-in is live. |
| `ADMIN_SECRET` | both, rotated | Vault password for `POST /api/hr-admin/login` only, and only while the flag is on. Not a session signer, not a script key, and not the portal signer. Must differ from the other three secrets. |
| `ADMIN_SCRIPTS_SECRET` | optional | Only the three script routes below. The Cloud Run YAML does not reference it, so the service starts without the secret. Add `prd-careers-admin-scripts-secret` or `stg-careers-admin-scripts-secret` only when those jobs run. Unset, short, or equal to another secret: those calls fail closed. |
| `PORTAL_TOKEN_SECRET` | both, required before a candidate-facing deploy | Signs new portal links. At least 32 characters. Missing, short, or duplicated: same FATAL startup exit and health 503 as the session secret, and `POST /api/applications` refuses before inserting. Cloud Run secret: `prd-careers-portal-token-secret` / `stg-careers-portal-token-secret`. |
| `PORTAL_TOKEN_LEGACY_UNTIL` | placeholder until cutover | Only `YYYY-MM-DD`. The cap is 14 days after 2026-10-30, measured once, not per request. Because the day runs through 23:59 UTC, the last date that fits is 13 days later (`2026-11-12`). A later date is refused at startup and never becomes valid. The YAML value `SET_AT_CUTOVER_YYYY-MM-DD` is ignored. `ADMIN_SECRET` must be at least 16 characters for those old links. |
| `CRON_SECRET` | Vercel production, required by the four scheduled jobs | `vercel.json` schedules `/api/cron/run-reminders` (`0 */6 * * *`), `/api/cron/digest-email` (`0 13 * * 1-5`), `/api/cron/morning-brief` (`0 11 * * *`), and `/api/cron/sync-contactos` (`15 * * * *`). Deploy check: at least 16 characters, and different from `ADMIN_SECRET`, `ADMIN_SCRIPTS_SECRET`, `HR_ADMIN_SESSION_SECRET`, and `PORTAL_TOKEN_SECRET`. Missing, shorter, or equal to `ADMIN_SECRET` or the scripts secret: those routes return 401. Equal to the session secret or the portal secret: they return 500. An unset value does not by itself exit the process. |
| `GOOGLE_MAILBOX_ALLOWED_EMAILS` | both | Cloud Run sets `jointheteam@tradingsolutions.com`. The mailbox the careers service may send as. |
| `IAP_AUDIENCE` | Cloud Run only | Expected `aud` of the IAP JWT. The service YAML ships `REPLACE_WITH_IAP_AUDIENCE` until the load balancer id is filled in. Leave unset on Vercel. |
| `NEXT_PUBLIC_APP_URL` | already set | Public origin. Redirect URI is `{origin}/api/hr-admin/login/google/callback`. |

`HR_ADMIN_SESSION_SECRET`, `ADMIN_SECRET`, `ADMIN_SCRIPTS_SECRET`, `PORTAL_TOKEN_SECRET`, and `CRON_SECRET` must all be different values. If any two match, the ones that match are refused. Before a Vercel production deploy, confirm `CRON_SECRET` is at least 16 characters and distinct from the other four. Otherwise the four jobs in `vercel.json` return 401, or 500 when `CRON_SECRET` equals `HR_ADMIN_SESSION_SECRET` or `PORTAL_TOKEN_SECRET`. An unset `CRON_SECRET` does not exit the process; the scheduled jobs still return 401.

On Cloud Run (`K_SERVICE`), a missing or reused session secret, a bad portal secret, or a legacy date past the cap logs `[hr-admin] FATAL` and `process.exit(1)`. `GET /api/health` returns 503 `{ok:false}` with no variable names, and the startup probe fails.

On Vercel production the same misconfiguration fails closed as HTTP 500 on the dynamic site. `/api/health` is not 503 there. Load `HR_ADMIN_SESSION_SECRET` and `PORTAL_TOKEN_SECRET` before the deploy. If a bad revision ships, promote the previous deployment.

Production OAuth secrets: `prd-careers-google-admin-oauth-client-id` and `prd-careers-google-admin-oauth-client-secret`. Staging needs its own pair, `stg-careers-google-admin-oauth-client-id` and `stg-careers-google-admin-oauth-client-secret`, with redirect URI `https://stg-careers-gcp-z4sq5ztzyq-uw.a.run.app/api/hr-admin/login/google/callback`. The image gets that origin from `_APP_URL` in `infra/gcp/careers.cloudbuild.yaml`. Production builds pass `_APP_URL=https://careers.tradingsolutions.com`.

Load `HR_ADMIN_SESSION_SECRET` and `PORTAL_TOKEN_SECRET` in Vercel Production before this revision is deployed. Without them Vercel production returns 500 on the dynamic site. Rollback is to promote the previous deployment. Cloud Run exits instead, and its health probe stays red.

The service YAML uses `key: latest`. Before `gcloud run services replace`, pin each secret to the version you just verified (`key: 3`, from `gcloud secrets versions list`). The production image line is `sha256:REPLACE_WITH_PRD_IMAGE_DIGEST`. Substitute the digest from the `_TAG=prd` build in that same command. Do not apply a stale digest.

### Who calls `ADMIN_SCRIPTS_SECRET`

Send it as `Authorization: Bearer` or `x-admin-secret`. It opens only these three routes. Battery, ranking, candidate files, and evaluate-candidate require an HR session cookie.

| Route | Who | Header |
|---|---|---|
| `POST` and `GET /api/admin/seed-linkedin-apps` | Engineering, one-shot LinkedIn Recruiter import | `Authorization: Bearer` |
| `POST /api/headhunting/sync-from-neon` | Engineering, one-shot copy from Neon talent pool into Supabase | `Authorization: Bearer` |
| `POST /api/headhunting/reseed-scenarios` | Engineering, reseed Elevare scenarios for the TS model | `x-admin-secret` or Bearer |

A logged-in HR session can still call those routes. `ADMIN_SECRET` cannot.

### Portal links

New links are `HMAC(id|email, PORTAL_TOKEN_SECRET)` truncated to 16 hex characters. Set `PORTAL_TOKEN_LEGACY_UNTIL` to seven days after the cutover so links already in candidates' inboxes, signed with the old `ADMIN_SECRET`, keep opening until that date. After it, only the new secret verifies. Rotating `ADMIN_SECRET` during those seven days invalidates the legacy links immediately, because the legacy check uses the current `ADMIN_SECRET`.

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
3. Rotate `ADMIN_SECRET` to a new vault value of at least 16 characters, different from the session, script, and portal secrets. The old value must stop working. It is only the break-glass password, and only while `HR_ADMIN_PASSWORD_LOGIN_ENABLED` is on.
4. New portal links use `PORTAL_TOKEN_SECRET`. Set `PORTAL_TOKEN_LEGACY_UNTIL` to seven days out before rotating `ADMIN_SECRET` if candidates still hold old links. After the legacy date, or once `ADMIN_SECRET` changes, those old links stop.
5. Update any curl that called seed-linkedin-apps, sync-from-neon, or reseed-scenarios with `ADMIN_SECRET`. Point them at `ADMIN_SCRIPTS_SECRET`. Battery, ranking, files, and evaluate-candidate do not take that secret. If a script job is unused, leave `ADMIN_SCRIPTS_SECRET` unset so the call fails closed.
6. Keep the password flag off. If the vault key is needed in the 7 days after go-live, set `HR_ADMIN_PASSWORD_LOGIN_ENABLED=1` on that host only. The form comes back and `POST /api/hr-admin/login` checks `ADMIN_SECRET`. Each attempt is logged with a warning (`break-glass password login`). The session it creates is signed with `HR_ADMIN_SESSION_SECRET` and the email claim `break-glass@tradingsolutions.com`. Bearer and `x-admin-secret` still do not accept `ADMIN_SECRET`.
7. On day 7, turn the flag off (unset it) and rotate `ADMIN_SECRET` once more so the retired password is not the value stored in the vault.

To stop Google and IAP without a code rollback, clear `HR_ADMIN_ALLOWED_EMAILS`.
