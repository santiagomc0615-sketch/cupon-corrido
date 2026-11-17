/* Informe para el cliente: convierte la respuesta del asesor (markdown sencillo: "### ", "- ", **)
   en secciones para el PDF. Función pura. Las cifras ya vienen de las herramientas. */

export interface Parte {
  t: string;
  negrita: boolean;
}
export interface Bloque {
  tipo: "p" | "li";
  partes: Parte[];
}
export interface SeccionInforme {
  titulo: string;
  bloques: Bloque[];
}

/** Texto con **negritas** → partes; quita marcas de cursiva (_x_) y de código (`x`). */
export function partes(linea: string): Parte[] {
  return linea
    .split("**")
    .map((t, i) => ({ t: t.replace(/(^|\s)_(.+?)_(?=\s|$|[.,;:])/g, "$1$2").replace(/`/g, ""), negrita: i % 2 === 1 }))
    .filter((p) => p.t);
}

export function seccionesInforme(md: string): SeccionInforme[] {
  const secciones: SeccionInforme[] = [];
  let actual: SeccionInforme | null = null;
  for (const cruda of md.split(/\r?\n/)) {
    const l = cruda.trim();
    if (!l) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(l);
    if (h) {
      actual = { titulo: h[1].replace(/\*\*/g, "").trim(), bloques: [] };
      secciones.push(actual);
      continue;
    }
    if (!actual) {
      actual = { titulo: "", bloques: [] };
      secciones.push(actual);
    }
    const li = /^[-*•]\s+(.*)$/.exec(l);
    actual.bloques.push(li ? { tipo: "li", partes: partes(li[1]) } : { tipo: "p", partes: partes(l) });
  }
  return secciones.filter((s) => s.titulo || s.bloques.length);
}
