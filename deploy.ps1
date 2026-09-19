#!/usr/bin/env pwsh
# =============================================================================
#  GroundTruth — One-click AWS deploy script
#  Usage:  .\deploy.ps1
#
#  What this does:
#    1. Validates AWS credentials
#    2. sam build  (packages all Lambda functions)
#    3. sam deploy (DynamoDB + Lambda + API Gateway + S3 + CloudWatch)
#    4. Retrieves the API Gateway URL from CloudFormation outputs
#    5. Creates an API Gateway API key and links it to the usage plan
#    6. Connects your GitHub repo to AWS Amplify for frontend hosting
#    7. Sets Amplify environment variables (VITE_API_BASE_URL etc.)
#    8. Prints a summary of every live URL
# =============================================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Configuration ─────────────────────────────────────────────────────────────
$STACK_NAME    = "groundtruth"
$REGION        = "ap-south-1"          # change to your preferred AWS region
$GITHUB_REPO   = "https://github.com/AuditorDevansh/Offline-first-local-issue-reporter---Ground-Truth-"
$GITHUB_BRANCH = "main"
$APP_NAME      = "groundtruth"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "   ✗  $msg" -ForegroundColor Red; exit 1 }

function Invoke-AWS {
    param([string[]]$Args)
    $out = python -m awscli @Args --region $REGION --output json 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Fail "AWS CLI error: $out" }
    return $out | ConvertFrom-Json
}

function Invoke-AWSRaw {
    param([string[]]$Args)
    python -m awscli @Args --region $REGION 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Fail "AWS CLI error" }
}

# ── Step 0: Check prerequisites ───────────────────────────────────────────────
Write-Step "Checking prerequisites"

# AWS credentials
$identity = python -m awscli sts get-caller-identity --region $REGION --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail @"
AWS credentials are not configured or have expired.

Fix:
  1. Go to https://console.aws.amazon.com/iam
  2. Users → your user → Security credentials → Create access key
  3. Run:
       python -m awscli configure
     Enter your Access Key ID, Secret Access Key, region ($REGION), output (json)
  4. Re-run this script.
"@
}
$id = $identity | ConvertFrom-Json
Write-OK "Authenticated as $($id.Arn)"

# SAM CLI
$samVer = sam --version 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "SAM CLI not found. Install from https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html" }
Write-OK "SAM CLI: $samVer"

# ── Step 1: Build Lambda packages ─────────────────────────────────────────────
Write-Step "Building Lambda packages (sam build)"
Push-Location "$PSScriptRoot\backend"
sam build
if ($LASTEXITCODE -ne 0) { Write-Fail "sam build failed" }
Write-OK "Build complete"

# ── Step 2: Deploy backend (DynamoDB + Lambda + API Gateway + S3) ─────────────
Write-Step "Deploying backend stack '$STACK_NAME' to $REGION"
sam deploy `
    --stack-name    $STACK_NAME `
    --region        $REGION `
    --capabilities  CAPABILITY_IAM CAPABILITY_NAMED_IAM `
    --resolve-s3 `
    --no-confirm-changeset `
    --no-fail-on-empty-changeset `
    --parameter-overrides "AllowedOrigin=* AppVersion=1.0.0"

if ($LASTEXITCODE -ne 0) { Write-Fail "sam deploy failed" }
Write-OK "Backend stack deployed"

# ── Step 3: Get outputs ───────────────────────────────────────────────────────
Write-Step "Reading CloudFormation outputs"
$outputs = python -m awscli cloudformation describe-stacks `
    --stack-name $STACK_NAME --region $REGION --output json 2>&1 | ConvertFrom-Json

$outputMap = @{}
foreach ($o in $outputs.Stacks[0].Outputs) {
    $outputMap[$o.OutputKey] = $o.OutputValue
}

$API_URL = $outputMap["ApiUrl"]
Write-OK "API URL: $API_URL"

# ── Step 4: Create API key for admin panel ────────────────────────────────────
Write-Step "Creating API key for admin panel"

# Get the usage plan ID from the stack
$apiId = ($API_URL -split "\.")[0] -replace "https://", ""

