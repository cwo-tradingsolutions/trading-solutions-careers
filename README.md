# Trading Solutions Careers

Applicant tracking for Trading Solutions. Candidate mail leaves through the Gmail API as `Talent Acquisition Team <jointheteam@tradingsolutions.com>`.

## Mail recipient guard

Staging databases contain real candidate addresses copied from production. The same check runs before every Gmail send, every Gmail draft, and every Calendar invite that would notify attendees (`sendUpdates`).

`MAIL_RECIPIENT_ALLOWLIST` is a comma-separated list of exact emails or `@domain` entries. When it is set, a To, Cc, or Bcc outside the list is not sent. A blocked row stores only the recipient domain, a hash of the address, and the template id. It does not store the address or the HTML.

Anything that is not production blocks every send when the allowlist is missing. Production is `VERCEL_ENV=production` with no `K_SERVICE`, or `K_SERVICE` exactly `prd-careers` (Cloud Run prod has no `VERCEL_ENV`). `prd-careers-stg` is not production. Staging and preview are a service starting with `stg-`, `VERCEL_ENV=preview`, or `development`. A local run, any other `K_SERVICE`, and `STAGING_READ_ONLY` set to `1` or `true` stay guarded. The check does not use the Google OAuth environment helper, which treats a missing `VERCEL_ENV` as production.

In production, an address that fails the parser is stored as `invalid_recipient`, not `bloqueado_staging`. HR Admin shows that count. The row keeps the domain and a hash, not the address or the HTML.

A direct send reserves its dedup key before calling Gmail. Keys `rejection_resend:`, `headhunting_invite:`, `battery_auto:`, and `battery_invite:` include a 2-minute window so a later resend can go out. A second click in that window returns `duplicado` and does not write `rejection_sent_at`.

`ats_outbound_mail_purge_bodies()` runs from the HR mail listing (`maintainOutboundMail`). After 30 days it clears the address, HTML, reply-to, bcc, and `http` links from `sent`, `agotado`, `pending`, `bloqueado_staging`, and `invalid_recipient` rows. It does not delete candidate rows. `ats_outbound_mail_release_stale_sends()` adds an attempt and, when a Gmail id is already stored, marks the row sent instead of sending it again.

Each recipient must be exactly one address. Comments, line breaks, extra angle brackets, and extra `@` are rejected. The header is built only from the parsed address.

Staging value:

```
MAIL_RECIPIENT_ALLOWLIST=cwo@tradingsolutions.com,jointheteam@tradingsolutions.com
```

The rest of the mail flags are in `docs/EMAIL-FLAGS.md`.
