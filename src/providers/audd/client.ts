import { AudD } from "@audd/sdk";
import { normalizeAuddRecognition, type AuditRecognition } from "./normalize.js";

export interface AuddRecognitionClient {
  recognize(source: Uint8Array): Promise<AuditRecognition>;
}

export class AuddClient implements AuddRecognitionClient {
  private readonly client: AudD;

  constructor(apiToken = process.env.AUDD_API_TOKEN) {
    if (!apiToken) throw new Error("AUDD_API_TOKEN is required");
    this.client = new AudD(apiToken);
  }

  async recognize(source: Uint8Array): Promise<AuditRecognition> {
    const result = await this.client.recognize(source, {
      returnMetadata: ["apple_music", "spotify", "musicbrainz"],
    });
    return normalizeAuddRecognition(result?.rawResponse ?? result);
  }
}
