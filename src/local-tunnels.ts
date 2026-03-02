export type LocalTunnel = {
  pid: number;
  command: string;
  localPort: number;
  machine: string;
  remotePort: number;
};

export type LocalTunnelFilter = {
  user?: string;
  gateway?: string;
  machine?: string;
  localPort?: number;
  remotePort?: number;
};

function stripShellQuotes(value: string): string {
  const singleQuoted = value.startsWith("'") && value.endsWith("'");
  const doubleQuoted = value.startsWith('"') && value.endsWith('"');

  if ((singleQuoted || doubleQuoted) && value.length >= 2) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseLocalTunnelsFromPsOutput(output: string): LocalTunnel[] {
  const tunnels: LocalTunnel[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const pidAndCommand = line.match(/^\s*(\d+)\s+(.*)$/);

    if (!pidAndCommand) {
      continue;
    }

    const pid = Number.parseInt(pidAndCommand[1], 10);
    const command = pidAndCommand[2];

    if (!Number.isFinite(pid) || !/\bssh\b/.test(command)) {
      continue;
    }

    const forwardRegex = /(?:^|\s)-L\s*([0-9]+):([^\s:]+):([0-9]+)(?=\s|$)/g;
    let match: RegExpExecArray | null = null;

    while ((match = forwardRegex.exec(command)) !== null) {
      tunnels.push({
        pid,
        command,
        localPort: Number.parseInt(match[1], 10),
        machine: stripShellQuotes(match[2]).toLowerCase(),
        remotePort: Number.parseInt(match[3], 10),
      });
    }
  }

  return tunnels;
}

export function findMatchingTunnelPids(
  tunnels: LocalTunnel[],
  filter: LocalTunnelFilter,
): number[] {
  const machine = filter.machine?.toLowerCase();
  const userAtGateway =
    filter.user && filter.gateway ? `${filter.user}@${filter.gateway}` : undefined;

  const matching = tunnels.filter((tunnel) => {
    if (machine && tunnel.machine !== machine) {
      return false;
    }

    if (
      typeof filter.localPort === "number" &&
      tunnel.localPort !== filter.localPort
    ) {
      return false;
    }

    if (
      typeof filter.remotePort === "number" &&
      tunnel.remotePort !== filter.remotePort
    ) {
      return false;
    }

    if (userAtGateway && !tunnel.command.includes(userAtGateway)) {
      return false;
    }

    return true;
  });

  return [...new Set(matching.map((entry) => entry.pid))].sort((a, b) => a - b);
}
