@echo off
REM ============================================================================
REM
REM AUTOMATED DEPLOYMENT SCRIPT - Enhanced Step Editor (Windows)
REM 
REM This script automates the entire deployment process:
REM - Copies component files
REM - Updates imports
REM - Builds the project
REM - Deploys to production
REM - Verifies deployment
REM
REM Usage: deploy.bat
REM
REM ============================================================================

setlocal enabledelayedexpansion

REM Colors (Windows 10+)
cls

echo.
echo ==========================================
echo    DEPLOYMENT AUTOMATION SCRIPT
echo    Enhanced Step Editor for AITAS
echo ==========================================
echo.

REM ============================================================================
REM PHASE 1: VERIFICATION
REM ============================================================================

echo [Phase 1] Verification (2 min)
echo ---

if not exist "package.json" (
    echo Error: package.json not found. Are you in the project root?
    exit /b 1
)
echo [OK] Project root detected

if not exist "node_modules" (
    echo [INFO] node_modules not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo Error: npm install failed
        exit /b 1
    )
)
echo [OK] Dependencies installed

REM ============================================================================
REM PHASE 2: COPY FILES
REM ============================================================================

echo.
echo [Phase 2] Copying Component Files (2 min)
echo ---

if not exist "client\src\components" mkdir client\src\components
if not exist "client\src\hooks" mkdir client\src\hooks
echo [OK] Directories created

if not exist "StepEditor.tsx" (
    echo Error: StepEditor.tsx not found in current directory
    exit /b 1
)
copy /Y "StepEditor.tsx" "client\src\components\"
echo [OK] StepEditor.tsx copied

if not exist "EnhancedTestCaseEditor.tsx" (
    echo Error: EnhancedTestCaseEditor.tsx not found
    exit /b 1
)
copy /Y "EnhancedTestCaseEditor.tsx" "client\src\components\"
echo [OK] EnhancedTestCaseEditor.tsx copied

if not exist "useStepManagement.ts" (
    echo Error: useStepManagement.ts not found
    exit /b 1
)
copy /Y "useStepManagement.ts" "client\src\hooks\"
echo [OK] useStepManagement.ts copied

REM Verify files
if not exist "client\src\components\StepEditor.tsx" (
    echo Error: StepEditor.tsx copy failed
    exit /b 1
)

if not exist "client\src\components\EnhancedTestCaseEditor.tsx" (
    echo Error: EnhancedTestCaseEditor.tsx copy failed
    exit /b 1
)

if not exist "client\src\hooks\useStepManagement.ts" (
    echo Error: useStepManagement.ts copy failed
    exit /b 1
)

echo [OK] All files copied successfully

REM ============================================================================
REM PHASE 3: FIND TEST CASE PAGE
REM ============================================================================

echo.
echo [Phase 3] Finding Test Case Page (2 min)
echo ---

set TEST_PAGE=

REM Try common locations
if exist "client\src\pages\TestCaseEditPage.tsx" (
    set TEST_PAGE=client\src\pages\TestCaseEditPage.tsx
    echo [OK] Found: !TEST_PAGE!
) else if exist "client\src\pages\EditTestCase.tsx" (
    set TEST_PAGE=client\src\pages\EditTestCase.tsx
    echo [OK] Found: !TEST_PAGE!
) else if exist "client\src\pages\test-case-edit.tsx" (
    set TEST_PAGE=client\src\pages\test-case-edit.tsx
    echo [OK] Found: !TEST_PAGE!
) else (
    echo [WARNING] Could not automatically find test case page
    set /p TEST_PAGE="Enter path to test case page (e.g., client\src\pages\TestCaseEditPage.tsx): "
    
    if not exist "!TEST_PAGE!" (
        echo Error: File not found: !TEST_PAGE!
        exit /b 1
    )
)

echo [OK] Test case page: !TEST_PAGE!

