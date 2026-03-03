import { describe, expect, test } from "bun:test";
import {
  buildDetachedRunLogsRemoteCommand,
  buildGatewaySshCommand,
  buildInteractiveShellCommand,
  buildMachineSelectAndShellCommand,
  buildMachineSelectAndTunnelCommand,
  buildMachineSelectAndVncConnectCommand,
  buildEmptyTrashRemoteCommand,
  buildSlurmCancelRemoteCommand,
  buildSlurmLogsRemoteCommand,
  buildSlurmStatusRemoteCommand,
  buildSlurmSubmitRemoteCommand,
  buildStorageCheckRemoteCommand,
  buildVncConnectRemoteCommand,
  buildVncKillRemoteCommand,
  buildVncListRemoteCommand,
  buildPoolSmiSnapshotRemoteCommand,
  buildPoolSmiRemoteCommand,
  buildPoolCommand,
  buildTunnelCommand,
  buildVncStartRemoteCommand,
} from "../src/ssh";

describe("ssh command building", () => {
  test("builds direct gateway command", () => {
    const cmd = buildGatewaySshCommand(
      "test-user",
      "gateway.example.org",
      "pool-smi",
    );
    expect(cmd).toBe("ssh test-user@gateway.example.org 'pool-smi'");
  });

  test("builds nested pool command through gateway", () => {
    const cmd = buildPoolCommand({
      username: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      remoteCommand: "nvidia-smi",
    });

    expect(cmd).toBe(
      "ssh -J test-user@gateway.example.org test-user@cgpool1907 'nvidia-smi'",
    );
  });

  test("builds nested pool command through gateway with tty", () => {
    const cmd = buildPoolCommand({
      username: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      remoteCommand: "pool-smi",
      tty: true,
    });

    expect(cmd).toBe(
      "ssh -J test-user@gateway.example.org -t test-user@cgpool1907 'pool-smi'",
    );
  });

  test("escapes double quotes in remote commands", () => {
    const cmd = buildPoolCommand({
      username: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      remoteCommand: 'echo "Result = PASS" && nvidia-smi',
    });

    expect(cmd).toBe(
      `ssh -J test-user@gateway.example.org test-user@cgpool1907 'echo "Result = PASS" && nvidia-smi'`,
    );
  });

  test("builds interactive shell command through gateway", () => {
    const cmd = buildInteractiveShellCommand({
      username: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
    });

    expect(cmd).toBe(
      "ssh -J test-user@gateway.example.org -t test-user@cgpool1907",
    );
  });

  test("builds machine-select then shell command", () => {
    const cmd = buildMachineSelectAndShellCommand({
      username: "test-user",
      gateway: "gateway.example.org",
    });

    expect(cmd.startsWith("ssh test-user@gateway.example.org '")).toBe(true);
    expect(cmd.includes("if command -v pool-smi")).toBe(true);
    expect(
      cmd.includes("printf 'Select machine (e.g. cgpool1907): '; read machine;"),
    ).toBe(true);
    expect(
      cmd.includes("ssh -J test-user@gateway.example.org -t test-user@\"$machine\""),
    ).toBe(true);
  });

  test("builds machine-select then tunnel command", () => {
    const cmd = buildMachineSelectAndTunnelCommand({
      username: "test-user",
      gateway: "gateway.example.org",
      localPort: 5901,
      remotePort: 5903,
    });

    expect(cmd.startsWith("ssh test-user@gateway.example.org '")).toBe(true);
    expect(cmd.includes("if command -v pool-smi")).toBe(true);
    expect(
      cmd.endsWith(
        "ssh test-user@gateway.example.org -fN -L 5901:\"$machine\":5903",
      ),
    ).toBe(true);
  });

  test("builds machine-select VNC start and tunnel command", () => {
    const cmd = buildMachineSelectAndVncConnectCommand({
      username: "test-user",
      gateway: "gateway.example.org",
      display: 1,
      localPort: 5901,
      remotePort: 5901,
    });

    expect(
      cmd.includes("if command -v pool-smi"),
    ).toBe(true);
    expect(
      cmd.includes(
        "ssh -J test-user@gateway.example.org test-user@\"$machine\"",
      ),
    ).toBe(true);
    expect(cmd.includes("for candidate in vncserver tigervncserver turbovncserver")).toBe(true);
    expect(cmd.includes("vnc_cmd=")).toBe(true);
    expect(cmd.includes("-list 2>/dev/null")).toBe(true);
    expect(cmd.includes('No VNC server found (vncserver/tigervncserver/turbovncserver, plus common absolute paths)')).toBe(true);
    expect(
      cmd.endsWith(
        "ssh test-user@gateway.example.org -fN -L 5901:\"$machine\":5901",
      ),
    ).toBe(true);
  });

  test("builds robust VNC start command with fallback binaries", () => {
    const cmd = buildVncStartRemoteCommand(2);

    expect(cmd.includes("for candidate in vncserver tigervncserver turbovncserver")).toBe(true);
    expect(cmd.includes("/opt/TurboVNC/bin/vncserver")).toBe(true);
    expect(cmd.includes("/graphics/opt/opt_Ubuntu24.04/TurboVNC/bin/vncserver")).toBe(true);
    expect(cmd.includes('"$vnc_cmd" -list')).toBe(true);
    expect(cmd.includes(":2([[:space:]]|$)")).toBe(true);
    expect(cmd.includes('echo "VNC server already running on :2, reusing existing session."')).toBe(true);
    expect(cmd.includes("run_vnc_start(){")).toBe(true);
    expect(cmd.includes('start_output=$(run_vnc_start 2 2>&1)')).toBe(true);
    expect(cmd.includes("already running as :2|already running.*:2")).toBe(true);
    expect(cmd.includes('lock_file="/tmp/.X2-lock"')).toBe(true);
    expect(cmd.includes('lock_user="$(ps -o user= -p "$lock_pid" | awk')).toBe(true);
    expect(cmd.includes('Display :2 appears occupied by another session')).toBe(true);
    expect(cmd.includes("bash -lc")).toBe(false);
  });

  test("builds VNC list command via shared resolver", () => {
    const cmd = buildVncListRemoteCommand();

    expect(cmd.includes("for candidate in vncserver tigervncserver turbovncserver")).toBe(true);
    expect(cmd.endsWith('"$vnc_cmd" -list')).toBe(true);
  });

  test("builds VNC kill command via shared resolver", () => {
    const cmd = buildVncKillRemoteCommand(7);

    expect(cmd.includes("for candidate in vncserver tigervncserver turbovncserver")).toBe(true);
    expect(cmd.endsWith('"$vnc_cmd" -kill :7')).toBe(true);
  });

  test("builds VNC connect command with auto-display selection", () => {
    const cmd = buildVncConnectRemoteCommand(1);

    expect(cmd.includes('current_user="$(id -un)"')).toBe(true);
    expect(cmd.includes("display_is_listed")).toBe(true);
    expect(cmd.includes("run_vnc_start(){")).toBe(true);
    expect(cmd.includes("Reusing your existing VNC session on :$selected_display.")).toBe(true);
    expect(cmd.includes("Could not find a free VNC display from :$requested_display to :99.")).toBe(true);
    expect(cmd.includes("TUE_VNC_DISPLAY=$selected_display")).toBe(true);
  });

  test("passes vnc vm mode to start/connect commands", () => {
    const startCmd = buildVncStartRemoteCommand(3, "plasma");
    const connectCmd = buildVncConnectRemoteCommand(3, "plasma");

    expect(startCmd.includes("vnc_vm='plasma'")).toBe(true);
    expect(startCmd.includes('-vm "$vnc_vm"')).toBe(true);
    expect(connectCmd.includes("vnc_vm='plasma'")).toBe(true);
    expect(connectCmd.includes('start_output=$(run_vnc_start "$scan_display" 2>&1)')).toBe(true);
  });

  test("builds pool-smi command with absolute-path fallback", () => {
    const cmd = buildPoolSmiRemoteCommand();

    expect(cmd.includes("command -v pool-smi")).toBe(true);
    expect(
      cmd.includes("/graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi"),
    ).toBe(true);
  });

  test("builds pool-smi snapshot command with timeout/head fallback", () => {
    const cmd = buildPoolSmiSnapshotRemoteCommand();

    expect(cmd.includes("pool_smi_cmd=''")).toBe(true);
    expect(cmd.includes("command -v pool-smi")).toBe(true);
    expect(
      cmd.includes("/graphics/opt/opt_Ubuntu24.04/cluster-smi/pool-smi"),
    ).toBe(true);
    expect(cmd.includes("command -v timeout")).toBe(true);
    expect(cmd.includes("timeout 5s")).toBe(true);
    expect(cmd.includes("head -n 400")).toBe(true);
  });

  test("builds remote trash cleanup command", () => {
    const cmd = buildEmptyTrashRemoteCommand();

    expect(cmd.includes('$HOME/.local/share/Trash/files')).toBe(true);
    expect(cmd.includes('$HOME/.local/share/Trash/info')).toBe(true);
    expect(cmd.includes("find \"$trash_files\" -mindepth 1 -maxdepth 1 -exec rm -rf {} +")).toBe(true);
    expect(cmd.includes("find \"$trash_info\" -mindepth 1 -maxdepth 1 -type f -name '*.trashinfo' -delete")).toBe(true);
  });

  test("builds storage check command", () => {
    const cmd = buildStorageCheckRemoteCommand();

    expect(cmd.includes("Disk usage")).toBe(true);
    expect(cmd.includes("/graphics/scratch2/students")).toBe(true);
    expect(cmd.includes("quota -s")).toBe(true);
    expect(cmd.includes("Largest entries in $HOME")).toBe(true);
  });

  test("builds slurm submit command", () => {
    const cmd = buildSlurmSubmitRemoteCommand({
      command: "python3 train.py",
      jobName: "train01",
      partition: "gpu",
      timeLimit: "08:00:00",
      gpus: 1,
      cpus: 8,
      memory: "32G",
      workdir: "/home/test-user/project",
      cudaDevices: "0",
    });

    expect(cmd.includes("command -v sbatch")).toBe(true);
    expect(cmd.includes("--job-name")).toBe(true);
    expect(cmd.includes("--partition")).toBe(true);
    expect(cmd.includes("--time")).toBe(true);
    expect(cmd.includes("--gpus")).toBe(true);
    expect(cmd.includes("--cpus-per-task")).toBe(true);
    expect(cmd.includes("--mem")).toBe(true);
    expect(cmd.includes("CUDA_VISIBLE_DEVICES=$cuda_devices")).toBe(true);
    expect(cmd.includes("cd $workdir && $wrap_cmd")).toBe(true);
  });

  test("builds slurm status/cancel/log commands", () => {
    const statusCmd = buildSlurmStatusRemoteCommand({ jobId: "1234" });
    const cancelCmd = buildSlurmCancelRemoteCommand({ jobId: "1234" });
    const logsCmd = buildSlurmLogsRemoteCommand({
      jobId: "1234",
      lines: 150,
      follow: true,
    });

    expect(statusCmd.includes("command -v squeue")).toBe(true);
    expect(statusCmd.includes("squeue -j")).toBe(true);
    expect(cancelCmd.includes("command -v scancel")).toBe(true);
    expect(cancelCmd.includes("scancel")).toBe(true);
    expect(logsCmd.includes("scontrol show job")).toBe(true);
    expect(logsCmd.includes("tail -n")).toBe(true);
    expect(logsCmd.includes("tail -n \"$lines\" -f")).toBe(true);
  });

  test("builds detached run logs command", () => {
    const cmd = buildDetachedRunLogsRemoteCommand({
      projectPath: "/home/test-user/project",
      logPath: ".tue-runs/abc.log",
      lines: 120,
      follow: false,
    });

    expect(cmd.includes("project_path='/home/test-user/project'")).toBe(true);
    expect(cmd.includes("log_path='.tue-runs/abc.log'")).toBe(true);
    expect(cmd.includes('resolved_log="$project_path/$log_path"')).toBe(true);
    expect(cmd.includes("Could not find detached run log")).toBe(true);
    expect(cmd.includes('tail -n "$lines" "$resolved_log"')).toBe(true);
  });

  test("builds tunnel command with separate local and remote ports", () => {
    const cmd = buildTunnelCommand({
      username: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPort: 16001,
      remotePort: 5902,
    });

    expect(cmd).toBe(
      "ssh test-user@gateway.example.org -fN -L 16001:cgpool1907:5902",
    );
  });
});
