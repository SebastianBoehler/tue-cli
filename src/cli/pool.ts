import type { ResolvedConfig } from "../config";
import {
  POOL_MACHINES,
  classifyMachine,
  printMachinePolicySummary,
  sanitizeMachineName,
} from "../machines";
import {
  buildPoolCommand,
  buildPoolSmiRemoteCommand,
  buildPoolSmiSnapshotRemoteCommand,
} from "../ssh";
import { formatPoolMachineStatus, parsePoolSmiSnapshot } from "../pool-smi";
import { selectMenuOption, supportsInteractivePrompts } from "../ui";
import { execute, executeCapture } from "./execution";

function getPoolSmiCandidateMachines(preferredMachine: string | undefined): string[] {
  const preferred = preferredMachine
    ? sanitizeMachineName(preferredMachine)
    : undefined;

  if (!preferred || classifyMachine(preferred) !== "pool") {
    return [...POOL_MACHINES];
  }

  return [preferred, ...POOL_MACHINES.filter((machine) => machine !== preferred)];
}

function buildLivePoolSmiCommand(config: ResolvedConfig, machine: string): string {
  return buildPoolCommand({
    username: config.user,
    gateway: config.gateway,
    machine,
    remoteCommand: buildPoolSmiRemoteCommand(),
    tty: true,
  });
}

function buildSnapshotPoolSmiCommand(config: ResolvedConfig, machine: string): string {
  return buildPoolCommand({
    username: config.user,
    gateway: config.gateway,
    machine,
    remoteCommand: buildPoolSmiSnapshotRemoteCommand(),
  });
}

export function buildPoolSmiSelectorCommandWithFallback(config: ResolvedConfig): string {
  const candidates = getPoolSmiCandidateMachines(config.machine);
  const attempts = candidates.map((machine) =>
    `(${buildLivePoolSmiCommand(config, machine)})`,
  );

  return `${attempts.join(" || ")} || { echo 'tue-cli error: could not run pool-smi on any known pool machine.' >&2; exit 1; }`;
}

function runLivePoolSmiWithFallback(config: ResolvedConfig): void {
  const candidates = getPoolSmiCandidateMachines(config.machine);
  const failures: string[] = [];

  if (config.dryRun) {
    execute(buildLivePoolSmiCommand(config, candidates[0]), true);
    return;
  }

  for (const machine of candidates) {
    try {
      execute(buildLivePoolSmiCommand(config, machine), false);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${machine}: ${message}`);
      console.warn(
        `tue-cli note: pool-smi via ${machine} failed, trying next pool machine...`,
      );
    }
  }

  throw new Error(
    `pool-smi failed on all known pool machines. Attempts:\n${failures.join("\n")}`,
  );
}

function runSnapshotPoolSmiWithFallback(config: ResolvedConfig): string {
  const candidates = getPoolSmiCandidateMachines(config.machine);
  const failures: string[] = [];

  if (config.dryRun) {
    execute(buildSnapshotPoolSmiCommand(config, candidates[0]), true);
    return "";
  }

  for (const machine of candidates) {
    try {
      return executeCapture(buildSnapshotPoolSmiCommand(config, machine), false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${machine}: ${message}`);
      console.warn(
        `tue-cli note: pool-smi snapshot via ${machine} failed, trying next pool machine...`,
      );
    }
  }

  throw new Error(
    `pool-smi snapshot failed on all known pool machines. Attempts:\n${failures.join("\n")}`,
  );
}

export async function runMachineList(
  config: ResolvedConfig,
  options?: { live?: boolean },
): Promise<void> {
  printMachinePolicySummary();

  if (options?.live) {
    runLivePoolSmiWithFallback(config);
    return;
  }

  const snapshotOutput = runSnapshotPoolSmiWithFallback(config);
  if (config.dryRun) {
    return;
  }
  const parsed = parsePoolSmiSnapshot(snapshotOutput);

  if (parsed.length === 0) {
    console.warn(
      "tue-cli note: could not parse pool-smi snapshot. Falling back to live stream.",
    );
    runLivePoolSmiWithFallback(config);
    return;
  }

  if (!supportsInteractivePrompts()) {
    console.log("Pool machine status snapshot:");
    for (const entry of parsed) {
      console.log(`  - ${formatPoolMachineStatus(entry)}`);
    }
    return;
  }

  const selected = await selectMenuOption(
    "Pool machine status snapshot (arrow keys)",
    [
      ...parsed.map((entry) => ({
        value: entry.machine,
        label: formatPoolMachineStatus(entry),
      })),
      {
        value: "__live__",
        label: "Open raw live pool-smi stream",
      },
      {
        value: "__exit__",
        label: "Done",
      },
    ],
    parsed[0].machine,
  );

  if (selected === "__live__") {
    runLivePoolSmiWithFallback(config);
    return;
  }

  if (selected === "__exit__") {
    return;
  }

  const selectedEntry = parsed.find((entry) => entry.machine === selected);

  if (selectedEntry) {
    console.log(`Selected: ${formatPoolMachineStatus(selectedEntry)}`);
  }
}
