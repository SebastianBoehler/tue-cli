export function printHelp(): void {
  console.log(`tue-cli

Usage:
  tue
  tue build [<local_path>] [--machine <hostname>] [--project-name <name>] [--build-cmd "<cmd>"] [--preset <debug|release|relwithdebinfo>] [--artifact-path <path>] [--output-dir <dir>] [--log-file <path>] [--dry-run]
  tue run [<local_path>] --cmd "<command>" [--machine <hostname>] [--project-name <name>] [--remote-root <dir>] [--cuda-devices <list>] [--keep-remote] [--log-file <path>] [--dry-run]
  tue sync [<local_path>] [--machine <hostname>] [--project-name <name>] [--remote-root <dir>] [--keep-remote] [--log-file <path>] [--dry-run]
  tue cuda <info|select> [--machine <hostname>] [--cuda-devices <list>] [--log-file <path>] [--dry-run]
  tue connect [shell|tunnel|vnc] [--machine <hostname>] [--display <n>] [--vnc-vm <name>] [--local-port <port>] [--user <name>] [--dry-run]
  tue user <list|select|add> [--name <username>]
  tue machines list [--user <name>] [--gateway <host>] [--live] [--dry-run]
  tue vnc <start|list|kill> [<display>|:<display>] --machine <hostname> [--display <n>] [--vnc-vm <name>] [--keep-tunnel] [--user <name>] [--dry-run]
  tue tunnel <open|close> [<display>|:<display>] [--machine <hostname>] [--display <n>] [--local-port <port>] [--user <name>] [--dry-run]
  tue remote run --machine <hostname> --cmd "<command>" [--cuda-devices <list>] [--user <name>] [--log-file <path>] [--dry-run]
  tue trash empty [--machine <hostname>] --yes [--user <name>] [--log-file <path>] [--dry-run]
  tue help

Notes:
  - Running just "tue" opens the interactive menu (single entry point).
  - For VNC forwarding, remote port is always 5900 + display; local port can be any free port.
  - Allowed remote-root prefixes: ~/..., /home/..., /graphics/scratch2/students/..., /graphics/scratch3/staff/..., /ceph/..., /var/tmp/...

Config sources (priority):
  1) CLI flags
  2) .env / environment variables

Supported environment variables:
  TUE_USER, TUE_GATEWAY, TUE_MACHINE, TUE_DISPLAY, TUE_VNC_VM, TUE_LOCAL_PORT, TUE_DRY_RUN,
  TUE_CUDA_VISIBLE_DEVICES,
  TUE_REMOTE_ROOT, TUE_BUILD_CMD, TUE_BUILD_PRESET, TUE_ARTIFACT_PATH, TUE_BUILD_OUTPUT, TUE_PROJECT_NAME, TUE_KEEP_REMOTE
`);
}
