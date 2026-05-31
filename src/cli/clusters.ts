import {
  getClusterProfile,
  loadClusterProfiles,
  saveClusterProfile,
  setDefaultClusterProfile,
} from "../cluster-profiles";
import type { FlagMap } from "./types";

function parseMachines(input: string | undefined): string[] {
  if (!input) {
    throw new Error("Missing machines. Use --machines <host1,host2>.");
  }

  return input.split(",").map((machine) => machine.trim()).filter(Boolean);
}

export function handleClusterCommand(
  subcommand: string | undefined,
  flags: FlagMap,
): void {
  const action = subcommand ?? "list";

  if (action === "list") {
    const store = loadClusterProfiles();
    if (store.clusters.length === 0) {
      console.log("No saved cluster profiles yet. Run: tue init");
      return;
    }

    console.log("Saved cluster profiles:");
    for (const profile of store.clusters) {
      const marker = profile.name === store.defaultCluster ? " (default)" : "";
      console.log(`  - ${profile.name}${marker}: ${profile.gateway}`);
    }
    return;
  }

  if (action === "show") {
    const name = flags.name ?? flags.cluster;
    if (!name) {
      throw new Error("Missing cluster name. Use --name <profile>.");
    }
    const profile = getClusterProfile(name);
    if (!profile) {
      throw new Error(`Unknown cluster profile: ${name}`);
    }
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  if (action === "select") {
    const name = flags.name ?? flags.cluster;
    if (!name) {
      throw new Error("Missing cluster name. Use --name <profile>.");
    }
    setDefaultClusterProfile(name);
    console.log(`Active cluster profile set to: ${name}`);
    return;
  }

  if (action === "add") {
    if (!flags.name || !flags.gateway) {
      throw new Error("Missing cluster fields. Use --name <profile> --gateway <host> --machines <csv>.");
    }
    saveClusterProfile({
      name: flags.name,
      gateway: flags.gateway,
      machines: parseMachines(flags.machines),
      defaultMachine: flags["default-machine"],
      remoteRoot: flags["remote-root"],
      vncVm: flags["vnc-vm"],
    });
    console.log(`Saved cluster profile: ${flags.name}`);
    return;
  }

  throw new Error("Unknown clusters subcommand. Use: clusters list | clusters show | clusters add | clusters select");
}
