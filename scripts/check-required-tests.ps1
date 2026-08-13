[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$requiredTests = @(
    'apps/api/test/auth/register.int.test.ts',
    'apps/api/test/auth/verify-email.int.test.ts',
    'apps/api/test/auth/login.int.test.ts',
    'apps/api/test/auth/refresh-rotation.int.test.ts',
    'apps/api/test/auth/password-reset.int.test.ts',
    'apps/api/test/auth/logout.int.test.ts',
    'apps/api/test/users/me.int.test.ts',
    'apps/api/test/security/asvs-v5-l1.test.ts',
    'apps/client/src/features/auth/__tests__/register-form-test.tsx',
    'apps/client/src/features/auth/__tests__/verification-flow-test.tsx',
    'apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx',
    'apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx',
    'apps/client/src/platform/session/__tests__/session-transport-test.ts',
    'apps/client/src/features/profile/__tests__/profile-form-test.tsx',
    'apps/client/src/ui/__tests__/token-static-test.ts',
    'apps/client/src/ui/__tests__/contrast-test.ts',
    'apps/client/src/ui/__tests__/primitive-states-test.tsx',
    'e2e/auth/register.spec.ts',
    'e2e/auth/verify-email.spec.ts',
    'e2e/auth/login-session.spec.ts',
    'e2e/auth/password-reset.spec.ts',
    'e2e/auth/account-actions.spec.ts',
    'e2e/auth/accessibility.spec.ts',
    'apps/api/src/modules/recurrence/recurrence-date.test.ts',
    'apps/api/test/recurrence/recurrence-rules.int.test.ts',
    'apps/api/test/recurrence/materializer.int.test.ts',
    'apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx',
    'apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx',
    'apps/client/src/features/tasks/__tests__/task-status-test.tsx',
    'e2e/events/recurrence.spec.ts',
    # Addendum D-11 … D-20 (plans 07-09 … 07-15).
    'apps/api/test/recurrence/lookahead.int.test.ts',
    'apps/api/test/recurrence/recurring-filter.int.test.ts',
    'apps/api/test/recurrence/recurrence-rules-api.int.test.ts',
    'apps/client/src/features/recurrence/__tests__/recurring-filter-test.tsx',
    'apps/client/src/features/recurrence/__tests__/recurrence-rule-row-test.tsx',
    'e2e/events/recurrence-rules.spec.ts'
)
$forbiddenPattern = '(?im)\.(?:skip|todo)\b|\bIMPLEMENTATION_MISSING\b'

function Test-RequiredFiles([string]$Root) {
    $errors = [System.Collections.Generic.List[string]]::new()
    foreach ($relativePath in $requiredTests) {
        $path = Join-Path $Root $relativePath
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            $errors.Add("Missing required test: $relativePath")
            continue
        }
        $content = Get-Content -Raw -LiteralPath $path
        if ($content -match $forbiddenPattern) {
            $errors.Add("Forbidden skipped/todo/missing marker in: $relativePath")
        }
    }
    return $errors
}

if ($SelfTest) {
    $fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("muchakucha-required-tests-" + [guid]::NewGuid())
    try {
        foreach ($relativePath in $requiredTests) {
            $path = Join-Path $fixtureRoot $relativePath
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
            "test('contract exists', () => expect(true).toBe(true));" | Set-Content -LiteralPath $path -Encoding UTF8
        }
        if ((Test-RequiredFiles $fixtureRoot).Count -ne 0) {
            throw 'Self-test failed: complete clean inventory was rejected.'
        }

        Remove-Item -LiteralPath (Join-Path $fixtureRoot $requiredTests[0])
        if ((Test-RequiredFiles $fixtureRoot).Count -eq 0) {
            throw 'Self-test failed: absent required path was accepted.'
        }

        $forbiddenPath = Join-Path $fixtureRoot $requiredTests[1]
        "describe.skip('forbidden', () => {});" | Set-Content -LiteralPath $forbiddenPath -Encoding UTF8
        if ((Test-RequiredFiles $fixtureRoot | Where-Object { $_ -like '*Forbidden*' }).Count -eq 0) {
            throw 'Self-test failed: skipped contract was accepted.'
        }
        Write-Output "PASS: required-test audit checks all $($requiredTests.Count) exact paths and rejects forbidden markers."
    }
    finally {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit 0
}

$auditErrors = Test-RequiredFiles $repoRoot
if ($auditErrors.Count -gt 0) {
    $auditErrors | ForEach-Object { Write-Error $_ -ErrorAction Continue }
    throw "Required-test audit failed with $($auditErrors.Count) error(s)."
}
Write-Output "PASS: all $($requiredTests.Count) required test contracts exist without forbidden markers."
