[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(ParameterSetName = 'Run')]
    [ValidateSet('api', 'client', 'e2e')]
    [string]$Suite = 'api',

    [Parameter(Mandatory = $true, ParameterSetName = 'Run')]
    [string]$TestPath,

    [Parameter(Mandatory = $true, ParameterSetName = 'Run')]
    [Alias('Marker')]
    [string]$MissingBehaviorMarker,

    [Parameter(Mandatory = $true, ParameterSetName = 'SelfTest')]
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot 'apps/api'
$infrastructureFailurePattern = '(?im)(failed to (load|resolve)|cannot find (module|package)|no test files found|no projects matched|config(?:uration)? error|syntaxerror|transform failed|unhandled error)'

function Invoke-Vitest([string[]]$Arguments) {
    $pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
    $quotedArguments = @('--filter', 'api', 'exec', 'vitest') + $Arguments | ForEach-Object {
        '"' + $_.Replace('"', '\"') + '"'
    }
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $pnpm
    $startInfo.Arguments = $quotedArguments -join ' '
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
    $standardErrorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $standardOutput = $standardOutputTask.Result
    $standardError = $standardErrorTask.Result
    return @{ ExitCode = $process.ExitCode; Output = "$standardOutput`n$standardError" }
}

function Invoke-Jest([string[]]$Arguments) {
    $pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
    $quotedArguments = @('--filter', 'client', 'exec', 'jest', '--runInBand') + $Arguments | ForEach-Object {
        '"' + $_.Replace('"', '\"') + '"'
    }
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $pnpm
    $startInfo.Arguments = $quotedArguments -join ' '
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
    $standardErrorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $standardOutput = $standardOutputTask.Result
    $standardError = $standardErrorTask.Result
    return @{ ExitCode = $process.ExitCode; Output = "$standardOutput`n$standardError" }
}

function Invoke-Playwright([string[]]$Arguments) {
    $pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
    $quotedArguments = @('exec', 'playwright', 'test') + $Arguments | ForEach-Object {
        '"' + $_.Replace('"', '\"') + '"'
    }
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $pnpm
    $startInfo.Arguments = $quotedArguments -join ' '
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
    $standardErrorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    return @{ ExitCode = $process.ExitCode; Output = "$($standardOutputTask.Result)`n$($standardErrorTask.Result)" }
}

function Assert-RedResult([string]$RequestedPath, [string]$Marker) {
    $relativePath = $RequestedPath -replace '\\', '/'
    if ($relativePath.StartsWith("apps/$Suite/")) {
        $relativePath = $relativePath.Substring("apps/$Suite/".Length)
    }

    if ($Suite -eq 'client') {
        $discovery = Invoke-Jest @('--listTests', $relativePath)
    }
    elseif ($Suite -eq 'e2e') {
        $discovery = Invoke-Playwright @($relativePath, '--list')
    }
    else {
        $discovery = Invoke-Vitest @('list', $relativePath)
    }
    if ($discovery.ExitCode -ne 0 -or $discovery.Output -match $infrastructureFailurePattern) {
        throw "RED discovery failed for '$RequestedPath'.`n$($discovery.Output)"
    }
    if ([string]::IsNullOrWhiteSpace($discovery.Output) -or $discovery.Output -notmatch [regex]::Escape((Split-Path $relativePath -Leaf))) {
        throw "RED discovery did not list '$RequestedPath'.`n$($discovery.Output)"
    }

    if ($Suite -eq 'client') {
        $execution = Invoke-Jest @($relativePath, '--verbose')
    }
    elseif ($Suite -eq 'e2e') {
        $execution = Invoke-Playwright @($relativePath, '--reporter=list')
    }
    else {
        $execution = Invoke-Vitest @('run', $relativePath, '--reporter=verbose')
    }
    if ($execution.ExitCode -eq 0) {
        throw "RED test unexpectedly passed: '$RequestedPath'."
    }
    if ($execution.Output -match $infrastructureFailurePattern) {
        throw "RED execution failed in infrastructure rather than behavior for '$RequestedPath'.`n$($execution.Output)"
    }
    if ($execution.Output -notmatch [regex]::Escape($Marker)) {
        throw "RED execution did not contain expected missing-behavior marker '$Marker'.`n$($execution.Output)"
    }
}

if ($SelfTest) {
    $fixture = Join-Path $apiRoot 'test/__assert-red-selftest__.unit.test.ts'
    $brokenImportFixture = Join-Path $apiRoot 'test/__assert-red-import-selftest__.unit.test.ts'
    try {
        @"
import { expect, test } from 'vitest';
test('assert-red self-test fixture', () => {
  expect.fail('EXPECTED_MISSING_BEHAVIOR:self-test');
});
"@ | Set-Content -LiteralPath $fixture -Encoding UTF8

        @"
import './__assert-red-module-does-not-exist__.js';
import { test } from 'vitest';
test('broken import must not count as RED', () => {
  throw new Error('EXPECTED_MISSING_BEHAVIOR:self-test');
});
"@ | Set-Content -LiteralPath $brokenImportFixture -Encoding UTF8

        Assert-RedResult -RequestedPath 'test/__assert-red-selftest__.unit.test.ts' -Marker 'EXPECTED_MISSING_BEHAVIOR:self-test'

        $missingWasRejected = $false
        try {
            Assert-RedResult -RequestedPath 'test/__assert-red-missing__.unit.test.ts' -Marker 'EXPECTED_MISSING_BEHAVIOR:self-test'
        }
        catch {
            $missingWasRejected = $true
        }
        if (-not $missingWasRejected) {
            throw 'Self-test failed: a missing test was accepted as RED evidence.'
        }

        $brokenImportWasRejected = $false
        try {
            Assert-RedResult -RequestedPath 'test/__assert-red-import-selftest__.unit.test.ts' -Marker 'EXPECTED_MISSING_BEHAVIOR:self-test'
        }
        catch {
            $brokenImportWasRejected = $true
        }
        if (-not $brokenImportWasRejected) {
            throw 'Self-test failed: a broken import was accepted as RED evidence.'
        }
        Write-Output 'PASS: RED gate accepts only a discovered test failing with its expected behavior marker.'
    }
    finally {
        Remove-Item -LiteralPath $fixture -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $brokenImportFixture -Force -ErrorAction SilentlyContinue
    }
    exit 0
}

Assert-RedResult -RequestedPath $TestPath -Marker $MissingBehaviorMarker
Write-Output "PASS: '$TestPath' is valid RED evidence for marker '$MissingBehaviorMarker'."
