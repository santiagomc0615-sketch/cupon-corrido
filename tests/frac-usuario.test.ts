/* Curva FRAC cargada por el usuario: lectura, validación y efecto en el motor (lib/engine sin cambios). */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { filasCSV } from "@/lib/cargas/leer";
import { crearDefaults, toEngine } from "@/lib/calculadora";
import { crearMotor, esError, type DatosMercado } from "@/lib/engine";
import { conCurvaUsuario, curvaGuardadaValida, curvaUsuarioEnUso, curvaParaMotor, ID_CURVA_USUARIO, leerCurvaFrac, leerCurvaFracHojas, nombreCurvaUsuario } from "@/lib/frac/usuario";

const D = datos as unknown as DatosMercado;
const CARGADA = "2026-11-18T12:00:00.000Z";
const csv = (t: string) => {
  const { filas, comaDecimal } = filasCSV(t);
  return leerCurvaFrac(filas, "curva.csv", CARGADA, comaDecimal);
};

describe("Lectura de la curva FRAC (CSV y Excel)", () => {
  it("detecta las columnas por encabezado y pasa % a decimal", () => {
    const r = csv("Fecha;IBR forward (%)\n2026-11-18;9,25\n2026-12-18;9,10\n2027-01-18;8,95\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.curva.fechaBase).toBe("2026-11-18");
    expect(r.curva.datos).toEqual([
      ["2026-11-18", 0.0925],
      ["2026-12-18", 0.091],
      ["2027-01-18", 0.0895],
    ]);
    expect(r.avisos).toContain("Las tasas venían en %; se pasaron a decimal.");
  });

  it("acepta tasas ya en decimal, fechas DD/MM/AAAA y columnas en otro orden", () => {
    const r = csv("tasa,dia,nota\n0.0925,18/11/2026,a\n0.0910,18/12/2026,b\n");
    expect(r.ok && r.curva.datos).toEqual([
      ["2026-11-18", 0.0925],
      ["2026-12-18", 0.091],
    ]);
    expect(r.ok && r.avisos).toEqual([]);
  });

  it("sin encabezado detecta la columna de fecha y la de tasa por su contenido", () => {
    const r = csv("2026-11-18;9,25\n2026-11-19;9,24\n");
    expect(r.ok && r.curva.datos.length).toBe(2);
  });

  it("Excel: celdas Date y números de serie, título arriba y filas vacías al final", () => {
    const filas = [
      ["Curva FRAC del día"],
      [],
      ["Fecha", "IBR forward"],
      [new Date(Date.UTC(2026, 10, 18)), 0.0925],
      [46345, 0.091], // 2026-11-19 como número de serie de Excel
      [null, null],
      ["", ""],
    ];
    const r = leerCurvaFracHojas([{ hoja: "Hoja vacía", filas: [["nada"]] }, { hoja: "FRAC", filas }], "curva.xlsx", CARGADA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.curva.datos).toEqual([
      ["2026-11-18", 0.0925],
      ["2026-11-19", 0.091],
    ]);
    expect(r.curva.archivo).toBe("curva.xlsx · FRAC");
  });
});

describe("Validación", () => {
  it("fechas fuera de orden o repetidas", () => {
    const r = csv("Fecha;Tasa\n2026-12-18;9,1\n2026-11-18;9,2\n2026-11-18;9,3\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores[0]).toMatch(/Fila 3: la fecha 2026-11-18 no es posterior a la anterior \(2026-12-18\)/);
    expect(r.errores[1]).toMatch(/Fila 4/);
  });

  it("los errores salen en el orden de las filas", () => {
    const r = csv("Fecha;Tasa\n2026-12-18;9,1\n2026-11-18;9,2\n;\n2027-01-18;45\n");
    expect(!r.ok && r.errores.map((e) => e.slice(0, 7))).toEqual(["Fila 3:", "Fila 4:", "Fila 5:"]);
  });

  it("vacíos en medio de la curva", () => {
    const r = csv("Fecha;Tasa\n2026-11-18;9,2\n;\n2026-12-18;9,1\n2027-01-18;\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores).toEqual(["Fila 3: está vacía.", "Fila 5: falta la tasa o no es un número."]);
  });

  it("fechas inválidas", () => {
    const r = csv("Fecha;Tasa\n2026-11-18;9,2\n2026-02-30;9,1\n");
    expect(!r.ok && r.errores[0]).toMatch(/Fila 3: la fecha «2026-02-30» no es válida/);
  });

  it("tasas fuera de 0 % a 30 %", () => {
    const r = csv("Fecha;Tasa\n2026-11-18;9,2\n2026-12-18;35\n2027-01-18;-1\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores).toHaveLength(2);
    expect(r.errores[0]).toMatch(/Fila 3: la tasa 35,00 % .* fuera del rango razonable \(0 % a 30 %\)/);
  });

  it("sin columnas reconocibles o con un solo nodo", () => {
    expect(csv("hola;mundo\nx;y\n").ok).toBe(false);
    const r = csv("Fecha;Tasa\n2026-11-18;9,2\n");
    expect(!r.ok && r.errores).toEqual(["La curva necesita al menos dos fechas."]);
  });

  it("muestra a lo sumo seis errores y cuántos más hay", () => {
    const filas = "Fecha;Tasa\n" + Array.from({ length: 10 }, (_, i) => `2026-11-${String(10 + i).padStart(2, "0")};45`).join("\n");
    const r = csv(filas);
    expect(!r.ok && r.errores).toHaveLength(7);
    expect(!r.ok && r.errores[6]).toBe("… y 4 error(es) más.");
  });

  it("lo guardado en el navegador se valida antes de usarlo", () => {
    expect(curvaGuardadaValida(null)).toBe(false);
    expect(curvaGuardadaValida({ fechaBase: "2026-11-18", datos: [["2026-11-18", 0.09]] })).toBe(false);
    expect(curvaGuardadaValida({ fechaBase: "2026-11-18", datos: [["2026-11-18", 0.09], ["2026-12-18", 2]] })).toBe(false);
    expect(curvaGuardadaValida({ fechaBase: "2026-11-18", datos: [["2026-11-18", 0.09], ["2026-12-18", 0.091]], archivo: "x", cargada: CARGADA })).toBe(true);
  });
});

describe("Curva del usuario en el motor", () => {
  const def = crearDefaults("2026-11-18");
  const ibr = (extra: Record<string, string>) => toEngine({ ...def.IBR, ...extra });
  const precio = (D2: DatosMercado, extra: Record<string, string>) => {
    const o = crearMotor(D2).price(ibr(extra));
    if (esError(o) || o.tipo !== "IBR") throw new Error("sin valoración IBR");
    return o;
  };

  it("con la curva por defecto los resultados son idénticos a los actuales", () => {
    expect(conCurvaUsuario(D, null)).toBe(D);
    const casos: Record<string, string>[] = [{ metodologia: "IBR vigente" }, { metodologia: "Curva FRAC" }, { metodologia: "Curva FRAC", curvaFrac: "" }];
    for (const extra of casos)
      expect(precio(conCurvaUsuario(D, null), extra)).toEqual(precio(D, extra));
  });

  it("la curva del usuario solo cambia los bonos que la eligen con la metodología «Curva FRAC»", () => {
    // curva plana al 5 %, muy distinta de la del Excel
    const datosUsuario: [string, number][] = [];
    for (let m = 0; m <= 48; m++) datosUsuario.push([`${2026 + Math.floor((10 + m) / 12)}-${String(((10 + m) % 12) + 1).padStart(2, "0")}-18`, 0.05]);
    const c = { fechaBase: datosUsuario[0][0], datos: datosUsuario, archivo: "plana.csv", cargada: CARGADA };
    const D2 = conCurvaUsuario(D, c);
    // la curva solo entra al motor si algún bono la eligió
    expect(curvaUsuarioEnUso([{ curvaFrac: "" }, { curvaFrac: "excel" }])).toBe(false);
    expect(curvaUsuarioEnUso([{ curvaFrac: "" }], "usuario")).toBe(true);
    expect(curvaUsuarioEnUso([{ curvaFrac: ID_CURVA_USUARIO }])).toBe(true);
    const usuario = precio(D2, { metodologia: "Curva FRAC", curvaFrac: ID_CURVA_USUARIO });
    const excel = precio(D, { metodologia: "Curva FRAC" });
    expect(usuario.curvaFracId).toBe(ID_CURVA_USUARIO);
    expect(usuario.curvaFracNombre).toBe("Curva FRAC del 18·nov·2026 · cargada por el usuario");
    expect(usuario.dirty).not.toBeCloseTo(excel.dirty, 2);
    // volver a la curva por defecto = el motor se arma sin la curva del usuario: idéntico al original
    expect(precio(conCurvaUsuario(D, null), { metodologia: "Curva FRAC" })).toEqual(excel);
  });

  it("nombre y datos para el motor", () => {
    const c = { fechaBase: "2026-11-18", datos: [["2026-11-18", 0.09], ["2026-12-18", 0.091]] as [string, number][], archivo: "c.csv", cargada: CARGADA };
    expect(nombreCurvaUsuario(c)).toBe("Curva FRAC del 18·nov·2026 · cargada por el usuario");
    expect(curvaParaMotor(c)).toMatchObject({ id: "usuario", filas: 2, origen: "c.csv", fechaBase: "2026-11-18" });
  });
});
