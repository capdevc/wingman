/* eslint-disable unused-imports/no-unused-vars */
import * as vscode from "vscode";

import { type PostableViewProvider, type ProviderResponse, type Provider } from ".";
import { Client, type CompletionResponse, type SamplingParameters, AI_PROMPT, HUMAN_PROMPT } from "./sdks/anthropic";
import { type Command } from "../templates/render";
import { handleResponseCallbackType } from "../templates/runner";
import { displayWarning, getConfig, getOrCreateSecret, getSelectionInfo } from "../utils";

let lastMessage: string | undefined;
let lastTemplate: Command | undefined;
let lastSystemMessage: string | undefined;

export class AnthropicProvider implements Provider {
  viewProvider: PostableViewProvider | undefined;
  instance: Client | undefined;
  conversationTextHistory: string | undefined;
  _abort: AbortController = new AbortController();

  async create(provider: PostableViewProvider, template?: Command) {
    const apiKey = await getOrCreateSecret<string>("anthropic.apiKey", "Anthropic API Key");

    const { apiBaseUrl } = {
      apiBaseUrl: getConfig("anthropic.apiBaseUrl") as string | undefined,
    };

    this.viewProvider = provider;
    this.conversationTextHistory = undefined;
    this.instance = new Client(apiKey, { apiUrl: apiBaseUrl });
  }

  destroy() {
    this.instance = undefined;
    this.conversationTextHistory = undefined;
  }

  abort() {
    this._abort.abort();
    this._abort = new AbortController();
  }

  async send(message: string, systemMessage?: string, template?: Command): Promise<void | ProviderResponse> {
    let isFollowup = false;

    lastMessage = message;

    if (template) {
      lastTemplate = template;
    }

    if (!template && !lastTemplate) {
      return;
    }

    if (!template) {
      template = lastTemplate!;
      isFollowup = true;
    }

    if (systemMessage) {
      lastSystemMessage = systemMessage;
    }
    if (!systemMessage && !lastSystemMessage) {
      return;
    }
    if (!systemMessage) {
      systemMessage = lastSystemMessage!;
    }

    let prompt;
    if (!isFollowup) {
      this.viewProvider?.postMessage({ type: "newChat" });
      // The first message should have the system message prepended
      prompt = `${systemMessage ?? ""}${HUMAN_PROMPT} ${message}${AI_PROMPT}`;
    } else {
      // followups should have the conversation history prepended
      prompt = `${this.conversationTextHistory ?? ""}${HUMAN_PROMPT} ${message}${AI_PROMPT}`;
    }

    const samplingParameters: SamplingParameters = {
      prompt,
      temperature: template?.temperature ?? (getConfig("anthropic.temperature") as number),
      max_tokens_to_sample: template?.maxTokens ?? (getConfig("anthropic.maxTokens") as number) ?? 4096,
      top_k: template?.numberOfChoices ?? -1,
      model: template?.model ?? (getConfig("anthropic.model") as string) ?? "claude-instant-v1",
    };

    try {
      this.viewProvider?.postMessage({ type: "requestMessage", value: message });

      const editor = vscode.window.activeTextEditor!;
      const selection = getSelectionInfo(editor);

      const anthropicResponse: CompletionResponse = await this.instance!.completeStream(samplingParameters, {
        onOpen: (response) => {
          console.log("Opened stream, HTTP status code", response.status);
        },
        onUpdate: (partialResponse: CompletionResponse) => {
          this.viewProvider?.postMessage({ type: "partialResponse", value: this.toProviderResponse(partialResponse) });
        },
        signal: this._abort.signal,
      });

      // Reformat the API response into a ProvderResponse
      const response = this.toProviderResponse(anthropicResponse);

      // Append the last response to the conversation history
      this.conversationTextHistory = `${this.conversationTextHistory ?? ""}${prompt} ${response.text}`;
      this.viewProvider?.postMessage({ type: "responseFinished", value: response });

      if (!isFollowup) {
        handleResponseCallbackType(template, editor, selection, response.text);
      }
    } catch (error) {
      displayWarning(String(error));
    }
  }

  async repeatLast() {
    if (!lastMessage || !lastSystemMessage || !lastTemplate) {
      return;
    }

    await this.send(lastMessage, lastSystemMessage, lastTemplate);
  }

  toProviderResponse(response: CompletionResponse) {
    return {
      // for some reason, the response completion text always has a space at the beginning.
      text: response.completion.trimStart(),
      parentMessageId: "",
      converastionId: "",
      id: "",
    };
  }
}
