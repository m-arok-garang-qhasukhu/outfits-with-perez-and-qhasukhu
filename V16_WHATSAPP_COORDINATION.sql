-- P&Q V16: admin-authored WhatsApp coordination messages for tailoring requests.
begin;
alter table public.tailoring_requests
  add column if not exists customer_message text not null default '',
  add column if not exists customer_message_sent_at timestamptz;
comment on column public.tailoring_requests.customer_message is 'Admin-authored customer-facing coordination message; visible only after sent timestamp is set.';
comment on column public.tailoring_requests.customer_message_sent_at is 'Admin confirmation timestamp after opening WhatsApp and sending the prepared message.';
commit;
