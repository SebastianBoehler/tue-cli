import {
  ensureRemoteCommand,
  getCurrentDirectoryName,
  parseTruthy,
} from "./helpers";
import type { FlagMap } from "./types";

function escapeForSingleQuotes(input: string): string {
  return input.replace(/'/g, "'\\''");
}

function quoteForShellSingle(input: string): string {
  return `'${escapeForSingleQuotes(input)}'`;
}

function normalizeOptionalShellToken(
  value: string | undefined,
  label: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Invalid ${label}: value cannot be empty.`);
  }

  return normalized;
}

function normalizeRequiredShellToken(
  value: string | undefined,
  label: string,
): string {
  const normalized = normalizeOptionalShellToken(value, label);
  if (!normalized) {
    throw new Error(`Missing ${label}. Pass --${label} "<command>".`);
  }

  return normalized;
}

function wrapCudaUtilityCommand(command: string, workdir?: string): string {
  const workdirPrefix = workdir ? `cd ${quoteForShellSingle(workdir)} && ` : "";
  return `set -e; ${workdirPrefix}${command}`;
}

function normalizeRemoteRoot(remoteRoot: string): string {
  const trimmed = remoteRoot.trim().replace(/\/+$/, "");

  if (!trimmed) {
    throw new Error("Invalid remote root: path cannot be empty.");
  }

  if (trimmed === "~" || trimmed.startsWith("~/")) {
    return trimmed;
  }

  if (
    trimmed === "/home" ||
    trimmed.startsWith("/home/") ||
    trimmed === "/graphics/scratch2/students" ||
    trimmed.startsWith("/graphics/scratch2/students/") ||
    trimmed === "/graphics/scratch3/staff" ||
    trimmed.startsWith("/graphics/scratch3/staff/") ||
    trimmed === "/ceph" ||
    trimmed.startsWith("/ceph/") ||
    trimmed === "/var/tmp" ||
    trimmed.startsWith("/var/tmp/")
  ) {
    return trimmed;
  }

  throw new Error(
    "Invalid remote root: allowed roots are ~/..., /home/..., /graphics/scratch2/students/..., /graphics/scratch3/staff/..., /ceph/..., or /var/tmp/...",
  );
}

function resolveBuildPresetCommand(presetRaw: string): string {
  const preset = presetRaw.toLowerCase();

  if (preset === "debug") {
    return "cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build -j";
  }

  if (preset === "release") {
    return "cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j";
  }

  if (preset === "relwithdebinfo") {
    return "cmake -S . -B build -DCMAKE_BUILD_TYPE=RelWithDebInfo && cmake --build build -j";
  }

  throw new Error(
    `Unknown build preset: ${presetRaw}. Use debug | release | relwithdebinfo.`,
  );
}

export function normalizeCudaDevices(
  rawValue: string | undefined,
): string | undefined {
  if (!rawValue) {
    return undefined;
  }

  const compact = rawValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(",");

  if (!compact) {
    return undefined;
  }

  if (!/^\d+(,\d+)*$/.test(compact)) {
    throw new Error(
      `Invalid cuda-devices: ${rawValue}. Use values like 0 or 0,1.`,
    );
  }

  return compact;
}

export function resolveCudaDevices(
  parsedFlags: FlagMap,
  env: Record<string, string | undefined>,
): string | undefined {
  return normalizeCudaDevices(
    parsedFlags["cuda-devices"] ?? env.TUE_CUDA_VISIBLE_DEVICES,
  );
}

export function resolveBuildSettings(
  parsedFlags: FlagMap,
  localPath: string,
  env: Record<string, string | undefined>,
): {
  projectName?: string;
  remoteRoot: string;
  buildCommand: string;
  artifactPath: string;
  outputDir: string;
  keepRemote: boolean;
  noDownload: boolean;
} {
  const preset = parsedFlags.preset ?? env.TUE_BUILD_PRESET;
  const projectName =
    parsedFlags["project-name"] ??
    env.TUE_PROJECT_NAME ??
    (localPath === "." || localPath === "./"
      ? getCurrentDirectoryName()
      : undefined);

  const remoteRoot = normalizeRemoteRoot(
    parsedFlags["remote-root"] ?? env.TUE_REMOTE_ROOT ?? "~",
  );
  const buildCommand =
    parsedFlags["build-cmd"] ??
    env.TUE_BUILD_CMD ??
    (preset
      ? resolveBuildPresetCommand(preset)
      : "cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j");
  const artifactPath =
    parsedFlags["artifact-path"] ?? env.TUE_ARTIFACT_PATH ?? "build";
  const outputDir =
    parsedFlags["output-dir"] ?? env.TUE_BUILD_OUTPUT ?? "./.tue-artifacts";
  const keepRemote = parseTruthy(
    parsedFlags["keep-remote"] ?? env.TUE_KEEP_REMOTE,
  );
  const noDownload = parseTruthy(
    parsedFlags["no-download"] ?? env.TUE_NO_DOWNLOAD,
  );

  return {
    projectName,
    remoteRoot,
    buildCommand,
    artifactPath,
    outputDir,
    keepRemote,
    noDownload,
  };
}

export function resolveRunSettings(
  parsedFlags: FlagMap,
  localPath: string,
  env: Record<string, string | undefined>,
): {
  projectName?: string;
  remoteRoot: string;
  runCommand: string;
  cudaDevices?: string;
  keepRemote: boolean;
} {
  const projectName =
    parsedFlags["project-name"] ??
    env.TUE_PROJECT_NAME ??
    (localPath === "." || localPath === "./"
      ? getCurrentDirectoryName()
      : undefined);

  const remoteRoot = normalizeRemoteRoot(
    parsedFlags["remote-root"] ?? env.TUE_REMOTE_ROOT ?? "~",
  );
  const runCommand = ensureRemoteCommand(parsedFlags.cmd);
  const cudaDevices = resolveCudaDevices(parsedFlags, env);
  const keepRemote = parseTruthy(
    parsedFlags["keep-remote"] ?? env.TUE_KEEP_REMOTE,
  );

  return {
    projectName,
    remoteRoot,
    runCommand,
    cudaDevices,
    keepRemote,
  };
}

export function resolveSyncSettings(
  parsedFlags: FlagMap,
  localPath: string,
  env: Record<string, string | undefined>,
): {
  projectName?: string;
  remoteRoot: string;
  keepRemote: boolean;
} {
  const projectName =
    parsedFlags["project-name"] ??
    env.TUE_PROJECT_NAME ??
    (localPath === "." || localPath === "./"
      ? getCurrentDirectoryName()
      : undefined);

  const remoteRoot = normalizeRemoteRoot(
    parsedFlags["remote-root"] ?? env.TUE_REMOTE_ROOT ?? "~",
  );
  const keepRemote = parseTruthy(
    parsedFlags["keep-remote"] ?? env.TUE_KEEP_REMOTE,
  );

  return {
    projectName,
    remoteRoot,
    keepRemote,
  };
}

export function buildCudaInfoRemoteCommand(): string {
  return "echo '== Host ==' && hostname && echo && echo '== GPU Summary (nvidia-smi) ==' && (command -v nvidia-smi >/dev/null 2>&1 && (nvidia-smi --query-gpu=name,driver_version,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader 2>/dev/null || nvidia-smi) || echo 'nvidia-smi not found') && echo && echo '== CUDA Toolkit (nvcc) ==' && (command -v nvcc >/dev/null 2>&1 && nvcc --version || echo 'nvcc not found') && echo && echo '== Environment ==' && echo CUDA_HOME=${CUDA_HOME:-unset} && echo PATH=$PATH";
}

export function buildCudaListRemoteCommand(): string {
  return "if ! command -v nvidia-smi >/dev/null 2>&1; then echo 'nvidia-smi not found' >&2; exit 127; fi; nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu --format=csv,noheader,nounits";
}

export function buildCudaVerifyRemoteCommand(options?: {
  command?: string;
  workdir?: string;
}): string {
  const command = normalizeRequiredShellToken(options?.command, "cmd");
  const workdir = normalizeOptionalShellToken(options?.workdir, "workdir");
  return wrapCudaUtilityCommand(command, workdir);
}

export function buildCudaProfileRemoteCommand(options?: {
  command?: string;
  workdir?: string;
  binaryPath?: string;
  outputPrefix?: string;
  trace?: string;
  stats?: boolean;
  exportSqlite?: boolean;
}): string {
  const command = normalizeRequiredShellToken(options?.command, "cmd");
  const binaryPath = normalizeOptionalShellToken(options?.binaryPath, "nsys-bin");
  const outputPrefix =
    normalizeOptionalShellToken(options?.outputPrefix, "nsys-output") ??
    "tue-nsys-profile";
  const trace =
    normalizeOptionalShellToken(options?.trace, "nsys-trace") ??
    "cuda,nvtx,osrt";
  const stats = options?.stats ?? true;
  const exportSqlite = options?.exportSqlite ?? false;

  const profileCommand =
    `target_cmd=${quoteForShellSingle(command)}; ` +
    `explicit_nsys=${quoteForShellSingle(binaryPath ?? "")}; ` +
    `out_prefix=${quoteForShellSingle(outputPrefix)}; ` +
    `trace_targets=${quoteForShellSingle(trace)}; ` +
    `stats_enabled=${quoteForShellSingle(stats ? "true" : "false")}; ` +
    "nsys_cmd=''; " +
    "if [ -n \"$explicit_nsys\" ]; then " +
    "if [ -x \"$explicit_nsys\" ]; then nsys_cmd=\"$explicit_nsys\"; " +
    "elif command -v \"$explicit_nsys\" >/dev/null 2>&1; then nsys_cmd=$(command -v \"$explicit_nsys\"); " +
    "else echo \"nsys binary not found: $explicit_nsys\" >&2; exit 127; fi; " +
    "if ! \"$nsys_cmd\" --version >/dev/null 2>&1; then echo \"nsys binary is not runnable: $nsys_cmd\" >&2; exit 127; fi; " +
    "else " +
    "for candidate in $(ls -1d /graphics/opt/opt_Ubuntu24.04/cuda/toolkit_*/cuda/bin/nsys 2>/dev/null | sort -V -r) $(ls -1d /opt/nvidia/nsight-systems/*/bin/nsys 2>/dev/null | sort -V -r) $(ls -1d /usr/local/cuda*/nsight-systems*/bin/nsys 2>/dev/null | sort -V -r) $(command -v nsys 2>/dev/null); do " +
    "if [ -x \"$candidate\" ] && \"$candidate\" --version >/dev/null 2>&1; then nsys_cmd=\"$candidate\"; break; fi; " +
    "done; fi; " +
    "if [ -z \"$nsys_cmd\" ]; then echo 'nsys not found on remote machine.' >&2; exit 127; fi; " +
    'echo "[NSYS] binary: $nsys_cmd"; ' +
    '"$nsys_cmd" profile --force-overwrite=true -o "$out_prefix" -t "$trace_targets" --stats="$stats_enabled" sh -lc "$target_cmd"; ' +
    'echo "[NSYS] report: $out_prefix.nsys-rep"; ' +
    (exportSqlite
      ? 'if "$nsys_cmd" export --type sqlite --output "$out_prefix.sqlite" "$out_prefix.nsys-rep" 2>/dev/null; then :; elif "$nsys_cmd" export --sqlite "$out_prefix.sqlite" "$out_prefix.nsys-rep" 2>/dev/null; then :; else echo "nsys export to sqlite failed (unsupported CLI options)." >&2; exit 2; fi; echo "[NSYS] sqlite: $out_prefix.sqlite"; '
      : "");

  const workdir = normalizeOptionalShellToken(options?.workdir, "workdir");
  return wrapCudaUtilityCommand(profileCommand, workdir);
}

export function buildCudaBenchmarkRemoteCommand(options?: {
  command?: string;
  workdir?: string;
  runs?: number;
  warmup?: number;
}): string {
  const command = normalizeRequiredShellToken(options?.command, "cmd");
  const runs = options?.runs ?? 10;
  const warmup = options?.warmup ?? 2;

  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("Invalid runs: use an integer >= 1.");
  }

  if (!Number.isInteger(warmup) || warmup < 0) {
    throw new Error("Invalid warmup: use an integer >= 0.");
  }

  const commandToken = quoteForShellSingle(command);
  const benchmarkCommand =
    `cmd=${commandToken}; runs=${runs}; warmup=${warmup}; ` +
    "if ! date +%s%N >/dev/null 2>&1; then echo 'date +%s%N is required for benchmark timing.' >&2; exit 127; fi; " +
    "bench_shell='sh'; if command -v bash >/dev/null 2>&1; then bench_shell='bash'; fi; " +
    'i=1; while [ "$i" -le "$warmup" ]; do "$bench_shell" -lc "$cmd" >/dev/null 2>&1; i=$((i + 1)); done; ' +
    "i=1; sum_ns=0; min_ns=''; max_ns=0; " +
    'while [ "$i" -le "$runs" ]; do ' +
    'start_ns=$(date +%s%N); "$bench_shell" -lc "$cmd"; end_ns=$(date +%s%N); ' +
    "elapsed_ns=$((end_ns - start_ns)); sum_ns=$((sum_ns + elapsed_ns)); " +
    'if [ -z "$min_ns" ] || [ "$elapsed_ns" -lt "$min_ns" ]; then min_ns=$elapsed_ns; fi; ' +
    'if [ "$elapsed_ns" -gt "$max_ns" ]; then max_ns=$elapsed_ns; fi; ' +
    'elapsed_ms=$(awk -v ns="$elapsed_ns" \'BEGIN { printf "%.3f", ns / 1000000 }\'); ' +
    'echo "[BENCH] run $i/$runs: $elapsed_ms ms"; ' +
    "i=$((i + 1)); " +
    "done; " +
    "avg_ns=$((sum_ns / runs)); " +
    'avg_ms=$(awk -v ns="$avg_ns" \'BEGIN { printf "%.3f", ns / 1000000 }\'); ' +
    'min_ms=$(awk -v ns="$min_ns" \'BEGIN { printf "%.3f", ns / 1000000 }\'); ' +
    'max_ms=$(awk -v ns="$max_ns" \'BEGIN { printf "%.3f", ns / 1000000 }\'); ' +
    'echo "[BENCH] summary: runs=$runs warmup=$warmup avg=$avg_ms ms min=$min_ms ms max=$max_ms ms"';

  const workdir = normalizeOptionalShellToken(options?.workdir, "workdir");
  return wrapCudaUtilityCommand(benchmarkCommand, workdir);
}
