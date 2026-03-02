export type PoolMachineStatus = {
  machine: string;
  gpuCount: number;
  usedMiB: number;
  totalMiB: number;
  maxGpuUtilPercent: number;
  totalPowerW: number;
  primaryGpuModel?: string;
};

function stripAnsi(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "");
}

function parseGpuLine(line: string): {
  model?: string;
  usedMiB?: number;
  totalMiB?: number;
  gpuUtilPercent?: number;
  powerW?: number;
} {
  const gpuPrefix = line.match(/^\s*\d+:\s*(.*)$/);

  if (!gpuPrefix) {
    return {};
  }

  const remainder = gpuPrefix[1];
  const memMatch = remainder.match(/(\d+)\s*\/\s*(\d+)\s*MiB/);
  const utilMatch = remainder.match(/\)\s*(\d+)\s*%/);
  const powerMatch = remainder.match(/(\d+)\s*W\b/);

  let model: string | undefined;
  if (memMatch) {
    const modelPart = remainder.slice(0, memMatch.index).trim();
    model = modelPart || undefined;
  }

  return {
    model,
    usedMiB: memMatch ? Number.parseInt(memMatch[1], 10) : undefined,
    totalMiB: memMatch ? Number.parseInt(memMatch[2], 10) : undefined,
    gpuUtilPercent: utilMatch ? Number.parseInt(utilMatch[1], 10) : undefined,
    powerW: powerMatch ? Number.parseInt(powerMatch[1], 10) : undefined,
  };
}

export function parsePoolSmiSnapshot(output: string): PoolMachineStatus[] {
  const cleaned = stripAnsi(output).replace(/\r/g, "\n");
  const lines = cleaned.split("\n");
  const statusByMachine = new Map<string, PoolMachineStatus>();
  let currentMachine: string | undefined;

  for (const line of lines) {
    const machineHeader = line.match(/^\s*([a-z][a-z0-9-]+)\s+MEM\s+GPU\b/i);

    if (machineHeader) {
      currentMachine = machineHeader[1];

      if (!statusByMachine.has(currentMachine)) {
        statusByMachine.set(currentMachine, {
          machine: currentMachine,
          gpuCount: 0,
          usedMiB: 0,
          totalMiB: 0,
          maxGpuUtilPercent: 0,
          totalPowerW: 0,
        });
      }
      continue;
    }

    if (!currentMachine) {
      continue;
    }

    const gpu = parseGpuLine(line);

    if (
      gpu.usedMiB === undefined &&
      gpu.totalMiB === undefined &&
      gpu.gpuUtilPercent === undefined &&
      gpu.powerW === undefined
    ) {
      continue;
    }

    const entry = statusByMachine.get(currentMachine);
    if (!entry) {
      continue;
    }

    entry.gpuCount += 1;
    entry.usedMiB += gpu.usedMiB ?? 0;
    entry.totalMiB += gpu.totalMiB ?? 0;
    entry.maxGpuUtilPercent = Math.max(
      entry.maxGpuUtilPercent,
      gpu.gpuUtilPercent ?? 0,
    );
    entry.totalPowerW += gpu.powerW ?? 0;

    if (!entry.primaryGpuModel && gpu.model) {
      entry.primaryGpuModel = gpu.model;
    }
  }

  return [...statusByMachine.values()].sort((a, b) =>
    a.machine.localeCompare(b.machine),
  );
}

export function formatPoolMachineStatus(entry: PoolMachineStatus): string {
  const memPercent =
    entry.totalMiB > 0
      ? Math.round((entry.usedMiB / entry.totalMiB) * 100)
      : 0;
  const model = entry.primaryGpuModel ?? "GPU";
  return `${entry.machine} | ${entry.gpuCount} GPU | ${model} | MEM ${entry.usedMiB}/${entry.totalMiB} MiB (${memPercent}%) | GPU ${entry.maxGpuUtilPercent}% | PWR ${entry.totalPowerW}W`;
}
