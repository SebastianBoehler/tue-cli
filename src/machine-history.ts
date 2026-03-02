import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sanitizeMachineName } from "./machines";

export type MachineHistoryStore = {
  version: 1;
  recentMachines: string[];
};

type EnvLike = Record<string, string | undefined>;

const DEFAULT_MAX_RECENT_MACHINES = 20;

function dedupeMachines(machines: string[]): string[] {
  const normalized = machines.map((machine) => sanitizeMachineName(machine));
  return [...new Set(normalized)];
}

export function getMachineHistoryPath(env: EnvLike = Bun.env): string {
  const home = env.HOME;
  const xdgConfigHome = env.XDG_CONFIG_HOME;

  if (!home && !xdgConfigHome) {
    return ".tue-cli-machines.json";
  }

  const configRoot = xdgConfigHome ?? join(home as string, ".config");
  return join(configRoot, "tue-cli", "machines.json");
}

export function loadMachineHistory(
  env: EnvLike = Bun.env,
): MachineHistoryStore {
  const path = getMachineHistoryPath(env);

  if (!existsSync(path)) {
    return {
      version: 1,
      recentMachines: [],
    };
  }

  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<MachineHistoryStore>;
    const recentMachines = dedupeMachines(
      Array.isArray(parsed.recentMachines) ? parsed.recentMachines : [],
    );

    return {
      version: 1,
      recentMachines,
    };
  } catch {
    return {
      version: 1,
      recentMachines: [],
    };
  }
}

export function saveMachineHistory(
  data: MachineHistoryStore,
  env: EnvLike = Bun.env,
): MachineHistoryStore {
  const path = getMachineHistoryPath(env);
  const recentMachines = dedupeMachines(data.recentMachines).slice(
    0,
    DEFAULT_MAX_RECENT_MACHINES,
  );

  const normalized: MachineHistoryStore = {
    version: 1,
    recentMachines,
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function rememberMachine(
  machine: string,
  env: EnvLike = Bun.env,
): MachineHistoryStore {
  const normalizedMachine = sanitizeMachineName(machine);
  const current = loadMachineHistory(env);

  return saveMachineHistory(
    {
      version: 1,
      recentMachines: [
        normalizedMachine,
        ...current.recentMachines.filter((item) => item !== normalizedMachine),
      ],
    },
    env,
  );
}
