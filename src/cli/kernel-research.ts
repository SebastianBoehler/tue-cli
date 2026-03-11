import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSyncCommands } from "../build";
import type { ResolvedConfig } from "../config";
import {
  findKernelResearchRun,
  rememberKernelResearchRun,
} from "../kernel-research-runs";
import { warnOnRestrictedMachine } from "../machines";
import { execute } from "./execution";
import { ensureMachine, parseTruthy } from "./helpers";
import {
  buildCudaBenchmarkRemoteCommand,
  buildCudaProfileRemoteCommand,
  buildCudaVerifyRemoteCommand,
  resolveBuildSettings,
  resolveCudaDevices,
  resolveSyncSettings,
} from "./settings";
import type { CommandRuntimeOptions, FlagMap } from "./types";

type KernelResearchManifest = {
  version: 1;
  runId: string;
  createdAt: string;
  packageRoot: string;
  provider: {
    kind: "openrouter";
    model: string;
    apiKeyEnv: "OPENROUTER_API_KEY";
    baseUrl: string;
  };
  execution: {
    pythonBin: string;
    tueBin: string;
    maxIterations: number;
    benchmarkRuns: number;
    benchmarkWarmup: number;
    profileMode: "nsys" | "project" | "both";
  };
  workspace: {
    projectRoot: string;
    artifactsRoot: string;
    runRoot: string;
    scratchProjectRoot: string;
    editablePaths: string[];
  };
  profiling: {
    reportFormat: "auto" | "json";
    profileReportPath?: string;
    hotspotMapPath?: string;
  };
  remote: {
    machine: string;
    user: string;
    gateway: string;
    projectName: string;
    remoteRoot: string;
    remoteProjectPath: string;
    cudaDevices?: string;
  };
  inputs: {
    workloadCommand?: string;
    buildCommand?: string;
    verifyCommand: string;
    benchmarkCommand: string;
    profileCommand?: string;
    profileReportPath?: string;
    hotspotMapPath?: string;
    modelEntry?: string;
    inputShape?: string;
    dtype?: string;
  };
  commands: {
    sync: string[];
    build: string[];
    verify: string;
    benchmark: string;
    nsysProfile: string;
    projectProfile?: string[];
    profileReportFetch?: string;
  };
  promotion: {
    requireApproval: true;
    targetProjectRoot: string;
  };
};

type KernelResearchStatus = {
  run_id: string;
  status: string;
  current_phase?: string;
  best_candidate_id?: string;
  baseline?: Record<string, unknown>;
  best_candidate?: Record<string, unknown>;
  winning_files?: Record<string, string>;
  updated_at?: string;
};

function resolvePackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = resolve(here, "..", "..");
  const distRoot = resolve(here, "..");

  if (existsSync(join(srcRoot, "package.json"))) {
    return srcRoot;
  }

  if (existsSync(join(distRoot, "package.json"))) {
    return distRoot;
  }

  return process.cwd();
}

function ensurePathExists(pathValue: string, label: string): string {
  const resolved = resolve(pathValue);
  if (!existsSync(resolved)) {
    throw new Error(`Missing ${label}: ${resolved}`);
  }
  return resolved;
}

function ensureProjectRoot(pathValue: string): string {
  return ensurePathExists(pathValue, "project-root");
}

function ensureRequiredFlag(flags: FlagMap, name: string): string {
  const value = flags[name]?.trim();
  if (!value) {
    throw new Error(`Missing --${name}.`);
  }
  return value;
}

function parsePositiveInt(
  rawValue: string | undefined,
  flagName: string,
  fallback: number,
  minimum = 1,
): number {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`Invalid ${flagName}: use an integer >= ${minimum}.`);
  }
  return parsed;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function inferProjectName(projectRoot: string): string {
  const name = basename(projectRoot.replace(/\/+$/, ""));
  return name || "project";
}

function parseEditablePaths(
  rawValue: string,
  projectRoot: string,
): string[] {
  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    throw new Error("Missing editable paths. Pass --editable-paths <csv>.");
  }

  return values.map((value) => {
    const absolute = ensurePathExists(join(projectRoot, value), `editable path ${value}`);
    const relativePath = relative(projectRoot, absolute);
    if (relativePath.startsWith("..")) {
      throw new Error(`Editable path must stay inside project-root: ${value}`);
    }
    return relativePath;
  });
}

function parseProjectRelativePath(
  rawValue: string | undefined,
  projectRoot: string,
  flagName: string,
): string | undefined {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return undefined;
  }

  const absolute = ensurePathExists(join(projectRoot, trimmed), flagName);
  const relativePath = relative(projectRoot, absolute);
  if (relativePath.startsWith("..")) {
    throw new Error(`${flagName} must stay inside project-root: ${trimmed}`);
  }
  return relativePath;
}

