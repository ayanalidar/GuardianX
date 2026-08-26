---
name: STQC Audit Finding
about: Track a finding raised during the STQC (Standardisation Testing and Quality Certification) audit cycle.
title: "[STQC] <short summary>"
labels: stqc, audit, security
assignees: ''
---

## 📋 Finding Details

| Field | Value |
|---|---|
| **Finding ID** | STQC-XXXX |
| **Severity** | Critical / High / Medium / Low / Informational |
| **Audit Cycle** | e.g. STQC-2026-Q1 |
| **Reported Date** | YYYY-MM-DD |
| **Due Date** | YYYY-MM-DD |
| **Status** | Open / In Progress / Remediated / Verified / Closed |
| **Owner** | @username |

## 🧩 Affected Component

- **Component / Module:** <!-- e.g. auth, sentinel-engine, blog-posts -->
- **File path(s):** <!-- e.g. src/app/api/auth/login/route.ts -->
- **Endpoint(s):** <!-- e.g. POST /api/auth/login -->
- **Environment:** <!-- dev / staging / production (guardianx.cloud) -->

## 📝 Description

<!-- Clear, concise description of the finding. What did the auditor observe?
What is the security impact? What data/system is at risk? -->

## 🔍 Steps to Reproduce

1.
2.
3.

## 📷 Evidence

<!-- Attach screenshots, logs, curl commands, or HTTP responses that prove
the finding. Reference artifact IDs if needed. -->

## 🛠 Remediation Plan

<!-- What is the proposed fix? Reference any code changes, config updates,
infrastructure changes, or process improvements. -->

- [ ] Code/config change implemented (link MR: !XXX)
- [ ] Unit / integration test added
- [ ] Verified in staging
- [ ] Verified in production (guardianx.cloud)
- [ ] Auditor sign-off received

## ✅ Acceptance Criteria

<!-- What must be true for this finding to be considered closed? -->

- [ ] No reproducible exploit path remains
- [ ] Regression test added to CI/CD (`.gitlab-ci.yml`)
- [ ] Documentation updated (docs/PRODUCTION-DEPLOYMENT.md or relevant)
- [ ] Owner sign-off
- [ ] STQC auditor sign-off

## 🔗 References

- STQC report section:
- Related MR(s):
- Related issue(s):
- Standard / control mapped to: <!-- e.g. OWASP ASVS L1 §2.1, ISO 27001 A.9, DPDPA § -->

## 💬 Notes

<!-- Any additional context, constraints, or follow-ups. -->
