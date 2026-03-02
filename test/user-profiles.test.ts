import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getDefaultUserProfile,
  getUserProfileStorePath,
  loadUserProfiles,
  rememberUserProfile,
  setDefaultUserProfile,
} from "../src/user-profiles";

function makeEnv(): { env: Record<string, string>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "tue-cli-profiles-"));
  return {
    env: {
      HOME: dir,
      XDG_CONFIG_HOME: dir,
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("user profile store", () => {
  test("uses global config path", () => {
    const { env, cleanup } = makeEnv();

    try {
      const path = getUserProfileStorePath(env);
      expect(path.endsWith("/tue-cli/profiles.json")).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("remembers and defaults to last used user", () => {
    const { env, cleanup } = makeEnv();

    try {
      rememberUserProfile("alice", env);
      rememberUserProfile("bob", env);

      const loaded = loadUserProfiles(env);
      expect(JSON.stringify(loaded.users)).toBe(JSON.stringify(["bob", "alice"]));
      expect(loaded.defaultUser).toBe("bob");
      expect(getDefaultUserProfile(env)).toBe("bob");
    } finally {
      cleanup();
    }
  });

  test("setDefaultUserProfile promotes selected user", () => {
    const { env, cleanup } = makeEnv();

    try {
      rememberUserProfile("alice", env);
      rememberUserProfile("bob", env);
      setDefaultUserProfile("alice", env);

      const loaded = loadUserProfiles(env);
      expect(JSON.stringify(loaded.users)).toBe(JSON.stringify(["alice", "bob"]));
      expect(loaded.defaultUser).toBe("alice");
    } finally {
      cleanup();
    }
  });
});
