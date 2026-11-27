# Axiom Siam - one-command dev environment setup
# Usage:  cd C:\Axiom-siam-website\platform ; .\scripts\dev-setup.ps1
#
# Checks Docker -> starts Postgres/Redis -> waits until the DB really accepts
# connections -> runs migrations -> seeds. Safe to re-run (idempotent).
#
# NOTE: ASCII only on purpose. Windows PowerShell 5.1 reads .ps1 as ANSI, so
# non-ASCII text here gets mangled and breaks the parser.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Die($msg)  { Write-Host "`nFAILED: $msg" -ForegroundColor Red; exit 1 }

# ---------- 1. Is Docker up? ----------
Step "Checking Docker daemon"
docker ps *>$null
if ($LASTEXITCODE -ne 0) {
    Die "Docker is not ready. Open Docker Desktop, wait for the whale icon to turn green, then re-run."
}
Ok "docker daemon responds"

# ---------- 2. Start Postgres + Redis ----------
Step "Starting Postgres + Redis"
docker compose up -d
if ($LASTEXITCODE -ne 0) { Die "docker compose up failed" }
Ok "containers are up"

# ---------- 3. Wait until Postgres actually accepts connections ----------
# A running container does NOT mean the DB is ready. Migrating too early fails.
Step "Waiting for Postgres to accept connections"
$ready = $false
foreach ($i in 1..30) {
    docker exec axiom-postgres pg_isready -U axiom *>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
    Write-Host "    ...waiting ($i/30)" -ForegroundColor DarkGray
}
if (-not $ready) { Die "Postgres did not respond within 60s. Check: docker logs axiom-postgres" }
Ok "Postgres ready on localhost:5432"

# ---------- 4. Migrate ----------
Step "Running Prisma migrations"
npm run migrate -w packages/db -- --name sync_schema
if ($LASTEXITCODE -ne 0) { Die "Migration failed - read the error above" }
Ok "schema is in sync with the database"

# ---------- 5. Seed ----------
Step "Seeding initial data"
npm run seed -w packages/db
if ($LASTEXITCODE -ne 0) {
    Write-Host "    WARN: seed failed (data may already exist) - safe to ignore" -ForegroundColor Yellow
} else {
    Ok "seed complete"
}

Write-Host "`n=======================================" -ForegroundColor Green
Write-Host " READY" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host " Next - one command starts both web + api:"
Write-Host "   npm run dev"
Write-Host ""
Write-Host "   web -> http://localhost:3000"
Write-Host "   api -> http://localhost:4000/api/v1"
Write-Host ""
