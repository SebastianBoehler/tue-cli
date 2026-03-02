import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli-args";

describe("parseArgs", () => {
  test("parses command, subcommand and flags", () => {
    const parsed = parseArgs([
      "vnc",
      "start",
      "--machine",
      "cgpool1907",
      "--display",
      "2",
      "--user",
      "alice",
      "--dry-run",
    ]);

    expect(parsed.command).toBe("vnc");
    expect(parsed.subcommand).toBe("start");
    expect(JSON.stringify(parsed.positionals)).toBe(
      JSON.stringify(["vnc", "start"]),
    );
    expect(parsed.flags.machine).toBe("cgpool1907");
    expect(parsed.flags.display).toBe("2");
    expect(parsed.flags.user).toBe("alice");
    expect(parsed.flags["dry-run"]).toBe("true");
  });

  test("parses remote run command flag", () => {
    const parsed = parseArgs([
      "remote",
      "run",
      "--machine",
      "cgpool1907",
      "--cmd",
      "nvcc --version && nvidia-smi",
    ]);

    expect(parsed.command).toBe("remote");
    expect(parsed.subcommand).toBe("run");
    expect(JSON.stringify(parsed.positionals)).toBe(
      JSON.stringify(["remote", "run"]),
    );
    expect(parsed.flags.machine).toBe("cgpool1907");
    expect(parsed.flags.cmd).toBe("nvcc --version && nvidia-smi");
  });

  test("parses connect shell flags", () => {
    const parsed = parseArgs([
      "connect",
      "shell",
      "--machine",
      "cgpool1912",
      "--dry-run",
    ]);

    expect(parsed.command).toBe("connect");
    expect(parsed.subcommand).toBe("shell");
    expect(JSON.stringify(parsed.positionals)).toBe(
      JSON.stringify(["connect", "shell"]),
    );
    expect(parsed.flags.machine).toBe("cgpool1912");
    expect(parsed.flags["dry-run"]).toBe("true");
  });

  test("keeps extra positional arguments", () => {
    const parsed = parseArgs(["vnc", "kill", ":7"]);

    expect(parsed.command).toBe("vnc");
    expect(parsed.subcommand).toBe("kill");
    expect(JSON.stringify(parsed.positionals)).toBe(
      JSON.stringify(["vnc", "kill", ":7"]),
    );
    expect(parsed.flags.display).toBe(undefined);
  });
});
