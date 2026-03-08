import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import { buildPoolCommand } from "../ssh";
import { promptInput, selectMenuOption, supportsInteractivePrompts } from "../ui";
import { execute, executeCapture } from "./execution";
import { ensureMachine } from "./helpers";
import {
  buildCudaBenchmarkRemoteCommand,
  buildCudaInfoRemoteCommand,
  buildCudaListRemoteCommand,
  buildCudaProfileRemoteCommand,
  buildCudaVerifyRemoteCommand,
  normalizeCudaDevices,
  resolveCudaDevices,
} from "./settings";
import { selectMachine } from "./user";
import type { CommandRuntimeOptions, FlagMap } from "./types";

type CudaGpuInfo = {
  index: number;
  name: string;
  memoryTotalMiB?: number;
  memoryUsedMiB?: number;
  utilizationPercent?: number;
};

function applyCudaDevicesToCommand(
  remoteCommand: string,
  cudaDevices: string | undefined,
): string {
  if (!cudaDevices) {
    return remoteCommand;
  }

  return `CUDA_VISIBLE_DEVICES=${cudaDevices} ${remoteCommand}`;
}

function parseCudaGpuLine(line: string): CudaGpuInfo | undefined {
  const parts = line.split(",").map((part) => part.trim());
  if (parts.length < 2) {
    return undefined;
  }

  const index = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(index)) {
    return undefined;
  }

  const parseOptionalInt = (value: string | undefined): number | undefined => {
    if (!value) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    index,
    name: parts[1],
    memoryTotalMiB: parseOptionalInt(parts[2]),
    memoryUsedMiB: parseOptionalInt(parts[3]),
    utilizationPercent: parseOptionalInt(parts[4]),
  };
}

function parseCudaGpuList(output: string): CudaGpuInfo[] {
  return output
    .split("\n")
    .map((line) => parseCudaGpuLine(line))
    .filter((gpu): gpu is CudaGpuInfo => gpu !== undefined)
    .sort((left, right) => left.index - right.index);
}

function resolveTargetMachine(
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

function parsePositiveIntegerFlag(
  rawValue: string | undefined,
  flagName: string,
  minimum = 1,
): number | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid ${flagName}: use an integer >= ${minimum}.`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    if (minimum <= 0) {
      throw new Error(`Invalid ${flagName}: use an integer >= ${minimum}.`);
    }
    throw new Error(`Invalid ${flagName}: use an integer >= ${minimum}.`);
  }

  return parsed;
}

function parseBooleanFlag(
  rawValue: string | undefined,
  flagName: string,
): boolean | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Invalid ${flagName}: use true|false (or 1|0, yes|no, on|off).`,
  );
}

function executeCudaCommand(
  config: ResolvedConfig,
  machine: string,
  remoteCommand: string,
  cudaDevices: string | undefined,
  options?: CommandRuntimeOptions,
): void {
  warnOnRestrictedMachine(machine);
  execute(
    buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: applyCudaDevicesToCommand(remoteCommand, cudaDevices),
    }),
    config.dryRun,
    options,
  );
}

export async function runCudaInfo(
  config: ResolvedConfig,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveTargetMachine(config, machineOverride);
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
  cudaDevices: string | undefined,
  options?: CommandRuntimeOptions,
): void {
  const machine = ensureMachine(config.machine);
  executeCudaCommand(config, machine, remoteCommand, cudaDevices, options);
}

