import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findDetachedRun,
  findLatestDetachedRun,
  getRunHistoryPath,
  loadRunHistory,
  rememberDetachedRun,
} from "../src/run-history";

const fixtureRoot = join(tmpdir(), "tue-cli-run-history-tests");

function resetFixtureRoot(): void {
  rmSync(fixtureRoot, { recursive: true, force: true });
  mkdirSync(fixtureRoot, { recursive: true });
}

describe("run-history", () => {
  test("resolves history path via XDG_CONFIG_HOME", () => {
    resetFixtureRoot();

    const env = {
      XDG_CONFIG_HOME: fixtureRoot,
      HOME: "/Users/test-user",
    };

    expect(getRunHistoryPath(env)).toBe(
      join(fixtureRoot, "tue-cli", "runs.json"),
    );
  });

  test("stores and retrieves detached runs", () => {
    resetFixtureRoot();

    const env = {
      XDG_CONFIG_HOME: fixtureRoot,
      HOME: "/Users/test-user",
    };

    rememberDetachedRun(
      {
        id: "run-abc",
        user: "alice",
        gateway: "sshgw.example.org",
        machine: "cgpool1903",
        projectPath: "/home/alice/project",
        logPath: ".tue-runs/run-abc.log",
        pid: 12345,
        command: "python3 train.py",
        startedAt: "2026-03-02T12:00:00.000Z",
      },
      env,
    );

    rememberDetachedRun(
      {
        id: "run-def",
        user: "alice",
        gateway: "sshgw.example.org",
        machine: "cgpool1905",
        projectPath: "/home/alice/project2",
        logPath: ".tue-runs/run-def.log",
        pid: 22345,
        command: "python3 eval.py",
        startedAt: "2026-03-02T13:00:00.000Z",
      },
      env,
    );

    const loaded = loadRunHistory(env);
    expect(loaded.runs.length).toBe(2);
    expect(loaded.runs[0]?.id).toBe("run-def");

    expect(findDetachedRun("run-abc", env)?.machine).toBe("cgpool1903");
    expect(findLatestDetachedRun({ user: "alice" }, env)?.id).toBe("run-def");
    expect(
      findLatestDetachedRun({ user: "alice", machine: "cgpool1903" }, env)?.id,
    ).toBe("run-abc");

    const content = readFileSync(getRunHistoryPath(env), "utf8");
    expect(content.includes("run-def")).toBe(true);
  });
});
