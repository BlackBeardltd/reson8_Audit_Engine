export type ProviderName = "audd" | "spotify" | "tidal";

const MAX_LOG_BYTES = 32_000;
const SENSITIVE_KEY = /token|secret|authorization|password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token/i;

function truncate(value: string): string {
  return value.length <= MAX_LOG_BYTES ? value : `${value.slice(0, MAX_LOG_BYTES)}…[truncated]`;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(child);
    }
    return result;
  }
  return value;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(redact(value));
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