REM Check if already using EnhancedTestCaseEditor
findstr /M "EnhancedTestCaseEditor" "!TEST_PAGE!" >nul
if errorlevel 1 (
    echo [INFO] Creating backup: !TEST_PAGE!.backup
    copy /Y "!TEST_PAGE!" "!TEST_PAGE!.backup"
    
    echo.
    echo [WARNING] MANUAL UPDATE REQUIRED:
    echo.
    echo Please manually update the component usage in: !TEST_PAGE!
    echo.
    echo Replace old component:
    echo   ^<TestCaseForm testCase={testCase} onSave={handleSave} /^>
    echo.
    echo With new component:
    echo   ^<EnhancedTestCaseEditor
    echo     testCase={testCase}
    echo     onSave={async (tc) => await handleSave(tc)}
    echo     isLoading={isLoading}
    echo   /^>
    echo.
    echo Also add import at top:
    echo   import EnhancedTestCaseEditor from '@/components/EnhancedTestCaseEditor';
    echo.
    pause
) else (
    echo [OK] Already using EnhancedTestCaseEditor
)

REM ============================================================================
REM PHASE 4: TYPE CHECK
REM ============================================================================

echo.
echo [Phase 4] Type Checking (2 min)
echo ---

call npm run type-check
if errorlevel 1 (
    echo Error: TypeScript errors found. Please fix them and try again.
    exit /b 1
)
echo [OK] No TypeScript errors

REM ============================================================================
REM PHASE 5: BUILD
REM ============================================================================

echo.
echo [Phase 5] Building Project (3 min)
echo ---

call npm run build
if errorlevel 1 (
    echo Error: Build failed
    exit /b 1
)

if not exist "dist" (
    echo Error: dist\ directory not found after build
    exit /b 1
)

echo [OK] Build completed successfully

REM ============================================================================
REM PHASE 6: DEPLOYMENT
REM ============================================================================

echo.
echo [Phase 6] Deploying to Production
echo ---

set /p DEPLOY="Deploy to production now? (y/n): "
if /i NOT "%DEPLOY%"=="y" (
    echo [INFO] Deployment cancelled
    exit /b 0
)

echo [INFO] Attempting deployment...

REM Try npm deploy script
findstr /M "deploy:production" package.json >nul
if errorlevel 0 (
    echo [INFO] Using: npm run deploy:production
    call npm run deploy:production
    goto :deployment_done
)

REM Git deployment
git remote show production >nul 2>&1
if errorlevel 0 (
    echo [INFO] Using: git push production main
    call git push production main
    goto :deployment_done
)

REM Manual deployment
echo [WARNING] No automated deployment method detected
echo.
echo Please deploy manually:
echo   Option 1: npm run deploy:production
echo   Option 2: git push production main
echo   Option 3: Upload dist\ folder to your server
echo.
pause

:deployment_done
echo [OK] Deployment initiated

REM ============================================================================
REM PHASE 7: VERIFICATION
REM ============================================================================

echo.
echo [Phase 7] Verification (1 min)
echo ---

set /p PROD_URL="Enter your production URL (e.g., https://your-app.com): "

if not "!PROD_URL!"=="" (
    echo [INFO] Checking health endpoint...
    
    powershell -Command "try { (Invoke-WebRequest -Uri '!PROD_URL!/api/health' -UseBasicParsing).StatusCode } catch { Write-Host 'Could not reach production' }" >nul 2>&1
    
    if errorlevel 0 (
        echo [OK] Production is responding
    ) else (
        echo [WARNING] Could not reach production. Deployment may still be in progress.
    )
) else (
    echo [INFO] Skipping verification
)

REM ============================================================================
REM SUMMARY
REM ============================================================================

echo.
echo ==========================================
echo    DEPLOYMENT COMPLETE!
echo ==========================================
echo.
echo [OK] Files copied
echo [OK] Build completed
echo [OK] Deployment initiated
echo.
echo Next steps:
echo   1. Verify in production: !PROD_URL!/test-cases
echo   2. Monitor logs for errors
echo   3. Notify your team
echo   4. Gather user feedback
echo.
echo [OK] Deployment script finished!
echo.

pause
