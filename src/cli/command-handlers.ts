import {
  createBuildCommands,
  createBuildCommandsWithMachineSelection,
  createRunCommands,
  createRunCommandsWithMachineSelection,
  createSyncCommands,
  createSyncCommandsWithMachineSelection,
} from "../build";
import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import { supportsInteractivePrompts } from "../ui";
import { executeAll } from "./execution";
import { ensureMachine } from "./helpers";
import { buildPoolSmiSelectorCommandWithFallback } from "./pool";
import { resolveBuildSettings, resolveRunSettings, resolveSyncSettings } from "./settings";
import { selectMachine } from "./user";
import type { CommandRuntimeOptions, FlagMap } from "./types";

export async function handleBuildCommand(
  config: ResolvedConfig,
  flags: FlagMap,
  localPath: string,
  options?: CommandRuntimeOptions,
): Promise<void> {
  const buildSettings = resolveBuildSettings(flags, localPath, Bun.env);
  const machine = config.machine ? ensureMachine(config.machine) : undefined;
  let selectedMachine = machine;
  let commands: string[];

  if (machine !== undefined) {
    commands = createBuildCommands({
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
  } else if (supportsInteractivePrompts()) {
    selectedMachine = await selectMachine();
    commands = createBuildCommands({
      user: config.user,
      gateway: config.gateway,
      machine: selectedMachine,
      localPath,
      projectName: buildSettings.projectName,
      remoteRoot: buildSettings.remoteRoot,
      buildCommand: buildSettings.buildCommand,
      artifactPath: buildSettings.artifactPath,
      outputDir: buildSettings.outputDir,
      keepRemote: buildSettings.keepRemote,
    });
  } else {
    commands = [
      createBuildCommandsWithMachineSelection({
        user: config.user,
        gateway: config.gateway,
        selectorCommand: buildPoolSmiSelectorCommandWithFallback(config),
        localPath,
        projectName: buildSettings.projectName,
        remoteRoot: buildSettings.remoteRoot,
        buildCommand: buildSettings.buildCommand,
        artifactPath: buildSettings.artifactPath,
        outputDir: buildSettings.outputDir,
        keepRemote: buildSettings.keepRemote,
      }),
    ];
  }

  if (selectedMachine) {
    warnOnRestrictedMachine(selectedMachine);
  }

  executeAll(commands, config.dryRun, options);
}

export async function handleRunCommand(
  config: ResolvedConfig,
  flags: FlagMap,
  localPath: string,
  options?: CommandRuntimeOptions,
): Promise<void> {
  const runSettings = resolveRunSettings(flags, localPath, Bun.env);
  const machine = config.machine ? ensureMachine(config.machine) : undefined;
  let selectedMachine = machine;
  let commands: string[];

  if (machine !== undefined) {
    commands = createRunCommands({
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
  } else if (supportsInteractivePrompts()) {
    selectedMachine = await selectMachine();
    commands = createRunCommands({
      user: config.user,
      gateway: config.gateway,
      machine: selectedMachine,
      localPath,
      projectName: runSettings.projectName,
      remoteRoot: runSettings.remoteRoot,
      runCommand: runSettings.runCommand,
      cudaDevices: runSettings.cudaDevices,
      keepRemote: runSettings.keepRemote,
    });
  } else {
    commands = [
      createRunCommandsWithMachineSelection({
        user: config.user,
        gateway: config.gateway,
        selectorCommand: buildPoolSmiSelectorCommandWithFallback(config),
        localPath,
        projectName: runSettings.projectName,
        remoteRoot: runSettings.remoteRoot,
        runCommand: runSettings.runCommand,
        cudaDevices: runSettings.cudaDevices,
        keepRemote: runSettings.keepRemote,
      }),
    ];
  }

  if (selectedMachine) {
    warnOnRestrictedMachine(selectedMachine);
  }

  executeAll(commands, config.dryRun, options);
}

export async function handleSyncCommand(
  config: ResolvedConfig,
  flags: FlagMap,
  localPath: string,
  options?: CommandRuntimeOptions,
): Promise<void> {
  const syncSettings = resolveSyncSettings(flags, localPath, Bun.env);
  const machine = config.machine ? ensureMachine(config.machine) : undefined;
  let selectedMachine = machine;
  let commands: string[];

  if (machine !== undefined) {
    commands = createSyncCommands({
      user: config.user,
      gateway: config.gateway,
      machine,
      localPath,
      projectName: syncSettings.projectName,
      remoteRoot: syncSettings.remoteRoot,
      keepRemote: syncSettings.keepRemote,
    });
  } else if (supportsInteractivePrompts()) {
    selectedMachine = await selectMachine();
    commands = createSyncCommands({
      user: config.user,
      gateway: config.gateway,
      machine: selectedMachine,
      localPath,
      projectName: syncSettings.projectName,
      remoteRoot: syncSettings.remoteRoot,
      keepRemote: syncSettings.keepRemote,
    });
  } else {
    commands = [
      createSyncCommandsWithMachineSelection({
        user: config.user,
        gateway: config.gateway,
        selectorCommand: buildPoolSmiSelectorCommandWithFallback(config),
        localPath,
        projectName: syncSettings.projectName,
        remoteRoot: syncSettings.remoteRoot,
        keepRemote: syncSettings.keepRemote,
      }),
    ];
  }

  if (selectedMachine) {
    warnOnRestrictedMachine(selectedMachine);
  }

  executeAll(commands, config.dryRun, options);
}
