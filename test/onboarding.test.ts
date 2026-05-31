import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDoctorReport } from "../src/doctor";
import { runInitCommand } from "../src/cli/init";
import { getDefaultClusterProfile } from "../src/cluster-profiles";
import { getDefaultUserProfile } from "../src/user-profiles";

function makeEnv(): { env: Record<string, string>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "tue-cli-onboarding-"));
  return {
    env: {
      HOME: dir,
      XDG_CONFIG_HOME: dir,
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("onboarding commands", () => {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  test("init saves user and cluster profile from flags", async () => {
    const { env, cleanup } = makeEnv();
    const messages: string[] = [];

    try {
      await runInitCommand({
        user: "alice",
        cluster: "lab",
        gateway: "sshgw.example.org",
        machines: "gpu01,gpu02",
        "default-machine": "gpu01",
        "remote-root": "~/work",
      }, env, (message) => messages.push(message));

      expect(getDefaultUserProfile(env)).toBe("alice");
      expect(getDefaultClusterProfile(env)?.gateway).toBe("sshgw.example.org");
      expect(
        createDoctorReport({ cluster: "lab" }, env, () => true)
          .checks.find((check) => check.name === "user")?.detail,
      ).toBe("using alice");
      expect(messages.some((line) => line.includes("Saved cluster profile: lab"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("doctor reports missing tools and configuration without throwing", () => {
    const report = createDoctorReport(
      { user: "alice", gateway: "sshgw.example.org" },
      {},
      (tool) => tool === "ssh",
    );

    expect(report.checks.find((check) => check.name === "ssh")?.ok).toBe(true);
    expect(report.checks.find((check) => check.name === "rsync")?.ok).toBe(false);
    expect(report.summary.ok).toBe(false);
  });
});
