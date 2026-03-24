-- =====================================================
-- DATA MIGRATION SCRIPT
-- Source: hrms_dev2
-- Target: hrms_production_new
-- Generated: 02/15/2026 01:58:10
-- =====================================================

BEGIN;
SET session_replication_role = 'replica';



-- Re-enable triggers
SET session_replication_role = 'origin';
COMMIT;
