-- ═══════════════════════════════════════════════════════════════════════════
-- support_messages_manage.sql — let the Customer Service inbox delete and
-- mark messages (Oct 2026). The SAME file lives in ictlab/ and labhive/; run
-- it in BOTH databases. Idempotent. The same rules are in rls_phase1.sql.
--
-- support_messages had INSERT (anyone) and SELECT (super admin + sender)
-- policies but none for UPDATE or DELETE, so Delete and Mark read / resolved
-- matched zero rows: no error, nothing changed, and the messages came back.
-- Only the super admin reads the inbox, so only the super admin may change it.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS support_messages_update ON support_messages;
CREATE POLICY support_messages_update ON support_messages FOR UPDATE TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS support_messages_delete ON support_messages;
CREATE POLICY support_messages_delete ON support_messages FOR DELETE TO authenticated
  USING (is_super_admin());

-- ── Check — run last. Expect four rows: delete, insert, select, update.
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'support_messages'
ORDER BY policyname;
