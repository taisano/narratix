-- Stripe の購読（docs/pricing-plan.md 7章）。
-- ・billing_subscriptions：本人は読めるだけ。書くのは Webhook（service role）が下の関数を呼ぶ時だけ。
-- ・billing_events：Stripe のイベント ID を残し、同じ通知の二重処理を防ぐ（中身は残さない）。
-- ・apply_stripe_subscription：購読の状態を保存し、user_plans.plan を合わせる。service_role だけが実行できる。
--   有効（active / trialing / past_due＝支払い再試行中の猶予）の間は有料プラン、それ以外は free に戻す。
-- 何度流しても同じ結果になるように書いてある。

create table if not exists public.billing_subscriptions (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id   text not null,
  stripe_subscription_id text not null,
  status               text not null,
  price_id             text,
  plan                 text not null check (plan in ('pro', 'team')),
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_at        timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists billing_subscriptions_customer_idx on public.billing_subscriptions (stripe_customer_id);
alter table public.billing_subscriptions enable row level security;
drop policy if exists "billing: read own" on public.billing_subscriptions;
create policy "billing: read own" on public.billing_subscriptions
  for select to authenticated using (user_id = auth.uid());
revoke all on public.billing_subscriptions from anon, authenticated;
grant select on public.billing_subscriptions to authenticated;

create table if not exists public.billing_events (
  event_id    text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

create or replace function public.apply_stripe_subscription(
  p_event_id text, p_event_type text, p_event_created timestamptz,
  p_user uuid, p_customer text, p_subscription text, p_status text,
  p_price text, p_plan text, p_period_end timestamptz, p_cancel_at_end boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_row public.billing_subscriptions%rowtype;
  v_active boolean;
  v_new_plan text;
begin
  if p_event_id is null or p_user is null or p_plan not in ('pro', 'team') then
    raise exception 'bad_args';
  end if;
  insert into public.billing_events (event_id, type) values (p_event_id, p_event_type)
    on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;

  v_active := p_status in ('active', 'trialing', 'past_due');
  select * into v_row from public.billing_subscriptions where user_id = p_user for update;
  if found then
    -- 古い通知が後から届いた
    if p_event_created < v_row.last_event_at then return 'stale'; end if;
    -- 別の購読の終了通知（今の購読はまだ有効）は、今のプランに影響させない
    if not v_active and v_row.stripe_subscription_id <> p_subscription
       and v_row.status in ('active', 'trialing', 'past_due') then
      return 'ignored';
    end if;
  end if;

  insert into public.billing_subscriptions as b (user_id, stripe_customer_id, stripe_subscription_id, status, price_id, plan,
                                                  current_period_end, cancel_at_period_end, last_event_at, updated_at)
  values (p_user, p_customer, p_subscription, p_status, p_price, p_plan, p_period_end, coalesce(p_cancel_at_end, false), p_event_created, now())
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id,
    status = excluded.status, price_id = excluded.price_id, plan = excluded.plan,
    current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_at = excluded.last_event_at, updated_at = now();

  v_new_plan := case when v_active then p_plan else 'free' end;
  insert into public.user_plans (user_id, plan, updated_at) values (p_user, v_new_plan, now())
    on conflict (user_id) do update set plan = excluded.plan, updated_at = now();
  return 'applied';
end $$;

revoke all on function public.apply_stripe_subscription(text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription(text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, boolean) to service_role;
