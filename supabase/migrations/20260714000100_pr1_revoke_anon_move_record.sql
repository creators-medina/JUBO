-- ─────────────────────────────────────────────────────────────────────────
-- PR1 corrective — revoke the residual explicit `anon` EXECUTE grant on
-- move_record(UUID, UUID, UUID, movement_type).
--
-- PR1 (20260713000000) revoked EXECUTE from PUBLIC, but the production database
-- carried a PRE-EXISTING explicit grant to the `anon` role, which `REVOKE …
-- FROM PUBLIC` does not remove — so `anon` could still reach the RPC. That was
-- corrected manually in production; this follow-up preserves that manual
-- production correction in migration source control, so a fresh environment
-- reaches the same hardened state. Only the `anon` grant is touched.
--
-- Idempotent: revoking an already-absent grant is a no-op.
-- ─────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE
  ON FUNCTION public.move_record(UUID, UUID, UUID, public.movement_type)
  FROM anon;
