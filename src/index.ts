#!/usr/bin/env bun

import { createServer } from "node:net";
import { parseArgs } from "./cli-args";
import {
  createBuildCommands,
  createBuildCommandsWithMachineSelection,
  createRunCommands,
  createRunCommandsWithMachineSelection,
} from "./build";
import { resolveConfig, type ResolvedConfig } from "./config";
import {
  findMatchingTunnelPids,
  parseLocalTunnelsFromPsOutput,
} from "./local-tunnels";
import {
  getDefaultUserProfile,
  loadUserProfiles,
  rememberUserProfile,
  setDefaultUserProfile,
} from "./user-profiles";
import {
  ALTERNATE_GATEWAY,
  COMPUTE_MACHINES,
  DEFAULT_GATEWAY,
  POOL_MACHINES,
  classifyMachine,
  printGatewayGuidance,
  printMachinePolicySummary,
  sanitizeMachineName,
  warnOnRestrictedMachine,
} from "./machines";
import {
  buildInteractiveShellCommand,
  buildMachineSelectAndShellCommand,
  buildMachineSelectAndTunnelCommand,
  buildMachineSelectAndVncConnectCommand,
  buildVncConnectRemoteCommand,
  buildVncKillRemoteCommand,
  buildVncListRemoteCommand,
  buildPoolSmiSnapshotRemoteCommand,
  buildPoolSmiRemoteCommand,
  buildPoolCommand,
  buildProxyJumpPoolCommand,
  buildTunnelCommand,
  buildVncStartRemoteCommand,
} from "./ssh";
import {
  formatPoolMachineStatus,
  parsePoolSmiSnapshot,
} from "./pool-smi";
import {
  promptInput,
  selectMenuOption,
  supportsInteractivePrompts,
} from "./ui";

function printHelp(): void {
  console.log(`tue-cli

Usage:
  tue
  tue build [<local_path>] [--machine <hostname>] [--project-name <name>] [--build-cmd "<cmd>"] [--artifact-path <path>] [--output-dir <dir>] [--dry-run]
  tue run [<local_path>] --cmd "<command>" [--machine <hostname>] [--project-name <name>] [--remote-root <dir>] [--keep-remote] [--dry-run]
  tue connect [shell|tunnel|vnc] [--machine <hostname>] [--display <n>] [--local-port <port>] [--user <name>] [--dry-run]
  tue user <list|select|add> [--name <username>]
  tue machines list [--user <name>] [--gateway <host>] [--live] [--dry-run]
  tue vnc <start|list|kill> [<display>|:<display>] --machine <hostname> [--display <n>] [--keep-tunnel] [--user <name>] [--dry-run]
  tue tunnel <open|close> [<display>|:<display>] [--machine <hostname>] [--display <n>] [--local-port <port>] [--user <name>] [--dry-run]
  tue remote run --machine <hostname> --cmd "<command>" [--user <name>] [--dry-run]
  tue help

Notes:
  - Running just "tue" opens the interactive menu (single entry point).
  - For VNC forwarding, remote port is always 5900 + display; local port can be any free port.

Config sources (priority):
  1) CLI flags
  2) .env / environment variables

Supported environment variables:
  TUE_USER, TUE_GATEWAY, TUE_MACHINE, TUE_DISPLAY, TUE_LOCAL_PORT, TUE_DRY_RUN,
  TUE_REMOTE_ROOT, TUE_BUILD_CMD, TUE_ARTIFACT_PATH, TUE_BUILD_OUTPUT, TUE_PROJECT_NAME, TUE_KEEP_REMOTE
`);
}

function printActiveIdentity(config: ResolvedConfig): void {
  console.log(
    `tue-cli active identity: ${config.user}@${config.gateway}`,
  );
}

function parseTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getCurrentDirectoryName(): string {
  const pwd = Bun.env.PWD;

  if (!pwd) {
    return "project";
  }

  const normalized = pwd.replace(/\/+$/, "");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];

  return last || "project";
}

function ensureRemoteCommand(cmd: string | undefined): string {
  if (!cmd) {
    throw new Error('Missing command. Pass --cmd "<command>".');
  }

  return cmd;
}

function ensureMachine(machine: string | undefined): string {
  if (!machine) {
    throw new Error("Missing machine. Pass --machine or select one interactively.");
  }

  return sanitizeMachineName(machine);
}

