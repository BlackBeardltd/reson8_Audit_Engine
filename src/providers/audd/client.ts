import { logProviderFailure, logProviderResponse } from "../../diagnostics/provider-response.js";
import { normalizeAuddRecognition, type AuditRecognition } from "./normalize.js";

export interface AuddRecognitionClient {
  recognize(source: Uint8Array): Promise<AuditRecognition>;
  recognizeUrl(url: string): Promise<AuditRecognition>;
}

function parseJsonOrText(body: string): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return { rawText: body.slice(0, 32_000) };
  }
}

export class AuddClient implements AuddRecognitionClient {
  private readonly apiToken: string;

  constructor(apiToken = process.env.AUDD_API ?? process.env.AUDD_API_TOKEN) {
    if (!apiToken) throw new Error("AUDD_API is required");
    this.apiToken = apiToken;
  }

  private async request(fields: Record<string, string | Blob>): Promise<AuditRecognition> {
    const form = new FormData();
    form.set("api_token", this.apiToken);
    form.set("return", "apple_music,spotify,deezer,musicbrainz");
    for (const [key, value] of Object.entries(fields)) form.set(key, value);

    const operation = "recognize";
    try {
      const response = await fetch("https://api.audd.io/", { method: "POST", body: form });
      const body = await response.text();
      const payload = parseJsonOrText(body);

      logProviderResponse({
        provider: "audd",
        operation,
        status: response.status,
        ok: response.ok,
        payload,
      });

      if (!response.ok) {
        throw new Error(`AudD request failed with HTTP ${response.status}`);
      }

      const json = payload as {
        status?: string;
        error?: { error_message?: string };
        result?: unknown;
      };

      if (json.status === "error" || json.error) {
        throw new Error(json.error?.error_message ?? "AudD recognition failed");
      }

      return normalizeAuddRecognition((json.result ?? null) as Parameters<typeof normalizeAuddRecognition>[0]);
    } catch (error) {
      logProviderFailure({ provider: "audd", operation, error });
      throw error;
    }
  }

  async recognize(source: Uint8Array): Promise<AuditRecognition> {
    const bytes = new Uint8Array(source.byteLength);
    bytes.set(source);
    return this.request({
      file: new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" }),
    });
  }

  async recognizeUrl(url: string): Promise<AuditRecognition> {
    return this.request({ url });
  }
}
