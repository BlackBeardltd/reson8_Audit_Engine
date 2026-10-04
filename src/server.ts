import Fastify from "fastify";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ status: "ok", service: "reson8-audit-engine" }));
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 10000);
  const host = process.env.HOST ?? "0.0.0.0";
  buildServer().listen({ port, host }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
