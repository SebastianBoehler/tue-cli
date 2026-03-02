import type { ResolvedConfig } from "../config";
import { sanitizeMachineName } from "../machines";

export function printActiveIdentity(config: ResolvedConfig): void {
  console.log(`tue-cli active identity: ${config.user}@${config.gateway}`);
}

export function parseTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function getCurrentDirectoryName(): string {
  const pwd = Bun.env.PWD;

  if (!pwd) {
    return "project";
  }

  const normalized = pwd.replace(/\/+$/, "");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];

  return last || "project";
}

export function hasLocalBinary(binary: string): boolean {
  const result = Bun.spawnSync(["sh", "-lc", `command -v ${binary} >/dev/null 2>&1`], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  }) as { exitCode: number };

  return result.exitCode === 0;
}

export function ensureRemoteCommand(cmd: string | undefined): string {
  if (!cmd) {
    throw new Error('Missing command. Pass --cmd "<command>".');
  }

  return cmd;
}

export function ensureMachine(machine: string | undefined): string {
  if (!machine) {
    throw new Error("Missing machine. Pass --machine or select one interactively.");
  }

  return sanitizeMachineName(machine);
}

export function parseDisplayToken(token: string): string {
  const normalized = token.startsWith(":") ? token.slice(1) : token;

  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      `Invalid display token: ${token}. Use a number like 7 or :7.`,
    );
  }

  return normalized;
}

export function validateVncDisplay(display: number): void {
  if (display < 0 || display > 10) {
    throw new Error(
      `Invalid display ${display}. Allowed display range is 0..10 (ports 5900..5910).`,
    );
  }
}

export function validateLocalPort(localPort: number): void {
  if (localPort < 1025 || localPort > 65535) {
    throw new Error(
      `Invalid local-port ${localPort}. Choose a local port between 1025 and 65535.`,
    );
  }
}

export function getVncRemotePort(display: number): number {
  return 5900 + display;
}
