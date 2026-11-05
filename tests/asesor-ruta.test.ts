/* Ruta /api/asesor con la API de Anthropic simulada: streaming de texto, rechazo y errores. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const estado = vi.hoisted(() => ({
  eventos: [] as unknown[],
  final: { stop_reason: "end_turn" } as { stop_reason: string },
  errorInicial: null as Error | null,
  ultimaPeticion: null as Record<string, unknown> | null,
  llamadas: 0,
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
          estado.llamadas++;
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
  delete process.env.ASESOR_MAX_TOKENS;
});

describe("Modo demo y configuración", () => {
  it("sin clave, GET informa el modo demo con el mensaje para la interfaz", async () => {
    const { GET } = await import("@/app/api/asesor/route");
    delete process.env.ANTHROPIC_API_KEY;
    const e = await (await GET()).json();
    expect(e.activo).toBe(false);
    expect(e.mensajeDemo).toBe("Demo del asesor disponible en la presentación. Se activa al configurar la clave de API.");
    expect(e.consultasPorHora).toBe(20);
  });

  it("sin clave, POST no llama a la API y responde demo", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    delete process.env.ANTHROPIC_API_KEY;
    const antes = estado.llamadas;
    const r = await POST(peticion({ pregunta: "x" }, "200.5.5.5"));
    expect(r.status).toBe(503);
    expect((await r.json()).demo).toBe(true);
    expect(estado.llamadas).toBe(antes);
  });

  it("con clave, GET informa activo y el modelo", async () => {
    const { GET } = await import("@/app/api/asesor/route");
    const e = await (await GET()).json();
    expect(e).toMatchObject({ activo: true, modelo: "claude-opus-5-5", mensajeDemo: null });
  });

  it("la longitud máxima de respuesta se configura con ASESOR_MAX_TOKENS", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    estado.eventos = [texto("ok")];
    await (await POST(peticion({ pregunta: "x" }, "200.6.6.1"))).text();
    expect(estado.ultimaPeticion!.max_tokens).toBe(8000);
    process.env.ASESOR_MAX_TOKENS = "3000";
    await (await POST(peticion({ pregunta: "x" }, "200.6.6.2"))).text();
    expect(estado.ultimaPeticion!.max_tokens).toBe(3000);
  });

  it("«Resumen de la economía» se guarda 24 h: la segunda vez no llama a la API ni gasta cupo", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    estado.eventos = [texto("### Economía\n"), texto("- Inflación 6,29 %")];
    const cuerpo = { pregunta: "Resumen", rapida: "resumen", contexto: { macro: { tasa_politica: 0.1225 }, portafolio: { valor: 1 } } };
    const r1 = await POST(peticion(cuerpo, "200.7.7.7"));
    expect(r1.headers.get("X-Asesor-Cache")).toBe("MISS");
    expect(await r1.text()).toBe("### Economía\n- Inflación 6,29 %");
    const llamadas = estado.llamadas;
    // otro portafolio, mismos datos de mercado → misma respuesta guardada
    const r2 = await POST(peticion({ ...cuerpo, contexto: { ...cuerpo.contexto, portafolio: { valor: 2 } } }, "200.7.7.7"));
    expect(r2.headers.get("X-Asesor-Cache")).toBe("HIT");
    expect(r2.headers.get("X-Consultas-Restantes")).toBeNull();
    expect(await r2.text()).toBe("### Economía\n- Inflación 6,29 %");
    expect(estado.llamadas).toBe(llamadas);
    // si cambian los datos de mercado, se genera una respuesta nueva
    const r3 = await POST(peticion({ ...cuerpo, contexto: { macro: { tasa_politica: 0.12 } } }, "200.7.7.7"));
    expect(r3.headers.get("X-Asesor-Cache")).toBe("MISS");
    await r3.text();
    expect(estado.llamadas).toBe(llamadas + 1);
  });

  it("una respuesta declinada no se guarda en caché", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    estado.eventos = [texto("parcial")];
    estado.final = { stop_reason: "refusal" };
    const cuerpo = { pregunta: "Resumen", rapida: "resumen", contexto: { macro: { tasa_politica: 0.099 } } };
    await (await POST(peticion(cuerpo, "200.8.8.8"))).text();
    estado.final = { stop_reason: "end_turn" };
    const r = await POST(peticion(cuerpo, "200.8.8.8"));
    expect(r.headers.get("X-Asesor-Cache")).toBe("MISS");
    await r.text();
  });
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
