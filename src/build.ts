type BuildCommandOptions = {
  user: string;
  gateway: string;
  machine: string;
  localPath: string;
  projectName?: string;
  remoteRoot: string;
  buildCommand: string;
  artifactPath: string;
  outputDir: string;
  keepRemote?: boolean;
};

type RunCommandOptions = {
  user: string;
  gateway: string;
  machine: string;
  localPath: string;
  projectName?: string;
  remoteRoot: string;
  runCommand: string;
  keepRemote?: boolean;
};

type SyncCommandOptions = {
  user: string;
  gateway: string;
  machine: string;
  localPath: string;
  projectName?: string;
  remoteRoot: string;
  keepRemote?: boolean;
};

type BuildMachineSelectionCommandOptions = Omit<
  BuildCommandOptions,
  "machine"
> & {
  selectorCommand: string;
};

type RunMachineSelectionCommandOptions = Omit<RunCommandOptions, "machine"> & {
  selectorCommand: string;
};

type SyncMachineSelectionCommandOptions = Omit<SyncCommandOptions, "machine"> & {
  selectorCommand: string;
};

function normalizeRemoteRoot(pathValue: string): string {
  if (!pathValue) {
    return "~/exercise00";
  }

  return trimTrailingSlashes(pathValue);
}

function escapeForSingleQuotes(input: string): string {
  return input.replace(/'/g, "'\\''");
}

function quoteSingle(input: string): string {
  return `'${escapeForSingleQuotes(input)}'`;
}

function trimTrailingSlashes(pathValue: string): string {
  if (pathValue === "/") {
    return "/";
  }

  return pathValue.replace(/\/+$/, "");
}

function inferProjectName(localPath: string): string {
  const normalized = trimTrailingSlashes(localPath);

  if (!normalized || normalized === "." || normalized === "./") {
    return "project";
  }

  const parts = normalized.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];

  return last || "project";
}

export function createBuildCommands(options: BuildCommandOptions): string[] {
  const projectName =
    options.projectName ?? inferProjectName(options.localPath);
  const remoteRoot = normalizeRemoteRoot(options.remoteRoot);
  const remoteProjectPath = `${remoteRoot}/${projectName}`;
  const remoteBuildScript = `cd ${remoteProjectPath} && ${options.buildCommand}`;
  const remoteTarget = `${options.user}@${options.machine}`;
  const sharedSshOptions =
    "-o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C";
  const sshPrefix = `ssh ${sharedSshOptions} -J ${options.user}@${options.gateway} ${remoteTarget}`;
  const scpPrefix = `scp ${sharedSshOptions} -r -o ProxyJump=${options.user}@${options.gateway}`;

  const remotePrepCommand = options.keepRemote
    ? `${sshPrefix} "mkdir -p ${remoteRoot}"`
    : `${sshPrefix} "rm -rf ${remoteProjectPath} && mkdir -p ${remoteRoot}"`;

  const uploadCommand = `${scpPrefix} ${quoteSingle(options.localPath)} ${remoteTarget}:${remoteProjectPath}`;
  const remoteBuildCommand = `${sshPrefix} "bash -lc ${quoteSingle(remoteBuildScript)}"`;
  const localOutputCreateCommand = `mkdir -p ${quoteSingle(options.outputDir)}`;
  const downloadCommand = `${scpPrefix} ${remoteTarget}:${remoteProjectPath}/${options.artifactPath} ${quoteSingle(options.outputDir)}`;

  return [
    remotePrepCommand,
    uploadCommand,
    remoteBuildCommand,
    localOutputCreateCommand,
    downloadCommand,
  ];
}

export function createRunCommands(options: RunCommandOptions): string[] {
  const projectName =
    options.projectName ?? inferProjectName(options.localPath);
  const remoteRoot = normalizeRemoteRoot(options.remoteRoot);
  const remoteProjectPath = `${remoteRoot}/${projectName}`;
  const remoteRunScript = `cd ${remoteProjectPath} && ${options.runCommand}`;
  const remoteTarget = `${options.user}@${options.machine}`;
  const sharedSshOptions =
    "-o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C";
  const sshPrefix = `ssh ${sharedSshOptions} -J ${options.user}@${options.gateway} ${remoteTarget}`;
  const scpPrefix = `scp ${sharedSshOptions} -r -o ProxyJump=${options.user}@${options.gateway}`;

  const remotePrepCommand = options.keepRemote
    ? `${sshPrefix} "mkdir -p ${remoteRoot}"`
    : `${sshPrefix} "rm -rf ${remoteProjectPath} && mkdir -p ${remoteRoot}"`;

  const uploadCommand = `${scpPrefix} ${quoteSingle(options.localPath)} ${remoteTarget}:${remoteProjectPath}`;
  const remoteRunCommand = `${sshPrefix} "bash -lc ${quoteSingle(remoteRunScript)}"`;

  return [remotePrepCommand, uploadCommand, remoteRunCommand];
}

export function createSyncCommands(options: SyncCommandOptions): string[] {
  const projectName =
    options.projectName ?? inferProjectName(options.localPath);
  const remoteRoot = normalizeRemoteRoot(options.remoteRoot);
  const remoteProjectPath = `${remoteRoot}/${projectName}`;
  const remoteTarget = `${options.user}@${options.machine}`;
  const sharedSshOptions =
    "-o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C";
  const sshPrefix = `ssh ${sharedSshOptions} -J ${options.user}@${options.gateway} ${remoteTarget}`;
  const rsyncSshCommand = `ssh ${sharedSshOptions} -J ${options.user}@${options.gateway}`;
  const sourcePath = options.localPath.endsWith("/")
    ? options.localPath
    : `${options.localPath}/`;
  const deleteFlag = options.keepRemote ? "" : " --delete";

  const remotePrepCommand = `${sshPrefix} "mkdir -p ${remoteProjectPath}"`;
  const rsyncCommand = `rsync -az${deleteFlag} -e ${quoteSingle(rsyncSshCommand)} ${quoteSingle(sourcePath)} ${quoteSingle(`${remoteTarget}:${remoteProjectPath}/`)}`;

  return [remotePrepCommand, rsyncCommand];
}

export function createBuildCommandsWithMachineSelection(
  options: BuildMachineSelectionCommandOptions,
): string {
  const machineSelectionPrompt =
    "printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n \"$machine\" ] || { echo 'No machine selected.' >&2; exit 1; }";

  const chainedBuildSteps = createBuildCommands({
    ...options,
    machine: "$machine",
  }).join(" && ");

  return `${options.selectorCommand}; ${machineSelectionPrompt}; ${chainedBuildSteps}`;
}

export function createRunCommandsWithMachineSelection(
  options: RunMachineSelectionCommandOptions,
): string {
  const machineSelectionPrompt =
    "printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n \"$machine\" ] || { echo 'No machine selected.' >&2; exit 1; }";

  const chainedRunSteps = createRunCommands({
    ...options,
    machine: "$machine",
  }).join(" && ");

  return `${options.selectorCommand}; ${machineSelectionPrompt}; ${chainedRunSteps}`;
}

export function createSyncCommandsWithMachineSelection(
  options: SyncMachineSelectionCommandOptions,
): string {
  const machineSelectionPrompt =
    "printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n \"$machine\" ] || { echo 'No machine selected.' >&2; exit 1; }";

  const chainedSyncSteps = createSyncCommands({
    ...options,
    machine: "$machine",
  }).join(" && ");

  return `${options.selectorCommand}; ${machineSelectionPrompt}; ${chainedSyncSteps}`;
}
