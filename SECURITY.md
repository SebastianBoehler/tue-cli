# Security Policy

`tue-cli` is a local command-line tool for SSH-based university workflows. It should not collect, proxy, or host student credentials.

## Supported Versions

Security fixes target the `main` branch and the latest published package version.

## Reporting a Vulnerability

Please report security issues privately by opening a GitHub security advisory or contacting the repository owner through GitHub.

Include:

- affected command or workflow
- operating system and CLI version or commit
- minimal reproduction steps
- whether credentials, SSH keys, logs, or personal data may be exposed

Do not include real passwords, SSH private keys, cookies, or full terminal captures with personal data.

## Security Expectations

- SSH authentication stays local to the user's SSH client, SSH agent, or interactive prompt.
- The CLI must not accept university passwords through environment variables.
- Remote commands should fail clearly when required tools, hosts, or credentials are unavailable.
- Logs should avoid secrets and avoid unnecessary personal data.
- `.env`, shell history, and generated run metadata should remain local.

## Sensitive Data

Never commit:

- `.env` files
- SSH keys or known private host material
- session cookies or tokens
- VNC passwords
- captured terminal transcripts containing personal data
- generated logs with usernames, private paths, or job output that should not be public
