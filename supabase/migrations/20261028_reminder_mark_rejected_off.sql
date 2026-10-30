-- Auto-rechazo por recordatorios agotados queda OFF hasta GO de Kelly.
-- Las reglas que marcaban stage=rechazado pasan a pausa (re-engage manual).
-- El cron también trata un mark_rejected residual como pausa.

UPDATE ts_reminder_rules
SET on_exhausted_action = 'mark_paused',
    updated_at = NOW()
WHERE on_exhausted_action = 'mark_rejected';
