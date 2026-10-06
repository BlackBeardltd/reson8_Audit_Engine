interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export interface SpotifyApiClient {
  getTrack(trackId: string): Promise<Record<string, unknown>>;
}

export class SpotifyClient implements SpotifyApiClient {
  private cachedToken: CachedToken | null = null;

  constructor(
    private readonly clientId = process.env.SPOTIFY_CLIENT_ID,
    private readonly clientSecret = process.env.SPOTIFY_CLIENT_SECRET,
    private readonly market = process.env.SPOTIFY_MARKET ?? "US",
  ) {
    if (!clientId || !clientSecret) {
      throw new Error("Spotify client credentials are required");
    }
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.accessToken;
    }

    const basic = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      throw new Error(
        `Spotify token request failed with HTTP ${response.status}`,
      );
    }

    const payload = (await response.json()) as Partial<SpotifyTokenResponse>;

    if (
      !payload.access_token ||
      typeof payload.expires_in !== "number"
    ) {
      throw new Error("Spotify token response was invalid");
    }

    this.cachedToken = {
      accessToken: payload.access_token,
      expiresAt: now + payload.expires_in * 1000,
    };

    return payload.access_token;
  }

  async getTrack(trackId: string): Promise<Record<string, unknown>> {
    const accessToken = await this.accessToken();
    const params = new URLSearchParams({ market: this.market });

    const response = await fetch(
      `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Spotify track request failed with HTTP ${response.status}`,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
