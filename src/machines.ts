import pc from "picocolors";

type MachineTier = "pool" | "compute" | "unknown";

const MACHINE_NAME_PATTERN = /^[a-z0-9-]+$/;

function expandRange(
  prefix: string,
  start: number,
  end: number,
  padWidth: number,
): string[] {
  const machines: string[] = [];

  for (let index = start; index <= end; index += 1) {
    machines.push(`${prefix}${index.toString().padStart(padWidth, "0")}`);
  }

  return machines;
}

export const DEFAULT_GATEWAY = "sshgw.cs.uni-tuebingen.de";
export const ALTERNATE_GATEWAY = "cgcontact.cs.uni-tuebingen.de";

export const POOL_MACHINES = [
  ...expandRange("cgpool", 1801, 1803, 4),
  ...expandRange("cgpool", 1900, 1912, 4),
  ...expandRange("cgpoolsand", 1900, 1907, 4),
];

export const COMPUTE_MACHINES = [
  ...expandRange("cluster-gpu", 0, 4, 2),
  "glorifolia",
  "heracleum",
  "myristica",
  "pulsatilla",
];

export function sanitizeMachineName(machine: string): string {
  const normalized = machine.trim().toLowerCase();

  if (!normalized) {
    throw new Error("Machine name cannot be empty.");
  }

  if (!MACHINE_NAME_PATTERN.test(normalized)) {
    throw new Error(`Invalid machine name: ${machine}`);
  }

  return normalized;
}

export function classifyMachine(machine: string): MachineTier {
  const normalized = sanitizeMachineName(machine);

  if (POOL_MACHINES.includes(normalized)) {
    return "pool";
  }

  if (COMPUTE_MACHINES.includes(normalized)) {
    return "compute";
  }

  return "unknown";
}

export function isGatewayHost(host: string): boolean {
  return (
    host === DEFAULT_GATEWAY ||
    host === ALTERNATE_GATEWAY ||
    host === "sshgw" ||
    host === "cgcontact"
  );
}

export function printGatewayGuidance(gateway: string): void {
  if (gateway === ALTERNATE_GATEWAY || gateway === "cgcontact") {
    console.log(
      "tue-cli note: cgcontact is a jump host only; this CLI connects onward to internal machines.",
    );
  }
}

export function printMachinePolicySummary(): void {
  console.log(pc.bold(pc.cyan("Known CG pool machines (open to everyone):")));
  console.log(`  ${POOL_MACHINES.join(", ")}`);
  console.log("");
  console.log(pc.bold(pc.yellow("Known compute servers (restricted to cgstaff/cgext/cghiwi/cggpu users):")));
  console.log(`  ${COMPUTE_MACHINES.join(", ")}`);
  console.log("");
  console.log(pc.bold(pc.green("Gateway guidance:")));
  console.log(
    `  - Outside WSI network: ${DEFAULT_GATEWAY} (or sshgw via SSH config).`,
  );
  console.log(
    `  - University/VPN network: ${ALTERNATE_GATEWAY} (or cgcontact via SSH config).`,
  );
  console.log("  - Never do regular work on gateway hosts directly.");
}

export function warnOnRestrictedMachine(machine: string): void {
  const tier = classifyMachine(machine);

  if (tier === "compute") {
    console.warn(
      "tue-cli note: selected machine is a restricted compute server; access requires a permitted CG group.",
    );
  }
}
