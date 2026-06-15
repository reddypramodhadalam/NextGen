#!/bin/bash

################################################################################
#
# AUTOMATED DEPLOYMENT SCRIPT - Enhanced Step Editor
# 
# This script automates the entire deployment process:
# - Copies component files
# - Updates imports
# - Builds the project
# - Deploys to production
# - Verifies deployment
#
# Usage: bash deploy.sh
#
################################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

################################################################################
# PHASE 1: VERIFICATION
################################################################################

echo ""
echo "=========================================="
echo "   DEPLOYMENT AUTOMATION SCRIPT"
echo "   Enhanced Step Editor for AITAS"
echo "=========================================="
echo ""

log_info "PHASE 1: Verification (2 min)"
echo "---"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    log_error "package.json not found. Are you in the project root?"
    exit 1
fi
log_success "Project root detected"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    log_warning "node_modules not found. Running npm install..."
    npm install
fi
log_success "Dependencies installed"

# Check git status
if [ -n "$(git status --porcelain)" ]; then
    log_warning "Uncommitted changes detected"
    echo "Changes:"
    git status --short
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Deployment cancelled"
        exit 1
    fi
fi
log_success "Git status OK"

################################################################################
# PHASE 2: COPY FILES
################################################################################

echo ""
log_info "PHASE 2: Copying Component Files (2 min)"
echo "---"

# Create directories
mkdir -p client/src/components
mkdir -p client/src/hooks
log_success "Directories created"

# Copy files
if [ -f "StepEditor.tsx" ]; then
    cp StepEditor.tsx client/src/components/
    log_success "StepEditor.tsx copied"
else
    log_error "StepEditor.tsx not found in current directory"
    exit 1
fi

if [ -f "EnhancedTestCaseEditor.tsx" ]; then
    cp EnhancedTestCaseEditor.tsx client/src/components/
    log_success "EnhancedTestCaseEditor.tsx copied"
else
    log_error "EnhancedTestCaseEditor.tsx not found in current directory"
    exit 1
fi

if [ -f "useStepManagement.ts" ]; then
    cp useStepManagement.ts client/src/hooks/
    log_success "useStepManagement.ts copied"
else
    log_error "useStepManagement.ts not found in current directory"
    exit 1
fi

# Verify files exist
if [ ! -f "client/src/components/StepEditor.tsx" ]; then
    log_error "StepEditor.tsx copy failed"
    exit 1
fi

if [ ! -f "client/src/components/EnhancedTestCaseEditor.tsx" ]; then
    log_error "EnhancedTestCaseEditor.tsx copy failed"
    exit 1
fi

if [ ! -f "client/src/hooks/useStepManagement.ts" ]; then
    log_error "useStepManagement.ts copy failed"
    exit 1
fi

log_success "All files copied successfully"

################################################################################
# PHASE 3: FIND AND UPDATE TEST CASE PAGE
################################################################################

echo ""
log_info "PHASE 3: Finding and Updating Test Case Page (3 min)"
echo "---"

# Find test case page
TEST_PAGE=$(find client/src -name "*TestCase*" -type f -name "*.tsx" | head -1)

if [ -z "$TEST_PAGE" ]; then
    log_warning "Could not automatically find test case page"
    log_info "Searching for common patterns..."
    
    # Try common patterns
    if [ -f "client/src/pages/TestCaseEditPage.tsx" ]; then
        TEST_PAGE="client/src/pages/TestCaseEditPage.tsx"
        log_success "Found: $TEST_PAGE"
    elif [ -f "client/src/pages/EditTestCase.tsx" ]; then
        TEST_PAGE="client/src/pages/EditTestCase.tsx"
        log_success "Found: $TEST_PAGE"
    elif [ -f "client/src/pages/test-case-edit.tsx" ]; then
        TEST_PAGE="client/src/pages/test-case-edit.tsx"
        log_success "Found: $TEST_PAGE"
    else
        log_error "Cannot find test case page. Please specify the path:"
        read -p "Enter path to test case page (e.g., client/src/pages/TestCaseEditPage.tsx): " TEST_PAGE
        
        if [ ! -f "$TEST_PAGE" ]; then
            log_error "File not found: $TEST_PAGE"
            exit 1
        fi
    fi
else
    log_success "Found test case page: $TEST_PAGE"
fi

# Check if already using EnhancedTestCaseEditor
if grep -q "EnhancedTestCaseEditor" "$TEST_PAGE"; then
    log_success "Already using EnhancedTestCaseEditor"
