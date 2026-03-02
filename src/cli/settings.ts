import { ensureRemoteCommand, getCurrentDirectoryName, parseTruthy } from "./helpers";
import type { FlagMap } from "./types";

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
} {
  const preset = parsedFlags.preset ?? env.TUE_BUILD_PRESET;
  const projectName =
    parsedFlags["project-name"] ??
    env.TUE_PROJECT_NAME ??
    (localPath === "." || localPath === "./" ? getCurrentDirectoryName() : undefined);

  const remoteRoot = parsedFlags["remote-root"] ?? env.TUE_REMOTE_ROOT ?? "~/exercise00";
  const buildCommand =
    parsedFlags["build-cmd"] ??
    env.TUE_BUILD_CMD ??
    (preset
      ? resolveBuildPresetCommand(preset)
      : "cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j");
  const artifactPath = parsedFlags["artifact-path"] ?? env.TUE_ARTIFACT_PATH ?? "build";
  const outputDir = parsedFlags["output-dir"] ?? env.TUE_BUILD_OUTPUT ?? "./.tue-artifacts";
  const keepRemote = parseTruthy(parsedFlags["keep-remote"] ?? env.TUE_KEEP_REMOTE);

  return {
    projectName,
    remoteRoot,
    buildCommand,
    artifactPath,
    outputDir,
    keepRemote,
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
  keepRemote: boolean;
} {
  const projectName =
    parsedFlags["project-name"] ??
    env.TUE_PROJECT_NAME ??
    (localPath === "." || localPath === "./" ? getCurrentDirectoryName() : undefined);

  const remoteRoot = parsedFlags["remote-root"] ?? env.TUE_REMOTE_ROOT ?? "~/exercise00";
  const runCommand = ensureRemoteCommand(parsedFlags.cmd);
  const keepRemote = parseTruthy(parsedFlags["keep-remote"] ?? env.TUE_KEEP_REMOTE);

  return {
    projectName,
    remoteRoot,
    runCommand,
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
    (localPath === "." || localPath === "./" ? getCurrentDirectoryName() : undefined);

  const remoteRoot = parsedFlags["remote-root"] ?? env.TUE_REMOTE_ROOT ?? "~/exercise00";
  const keepRemote = parseTruthy(parsedFlags["keep-remote"] ?? env.TUE_KEEP_REMOTE);

  return {
    projectName,
    remoteRoot,
    keepRemote,
  };
}

export function buildCudaInfoRemoteCommand(): string {
  return "echo '== Host ==' && hostname && echo && echo '== GPU Summary (nvidia-smi) ==' && (command -v nvidia-smi >/dev/null 2>&1 && (nvidia-smi --query-gpu=name,driver_version,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader 2>/dev/null || nvidia-smi) || echo 'nvidia-smi not found') && echo && echo '== CUDA Toolkit (nvcc) ==' && (command -v nvcc >/dev/null 2>&1 && nvcc --version || echo 'nvcc not found') && echo && echo '== Environment ==' && echo CUDA_HOME=${CUDA_HOME:-unset} && echo PATH=$PATH";
}
