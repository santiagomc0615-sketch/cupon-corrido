/* Ruta /api/asesor con AI_PROVIDER=gemini y el SDK de Google simulado: estado, streaming con
   herramientas, caché del resumen, límite del nivel gratuito y modo demo. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/mercado", async () => {
  const { SNAP_PRUEBA } = await import("./snap-prueba");
  return { obtenerMercado: async () => SNAP_PRUEBA };
});

const estado = vi.hoisted(() => ({
  vueltas: [] as unknown[][],
  llamadas: 0,
  error: null as Error | null,
  peticiones: [] as { model: string; contents: unknown[] }[],
}));

vi.mock("@google/genai", async (original) => {
  const real = await original<typeof import("@google/genai")>();
  class GoogleGenAI {
    models = {
      generateContentStream: async (p: { model: string; contents: unknown[] }) => {
        estado.peticiones.push(structuredClone({ model: p.model, contents: p.contents }));
        if (estado.error) throw estado.error;
        const trozos = estado.vueltas[Math.min(estado.llamadas++, estado.vueltas.length - 1)] ?? [];
        return (async function* () {
          for (const t of trozos) yield t;
        })();
      },
    };
  }
  return { ...real, GoogleGenAI };
});

const trozo = (parts: Record<string, unknown>[], finishReason?: string) => ({ candidates: [{ content: { role: "model", parts }, ...(finishReason ? { finishReason } : {}) }] });
const peticion = (cuerpo: unknown, ip: string) =>
  new Request("http://localhost/api/asesor", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(cuerpo) });
async function leer(r: Response) {
  const l = (await r.text()).split("\n").filter(Boolean).map((x) => JSON.parse(x) as { t: string; d?: string; estado?: string; stop?: string });
  return { texto: l.filter((e) => e.t === "texto" || e.t === "nota").map((e) => e.d).join(""), eventos: l };
}

beforeEach(() => {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  estado.vueltas = [];
  estado.llamadas = 0;
  estado.error = null;
  estado.peticiones = [];
});
afterEach(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
});

describe("/api/asesor con Gemini", () => {
  it("GET informa el proveedor, el modelo y el aviso de privacidad", async () => {
    const { GET } = await import("@/app/api/asesor/route");
    const e = await (await GET()).json();
    expect(e).toMatchObject({ activo: true, proveedor: "gemini", proveedorEtiqueta: "Google (Gemini)", modelo: "gemini-3.5-flash-lite" });
    expect(e.avisoPrivacidad).toMatch(/nivel gratuito de Google pueden usarse para mejorar sus productos/);
  });

  it("sin GEMINI_API_KEY mantiene el modo demo y no llama a Google", async () => {
    const { GET, POST } = await import("@/app/api/asesor/route");
    delete process.env.GEMINI_API_KEY;
    expect((await (await GET()).json()).activo).toBe(false);
    const r = await POST(peticion({ pregunta: "x" }, "201.0.0.1"));
    expect(r.status).toBe(503);
    expect((await r.json()).demo).toBe(true);
    expect(estado.peticiones).toHaveLength(0);
  });

  it("responde en streaming NDJSON con la herramienta ejecutada en el servidor", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    estado.vueltas = [[trozo([{ functionCall: { id: "f1", name: "datos_mercado", args: {} } }], "STOP")], [trozo([{ text: "### Mercado\n" }]), trozo([{ text: "- Dato de la herramienta" }], "STOP")]];
    const r = await POST(peticion({ pregunta: "¿Cómo está el mercado?" }, "201.0.0.2"));
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Proveedor")).toBe("gemini");
    const { texto, eventos } = await leer(r);
    expect(texto).toBe("### Mercado\n- Dato de la herramienta");
    expect(eventos.filter((e) => e.t === "herramienta").map((e) => e.estado)).toEqual(["pidiendo", "listo"]);
    expect(JSON.stringify(estado.peticiones[1].contents)).toContain("tasa_politica");
  });

  it("el resumen de la economía se guarda en caché también con Gemini", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    estado.vueltas = [[trozo([{ text: "Resumen guardado" }], "STOP")]];
    const cuerpo = { pregunta: "Resumen", rapida: "resumen" };
    const r1 = await POST(peticion(cuerpo, "201.0.0.3"));
    expect(r1.headers.get("X-Asesor-Cache")).toBe("MISS");
    await r1.text();
    const r2 = await POST(peticion(cuerpo, "201.0.0.3"));
    expect(r2.headers.get("X-Asesor-Cache")).toBe("HIT");
    expect((await leer(r2)).texto).toBe("Resumen guardado");
    expect(estado.peticiones).toHaveLength(1);
  });

  it("límite del nivel gratuito (429) → «El asesor está muy solicitado…», sin detalles técnicos", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    const { ApiError } = await import("@google/genai");
    estado.error = new ApiError({ message: '{"error":{"code":429,"message":"Quota exceeded for metric generate_content_free_tier_requests","status":"RESOURCE_EXHAUSTED"}}', status: 429 });
    const r = await POST(peticion({ pregunta: "x" }, "201.0.0.4"));
    expect(r.status).toBe(503);
    const j = await r.json();
    expect(j.error).toBe("El asesor está muy solicitado, intenta en un minuto.");
    expect(JSON.stringify(j)).not.toMatch(/Quota|RESOURCE_EXHAUSTED|429/);
  });

  it("si el límite llega a mitad de la respuesta, la nota es la misma", async () => {
    const { POST } = await import("@/app/api/asesor/route");
    const { ApiError } = await import("@google/genai");
    estado.vueltas = [[trozo([{ functionCall: { name: "datos_mercado", args: {} } }], "STOP")]];
    // la ruta ya respondió 200 con la primera vuelta; la segunda falla por cuota
    const r = await POST(peticion({ pregunta: "x" }, "201.0.0.5"));
    estado.error = new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 });
    const { texto, eventos } = await leer(r);
    expect(texto).toContain("El asesor está muy solicitado, intenta en un minuto.");
    expect(eventos[eventos.length - 1]).toEqual({ t: "fin", stop: "error" });
  });
});