function createRunId(date = new Date()): string {
  return `kr-${date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z")}`;
}

function loadStatus(statusPath: string): KernelResearchStatus {
  if (!existsSync(statusPath)) {
    throw new Error(`Missing status file: ${statusPath}`);
  }

  const raw = readFileSync(statusPath, "utf8");
  return JSON.parse(raw) as KernelResearchStatus;
}

function resolveRunRecord(
  flags: FlagMap,
): {
  runId: string;
  manifestPath: string;
  runRoot: string;
} {
  const manifestPathFlag = flags["manifest-path"];
  if (manifestPathFlag) {
    const manifestPath = ensurePathExists(manifestPathFlag, "manifest-path");
    return {
      runId: "",
      manifestPath,
      runRoot: dirname(manifestPath),
    };
  }

  const runId = ensureRequiredFlag(flags, "run-id");
  const record = findKernelResearchRun(runId);
  if (!record) {
    throw new Error(`Unknown kernel research run: ${runId}`);
  }

  return {
    runId,
    manifestPath: record.manifestPath,
    runRoot: record.runRoot,
  };
}

export function createKernelResearchManifest(
  config: ResolvedConfig,
  flags: FlagMap,
  env: Record<string, string | undefined> = Bun.env,
): KernelResearchManifest {
  const machine = ensureMachine(config.machine);
  warnOnRestrictedMachine(machine);

  const projectRoot = ensureProjectRoot(flags["project-root"] ?? ".");
  const buildSettings = resolveBuildSettings(flags, projectRoot, env);
  const syncSettings = resolveSyncSettings(flags, projectRoot, env);
  const projectName = buildSettings.projectName ?? inferProjectName(projectRoot);
  const artifactsRoot = resolve(
    flags["artifacts-root"] ?? join(projectRoot, ".tue-kernel-research"),
  );
  const runId = createRunId();
  const runRoot = join(artifactsRoot, "runs", runId);
  const scratchProjectRoot = join(runRoot, "workspace", projectName);
  const editablePaths = parseEditablePaths(
    ensureRequiredFlag(flags, "editable-paths"),
    projectRoot,
  );
  const benchmarkCommand = ensureRequiredFlag(flags, "benchmark-cmd");
  const verifyCommand = ensureRequiredFlag(flags, "verify-cmd");
  const profileReportPath = flags["profile-report-path"]?.trim();
  const hotspotMapPath = parseProjectRelativePath(
    flags["hotspot-map-path"],
    projectRoot,
    "hotspot-map-path",
  );
  const reportFormat = (flags["profile-report-format"] ?? "auto") as
    | "auto"
    | "json";
  if (!["auto", "json"].includes(reportFormat)) {
    throw new Error("Invalid --profile-report-format. Use auto | json.");
  }
  const pythonBin = flags["python-bin"] ?? env.TUE_KERNEL_RESEARCH_PYTHON ?? "python3";
  const tueBin = flags["tue-bin"] ?? env.TUE_KERNEL_RESEARCH_TUE_BIN ?? "tue";
  const model = flags["llm-model"] ?? env.TUE_KERNEL_RESEARCH_MODEL ?? "openrouter/anthropic/claude-3.7-sonnet";
  const baseUrl = flags["openrouter-base-url"] ?? env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const maxIterations = parsePositiveInt(flags["max-iterations"], "max-iterations", 3);
  const benchmarkRuns = parsePositiveInt(flags.runs, "runs", 10);
  const benchmarkWarmup = parsePositiveInt(flags.warmup, "warmup", 2, 0);
  const profileMode = (flags["profile-mode"] ?? "both") as "nsys" | "project" | "both";
  if (!["nsys", "project", "both"].includes(profileMode)) {
    throw new Error("Invalid --profile-mode. Use nsys | project | both.");
  }

  const remoteProjectPath = `${syncSettings.remoteRoot}/${projectName}`;
  const cudaDevices = resolveCudaDevices(flags, env);
  const placeholderProjectRoot = "__PROJECT_ROOT__";

  const syncCommands = createSyncCommands({
    user: config.user,
    gateway: config.gateway,
    machine,
    localPath: placeholderProjectRoot,
    projectName,
    remoteRoot: syncSettings.remoteRoot,
    keepRemote: true,
  });

  const buildCommands = flags["build-cmd"]
    ? [
        `${tueBin} remote run --machine ${machine} --cmd ${shellQuote(
          `cd ${remoteProjectPath} && ${flags["build-cmd"]}`,
        )}`,
      ]
    : [];

  buildCudaProfileRemoteCommand({
    command: flags["nsys-cmd"] ?? benchmarkCommand,
    workdir: remoteProjectPath,
    binaryPath: flags["nsys-bin"],
    outputPrefix: `${runId}-nsys`,
    trace: flags["nsys-trace"],
    stats: flags["nsys-stats"] ? parseTruthy(flags["nsys-stats"]) : true,
    exportSqlite: parseTruthy(flags["nsys-sqlite"]),
  });
  buildCudaVerifyRemoteCommand({
    command: verifyCommand,
    workdir: remoteProjectPath,
  });
  buildCudaBenchmarkRemoteCommand({
    command: benchmarkCommand,
    workdir: remoteProjectPath,
    runs: benchmarkRuns,
    warmup: benchmarkWarmup,
  });

  const nsysCommand = `${tueBin} cuda profile --machine ${machine} --workdir ${shellQuote(remoteProjectPath)} --cmd ${shellQuote(
    flags["nsys-cmd"] ?? benchmarkCommand,
  )}${flags["nsys-bin"] ? ` --nsys-bin ${shellQuote(flags["nsys-bin"])}` : ""}${flags["nsys-trace"] ? ` --nsys-trace ${shellQuote(flags["nsys-trace"])}` : ""}${flags["nsys-stats"] ? ` --nsys-stats ${shellQuote(flags["nsys-stats"])}` : ""}${flags["nsys-sqlite"] ? ` --nsys-sqlite ${shellQuote(flags["nsys-sqlite"])}` : ""}`;
  const verifyShell = `${tueBin} cuda verify --machine ${machine} --workdir ${shellQuote(remoteProjectPath)} --cmd ${shellQuote(
    verifyCommand,
  )}`;
  const benchmarkShell = `${tueBin} cuda benchmark --machine ${machine} --workdir ${shellQuote(
    remoteProjectPath,
  )} --cmd ${shellQuote(benchmarkCommand)} --warmup ${benchmarkWarmup} --runs ${benchmarkRuns}`;
  const projectProfileCommands = flags["profile-cmd"]
    ? [
        `${tueBin} remote run --machine ${machine} --cmd ${shellQuote(
          `cd ${remoteProjectPath} && ${flags["profile-cmd"]}`,
        )}${cudaDevices ? ` --cuda-devices ${shellQuote(cudaDevices)}` : ""}`,
      ]
    : undefined;
  const profileReportFetch = profileReportPath
    ? `${tueBin} remote run --machine ${machine} --cmd ${shellQuote(
        `cd ${remoteProjectPath} && cat ${profileReportPath}`,
      )}`
    : undefined;

  return {
    version: 1,
    runId,
    createdAt: new Date().toISOString(),
    packageRoot: resolvePackageRoot(),
    provider: {
      kind: "openrouter",
      model,
      apiKeyEnv: "OPENROUTER_API_KEY",
      baseUrl,
    },
    execution: {
      pythonBin,
      tueBin,
      maxIterations,
      benchmarkRuns,
      benchmarkWarmup,
      profileMode,
    },
    workspace: {
      projectRoot,
      artifactsRoot,
      runRoot,
      scratchProjectRoot,
      editablePaths,
    },
    profiling: {
      reportFormat,
      profileReportPath,
      hotspotMapPath,
    },
    remote: {
      machine,
      user: config.user,
      gateway: config.gateway,
      projectName,
      remoteRoot: syncSettings.remoteRoot,
      remoteProjectPath,
      cudaDevices,
    },
    inputs: {
      workloadCommand: flags["workload-cmd"],
      buildCommand: flags["build-cmd"],
      verifyCommand,
      benchmarkCommand,
      profileCommand: flags["profile-cmd"],
      profileReportPath,
      hotspotMapPath,
      modelEntry: flags["model-entry"],
      inputShape: flags["input-shape"],
      dtype: flags.dtype,
    },
    commands: {
      sync: syncCommands,
      build: buildCommands,
      verify: verifyShell,
      benchmark: benchmarkShell,
      nsysProfile: nsysCommand,
      projectProfile: projectProfileCommands,
      profileReportFetch,
    },
    promotion: {
      requireApproval: true,
      targetProjectRoot: projectRoot,
    },
  };
}

