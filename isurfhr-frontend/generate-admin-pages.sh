#!/bin/bash

# Define the base directory
BASE_DIR="src/pages/admin"

# List of file names and component names
declare -A pages=(
  ["CompaniesList"]="CompaniesList"
  ["Departments"]="Departments"
  ["BusinessUnits"]="BusinessUnits"
  ["Vacancies"]="Vacancies"
  ["JobApplications"]="JobApplications"
  ["AptitudeTests"]="AptitudeTests"
  ["TaskDashboard"]="TaskDashboard"
  ["ReportsHub"]="ReportsHub"
  ["TrainingSetup"]="TrainingSetup"
  ["CertificationSetup"]="CertificationSetup"
  ["LeaveSettings"]="LeaveSettings"
  ["LeaveApprovers"]="LeaveApprovers"
  ["ImportLeaveRecords"]="ImportLeaveRecords"
  ["PayrollTemplates"]="PayrollTemplates"
  ["ProcessPayroll"]="ProcessPayroll"
  ["PayrollPositions"]="PayrollPositions"
  ["LoanTerms"]="LoanTerms"
  ["AllStaffLoans"]="AllStaffLoans"
  ["BenefitsCatalog"]="BenefitsCatalog"
  ["KpiSetup"]="KpiSetup"
  ["OffboardingChecklist"]="OffboardingChecklist"
)

# Create base directory if it doesn't exist
mkdir -p "$BASE_DIR"

# Create files with basic boilerplate
for file in "${!pages[@]}"; do
  FILE_PATH="$BASE_DIR/${file}.jsx"
  COMPONENT_NAME="${pages[$file]}"
  echo "Creating $FILE_PATH"

  cat <<EOF > "$FILE_PATH"
export default function ${COMPONENT_NAME}() {
  return <div>${COMPONENT_NAME} Page</div>;
}
EOF

done

echo "✅ All admin page components created in $BASE_DIR"