else
    log_info "Updating imports in $TEST_PAGE..."
    
    # Backup the file
    cp "$TEST_PAGE" "${TEST_PAGE}.backup"
    log_success "Backup created: ${TEST_PAGE}.backup"
    
    # Add import if not present
    if ! grep -q "import.*EnhancedTestCaseEditor" "$TEST_PAGE"; then
        # Find the import section and add our import
        sed -i.bak "1,/^import.*from/s/^import.*from/import EnhancedTestCaseEditor from '@\/components\/EnhancedTestCaseEditor';\nimport/" "$TEST_PAGE"
        log_success "Import added to $TEST_PAGE"
    fi
    
    log_warning "⚠️  MANUAL UPDATE REQUIRED:"
    echo "  Please manually update the component usage in: $TEST_PAGE"
    echo "  "
    echo "  Replace old component:"
    echo "    <TestCaseForm testCase={testCase} onSave={handleSave} />"
    echo "  "
    echo "  With new component:"
    echo "    <EnhancedTestCaseEditor"
    echo "      testCase={testCase}"
    echo "      onSave={async (tc) => await handleSave(tc)}"
    echo "      isLoading={isLoading}"
    echo "    />"
    echo "  "
    read -p "Press Enter when done, or Ctrl+C to cancel..."
fi

log_success "Test case page updated"

################################################################################
# PHASE 4: TYPE CHECK
################################################################################

echo ""
log_info "PHASE 4: Type Checking (2 min)"
echo "---"

if npm run type-check 2>&1 | grep -q "error"; then
    log_error "TypeScript errors found. Please fix them and try again."
    npm run type-check
    exit 1
else
    log_success "No TypeScript errors"
fi

################################################################################
# PHASE 5: BUILD
################################################################################

echo ""
log_info "PHASE 5: Building Project (3 min)"
echo "---"

npm run build

if [ $? -ne 0 ]; then
    log_error "Build failed"
    exit 1
fi

log_success "Build completed successfully"

# Check build output
if [ ! -d "dist" ]; then
    log_error "dist/ directory not found after build"
    exit 1
fi

BUILD_SIZE=$(du -sh dist | cut -f1)
log_success "Build size: $BUILD_SIZE"

################################################################################
# PHASE 6: DEPLOYMENT
################################################################################

echo ""
log_info "PHASE 6: Deploying to Production"
echo "---"

read -p "Deploy to production now? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Deployment cancelled"
    exit 0
fi

# Try different deployment methods
if [ -f "package.json" ] && grep -q "deploy:production" package.json; then
    log_info "Using: npm run deploy:production"
    npm run deploy:production
    DEPLOY_SUCCESS=$?
elif [ -f ".git/config" ] && git remote | grep -q production; then
    log_info "Using: git push production main"
    git push production main
    DEPLOY_SUCCESS=$?
elif command -v aws &> /dev/null; then
    log_info "Using: AWS S3 deployment"
    read -p "Enter S3 bucket name (e.g., s3://production-bucket/): " S3_BUCKET
    aws s3 sync dist/ "$S3_BUCKET" --delete
    DEPLOY_SUCCESS=$?
else
    log_warning "No automated deployment method detected"
    log_info "Please deploy manually:"
    echo "  Option 1: npm run deploy:production"
    echo "  Option 2: git push production main"
    echo "  Option 3: Upload dist/ folder to your server"
    read -p "Press Enter when deployed..."
    DEPLOY_SUCCESS=0
fi

if [ $DEPLOY_SUCCESS -eq 0 ]; then
    log_success "Deployment initiated"
else
    log_error "Deployment may have failed. Check the output above."
fi

################################################################################
# PHASE 7: VERIFICATION
################################################################################

echo ""
log_info "PHASE 7: Verification (1 min)"
echo "---"

read -p "Enter your production URL (e.g., https://your-app.com): " PROD_URL

if [ -z "$PROD_URL" ]; then
    log_warning "No URL provided, skipping verification"
else
    log_info "Checking health endpoint..."
    HEALTH=$(curl -s "$PROD_URL/api/health" 2>/dev/null || echo "")
    
    if [ -n "$HEALTH" ]; then
        log_success "Production is responding"
        log_success "Health check: $HEALTH"
    else
        log_warning "Could not reach production. Deployment may still be in progress."
    fi
fi

################################################################################
# SUMMARY
################################################################################

echo ""
echo "=========================================="
echo "   DEPLOYMENT COMPLETE! 🎉"
echo "=========================================="
echo ""
log_success "Files copied"
log_success "Build completed"
log_success "Deployment initiated"
echo ""
log_info "Next steps:"
echo "  1. Verify in production: $PROD_URL/test-cases"
echo "  2. Monitor logs for errors"
echo "  3. Notify your team"
echo "  4. Gather user feedback"
echo ""
log_success "Deployment script finished!"
echo ""
