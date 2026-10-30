# Trading Solutions Careers

Applicant tracking for Trading Solutions. Candidate mail leaves through the Gmail API as `Talent Acquisition Team <jointheteam@tradingsolutions.com>`.

## Mail recipient guard

Staging databases contain real candidate addresses copied from production. The same check runs before every Gmail send, every Gmail draft, and every Calendar invite that would notify attendees (`sendUpdates`).

`MAIL_RECIPIENT_ALLOWLIST` is a comma-separated list of exact emails or `@domain` entries. When it is set, a To, Cc, or Bcc outside the list is not sent. A blocked row stores only the recipient domain, a hash of the address, and the template id. It does not store the address or the HTML.

Anything that is not production blocks every send when the allowlist is missing. Production is `VERCEL_ENV=production` with no `K_SERVICE`, or a Cloud Run service whose name starts with `prd-` (`prd-careers` has no `VERCEL_ENV`). Staging and preview are a service starting with `stg-`, `VERCEL_ENV=preview`, or `development`. A local run, any other `K_SERVICE`, and `STAGING_READ_ONLY` set to `1` or `true` stay guarded. The check does not use the Google OAuth environment helper, which treats a missing `VERCEL_ENV` as production.

Each recipient must be exactly one address. Comments, line breaks, extra angle brackets, and extra `@` are rejected. The header is built only from the parsed address.

Staging value:

```
MAIL_RECIPIENT_ALLOWLIST=cwo@tradingsolutions.com,jointheteam@tradingsolutions.com
```

The rest of the mail flags are in `docs/EMAIL-FLAGS.md`.
