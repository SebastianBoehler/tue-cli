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
- remote build/upload/download workflow

## Quick start

```bash
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
- `TUE_LOCAL_PORT`
- `TUE_DRY_RUN`
- `TUE_REMOTE_ROOT`
- `TUE_BUILD_CMD`
- `TUE_ARTIFACT_PATH`
- `TUE_BUILD_OUTPUT`
- `TUE_PROJECT_NAME`
- `TUE_KEEP_REMOTE`

If `--user` and `TUE_USER` are both missing, `tue-cli` uses a global saved username
profile from `~/.config/tue-cli/profiles.json` (or `$XDG_CONFIG_HOME/tue-cli/profiles.json`).

## CG connectivity model (aligned with your document)

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
- `tue vnc kill` closes matching local SSH tunnel(s) by default; pass `--keep-tunnel` to skip that

Machine listing behavior:

- `tue machines list` shows a parsed `pool-smi` snapshot.
- In interactive terminals it opens a scrollable arrow-key list.
- Use `tue machines list --live` for raw live `pool-smi` stream.

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
tue run . --machine cgpool1907 --cmd "python3 train.py"
tue run . --machine cgpool1907 --cmd "nvcc -O3 kernel.cu -o kernel && ./kernel"

tue machines list
tue machines list --live
tue remote run --machine cgpool1907 --cmd "nvidia-smi"
tue vnc start --machine cgpool1907 --display 2
tue vnc list --machine cgpool1907
tue vnc kill --machine cgpool1907 --display 2
tue vnc kill :2 --machine cgpool1907
tue vnc kill --machine cgpool1907 --display 2 --keep-tunnel
tue tunnel open --machine cgpool1907 --display 2 --local-port 5902
tue tunnel close --machine cgpool1907 --display 2
tue tunnel close --local-port 5902
tue build . --machine cgpool1907
```

## Development checks

```bash
bun test
bun run check
```
