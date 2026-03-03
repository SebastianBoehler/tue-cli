import { createDetachedRunCommand } from "../build";
import type { ResolvedConfig } from "../config";
import { rememberDetachedRun } from "../run-history";
import { executeCapture, executeAll } from "./execution";
import type { CommandRuntimeOptions } from "./types";

export type DetachedRunSettings = {
  projectName?: string;
  remoteRoot: string;
  runCommand: string;
  cudaDevices?: string;
  keepRemote: boolean;
};

type DetachedRunMetadata = {
  id: string;
  pid: number;
  logPath: string;
  projectPath: string;
};

export function startDetachedRun(
  config: ResolvedConfig,
  localPath: string,
  machine: string,
  runSettings: DetachedRunSettings,
  setupCommands: string[],
  options?: CommandRuntimeOptions,
): void {
  executeAll(setupCommands, config.dryRun, options);

  const runId = createDetachedRunId(machine);
  const detachedCommand = createDetachedRunCommand({
    user: config.user,
    gateway: config.gateway,
    machine,
    localPath,
    projectName: runSettings.projectName,
    remoteRoot: runSettings.remoteRoot,
    runCommand: runSettings.runCommand,
    cudaDevices: runSettings.cudaDevices,
    keepRemote: runSettings.keepRemote,
    runId,
  });

  const output = executeCapture(detachedCommand, config.dryRun);
  if (config.dryRun) {
    return;
  }

  const metadata = parseDetachedRunMetadata(output);
  const visibleOutput = output
    .split("\n")
    .filter((line) => !line.startsWith("TUE_RUN_"))
    .join("\n")
    .trim();

  if (visibleOutput) {
    console.log(visibleOutput);
  }

  rememberDetachedRun({
    id: metadata.id,
    user: config.user,
    gateway: config.gateway,
    machine,
    projectPath: metadata.projectPath,
    logPath: metadata.logPath,
    pid: metadata.pid,
    command: runSettings.runCommand,
    startedAt: new Date().toISOString(),
  });

  console.log(
    `Detached run started on ${machine}: run-id ${metadata.id}, pid ${metadata.pid}.`,
  );
  console.log(
    `Log: ${metadata.logPath} (fetch with: tue run logs --run-id ${metadata.id})`,
  );
}

function createDetachedRunId(machine: string): string {
  const machineToken = machine.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || "machine";
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${timePart}-${machineToken}-${randomPart}`;
}

function parseDetachedRunMetadata(output: string): DetachedRunMetadata {
  const metadata: Partial<DetachedRunMetadata> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("TUE_RUN_ID=")) {
      metadata.id = line.slice("TUE_RUN_ID=".length).trim();
      continue;
    }

    if (line.startsWith("TUE_RUN_PID=")) {
      const pidValue = Number.parseInt(line.slice("TUE_RUN_PID=".length).trim(), 10);
      if (Number.isFinite(pidValue) && pidValue > 0) {
        metadata.pid = pidValue;
      }
      continue;
    }

    if (line.startsWith("TUE_RUN_LOG=")) {
      metadata.logPath = line.slice("TUE_RUN_LOG=".length).trim();
      continue;
    }

    if (line.startsWith("TUE_RUN_PROJECT=")) {
      metadata.projectPath = line.slice("TUE_RUN_PROJECT=".length).trim();
      continue;
    }
  }

  if (
    !metadata.id ||
    !metadata.pid ||
    !metadata.logPath ||
    !metadata.projectPath
  ) {
    throw new Error(
      `Detached run started, but metadata is incomplete. Output was:\n${output}`,
    );
  }

  return metadata as DetachedRunMetadata;
}
