-- ===========================================================================
-- Reset every lab user's safety training — ICT-Lab
-- ===========================================================================
-- Makes all lab_user accounts start the three safety steps from scratch, so
-- everyone goes through the new video + knowledge check flow.
--
-- THIS DELETES REAL RECORDS: step completions, manager approvals, and the
-- certificate_url pointing at any file a user uploaded for Steps 2 and 3. The
-- files stay in storage; the link from the step to them does not. Step 1 is
-- unaffected by that — it issues no document.
--
-- Run the whole file. The backup is the first statement on purpose.
-- ===========================================================================

-- 1. Backup. Undo is: INSERT INTO lab_safety_progress SELECT * FROM this table.
DROP TABLE IF EXISTS lab_safety_progress_backup_20260921;
CREATE TABLE lab_safety_progress_backup_20260921 AS
SELECT * FROM lab_safety_progress;

-- 2. What is about to go, before it goes.
SELECT count(*) AS rows_to_delete,
       count(DISTINCT p.user_id) AS lab_users_affected,
       count(*) FILTER (WHERE p.completed)            AS approved_steps_lost,
       count(*) FILTER (WHERE p.certificate_url IS NOT NULL) AS certificate_links_lost
FROM lab_safety_progress p
JOIN users u ON u.id = p.user_id
WHERE u.role = 'lab_user';

-- 3. The reset. Scoped to role = 'lab_user' so lab managers and admins keep
--    their own records.
DELETE FROM lab_safety_progress p
USING users u
WHERE u.id = p.user_id
  AND u.role = 'lab_user';

-- 4. Confirm.
SELECT count(*) AS lab_user_rows_remaining
FROM lab_safety_progress p
JOIN users u ON u.id = p.user_id
WHERE u.role = 'lab_user';
