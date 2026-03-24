# =====================================================
# EXPORT/IMPORT DATA SCRIPT
# =====================================================

$sourceDB = "hrms"
$targetDB = "hrms_dev"
$hostname = "isurfglobal-storage-isurfglobal-61ba.g.aivencloud.com"
$port = "18489"
$username = "avnadmin"
$password = $env:AIVEN_DB_PASSWORD  # Set via environment variable - never hardcode credentials

Write-Host "🚀 Starting data export/import..." -ForegroundColor Cyan

# Set password for PostgreSQL commands
$env:PGPASSWORD = $password

# Step 1: Export data from source
Write-Host "📤 Exporting data from $sourceDB..." -ForegroundColor Yellow
pg_dump -U $username -h $hostname -p $port -d $sourceDB `
  --data-only `
  --column-inserts `
  --rows-per-insert=1000 `
  -f hrms_data_dump.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Data exported successfully" -ForegroundColor Green
    Write-Host "   File size: $((Get-Item hrms_data_dump.sql).Length / 1MB) MB"
} else {
    Write-Host "❌ Export failed" -ForegroundColor Red
    exit 1
}

# Step 2: Truncate existing tables in target (optional - if you want to start fresh)
Write-Host "🗑️ Truncating existing tables in $targetDB..." -ForegroundColor Yellow
psql -U $username -h $hostname -p $port -d $targetDB -c "
    TRUNCATE TABLE 
        companies, staff_records, jobs, candidates, leave_policies,
        public_holidays, ai_settings, staff_uploads, payroll_uploads,
        leave_uploads, \"PasswordReset\", leave_types, job_applications,
        candidate_files, candidate_documents, keywords, leave_blackout_periods,
        staff_leave_balances, leave_requests, attendances, payrolls,
        interviews, offers, application_stage_history, ai_usage_logs,
        payslips, onboardings, user_companies, onboarding_tasks
    RESTART IDENTITY CASCADE;
" 2>$null

# Step 3: Import data to target
Write-Host "📥 Importing data to $targetDB..." -ForegroundColor Yellow
psql -U $username -h $hostname -p $port -d $targetDB -v ON_ERROR_STOP=1 -f hrms_data_dump.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Data imported successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Import failed" -ForegroundColor Red
    exit 1
}

# Step 4: Verify
Write-Host "🔍 Verifying data..." -ForegroundColor Yellow
$verifySQL = @"
SELECT 
    (SELECT COUNT(*) FROM companies) as companies,
    (SELECT COUNT(*) FROM staff_records) as staff,
    (SELECT COUNT(*) FROM jobs) as jobs,
    (SELECT COUNT(*) FROM candidates) as candidates,
    (SELECT COUNT(*) FROM leave_requests) as leave_requests,
    (SELECT COUNT(*) FROM payrolls) as payrolls,
    (SELECT COUNT(*) FROM payslips) as payslips;
"@

Write-Host "`n📊 Row Counts:" -ForegroundColor Cyan
$verifySQL | psql -U $username -h $hostname -p $port -d $targetDB

# Clean up
Remove-Item ENV:PGPASSWORD

Write-Host "`n✨ Export/Import complete!" -ForegroundColor Green