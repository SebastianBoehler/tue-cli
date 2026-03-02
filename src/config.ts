import { DEFAULT_GATEWAY } from "./machines";

export type ResolvedConfig = {
  user: string;
  gateway: string;
  machine?: string;
  display: number;
  localPort: number;
  dryRun: boolean;
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

export function resolveConfig(
  flags: Record<string, string>,
  env: Record<string, string | undefined>
): ResolvedConfig {
  const user = flags.user ?? env.TUE_USER;

  if (!user) {
    throw new Error("Missing username. Pass --user or set TUE_USER.");
  }

  const gateway = flags.gateway ?? env.TUE_GATEWAY ?? DEFAULT_GATEWAY;
  const machine = flags.machine ?? env.TUE_MACHINE;

  const displayRaw = flags.display ?? env.TUE_DISPLAY ?? "1";
  const display = parseNonNegativeInt(displayRaw, "display");

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
    localPort,
    dryRun,
  };
}
