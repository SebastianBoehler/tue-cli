# Contributing

Thanks for helping improve `tue-cli`. The project is small, practical, and tied to real WSI/CG remote workflows, so contributions should favor predictable behavior over broad abstraction.

## Development Setup

```bash
git clone https://github.com/sebastianboehler/tue-cli.git
cd tue-cli
bun install
bun run link:global
```

Run the CLI locally:

```bash
bun run tue
```

## Checks

Run all standard checks before opening a pull request:

```bash
bun run lint
bun test
bun run check
```

Build the package entry point when changing startup, packaging, or bin behavior:

```bash
bun run build
```

## Contribution Guidelines

- Keep files focused and below 300 lines when possible. Split command helpers, types, and tests when a file grows.
- Use typed helpers for SSH commands, paths, and config parsing instead of ad hoc string handling.
- Add or update tests for command parsing, config precedence, SSH command construction, and persistent metadata changes.
- Do not add mock data, fake machine inventories, or silent fallback behavior unless a test fixture explicitly needs it.
- Return clear errors when credentials, upstream commands, or required local tools are missing.
- Keep university credentials, SSH keys, logs with personal data, and captured terminal output out of commits.
- Prefer small pull requests with one user-visible workflow or one internal refactor.

## Commit Style

Use conventional prefixes so the history stays easy to scan:

```text
feat(cli): add machine history command
fix(vnc): close matching tunnel on kill
docs: improve setup guide
test(config): cover env precedence
chore: update build workflow
```

## Pull Request Checklist

- The README or docs explain any new user-facing command or environment variable.
- Tests cover new parsing or command construction behavior.
- `bun run lint`, `bun test`, and `bun run check` have been run locally.
- No credentials, personal logs, or machine-specific private data are included.
- Large changes are split into reviewable commits or modules.

## Release Notes

For user-facing changes, include a short note in the pull request summary that explains:

- the command or workflow affected
- the new behavior
- any migration or configuration impact
