type GatewayCommandOptions = {
  username: string;
  gateway: string;
  remoteCommand: string;
};

type PoolCommandOptions = GatewayCommandOptions & {
  machine: string;
  tty?: boolean;
};

type ShellCommandOptions = {
  username: string;
  gateway: string;
  machine: string;
};

type TunnelCommandOptions = {
  username: string;
  gateway: string;
  machine: string;
  localPort: number;
  remotePort: number;
};

type MachineSelectOptions = {
  username: string;
  gateway: string;
};

const VNC_SERVER_FALLBACK_PATHS = [
  "/opt/TurboVNC/bin/vncserver",
  "/opt/tigervnc/bin/vncserver",
  "/graphics/opt/opt_Ubuntu24.04/TurboVNC/bin/vncserver",
  "/graphics/opt/opt_Ubuntu24.04/tigervnc/bin/vncserver",
];

function escapeForSingleQuotes(input: string): string {
  return input.replace(/'/g, "'\\''");
}

function escapeForDoubleQuotes(input: string): string {
  return input.replace(/"/g, '\\"');
}

function quoteForShellSingle(input: string): string {
  return `'${escapeForSingleQuotes(input)}'`;
}

export function buildPoolSmiRemoteCommand(): string {
  return "if command -v pool-smi >/dev/null 2>&1; then pool-smi; elif [ -x /graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi ]; then /graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi; else echo 'tue-cli note: pool-smi is not available on this host; continuing without live pool status.'; fi";
}

export function buildPoolSmiSnapshotRemoteCommand(): string {
  return "pool_smi_cmd=''; if command -v pool-smi >/dev/null 2>&1; then pool_smi_cmd='pool-smi'; elif [ -x /graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi ]; then pool_smi_cmd='/graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi'; else echo 'tue-cli note: pool-smi is not available on this host; continuing without live pool status.'; exit 0; fi; if command -v timeout >/dev/null 2>&1; then timeout 5s \"$pool_smi_cmd\" 2>/dev/null || true; else \"$pool_smi_cmd\" 2>/dev/null | head -n 400 || true; fi";
}

function buildVncResolverRemoteCommand(): string {
  const fallbackPaths = VNC_SERVER_FALLBACK_PATHS.map(
    (pathValue) => `'${pathValue}'`,
  ).join(" ");
  return `export PATH="$PATH:/opt/TurboVNC/bin:/opt/tigervnc/bin:/graphics/opt/opt_Ubuntu24.04/TurboVNC/bin:/graphics/opt/opt_Ubuntu24.04/tigervnc/bin"; [ -f /etc/profile ] && . /etc/profile >/dev/null 2>&1 || true; [ -f ~/.profile ] && . ~/.profile >/dev/null 2>&1 || true; [ -f ~/.bash_profile ] && . ~/.bash_profile >/dev/null 2>&1 || true; [ -f ~/.bashrc ] && . ~/.bashrc >/dev/null 2>&1 || true; vnc_cmd=''; for candidate in vncserver tigervncserver turbovncserver ${fallbackPaths}; do case "$candidate" in /*) if [ -x "$candidate" ]; then vnc_cmd="$candidate"; break; fi ;; *) if command -v "$candidate" >/dev/null 2>&1; then vnc_cmd="$candidate"; break; fi ;; esac; done; if [ -z "$vnc_cmd" ]; then for candidate in /opt/*/bin/vncserver /usr/*/bin/vncserver /graphics/opt/*/*/bin/vncserver /graphics/opt/*/*/*/bin/vncserver; do if [ -x "$candidate" ]; then vnc_cmd="$candidate"; break; fi; done; fi; if [ -z "$vnc_cmd" ]; then echo "No VNC server found (vncserver/tigervncserver/turbovncserver, plus common absolute paths)"; echo "PATH=$PATH"; exit 127; fi`;
}

export function buildVncStartRemoteCommand(display: number): string {
  const resolver = buildVncResolverRemoteCommand();
  return `${resolver}; if "$vnc_cmd" -list 2>/dev/null | grep -Eq ":${display}([[:space:]]|$)"; then echo "VNC server already running on :${display}, reusing existing session."; else start_output=$("$vnc_cmd" :${display} 2>&1); start_exit=$?; if [ $start_exit -eq 0 ]; then echo "$start_output"; elif echo "$start_output" | grep -Eqi "already running as :${display}|already running.*:${display}"; then if "$vnc_cmd" -list 2>/dev/null | grep -Eq ":${display}([[:space:]]|$)"; then echo "VNC server already running on :${display}, reusing existing session."; else lock_file="/tmp/.X${display}-lock"; owner_msg="owner unknown"; if [ -r "$lock_file" ]; then lock_pid="$(tr -cd '0-9' < "$lock_file" | head -c 32)"; if [ -n "$lock_pid" ] && ps -p "$lock_pid" >/dev/null 2>&1; then lock_user="$(ps -o user= -p "$lock_pid" | awk '{print $1}')"; if [ -n "$lock_user" ]; then owner_msg="owned by user $lock_user (pid $lock_pid)"; fi; else owner_msg="stale lock file $lock_file"; fi; fi; echo "Display :${display} appears occupied by another session ($owner_msg)." >&2; exit 98; fi; else echo "$start_output" >&2; exit $start_exit; fi; fi`;
}

export function buildVncConnectRemoteCommand(preferredDisplay: number): string {
  const resolver = buildVncResolverRemoteCommand();
  return `${resolver}; requested_display=${preferredDisplay}; current_user="$(id -un)"; resolve_owner(){ display_id="$1"; lock_file="/tmp/.X$display_id-lock"; if [ ! -r "$lock_file" ]; then printf ''; return 0; fi; lock_pid="$(tr -cd '0-9' < "$lock_file" | head -c 32)"; if [ -z "$lock_pid" ]; then printf ''; return 0; fi; if ! ps -p "$lock_pid" >/dev/null 2>&1; then printf ''; return 0; fi; ps -o user= -p "$lock_pid" | awk '{print $1}'; }; display_is_listed(){ display_id="$1"; "$vnc_cmd" -list 2>/dev/null | grep -Eq ":$display_id([[:space:]]|$)"; }; selected_display=''; if display_is_listed "$requested_display"; then requested_owner="$(resolve_owner "$requested_display")"; if [ "$requested_owner" = "$current_user" ]; then selected_display="$requested_display"; echo "VNC server already running on :$selected_display, reusing existing session."; fi; fi; if [ -z "$selected_display" ]; then scan_display=1; while [ $scan_display -le 99 ]; do if display_is_listed "$scan_display"; then scan_owner="$(resolve_owner "$scan_display")"; if [ "$scan_owner" = "$current_user" ]; then selected_display="$scan_display"; echo "Reusing your existing VNC session on :$selected_display."; break; fi; fi; scan_display=$((scan_display + 1)); done; fi; if [ -z "$selected_display" ]; then scan_display="$requested_display"; while [ $scan_display -le 99 ]; do scan_owner="$(resolve_owner "$scan_display")"; if [ -z "$scan_owner" ]; then start_output=$("$vnc_cmd" :$scan_display 2>&1); start_exit=$?; if [ $start_exit -eq 0 ]; then [ -n "$start_output" ] && echo "$start_output"; selected_display="$scan_display"; break; fi; if echo "$start_output" | grep -Eqi "already running as :$scan_display|already running.*:$scan_display"; then scan_owner="$(resolve_owner "$scan_display")"; if [ "$scan_owner" = "$current_user" ]; then selected_display="$scan_display"; echo "VNC server already running on :$selected_display, reusing existing session."; break; fi; fi; fi; scan_display=$((scan_display + 1)); done; fi; if [ -z "$selected_display" ]; then echo "Could not find a free VNC display from :$requested_display to :99." >&2; exit 98; fi; echo "TUE_VNC_DISPLAY=$selected_display"`;
}

export function buildVncListRemoteCommand(): string {
  const resolver = buildVncResolverRemoteCommand();
  return `${resolver}; "$vnc_cmd" -list`;
}

export function buildVncKillRemoteCommand(display: number): string {
  const resolver = buildVncResolverRemoteCommand();
  return `${resolver}; "$vnc_cmd" -kill :${display}`;
}

function buildSshPrefix(username: string, gateway: string): string {
  return `ssh ${username}@${gateway}`;
}

function buildProxyJumpPrefix(username: string, gateway: string): string {
  return `ssh -J ${username}@${gateway}`;
}

export function buildGatewaySshCommand(
  username: string,
  gateway: string,
  remoteCommand: string,
): string {
  const prefix = buildSshPrefix(username, gateway);
  return `${prefix} ${quoteForShellSingle(remoteCommand)}`;
}

export function buildPoolCommand(options: PoolCommandOptions): string {
  const prefix = buildProxyJumpPrefix(options.username, options.gateway);
  const ttyFlag = options.tty ? " -t" : "";
  return `${prefix}${ttyFlag} ${options.username}@${options.machine} ${quoteForShellSingle(options.remoteCommand)}`;
}

export function buildProxyJumpPoolCommand(options: PoolCommandOptions): string {
  const proxyJumpPrefix = buildProxyJumpPrefix(options.username, options.gateway);
  return `${proxyJumpPrefix} ${options.username}@${options.machine} ${quoteForShellSingle(options.remoteCommand)}`;
}

export function buildInteractiveShellCommand(
  options: ShellCommandOptions,
): string {
  const prefix = buildProxyJumpPrefix(options.username, options.gateway);
  return `${prefix} -t ${options.username}@${options.machine}`;
}

export function buildMachineSelectAndShellCommand(
  options: MachineSelectOptions,
): string {
  const prefix = buildSshPrefix(options.username, options.gateway);
  const proxyJumpPrefix = buildProxyJumpPrefix(options.username, options.gateway);
  const poolSmiCommand = quoteForShellSingle(buildPoolSmiRemoteCommand());
  return `${prefix} ${poolSmiCommand}; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ${proxyJumpPrefix} -t ${options.username}@"$machine"`;
}

export function buildMachineSelectAndTunnelCommand(
  options: MachineSelectOptions & { localPort: number; remotePort: number },
): string {
  const prefix = buildSshPrefix(options.username, options.gateway);
  const poolSmiCommand = quoteForShellSingle(buildPoolSmiRemoteCommand());
  return `${prefix} ${poolSmiCommand}; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ${prefix} -fN -L ${options.localPort}:"$machine":${options.remotePort}`;
}

export function buildMachineSelectAndVncConnectCommand(
  options: MachineSelectOptions & {
    display: number;
    localPort: number;
    remotePort: number;
  },
): string {
  const prefix = buildSshPrefix(options.username, options.gateway);
  const proxyJumpPrefix = buildProxyJumpPrefix(options.username, options.gateway);
  const vncStartCommand = quoteForShellSingle(
    buildVncStartRemoteCommand(options.display),
  );
  const poolSmiCommand = quoteForShellSingle(buildPoolSmiRemoteCommand());
  return `${prefix} ${poolSmiCommand}; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ${proxyJumpPrefix} ${options.username}@"$machine" ${vncStartCommand} && ${prefix} -fN -L ${options.localPort}:"$machine":${options.remotePort}`;
}

export function buildTunnelCommand(options: TunnelCommandOptions): string {
  const prefix = buildSshPrefix(options.username, options.gateway);
  return `${prefix} -fN -L ${options.localPort}:${options.machine}:${options.remotePort}`;
}
