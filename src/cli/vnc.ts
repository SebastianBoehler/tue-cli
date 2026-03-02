import type { ResolvedConfig } from "../config";
import {
  buildProxyJumpPoolCommand,
  buildVncConnectRemoteCommand,
  buildVncKillRemoteCommand,
  buildVncListRemoteCommand,
} from "../ssh";
import { selectMenuOption } from "../ui";
import { execute, executeCapture } from "./execution";
import type { CommandRuntimeOptions } from "./types";

export type VncSession = {
  display: number;
  processId?: number;
};

export type RunVncKillOptions = CommandRuntimeOptions & {
  requestedDisplay: number;
  requestedDisplayExplicit: boolean;
  allowInteractiveSelection: boolean;
};

function parseVncSessionLine(line: string): VncSession | undefined {
  const trimmed = line.trim();
  const match = trimmed.match(/^:(\d+)(?:\s+(\d+))?/);

  if (!match) {
    return undefined;
  }

  return {
    display: Number.parseInt(match[1], 10),
    processId: match[2] ? Number.parseInt(match[2], 10) : undefined,
  };
}

export function parseVncSessions(listOutput: string): VncSession[] {
  const byDisplay = new Map<number, VncSession>();

  for (const line of listOutput.split("\n")) {
    const parsed = parseVncSessionLine(line);
    if (parsed) {
      byDisplay.set(parsed.display, parsed);
    }
  }

  return Array.from(byDisplay.values()).sort(
    (left, right) => left.display - right.display,
  );
}

function listOwnVncSessions(
  config: ResolvedConfig,
  machine: string,
): VncSession[] {
  const listOutput = executeCapture(
    buildProxyJumpPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildVncListRemoteCommand(),
    }),
    false,
  );
  return parseVncSessions(listOutput);
}

export function runVncStartOrReuse(
  config: ResolvedConfig,
  machine: string,
  options?: CommandRuntimeOptions,
): number | undefined {
  const command = buildProxyJumpPoolCommand({
    username: config.user,
    gateway: config.gateway,
    machine,
    remoteCommand: buildVncConnectRemoteCommand(config.display, config.vncVm),
  });

  if (config.dryRun) {
    execute(command, true, options);
    return undefined;
  }

  const startOutput = executeCapture(command, false);
  const displayMatch = startOutput.match(/TUE_VNC_DISPLAY=(\d+)/);
  const resolvedDisplay = displayMatch
    ? Number.parseInt(displayMatch[1], 10)
    : undefined;
  const visibleOutput = startOutput
    .split("\n")
    .filter((line) => !line.startsWith("TUE_VNC_DISPLAY="))
    .join("\n")
    .trim();

  if (visibleOutput) {
    console.log(visibleOutput);
  }

  if (resolvedDisplay !== undefined) {
    console.log(
      `VNC session ready on ${machine}: display :${resolvedDisplay}.`,
    );
  }

  return resolvedDisplay;
}

export async function runVncKill(
  config: ResolvedConfig,
  machine: string,
  options: RunVncKillOptions,
): Promise<number | undefined> {
  if (config.dryRun) {
    execute(
      buildProxyJumpPoolCommand({
        username: config.user,
        gateway: config.gateway,
        machine,
        remoteCommand: buildVncKillRemoteCommand(options.requestedDisplay),
      }),
      true,
      options,
    );
    return options.requestedDisplay;
  }

  const sessions = listOwnVncSessions(config, machine);
  if (sessions.length === 0) {
    throw new Error(
      `No VNC sessions owned by ${config.user} found on ${machine}.`,
    );
  }

  const ownedDisplays = sessions.map((session) => session.display);
  let targetDisplay: number | undefined;

  if (options.requestedDisplayExplicit) {
    if (!ownedDisplays.includes(options.requestedDisplay)) {
      throw new Error(
        `Display :${options.requestedDisplay} is not one of your VNC sessions on ${machine}. Your sessions: ${ownedDisplays.map((display) => `:${display}`).join(", ")}.`,
      );
    }
    targetDisplay = options.requestedDisplay;
  } else if (sessions.length === 1) {
    targetDisplay = sessions[0].display;
  } else if (options.allowInteractiveSelection) {
    const selectedDisplay = await selectMenuOption(
      "Select your VNC display to kill",
      sessions.map((session) => ({
        value: String(session.display),
        label: session.processId
          ? `:${session.display} (pid ${session.processId})`
          : `:${session.display}`,
      })),
      ownedDisplays.includes(options.requestedDisplay)
        ? String(options.requestedDisplay)
        : String(sessions[0].display),
    );
    targetDisplay = Number.parseInt(selectedDisplay, 10);
  } else {
    throw new Error(
      `Multiple VNC sessions found on ${machine}: ${ownedDisplays.map((display) => `:${display}`).join(", ")}. Pass --display :N to choose one.`,
    );
  }

  execute(
    buildProxyJumpPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildVncKillRemoteCommand(targetDisplay),
    }),
    false,
    options,
  );

  return targetDisplay;
}
