create or replace function public.generate_promotion_redemption_token()
returns text
language plpgsql
as $generate_token$
begin
  return upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
end;
$generate_token$;
