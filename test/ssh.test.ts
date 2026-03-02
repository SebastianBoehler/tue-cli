import { describe, expect, test } from "bun:test";
import {
  buildGatewaySshCommand,
  buildInteractiveShellCommand,
  buildMachineSelectAndShellCommand,
  buildMachineSelectAndTunnelCommand,
  buildMachineSelectAndVncConnectCommand,
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
    expect(cmd.includes('start_output=$("$vnc_cmd" :2 2>&1)')).toBe(true);
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
    expect(cmd.includes("Reusing your existing VNC session on :$selected_display.")).toBe(true);
    expect(cmd.includes("Could not find a free VNC display from :$requested_display to :99.")).toBe(true);
    expect(cmd.includes("TUE_VNC_DISPLAY=$selected_display")).toBe(true);
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
