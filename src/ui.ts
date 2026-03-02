import { input, select } from "@inquirer/prompts";

export type MenuOption = {
  value: string;
  label: string;
  description?: string;
};

function isPromptCancelled(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ExitPromptError" ||
      error.message.includes("User force closed"))
  );
}

export function supportsInteractivePrompts(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function promptInput(
  question: string,
  defaultValue?: string,
): Promise<string> {
  try {
    const value = (
      await input({
        message: question,
        default: defaultValue,
      })
    ).trim();

    if (!value) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }

      throw new Error(`${question} is required.`);
    }

    return value;
  } catch (error) {
    if (isPromptCancelled(error)) {
      throw new Error("Interactive prompt cancelled.");
    }

    throw error;
  }
}

export async function selectMenuOption(
  title: string,
  options: MenuOption[],
  defaultValue?: string,
): Promise<string> {
  if (options.length === 0) {
    throw new Error("No selectable options available.");
  }

  const resolvedDefault =
    defaultValue && options.some((option) => option.value === defaultValue)
      ? defaultValue
      : options[0].value;

  try {
    return await select({
      message: title,
      choices: options.map((option) => ({
        value: option.value,
        name: option.label,
        description: option.description,
      })),
      default: resolvedDefault,
    });
  } catch (error) {
    if (isPromptCancelled(error)) {
      throw new Error("Interactive prompt cancelled.");
    }

    throw error;
  }
}
