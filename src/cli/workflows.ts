import {
  createBuildCommands,
  createRunCommands,
  createSyncCommands,
} from "../build";
import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import { buildEmptyTrashRemoteCommand, buildPoolCommand } from "../ssh";
import { execute, executeAll } from "./execution";
import { ensureMachine, hasLocalBinary, parseTruthy } from "./helpers";
import {
  resolveBuildSettings,
  resolveRunSettings,
  resolveSyncSettings,
} from "./settings";
import { runSyncWatchLoop } from "./sync-watch";
import { selectMachine } from "./user";
import type { CommandRuntimeOptions, FlagMap } from "./types";

export async function runBuild(
  config: ResolvedConfig,
  flags: FlagMap,
  localPath: string,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = machineOverride
    ? ensureMachine(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();
  warnOnRestrictedMachine(machine);

  const buildSettings = resolveBuildSettings(flags, localPath, Bun.env);
  const commands = createBuildCommands({
    user: config.user,
    gateway: config.gateway,
    machine,
    localPath,
    projectName: buildSettings.projectName,
    remoteRoot: buildSettings.remoteRoot,
    buildCommand: buildSettings.buildCommand,
    artifactPath: buildSettings.artifactPath,
    outputDir: buildSettings.outputDir,
    keepRemote: buildSettings.keepRemote,
    noDownload: buildSettings.noDownload,
  });

  executeAll(commands, config.dryRun, options);
}

export async function runLocalProject(
  config: ResolvedConfig,
  flags: FlagMap,
  localPath: string,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = machineOverride
    ? ensureMachine(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();
  warnOnRestrictedMachine(machine);

  const runSettings = resolveRunSettings(flags, localPath, Bun.env);
  const commands = createRunCommands({
    user: config.user,
    gateway: config.gateway,
    machine,
    localPath,
    projectName: runSettings.projectName,
    remoteRoot: runSettings.remoteRoot,
    runCommand: runSettings.runCommand,
    cudaDevices: runSettings.cudaDevices,
    keepRemote: runSettings.keepRemote,
  });

  executeAll(commands, config.dryRun, options);
}

export async function runSync(
  config: ResolvedConfig,
  flags: FlagMap,
  localPath: string,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  if (!config.dryRun && !hasLocalBinary("rsync")) {
    throw new Error(
      "rsync is required for `tue sync` but is not installed locally.",
    );
  }

  const machine = machineOverride
    ? ensureMachine(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();
  warnOnRestrictedMachine(machine);

  const syncSettings = resolveSyncSettings(flags, localPath, Bun.env);
  const commands = createSyncCommands({
    user: config.user,
    gateway: config.gateway,
    machine,
    localPath,
    projectName: syncSettings.projectName,
    remoteRoot: syncSettings.remoteRoot,
    keepRemote: syncSettings.keepRemote,
  });

  if (parseTruthy(flags.watch)) {
    await runSyncWatchLoop({
      localPath,
      commands,
      dryRun: config.dryRun,
      runtimeOptions: options,
    });
    return;
  }

  executeAll(commands, config.dryRun, options);
}

export async function runEmptyRemoteTrash(
  config: ResolvedConfig,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = machineOverride
    ? ensureMachine(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();
  warnOnRestrictedMachine(machine);

  execute(
    buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildEmptyTrashRemoteCommand(),
    }),
    config.dryRun,
    options,
  );
}
