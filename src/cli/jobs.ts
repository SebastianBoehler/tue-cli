import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import {
  buildPoolCommand,
  buildSlurmCancelRemoteCommand,
  buildSlurmLogsRemoteCommand,
  buildSlurmStatusRemoteCommand,
  buildSlurmSubmitRemoteCommand,
} from "../ssh";
import { execute, executeCapture } from "./execution";
import { ensureMachine, parseTruthy } from "./helpers";
import { resolveCudaDevices } from "./settings";
import { selectMachine } from "./user";
import type { CommandRuntimeOptions, FlagMap } from "./types";

function parseOptionalPositiveInt(
  value: string | undefined,
  field: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${field}: ${value}`);
  }

  return parsed;
}

function parseRequiredJobId(value: string | undefined): string {
  if (!value) {
    throw new Error("Missing --job-id.");
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid --job-id: ${value}`);
  }

  return trimmed;
}

function parseOptionalJobId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return parseRequiredJobId(value);
}

function resolveJobMachine(
  config: ResolvedConfig,
  machineOverride?: string,
): Promise<string> | string {
  if (machineOverride) {
    return ensureMachine(machineOverride);
  }

  if (config.machine) {
    return ensureMachine(config.machine);
  }

  return selectMachine();
}

export async function runJobSubmit(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveJobMachine(config, machineOverride);
  warnOnRestrictedMachine(machine);

  const cmd = flags.cmd?.trim();
  if (!cmd) {
    throw new Error("Missing --cmd for `job submit`.");
  }

  const command = buildPoolCommand({
    username: config.user,
    gateway: config.gateway,
    machine,
    remoteCommand: buildSlurmSubmitRemoteCommand({
      command: cmd,
      jobName: flags.name,
      partition: flags.partition,
      timeLimit: flags.time,
      gpus: parseOptionalPositiveInt(flags.gpus, "gpus"),
      cpus: parseOptionalPositiveInt(flags.cpus, "cpus"),
      memory: flags.mem,
      workdir: flags.workdir,
      cudaDevices: resolveCudaDevices(flags, Bun.env),
    }),
  });

  if (config.dryRun) {
    execute(command, true, options);
    return;
  }

  const output = executeCapture(command, false);
  const jobIdMatch = output.match(/(\d+)/);
  if (output) {
    console.log(output);
  }
  if (jobIdMatch) {
    console.log(`Submitted job ${jobIdMatch[1]} on ${machine}.`);
  }
}

export async function runJobStatus(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveJobMachine(config, machineOverride);
  warnOnRestrictedMachine(machine);

  execute(
    buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildSlurmStatusRemoteCommand({
        jobId: parseOptionalJobId(flags["job-id"]),
      }),
    }),
    config.dryRun,
    options,
  );
}

export async function runJobCancel(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveJobMachine(config, machineOverride);
  warnOnRestrictedMachine(machine);

  execute(
    buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildSlurmCancelRemoteCommand({
        jobId: parseRequiredJobId(flags["job-id"]),
      }),
    }),
    config.dryRun,
    options,
  );
}

export async function runJobLogs(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveJobMachine(config, machineOverride);
  warnOnRestrictedMachine(machine);

  const lines = parseOptionalPositiveInt(flags.lines, "lines") ?? 200;
  const follow = parseTruthy(flags.follow);

  execute(
    buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildSlurmLogsRemoteCommand({
        jobId: parseRequiredJobId(flags["job-id"]),
        lines,
        follow,
      }),
      tty: follow,
    }),
    config.dryRun,
    options,
  );
}
