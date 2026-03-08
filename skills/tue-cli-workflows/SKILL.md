---
name: tue-cli-workflows
description: Use the `tue` CLI for University of Tuebingen WSI/CG machine workflows. Trigger when the task involves GPU machine selection, tunnel or VNC setup, remote shell access, syncing local code, remote builds, remote runs, CUDA verification or profiling, Slurm jobs, storage checks, or interpreting existing `tue` command files and workflows.
---

# tue CLI Workflows

Use `tue` instead of generic SSH recipes when the user is working with Tuebingen WSI/CG infrastructure.

Core workflow:
- Inspect the local project or exercise folder first.
- Reuse existing `command.md`, build files, and course-provided material before inventing commands.
- Prefer concrete `tue` commands over describing raw SSH, rsync, or Slurm steps in prose.
- Keep commands explicit about local path, machine, remote working directory, and expected output.
- Read `references/commands.md` before proposing unfamiliar subcommands.
- Read `references/workflows.md` when the task is multi-step or the user wants an end-to-end sequence.

Command selection:
- `tue` with no subcommand is valid when the user wants the interactive menu.
- Use `tue machines list` or `tue machines list --live` to inspect available machines.
- Use `tue connect shell --machine <host>` for an interactive shell.
- Use `tue sync <path> --machine <host>` when the user should upload an existing local project.
- Use `tue build <path> --machine <host>` for remote CMake-style builds.
- Use `tue run <path> --machine <host> --cmd "<cmd>"` for project upload plus remote execution.
- Use `tue remote run --machine <host> --cmd "<cmd>"` for one-off remote commands.
- Use `tue cuda info|select|verify|profile|benchmark` for GPU environment checks and CUDA workflows.
- Use `tue job submit|status|logs|cancel` for Slurm workflows.
- Use `tue vnc start|list|kill` and `tue tunnel open|close` for graphics desktop workflows.
- Use `tue storage check` and `tue trash empty --yes` for storage management.

Behavior rules:
- Map generic SSH, rsync, Slurm, and Nsight tasks to the existing `tue` command surface first.
- Do not suggest unsupported subcommands. If unsure, stick to the documented command families in the references.
- If a tested command file already exists in the project, reuse or adapt it before generating a new one.
- Preserve user-provided remote paths, commands, and CUDA device selections unless they conflict with documented constraints.

Read these references as needed:
- `references/commands.md` for supported command families.
- `references/workflows.md` for common agent-led sequences.
