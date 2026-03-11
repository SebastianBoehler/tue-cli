import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type KernelResearchRunRecord = {
  id: string;
  manifestPath: string;
  runRoot: string;
  projectRoot: string;
  machine: string;
  editablePaths: string[];
  startedAt: string;
};

export type KernelResearchRunStore = {
  version: 1;
  runs: KernelResearchRunRecord[];
};

type EnvLike = Record<string, string | undefined>;

const MAX_STORED_RUNS = 200;

function normalizeString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Kernel research run fields cannot be empty.");
  }
  return trimmed;
}

function normalizeRecord(
  record: KernelResearchRunRecord,
): KernelResearchRunRecord {
  return {
    id: normalizeString(record.id),
    manifestPath: normalizeString(record.manifestPath),
    runRoot: normalizeString(record.runRoot),
    projectRoot: normalizeString(record.projectRoot),
    machine: normalizeString(record.machine).toLowerCase(),
    editablePaths: [...new Set(record.editablePaths.map((value) => normalizeString(value)))],
    startedAt: normalizeString(record.startedAt),
  };
}

function isValidRecord(record: unknown): record is KernelResearchRunRecord {
  if (!record || typeof record !== "object") {
    return false;
  }

  const candidate = record as Partial<KernelResearchRunRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.manifestPath === "string" &&
    typeof candidate.runRoot === "string" &&
    typeof candidate.projectRoot === "string" &&
    typeof candidate.machine === "string" &&
    Array.isArray(candidate.editablePaths) &&
    candidate.editablePaths.every((value) => typeof value === "string") &&
    typeof candidate.startedAt === "string"
  );
}

function dedupeRuns(
  runs: KernelResearchRunRecord[],
): KernelResearchRunRecord[] {
  const seen = new Set<string>();
  const normalized: KernelResearchRunRecord[] = [];

  for (const run of runs) {
    if (seen.has(run.id)) {
      continue;
    }

    seen.add(run.id);
    normalized.push(run);
  }

  return normalized;
}

export function getKernelResearchRunStorePath(
  env: EnvLike = Bun.env,
): string {
  const home = env.HOME;
  const xdgConfigHome = env.XDG_CONFIG_HOME;

  if (!home && !xdgConfigHome) {
    return ".tue-cli-kernel-research.json";
  }

  const configRoot = xdgConfigHome ?? join(home as string, ".config");
  return join(configRoot, "tue-cli", "kernel-research-runs.json");
}

export function loadKernelResearchRuns(
  env: EnvLike = Bun.env,
): KernelResearchRunStore {
  const path = getKernelResearchRunStorePath(env);

  if (!existsSync(path)) {
    return {
      version: 1,
      runs: [],
    };
  }

  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<KernelResearchRunStore>;
    const runs = Array.isArray(parsed.runs)
      ? parsed.runs
          .filter((record) => isValidRecord(record))
          .map((record) => normalizeRecord(record))
      : [];

    return {
      version: 1,
      runs: dedupeRuns(runs).slice(0, MAX_STORED_RUNS),
    };
  } catch {
    return {
      version: 1,
      runs: [],
    };
  }
}

export function saveKernelResearchRuns(
  store: KernelResearchRunStore,
  env: EnvLike = Bun.env,
): KernelResearchRunStore {
  const path = getKernelResearchRunStorePath(env);
  const normalized: KernelResearchRunStore = {
    version: 1,
    runs: dedupeRuns(store.runs.map((run) => normalizeRecord(run))).slice(
      0,
      MAX_STORED_RUNS,
    ),
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function rememberKernelResearchRun(
  record: KernelResearchRunRecord,
  env: EnvLike = Bun.env,
): KernelResearchRunStore {
  const normalized = normalizeRecord(record);
  const current = loadKernelResearchRuns(env);
  return saveKernelResearchRuns(
    {
      version: 1,
      runs: [
        normalized,
        ...current.runs.filter((run) => run.id !== normalized.id),
      ],
    },
    env,
  );
}

export function findKernelResearchRun(
  id: string,
  env: EnvLike = Bun.env,
): KernelResearchRunRecord | undefined {
  const target = id.trim();
  if (!target) {
    return undefined;
  }

  return loadKernelResearchRuns(env).runs.find((run) => run.id === target);
}
