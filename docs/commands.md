# Command Reference

`tue` opens the interactive menu. Direct subcommands are available for scripts, repeatable workflows, and users who prefer explicit commands.

## Core

```bash
tue
tue help
tue whoami
tue whoami --user boehlerse --gateway sshgw.cs.uni-tuebingen.de
```

## User Profiles

```bash
tue user list
tue user select
tue user add --name boehlerse
```

Profiles are stored under `~/.config/tue-cli/profiles.json` or `$XDG_CONFIG_HOME/tue-cli/profiles.json`.

## Onboarding And Cluster Profiles

```bash
tue init
tue init --user boehlerse --cluster tuebingen --gateway sshgw.cs.uni-tuebingen.de --machines cgpool1907,cgpool1908 --default-machine cgpool1907 --remote-root ~

tue doctor
tue doctor --cluster tuebingen

tue clusters list
tue clusters add --name lab --gateway sshgw.example.org --machines gpu01,gpu02 --default-machine gpu01 --remote-root ~/remote
tue clusters select --name lab
tue clusters show --name lab
```

Cluster profiles are stored under `~/.config/tue-cli/clusters.json` or `$XDG_CONFIG_HOME/tue-cli/clusters.json`. CLI flags and environment variables override saved profile values.

## Machines

```bash
tue machines list
tue machines list --live
tue machines list --cluster lab
```

Interactive terminals show a scrollable machine list. `--live` streams raw `pool-smi` output.

## SSH, VNC, And Tunnels

```bash
tue connect shell --machine cgpool1907
tue connect tunnel --machine cgpool1907 --display 2 --local-port 5902
tue connect vnc --machine cgpool1907 --display 2 --local-port 5902
tue connect vnc --machine cgpool1907 --display 2 --vnc-vm plasma

tue vnc start --machine cgpool1907 --display 2
tue vnc start --machine cgpool1907 --display 2 --vnc-vm plasma
tue vnc list --machine cgpool1907
tue vnc kill --machine cgpool1907 --display 2
tue vnc kill :2 --machine cgpool1907
tue vnc kill --machine cgpool1907 --display 2 --keep-tunnel

tue tunnel open --machine cgpool1907 --display 2 --local-port 5902
tue tunnel close --machine cgpool1907 --display 2
tue tunnel close --local-port 5902
```

`tue vnc kill` closes matching local SSH tunnels by default. Use `--keep-tunnel` when another process owns the tunnel.

## Sync And Remote Execution

```bash
tue sync . --machine cgpool1907
tue sync . --machine cgpool1907 --watch

tue run . --machine cgpool1907 --cmd "python3 train.py"
tue run . --machine cgpool1907 --cmd "python3 train.py" --cuda-devices 0
tue run . --machine cgpool1907 --cmd "python3 train.py --epochs 100" --detach
tue run logs --run-id <id> --follow

tue remote run --machine cgpool1907 --cmd "nvidia-smi"
tue remote run --machine cgpool1907 --cmd "python3 train.py" --cuda-devices 1
```

Detached run metadata is stored under `~/.config/tue-cli/runs.json` or `$XDG_CONFIG_HOME/tue-cli/runs.json`.

## CUDA Helpers

```bash
tue cuda info --machine cgpool1907
tue cuda select --machine cgpool1907
tue cuda verify --machine cgpool1907 --workdir "/home/<user>/my-kernels" --cmd "ctest --output-on-failure"
tue cuda profile --machine cgpool1907 --workdir "/home/<user>/my-kernels" --cmd "./build/my_kernel_bench --size 8192"
tue cuda profile --machine cgpool1907 --workdir "/home/<user>/my-kernels" --cmd "./bench" --nsys-bin /graphics/opt/opt_Ubuntu24.04/cuda/toolkit_12.4.1/cuda/bin/nsys
tue cuda profile --machine cgpool1907 --workdir "/home/<user>/my-kernels" --cmd "./bench" --nsys-output task2_profile --nsys-trace cuda,nvtx,osrt --nsys-sqlite true
tue cuda benchmark --machine cgpool1907 --workdir "/home/<user>/my-kernels" --cmd "./build/my_kernel_bench --size 8192" --warmup 3 --runs 20
```

Use `--cuda-devices <list>` or `TUE_CUDA_VISIBLE_DEVICES` to scope CUDA programs to selected GPUs.

## Slurm Jobs

```bash
tue job submit --machine cgpool1907 --cmd "python3 train.py" --name train01 --gpus 1 --cpus 8 --mem 32G --time 08:00:00
tue job status --machine cgpool1907
tue job logs --machine cgpool1907 --job-id 123456 --follow
tue job cancel --machine cgpool1907 --job-id 123456
```

## Build Workflow

```bash
tue build . --machine cgpool1907 --preset release
tue build . --machine cgpool1907 --preset debug --log-file ./logs/build-debug.log
tue build . --machine cgpool1907 --preset release --no-download
```

Build presets:

| Preset | Command |
| --- | --- |
| `release` | `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j` |
| `debug` | `cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build -j` |
| `relwithdebinfo` | `cmake -S . -B build -DCMAKE_BUILD_TYPE=RelWithDebInfo && cmake --build build -j` |

`--build-cmd` overrides presets. `--no-download` runs the build remotely without fetching artifacts.

## Storage And Cleanup

```bash
tue storage check --machine cgpool1907
tue trash empty --machine cgpool1907 --yes
```

Remote upload roots are restricted to `~/...`, `/home/...`, `/graphics/scratch2/students/...`, `/graphics/scratch3/staff/...`, `/ceph/...`, and `/var/tmp/...`.
