import { resolveConfig, type ResolvedConfig } from "../config";
import {
  ALTERNATE_GATEWAY,
  classifyMachine,
  COMPUTE_MACHINES,
  DEFAULT_GATEWAY,
  POOL_MACHINES,
  sanitizeMachineName,
} from "../machines";
import { loadMachineHistory, rememberMachine } from "../machine-history";
import {
  getDefaultUserProfile,
  loadUserProfiles,
  rememberUserProfile,
  setDefaultUserProfile,
} from "../user-profiles";
import { promptInput, selectMenuOption, supportsInteractivePrompts } from "../ui";
import type { FlagMap } from "./types";

export function normalizeUsername(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Username cannot be empty.");
  }

  if (/\s/.test(trimmed)) {
    throw new Error(`Username cannot contain spaces: ${trimmed}`);
  }

  return trimmed;
}

export async function selectOrAddUserProfile(
  currentDefault?: string,
): Promise<string> {
  const profiles = loadUserProfiles();

  if (profiles.users.length === 0) {
    const entered = normalizeUsername(await promptInput("WSI username"));
    rememberUserProfile(entered);
    return entered;
  }

  const selected = await selectMenuOption(
    "Select saved username",
    [
      ...profiles.users.map((user) => ({
        value: user,
        label: user,
      })),
      { value: "__new__", label: "Connect new username" },
    ],
    currentDefault ?? profiles.defaultUser ?? profiles.users[0],
  );

  if (selected !== "__new__") {
    setDefaultUserProfile(selected);
    return selected;
  }

  const entered = normalizeUsername(await promptInput("WSI username"));
  rememberUserProfile(entered);
  return entered;
}

export async function selectMachine(defaultMachine?: string): Promise<string> {
  const history = loadMachineHistory();
  const recentKnownMachines = history.recentMachines.filter(
    (machine) => classifyMachine(machine) !== "unknown",
  );
  const recentPoolMachines = recentKnownMachines.filter(
    (machine) => classifyMachine(machine) === "pool",
  );
  const recentComputeMachines = recentKnownMachines.filter(
    (machine) => classifyMachine(machine) === "compute",
  );

  const scopeOptions = [
    ...(recentKnownMachines.length > 0
      ? [
          {
            value: "recent",
            label: "Recently used machines",
          },
        ]
      : []),
    { value: "pool", label: "Pool machines (open to everyone)" },
    {
      value: "compute",
      label: "Compute servers (restricted: cgstaff/cgext/cghiwi/cggpu)",
    },
    { value: "manual", label: "Enter machine hostname manually" },
  ];

  const machineScope = await selectMenuOption(
    "Select machine scope",
    scopeOptions,
    defaultMachine && recentKnownMachines.includes(defaultMachine)
      ? "recent"
      : "pool",
  );

  if (machineScope === "manual") {
    const typed = await promptInput("Machine hostname", defaultMachine);
    const normalized = sanitizeMachineName(typed);
    rememberMachine(normalized);
    return normalized;
  }

  if (machineScope === "recent") {
    const selectedRecent = await selectMenuOption(
      "Select recent machine",
      recentKnownMachines.map((machine) => ({
        value: machine,
        label: `${machine} (${classifyMachine(machine)})`,
      })),
      defaultMachine && recentKnownMachines.includes(defaultMachine)
        ? defaultMachine
        : recentKnownMachines[0],
    );
    rememberMachine(selectedRecent);
    return selectedRecent;
  }

  const machines = machineScope === "pool" ? POOL_MACHINES : COMPUTE_MACHINES;
  const recentMachines =
    machineScope === "pool" ? recentPoolMachines : recentComputeMachines;
  const orderedMachines = [
    ...recentMachines,
    ...machines.filter((machine) => !recentMachines.includes(machine)),
  ];

  const selected = await selectMenuOption(
    "Select machine",
    orderedMachines.map((machine) => ({
      value: machine,
      label: recentMachines.includes(machine) ? `${machine} (recent)` : machine,
    })),
    defaultMachine && orderedMachines.includes(defaultMachine)
      ? defaultMachine
      : orderedMachines[0],
  );
  rememberMachine(selected);
  return selected;
}

export async function resolveUserFlag(
  flags: FlagMap,
  env: Record<string, string | undefined>,
): Promise<string> {
  const fromFlags = flags.user;

  if (fromFlags) {
    return normalizeUsername(fromFlags);
  }

  const fromEnv = env.TUE_USER;

  if (fromEnv) {
    return normalizeUsername(fromEnv);
  }

  const storedDefault = getDefaultUserProfile(env);

  if (storedDefault) {
    return storedDefault;
  }

  if (!supportsInteractivePrompts()) {
    throw new Error(
      "Missing username. Pass --user, set TUE_USER, or run interactively once to save a global username profile.",
    );
  }

  return selectOrAddUserProfile();
}

export async function resolveInteractiveConfig(
  flags: FlagMap,
  env: Record<string, string | undefined>,
): Promise<ResolvedConfig> {
  const interactiveFlags = { ...flags };
  interactiveFlags.user = await resolveUserFlag(interactiveFlags, env);

  if (!interactiveFlags.gateway && !env.TUE_GATEWAY) {
    interactiveFlags.gateway = await selectMenuOption("Select gateway", [
      {
        value: DEFAULT_GATEWAY,
        label: `${DEFAULT_GATEWAY} (outside WSI network / first login)`,
      },
      {
        value: ALTERNATE_GATEWAY,
        label: `${ALTERNATE_GATEWAY} (inside university network/VPN)`,
      },
    ]);
  }

  return resolveConfig(interactiveFlags, env);
}

export function maybeRememberUser(user: string, dryRun: boolean): void {
  if (!dryRun) {
    rememberUserProfile(user);
  }
}