function parseDisplayToken(token: string): string {
  const normalized = token.startsWith(":") ? token.slice(1) : token;

  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      `Invalid display token: ${token}. Use a number like 7 or :7.`,
    );
  }

  return normalized;
}

function normalizeUsername(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Username cannot be empty.");
  }

  if (/\s/.test(trimmed)) {
    throw new Error(`Username cannot contain spaces: ${trimmed}`);
  }

  return trimmed;
}

async function selectOrAddUserProfile(
  currentDefault?: string,
): Promise<string> {
  const profiles = loadUserProfiles();

  if (profiles.users.length === 0) {
    const entered = normalizeUsername(await promptInput("WSI username"));
    rememberUserProfile(entered);
    return entered;
  }

  const selected = await selectMenuOption(
    "Select saved username",
    [
      ...profiles.users.map((user) => ({
        value: user,
        label: user,
      })),
      { value: "__new__", label: "Connect new username" },
    ],
    currentDefault ?? profiles.defaultUser ?? profiles.users[0],
  );

  if (selected !== "__new__") {
    setDefaultUserProfile(selected);
    return selected;
  }

  const entered = normalizeUsername(await promptInput("WSI username"));
  rememberUserProfile(entered);
  return entered;
}

async function selectMachine(defaultMachine?: string): Promise<string> {
  const machineScope = await selectMenuOption(
    "Select machine scope",
    [
      { value: "pool", label: "Pool machines (open to everyone)" },
      {
        value: "compute",
        label: "Compute servers (restricted: cgstaff/cgext/cghiwi/cggpu)",
      },
      { value: "manual", label: "Enter machine hostname manually" },
    ],
    "pool",
  );

  if (machineScope === "manual") {
    const typed = await promptInput("Machine hostname", defaultMachine);
    return sanitizeMachineName(typed);
  }

  const machines = machineScope === "pool" ? POOL_MACHINES : COMPUTE_MACHINES;
  const selected = await selectMenuOption(
    "Select machine",
    machines.map((machine) => ({
      value: machine,
      label: machine,
    })),
    defaultMachine && machines.includes(defaultMachine)
      ? defaultMachine
      : machines[0],
  );
  return selected;
}

function execute(command: string, dryRun: boolean): never | void {
  if (dryRun) {
    console.log(command);
    return;
  }

  const result = Bun.spawnSync(["sh", "-lc", command], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }) as { exitCode: number };

  if (result.exitCode === 0) {
    return;
  }

  throw new Error(`Command failed with exit code ${result.exitCode}`);
}

function executeAll(commands: string[], dryRun: boolean): void {
  for (const command of commands) {
    execute(command, dryRun);
  }
}

function executeCapture(command: string, dryRun: boolean): string {
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

function validateVncDisplay(display: number): void {
  if (display < 0 || display > 10) {
    throw new Error(
      `Invalid display ${display}. Allowed display range is 0..10 (ports 5900..5910).`,
    );
  }
}

function validateLocalPort(localPort: number): void {
  if (localPort < 1025 || localPort > 65535) {
    throw new Error(
      `Invalid local-port ${localPort}. Choose a local port between 1025 and 65535.`,
    );
  }
}

function getVncRemotePort(display: number): number {
  return 5900 + display;
}

function isLocalPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function chooseLocalPort(preferredPort: number): Promise<number> {
  if (await isLocalPortFree(preferredPort)) {
    return preferredPort;
  }

  for (let port = preferredPort + 1; port <= 65535; port += 1) {
    if (await isLocalPortFree(port)) {
      return port;
    }
  }

  throw new Error(
    `No free local port available in range ${preferredPort}..65535 for SSH tunnel.`,
  );
}

function listLocalSshTunnels() {
  const result = Bun.spawnSync(["sh", "-lc", "ps -axo pid=,command="], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  }) as { exitCode: number; stdout?: Uint8Array; stderr?: Uint8Array };

  if (result.exitCode !== 0) {
    const stderr = result.stderr
      ? new TextDecoder().decode(result.stderr).trim()
      : "";
    throw new Error(
      stderr
        ? `Failed to inspect local tunnel processes: ${stderr}`
        : "Failed to inspect local tunnel processes.",
    );
  }

  const output = result.stdout
    ? new TextDecoder().decode(result.stdout)
    : "";
  return parseLocalTunnelsFromPsOutput(output);
}

