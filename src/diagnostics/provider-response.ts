export type ProviderName = "audd" | "spotify" | "tidal";

const MAX_LOG_BYTES = 32_000;

function truncate(value: string): string {
  return value.length <= MAX_LOG_BYTES ? value : `${value.slice(0, MAX_LOG_BYTES)}…[truncated]`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: true, type: typeof value });
  }
}

export function logProviderResponse(input: {
  provider: ProviderName;
  operation: string;
  status: number;
  ok: boolean;
  payload: unknown;
  auditJobId?: string;
}): void {
  console.log(JSON.stringify({
    event: "provider_response",
    provider: input.provider,
    operation: input.operation,
    auditJobId: input.auditJobId ?? null,
    httpStatus: input.status,
    ok: input.ok,
    payload: truncate(safeJson(input.payload)),
    timestamp: new Date().toISOString(),
  }));
}

export function logProviderFailure(input: {
  provider: ProviderName;
  operation: string;
  error: unknown;
  auditJobId?: string;
}): void {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  console.error(JSON.stringify({
    event: "provider_error",
    provider: input.provider,
    operation: input.operation,
    auditJobId: input.auditJobId ?? null,
    error: message,
    timestamp: new Date().toISOString(),
  }));
}
