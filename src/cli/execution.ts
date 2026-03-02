import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type ExecuteOptions = {
  logFile?: string;
};

function escapeForSingleQuotes(input: string): string {
  return input.replace(/'/g, "'\\''");
}

function quoteForShellSingle(input: string): string {
  return `'${escapeForSingleQuotes(input)}'`;
}

function wrapCommandWithTee(command: string, logFilePath: string): string {
  return `set -o pipefail; { ${command}; } 2>&1 | tee -a ${quoteForShellSingle(logFilePath)}`;
}

function prepareLogFile(logFilePath: string, command: string): void {
  mkdirSync(dirname(logFilePath), { recursive: true });
  appendFileSync(
    logFilePath,
    `\n### ${new Date().toISOString()} ###\n$ ${command}\n`,
    "utf8",
  );
}

export function execute(
  command: string,
  dryRun: boolean,
  options?: ExecuteOptions,
): never | void {
  if (dryRun) {
    console.log(command);
    return;
  }

  const logFile = options?.logFile;
  const shell = logFile ? "bash" : "sh";
  const runnableCommand = logFile
    ? wrapCommandWithTee(command, logFile)
    : command;

  if (logFile) {
    prepareLogFile(logFile, command);
  }

  const result = Bun.spawnSync([shell, "-lc", runnableCommand], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }) as { exitCode: number };

  if (result.exitCode === 0) {
    return;
  }

  throw new Error(`Command failed with exit code ${result.exitCode}`);
}

export function executeAll(
  commands: string[],
  dryRun: boolean,
  options?: ExecuteOptions,
): void {
  for (const command of commands) {
    execute(command, dryRun, options);
  }
}

export function executeCapture(command: string, dryRun: boolean): string {
  if (dryRun) {
    console.log(command);
    return "";
  }

  const result = Bun.spawnSync(["sh", "-lc", command], {
    stdin: "inherit",
    stdout: "pipe",
    stderr: "inherit",
  }) as { exitCode: number; stdout?: Uint8Array };

  if (result.exitCode === 0) {
    return result.stdout
      ? new TextDecoder().decode(result.stdout).trim()
      : "";
  }

  throw new Error(`Command failed with exit code ${result.exitCode}`);
}