function closeLocalSshTunnels(options: {
  user?: string;
  gateway?: string;
  machine?: string;
  localPort?: number;
  remotePort?: number;
  dryRun: boolean;
}): number {
  const pids = findMatchingTunnelPids(listLocalSshTunnels(), options);

  if (pids.length === 0) {
    console.log("tue-cli note: no matching local SSH tunnel processes found.");
    return 0;
  }

  if (options.dryRun) {
    for (const pid of pids) {
      console.log(`kill ${pid}`);
    }
    return pids.length;
  }

  const failed: number[] = [];

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      failed.push(pid);
    }
  }

  const closed = pids.length - failed.length;

  if (closed > 0) {
    console.log(`Closed ${closed} local SSH tunnel process(es).`);
  }

  if (failed.length > 0) {
    throw new Error(
      `Could not close some tunnel processes: ${failed.join(", ")}.`,
    );
  }

  return closed;
}

function resolvePoolSmiMachine(
  preferredMachine: string | undefined,
): string {
  if (!preferredMachine) {
    return POOL_MACHINES[0];
  }

  const normalized = sanitizeMachineName(preferredMachine);

  if (classifyMachine(normalized) === "pool") {
    return normalized;
  }

  console.warn(
    `tue-cli note: ${normalized} is not a known pool host; using ${POOL_MACHINES[0]} for pool-smi.`,
  );
  return POOL_MACHINES[0];
}

function buildLivePoolSmiCommand(
  config: ResolvedConfig,
): string {
  const poolSmiMachine = resolvePoolSmiMachine(config.machine);
  return buildPoolCommand({
    username: config.user,
    gateway: config.gateway,
    machine: poolSmiMachine,
    remoteCommand: buildPoolSmiRemoteCommand(),
    tty: true,
  });
}

function buildSnapshotPoolSmiCommand(config: ResolvedConfig): string {
  const poolSmiMachine = resolvePoolSmiMachine(config.machine);
  return buildPoolCommand({
    username: config.user,
    gateway: config.gateway,
    machine: poolSmiMachine,
    remoteCommand: buildPoolSmiSnapshotRemoteCommand(),
  });
}

async function runMachineList(
  config: ResolvedConfig,
  options?: { live?: boolean },
): Promise<void> {
  printMachinePolicySummary();

  if (options?.live) {
    const liveCommand = buildLivePoolSmiCommand(config);
    execute(liveCommand, config.dryRun);
    return;
  }

  const snapshotCommand = buildSnapshotPoolSmiCommand(config);

  if (config.dryRun) {
    execute(snapshotCommand, true);
    return;
  }

  const snapshotOutput = executeCapture(snapshotCommand, false);
  const parsed = parsePoolSmiSnapshot(snapshotOutput);

  if (parsed.length === 0) {
    console.warn(
      "tue-cli note: could not parse pool-smi snapshot. Falling back to live stream.",
    );
    const liveCommand = buildLivePoolSmiCommand(config);
    execute(liveCommand, false);
    return;
  }

  if (!supportsInteractivePrompts()) {
    console.log("Pool machine status snapshot:");
    for (const entry of parsed) {
      console.log(`  - ${formatPoolMachineStatus(entry)}`);
    }
    return;
  }

  const selected = await selectMenuOption(
    "Pool machine status snapshot (arrow keys)",
    [
      ...parsed.map((entry) => ({
        value: entry.machine,
        label: formatPoolMachineStatus(entry),
      })),
      {
        value: "__live__",
        label: "Open raw live pool-smi stream",
      },
      {
        value: "__exit__",
        label: "Done",
      },
    ],
    parsed[0].machine,
  );

  if (selected === "__live__") {
    const liveCommand = buildLivePoolSmiCommand(config);
    execute(liveCommand, false);
    return;
  }

  if (selected === "__exit__") {
    return;
  }

  const selectedEntry = parsed.find((entry) => entry.machine === selected);

  if (selectedEntry) {
    console.log(`Selected: ${formatPoolMachineStatus(selectedEntry)}`);
  }
}

