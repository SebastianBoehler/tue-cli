import { describe, expect, test } from "bun:test";
import { parseVncSessions } from "../src/cli/vnc";

describe("vnc session parsing", () => {
  test("parses TurboVNC list output with process ids", () => {
    const output = `
TurboVNC sessions:

X DISPLAY #     PROCESS ID      NOVNC PROCESS ID
:7              2178142
:3              10203
`;

    expect(JSON.stringify(parseVncSessions(output))).toBe(
      JSON.stringify([
        { display: 3, processId: 10203 },
        { display: 7, processId: 2178142 },
      ]),
    );
  });

  test("ignores unrelated lines and deduplicates displays", () => {
    const output = `
TurboVNC sessions:
:7              2178142
garbage line
:7              2178142
:9
`;

    expect(JSON.stringify(parseVncSessions(output))).toBe(
      JSON.stringify([
        { display: 7, processId: 2178142 },
        { display: 9, processId: undefined },
      ]),
    );
  });
});
