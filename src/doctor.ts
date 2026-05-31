import { spawnSync } from "node:child_process";
import { getClusterProfile, getDefaultClusterProfile } from "./cluster-profiles";
import { DEFAULT_GATEWAY } from "./machines";
import { getDefaultUserProfile } from "./user-profiles";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type DoctorReport = {
  checks: DoctorCheck[];
  summary: {
    ok: boolean;
    failures: number;
  };
};

type EnvLike = Record<string, string | undefined>;
type ToolChecker = (tool: string) => boolean;

function commandExists(tool: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${tool}`], {
    stdio: "ignore",
  }).status === 0;
}

function check(name: string, ok: boolean, detail: string): DoctorCheck {
  return { name, ok, detail };
}

export function createDoctorReport(
  flags: Record<string, string>,
  env: EnvLike = Bun.env,
  hasTool: ToolChecker = commandExists,
): DoctorReport {
  const cluster = flags.cluster
    ? getClusterProfile(flags.cluster, env)
    : getDefaultClusterProfile(env);
  const user = flags.user ?? env.TUE_USER ?? getDefaultUserProfile(env);
  const gateway = flags.gateway ?? env.TUE_GATEWAY ?? cluster?.gateway ?? DEFAULT_GATEWAY;
  const machine = flags.machine ?? env.TUE_MACHINE ?? cluster?.defaultMachine;
  const checks = [
    check("ssh", hasTool("ssh"), "required for all remote commands"),
    check("rsync", hasTool("rsync"), "required for project sync and run/build upload"),
    check("user", Boolean(user), user ? `using ${user}` : "set TUE_USER or run tue init"),
    check("gateway", Boolean(gateway), gateway ? `using ${gateway}` : "set a gateway"),
    check("machine", Boolean(machine), machine ? `using ${machine}` : "set a default machine"),
  ];
  const failures = checks.filter((entry) => !entry.ok).length;

  return {
    checks,
    summary: {
      ok: failures === 0,
      failures,
    },
  };
}

export function printDoctorReport(report: DoctorReport): void {
  console.log("tue doctor");
  for (const entry of report.checks) {
    const marker = entry.ok ? "ok" : "missing";
    console.log(`  ${marker} ${entry.name}: ${entry.detail}`);
  }

  if (!report.summary.ok) {
    console.log(`Found ${report.summary.failures} issue(s).`);
    return;
  }

  console.log("Environment checks passed.");
}