function resolveBuildSettings(
  parsedFlags: Record<string, string>,
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
  const projectName =
    parsedFlags["project-name"] ??
    env.TUE_PROJECT_NAME ??
    (localPath === "." || localPath === "./" ? getCurrentDirectoryName() : undefined);

  const remoteRoot = parsedFlags["remote-root"] ?? env.TUE_REMOTE_ROOT ?? "~/exercise00";
  const buildCommand =
    parsedFlags["build-cmd"] ??
    env.TUE_BUILD_CMD ??
    "mkdir -p build && cd build && cmake .. && make -j";
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

function resolveRunSettings(
  parsedFlags: Record<string, string>,
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

async function runConnectMode(
  mode: "shell" | "tunnel" | "vnc",
  config: ResolvedConfig,
  machineOverride?: string,
): Promise<void> {
  if (!machineOverride && !config.machine && !supportsInteractivePrompts()) {
    if (mode === "shell") {
      execute(
        buildMachineSelectAndShellCommand({
          username: config.user,
          gateway: config.gateway,
        }),
        config.dryRun,
      );
      return;
    }

    validateVncDisplay(config.display);
    validateLocalPort(config.localPort);

    if (mode === "vnc") {
      execute(
        buildMachineSelectAndVncConnectCommand({
          username: config.user,
          gateway: config.gateway,
          display: config.display,
          localPort: config.localPort,
          remotePort: getVncRemotePort(config.display),
        }),
        config.dryRun,
      );
      console.log(
        `VNC ready. Connect your client to localhost:${config.localPort} (display :${config.display}).`,
      );
      return;
    }

    execute(
      buildMachineSelectAndTunnelCommand({
        username: config.user,
        gateway: config.gateway,
        localPort: config.localPort,
        remotePort: getVncRemotePort(config.display),
      }),
      config.dryRun,
    );
    console.log(
      `Tunnel opened on localhost:${config.localPort} -> <selected-machine>:${getVncRemotePort(config.display)}.`,
    );
    return;
  }

  const machine = machineOverride
    ? sanitizeMachineName(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();

  warnOnRestrictedMachine(machine);

  if (mode === "vnc") {
    validateVncDisplay(config.display);
    validateLocalPort(config.localPort);

    const startCommand = buildProxyJumpPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildVncConnectRemoteCommand(config.display),
    });

    let resolvedDisplay = config.display;
    if (config.dryRun) {
      execute(startCommand, true);
    } else {
      const startOutput = executeCapture(startCommand, false);
      const displayMatch = startOutput.match(/TUE_VNC_DISPLAY=(\d+)/);

      if (!displayMatch) {
        throw new Error(
          "Could not determine selected VNC display from remote command output.",
        );
      }

      resolvedDisplay = Number.parseInt(displayMatch[1], 10);
      const visibleOutput = startOutput
        .split("\n")
        .filter((line) => !line.startsWith("TUE_VNC_DISPLAY="))
        .join("\n")
        .trim();

      if (visibleOutput) {
        console.log(visibleOutput);
      }
    }

    const preferredLocalPort =
      config.localPort === getVncRemotePort(config.display)
        ? getVncRemotePort(resolvedDisplay)
        : config.localPort;
    const effectiveLocalPort = await chooseLocalPort(preferredLocalPort);

    if (effectiveLocalPort !== preferredLocalPort) {
      console.warn(
        `tue-cli note: local port ${preferredLocalPort} is in use; using ${effectiveLocalPort} instead.`,
      );
    }

    const tunnelCommand = buildTunnelCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      localPort: effectiveLocalPort,
      remotePort: getVncRemotePort(resolvedDisplay),
    });
    execute(tunnelCommand, config.dryRun);
    console.log(
      `VNC ready. Connect your client to localhost:${effectiveLocalPort} (machine ${machine}, display :${resolvedDisplay}).`,
    );
    return;
  }

  if (mode === "tunnel") {
    validateVncDisplay(config.display);
    validateLocalPort(config.localPort);
    const selectedLocalPort = await chooseLocalPort(config.localPort);

    if (selectedLocalPort !== config.localPort) {
      console.warn(
        `tue-cli note: local port ${config.localPort} is in use; using ${selectedLocalPort} instead.`,
      );
    }

    const command = buildTunnelCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      localPort: selectedLocalPort,
      remotePort: getVncRemotePort(config.display),
    });
    execute(command, config.dryRun);
    console.log(
      `Tunnel opened on localhost:${selectedLocalPort} -> ${machine}:${getVncRemotePort(config.display)}.`,
    );
    return;
  }

  const shellCommand = buildInteractiveShellCommand({
    username: config.user,
    gateway: config.gateway,
    machine,
  });
  execute(shellCommand, config.dryRun);
}

