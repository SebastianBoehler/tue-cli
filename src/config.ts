import { DEFAULT_GATEWAY } from "./machines";
import {
  getClusterProfile,
  getDefaultClusterProfile,
  type ClusterProfile,
} from "./cluster-profiles";

export type ResolvedConfig = {
  user: string;
  gateway: string;
  machine?: string;
  display: number;
  vncVm?: string;
  localPort: number;
  dryRun: boolean;
  remoteRoot?: string;
  cluster?: Pick<ClusterProfile, "name" | "machines">;
};

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePositiveInt(input: string, fieldName: string): number {
  const parsed = Number.parseInt(input, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${input}`);
  }

  return parsed;
}

function parseNonNegativeInt(input: string, fieldName: string): number {
  const parsed = Number.parseInt(input, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${fieldName}: ${input}`);
  }

  return parsed;
}

function parseVncVm(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }

  const trimmed = input.trim();

  if (!trimmed) {
    return undefined;
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error(
      `Invalid vnc-vm: ${input}. Use a simple token like plasma, xfce, or gnome.`,
    );
  }

  return trimmed;
}

export function resolveConfig(
  flags: Record<string, string>,
  env: Record<string, string | undefined>
): ResolvedConfig {
  const cluster = flags.cluster
    ? getClusterProfile(flags.cluster, env)
    : env.TUE_CLUSTER
      ? getClusterProfile(env.TUE_CLUSTER, env)
      : getDefaultClusterProfile(env);

  if ((flags.cluster || env.TUE_CLUSTER) && !cluster) {
    throw new Error(`Unknown cluster profile: ${flags.cluster ?? env.TUE_CLUSTER}`);
  }

  const user = flags.user ?? env.TUE_USER;

  if (!user) {
    throw new Error("Missing username. Pass --user or set TUE_USER.");
  }

  const gateway = flags.gateway ?? env.TUE_GATEWAY ?? cluster?.gateway ?? DEFAULT_GATEWAY;
  const machine = flags.machine ?? env.TUE_MACHINE ?? cluster?.defaultMachine;

  const displayRaw = flags.display ?? env.TUE_DISPLAY ?? "1";
  const display = parseNonNegativeInt(displayRaw, "display");
  const vncVm = parseVncVm(flags["vnc-vm"] ?? env.TUE_VNC_VM ?? cluster?.vncVm);
  const remoteRoot = flags["remote-root"] ?? env.TUE_REMOTE_ROOT ?? cluster?.remoteRoot;

  const localPortRaw = flags["local-port"] ?? env.TUE_LOCAL_PORT;
  const localPort = localPortRaw
    ? parsePositiveInt(localPortRaw, "local-port")
    : 5900 + display;

  const dryRun = parseBoolean(flags["dry-run"] ?? env.TUE_DRY_RUN);

  return {
    user,
    gateway,
    machine,
    display,
    vncVm,
    localPort,
    dryRun,
    remoteRoot,
    cluster: cluster
      ? { name: cluster.name, machines: cluster.machines }
      : undefined,
  };
}
