-- Only the daily job (publishable key, anon role) calls the reminder functions; signed-in
-- users never need them. Both still require the secret token.
revoke execute on function public.cron_reminders_due(text) from authenticated;
revoke execute on function public.cron_mark_reminders_sent(text, text[]) from authenticated;