$existingKeys = python -m awscli apigateway get-api-keys `
    --name-query "groundtruth-admin-key" --region $REGION --output json 2>&1 | ConvertFrom-Json

$API_KEY_VALUE = ""
if ($existingKeys.items.Count -gt 0) {
    $keyId = $existingKeys.items[0].id
    Write-Warn "API key already exists (id: $keyId) — reusing"
    $keyDetail = python -m awscli apigateway get-api-key `
        --api-key $keyId --include-value --region $REGION --output json 2>&1 | ConvertFrom-Json
    $API_KEY_VALUE = $keyDetail.value
} else {
    $newKey = python -m awscli apigateway create-api-key `
        --name "groundtruth-admin-key" `
        --description "GroundTruth admin panel key" `
        --enabled `
        --region $REGION --output json 2>&1 | ConvertFrom-Json
    $keyId = $newKey.id
    $API_KEY_VALUE = $newKey.value
    Write-OK "API key created (id: $keyId)"

    # Associate with usage plan
    $usagePlans = python -m awscli apigateway get-usage-plans `
        --region $REGION --output json 2>&1 | ConvertFrom-Json
    $plan = $usagePlans.items | Where-Object { $_.name -like "*GroundTruth*" -or $_.name -like "*groundtruth*" } | Select-Object -First 1
    if ($plan) {
        python -m awscli apigateway create-usage-plan-key `
            --usage-plan-id $plan.id `
            --key-id        $keyId `
            --key-type      "API_KEY" `
            --region        $REGION | Out-Null
        Write-OK "API key linked to usage plan '$($plan.name)'"
    } else {
        Write-Warn "Could not find usage plan automatically — link the key manually in API Gateway console"
    }
}

Write-OK "Admin API key: $API_KEY_VALUE"

# ── Step 5: Deploy frontend to Amplify ────────────────────────────────────────
Write-Step "Setting up AWS Amplify for frontend hosting"

$existingApps = python -m awscli amplify list-apps --region $REGION --output json 2>&1 | ConvertFrom-Json
$existingApp  = $existingApps.apps | Where-Object { $_.name -eq $APP_NAME } | Select-Object -First 1

if ($existingApp) {
    $APP_ID = $existingApp.appId
    Write-Warn "Amplify app '$APP_NAME' already exists (id: $APP_ID) — updating env vars"
} else {
    Write-Step "Creating Amplify app from GitHub repo"
    Write-Host ""
    Write-Host "  AWS Amplify needs a GitHub personal access token to connect" -ForegroundColor Yellow
    Write-Host "  to your repository. Create one at:" -ForegroundColor Yellow
    Write-Host "  https://github.com/settings/tokens/new" -ForegroundColor Cyan
    Write-Host "  Required scopes: repo, admin:repo_hook" -ForegroundColor Yellow
    Write-Host ""
    $GITHUB_TOKEN = Read-Host "  Paste your GitHub token"

    $newApp = python -m awscli amplify create-app `
        --name          $APP_NAME `
        --repository    $GITHUB_REPO `
        --access-token  $GITHUB_TOKEN `
        --platform      WEB `
        --region        $REGION `
        --output json 2>&1 | ConvertFrom-Json
    $APP_ID = $newApp.app.appId
    Write-OK "Amplify app created (id: $APP_ID)"

    # Create the main branch
    python -m awscli amplify create-branch `
        --app-id     $APP_ID `
        --branch-name $GITHUB_BRANCH `
        --region     $REGION | Out-Null
    Write-OK "Branch '$GITHUB_BRANCH' connected"
}

# Set/update environment variables on the branch
$envVars = "VITE_API_BASE_URL=$API_URL,VITE_ADMIN_API_KEY=,VITE_PHOTOS_CDN="
python -m awscli amplify update-branch `
    --app-id      $APP_ID `
    --branch-name $GITHUB_BRANCH `
    --environment-variables $envVars `
    --region      $REGION | Out-Null
Write-OK "Amplify environment variables set"

# ── Step 6: Trigger initial deploy ────────────────────────────────────────────
Write-Step "Triggering Amplify build"
$job = python -m awscli amplify start-job `
    --app-id     $APP_ID `
    --branch-name $GITHUB_BRANCH `
    --job-type   RELEASE `
    --region     $REGION --output json 2>&1 | ConvertFrom-Json
$JOB_ID = $job.jobSummary.jobId
Write-OK "Build started (job id: $JOB_ID)"

# ── Step 7: Update CORS now that we have the Amplify URL ──────────────────────
$AMPLIFY_URL = "https://$GITHUB_BRANCH.$APP_ID.amplifyapp.com"
Write-Step "Updating CORS AllowedOrigin to $AMPLIFY_URL"
sam deploy `
    --stack-name    $STACK_NAME `
    --region        $REGION `
    --capabilities  CAPABILITY_IAM CAPABILITY_NAMED_IAM `
    --resolve-s3 `
    --no-confirm-changeset `
    --no-fail-on-empty-changeset `
    --parameter-overrides "AllowedOrigin=$AMPLIFY_URL AppVersion=1.0.0"
Write-OK "CORS updated"

Pop-Location

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  GroundTruth deployed successfully!" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend (Amplify)  :  $AMPLIFY_URL" -ForegroundColor Cyan
Write-Host "  Admin panel         :  $AMPLIFY_URL/#app/admin" -ForegroundColor Cyan
Write-Host "  API base URL        :  $API_URL" -ForegroundColor Cyan
Write-Host "  Health check        :  $API_URL/healthz" -ForegroundColor Cyan
Write-Host "  Admin API key       :  $API_KEY_VALUE" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Wait 2-3 min for Amplify build to finish" -ForegroundColor White
Write-Host "  2. Open $AMPLIFY_URL to see the live app" -ForegroundColor White
Write-Host "  3. Open $AMPLIFY_URL/#app/admin and enter the API key above" -ForegroundColor White
Write-Host "  4. Set VITE_ADMIN_API_KEY in Amplify console if you want" -ForegroundColor White
Write-Host "     to skip the login screen" -ForegroundColor White
Write-Host ""
Write-Host "  To redeploy after code changes:" -ForegroundColor White
Write-Host "  git push  (Amplify auto-deploys from main branch)" -ForegroundColor White
Write-Host "  sam deploy (from backend/ folder for Lambda changes)" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
