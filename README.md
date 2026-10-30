# Trading Solutions Careers

Applicant tracking for Trading Solutions. Candidate mail leaves only through the Gmail API as `Talent Acquisition Team <jointheteam@tradingsolutions.com>`.

## Mail recipient guard

Staging databases contain real candidate addresses copied from production. `sendViaGmail` is the only send path (acknowledgements, status mail, assessments, battery invites, the pending replay, and the digest). It checks every To, Cc, and Bcc before it calls Gmail.

`MAIL_RECIPIENT_ALLOWLIST` is a comma-separated list of exact emails or `@domain` entries. When it is set, a recipient that is not on the list is not sent. The message is stored with status `bloqueado_staging`, and the warning log names only the domain.

If this process is not production and the allowlist is missing, every send is blocked. Non-production means any of:

- `K_SERVICE` starts with `stg-`
- `STAGING_READ_ONLY=1`
- `VERCEL_ENV` is `preview` or `development`
- `NEXT_PUBLIC_APP_URL` is localhost, a staging host, or a non-production `*.vercel.app` host

Production (`VERCEL_ENV=production`, or `K_SERVICE=prd-careers`) sends as usual when the allowlist is unset.

Staging value:

```
MAIL_RECIPIENT_ALLOWLIST=cwo@tradingsolutions.com,jointheteam@tradingsolutions.com
```

The rest of the mail flags are in `docs/EMAIL-FLAGS.md`.
