<div align="center">

# tue-cli

Remote lab and GPU cluster workflow tooling for students and researchers.

![Build](https://github.com/sebastianboehler/tue-cli/actions/workflows/build.yml/badge.svg?branch=main)
![Test](https://github.com/sebastianboehler/tue-cli/actions/workflows/test.yml/badge.svg?branch=main)
![Bun](https://img.shields.io/badge/bun-1.0%2B-f472b6?logo=bun&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-D22128.svg)

</div>

`tue-cli` gives students and researchers one `tue` command for SSH access, machine discovery, VNC sessions, remote sync/run workflows, CUDA inspection, Slurm helpers, and repeatable remote builds. It ships with University of Tuebingen WSI/CG defaults, but it also supports saved cluster profiles for other university or lab environments. It talks to live machines through SSH and local tooling only; it does not ship mock infrastructure, hosted credential handling, or hidden remote services.

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

- Run guided onboarding with `tue init` and verify your setup with `tue doctor`.
- Save reusable cluster profiles for custom gateways, machine pools, VNC defaults, and remote roots.
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

Run onboarding once:

```bash
tue init
tue doctor
```

Or copy the example file and adjust it locally:

```bash
cp .env.example .env
```

Configuration priority:

1. CLI flags
2. `.env` and process environment variables
3. Saved cluster, user, and machine profiles under `~/.config/tue-cli`

Common variables:

| Variable | Purpose |
| --- | --- |
| `TUE_USER` | Default university/WSI username |
| `TUE_CLUSTER` | Saved cluster profile to use |
| `TUE_GATEWAY` | SSH jump host, for example `sshgw.cs.uni-tuebingen.de` |
| `TUE_MACHINE` | Default target machine |
| `TUE_DISPLAY` | Default VNC display number |
| `TUE_VNC_VM` | Optional VNC session mode such as `plasma` |
| `TUE_CUDA_VISIBLE_DEVICES` | CUDA device scope for remote commands |
| `TUE_REMOTE_ROOT` | Remote upload/build root |

See [`.env.example`](./.env.example) for the complete set of supported variables.

## 60-Second Demo

```bash
tue init --user alice --cluster lab --gateway sshgw.example.org --machines gpu01,gpu02 --default-machine gpu01 --remote-root ~/remote
tue doctor --cluster lab
tue machines list --cluster lab
tue sync . --cluster lab --dry-run
tue run . --cluster lab --cmd "python3 train.py" --dry-run
tue job submit --cluster lab --cmd "python3 train.py" --gpus 1 --time 02:00:00 --dry-run
```

See [Demo](./docs/demo.md) and [Examples](./docs/examples.md) for copyable workflows.

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

## Adapting Another Cluster

Use `tue init` or `tue clusters add` to save a lab profile:

```bash
tue clusters add \
  --name my-lab \
  --gateway login.example.edu \
  --machines gpu01,gpu02,gpu03 \
  --default-machine gpu01 \
  --remote-root ~/remote
```

After that, every command can use `--cluster my-lab` or `TUE_CLUSTER=my-lab`. The profile supplies the gateway, default machine, VNC mode, and remote root unless a CLI flag or environment variable overrides it.

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
