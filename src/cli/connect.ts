import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import {
  buildInteractiveShellCommand,
  buildMachineSelectAndShellCommand,
  buildMachineSelectAndTunnelCommand,
  buildMachineSelectAndVncConnectCommand,
  buildProxyJumpPoolCommand,
  buildTunnelCommand,
  buildVncConnectRemoteCommand,
} from "../ssh";
import { supportsInteractivePrompts } from "../ui";
import { execute, executeCapture } from "./execution";
import {
  ensureMachine,
  getVncRemotePort,
  validateLocalPort,
  validateVncDisplay,
} from "./helpers";
import { chooseLocalPort } from "./network";
import { selectMachine } from "./user";

export async function runConnectMode(
  mode: "shell" | "tunnel" | "vnc",
  config: ResolvedConfig,
  machineOverride?: string,
): Promise<void> {
  if (!machineOverride && !config.machine && !supportsInteractivePrompts()) {
    if (mode === "shell") {
      execute(
        buildMachineSelectAndShellCommand({
          username: config.user,
          gateway: config.gateway,
        }),
        config.dryRun,
      );
      return;
    }

    validateVncDisplay(config.display);
    validateLocalPort(config.localPort);

    if (mode === "vnc") {
      execute(
        buildMachineSelectAndVncConnectCommand({
          username: config.user,
          gateway: config.gateway,
          display: config.display,
          localPort: config.localPort,
          remotePort: getVncRemotePort(config.display),
        }),
        config.dryRun,
      );
      console.log(
        `VNC ready. Connect your client to localhost:${config.localPort} (display :${config.display}).`,
      );
      return;
    }

    execute(
      buildMachineSelectAndTunnelCommand({
        username: config.user,
        gateway: config.gateway,
        localPort: config.localPort,
        remotePort: getVncRemotePort(config.display),
      }),
      config.dryRun,
    );
    console.log(
      `Tunnel opened on localhost:${config.localPort} -> <selected-machine>:${getVncRemotePort(config.display)}.`,
    );
    return;
  }

  const machine = machineOverride
    ? ensureMachine(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();

  warnOnRestrictedMachine(machine);

  if (mode === "vnc") {
    validateVncDisplay(config.display);
    validateLocalPort(config.localPort);

    const startCommand = buildProxyJumpPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildVncConnectRemoteCommand(config.display),
    });

    let resolvedDisplay = config.display;
    if (config.dryRun) {
      execute(startCommand, true);
    } else {
      const startOutput = executeCapture(startCommand, false);
      const displayMatch = startOutput.match(/TUE_VNC_DISPLAY=(\d+)/);

      if (!displayMatch) {
        throw new Error(
          "Could not determine selected VNC display from remote command output.",
        );
      }

      resolvedDisplay = Number.parseInt(displayMatch[1], 10);
      const visibleOutput = startOutput
        .split("\n")
        .filter((line) => !line.startsWith("TUE_VNC_DISPLAY="))
        .join("\n")
        .trim();

      if (visibleOutput) {
        console.log(visibleOutput);
      }
    }

    const preferredLocalPort =
      config.localPort === getVncRemotePort(config.display)
        ? getVncRemotePort(resolvedDisplay)
        : config.localPort;
    const effectiveLocalPort = await chooseLocalPort(preferredLocalPort);

    if (effectiveLocalPort !== preferredLocalPort) {
      console.warn(
        `tue-cli note: local port ${preferredLocalPort} is in use; using ${effectiveLocalPort} instead.`,
      );
    }

    execute(
      buildTunnelCommand({
        username: config.user,
        gateway: config.gateway,
        machine,
        localPort: effectiveLocalPort,
        remotePort: getVncRemotePort(resolvedDisplay),
      }),
      config.dryRun,
    );
    console.log(
      `VNC ready. Connect your client to localhost:${effectiveLocalPort} (machine ${machine}, display :${resolvedDisplay}).`,
    );
    return;
  }

  if (mode === "tunnel") {
    validateVncDisplay(config.display);
    validateLocalPort(config.localPort);
    const selectedLocalPort = await chooseLocalPort(config.localPort);

    if (selectedLocalPort !== config.localPort) {
      console.warn(
        `tue-cli note: local port ${config.localPort} is in use; using ${selectedLocalPort} instead.`,
      );
    }

    execute(
      buildTunnelCommand({
        username: config.user,
        gateway: config.gateway,
        machine,
        localPort: selectedLocalPort,
        remotePort: getVncRemotePort(config.display),
      }),
      config.dryRun,
    );
    console.log(
      `Tunnel opened on localhost:${selectedLocalPort} -> ${machine}:${getVncRemotePort(config.display)}.`,
    );
    return;
  }

  execute(
    buildInteractiveShellCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
    }),
    config.dryRun,
  );
}
