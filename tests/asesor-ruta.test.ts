/* Ruta /api/asesor con la API de Anthropic simulada: streaming de texto, rechazo y errores. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const estado = vi.hoisted(() => ({
  eventos: [] as unknown[],
  final: { stop_reason: "end_turn" } as { stop_reason: string },
  errorInicial: null as Error | null,
  ultimaPeticion: null as Record<string, unknown> | null,
}));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class NotFoundError extends APIError {}
  class RateLimitError extends APIError {}
  class BadRequestError extends APIError {}
  class APIConnectionError extends Error {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static NotFoundError = NotFoundError;
    static RateLimitError = RateLimitError;
    static BadRequestError = BadRequestError;
    static APIConnectionError = APIConnectionError;
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          estado.ultimaPeticion = params;
          return {
            async *[Symbol.asyncIterator]() {
              if (estado.errorInicial) throw estado.errorInicial;
              for (const ev of estado.eventos) yield ev;
            },
            finalMessage: async () => estado.final,
            abort: () => {},
          };
        },
      },
    };
  }
  return { default: Anthropic };
});

const texto = (t: string) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } });
const peticion = (cuerpo: unknown, ip = "200.1.1.1") =>
  new Request("http://localhost/api/asesor", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(cuerpo),
  });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "clave-de-prueba";
  estado.eventos = [];
  estado.final = { stop_reason: "end_turn" };
  estado.errorInicial = null;
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/asesor", () => {
  it("devuelve el texto en streaming y arma la petición con el contexto en el sistema", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    estado.eventos = [{ type: "message_start" }, texto("### Resumen\n"), texto("- La TPM está en **12,25 %**.")];
    const r = await POST(peticion({ pregunta: "Resumen", historial: [], contexto: { macro: { tasa_politica: 0.1225 } } }, "200.1.1.1"));
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toMatch(/text\/plain/);
    expect(await r.text()).toBe("### Resumen\n- La TPM está en **12,25 %**.");
    const p = estado.ultimaPeticion!;
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.output_config).toEqual({ effort: "medium" });
    expect(JSON.stringify(p.system)).toContain("tasa_politica");
    expect(p.messages).toEqual([{ role: "user", content: "Resumen" }]);
  });

  it("agrega una nota si el modelo declina la consulta", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    estado.eventos = [{ type: "message_start" }];
    estado.final = { stop_reason: "refusal" };
    const r = await POST(peticion({ pregunta: "x" }, "200.1.1.2"));
    expect(await r.text()).toMatch(/no puede responder/);
  });

  it("convierte un error de autenticación en un mensaje claro", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    const Anthropic = (await import("@anthropic-ai/sdk")).default as unknown as { AuthenticationError: new (m: string) => Error };
    estado.errorInicial = new Anthropic.AuthenticationError("invalid x-api-key");
    const r = await POST(peticion({ pregunta: "x" }, "200.1.1.3"));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("sin clave configurada responde 503", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    delete process.env.ANTHROPIC_API_KEY;
    const r = await POST(peticion({ pregunta: "x" }, "200.1.1.4"));
    expect(r.status).toBe(503);
  });

  it("aplica el límite de 20 consultas por hora por IP", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    for (let i = 0; i < 20; i++) expect((await POST(peticion({ pregunta: "x" }, "200.9.9.9"))).status).toBe(200);
    const r = await POST(peticion({ pregunta: "x" }, "200.9.9.9"));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBeTruthy();
    expect((await r.json()).error).toMatch(/límite de 20 consultas/);
  });
});
