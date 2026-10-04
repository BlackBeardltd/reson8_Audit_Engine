import { normalizeAuddRecognition, type AuditRecognition } from "./normalize.js";

export interface AuddRecognitionClient {
  recognize(source: Uint8Array): Promise<AuditRecognition>;
}

export class AuddClient implements AuddRecognitionClient {
  constructor(private readonly apiToken = process.env.AUDD_API_TOKEN) {
    if (!apiToken) throw new Error("AUDD_API_TOKEN is required");
  }

  async recognize(source: Uint8Array): Promise<AuditRecognition> {
    const form = new FormData();
    form.set("api_token", this.apiToken!);
    form.set("return", "apple_music,spotify,musicbrainz");
    const blobBytes = new Uint8Array(source.byteLength);
    blobBytes.set(source);
    form.set(
      "file",
      new Blob([blobBytes.buffer as ArrayBuffer], { type: "application/octet-stream" }),
      "recognition-sample",
    );

    const response = await fetch("https://api.audd.io/", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      throw new Error(`AudD request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      result?: unknown;
    };

    return normalizeAuddRecognition(payload.result ?? null);
  }
}