export async function runCudaSelect(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveTargetMachine(config, machineOverride);
  warnOnRestrictedMachine(machine);

  const listCommand = buildPoolCommand({
    username: config.user,
    gateway: config.gateway,
    machine,
    remoteCommand: buildCudaListRemoteCommand(),
  });

  if (config.dryRun) {
    execute(listCommand, true, options);
    return;
  }

  const output = executeCapture(listCommand, false);
  const gpus = parseCudaGpuList(output);

  if (gpus.length === 0) {
    throw new Error(`No GPUs detected on ${machine}.`);
  }

  if (!supportsInteractivePrompts()) {
    console.log("Detected GPUs:");
    for (const gpu of gpus) {
      const memoryPart =
        gpu.memoryTotalMiB !== undefined && gpu.memoryUsedMiB !== undefined
          ? `MEM ${gpu.memoryUsedMiB}/${gpu.memoryTotalMiB} MiB`
          : "MEM n/a";
      const utilPart =
        gpu.utilizationPercent !== undefined
          ? `UTIL ${gpu.utilizationPercent}%`
          : "UTIL n/a";
      console.log(
        `  - GPU ${gpu.index}: ${gpu.name} | ${memoryPart} | ${utilPart}`,
      );
    }
    console.log(
      "Set CUDA_VISIBLE_DEVICES manually or use --cuda-devices for tue run/remote run.",
    );
    return;
  }

  const preselected = resolveCudaDevices(flags, Bun.env);
  const selected = await selectMenuOption(
    "Select GPU (CUDA_VISIBLE_DEVICES)",
    [
      ...gpus.map((gpu) => {
        const memoryPart =
          gpu.memoryTotalMiB !== undefined && gpu.memoryUsedMiB !== undefined
            ? `MEM ${gpu.memoryUsedMiB}/${gpu.memoryTotalMiB} MiB`
            : "MEM n/a";
        const utilPart =
          gpu.utilizationPercent !== undefined
            ? `UTIL ${gpu.utilizationPercent}%`
            : "UTIL n/a";
        return {
          value: String(gpu.index),
          label: `GPU ${gpu.index} | ${gpu.name} | ${memoryPart} | ${utilPart}`,
        };
      }),
      {
        value: "__manual__",
        label: "Manual entry (comma list)",
      },
    ],
    preselected && gpus.some((gpu) => String(gpu.index) === preselected)
      ? preselected
      : String(gpus[0].index),
  );

  const selectedDevices =
    selected === "__manual__"
      ? normalizeCudaDevices(
          await promptInput("CUDA_VISIBLE_DEVICES (e.g. 0 or 0,1)"),
        )
      : selected;

  if (!selectedDevices) {
    throw new Error("No CUDA devices selected.");
  }

  console.log(`Selected CUDA_VISIBLE_DEVICES=${selectedDevices}`);
  console.log(
    `Use with run: tue run . --cmd "<your command>" --cuda-devices ${selectedDevices}`,
  );
  console.log(
    `Use with remote run: tue remote run --machine ${machine} --cmd "<your command>" --cuda-devices ${selectedDevices}`,
  );
}

export async function runCudaVerify(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveTargetMachine(config, machineOverride);
  const remoteCommand = buildCudaVerifyRemoteCommand({
    command: flags.cmd,
    workdir: flags.workdir,
  });
  executeCudaCommand(
    config,
    machine,
    remoteCommand,
    resolveCudaDevices(flags, Bun.env),
    options,
  );
}

export async function runCudaProfile(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveTargetMachine(config, machineOverride);
  const remoteCommand = buildCudaProfileRemoteCommand({
    command: flags.cmd,
    workdir: flags.workdir,
    binaryPath: flags["nsys-bin"],
    outputPrefix: flags["nsys-output"],
    trace: flags["nsys-trace"],
    stats: parseBooleanFlag(flags["nsys-stats"], "nsys-stats"),
    exportSqlite: parseBooleanFlag(flags["nsys-sqlite"], "nsys-sqlite"),
  });
  executeCudaCommand(
    config,
    machine,
    remoteCommand,
    resolveCudaDevices(flags, Bun.env),
    options,
  );
}

export async function runCudaBenchmark(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = await resolveTargetMachine(config, machineOverride);
  const remoteCommand = buildCudaBenchmarkRemoteCommand({
    command: flags.cmd,
    workdir: flags.workdir,
    runs: parsePositiveIntegerFlag(flags.runs, "runs", 1),
    warmup: parsePositiveIntegerFlag(flags.warmup, "warmup", 0),
  });
  executeCudaCommand(
    config,
    machine,
    remoteCommand,
    resolveCudaDevices(flags, Bun.env),
    options,
  );
}
