import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import {
  findDetachedRun,
  findLatestDetachedRun,
} from "../run-history";
import {
  buildPoolCommand,
  buildDetachedRunLogsRemoteCommand,
} from "../ssh";
import { execute } from "./execution";
import { ensureMachine, parseTruthy } from "./helpers";
import type { CommandRuntimeOptions, FlagMap } from "./types";

function parsePositiveInt(
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

function resolveRunLogTarget(config: ResolvedConfig, flags: FlagMap): {
  id: string;
  machine: string;
  projectPath: string;
  logPath: string;
} {
  const requestedRunId = flags["run-id"]?.trim();

  if (requestedRunId) {
    const run = findDetachedRun(requestedRunId);
    if (!run) {
      throw new Error(
        `Unknown run-id ${requestedRunId}. Start a detached run first via: tue run . --cmd "..." --detach`,
      );
    }

    if (config.machine && ensureMachine(config.machine) !== run.machine) {
      throw new Error(
        `run-id ${requestedRunId} belongs to machine ${run.machine}, but --machine is ${config.machine}.`,
      );
    }

    return {
      id: run.id,
      machine: run.machine,
      projectPath: run.projectPath,
      logPath: run.logPath,
    };
  }

  const latest = findLatestDetachedRun({
    user: config.user,
    machine: config.machine ? ensureMachine(config.machine) : undefined,
  });

  if (!latest) {
    throw new Error(
      "No detached run found for your user (and selected machine). Use --run-id or start a detached run first.",
    );
  }

  return {
    id: latest.id,
    machine: latest.machine,
    projectPath: latest.projectPath,
    logPath: latest.logPath,
  };
}

export function runDetachedRunLogs(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
): void {
  const target = resolveRunLogTarget(config, flags);
  const lines = parsePositiveInt(flags.lines, "lines") ?? 200;
  const follow = parseTruthy(flags.follow);

  warnOnRestrictedMachine(target.machine);

  execute(
    buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine: target.machine,
      remoteCommand: buildDetachedRunLogsRemoteCommand({
        projectPath: target.projectPath,
        logPath: target.logPath,
        lines,
        follow,
      }),
      tty: follow,
    }),
    config.dryRun,
    options,
  );

  if (!follow) {
    console.log(`Displayed logs for run ${target.id} (${target.machine}).`);
  }
}
