# Common-password denylist provenance

This file records the immutable source and deterministic derivation of the runtime password-policy asset in `common-passwords-top-3000.txt`.

- **Upstream project:** SecLists
- **Upstream release:** `2026.1`
- **Upstream commit:** `190c6f7bd58c847ceadfe57d9853592737f059e8`
- **Upstream URL:** `https://raw.githubusercontent.com/danielmiessler/SecLists/190c6f7bd58c847ceadfe57d9853592737f059e8/Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt`
- **Upstream SHA-256:** `424a3e03a17df0a2bc2b3ca749d81b04e79d59cb7aeec8876a5a3f308d0caf51`
- **Upstream bytes:** `8557632`
- **License:** MIT
- **License URL:** `https://github.com/danielmiessler/SecLists/blob/190c6f7bd58c847ceadfe57d9853592737f059e8/LICENSE`
- **Retrieved:** 2026-08-01
- **Derived SHA-256:** `e556819f94c009a90b38eab1051dae4c222ff7148330b4e2b395932465b214ea`
- **Derived bytes:** `41645`
- **Derived entries:** `3000`

## Deterministic derivation

1. Verify the downloaded upstream bytes against the recorded upstream SHA-256 before processing.
2. Decode the source as UTF-8, split on LF or CRLF, and preserve source order and entry text without case folding, trimming, normalization, or other mutation.
3. Retain entries whose length is 12 through 128 Unicode code points, matching the project's runtime password-length policy.
4. Remove exact duplicates by keeping the first occurrence, then select the first 3000 unique entries.
5. Join those entries with LF and include one final LF. Verify the result against the recorded derived SHA-256.

The committed file under `src/modules/auth/data` is the single runtime asset and the file read by the security audit. Tests must not maintain a second copy that can drift from production policy data.
