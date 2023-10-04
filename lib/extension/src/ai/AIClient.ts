import {
  OpenAIApiConfiguration,
  OpenAIChatModel,
  OpenAITextEmbeddingModel,
  embed,
  mapInstructionPromptToOpenAIChatFormat,
  streamText,
} from "modelfusion";
import * as vscode from "vscode";
import { z } from "zod";
import { Logger } from "../logger";
import { ApiKeyManager } from "./ApiKeyManager";

export function getOpenAIBaseUrl(): string {
  return vscode.workspace
    .getConfiguration("rubberduck.openAI")
    .get("baseUrl", "https://api.openai.com/v1/");
}

export function getOpenAIChatModel() {
  return z
    .enum(["gpt-4", "gpt-4-32k", "gpt-3.5-turbo", "gpt-3.5-turbo-16k"])
    .parse(vscode.workspace.getConfiguration("rubberduck").get("model"));
}

export class AIClient {
  private readonly apiKeyManager: ApiKeyManager;
  private readonly logger: Logger;
  private openAIBaseUrl: string;

  constructor({
    apiKeyManager,
    logger,
    openAIBaseUrl,
  }: {
    apiKeyManager: ApiKeyManager;
    logger: Logger;
    openAIBaseUrl: string;
  }) {
    this.apiKeyManager = apiKeyManager;
    this.logger = logger;

    // Ensure that the base URL doesn't have a trailing slash:
    this.openAIBaseUrl = openAIBaseUrl.replace(/\/$/, "");
  }

  private async getOpenAIApiConfiguration() {
    const apiKey = await this.apiKeyManager.getOpenAIApiKey();

    if (apiKey == undefined) {
      throw new Error(
        "No OpenAI API key found. " +
          "Please enter your OpenAI API key with the 'Rubberduck: Enter OpenAI API key' command."
      );
    }

    return new OpenAIApiConfiguration({
      baseUrl: this.openAIBaseUrl,
      apiKey,
    });
  }

  setOpenAIBaseUrl(openAIBaseUrl: string) {
    // Ensure it doesn't have a trailing slash
    this.openAIBaseUrl = openAIBaseUrl.replace(/\/$/, "");
  }

  async streamText({
    prompt,
    maxTokens,
    stop,
    temperature = 0,
  }: {
    prompt: string;
    maxTokens: number;
    stop?: string[] | undefined;
    temperature?: number | undefined;
  }) {
    this.logger.log([
      "--- Start OpenAI prompt ---",
      prompt,
      "--- End OpenAI prompt ---",
    ]);

    return streamText(
      new OpenAIChatModel({
        api: await this.getOpenAIApiConfiguration(),
        model: getOpenAIChatModel(),
        maxCompletionTokens: maxTokens,
        temperature,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: stop,
      }).withPromptFormat(mapInstructionPromptToOpenAIChatFormat()),
      { instruction: prompt }
    );
  }

  async generateEmbedding({ input }: { input: string }) {
    try {
      const { output, response } = await embed(
        new OpenAITextEmbeddingModel({
          api: await this.getOpenAIApiConfiguration(),
          model: "text-embedding-ada-002",
        }),
        input
      ).asFullResponse();

      return {
        type: "success" as const,
        embedding: output,
        totalTokenCount: response[0]!.usage.total_tokens,
      };
    } catch (error: any) {
      console.log(error);

      return {
        type: "error" as const,
        errorMessage: error?.message,
      };
    }
  }
}