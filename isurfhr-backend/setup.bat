@echo off
echo ========================================
echo    HRMS Project Setup
echo ========================================
echo.

echo Checking for Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found!
    echo.
    echo Please install Node.js from:
    echo https://nodejs.org/
    echo.
    echo Or download portable Node.js and place
    echo node.exe in this folder.
    echo.
    pause
    exit /b 1
)

echo ✓ Node.js found
node --version

echo.
echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Generating Prisma client...
call npm run db:generate
if errorlevel 1 (
    echo WARNING: Prisma generate may have issues
)

echo.
echo Setting up database...
call npm run db:push
if errorlevel 1 (
    echo NOTE: Check your .env file for DATABASE_URL
)

echo.
echo ========================================
echo    Setup Complete!
echo ========================================
echo.
echo To start the development server:
echo npm run dev
echo.
pause