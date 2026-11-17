/* Inflación implícita por referencia TES UVR (lib/analisis/inflacion-implicita). Casos calculados a mano. */
import { describe, expect, it } from "vitest";
import {
  aCSV,
  expectativaPromedio,
  fisher,
  inflacionImplicita,
  lecturaImplicita,
  leerCSVUVR,
  senalDe,
} from "@/lib/analisis/inflacion-implicita";

// Curva TF de dos referencias: 1 año al 10 %, 3 años al 12 %.
const TF: [number, number][] = [
  [3, 0.12],
  [1, 0.1],
];
const FECHA = "2026-01-01";

describe("Inflación implícita (Fisher)", () => {
  it("caso a mano: UVR a 2 años con TIR real 5 % → TF interpolada 11 % → 5,7143 %", () => {
    // plazo: 2026-01-01 → 2028-01-01 = 730 días / 365 = 2,0 años
    // TIR TF a 2 años = 10 % + (12 % − 10 %) × (2 − 1) / (3 − 1) = 11 %
    // implícita = 1,11 / 1,05 − 1 = 0,0571428571…
    const [f] = inflacionImplicita(TF, { fecha: FECHA, refs: [{ titulo: "UVR 2028", vencimiento: "2028-01-01", tirReal: 0.05 }] });
    expect(f.plazo).toBe(2);
    expect(f.tirTF).toBeCloseTo(0.11, 12);
    expect(f.implicita).toBeCloseTo(0.0571428571428571, 12);
    expect(f.extrapolado).toBe(false);
    expect(fisher(0.11, 0.05)).toBeCloseTo(0.0571428571428571, 12);
  });

  it("fuera de la curva TF toma la TIR del extremo y lo marca", () => {
    // 2026-01-01 → 2031-01-01 = 1.826 días (incluye el 29-feb-2028) → 5,0027 años > 3
    // TIR TF = 12 % (extremo); implícita = 1,12 / 1,06 − 1 = 0,0566037736
    const [f] = inflacionImplicita(TF, { fecha: FECHA, refs: [{ titulo: "UVR 2031", vencimiento: "2031-01-01", tirReal: 0.06 }] });
    expect(f.plazo).toBeCloseTo(1826 / 365, 12);
    expect(f.tirTF).toBe(0.12);
    expect(f.implicita).toBeCloseTo(0.0566037735849057, 12);
    expect(f.extrapolado).toBe(true);
  });

  it("ordena por plazo e ignora títulos ya vencidos; sin curva TF no hay filas", () => {
    const filas = inflacionImplicita(TF, {
      fecha: FECHA,
      refs: [
        { titulo: "B", vencimiento: "2029-01-01", tirReal: 0.05 },
        { titulo: "A", vencimiento: "2027-06-01", tirReal: 0.04 },
        { titulo: "Vencido", vencimiento: "2025-12-01", tirReal: 0.04 },
      ],
    });
    expect(filas.map((f) => f.titulo)).toEqual(["A", "B"]);
    expect(inflacionImplicita([[1, 0.1]], { fecha: FECHA, refs: [{ titulo: "x", vencimiento: "2027-01-01", tirReal: 0.05 }] })).toEqual([]);
  });
});

describe("Expectativas y lectura", () => {
  const plana: [string, number][] = [
    ["2026-06-01", 0.04],
    ["2027-12-01", 0.04],
  ];

  it("con una trayectoria plana la expectativa promedio es ese valor a cualquier plazo", () => {
    expect(expectativaPromedio(plana, FECHA, 2)).toBeCloseTo(0.04, 12);
    expect(expectativaPromedio(plana, FECHA, 10)).toBeCloseTo(0.04, 12);
    expect(expectativaPromedio([], FECHA, 2)).toBeNull();
  });

  it("con una trayectoria que baja de 5 % a 3 % en un año, el promedio queda entre ambos", () => {
    const baja: [string, number][] = [
      ["2026-01-01", 0.05],
      ["2027-01-01", 0.03],
    ];
    const e = expectativaPromedio(baja, FECHA, 1)!;
    // muestras mensuales 5 % − 2 %·k/12, k = 1…12: promedio aritmético = 3,9167 %; el geométrico es apenas menor
    expect(e).toBeLessThan(0.0391667);
    expect(e).toBeGreaterThan(0.039);
  });

  it("implícita 5,71 % vs. expectativa 4 % → brecha +171 pb → UVR/IPC", () => {
    const filas = inflacionImplicita(TF, { fecha: FECHA, refs: [{ titulo: "UVR 2028", vencimiento: "2028-01-01", tirReal: 0.05 }] });
    const { filas: f, resumen } = lecturaImplicita(filas, plana, FECHA);
    expect(f[0].brechaPb).toBeCloseTo((0.0571428571428571 - 0.04) * 1e4, 6); // 171,43 pb
    expect(f[0].senal).toBe("uvr");
    expect(resumen?.senal).toBe("uvr");
    expect(resumen?.fueraDeRango).toBe(1); // 5,71 % > 4 % (techo del rango de la meta)
  });

  it("si la expectativa supera a la implícita, la señal es tasa fija; ±25 pb es neutral", () => {
    const filas = inflacionImplicita(TF, { fecha: FECHA, refs: [{ titulo: "UVR 2028", vencimiento: "2028-01-01", tirReal: 0.05 }] });
    expect(lecturaImplicita(filas, [["2027-01-01", 0.07]], FECHA).resumen?.senal).toBe("tf");
    expect(senalDe(25)).toBe("neutral");
    expect(senalDe(-25)).toBe("neutral");
    expect(senalDe(25.1)).toBe("uvr");
    expect(senalDe(-30)).toBe("tf");
  });
});

describe("CSV de referencias UVR", () => {
  it("lee fecha, fuente y filas con TIR en % y coma decimal", () => {
    const csv = "fecha;17/11/2026\nfuente;SEN · cierre\ntitulo;vencimiento;tir_real\nTES UVR 2029;2029-04-18;5,40\nTES UVR 2035;25/04/2035;0,057";
    const r = leerCSVUVR(csv);
    if ("error" in r) throw new Error(r.error);
    expect(r.fecha).toBe("2026-11-17");
    expect(r.fuente).toBe("SEN · cierre");
    expect(r.refs).toEqual([
      { titulo: "TES UVR 2029", vencimiento: "2029-04-18", tirReal: 0.054 },
      { titulo: "TES UVR 2035", vencimiento: "2035-04-25", tirReal: 0.057 },
    ]);
    expect(r.avisos[0]).toMatch(/omitieron/);
  });

  it("ida y vuelta con aCSV; error si no hay filas válidas", () => {
    const d = { fecha: "2026-11-17", fuente: "Manual", refs: [{ titulo: "TES UVR 2033", vencimiento: "2033-02-23", tirReal: 0.056 }] };
    const r = leerCSVUVR(aCSV(d));
    if ("error" in r) throw new Error(r.error);
    expect(r.refs[0].tirReal).toBeCloseTo(0.056, 12);
    expect(r.fecha).toBe(d.fecha);
    expect(leerCSVUVR("hola;mundo")).toHaveProperty("error");
  });
});
