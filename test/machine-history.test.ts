import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getMachineHistoryPath,
  loadMachineHistory,
  rememberMachine,
} from "../src/machine-history";

function makeEnv(): { env: Record<string, string>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "tue-cli-machines-"));
  return {
    env: {
      HOME: dir,
      XDG_CONFIG_HOME: dir,
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("machine history store", () => {
  test("uses global config path", () => {
    const { env, cleanup } = makeEnv();

    try {
      const path = getMachineHistoryPath(env);
      expect(path.endsWith("/tue-cli/machines.json")).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("remembers recent machines with most recent first", () => {
    const { env, cleanup } = makeEnv();

    try {
      rememberMachine("cgpool1905", env);
      rememberMachine("cgpool1907", env);
      rememberMachine("cgpool1905", env);

      const loaded = loadMachineHistory(env);
      expect(JSON.stringify(loaded.recentMachines)).toBe(
        JSON.stringify(["cgpool1905", "cgpool1907"]),
      );
    } finally {
      cleanup();
    }
  });
});
