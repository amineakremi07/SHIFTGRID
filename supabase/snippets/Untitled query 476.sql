-- Exécuter dans le SQL Editor Supabase
UPDATE supabase_migrations.schema_migrations 
SET version = '20261005000000' 
WHERE version LIKE '%production_hardening%';