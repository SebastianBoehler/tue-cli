# Workflows

## Verify Environment First

1. `tue whoami`
2. `tue machines list`
3. `tue cuda info --machine <host>`
4. Then move to `tue build` or `tue run`

## Build and Execute a Local Project

1. Inspect the existing local project files.
2. Use `tue build <path> --machine <host>` for remote builds.
3. Use `tue run <path> --machine <host> --cmd "<cmd>"` for uploaded-project execution.
4. Use `tue remote run --machine <host> --cmd "<cmd>"` for one-off remote commands.

## Profile or Benchmark CUDA Code

Use:
- `tue cuda verify` for correctness or smoke checks
- `tue cuda profile` for Nsight Systems traces
- `tue cuda benchmark` for repeated runs with warmup

Anchor the command in the existing project directory and binary name from the local workspace.
