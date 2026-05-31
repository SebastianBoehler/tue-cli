# Demo

This walkthrough uses `--dry-run` so you can see the exact commands before touching a remote machine.

## First Setup

```bash
npm install -g tue-wsi-cli
tue init \
  --user alice \
  --cluster lab \
  --gateway sshgw.example.org \
  --machines gpu01,gpu02 \
  --default-machine gpu01 \
  --remote-root ~/remote
```

## Health Check

```bash
tue doctor --cluster lab
```

The doctor checks local tools such as `ssh` and `rsync`, then reports the active user, gateway, and default machine.

## Remote Project Loop

```bash
tue machines list --cluster lab
tue sync . --cluster lab --dry-run
tue run . --cluster lab --cmd "python3 train.py" --dry-run
tue run . --cluster lab --cmd "python3 train.py" --detach
tue run logs --cluster lab --follow
```

## GPU And Slurm Flow

```bash
tue cuda info --cluster lab --dry-run
tue job submit --cluster lab --cmd "python3 train.py" --gpus 1 --time 02:00:00 --dry-run
tue job status --cluster lab --dry-run
```

Remove `--dry-run` once the generated commands match your lab's SSH and Slurm setup.
