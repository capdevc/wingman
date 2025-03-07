import * as vscode from "vscode";
import { Preset, defaultModes, generateId, systems } from "../../shared";
import { getProviderCompletionParamDefaults, providers } from "./providers/common";
import { State } from "./state";
import { createPromptMap, getModes, stateKeys } from "./utils";
import { MainViewProvider } from "./views/main";

export const createDefaultPresetsForAllModes = () => {
  const modes = getModes();

  modes.forEach((mode) => {
    State.set(`${mode.id}-presets`, undefined);
    State.set(`${mode.id}-activePreset`, undefined);
  });

  const presets = getModes().map((mode) => State.get(`${mode.id}-presets`)).filter(Boolean);

  if (!presets || !presets.length) {
    const modes = getModes();

    modes.forEach((mode) => {
      State.set(`${mode.id}-presets`, [
        {
          id: generateId(),
          name: "OpenAI (gpt-3.5-turbo)",
          provider: "OpenAI",
          format: "OpenAI",
          tokenizer: "OpenAI",
          url: "https://api.openai.com/v1/chat/completions",
          system: systems.get(mode.id),
          completionParams: {
            ...getProviderCompletionParamDefaults("OpenAI") as any,
          },
        },
        {
          id: generateId(),
          name: "OpenAI (gpt-4-1106-preview)",
          provider: "OpenAI",
          format: "OpenAI",
          tokenizer: "OpenAI",
          url: "https://api.openai.com/v1/chat/completions",
          system: systems.get(mode.id),
          completionParams: {
            ...getProviderCompletionParamDefaults("OpenAI") as any,
            model: "gpt-4-1106-preview",
            max_tokens: 64_000,
          },
        },
        {
          id: generateId(),
          name: "Anthropic (claude-instant-1)",
          provider: "Anthropic",
          format: "Anthropic",
          tokenizer: "Anthropic",
          url: "https://api.anthropic.com/v1/complete",
          system: systems.get(mode.id),
          completionParams: {
            ...getProviderCompletionParamDefaults("Anthropic") as any,
          },
        },
        {
          id: generateId(),
          name: "Anthropic (claude-2.1)",
          provider: "Anthropic",
          format: "Anthropic",
          tokenizer: "Anthropic",
          url: "https://api.anthropic.com/v1/complete",
          system: systems.get(mode.id),
          completionParams: {
            ...getProviderCompletionParamDefaults("Anthropic") as any,
            model: "claude-2.1",
          },
        },
        {
          id: generateId(),
          name: "LM Studio",
          provider: "OpenAI",
          format: "OpenAI",
          tokenizer: "OpenAI",
          url: "http://localhost:1234/v1/chat/completions",
          system: systems.get(mode.id),
          completionParams: {
            ...getProviderCompletionParamDefaults("OpenAI") as any,
          },
        }
      ] as Preset[]);
      State.set(`${mode.id}-activePreset`, State.get(`${mode.id}-presets`)[0]);
    });
  }
};

const setShowWelcomeWizard = () => {
  State.set(stateKeys.welcomeWizard(), true);
};

export const createState = () => {
  State.clear();

  State.set(stateKeys.modes(), [...defaultModes]);

  createDefaultPresetsForAllModes();

  createPromptMap();

  State.set(stateKeys.stateCreated(), true);
};

export const promptSetProviderKey = async (provider: string) => {
  if (!providers[provider]) { return; }
  const key = await vscode.window.showInputBox({ prompt: `Enter your ${provider} API key.` });
  if (key === undefined) return;
  await State.setSecret(stateKeys.providerApiKey(provider), key);
};

export function activate(context: vscode.ExtensionContext) {
  State.create(context);

  const stateCreated = State.get(stateKeys.stateCreated());

  if (!stateCreated) {
    createState();
  }

  // const showWizard = State.get(stateKeys.welcomeWizard());

  // if (showWizard === undefined) {
    // setShowWelcomeWizard();
  // }

  try {
    const setApiKeyCommand = vscode.commands.registerCommand("wingman.setApiKey", async () => {
      const selectedProvider = await vscode.window.showQuickPick(
        Object.keys(providers).map((key) => ({ label: key })),
        { placeHolder: "Select the provider you want to set the API key for." },
      );
  
      if (!selectedProvider) return;
  
      const apiKey = await vscode.window.showInputBox({ prompt: `Enter your ${selectedProvider.label} API key.` });
  
      if (!apiKey) return;
  
      await State.setSecret(stateKeys.providerApiKey(selectedProvider.label), apiKey);
    });
  
    context.subscriptions.push(setApiKeyCommand);
  } catch (error) {
    console.error(error);
  }

  const view = new MainViewProvider(
    context.extensionPath,
    context.extensionUri
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MainViewProvider.viewType,
      view,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );
}

export function deactivate() {}
