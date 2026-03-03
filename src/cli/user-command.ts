import { supportsInteractivePrompts } from "../ui";
import { loadUserProfiles, rememberUserProfile } from "../user-profiles";
import {
  normalizeUsername,
  selectOrAddUserProfile,
} from "./user";
import type { FlagMap } from "./types";

export async function handleUserCommand(
  subcommand: string | undefined,
  flags: FlagMap,
): Promise<void> {
  if (subcommand === "list" || !subcommand) {
    const profiles = loadUserProfiles();

    if (profiles.users.length === 0) {
      console.log("No saved usernames yet.");
      return;
    }

    console.log("Saved usernames:");
    for (const user of profiles.users) {
      const marker = profiles.defaultUser === user ? " (default)" : "";
      console.log(`  - ${user}${marker}`);
    }
    return;
  }

  if (subcommand === "select") {
    const selectedUser = await selectOrAddUserProfile();
    console.log(`Active username profile set to: ${selectedUser}`);
    return;
  }

  if (subcommand === "add") {
    const fromFlag = flags.name;

    if (fromFlag) {
      const normalized = normalizeUsername(fromFlag);
      rememberUserProfile(normalized);
      console.log(`Saved username profile: ${normalized}`);
      return;
    }

    if (!supportsInteractivePrompts()) {
      throw new Error("Missing username. Use: tue user add --name <username>");
    }

    const selectedUser = await selectOrAddUserProfile();
    console.log(`Saved username profile: ${selectedUser}`);
    return;
  }

  throw new Error("Unknown user subcommand. Use: user list | user select | user add");
}
