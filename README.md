# tue-cli

Interactive command-line tooling for University of Tuebingen WSI and Computer Graphics remote workflows.

`tue-cli` gives students and researchers one `tue` command for SSH access, machine discovery, VNC sessions, remote sync/run workflows, CUDA inspection, Slurm helpers, and repeatable remote builds. It talks to live university machines through SSH and local tooling only. It does not ship mock infrastructure, hosted credential handling, or hidden remote services.

![Build](https://github.com/sebastianboehler/tue-cli/actions/workflows/build.yml/badge.svg?branch=main)
![Test](https://github.com/sebastianboehler/tue-cli/actions/workflows/test.yml/badge.svg?branch=main)
![Bun](https://img.shields.io/badge/bun-1.0%2B-f472b6?logo=bun&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-D22128.svg)

## Install

Install the published package:

```bash
npm install -g tue-wsi-cli
tue
```

Install from a local checkout for development:

```bash
git clone https://github.com/sebastianboehler/tue-cli.git
cd tue-cli
bun install
bun run link:global
tue
```

## What It Does

- Discover and select WSI/CG machines from the known pool and compute catalog.
- Open SSH shells through the configured gateway.
- Start, list, connect to, and stop VNC sessions.
- Open and close local VNC tunnels.
- Sync local projects to remote machines with `rsync`.
- Run local projects, scripts, and one-off commands remotely.
- Inspect CUDA/GPU state and run verification, profiling, and benchmark commands.
- Submit, inspect, tail, and cancel Slurm jobs.
- Run remote CMake build presets and optionally fetch artifacts.
- Keep detached run metadata for later log lookup.
- Run an optional local kernel-research loop for Triton/CUDA optimization experiments.

## Prerequisites

- [Bun](https://bun.sh/) 1.0 or newer for local development.
- SSH access to the relevant WSI/CG hosts.
- eduVPN or university network access when using `cgcontact`.
- `rsync` for project sync commands.
- Local SSH keys, SSH agent, or interactive SSH authentication.

The CLI never accepts university passwords through environment variables. SSH authentication remains local to your machine and SSH configuration.

## Configuration

Copy the example file and adjust it locally:

```bash
cp .env.example .env
```

Configuration priority:

1. CLI flags
2. `.env` and process environment variables
3. Saved user and machine profiles under `~/.config/tue-cli`

Common variables:

| Variable | Purpose |
| --- | --- |
| `TUE_USER` | Default university/WSI username |
| `TUE_GATEWAY` | SSH jump host, for example `sshgw.cs.uni-tuebingen.de` |
| `TUE_MACHINE` | Default target machine |
| `TUE_DISPLAY` | Default VNC display number |
| `TUE_VNC_VM` | Optional VNC session mode such as `plasma` |
| `TUE_CUDA_VISIBLE_DEVICES` | CUDA device scope for remote commands |
| `TUE_REMOTE_ROOT` | Remote upload/build root |

See [`.env.example`](./.env.example) for the complete set of supported variables.

## Quick Usage

Open the interactive menu:

```bash
tue
```

Run direct commands:

```bash
tue machines list
tue connect shell --machine cgpool1907
tue vnc start --machine cgpool1907 --display 2 --vnc-vm plasma
tue tunnel open --machine cgpool1907 --display 2 --local-port 5902
tue sync . --machine cgpool1907 --watch
tue run . --machine cgpool1907 --cmd "python3 train.py" --cuda-devices 0
tue cuda profile --machine cgpool1907 --workdir "/home/<user>/my-kernels" --cmd "./bench"
tue job submit --machine cgpool1907 --cmd "python3 train.py" --gpus 1 --time 08:00:00
tue build . --machine cgpool1907 --preset release
```

See [Command Reference](./docs/commands.md) for the full command list.

## Connectivity Model

- Outside the WSI network, use `sshgw.cs.uni-tuebingen.de` as the SSH gateway.
- On the university network or VPN, use `cgcontact.cs.uni-tuebingen.de`.
- Gateways are jump hosts only; regular work runs on pool or compute machines.
- Remote VNC ports are `5900 + display`.
- VNC display numbers are validated from `0` to `10`.
- Local forwarded ports must be in the `1025..65535` range.

Known machine catalog:

| Group | Hosts |
| --- | --- |
| Pool | `cgpool1801..1803`, `cgpool1900..1912`, `cgpoolsand1900..1907` |
| Compute | `cluster-gpu00..04`, `glorifolia`, `heracleum`, `myristica`, `pulsatilla` |

## Kernel Research

The optional kernel-research workflow launches a local control loop for Triton/CUDA optimization experiments. The planner runs locally, uses `OPENROUTER_API_KEY`, syncs candidate code into scratch workspaces, and requires explicit approval before promoting a winning candidate back into your project.

See [Kernel Research](./docs/kernel-research.md) for setup, profile report formats, and approval behavior.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/` | TypeScript CLI implementation and SSH workflow helpers |
| `src/cli/` | Command dispatch, interactive UI, and command handlers |
| `test/` | Bun unit tests for parsing, config, CLI behavior, and SSH command construction |
| `python/tue_kernel_research/` | Local Python control-plane helpers for kernel-research runs |
| `skills/` | Codex/agent skill metadata for workflow automation |
| `docs/` | Command, workflow, and contributor-facing reference material |

## Development

Run the checks that match your change:

```bash
bun run lint
bun test
bun run check
```

Build the distributable entry point:

```bash
bun run build
```

Pre-commit hooks run linting, type checking, and tests through Husky. If hooks are not installed yet, run `bun install`.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing changes.

When adding remote workflows, prefer typed command construction, narrow tests, explicit error messages, and real upstream behavior. Do not add mock data or silent fallbacks unless a test explicitly needs a fixture.

## Security

- Do not commit credentials, SSH keys, session cookies, private hostnames beyond the documented WSI/CG catalog, logs with personal data, or captured terminal transcripts.
- Keep SSH authentication local to the caller's machine.
- Prefer clear errors for missing credentials, failed SSH commands, and unavailable upstream tools.
- Report security issues using [SECURITY.md](./SECURITY.md).

## License

This repository is licensed under the MIT License. See [`LICENSE`](./LICENSE).
