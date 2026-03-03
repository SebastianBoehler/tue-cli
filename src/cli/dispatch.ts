import { parseArgs } from "../cli-args";
import { resolveConfig } from "../config";
import { printGatewayGuidance, warnOnRestrictedMachine } from "../machines";
import {
  buildProxyJumpPoolCommand,
  buildTunnelCommand,
  buildVncListRemoteCommand,
} from "../ssh";
import { supportsInteractivePrompts } from "../ui";
import { execute } from "./execution";
import { printHelp } from "./help";
import {
  ensureMachine,
  ensureRemoteCommand,
  getVncRemotePort,
  parseTruthy,
  printActiveIdentity,
  validateLocalPort,
  validateVncDisplay,
} from "./helpers";
import { runInteractive } from "./interactive";
import { chooseLocalPort } from "./network";
import { runMachineList } from "./pool";
import { closeLocalSshTunnels } from "./tunnels";
import type { FlagMap } from "./types";
import {
  maybeRememberUser,
  resolveUserFlag,
} from "./user";
import { rememberMachine } from "../machine-history";
import { handleBuildCommand, handleRunCommand, handleSyncCommand } from "./command-handlers";
import { resolveCudaDevices } from "./settings";
import {
  runEmptyRemoteTrash,
} from "./workflows";
import { runCudaInfo, runCudaSelect, runRemoteCommand } from "./cuda";
import { runVncKill, runVncStartOrReuse } from "./vnc";
import { runConnectMode } from "./connect";
import { applyPositionalDisplayFlags } from "./positionals";
import { handleUserCommand } from "./user-command";
import { runJobCancel, runJobLogs, runJobStatus, runJobSubmit } from "./jobs";
import { runDetachedRunLogs } from "./runs";
import { runStorageCheck } from "./storage";
async function handleCommand(command: string, subcommand: string | undefined, flags: FlagMap): Promise<void> {
  if (!flags.user) {
    flags.user = await resolveUserFlag(flags, Bun.env);
  }

  const config = resolveConfig(flags, Bun.env);
  maybeRememberUser(config.user, config.dryRun);
  if (config.machine) {
    try {
      rememberMachine(config.machine);
    } catch {
      // Ignore invalid machine values here; command handlers will validate.
    }
  }
  const logFile = flags["log-file"];
  printGatewayGuidance(config.gateway);
  printActiveIdentity(config);

  switch (command) {
    case "connect": {
      const mode = (subcommand ?? "shell") as "shell" | "tunnel" | "vnc";
      if (mode !== "shell" && mode !== "tunnel" && mode !== "vnc") {
        throw new Error("Unknown connect mode. Use: connect shell | connect tunnel | connect vnc");
      }
      await runConnectMode(mode, config);
      return;
    }

    case "build": {
      await handleBuildCommand(config, flags, subcommand ?? ".", { logFile });
      return;
    }

    case "run": {
      if (subcommand === "logs") {
        runDetachedRunLogs(config, flags, { logFile });
        return;
      }

      await handleRunCommand(config, flags, subcommand ?? ".", { logFile });
      return;
    }

    case "sync": {
      await handleSyncCommand(config, flags, subcommand ?? ".", { logFile });
      return;
    }

    case "cuda": {
      if (subcommand && subcommand !== "info" && subcommand !== "select") {
        throw new Error("Unknown cuda subcommand. Use: cuda info | cuda select");
      }

      if (subcommand === "select") {
        await runCudaSelect(config, flags, { logFile });
        return;
      }

      await runCudaInfo(config, { logFile });
      return;
    }

    case "machines": {
      if (subcommand && subcommand !== "list") {
        throw new Error("Unknown machines subcommand. Use: machines list");
      }
      await runMachineList(config, { live: parseTruthy(flags.live) });
      return;
    }

    case "storage": {
      if (subcommand && subcommand !== "check") {
        throw new Error("Unknown storage subcommand. Use: storage check");
      }

      await runStorageCheck(config, { logFile });
      return;
    }

    case "job": {
      const jobAction = subcommand ?? "status";

      if (
        jobAction !== "submit" &&
        jobAction !== "status" &&
        jobAction !== "cancel" &&
        jobAction !== "logs"
      ) {
        throw new Error("Unknown job subcommand. Use: job submit | job status | job cancel | job logs");
      }

      if (jobAction === "submit") {
        await runJobSubmit(config, flags, { logFile });
        return;
      }

      if (jobAction === "status") {
        await runJobStatus(config, flags, { logFile });
        return;
      }

      if (jobAction === "cancel") {
        await runJobCancel(config, flags, { logFile });
        return;
      }

      await runJobLogs(config, flags, { logFile });
      return;
    }

    case "remote": {
      if (subcommand !== "run") {
        throw new Error("Unknown remote subcommand. Use: remote run");
      }
      runRemoteCommand(
        config,
        ensureRemoteCommand(flags.cmd),
        resolveCudaDevices(flags, Bun.env),
        { logFile },
      );
      return;
    }

    case "trash": {
      if (subcommand && subcommand !== "empty") {
        throw new Error("Unknown trash subcommand. Use: trash empty --yes");
      }

      if (!parseTruthy(flags.yes)) {
        throw new Error(
          "Refusing to empty trash without explicit confirmation. Re-run with --yes.",
        );
      }

      await runEmptyRemoteTrash(config, { logFile });
      return;
    }

    case "vnc": {
      const machine = ensureMachine(config.machine);
      validateVncDisplay(config.display);
      warnOnRestrictedMachine(machine);

      if (subcommand === "start") {
        runVncStartOrReuse(config, machine, { logFile });
        return;
      }

      if (subcommand === "list") {
        execute(buildProxyJumpPoolCommand({
          username: config.user,
          gateway: config.gateway,
          machine,
          remoteCommand: buildVncListRemoteCommand(),
        }), config.dryRun, { logFile });
        return;
      }

      if (subcommand === "kill") {
        const killedDisplay = await runVncKill(config, machine, {
          requestedDisplay: config.display,
          requestedDisplayExplicit: Boolean(flags.display || Bun.env.TUE_DISPLAY),
          allowInteractiveSelection: false,
          logFile,
        });

        if (!parseTruthy(flags["keep-tunnel"])) {
          closeLocalSshTunnels({
            user: config.user,
            gateway: config.gateway,
            machine,
            remotePort: getVncRemotePort(
              killedDisplay ?? config.display,
            ),
            dryRun: config.dryRun,
          });
        }
        return;
      }

      throw new Error("Unknown vnc subcommand. Use: vnc start | vnc list | vnc kill");
    }

    case "tunnel": {
      if (subcommand === "open") {
        const machine = ensureMachine(config.machine);
        validateVncDisplay(config.display);
        validateLocalPort(config.localPort);
        warnOnRestrictedMachine(machine);

        const selectedLocalPort = await chooseLocalPort(config.localPort);
        if (selectedLocalPort !== config.localPort) {
          console.warn(`tue-cli note: local port ${config.localPort} is in use; using ${selectedLocalPort} instead.`);
        }

        execute(buildTunnelCommand({
          username: config.user,
          gateway: config.gateway,
          machine,
          localPort: selectedLocalPort,
          remotePort: getVncRemotePort(config.display),
        }), config.dryRun, { logFile });

        console.log(`Tunnel opened on localhost:${selectedLocalPort} -> ${machine}:${getVncRemotePort(config.display)}.`);
        return;
      }

      if (subcommand === "close") {
        const machine = config.machine ? ensureMachine(config.machine) : undefined;
        if (machine) {
          warnOnRestrictedMachine(machine);
        }

        closeLocalSshTunnels({
          user: config.user,
          gateway: config.gateway,
          machine,
          remotePort: flags.display ? getVncRemotePort(config.display) : undefined,
          localPort: flags["local-port"] ? config.localPort : undefined,
          dryRun: config.dryRun,
        });
        return;
      }

      throw new Error("Unknown tunnel subcommand. Use: tunnel open | tunnel close");
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export async function runCli(argv: string[] = Bun.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  const flags = { ...parsed.flags };
  applyPositionalDisplayFlags(parsed.command, parsed.subcommand, parsed.positionals, flags);

  if (parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
    printHelp();
    return;
  }

  if (!parsed.command || parsed.command === "interactive") {
    if (!supportsInteractivePrompts()) {
      throw new Error("Interactive prompt is unavailable. Use subcommands with explicit flags instead.");
    }
    await runInteractive(flags);
    return;
  }

  if (parsed.command === "user") {
    await handleUserCommand(parsed.subcommand, flags);
    return;
  }

  await handleCommand(parsed.command, parsed.subcommand, flags);
}
