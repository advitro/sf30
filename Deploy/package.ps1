# Shift Grabber V9 — Customer Packaging Script
# Usage: .\Deploy\package.ps1
#        .\Deploy\package.ps1 -Obfuscated   (sources from dist/ instead of Deploy/extension/)

param(
    [switch]$Obfuscated
)

$ErrorActionPreference = "Stop"

# Resolve paths relative to this script
$DeployDir = Split-Path -Parent $PSScriptRoot
$SourceDir = if ($Obfuscated) { Join-Path $DeployDir "dist" } else { Join-Path $DeployDir "Deploy\extension" }
$DocsDir   = Join-Path $DeployDir "Deploy\docs"
$OutputZip = Join-Path $DeployDir "Deploy\shift-grabber-v9.zip"
$TempDir   = Join-Path $env:TEMP "sg-deploy-$([Guid]::NewGuid().ToString().Substring(0,8))"

# Validate source exists
if (-not (Test-Path $SourceDir)) {
    Write-Error "Source directory not found: $SourceDir"
    if ($Obfuscated) {
        Write-Host "Hint: Run 'node build.js' first to create the dist/ folder." -ForegroundColor Yellow
    } else {
        Write-Host "Hint: Copy extension files into Deploy/extension/ first." -ForegroundColor Yellow
    }
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Shift Grabber V9 — Package Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Source:  $SourceDir"
Write-Host "Docs:    $DocsDir"
Write-Host "Output:  $OutputZip"
Write-Host ""

# Clean up old ZIP
if (Test-Path $OutputZip) {
    Remove-Item $OutputZip -Force
    Write-Host "Removed old package." -ForegroundColor DarkGray
}

# Create temp staging
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
Write-Host "Created staging directory." -ForegroundColor DarkGray

# Copy extension files
$ExtDest = Join-Path $TempDir "extension"
Copy-Item -Recurse -Force $SourceDir $ExtDest
$extCount = (Get-ChildItem $ExtDest -Recurse -File).Count
Write-Host "Copied $extCount extension files." -ForegroundColor Green

# Copy docs
if (Test-Path $DocsDir) {
    $DocsDest = Join-Path $TempDir "docs"
    Copy-Item -Recurse -Force $DocsDir $DocsDest
    $docCount = (Get-ChildItem $DocsDest -Recurse -File).Count
    Write-Host "Copied $docCount documentation files." -ForegroundColor Green
} else {
    Write-Warning "Docs directory not found at $DocsDir"
}

# Create ZIP
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($TempDir, $OutputZip, "Optimal", $false)

# Clean up temp
Remove-Item -Recurse -Force $TempDir

$sizeKB = [math]::Round((Get-Item $OutputZip).Length / 1KB, 1)
Write-Host ""
Write-Host "✅ Package created successfully!" -ForegroundColor Green
Write-Host "   File: $OutputZip" -ForegroundColor White
Write-Host "   Size: $sizeKB KB" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Test by loading the extension/ folder in Chrome Dev Mode"
Write-Host "  2. Distribute the ZIP to customers"
Write-Host ""
