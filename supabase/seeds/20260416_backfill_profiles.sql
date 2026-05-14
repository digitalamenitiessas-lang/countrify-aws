-- Repairs missing public.profiles rows for existing Auth users.
-- Safe to run multiple times.

insert into public.profiles (
  id,
  email,
  full_name,
  avatar_text
)
select
  users.id,
  coalesce(users.email, ''),
  coalesce(users.raw_user_meta_data ->> 'full_name', split_part(coalesce(users.email, ''), '@', 1)),
  upper(left(coalesce(users.raw_user_meta_data ->> 'full_name', split_part(coalesce(users.email, ''), '@', 1), 'U'), 2))
from auth.users as users
left join public.profiles profiles
  on profiles.id = users.id
where profiles.id is null;

select
  users.email,
  users.id as auth_user_id,
  profiles.id as profile_id
from auth.users as users
left join public.profiles as profiles
  on profiles.id = users.id
where users.email like '%@citify.test'
order by users.email;
