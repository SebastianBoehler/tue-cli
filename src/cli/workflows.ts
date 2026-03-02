import {
  createBuildCommands,
  createRunCommands,
  createSyncCommands,
} from "../build";
import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import { buildPoolCommand } from "../ssh";
import { execute, executeAll } from "./execution";
import { ensureMachine, hasLocalBinary } from "./helpers";
import {
  buildCudaInfoRemoteCommand,
  resolveBuildSettings,
  resolveRunSettings,
  resolveSyncSettings,
} from "./settings";
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

  executeAll(commands, config.dryRun, options);
}

export async function runCudaInfo(
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
      remoteCommand: buildCudaInfoRemoteCommand(),
    }),
    config.dryRun,
    options,
  );
}

export function runRemoteCommand(
  config: ResolvedConfig,
  remoteCommand: string,
  options?: CommandRuntimeOptions,
): void {
  const machine = ensureMachine(config.machine);
  warnOnRestrictedMachine(machine);

  execute(
    buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand,
    }),
    config.dryRun,
    options,
  );
}
