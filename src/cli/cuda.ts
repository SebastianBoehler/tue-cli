import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import { buildPoolCommand } from "../ssh";
import { promptInput, selectMenuOption, supportsInteractivePrompts } from "../ui";
import { execute, executeCapture } from "./execution";
import { ensureMachine } from "./helpers";
import {
  buildCudaInfoRemoteCommand,
  buildCudaListRemoteCommand,
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
  cudaDevices: string | undefined,
  options?: CommandRuntimeOptions,
): void {
  const machine = ensureMachine(config.machine);
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

export async function runCudaSelect(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = machineOverride
    ? ensureMachine(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();
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
