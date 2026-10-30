# Candidate email flags

Merge only after Kelly's final GO (prod window).

Each on/off flag stays off unless the value is `1`, `true`, `yes`, or `on`. Missing or empty is off.

| Flag | What it controls | Default | Prod value planned today |
|---|---|---|---|
| `BATTERY_AUTO_SEND_ENABLED` | Automatic Batería TS email only (prefilter pass, or a stage move to `prefiltro_pasado`). Off records “batería pendiente de envío”. The manual battery button is not this flag. | off | not set |
| `STAGE_DRAFTS_ENABLED` | Gmail draft when a stage moves to `assessment_invitado`, and the welcome Gmail draft when a stage moves to `contratado`. The assessment token and the hired person record are still created. | off | not set |
| `APPLICATION_STATUS_EMAILS_ENABLED` | Real emails from `PATCH /api/applications/[id]` for interview, offer, and hired. | off | not set |
| `REJECTION_EMAILS_ENABLED` | Rejection mail with the approved general ES/EN text. A stage move to `rechazado`, reject-with-reason, and resend (draft mode) create a Gmail draft. `PATCH /api/applications/[id]` with status `rejected` sends that same copy. | off | `1` (on) |
| `INTERVIEW_TEST_RECIPIENTS` | Interview-invite allowlist. Missing or empty refuses the send. Only `cwo@tradingsolutions.com` and `jointheteam@tradingsolutions.com` can receive. | unset (send refused) | `cwo@tradingsolutions.com,jointheteam@tradingsolutions.com` (approved) |
| `INTERVIEW_INVITES_UNRESTRICTED` | The only lift that mails the real candidate and the interviewer. | off | not set |
| `EMAIL_BCC` | Not read. The acknowledgement (`POST /api/applications`), the assessment invite when `send_email` is set (`POST /api/assessments`), and status mail from `PATCH /api/applications/[id]` call `candidateMailBcc()` and send with no BCC. `recruiter_config.email_bcc` is not selected on those paths. | empty | removed / empty |
| `MAIL_RECIPIENT_ALLOWLIST` | Comma-separated exact emails or `@domain` entries. When set, any To, Cc, or Bcc outside the list is not sent. The message is stored as `bloqueado_staging` and the warning log names only the domain. If this is unset on a non-prod process (`K_SERVICE` starting with `stg-`, `STAGING_READ_ONLY=1`, `VERCEL_ENV` of preview or development, or a non-production `NEXT_PUBLIC_APP_URL`), every send is blocked. `VERCEL_ENV=production` and `K_SERVICE=prd-careers` send as usual when the list is unset. Staging value: `cwo@tradingsolutions.com,jointheteam@tradingsolutions.com`. | unset | unset (staging sets the two team addresses) |

`INTERVIEW_INVITES_ENABLED` does not gate the send. `decideDelivery` ignores it. The invite GET reports `production_enabled` from it. Planned prod value: not set.

`BATTERY_AUTO_SEND_ENABLED`, `STAGE_DRAFTS_ENABLED`, `APPLICATION_STATUS_EMAILS_ENABLED`, and `INTERVIEW_INVITES_UNRESTRICTED` stay unset.

Agendar entrevista is hidden from the HR header. `POST /api/headhunting/candidates/[id]/schedule-interview` returns 410 and does not write `ts_interviews` or send mail. Old joint-booking links at `/agenda-conjunta/[token]` show a closed message. `GET /api/joint-schedulings/[token]` returns 410 with the same message as book, before any database read, so interviewer emails are not returned. `POST /api/joint-schedulings/[token]/book` and `POST /api/admin/candidates/[id]/send-joint-scheduling` return 410 and do not create a calendar event. Manual assessment invites, including the Pruebas complementarias button, are unchanged.
