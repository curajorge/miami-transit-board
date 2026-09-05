# Security Policy

## Supported version

Security fixes are applied to the latest commit on `main`.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository. Include reproduction steps, affected files or versions, and the potential impact.

This project has no accounts, server-side user data, analytics, advertising SDKs, or payment processing. The Android app requests only network access.

## Repository safeguards

The intended `main` policy requires pull requests, passing `web` and `android` checks, and resolved review conversations. Force pushes and branch deletion are prohibited, including for administrators. Review approval is optional for the current solo-maintainer workflow; CODEOWNERS routes review requests to the maintainer.

GitHub secret scanning and push protection help detect known credential formats. Dependabot monitors Actions and Gradle dependencies. CI uses pinned action commits with read-only repository permissions. These are safeguards, not a guarantee that all vulnerabilities or secrets will be detected.

Never commit upload/signing keys, Play service-account credentials, environment secrets, or personal phone screenshots. Keep release signing material outside the repository with an owner-controlled backup. If a credential leaks, revoke/rotate it first; deleting the file does not remove it from Git history.
