import { describe, expect, test } from "bun:test";
import { runCli } from "../src/cli/dispatch";

describe("runCli", () => {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  test("supports whoami as a top-level command", async () => {
    const originalLog = console.log;
    const messages: string[] = [];

    console.log = (...args: unknown[]) => {
      messages.push(args.map((value) => String(value)).join(" "));
    };

    try {
      await runCli([
        "whoami",
        "--user",
        "alice",
        "--gateway",
        "sshgw.example.org",
      ]);
    } finally {
      console.log = originalLog;
    }

    expect(messages.length).toBe(1);
    expect(messages[0]).toBe(
      "tue-cli active identity: alice@sshgw.example.org",
    );
  });
});
