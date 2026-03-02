import { createServer } from "node:net";

function isLocalPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

export async function chooseLocalPort(preferredPort: number): Promise<number> {
  if (await isLocalPortFree(preferredPort)) {
    return preferredPort;
  }

  for (let port = preferredPort + 1; port <= 65535; port += 1) {
    if (await isLocalPortFree(port)) {
      return port;
    }
  }

  throw new Error(
    `No free local port available in range ${preferredPort}..65535 for SSH tunnel.`,
  );
}
