# tue-cli Manual Verification Checklist

Use this file to manually verify behavior and tick items when done.

## Core Features

- [ ] **List machines works**
  - Command: `tue machines list`
  - Expected:
    - Prints known pool + compute machines.
    - Runs `pool-smi` view from a pool machine.
    - No hard failure if `pool-smi` is unavailable on gateway itself.

- [ ] **Create active tunnel works**
  - Command: `tue tunnel open --machine cgpool1905 --display 7 --local-port 5907`
  - Expected:
    - Tunnel opens successfully.
    - Local port listens on `localhost:5907`.
    - If requested local port is busy, CLI selects a free local port and prints it.

- [ ] **Create/reuse VNC server works**
  - Command: `tue connect vnc --machine cgpool1905 --display 7`
  - Expected:
    - Reuses own existing display if available.
    - Does not take another user’s display.
    - Starts new display if needed.
    - Prints final local endpoint (e.g. `localhost:5907`) and selected display.

- [ ] **List VNC sessions works**
  - Command: `tue vnc list --machine cgpool1905`
  - Expected:
    - Shows TurboVNC session table.
    - Includes active display IDs.

- [ ] **Kill VNC server works**
  - Command: `tue vnc kill :7 --machine cgpool1905`
  - Expected:
    - Kills remote VNC display `:7`.
    - Also closes matching local SSH tunnel(s) by default.

- [ ] **Keep tunnel option works**
  - Command: `tue vnc kill :7 --machine cgpool1905 --keep-tunnel`
  - Expected:
    - Kills remote VNC display.
    - Leaves local tunnel process(es) running.

- [ ] **Close local tunnel manually works**
  - Command: `tue tunnel close --machine cgpool1905 --display 7`
  - Expected:
    - Finds and terminates matching local SSH forwarding process(es).
    - Prints note if none found.

- [ ] **Close local tunnel by port works**
  - Command: `tue tunnel close --local-port 5907`
  - Expected:
    - Terminates local tunnel bound to port `5907`.

- [ ] **Remote build command runs**
  - Command: `tue build . --machine cgpool1905`
  - Expected:
    - Uploads project.
    - Executes build command remotely.
    - Downloads artifacts locally.

- [ ] **Run code/script on VM works**
  - Command: `tue run . --machine cgpool1905 --cmd "python3 train.py"`
  - Expected:
    - Uploads local project/script directory.
    - Executes the run command on the remote machine in uploaded project directory.
    - Shows command output in local terminal.
    - Does not require artifact download step.

- [ ] **Sync project to VM works**
  - Command: `tue sync . --machine cgpool1905`
  - Expected:
    - Creates remote project directory if missing.
    - Performs incremental file sync (rsync-based).
    - Keeps remote mirror in sync with local directory.

- [ ] **Sync watch mode works**
  - Command: `tue sync . --machine cgpool1905 --watch`
  - Expected:
    - Performs an initial sync.
    - Watches local file changes and auto-runs sync after save.
    - Stops cleanly with `Ctrl+C`.

- [ ] **CUDA info command works**
  - Command: `tue cuda info --machine cgpool1905`
  - Expected:
    - Shows host name.
    - Shows `nvidia-smi` GPU summary (or clear fallback message).
    - Shows `nvcc --version` (or clear fallback message).

- [ ] **Build preset selection works**
  - Command: `tue build . --machine cgpool1905 --preset debug`
  - Expected:
    - Uses preset-defined CMake build command.
    - Produces artifacts as in normal build flow.

- [ ] **Command logging works**
  - Command: `tue run . --machine cgpool1905 --cmd "./build/deviceQuery" --log-file ./logs/deviceQuery.log`
  - Expected:
    - Command output is still shown in terminal.
    - Output is appended to provided log file with timestamped command header.

- [ ] **Detached run + log lookup works**
  - Commands:
    - `tue run . --machine cgpool1905 --cmd "python3 train.py" --detach`
    - `tue run logs --run-id <id>`
  - Expected:
    - Detached run returns a `run-id` and remote PID.
    - `tue run logs` shows the detached run log file.
    - `tue run logs --follow` tails live output.

- [ ] **Storage check works**
  - Command: `tue storage check --machine cgpool1905`
  - Expected:
    - Shows host, disk usage, quota (if available), and largest home entries.

- [ ] **Slurm job workflow works**
  - Commands:
    - `tue job submit --machine cgpool1905 --cmd "python3 train.py" --name test01 --gpus 1 --cpus 4 --mem 16G --time 02:00:00`
    - `tue job status --machine cgpool1905`
    - `tue job logs --machine cgpool1905 --job-id <id>`
    - `tue job cancel --machine cgpool1905 --job-id <id>`
  - Expected:
    - Submit prints a job id.
    - Status lists your jobs (or selected job).
    - Logs command reads job output file.
    - Cancel terminates selected job id.

## Build UX / Behavior Improvements (Target)

These items describe desired behavior to implement or validate later.

- [ ] **Prefer working-directory defaults over env-heavy build config**
  - Desired:
    - Running `tue build` in any directory should work with sensible defaults from that directory.
    - Env vars remain optional overrides, not required for common usage.

- [ ] **Default local build output goes to current project `./build`**
  - Desired:
    - Build artifacts are downloaded to `<current-working-dir>/build` by default.
    - Avoid hidden output dirs unless explicitly requested.

- [ ] **Default build command runs in project working dir**
  - Desired:
    - Remote build command should run from the uploaded project root.
    - CMake-friendly default example:
      - `cmake -S . -B build && cmake --build build -j`

- [ ] **Build behavior is clearly documented**
  - Desired:
    - README states default input path, default output path, and default build command.

## Notes

- Date tested:
- Host / machine tested:
- Issues observed:
