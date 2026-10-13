# Finance Preview: Authenticated API Permission Tests

This runbook is for the manually triggered `Finance Authenticated API Permission Tests` workflow. It targets only:

`https://nhymindia-finance-preview.2026jsr.workers.dev`

Never point this workflow at production or use production credentials.

## Required GitHub environment secrets

In **Settings → Environments → finance-preview → Environment secrets**, configure these eight secrets using dedicated, non-production test accounts:

- `FINANCE_TEST_HEAD_LOGIN_ID`
- `FINANCE_TEST_HEAD_PASSWORD`
- `FINANCE_TEST_OPERATOR_LOGIN_ID`
- `FINANCE_TEST_OPERATOR_PASSWORD`
- `FINANCE_TEST_APPROVER_LOGIN_ID`
- `FINANCE_TEST_APPROVER_PASSWORD`
- `FINANCE_TEST_AUDITOR_LOGIN_ID`
- `FINANCE_TEST_AUDITOR_PASSWORD`

Each account must already exist in the Preview database, be active, have the matching role, and have completed any forced password change. Do not store session tokens as secrets; the workflow logs in at run time and uses short-lived session tokens in memory.

## Run it

1. Confirm all four accounts are Preview-only and do not represent real finance users.
2. Open **Actions → Finance Authenticated API Permission Tests**.
3. Select **Run workflow** on the feature branch.
4. Review the job output for PASS/FAIL and the final total.
5. If it fails, inspect the status code and Worker logs before changing permissions.

## Safety boundaries

- The workflow checks role-specific read access and verifies forbidden requests receive HTTP 403.
- It does not intentionally create income, expense, budget, or finance-user records.
- Login sessions are logged out at the end of a successful test run and otherwise expire automatically.
- Login failure, missing secrets, a role mismatch, or a forced-password-change requirement stops the run.
- This workflow is manually triggered and does not deploy a Worker or apply migrations.
- Successful results apply only to the current Preview deployment and test accounts. They do not authorize production deployment.

## Current limitation

The automated checks cover login/role identity, dashboard access, audit access, and selected forbidden operations. They do not yet prove every allowed mutation succeeds, because doing so safely requires isolated disposable test data and cleanup. Existing manual role checks remain complementary.
