import type { FlagMap } from "./types";
import { resolveInteractiveConfig, selectMachine, selectOrAddUserProfile, maybeRememberUser } from "./user";
import { printGatewayGuidance, warnOnRestrictedMachine } from "../machines";
import { printActiveIdentity, validateVncDisplay, getVncRemotePort } from "./helpers";
import { promptInput, selectMenuOption } from "../ui";
import { runMachineList } from "./pool";
import { runConnectMode } from "./connect";
import { runBuild, runLocalProject, runSync, runCudaInfo } from "./workflows";
import { closeLocalSshTunnels } from "./tunnels";
import {
  buildPoolCommand,
  buildProxyJumpPoolCommand,
  buildVncKillRemoteCommand,
  buildVncListRemoteCommand,
  buildVncStartRemoteCommand,
} from "../ssh";
import { execute } from "./execution";

export async function runInteractive(flags: FlagMap): Promise<void> {
  const config = await resolveInteractiveConfig(flags, Bun.env);
  const logFile = flags["log-file"];
  maybeRememberUser(config.user, config.dryRun);
  printGatewayGuidance(config.gateway);
  printActiveIdentity(config);

  const action = await selectMenuOption(
    "Select action",
    [
      { value: "connect-shell", label: "Connect shell" },
      { value: "connect-vnc", label: "Connect VNC (start/reuse + tunnel)" },
      { value: "tunnel", label: "Open VNC tunnel only" },
      { value: "tunnel-close", label: "Close local VNC tunnel(s)" },
      { value: "user-profile", label: "Switch saved username profile" },
      { value: "vnc-manage", label: "Manage VNC (start/list/kill)" },
      { value: "remote-run", label: "Run remote command" },
      { value: "build", label: "Build local project remotely" },
      { value: "run-local", label: "Run local project/script remotely" },
      { value: "sync", label: "Sync local project to remote machine" },
      { value: "cuda-info", label: "Show CUDA/GPU info on machine" },
      { value: "machines", label: "List known machines + pool-smi status" },
      { value: "exit", label: "Exit" },
    ],
    "connect-shell",
  );

  if (action === "exit") {
    return;
  }

  if (action === "machines") {
    await runMachineList(config);
    return;
  }

  if (action === "connect-shell") {
    await runConnectMode("shell", config);
    return;
  }

  if (action === "connect-vnc") {
    await runConnectMode("vnc", config);
    return;
  }

  if (action === "tunnel") {
    await runConnectMode("tunnel", config);
    return;
  }

  if (action === "tunnel-close") {
    const machine = await selectMachine(config.machine);
    validateVncDisplay(config.display);
    warnOnRestrictedMachine(machine);
    closeLocalSshTunnels({
      user: config.user,
      gateway: config.gateway,
      machine,
      remotePort: getVncRemotePort(config.display),
      dryRun: config.dryRun,
    });
    return;
  }

  if (action === "user-profile") {
    const selectedUser = await selectOrAddUserProfile(config.user);
    console.log(`Active username profile set to: ${selectedUser}`);
    return;
  }

  if (action === "vnc-manage") {
    const vncAction = await selectMenuOption("VNC action", [
      { value: "start", label: "Start/reuse VNC server" },
      { value: "list", label: "List VNC sessions" },
      { value: "kill", label: "Kill VNC session" },
    ]);

    validateVncDisplay(config.display);
    const machine = await selectMachine(config.machine);
    warnOnRestrictedMachine(machine);

    const remoteCommand =
      vncAction === "start"
        ? buildVncStartRemoteCommand(config.display)
        : vncAction === "list"
          ? buildVncListRemoteCommand()
          : buildVncKillRemoteCommand(config.display);

    execute(
      buildProxyJumpPoolCommand({
        username: config.user,
        gateway: config.gateway,
        machine,
        remoteCommand,
      }),
      config.dryRun,
      { logFile },
    );

    if (vncAction === "kill") {
      closeLocalSshTunnels({
        user: config.user,
        gateway: config.gateway,
        machine,
        remotePort: getVncRemotePort(config.display),
        dryRun: config.dryRun,
      });
    }

    return;
  }

  if (action === "remote-run") {
    const machine = await selectMachine(config.machine);
    warnOnRestrictedMachine(machine);
    const remoteCmd = await promptInput('Remote command (example: nvidia-smi)');
    execute(
      buildPoolCommand({
        username: config.user,
        gateway: config.gateway,
        machine,
        remoteCommand: remoteCmd,
      }),
      config.dryRun,
      { logFile },
    );
    return;
  }

  if (action === "build") {
    const localPath = await promptInput("Local path to upload/build", ".");
    await runBuild(config, flags, localPath, { logFile }, await selectMachine(config.machine));
    return;
  }

  if (action === "run-local") {
    const localPath = await promptInput("Local path to upload/run", ".");
    const remoteCmd = await promptInput(
      "Run command in uploaded project directory",
      "python3 --version",
    );
    await runLocalProject(
      config,
      { ...flags, cmd: remoteCmd },
      localPath,
      { logFile },
      await selectMachine(config.machine),
    );
    return;
  }

  if (action === "sync") {
    const localPath = await promptInput("Local path to sync", ".");
    await runSync(config, flags, localPath, { logFile }, await selectMachine(config.machine));
    return;
  }

  if (action === "cuda-info") {
    await runCudaInfo(config, { logFile }, await selectMachine(config.machine));
  }
}
