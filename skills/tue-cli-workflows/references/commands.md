# Supported Commands

High-confidence command families from the repo:

- `tue`
- `tue help`
- `tue user list|select|add`
- `tue whoami`
- `tue machines list [--live]`
- `tue connect shell|tunnel|vnc`
- `tue sync <path> [--watch]`
- `tue build <path> [--preset debug|release|relwithdebinfo] [--build-cmd "..."] [--no-download]`
- `tue run <path> --cmd "<cmd>" [--detach] [--cuda-devices ...]`
- `tue run logs --run-id <id> [--follow]`
- `tue remote run --machine <host> --cmd "<cmd>"`
- `tue cuda info|select|verify|profile|benchmark`
- `tue job submit|status|logs|cancel`
- `tue storage check`
- `tue trash empty --machine <host> --yes`
- `tue vnc start|list|kill`
- `tue tunnel open|close`

Important constraints:
- Interactive `tue` with no subcommand is valid and opens the menu.
- `remote` only supports `run`.
- `machines` only supports `list`.
- `storage` only supports `check`.
- `trash` only supports `empty`.
- `cuda` supports `info`, `select`, `verify`, `profile`, `benchmark`.
- `job` supports `submit`, `status`, `logs`, `cancel`.
- `vnc` supports `start`, `list`, `kill`.
- `tunnel` supports `open`, `close`.
