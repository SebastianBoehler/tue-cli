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
- CUDA verification/profiling/benchmark helpers for custom kernel workflows
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

If `--remote-root` and `TUE_REMOTE_ROOT` are both unset, `tue-cli` defaults to `~`.

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
- `--log-file <path>` appends terminal output to a local logfile for `build`, `run`, `sync`, `cuda info|verify|profile|benchmark`, and `remote run`.
- use `--cuda-devices <list>` (or `TUE_CUDA_VISIBLE_DEVICES`) to scope CUDA programs to selected GPUs.
- `tue cuda profile` uses Nsight Systems (`nsys`) to profile your `--cmd` target command, with fallback detection in common install paths if `nsys` is not in `PATH`.
- `--nsys-sqlite true` exports SQLite via `nsys export` with cross-version flag compatibility.
- use `--nsys-bin <path>` to pin a specific Nsight Systems binary when multiple versions are installed.
- `tue kernel-research run` launches a local ADK control loop for Triton/CUDA kernel optimization. The LLM stays local and uses `OPENROUTER_API_KEY`; remote machines only run trusted sync/build/profile/verify/benchmark commands through `tue`.
- pass `--profile-report-path <relative/path.json>` when your profiling command writes a structured JSON report on the remote project. The runner fetches it, parses hotspot rankings, and maps them onto your editable Triton/CUDA files before the ADK planner chooses a target.
- pass `--hotspot-map-path <relative/path.json>` to provide explicit hotspot-to-file mappings when kernel names do not naturally line up with file names. The mapping file stays local in the project and is copied into the scratch workspace.
- kernel research runs copy your project into a scratch workspace under `.tue-kernel-research/runs/<id>/workspace/`, save all candidate artifacts, and require explicit `tue kernel-research approve --run-id <id> --yes` before promoting a winning candidate back into your real project tree.
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
tue whoami
tue whoami --user boehlerse --gateway sshgw.cs.uni-tuebingen.de
tue cuda info --machine cgpool1907
tue cuda select --machine cgpool1907
tue cuda verify --machine cgpool1907 --workdir '/home/<user>/my-kernels' --cmd "ctest --output-on-failure"
tue cuda profile --machine cgpool1907 --workdir '/home/<user>/my-kernels' --cmd "./build/my_kernel_bench --size 8192"
tue cuda profile --machine cgpool1907 --workdir '/home/<user>/my-kernels' --cmd "./build/my_kernel_bench --size 8192" --nsys-bin /graphics/opt/opt_Ubuntu24.04/cuda/toolkit_12.4.1/cuda/bin/nsys
tue cuda profile --machine cgpool1907 --workdir '/home/<user>/my-kernels' --cmd "./build/my_kernel_bench --size 8192" --nsys-output task2_profile --nsys-trace cuda,nvtx,osrt --nsys-sqlite true
tue cuda benchmark --machine cgpool1907 --workdir '/home/<user>/my-kernels' --cmd "./build/my_kernel_bench --size 8192" --warmup 3 --runs 20
tue kernel-research run --machine cgpool1907 --project-root . --editable-paths kernels/matmul.py,src/my_kernel.cu --benchmark-cmd "./build/my_kernel_bench --size 8192" --verify-cmd "ctest --output-on-failure" --build-cmd "cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j" --profile-cmd "python scripts/profile_model.py --emit-json" --profile-report-path workspace/profile_report.json --hotspot-map-path hotspot-map.json --llm-model openrouter/anthropic/claude-3.7-sonnet
tue kernel-research status --run-id <id>
tue kernel-research approve --run-id <id> --yes
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

## Kernel Research Prerequisites

Install the Python control-plane dependencies once:

```bash
python3 -m pip install -r requirements-kernel-research.txt
```

Set your provider key locally before running the workflow:

```bash
export OPENROUTER_API_KEY=...
```

Structured profile reports should be JSON and may use either:

```json
{"hotspots":[{"name":"triton_matmul","pct_total":61.2,"source_path":"kernels/matmul.py","op_type":"matmul"}]}
```

or AutoKernel-style keys such as:

```json
{"top_kernels":[{"kernel_name":"triton_matmul","pct_total":61.2,"source_path":"kernels/matmul.py","op_type":"matmul"}]}
```

Optional hotspot mapping files can be as simple as:

```json
{"mappings":{"matmul":"kernels/matmul.py","layernorm":"src/layernorm.cu"}}
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
