import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type DetachedRunRecord = {
  id: string;
  user: string;
  gateway: string;
  machine: string;
  projectPath: string;
  logPath: string;
  pid: number;
  command: string;
  startedAt: string;
};

export type RunHistoryStore = {
  version: 1;
  runs: DetachedRunRecord[];
};

type EnvLike = Record<string, string | undefined>;

const MAX_STORED_RUNS = 200;

function normalizeRecord(record: DetachedRunRecord): DetachedRunRecord {
  return {
    ...record,
    id: record.id.trim(),
    user: record.user.trim(),
    gateway: record.gateway.trim(),
    machine: record.machine.trim().toLowerCase(),
    projectPath: record.projectPath.trim(),
    logPath: record.logPath.trim(),
    pid: Number.isFinite(record.pid) ? record.pid : -1,
    command: record.command.trim(),
    startedAt: record.startedAt.trim(),
  };
}

function isValidRecord(record: unknown): record is DetachedRunRecord {
  if (!record || typeof record !== "object") {
    return false;
  }

  const candidate = record as Partial<DetachedRunRecord>;

  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.user === "string" &&
    candidate.user.trim().length > 0 &&
    typeof candidate.gateway === "string" &&
    candidate.gateway.trim().length > 0 &&
    typeof candidate.machine === "string" &&
    candidate.machine.trim().length > 0 &&
    typeof candidate.projectPath === "string" &&
    candidate.projectPath.trim().length > 0 &&
    typeof candidate.logPath === "string" &&
    candidate.logPath.trim().length > 0 &&
    typeof candidate.pid === "number" &&
    Number.isFinite(candidate.pid) &&
    candidate.pid > 0 &&
    typeof candidate.command === "string" &&
    candidate.command.trim().length > 0 &&
    typeof candidate.startedAt === "string" &&
    candidate.startedAt.trim().length > 0
  );
}

function dedupeRuns(runs: DetachedRunRecord[]): DetachedRunRecord[] {
  const seen = new Set<string>();
  const deduped: DetachedRunRecord[] = [];

  for (const run of runs) {
    if (seen.has(run.id)) {
      continue;
    }

    seen.add(run.id);
    deduped.push(run);
  }

  return deduped;
}

export function getRunHistoryPath(env: EnvLike = Bun.env): string {
  const home = env.HOME;
  const xdgConfigHome = env.XDG_CONFIG_HOME;

  if (!home && !xdgConfigHome) {
    return ".tue-cli-runs.json";
  }

  const configRoot = xdgConfigHome ?? join(home as string, ".config");
  return join(configRoot, "tue-cli", "runs.json");
}

export function loadRunHistory(env: EnvLike = Bun.env): RunHistoryStore {
  const path = getRunHistoryPath(env);

  if (!existsSync(path)) {
    return {
      version: 1,
      runs: [],
    };
  }

  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<RunHistoryStore>;
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

export function saveRunHistory(
  store: RunHistoryStore,
  env: EnvLike = Bun.env,
): RunHistoryStore {
  const path = getRunHistoryPath(env);

  const normalized: RunHistoryStore = {
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

export function rememberDetachedRun(
  run: DetachedRunRecord,
  env: EnvLike = Bun.env,
): RunHistoryStore {
  const normalized = normalizeRecord(run);
  const current = loadRunHistory(env);

  return saveRunHistory(
    {
      version: 1,
      runs: [
        normalized,
        ...current.runs.filter((existing) => existing.id !== normalized.id),
      ],
    },
    env,
  );
}

export function findDetachedRun(
  id: string,
  env: EnvLike = Bun.env,
): DetachedRunRecord | undefined {
  const target = id.trim();
  if (!target) {
    return undefined;
  }

  return loadRunHistory(env).runs.find((run) => run.id === target);
}

export function findLatestDetachedRun(
  filter: {
    user?: string;
    machine?: string;
  },
  env: EnvLike = Bun.env,
): DetachedRunRecord | undefined {
  const user = filter.user?.trim();
  const machine = filter.machine?.trim().toLowerCase();

  return loadRunHistory(env).runs.find((run) => {
    if (user && run.user !== user) {
      return false;
    }

    if (machine && run.machine !== machine) {
      return false;
    }

    return true;
  });
}
