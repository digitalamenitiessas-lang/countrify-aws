-- Add location fields to businesses
ALTER TABLE IF EXISTS public.businesses
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- Add location fields to buildings
-- Note: 'address' already exists in buildings, so we only need latitude and longitude
ALTER TABLE IF EXISTS public.buildings
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;
