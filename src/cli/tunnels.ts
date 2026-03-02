import {
  findMatchingTunnelPids,
  parseLocalTunnelsFromPsOutput,
} from "../local-tunnels";

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

export function closeLocalSshTunnels(options: {
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
