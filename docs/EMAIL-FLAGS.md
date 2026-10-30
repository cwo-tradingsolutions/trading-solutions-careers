# Candidate email flags

Merge only after Kelly's final GO (prod window).

Each on/off flag stays off unless the value is `1`, `true`, `yes`, or `on`. Missing or empty is off.

| Flag | What it controls | Default | Prod value planned today |
|---|---|---|---|
| `BATTERY_AUTO_SEND_ENABLED` | Automatic Batería TS email only (prefilter pass, or a stage move to `prefiltro_pasado`). Off records “batería pendiente de envío”. The manual battery button is not this flag. | off | not set |
| `STAGE_DRAFTS_ENABLED` | Gmail draft when a stage moves to `assessment_invitado`, and the welcome Gmail draft when a stage moves to `contratado`. The assessment token and the hired person record are still created. | off | not set |
| `APPLICATION_STATUS_EMAILS_ENABLED` | Real emails from `PATCH /api/applications/[id]` for interview, offer, and hired. | off | not set |
| `REJECTION_EMAILS_ENABLED` | Rejection mail: the stage-move draft, reject-with-reason, resend, and the rejected status on that same PATCH. | off | pending Kelly's GO |
| `INTERVIEW_TEST_RECIPIENTS` | Interview-invite allowlist. Missing or empty refuses the send. Only `cwo@tradingsolutions.com` and `jointheteam@tradingsolutions.com` can receive. | unset (send refused) | `cwo@tradingsolutions.com,jointheteam@tradingsolutions.com` pending Kelly's GO |
| `INTERVIEW_INVITES_UNRESTRICTED` | The only lift that mails the real candidate and the interviewer. | off | not set |

`INTERVIEW_INVITES_ENABLED` does not gate the send. `decideDelivery` ignores it. The invite GET reports `production_enabled` from it. Planned prod value: not set.

Agendar entrevista is hidden from the HR header. `POST /api/headhunting/candidates/[id]/schedule-interview` returns 410 and does not write `ts_interviews` or send mail. Old joint-booking links at `/agenda-conjunta/[token]` show a closed message. `POST /api/joint-schedulings/[token]/book` and `POST /api/admin/candidates/[id]/send-joint-scheduling` return 410 and do not create a calendar event. Manual assessment invites are unchanged.
