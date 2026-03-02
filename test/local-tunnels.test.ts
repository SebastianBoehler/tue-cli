import { describe, expect, test } from "bun:test";
import {
  findMatchingTunnelPids,
  parseLocalTunnelsFromPsOutput,
} from "../src/local-tunnels";

describe("local tunnel parsing", () => {
  test("parses ssh tunnel forwards from ps output", () => {
    const parsed = parseLocalTunnelsFromPsOutput(`
 32296 ssh boehlerse@sshgw.cs.uni-tuebingen.de -fN -L 5907:cgpool1905:5907
 45387 ssh boehlerse@sshgw.cs.uni-tuebingen.de -fN -L5908:cgpool1905:5907
 10001 /bin/zsh -lc echo hello
`);

    expect(parsed.length).toBe(2);
    expect(parsed[0].pid).toBe(32296);
    expect(parsed[0].localPort).toBe(5907);
    expect(parsed[0].machine).toBe("cgpool1905");
    expect(parsed[0].remotePort).toBe(5907);
    expect(parsed[1].pid).toBe(45387);
    expect(parsed[1].localPort).toBe(5908);
  });

  test("matches by machine/remotePort/user@gateway", () => {
    const parsed = parseLocalTunnelsFromPsOutput(`
 32296 ssh boehlerse@sshgw.cs.uni-tuebingen.de -fN -L 5907:cgpool1905:5907
 45387 ssh boehlerse@sshgw.cs.uni-tuebingen.de -fN -L 5908:cgpool1905:5907
 60000 ssh other@sshgw.cs.uni-tuebingen.de -fN -L 5909:cgpool1905:5907
`);

    const matches = findMatchingTunnelPids(parsed, {
      user: "boehlerse",
      gateway: "sshgw.cs.uni-tuebingen.de",
      machine: "cgpool1905",
      remotePort: 5907,
    });

    expect(JSON.stringify(matches)).toBe(JSON.stringify([32296, 45387]));
  });

  test("matches by local port", () => {
    const parsed = parseLocalTunnelsFromPsOutput(`
 32296 ssh boehlerse@sshgw.cs.uni-tuebingen.de -fN -L 5907:cgpool1905:5907
 45387 ssh boehlerse@sshgw.cs.uni-tuebingen.de -fN -L 5908:cgpool1905:5907
`);

    const matches = findMatchingTunnelPids(parsed, { localPort: 5908 });

    expect(JSON.stringify(matches)).toBe(JSON.stringify([45387]));
  });
});
