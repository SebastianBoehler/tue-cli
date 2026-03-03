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

type SlurmSubmitCommandOptions = {
  command: string;
  jobName?: string;
  partition?: string;
  timeLimit?: string;
  gpus?: number;
  cpus?: number;
  memory?: string;
  workdir?: string;
  cudaDevices?: string;
};

type SlurmStatusCommandOptions = {
  jobId?: string;
};

type SlurmCancelCommandOptions = {
  jobId: string;
};

type SlurmLogsCommandOptions = {
  jobId: string;
  lines: number;
  follow: boolean;
};

type DetachedRunLogsCommandOptions = {
  projectPath: string;
  logPath: string;
  lines: number;
  follow: boolean;
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

function quoteForShellSingle(input: string): string {
  return `'${escapeForSingleQuotes(input)}'`;
}

export function buildPoolSmiRemoteCommand(): string {
  return "if command -v pool-smi >/dev/null 2>&1; then pool-smi; elif [ -x /graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi ]; then /graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi; else echo 'tue-cli note: pool-smi is not available on this host; continuing without live pool status.'; fi";
}

export function buildPoolSmiSnapshotRemoteCommand(): string {
  return "pool_smi_cmd=''; if command -v pool-smi >/dev/null 2>&1; then pool_smi_cmd='pool-smi'; elif [ -x /graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi ]; then pool_smi_cmd='/graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi'; else echo 'tue-cli note: pool-smi is not available on this host; continuing without live pool status.'; exit 0; fi; if command -v timeout >/dev/null 2>&1; then timeout 5s \"$pool_smi_cmd\" 2>/dev/null || true; else \"$pool_smi_cmd\" 2>/dev/null | head -n 400 || true; fi";
}

export function buildEmptyTrashRemoteCommand(): string {
  return "trash_files=\"$HOME/.local/share/Trash/files\"; trash_info=\"$HOME/.local/share/Trash/info\"; removed_files=0; removed_info=0; if [ -d \"$trash_files\" ]; then removed_files=$(find \"$trash_files\" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' '); find \"$trash_files\" -mindepth 1 -maxdepth 1 -exec rm -rf {} +; fi; if [ -d \"$trash_info\" ]; then removed_info=$(find \"$trash_info\" -mindepth 1 -maxdepth 1 -type f -name '*.trashinfo' | wc -l | tr -d ' '); find \"$trash_info\" -mindepth 1 -maxdepth 1 -type f -name '*.trashinfo' -delete; fi; echo \"Trash emptied: removed ${removed_files} item(s) and ${removed_info} metadata file(s) in $HOME/.local/share/Trash.\"";
}

export function buildStorageCheckRemoteCommand(): string {
  return "echo '== Host ==' && hostname && echo && echo '== Disk usage (selected paths) ==' && for p in \"$HOME\" /home /graphics/scratch2/students /graphics/scratch3/staff /ceph /var/tmp; do if [ -e \"$p\" ]; then df -h \"$p\" 2>/dev/null | tail -n +2 | awk -v path=\"$p\" '{print path\" -> \"$0}'; fi; done && echo && echo '== Quota ==' && (command -v quota >/dev/null 2>&1 && quota -s || echo 'quota command not available') && echo && echo '== Largest entries in $HOME (top 12) ==' && (du -sh \"$HOME\"/* 2>/dev/null | sort -h | tail -n 12 || true)";
}

export function buildSlurmSubmitRemoteCommand(
  options: SlurmSubmitCommandOptions,
): string {
  const jobName = quoteForShellSingle(options.jobName ?? "");
  const partition = quoteForShellSingle(options.partition ?? "");
  const timeLimit = quoteForShellSingle(options.timeLimit ?? "");
  const gpus = quoteForShellSingle(
    options.gpus !== undefined ? String(options.gpus) : "",
  );
  const cpus = quoteForShellSingle(
    options.cpus !== undefined ? String(options.cpus) : "",
  );
  const memory = quoteForShellSingle(options.memory ?? "");
  const workdir = quoteForShellSingle(options.workdir ?? "");
  const cudaDevices = quoteForShellSingle(options.cudaDevices ?? "");
  const command = quoteForShellSingle(options.command);

  return `if ! command -v sbatch >/dev/null 2>&1; then echo 'sbatch not found on remote machine.' >&2; exit 127; fi; job_name=${jobName}; partition=${partition}; time_limit=${timeLimit}; gpus=${gpus}; cpus=${cpus}; mem=${memory}; workdir=${workdir}; cuda_devices=${cudaDevices}; run_cmd=${command}; wrap_cmd="$run_cmd"; [ -n "$cuda_devices" ] && wrap_cmd="CUDA_VISIBLE_DEVICES=$cuda_devices $wrap_cmd"; [ -n "$workdir" ] && wrap_cmd="cd $workdir && $wrap_cmd"; set -- sbatch --parsable; [ -n "$job_name" ] && set -- "$@" --job-name "$job_name"; [ -n "$partition" ] && set -- "$@" --partition "$partition"; [ -n "$time_limit" ] && set -- "$@" --time "$time_limit"; [ -n "$gpus" ] && set -- "$@" --gpus "$gpus"; [ -n "$cpus" ] && set -- "$@" --cpus-per-task "$cpus"; [ -n "$mem" ] && set -- "$@" --mem "$mem"; "$@" --wrap "$wrap_cmd"`;
}

export function buildSlurmStatusRemoteCommand(
  options: SlurmStatusCommandOptions,
): string {
  const jobId = quoteForShellSingle(options.jobId ?? "");
  return `if ! command -v squeue >/dev/null 2>&1; then echo 'squeue not found on remote machine.' >&2; exit 127; fi; job_id=${jobId}; if [ -n "$job_id" ]; then squeue -j "$job_id" -o '%.18i %.9P %.8j %.8u %.2t %.10M %.6D %R'; else squeue -u "$(id -un)" -o '%.18i %.9P %.8j %.8u %.2t %.10M %.6D %R'; fi`;
}

export function buildSlurmCancelRemoteCommand(
  options: SlurmCancelCommandOptions,
): string {
  const jobId = quoteForShellSingle(options.jobId);
  return `if ! command -v scancel >/dev/null 2>&1; then echo 'scancel not found on remote machine.' >&2; exit 127; fi; job_id=${jobId}; scancel "$job_id" && echo "Cancelled job $job_id."`;
}

export function buildSlurmLogsRemoteCommand(
  options: SlurmLogsCommandOptions,
): string {
  const jobId = quoteForShellSingle(options.jobId);
  const lines = quoteForShellSingle(String(options.lines));
  const follow = quoteForShellSingle(options.follow ? "1" : "0");
  return `job_id=${jobId}; lines=${lines}; follow=${follow}; stdout_path=''; if command -v scontrol >/dev/null 2>&1; then stdout_path=$(scontrol show job "$job_id" 2>/dev/null | tr ' ' '\\n' | awk -F= '/^StdOut=/{print $2; exit}'); fi; [ -z "$stdout_path" ] && stdout_path="slurm-$job_id.out"; if [ ! -f "$stdout_path" ]; then echo "Could not find log file: $stdout_path" >&2; exit 1; fi; if [ "$follow" = "1" ]; then tail -n "$lines" -f "$stdout_path"; else tail -n "$lines" "$stdout_path"; fi`;
}

export function buildDetachedRunLogsRemoteCommand(
  options: DetachedRunLogsCommandOptions,
): string {
  const projectPath = quoteForShellSingle(options.projectPath);
  const logPath = quoteForShellSingle(options.logPath);
  const lines = quoteForShellSingle(String(options.lines));
  const follow = quoteForShellSingle(options.follow ? "1" : "0");

  return `project_path=${projectPath}; log_path=${logPath}; lines=${lines}; follow=${follow}; case "$log_path" in /*) resolved_log="$log_path" ;; *) resolved_log="$project_path/$log_path" ;; esac; if [ ! -f "$resolved_log" ]; then echo "Could not find detached run log: $resolved_log" >&2; exit 1; fi; if [ "$follow" = "1" ]; then tail -n "$lines" -f "$resolved_log"; else tail -n "$lines" "$resolved_log"; fi`;
}

function buildVncResolverRemoteCommand(): string {
  const fallbackPaths = VNC_SERVER_FALLBACK_PATHS.map(
    (pathValue) => `'${pathValue}'`,
  ).join(" ");
  return `export PATH="$PATH:/opt/TurboVNC/bin:/opt/tigervnc/bin:/graphics/opt/opt_Ubuntu24.04/TurboVNC/bin:/graphics/opt/opt_Ubuntu24.04/tigervnc/bin"; [ -f /etc/profile ] && . /etc/profile >/dev/null 2>&1 || true; [ -f ~/.profile ] && . ~/.profile >/dev/null 2>&1 || true; [ -f ~/.bash_profile ] && . ~/.bash_profile >/dev/null 2>&1 || true; [ -f ~/.bashrc ] && . ~/.bashrc >/dev/null 2>&1 || true; vnc_cmd=''; for candidate in vncserver tigervncserver turbovncserver ${fallbackPaths}; do case "$candidate" in /*) if [ -x "$candidate" ]; then vnc_cmd="$candidate"; break; fi ;; *) if command -v "$candidate" >/dev/null 2>&1; then vnc_cmd="$candidate"; break; fi ;; esac; done; if [ -z "$vnc_cmd" ]; then for candidate in /opt/*/bin/vncserver /usr/*/bin/vncserver /graphics/opt/*/*/bin/vncserver /graphics/opt/*/*/*/bin/vncserver; do if [ -x "$candidate" ]; then vnc_cmd="$candidate"; break; fi; done; fi; if [ -z "$vnc_cmd" ]; then echo "No VNC server found (vncserver/tigervncserver/turbovncserver, plus common absolute paths)"; echo "PATH=$PATH"; exit 127; fi`;
}

function buildVncVmSetupCommand(vncVm?: string): string {
  const vmToken = quoteForShellSingle(vncVm ?? "");
  return `vnc_vm=${vmToken}; run_vnc_start(){ display_id="$1"; if [ -n "$vnc_vm" ]; then "$vnc_cmd" :$display_id -vm "$vnc_vm"; else "$vnc_cmd" :$display_id; fi; };`;
}

export function buildVncStartRemoteCommand(
  display: number,
  vncVm?: string,
): string {
  const resolver = buildVncResolverRemoteCommand();
  const vmSetup = buildVncVmSetupCommand(vncVm);
  return `${resolver}; ${vmSetup} if "$vnc_cmd" -list 2>/dev/null | grep -Eq ":${display}([[:space:]]|$)"; then echo "VNC server already running on :${display}, reusing existing session."; else start_output=$(run_vnc_start ${display} 2>&1); start_exit=$?; if [ $start_exit -eq 0 ]; then echo "$start_output"; elif echo "$start_output" | grep -Eqi "already running as :${display}|already running.*:${display}"; then if "$vnc_cmd" -list 2>/dev/null | grep -Eq ":${display}([[:space:]]|$)"; then echo "VNC server already running on :${display}, reusing existing session."; else lock_file="/tmp/.X${display}-lock"; owner_msg="owner unknown"; if [ -r "$lock_file" ]; then lock_pid="$(tr -cd '0-9' < "$lock_file" | head -c 32)"; if [ -n "$lock_pid" ] && ps -p "$lock_pid" >/dev/null 2>&1; then lock_user="$(ps -o user= -p "$lock_pid" | awk '{print $1}')"; if [ -n "$lock_user" ]; then owner_msg="owned by user $lock_user (pid $lock_pid)"; fi; else owner_msg="stale lock file $lock_file"; fi; fi; echo "Display :${display} appears occupied by another session ($owner_msg)." >&2; exit 98; fi; else echo "$start_output" >&2; exit $start_exit; fi; fi`;
}

export function buildVncConnectRemoteCommand(
  preferredDisplay: number,
  vncVm?: string,
): string {
  const resolver = buildVncResolverRemoteCommand();
  const vmSetup = buildVncVmSetupCommand(vncVm);
  return `${resolver}; ${vmSetup} requested_display=${preferredDisplay}; current_user="$(id -un)"; resolve_owner(){ display_id="$1"; lock_file="/tmp/.X$display_id-lock"; if [ ! -r "$lock_file" ]; then printf ''; return 0; fi; lock_pid="$(tr -cd '0-9' < "$lock_file" | head -c 32)"; if [ -z "$lock_pid" ]; then printf ''; return 0; fi; if ! ps -p "$lock_pid" >/dev/null 2>&1; then printf ''; return 0; fi; ps -o user= -p "$lock_pid" | awk '{print $1}'; }; display_is_listed(){ display_id="$1"; "$vnc_cmd" -list 2>/dev/null | grep -Eq ":$display_id([[:space:]]|$)"; }; selected_display=''; if display_is_listed "$requested_display"; then requested_owner="$(resolve_owner "$requested_display")"; if [ "$requested_owner" = "$current_user" ]; then selected_display="$requested_display"; echo "VNC server already running on :$selected_display, reusing existing session."; fi; fi; if [ -z "$selected_display" ]; then scan_display=1; while [ $scan_display -le 99 ]; do if display_is_listed "$scan_display"; then scan_owner="$(resolve_owner "$scan_display")"; if [ "$scan_owner" = "$current_user" ]; then selected_display="$scan_display"; echo "Reusing your existing VNC session on :$selected_display."; break; fi; fi; scan_display=$((scan_display + 1)); done; fi; if [ -z "$selected_display" ]; then scan_display="$requested_display"; while [ $scan_display -le 99 ]; do scan_owner="$(resolve_owner "$scan_display")"; if [ -z "$scan_owner" ]; then start_output=$(run_vnc_start "$scan_display" 2>&1); start_exit=$?; if [ $start_exit -eq 0 ]; then [ -n "$start_output" ] && echo "$start_output"; selected_display="$scan_display"; break; fi; if echo "$start_output" | grep -Eqi "already running as :$scan_display|already running.*:$scan_display"; then scan_owner="$(resolve_owner "$scan_display")"; if [ "$scan_owner" = "$current_user" ]; then selected_display="$scan_display"; echo "VNC server already running on :$selected_display, reusing existing session."; break; fi; fi; fi; scan_display=$((scan_display + 1)); done; fi; if [ -z "$selected_display" ]; then echo "Could not find a free VNC display from :$requested_display to :99." >&2; exit 98; fi; echo "TUE_VNC_DISPLAY=$selected_display"`;
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
    vncVm?: string;
  },
): string {
  const prefix = buildSshPrefix(options.username, options.gateway);
  const proxyJumpPrefix = buildProxyJumpPrefix(options.username, options.gateway);
  const vncStartCommand = quoteForShellSingle(
    buildVncStartRemoteCommand(options.display, options.vncVm),
  );
  const poolSmiCommand = quoteForShellSingle(buildPoolSmiRemoteCommand());
  return `${prefix} ${poolSmiCommand}; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ${proxyJumpPrefix} ${options.username}@"$machine" ${vncStartCommand} && ${prefix} -fN -L ${options.localPort}:"$machine":${options.remotePort}`;
}

export function buildTunnelCommand(options: TunnelCommandOptions): string {
  const prefix = buildSshPrefix(options.username, options.gateway);
  return `${prefix} -fN -L ${options.localPort}:${options.machine}:${options.remotePort}`;
}
