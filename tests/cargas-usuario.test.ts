/* Datos cargados por el usuario (curva FRAC y expectativas): lector robusto y entrega al motor.
   lib/engine no cambia: solo los datos que recibe. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { filasCSV, type Celda } from "@/lib/cargas/leer";
import { crearDefaults, toEngine, type EntradasUI } from "@/lib/calculadora";
import { conDatosUsuario, datosValidos, desdeVersionAnterior, etiquetaSerie, ID_CURVA_USUARIO, type SerieUsuario } from "@/lib/cargas-usuario/datos";
import { analizarArchivo, analizarHoja, extremos, leerSerie, mesAnio, textoDescartes, type TipoSerieUsuario } from "@/lib/cargas-usuario/lector";
import { crearMotor, esError, type DatosMercado, type TipoBono } from "@/lib/engine";

const D = datos as unknown as DatosMercado;
const CARGADA = "2026-11-18T12:00:00.000Z";

/** Lee un CSV con las columnas sugeridas. */
function csv(texto: string, tipo: TipoSerieUsuario = "frac") {
  const { filas, comaDecimal } = filasCSV(texto);
  const { analisis, sugerida } = analizarArchivo([{ hoja: "csv", filas }], tipo, comaDecimal);
  return leerSerie(filas, analisis[0], sugerida.colFecha, sugerida.colValor, tipo, comaDecimal);
}
const serie = (tipo: TipoSerieUsuario, d: [string, number][], archivo = "x.csv"): SerieUsuario => ({ tipo, datos: d, archivo, cargada: CARGADA });

describe("Lector: fechas, % y columnas", () => {
  it("convierte % a decimal (11,17 → 0,1117) y acepta fechas aaaa-mm-dd y dd/mm/aaaa", () => {
    const r = csv("Fecha;FRA IBR\n2026-11-17;11,17\n18/11/2026;11,15\n");
    expect(r.ok && r.serie.datos).toEqual([
      ["2026-11-17", 0.1117],
      ["2026-11-18", 0.1115],
    ]);
    expect(r.ok && r.serie.avisos[0]).toMatch(/11,17 → 0,1117/);
  });

  it("fechas de Excel (Date y número de serie)", () => {
    const filas: Celda[][] = [["Fecha", "Tasa"], [new Date(Date.UTC(2026, 10, 17)), 0.1117], [46344, 0.1115]];
    const a = analizarHoja("FRAC", filas, "frac");
    const r = leerSerie(filas, a, a.colFecha, a.colValor, "frac");
    expect(r.ok && r.serie.datos).toEqual([
      ["2026-11-17", 0.1117],
      ["2026-11-18", 0.1115],
    ]);
  });

  it("expectativas con mes/año en varios formatos (primer día del mes)", () => {
    for (const [txt, f] of [
      ["2027-03", "2027-03-01"],
      ["03/2027", "2027-03-01"],
      ["mar-2027", "2027-03-01"],
      ["Marzo de 2027", "2027-03-01"],
      ["2027M03", "2027-03-01"],
      ["dic 27", "2027-12-01"],
    ])
      expect(mesAnio(txt)).toBe(f);
    expect(mesAnio("13/2027")).toBeNull();
    const r = csv("Mes;Inflación esperada (%)\nene-2027;5,10\nfeb-2027;4,95\nmar-2027;4,80\n", "exp");
    expect(r.ok && r.serie.datos).toEqual([
      ["2027-01-01", 0.051],
      ["2027-02-01", 0.0495],
      ["2027-03-01", 0.048],
    ]);
  });

  it("varias hojas y columnas: sugiere la hoja con datos y las columnas por encabezado", () => {
    const hojas = [
      { hoja: "Portada", filas: [["Curvas del día"], ["Fuente: mesa"]] as Celda[][] },
      {
        hoja: "FRAC",
        filas: [["Curva FRAC 17-nov-2026"], [], ["Nodo", "Fecha", "Días", "FRA IBR (%)"], [1, "2026-11-17", 0, 11.166], [2, "2026-12-17", 30, 11.1]] as Celda[][],
      },
    ];
    const { analisis, sugerida } = analizarArchivo(hojas, "frac");
    expect(sugerida.hoja).toBe(1);
    expect(analisis[1].columnas.map((c) => c.nombre)).toEqual(["Nodo", "Fecha", "Días", "FRA IBR (%)"]);
    expect(sugerida.colFecha).toBe(1);
    expect(sugerida.colValor).toBe(3);
    // el usuario puede elegir otras columnas
    const r = leerSerie(hojas[1].filas, analisis[1], 1, 3, "frac");
    expect(r.ok && r.serie.datos[0]).toEqual(["2026-11-17", 0.11166]);
    expect(leerSerie(hojas[1].filas, analisis[1], 1, 1, "frac").ok).toBe(false);
  });

  it("ordena por fecha y avisa de fechas repetidas (queda la última)", () => {
    const r = csv("Fecha;Tasa\n2026-12-17;11,10\n2026-11-17;11,17\n2026-12-17;11,12\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.serie.datos).toEqual([
      ["2026-11-17", 0.1117],
      ["2026-12-17", 0.1112],
    ]);
    expect(r.serie.repetidas).toBe(1);
    expect(r.serie.avisos.join(" ")).toMatch(/1 fecha\(s\) repetida\(s\)/);
    expect(r.serie.avisos.join(" ")).toMatch(/no venían en orden; se ordenaron/);
  });

  it("primeras y últimas 3 filas para la vista previa", () => {
    const d = Array.from({ length: 10 }, (_, i) => [`2026-11-${String(10 + i)}`, 0.1] as [string, number]);
    const e = extremos(d);
    expect(e.primeras.map((x) => x[0])).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(e.ultimas.map((x) => x[0])).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(extremos(d.slice(0, 5)).ultimas).toEqual([]);
  });
});