async function runBuild(
  config: ResolvedConfig,
  localPath: string,
  machineOverride?: string,
): Promise<void> {
  const machine = machineOverride
    ? sanitizeMachineName(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();
  warnOnRestrictedMachine(machine);

  const buildSettings = resolveBuildSettings({}, localPath, Bun.env);
  const commands = createBuildCommands({
    user: config.user,
    gateway: config.gateway,
    machine,
    localPath,
    projectName: buildSettings.projectName,
    remoteRoot: buildSettings.remoteRoot,
    buildCommand: buildSettings.buildCommand,
    artifactPath: buildSettings.artifactPath,
    outputDir: buildSettings.outputDir,
    keepRemote: buildSettings.keepRemote,
  });

  executeAll(commands, config.dryRun);
}

async function runLocalProject(
  config: ResolvedConfig,
  localPath: string,
  runCommand: string,
  machineOverride?: string,
): Promise<void> {
  const machine = machineOverride
    ? sanitizeMachineName(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();
  warnOnRestrictedMachine(machine);

  const runSettings = resolveRunSettings(
    {
      cmd: runCommand,
    },
    localPath,
    Bun.env,
  );
  const commands = createRunCommands({
    user: config.user,
    gateway: config.gateway,
    machine,
    localPath,
    projectName: runSettings.projectName,
    remoteRoot: runSettings.remoteRoot,
    runCommand: runSettings.runCommand,
    keepRemote: runSettings.keepRemote,
  });

  executeAll(commands, config.dryRun);
}

async function resolveUserFlag(
  flags: Record<string, string>,
  env: Record<string, string | undefined>,
): Promise<string> {
  const fromFlags = flags.user;

  if (fromFlags) {
    return normalizeUsername(fromFlags);
  }

  const fromEnv = env.TUE_USER;

  if (fromEnv) {
    return normalizeUsername(fromEnv);
  }

  const storedDefault = getDefaultUserProfile(env);

  if (storedDefault) {
    return storedDefault;
  }

  if (!supportsInteractivePrompts()) {
    throw new Error(
      "Missing username. Pass --user, set TUE_USER, or run interactively once to save a global username profile.",
    );
  }

  return selectOrAddUserProfile();
}

async function resolveInteractiveConfig(
  flags: Record<string, string>,
  env: Record<string, string | undefined>,
): Promise<ResolvedConfig> {
  const interactiveFlags = { ...flags };
  interactiveFlags.user = await resolveUserFlag(interactiveFlags, env);

  if (!interactiveFlags.gateway && !env.TUE_GATEWAY) {
    interactiveFlags.gateway = await selectMenuOption("Select gateway", [
      {
        value: DEFAULT_GATEWAY,
        label: `${DEFAULT_GATEWAY} (outside WSI network / first login)`,
      },
      {
        value: ALTERNATE_GATEWAY,
        label: `${ALTERNATE_GATEWAY} (inside university network/VPN)`,
      },
    ]);
  }

  return resolveConfig(interactiveFlags, env);
}

async function runInteractive(flags: Record<string, string>): Promise<void> {
  const config = await resolveInteractiveConfig(flags, Bun.env);
  if (!config.dryRun) {
    rememberUserProfile(config.user);
  }
  printGatewayGuidance(config.gateway);
  printActiveIdentity(config);

  const action = await selectMenuOption(
    "Select action",
    [
      { value: "connect-shell", label: "Connect shell" },
      { value: "connect-vnc", label: "Connect VNC (start/reuse + tunnel)" },
      { value: "tunnel", label: "Open VNC tunnel only" },
      { value: "tunnel-close", label: "Close local VNC tunnel(s)" },
      { value: "user-profile", label: "Switch saved username profile" },
      { value: "vnc-manage", label: "Manage VNC (start/list/kill)" },
      { value: "remote-run", label: "Run remote command" },
      { value: "build", label: "Build local project remotely" },
      { value: "run-local", label: "Run local project/script remotely" },
      { value: "machines", label: "List known machines + live pool-smi" },
      { value: "exit", label: "Exit" },
    ],
    "connect-shell",
  );

  if (action === "exit") {
    return;
  }

  if (action === "machines") {
    await runMachineList(config);
    return;
  }

  if (action === "connect-shell") {
    await runConnectMode("shell", config);
    return;
  }

  if (action === "connect-vnc") {
    await runConnectMode("vnc", config);
    return;
  }

  if (action === "tunnel") {
    await runConnectMode("tunnel", config);
    return;
  }

  if (action === "tunnel-close") {
    const machine = await selectMachine(config.machine);
    validateVncDisplay(config.display);
    warnOnRestrictedMachine(machine);
    closeLocalSshTunnels({
      user: config.user,
      gateway: config.gateway,
      machine,
      remotePort: getVncRemotePort(config.display),
      dryRun: config.dryRun,
    });
    return;
  }

  if (action === "user-profile") {
    const selectedUser = await selectOrAddUserProfile(config.user);
    console.log(`Active username profile set to: ${selectedUser}`);
    return;
  }

  if (action === "vnc-manage") {
    const vncAction = await selectMenuOption("VNC action", [
      { value: "start", label: "Start/reuse VNC server" },
      { value: "list", label: "List VNC sessions" },
      { value: "kill", label: "Kill VNC session" },
    ]);

    validateVncDisplay(config.display);
    const machine = await selectMachine(config.machine);
    warnOnRestrictedMachine(machine);

    const remoteCommand =
      vncAction === "start"
        ? buildVncStartRemoteCommand(config.display)
        : vncAction === "list"
          ? buildVncListRemoteCommand()
          : buildVncKillRemoteCommand(config.display);

    const command = buildProxyJumpPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand,
    });

    execute(command, config.dryRun);

    if (vncAction === "kill") {
      closeLocalSshTunnels({
        user: config.user,
        gateway: config.gateway,
        machine,
        remotePort: getVncRemotePort(config.display),
        dryRun: config.dryRun,
      });
    }

    return;
  }

  if (action === "remote-run") {
    const machine = await selectMachine(config.machine);
    warnOnRestrictedMachine(machine);
    const remoteCmd = await promptInput('Remote command (example: nvidia-smi)');
    const command = buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: remoteCmd,
    });
    execute(command, config.dryRun);
    return;
  }

  if (action === "build") {
    const localPath = await promptInput("Local path to upload/build", ".");
    await runBuild(
      config,
      localPath,
      await selectMachine(config.machine),
    );
    return;
  }

  if (action === "run-local") {
    const localPath = await promptInput("Local path to upload/run", ".");
    const remoteCmd = await promptInput(
      "Run command in uploaded project directory",
      "python3 --version",
    );
    await runLocalProject(
      config,
      localPath,
      remoteCmd,
      await selectMachine(config.machine),
    );
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(Bun.argv.slice(2));
  const effectiveFlags = { ...parsed.flags };

  if (
    parsed.command === "vnc" &&
    !effectiveFlags.display &&
    parsed.positionals.length >= 3
  ) {
    effectiveFlags.display = parseDisplayToken(parsed.positionals[2]);
  }

  if (
    parsed.command === "tunnel" &&
    parsed.subcommand === "close" &&
    !effectiveFlags.display &&
    parsed.positionals.length >= 3
  ) {
    effectiveFlags.display = parseDisplayToken(parsed.positionals[2]);
  }

  if (
    parsed.command === "help" ||
    parsed.command === "--help" ||
    parsed.command === "-h"
  ) {
    printHelp();
    return;
  }

  if (!parsed.command || parsed.command === "interactive") {
    if (!supportsInteractivePrompts()) {
      throw new Error(
        "Interactive prompt is unavailable. Use subcommands with explicit flags instead.",
      );
    }
    await runInteractive(parsed.flags);
    return;
  }

  if (parsed.command === "user") {
    if (parsed.subcommand === "list" || !parsed.subcommand) {
      const profiles = loadUserProfiles();

      if (profiles.users.length === 0) {
        console.log("No saved usernames yet.");
        return;
      }

      console.log("Saved usernames:");
      for (const user of profiles.users) {
        const marker = profiles.defaultUser === user ? " (default)" : "";
        console.log(`  - ${user}${marker}`);
      }
      return;
    }

    if (parsed.subcommand === "select") {
      const selectedUser = await selectOrAddUserProfile();
      console.log(`Active username profile set to: ${selectedUser}`);
      return;
    }

    if (parsed.subcommand === "add") {
      const fromFlag = effectiveFlags.name;

      if (fromFlag) {
        const normalized = normalizeUsername(fromFlag);
        rememberUserProfile(normalized);
        console.log(`Saved username profile: ${normalized}`);
        return;
      }

      if (!supportsInteractivePrompts()) {
        throw new Error(
          "Missing username. Use: tue user add --name <username>",
        );
      }

      const entered = normalizeUsername(await promptInput("WSI username"));
      rememberUserProfile(entered);
      console.log(`Saved username profile: ${entered}`);
      return;
    }

    throw new Error("Unknown user subcommand. Use: user list | user select | user add");
  }

  effectiveFlags.user = await resolveUserFlag(effectiveFlags, Bun.env);

  const config = resolveConfig(effectiveFlags, Bun.env);
  if (!config.dryRun) {
    rememberUserProfile(config.user);
  }
  printGatewayGuidance(config.gateway);
  printActiveIdentity(config);

  switch (parsed.command) {
    case "connect": {
      const mode = (parsed.subcommand ?? "shell") as "shell" | "tunnel" | "vnc";

      if (mode !== "shell" && mode !== "tunnel" && mode !== "vnc") {
        throw new Error(
          "Unknown connect mode. Use: connect shell | connect tunnel | connect vnc",
        );
      }

      await runConnectMode(mode, config);
      return;
    }

    case "build": {
      const localPath = parsed.subcommand ?? ".";

      const buildSettings = resolveBuildSettings(parsed.flags, localPath, Bun.env);
      const machine = config.machine ? ensureMachine(config.machine) : undefined;
      let selectedMachine = machine;
      let commands: string[];

      if (machine !== undefined) {
        commands = createBuildCommands({
          user: config.user,
          gateway: config.gateway,
          machine,
          localPath,
          projectName: buildSettings.projectName,
          remoteRoot: buildSettings.remoteRoot,
          buildCommand: buildSettings.buildCommand,
          artifactPath: buildSettings.artifactPath,
          outputDir: buildSettings.outputDir,
          keepRemote: buildSettings.keepRemote,
        });
      } else if (supportsInteractivePrompts()) {
        selectedMachine = await selectMachine();
        commands = createBuildCommands({
          user: config.user,
          gateway: config.gateway,
          machine: selectedMachine,
          localPath,
          projectName: buildSettings.projectName,
          remoteRoot: buildSettings.remoteRoot,
          buildCommand: buildSettings.buildCommand,
          artifactPath: buildSettings.artifactPath,
          outputDir: buildSettings.outputDir,
          keepRemote: buildSettings.keepRemote,
        });
      } else {
        commands = [
          createBuildCommandsWithMachineSelection({
            user: config.user,
            gateway: config.gateway,
            selectorCommand: buildLivePoolSmiCommand(config),
            localPath,
            projectName: buildSettings.projectName,
            remoteRoot: buildSettings.remoteRoot,
            buildCommand: buildSettings.buildCommand,
            artifactPath: buildSettings.artifactPath,
            outputDir: buildSettings.outputDir,
            keepRemote: buildSettings.keepRemote,
          }),
        ];
      }

      if (selectedMachine) {
        warnOnRestrictedMachine(selectedMachine);
      }
      executeAll(commands, config.dryRun);
      return;
    }

    case "run": {
      const localPath = parsed.subcommand ?? ".";
      const runSettings = resolveRunSettings(parsed.flags, localPath, Bun.env);
      const machine = config.machine ? ensureMachine(config.machine) : undefined;
      let selectedMachine = machine;
      let commands: string[];

      if (machine !== undefined) {
        commands = createRunCommands({
          user: config.user,
          gateway: config.gateway,
          machine,
          localPath,
          projectName: runSettings.projectName,
          remoteRoot: runSettings.remoteRoot,
          runCommand: runSettings.runCommand,
          keepRemote: runSettings.keepRemote,
        });
      } else if (supportsInteractivePrompts()) {
        selectedMachine = await selectMachine();
        commands = createRunCommands({
          user: config.user,
          gateway: config.gateway,
          machine: selectedMachine,
          localPath,
          projectName: runSettings.projectName,
          remoteRoot: runSettings.remoteRoot,
          runCommand: runSettings.runCommand,
          keepRemote: runSettings.keepRemote,
        });
      } else {
        commands = [
          createRunCommandsWithMachineSelection({
            user: config.user,
            gateway: config.gateway,
            selectorCommand: buildLivePoolSmiCommand(config),
            localPath,
            projectName: runSettings.projectName,
            remoteRoot: runSettings.remoteRoot,
            runCommand: runSettings.runCommand,
            keepRemote: runSettings.keepRemote,
          }),
        ];
      }

      if (selectedMachine) {
        warnOnRestrictedMachine(selectedMachine);
      }

      executeAll(commands, config.dryRun);
      return;
    }

    case "machines": {
      if (parsed.subcommand && parsed.subcommand !== "list") {
        throw new Error("Unknown machines subcommand. Use: machines list");
      }

      await runMachineList(config, {
        live: parseTruthy(effectiveFlags.live),
      });
      return;
    }

    case "remote": {
      if (parsed.subcommand !== "run") {
        throw new Error("Unknown remote subcommand. Use: remote run");
      }

      const machine = ensureMachine(config.machine);
      warnOnRestrictedMachine(machine);

      const command = buildPoolCommand({
        username: config.user,
        gateway: config.gateway,
        machine,
        remoteCommand: ensureRemoteCommand(parsed.flags.cmd),
      });

      execute(command, config.dryRun);
      return;
    }

    case "vnc": {
      const machine = ensureMachine(config.machine);
      validateVncDisplay(config.display);
      warnOnRestrictedMachine(machine);

      if (parsed.subcommand === "start") {
        const command = buildProxyJumpPoolCommand({
          username: config.user,
          gateway: config.gateway,
          machine,
          remoteCommand: buildVncStartRemoteCommand(config.display),
        });
        execute(command, config.dryRun);
        return;
      }

      if (parsed.subcommand === "list") {
        const command = buildProxyJumpPoolCommand({
          username: config.user,
          gateway: config.gateway,
          machine,
          remoteCommand: buildVncListRemoteCommand(),
        });
        execute(command, config.dryRun);
        return;
      }

      if (parsed.subcommand === "kill") {
        const command = buildProxyJumpPoolCommand({
          username: config.user,
          gateway: config.gateway,
          machine,
          remoteCommand: buildVncKillRemoteCommand(config.display),
        });
        execute(command, config.dryRun);

        if (!parseTruthy(effectiveFlags["keep-tunnel"])) {
          closeLocalSshTunnels({
            user: config.user,
            gateway: config.gateway,
            machine,
            remotePort: getVncRemotePort(config.display),
            dryRun: config.dryRun,
          });
        }

        return;
      }

      throw new Error("Unknown vnc subcommand. Use: vnc start | vnc list | vnc kill");
    }

    case "tunnel": {
      if (parsed.subcommand === "open") {
        const machine = ensureMachine(config.machine);
        validateVncDisplay(config.display);
        validateLocalPort(config.localPort);
        warnOnRestrictedMachine(machine);

        const selectedLocalPort = await chooseLocalPort(config.localPort);

        if (selectedLocalPort !== config.localPort) {
          console.warn(
            `tue-cli note: local port ${config.localPort} is in use; using ${selectedLocalPort} instead.`,
          );
        }

        const command = buildTunnelCommand({
          username: config.user,
          gateway: config.gateway,
          machine,
          localPort: selectedLocalPort,
          remotePort: getVncRemotePort(config.display),
        });

        execute(command, config.dryRun);
        console.log(
          `Tunnel opened on localhost:${selectedLocalPort} -> ${machine}:${getVncRemotePort(config.display)}.`,
        );
        return;
      }

      if (parsed.subcommand === "close") {
        const machine = config.machine
          ? sanitizeMachineName(config.machine)
          : undefined;

        if (machine) {
          warnOnRestrictedMachine(machine);
        }

        const remotePort = effectiveFlags.display
          ? getVncRemotePort(config.display)
          : undefined;
        const localPort = effectiveFlags["local-port"]
          ? config.localPort
          : undefined;

        closeLocalSshTunnels({
          user: config.user,
          gateway: config.gateway,
          machine,
          remotePort,
          localPort,
          dryRun: config.dryRun,
        });
        return;
      }

      throw new Error("Unknown tunnel subcommand. Use: tunnel open | tunnel close");
    }

    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(`tue-cli error: ${message}`);
  process.exit(1);
});
