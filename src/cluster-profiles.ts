import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sanitizeMachineName } from "./machines";

export type ClusterProfile = {
  name: string;
  gateway: string;
  machines: string[];
  defaultMachine?: string;
  remoteRoot?: string;
  vncVm?: string;
};

export type ClusterProfileStore = {
  version: 1;
  clusters: ClusterProfile[];
  defaultCluster?: string;
};

type EnvLike = Record<string, string | undefined>;

function normalizeName(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    throw new Error(`Invalid cluster name: ${input}`);
  }
  return normalized;
}

function normalizeGateway(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    throw new Error(`Invalid gateway: ${input}`);
  }
  return trimmed;
}

function normalizeMachines(machines: string[]): string[] {
  return [...new Set(machines.map((machine) => sanitizeMachineName(machine)))];
}

function normalizeProfile(profile: ClusterProfile): ClusterProfile {
  const machines = normalizeMachines(profile.machines);
  const defaultMachine = profile.defaultMachine
    ? sanitizeMachineName(profile.defaultMachine)
    : machines[0];

  if (defaultMachine && !machines.includes(defaultMachine)) {
    throw new Error("Default machine must be included in cluster machines.");
  }

  return {
    name: normalizeName(profile.name),
    gateway: normalizeGateway(profile.gateway),
    machines,
    defaultMachine,
    remoteRoot: profile.remoteRoot?.trim() || undefined,
    vncVm: profile.vncVm?.trim() || undefined,
  };
}

export function getClusterProfileStorePath(env: EnvLike = Bun.env): string {
  const home = env.HOME;
  const xdgConfigHome = env.XDG_CONFIG_HOME;

  if (!home && !xdgConfigHome) {
    return ".tue-cli-clusters.json";
  }

  const configRoot = xdgConfigHome ?? join(home as string, ".config");
  return join(configRoot, "tue-cli", "clusters.json");
}

export function loadClusterProfiles(env: EnvLike = Bun.env): ClusterProfileStore {
  const path = getClusterProfileStorePath(env);

  if (!existsSync(path)) {
    return { version: 1, clusters: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ClusterProfileStore>;
    const clusters = Array.isArray(parsed.clusters)
      ? parsed.clusters.map((profile) => normalizeProfile(profile))
      : [];
    const defaultCluster =
      typeof parsed.defaultCluster === "string" &&
      clusters.some((profile) => profile.name === parsed.defaultCluster)
        ? parsed.defaultCluster
        : clusters[0]?.name;

    return { version: 1, clusters, defaultCluster };
  } catch {
    return { version: 1, clusters: [] };
  }
}

export function saveClusterProfiles(
  data: ClusterProfileStore,
  env: EnvLike = Bun.env,
): ClusterProfileStore {
  const path = getClusterProfileStorePath(env);
  const clusters = data.clusters.map((profile) => normalizeProfile(profile));
  const defaultCluster =
    data.defaultCluster && clusters.some((profile) => profile.name === data.defaultCluster)
      ? data.defaultCluster
      : clusters[0]?.name;
  const normalized = { version: 1 as const, clusters, defaultCluster };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function saveClusterProfile(
  profile: ClusterProfile,
  env: EnvLike = Bun.env,
): ClusterProfileStore {
  const normalized = normalizeProfile(profile);
  const current = loadClusterProfiles(env);
  return saveClusterProfiles({
    version: 1,
    clusters: [
      normalized,
      ...current.clusters.filter((existing) => existing.name !== normalized.name),
    ],
    defaultCluster: normalized.name,
  }, env);
}

export function setDefaultClusterProfile(
  name: string,
  env: EnvLike = Bun.env,
): ClusterProfileStore {
  const normalizedName = normalizeName(name);
  const current = loadClusterProfiles(env);

  if (!current.clusters.some((profile) => profile.name === normalizedName)) {
    throw new Error(`Unknown cluster profile: ${name}`);
  }

  return saveClusterProfiles({ ...current, defaultCluster: normalizedName }, env);
}

export function getClusterProfile(
  name: string,
  env: EnvLike = Bun.env,
): ClusterProfile | undefined {
  const normalizedName = normalizeName(name);
  return loadClusterProfiles(env).clusters.find((profile) => profile.name === normalizedName);
}

export function getDefaultClusterProfile(env: EnvLike = Bun.env): ClusterProfile | undefined {
  const store = loadClusterProfiles(env);
  return store.clusters.find((profile) => profile.name === store.defaultCluster);
}