describe("Lector: filas inválidas", () => {
  it("un archivo con #REF! y una tasa de −426 % se carga descartando esas filas", () => {
    const lineas = ["Fecha;FRA IBR (%)"];
    for (let k = 0; k < 40; k++) lineas.push(`${new Date(Date.UTC(2026, 10, 17 + k * 30)).toISOString().slice(0, 10)};${(11.17 - k * 0.02).toFixed(2).replace(".", ",")}`);
    lineas.push("2030-01-17;#REF!", "2056-10-22;-426,14", ";", "2056-11-22;", "Total;texto", "2056-12-22;#REF!");
    const r = csv(lineas.join("\n") + "\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.serie.datos).toHaveLength(40);
    expect(r.serie.datos[0]).toEqual(["2026-11-17", 0.1117]);
    expect(r.serie.datos.every(([, v]) => v >= 0 && v <= 0.3)).toBe(true);
    expect(r.serie.descartes).toEqual({ sinNumero: 5, fechaInvalida: 0, fueraDeRango: 1 });
    expect(r.serie.avisos).toContain("Se descartaron 6 fila(s): 5 sin número (#REF!, vacías o texto), 1 fuera de rango (0 % a 30 %).");
  });

  it("rangos: FRAC 0 % a 30 %; inflación −5 % a 30 %", () => {
    const f = csv("Fecha;Tasa\n2026-11-17;11\n2026-12-17;-1\n2027-01-17;31\n2027-02-17;10\n");
    expect(f.ok && f.serie.descartes.fueraDeRango).toBe(2);
    const e = csv("Mes;Inflación\n2027-01;5\n2027-02;-1\n2027-03;-6\n2027-04;31\n", "exp");
    expect(e.ok && e.serie.datos.map((x) => x[1])).toEqual([0.05, -0.01]);
    expect(e.ok && e.serie.descartes.fueraDeRango).toBe(2);
  });

  it("fechas inválidas se cuentan aparte; con menos de dos filas válidas no se carga", () => {
    const r = csv("Fecha;Tasa\n2026-02-30;11\n2026-11-17;11\n2026-12-17;11,1\n");
    expect(r.ok && r.serie.descartes.fechaInvalida).toBe(1);
    const malo = csv("Fecha;Tasa\n2026-11-17;#REF!\n2026-12-17;11\n");
    expect(malo.ok).toBe(false);
    expect(!malo.ok && malo.error).toMatch(/Quedan 1 fila\(s\) válidas/);
    expect(textoDescartes({ sinNumero: 0, fechaInvalida: 0, fueraDeRango: 0 }, "frac")).toBe("");
  });
});

/* ---------- entrega al motor ---------- */
const def = crearDefaults("2026-11-18");
function valorar(D2: DatosMercado, e: EntradasUI) {
  const o = crearMotor(D2).price(toEngine(e));
  if (esError(o)) throw new Error(o.error);
  return o;
}
const casos: [TipoBono, Record<string, string>][] = [
  ["TF", {}],
  ["IBR", { metodologia: "IBR vigente" }],
  ["IBR", { metodologia: "Curva FRAC" }],
  ["IPC", { proyeccion: "IPC vigente" }],
  ["IPC", { proyeccion: "Expectativas" }],
  ["UVR", { proyeccion: "IPC vigente" }],
  ["UVR", { proyeccion: "Expectativas" }],
];

describe("Motor con los datos del usuario", () => {
  it("con los datos por defecto todos los resultados son idénticos (regresión)", () => {
    expect(conDatosUsuario(D, {})).toBe(D);
    expect(conDatosUsuario(D, datosValidos(null))).toBe(D);
    for (const [t, extra] of casos) expect(valorar(conDatosUsuario(D, {}), { ...def[t], ...extra })).toEqual(valorar(D, { ...def[t], ...extra }));
  });

  it("FRAC del usuario: el bono IBR con «Curva FRAC» la usa; volver a los datos por defecto deja todo igual", () => {
    const plana = serie("frac", [
      ["2026-11-17", 0.05],
      ["2030-12-31", 0.05],
    ]);
    const D2 = conDatosUsuario(D, { frac: plana });
    const o = valorar(D2, { ...def.IBR, metodologia: "Curva FRAC", curvaFrac: ID_CURVA_USUARIO });
    expect(o.tipo === "IBR" && o.curvaFracNombre).toBe("FRAC: cargada por el usuario · 17·nov·2026");
    const futuros = o.rows.filter((r) => r.fuente === "FRAC");
    expect(futuros.length).toBeGreaterThan(0);
    expect(futuros.every((r) => r.H === 0.05)).toBe(true);
    expect(valorar(conDatosUsuario(D, {}), { ...def.IBR, metodologia: "Curva FRAC" })).toEqual(valorar(D, { ...def.IBR, metodologia: "Curva FRAC" }));
  });

  it("Expectativas del usuario: cambian los bonos con «Expectativas»; «IPC vigente» y tasa fija no cambian", () => {
    const exp = serie("exp", [
      ["2026-09-01", 0.09],
      ["2028-12-01", 0.09],
    ]);
    const D2 = conDatosUsuario(D, { exp });
    expect(D2.exp).toBe(exp.datos);
    for (const [t, extra] of casos) {
      const antes = valorar(D, { ...def[t], ...extra });
      const despues = valorar(D2, { ...def[t], ...extra });
      // (en UVR el precio en % no cambia: cambian los flujos en pesos y la TIR en pesos)
      if (extra.proyeccion === "Expectativas") expect(despues.yieldCOP).not.toBeCloseTo(antes.yieldCOP, 6);
      else expect(despues).toEqual(antes);
    }
  });

  it("etiquetas, validación de lo guardado y migración de la versión anterior", () => {
    expect(etiquetaSerie(serie("exp", [["2027-01-01", 0.05], ["2027-02-01", 0.05]]))).toBe("Expectativas: cargadas por el usuario · 18·nov·2026");
    // la fecha de carga es la de Colombia (las 9 p. m. del 18 en Bogotá ya son el 19 en hora universal)
    expect(etiquetaSerie({ ...serie("exp", [["2027-01-01", 0.05], ["2027-02-01", 0.05]]), cargada: "2026-11-19T02:00:00.000Z" })).toMatch(/18·nov·2026$/);
    expect(datosValidos({ frac: serie("frac", [["2026-11-17", 2], ["2026-12-17", 0.1]]) })).toEqual({});
    expect(datosValidos({ exp: serie("exp", [["2026-11-01", -0.01], ["2026-12-01", 0.05]]) }).exp).toBeTruthy();
    const vieja = { fechaBase: "2026-11-17", datos: [["2026-11-17", 0.11], ["2026-12-17", 0.111]], archivo: "c.csv", cargada: CARGADA };
    expect(desdeVersionAnterior(vieja)).toEqual({ tipo: "frac", datos: vieja.datos, archivo: "c.csv", cargada: CARGADA });
    expect(desdeVersionAnterior({ datos: [] })).toBeNull();
  });
});

/* ---------- archivo real de la clase ---------- */
const ARCHIVO_FRAC = path.join(process.cwd(), "datos", "frac", "curva_frac_2026-11-17.csv");

describe.skipIf(!existsSync(ARCHIVO_FRAC))("Archivo datos/frac/curva_frac_2026-11-17.csv", () => {
  it("un bono IBR con «Curva FRAC» y valoración 2026-11-18 usa 0,11166 en el primer periodo", () => {
    const r = csv(readFileSync(ARCHIVO_FRAC, "utf8"));
    if (!r.ok) throw new Error(r.error);
    expect(r.serie.datos[0][0]).toBe("2026-11-17");
    const D2 = conDatosUsuario(D, { frac: serie("frac", r.serie.datos, "curva_frac_2026-11-17.csv") });
    const o = valorar(D2, { ...def.IBR, valoracion: "2026-11-18", metodologia: "Curva FRAC", curvaFrac: ID_CURVA_USUARIO });
    if (o.tipo !== "IBR") throw new Error("no es IBR");
    const primero = o.rows.find((x) => x.fuente === "FRAC");
    expect(primero?.H).toBeCloseTo(0.11166, 5);
  });
});
