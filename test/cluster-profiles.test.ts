import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getDefaultClusterProfile,
  getClusterProfileStorePath,
  loadClusterProfiles,
  saveClusterProfile,
  setDefaultClusterProfile,
} from "../src/cluster-profiles";
import { resolveConfig } from "../src/config";

function makeEnv(): { env: Record<string, string>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "tue-cli-clusters-"));
  return {
    env: {
      HOME: dir,
      XDG_CONFIG_HOME: dir,
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("cluster profile store", () => {
  test("uses global config path", () => {
    const { env, cleanup } = makeEnv();

    try {
      const path = getClusterProfileStorePath(env);
      expect(path.endsWith("/tue-cli/clusters.json")).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("saves and selects default cluster profiles", () => {
    const { env, cleanup } = makeEnv();

    try {
      saveClusterProfile({
        name: "lab",
        gateway: "sshgw.example.org",
        machines: ["gpu01", "gpu02"],
        defaultMachine: "gpu01",
        remoteRoot: "~/remote",
        vncVm: "xfce",
      }, env);

      const store = loadClusterProfiles(env);
      expect(store.defaultCluster).toBe("lab");
      expect(store.clusters[0]?.gateway).toBe("sshgw.example.org");
      expect(getDefaultClusterProfile(env)?.name).toBe("lab");
    } finally {
      cleanup();
    }
  });

  test("resolves config from selected cluster below flags and env", () => {
    const { env, cleanup } = makeEnv();

    try {
      saveClusterProfile({
        name: "lab",
        gateway: "sshgw.example.org",
        machines: ["gpu01"],
        defaultMachine: "gpu01",
        vncVm: "xfce",
      }, env);
      setDefaultClusterProfile("lab", env);

      const config = resolveConfig({ user: "alice" }, env);
      expect(config.gateway).toBe("sshgw.example.org");
      expect(config.machine).toBe("gpu01");
      expect(config.vncVm).toBe("xfce");

      const overridden = resolveConfig({ user: "alice", machine: "gpu02" }, env);
      expect(overridden.machine).toBe("gpu02");
    } finally {
      cleanup();
    }
  });
});
