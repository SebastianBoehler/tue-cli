import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type UserProfileStore = {
  version: 1;
  users: string[];
  defaultUser?: string;
};

type EnvLike = Record<string, string | undefined>;

function normalizeUsername(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Username cannot be empty.");
  }

  if (/\s/.test(trimmed)) {
    throw new Error(`Username cannot contain spaces: ${trimmed}`);
  }

  return trimmed;
}

function dedupeUsers(users: string[]): string[] {
  return [...new Set(users.map((user) => normalizeUsername(user)))];
}

export function getUserProfileStorePath(env: EnvLike = Bun.env): string {
  const home = env.HOME;
  const xdgConfigHome = env.XDG_CONFIG_HOME;

  if (!home && !xdgConfigHome) {
    return ".tue-cli-profiles.json";
  }

  const configRoot = xdgConfigHome ?? join(home as string, ".config");
  return join(configRoot, "tue-cli", "profiles.json");
}

export function loadUserProfiles(env: EnvLike = Bun.env): UserProfileStore {
  const path = getUserProfileStorePath(env);

  if (!existsSync(path)) {
    return {
      version: 1,
      users: [],
    };
  }

  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<UserProfileStore>;
    const users = dedupeUsers(Array.isArray(parsed.users) ? parsed.users : []);
    const defaultUser =
      typeof parsed.defaultUser === "string" &&
      users.includes(parsed.defaultUser)
        ? parsed.defaultUser
        : users[0];

    return {
      version: 1,
      users,
      defaultUser,
    };
  } catch {
    return {
      version: 1,
      users: [],
    };
  }
}

export function saveUserProfiles(
  data: UserProfileStore,
  env: EnvLike = Bun.env,
): UserProfileStore {
  const path = getUserProfileStorePath(env);
  const users = dedupeUsers(data.users);
  const defaultUser =
    data.defaultUser && users.includes(data.defaultUser)
      ? data.defaultUser
      : users[0];

  const normalized: UserProfileStore = {
    version: 1,
    users,
    defaultUser,
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function rememberUserProfile(
  username: string,
  env: EnvLike = Bun.env,
): UserProfileStore {
  const normalizedUser = normalizeUsername(username);
  const current = loadUserProfiles(env);

  return saveUserProfiles(
    {
      version: 1,
      users: [normalizedUser, ...current.users.filter((u) => u !== normalizedUser)],
      defaultUser: normalizedUser,
    },
    env,
  );
}

export function getDefaultUserProfile(
  env: EnvLike = Bun.env,
): string | undefined {
  return loadUserProfiles(env).defaultUser;
}

export function setDefaultUserProfile(
  username: string,
  env: EnvLike = Bun.env,
): UserProfileStore {
  const normalizedUser = normalizeUsername(username);
  const current = loadUserProfiles(env);

  return saveUserProfiles(
    {
      version: 1,
      users: [normalizedUser, ...current.users.filter((u) => u !== normalizedUser)],
      defaultUser: normalizedUser,
    },
    env,
  );
}
