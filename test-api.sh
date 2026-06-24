#!/bin/bash

echo "=========================================="
echo "🧪 Testing Requirement-Based Test Generation API"
echo "=========================================="
echo ""

echo "📋 TEST 1: Testing GET /api/v2/generate-from-requirements/example"
echo "=========================================="
echo "Command: curl -X GET http://localhost:3000/api/v2/generate-from-requirements/example"
echo ""

curl -X GET http://localhost:3000/api/v2/generate-from-requirements/example 2>/dev/null | python3 -m json.tool 2>/dev/null || curl -X GET http://localhost:3000/api/v2/generate-from-requirements/example

echo ""
echo ""
echo "📋 TEST 2: Testing POST /api/v2/generate-from-requirements with simple requirement"
echo "=========================================="
echo "Command: curl -X POST with test data"
echo ""

curl -X POST http://localhost:3000/api/v2/generate-from-requirements \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User Login Test",
    "requirements": "The system shall allow users to log in with username and password. The system shall validate credentials and redirect to dashboard on success. The system shall show error message for invalid credentials. The system shall display password strength indicator. The system shall support remember me functionality."
  }' 2>/dev/null | python3 -m json.tool 2>/dev/null || curl -X POST http://localhost:3000/api/v2/generate-from-requirements \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User Login Test",
    "requirements": "The system shall allow users to log in with username and password. The system shall validate credentials and redirect to dashboard on success. The system shall show error message for invalid credentials. The system shall display password strength indicator. The system shall support remember me functionality."
  }'

echo ""
echo ""
echo "✅ API Test Complete!"
echo "=========================================="
