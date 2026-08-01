[CmdletBinding()]
param(
    [string]$GeneratedPath = 'packages/api-client'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    & pnpm --filter api openapi:generate
    if ($LASTEXITCODE -ne 0) {
        throw "OpenAPI generation failed with exit code $LASTEXITCODE."
    }

    & git diff --exit-code HEAD -- $GeneratedPath
    if ($LASTEXITCODE -ne 0) {
        throw "OpenAPI drift detected under '$GeneratedPath'. Regenerate and commit the client."
    }

    $untracked = & git ls-files --others --exclude-standard -- $GeneratedPath
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect untracked OpenAPI output under '$GeneratedPath'."
    }
    if ($untracked) {
        throw "OpenAPI generation produced untracked files under '$GeneratedPath':`n$($untracked -join "`n")"
    }
    Write-Output "PASS: generated OpenAPI client matches the committed '$GeneratedPath' tree."
}
finally {
    Pop-Location
}
