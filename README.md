# tue-cli

[![Build](https://github.com/sebastianboehler/tue-cli/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/sebastianboehler/tue-cli/actions/workflows/build.yml)
[![Test](https://github.com/sebastianboehler/tue-cli/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/sebastianboehler/tue-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Interactive CLI for WSI/CG remote workflows with a single entry point:

- machine discovery/selection
- SSH shell via gateway
- VNC session start/list/kill
- VNC tunnel setup
- remote command execution
- upload + run local project/script remotely
- incremental project sync to remote machine
- CUDA/GPU environment info command
- detached run mode with persisted run IDs/log lookup
- Slurm job submit/status/cancel/log tail helpers
- storage/quota check command
- remote build/upload/download workflow

## Quick start

### Install from npm (recommended)

```bash
npm install -g tue-cli
# or
bun install -g tue-cli
tue
```

### Install from source

```bash
git clone https://github.com/sebastianboehler/tue-cli.git
cd tue-cli
bun install
bun run link:global
tue
```

`tue` opens an interactive menu so you can pick actions and machines directly.
The interactive UI supports arrow-key navigation with colorized headings/output.

## Prerequisites

- [Bun](https://bun.sh/)
- SSH access to WSI hosts
- eduVPN or university network access (for `cgcontact`)
- Authentication is interactive (SSH prompt/key/agent), no password env var handling in `tue-cli`.

## Configuration

Copy `.env.example` to `.env` and set defaults:

```bash
cp .env.example .env
```

Priority:

1. CLI flags
2. `.env` / environment variables

Supported env vars:

- `TUE_USER`
- `TUE_GATEWAY` (default: `sshgw.cs.uni-tuebingen.de`)
- `TUE_MACHINE`
- `TUE_DISPLAY`
- `TUE_VNC_VM` (optional, e.g. `plasma`)
- `TUE_CUDA_VISIBLE_DEVICES` (optional, e.g. `0` or `0,1`)
- `TUE_LOCAL_PORT`
- `TUE_DRY_RUN`
- `TUE_REMOTE_ROOT`
- `TUE_BUILD_CMD`
- `TUE_BUILD_PRESET` (`debug` | `release` | `relwithdebinfo`)
- `TUE_ARTIFACT_PATH`
- `TUE_BUILD_OUTPUT`
- `TUE_PROJECT_NAME`
- `TUE_KEEP_REMOTE`
- `TUE_NO_DOWNLOAD`

If `--user` and `TUE_USER` are both missing, `tue-cli` uses a global saved username
profile from `~/.config/tue-cli/profiles.json` (or `$XDG_CONFIG_HOME/tue-cli/profiles.json`).
Machine selections are also remembered globally and shown in a `Recently used machines`
option at the top of interactive machine selection.

## CG connectivity model

- Gateway from outside WSI network: `sshgw.cs.uni-tuebingen.de`
- Gateway from university/VPN network: `cgcontact.cs.uni-tuebingen.de`
- Gateways are used as jump hosts only (no regular work on them)

Known machine catalog in CLI:

- Pool (open): `cgpool1801..1803`, `cgpool1900..1912`, `cgpoolsand1900..1907`
- Compute (restricted): `cluster-gpu00..04`, `glorifolia`, `heracleum`, `myristica`, `pulsatilla`

VNC/tunnel behavior:

- remote VNC port is always `5900 + display`
- local forwarded port is configurable (`1025..65535`)
- display is validated to `0..10` (ports `5900..5910`)
- optional VNC window manager/session mode is supported via `--vnc-vm <name>` (for KDE Plasma use `--vnc-vm plasma`)
- `tue vnc kill` closes matching local SSH tunnel(s) by default; pass `--keep-tunnel` to skip that

Machine listing behavior:

- `tue machines list` shows a parsed `pool-smi` snapshot.
- In interactive terminals it opens a scrollable arrow-key list.
- Use `tue machines list --live` for raw live `pool-smi` stream.

Sync/logging notes:

- `tue sync` uses `rsync` locally (required).
- `tue sync --watch` keeps watching your local folder and automatically re-syncs on save/change (stop with `Ctrl+C`).
- `--log-file <path>` appends terminal output to a local logfile for `build`, `run`, `sync`, `cuda info`, and `remote run`.
- use `--cuda-devices <list>` (or `TUE_CUDA_VISIBLE_DEVICES`) to scope CUDA programs to selected GPUs.
- `tue run --detach` stores run metadata globally in `~/.config/tue-cli/runs.json` (or `$XDG_CONFIG_HOME/tue-cli/runs.json`).
- remote paths for uploaded projects (`--remote-root` / `TUE_REMOTE_ROOT`) are restricted to:
  - `~/...`
  - `/home/...`
  - `/graphics/scratch2/students/...`
  - `/graphics/scratch3/staff/...`
  - `/ceph/...`
  - `/var/tmp/...`
- for cleanup in backed-up homes, use `tue trash empty --machine <host> --yes`.

## Commands (still supported)

```bash
tue                                 # interactive menu (recommended)
tue help
tue user list
tue user select
tue user add --name boehlerse

tue connect shell --machine cgpool1907
tue connect tunnel --machine cgpool1907 --display 2 --local-port 5902
tue connect vnc --machine cgpool1907 --display 2 --local-port 5902
tue connect vnc --machine cgpool1907 --display 2 --vnc-vm plasma
tue sync . --machine cgpool1907
tue sync . --machine cgpool1907 --watch
tue cuda info --machine cgpool1907
tue cuda select --machine cgpool1907
tue run . --machine cgpool1907 --cmd "python3 train.py"
tue run . --machine cgpool1907 --cmd "python3 train.py" --cuda-devices 0
tue run . --machine cgpool1907 --cmd "python3 train.py --epochs 100" --detach
tue run logs --run-id <id> --follow
tue run . --machine cgpool1907 --cmd "nvcc -O3 kernel.cu -o kernel && ./kernel"
tue run . --machine cgpool1907 --cmd "./build/deviceQuery" --log-file ./logs/deviceQuery.log
tue storage check --machine cgpool1907
tue job submit --machine cgpool1907 --cmd "python3 train.py" --name train01 --gpus 1 --cpus 8 --mem 32G --time 08:00:00
tue job status --machine cgpool1907
tue job logs --machine cgpool1907 --job-id 123456 --follow
tue job cancel --machine cgpool1907 --job-id 123456

tue machines list
tue machines list --live
tue remote run --machine cgpool1907 --cmd "nvidia-smi"
tue remote run --machine cgpool1907 --cmd "python3 train.py" --cuda-devices 1
tue trash empty --machine cgpool1907 --yes
tue vnc start --machine cgpool1907 --display 2
tue vnc start --machine cgpool1907 --display 2 --vnc-vm plasma
tue vnc list --machine cgpool1907
tue vnc kill --machine cgpool1907 --display 2
tue vnc kill :2 --machine cgpool1907
tue vnc kill --machine cgpool1907 --display 2 --keep-tunnel
tue tunnel open --machine cgpool1907 --display 2 --local-port 5902
tue tunnel close --machine cgpool1907 --display 2
tue tunnel close --local-port 5902
tue build . --machine cgpool1907 --preset release
tue build . --machine cgpool1907 --preset debug --log-file ./logs/build-debug.log
tue build . --machine cgpool1907 --preset release --no-download
```

Build presets:

- `--preset release` -> `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j`
- `--preset debug` -> `cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build -j`
- `--preset relwithdebinfo` -> `cmake -S . -B build -DCMAKE_BUILD_TYPE=RelWithDebInfo && cmake --build build -j`
- `--build-cmd` overrides presets.
- `--no-download` skips local artifact download (build runs remotely only).

## Development checks

```bash
bun run lint
bun test
bun run check
```

## Git hooks

Pre-commit hook is configured via Husky and runs:

```bash
bun run lint
bun run check
bun test
```

If hooks are not installed yet, run:

```bash
bun install
```
