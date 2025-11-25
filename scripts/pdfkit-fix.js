// scripts/pdfkit-fix.js
const fs = require('fs');
const path = require('path');

console.log('Applying PDFKit fixes for Windows...');

// Ensure required directories exist
const dirs = [
  'uploads/staff',
  'uploads/payroll',
  'public/payslips',
  'public/templates',
  'src/app/api/auth/login',
  'src/app/api/auth/register', 
  'src/app/api/auth/me',
  'src/app/api/auth/complete-registration',
  'src/app/api/staff/upload',
  'src/app/api/staff/records',
  'src/app/api/staff/profile',
  'src/app/api/staff/payslips',
  'src/app/api/payroll/upload',
  'src/app/api/payroll/download-failed',
  'src/app/api/payroll/batch',
  'src/app/api/admin/dashboard',
  'src/app/api/admin/uploads'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Create a simple test file to verify setup
const testFile = path.join('public', 'payslips', 'test.txt');
fs.writeFileSync(testFile, 'PDFKit directory test - OK');

console.log('PDFKit fixes applied successfully!');