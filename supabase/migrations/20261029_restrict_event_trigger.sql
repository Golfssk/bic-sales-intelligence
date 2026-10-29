-- Optional hardening for projects with Supabase's public auto-RLS event trigger.
-- This does not disable the DDL event trigger or revoke bic_ingest from signed-in users.
DO $$ BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;