export function printKernelResearchStatus(flags: FlagMap): void {
  const { manifestPath, runRoot } = resolveRunRecord(flags);
  const statusPath = join(runRoot, "status.json");
  const status = loadStatus(statusPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as KernelResearchManifest;

  console.log(`Run ID: ${status.run_id || manifest.runId}`);
  console.log(`Status: ${status.status}`);
  console.log(`Phase: ${status.current_phase ?? "unknown"}`);
  console.log(`Run root: ${runRoot}`);

  if (status.best_candidate_id) {
    console.log(`Best candidate: ${status.best_candidate_id}`);
  }

  if (status.best_candidate && typeof status.best_candidate === "object") {
    const summary = status.best_candidate;
    const latency = summary["latency_ms"];
    if (typeof latency === "number" || typeof latency === "string") {
      console.log(`Best latency ms: ${latency}`);
    }
    const speedup = summary["speedup_vs_baseline"];
    if (typeof speedup === "number" || typeof speedup === "string") {
      console.log(
        `Best speedup vs baseline: ${speedup}`,
      );
    }
  }

  if (
    status.baseline &&
    typeof status.baseline === "object" &&
    "hotspot_summary" in status.baseline
  ) {
    const hotspotSummary = status.baseline.hotspot_summary;
    if (
      hotspotSummary &&
      typeof hotspotSummary === "object" &&
      "ranked_targets" in hotspotSummary &&
      Array.isArray(hotspotSummary.ranked_targets) &&
      hotspotSummary.ranked_targets.length > 0
    ) {
      const topTarget = hotspotSummary.ranked_targets[0];
      if (
        topTarget &&
        typeof topTarget === "object" &&
        "relative_path" in topTarget
      ) {
        console.log(`Top ranked target: ${String(topTarget.relative_path)}`);
      }
    }
  }

  console.log(`Approval required: ${manifest.promotion.requireApproval ? "yes" : "no"}`);
}

export function approveKernelResearchRun(flags: FlagMap, dryRun: boolean): void {
  if (!parseTruthy(flags.yes)) {
    throw new Error("Refusing approval without --yes.");
  }

  const { manifestPath, runRoot } = resolveRunRecord(flags);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as KernelResearchManifest;
  const status = loadStatus(join(runRoot, "status.json"));
  const winningFiles = status.winning_files ?? {};

  if (Object.keys(winningFiles).length === 0) {
    throw new Error("No winning files are available for promotion.");
  }

  for (const [relativePath, sourcePath] of Object.entries(winningFiles)) {
    const targetPath = join(manifest.promotion.targetProjectRoot, relativePath);
    const resolvedSource = resolve(runRoot, sourcePath);
    if (!existsSync(resolvedSource)) {
      throw new Error(`Winning artifact is missing: ${resolvedSource}`);
    }

    if (dryRun) {
      console.log(`cp ${shellQuote(resolvedSource)} ${shellQuote(targetPath)}`);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(resolvedSource, targetPath);
  }

  if (!dryRun) {
    writeFileSync(
      join(runRoot, "approval.json"),
      `${JSON.stringify(
        {
          approved_at: new Date().toISOString(),
          approved_run_id: status.run_id || manifest.runId,
          winning_files: winningFiles,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  console.log(`Approved kernel research run ${status.run_id || manifest.runId}.`);
}

export function runKernelResearch(
  config: ResolvedConfig,
  flags: FlagMap,
  options?: CommandRuntimeOptions,
): void {
  if (!config.dryRun && !Bun.env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY.");
  }

  const manifest = createKernelResearchManifest(config, flags, Bun.env);
  const manifestPath = join(manifest.workspace.runRoot, "manifest.json");
  const statusPath = join(manifest.workspace.runRoot, "status.json");

  if (config.dryRun) {
    console.log(JSON.stringify(manifest, null, 2));
    console.log(
      `cd ${shellQuote(manifest.packageRoot)} && PYTHONPATH=${shellQuote(
        join(manifest.packageRoot, "python"),
      )} ${shellQuote(manifest.execution.pythonBin)} -m tue_kernel_research.cli run --manifest ${shellQuote(
        manifestPath,
      )}`,
    );
    return;
  }

  mkdirSync(manifest.workspace.runRoot, { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(
    statusPath,
    `${JSON.stringify(
      {
        run_id: manifest.runId,
        status: "queued",
        current_phase: "manifest_created",
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  rememberKernelResearchRun({
    id: manifest.runId,
    manifestPath,
    runRoot: manifest.workspace.runRoot,
    projectRoot: manifest.workspace.projectRoot,
    machine: manifest.remote.machine,
    editablePaths: manifest.workspace.editablePaths,
    startedAt: manifest.createdAt,
  });

  const pythonPath = join(manifest.packageRoot, "python");
  const runnerCommand = `cd ${shellQuote(
    manifest.packageRoot,
  )} && export PYTHONPATH=${shellQuote(
    pythonPath,
  )}:${shellQuote(
    Bun.env.PYTHONPATH ?? "",
  )} && ${shellQuote(
    manifest.execution.pythonBin,
  )} -m tue_kernel_research.cli run --manifest ${shellQuote(manifestPath)}`;

  execute(runnerCommand, false, options);
}
