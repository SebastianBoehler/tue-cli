import { describe, expect, test } from "bun:test";
import { resolveConfig } from "../src/config";

describe("resolveConfig", () => {
  test("prefers CLI args over environment", () => {
    const config = resolveConfig(
      {
        user: "cli-user",
        gateway: "sshgw.example.org",
      },
      {
        TUE_USER: "env-user",
        TUE_GATEWAY: "sshgw.cs.uni-tuebingen.de",
      }
    );

    expect(config.user).toBe("cli-user");
    expect(config.gateway).toBe("sshgw.example.org");
  });

  test("uses environment when args are missing", () => {
    const config = resolveConfig(
      {},
      {
        TUE_USER: "env-user",
        TUE_GATEWAY: "sshgw.cs.uni-tuebingen.de",
      }
    );

    expect(config.user).toBe("env-user");
    expect(config.gateway).toBe("sshgw.cs.uni-tuebingen.de");
  });

  test("throws when user is missing", () => {
    expect(() => resolveConfig({}, { TUE_GATEWAY: "sshgw.cs.uni-tuebingen.de" })).toThrow(
      "Missing username"
    );
  });

  test("accepts display 0 for VNC port 5900", () => {
    const config = resolveConfig(
      { user: "cli-user", display: "0" },
      { TUE_GATEWAY: "sshgw.cs.uni-tuebingen.de" }
    );

    expect(config.display).toBe(0);
    expect(config.localPort).toBe(5900);
  });

  test("accepts vnc-vm from flags", () => {
    const config = resolveConfig(
      { user: "cli-user", "vnc-vm": "plasma" },
      { TUE_GATEWAY: "sshgw.cs.uni-tuebingen.de" }
    );

    expect(config.vncVm).toBe("plasma");
  });

  test("rejects invalid vnc-vm values", () => {
    expect(() =>
      resolveConfig(
        { user: "cli-user", "vnc-vm": "plasma;rm -rf /" },
        { TUE_GATEWAY: "sshgw.cs.uni-tuebingen.de" }
      )
    ).toThrow("Invalid vnc-vm");
  });
});
