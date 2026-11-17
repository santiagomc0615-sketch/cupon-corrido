/* Estilo del reporte PDF: la marca (lib/brand.ts), los colores del tema claro de globals.css y las
   tipografías de la página (Bodoni Moda, IBM Plex Sans y Plex Mono, servidas desde /fonts/pdf). */
/** Parámetros del grabado (los de BRAND.logo). */
export interface OpcionesGuilloche {
  R: number;
  a: number;
  n: number;
  m: number;
  lines: number;
}

/** Colores del tema claro (los mismos tokens de app/globals.css; el PDF no lee CSS). */
export const C = {
  papel: "#F5F6F7",
  hoja: "#FFFFFF",
  hoja2: "#EEF0F2",
  tinta: "#14171C",
  tinta2: "#525A66",
  tinta3: "#666C74",
  linea: "#DCE0E5",
  acento: "#12805C",
  acentoSobre: "#FFFFFF",
  dorado: "#9A7A3F",
  doradoTexto: "#816635",
  positivo: "#1B7B50",
  negativo: "#BE402C",
} as const;

/** Archivos TTF (licencia OFL, ver public/fonts/pdf/OFL-*.txt) que registra @react-pdf/renderer. */
export const ARCHIVOS_FUENTE = {
  display: [{ archivo: "BodoniModa.ttf", peso: 500 }],
  texto: [
    { archivo: "IBMPlexSans-Regular.ttf", peso: 400 },
    { archivo: "IBMPlexSans-SemiBold.ttf", peso: 600 },
  ],
  mono: [
    { archivo: "IBMPlexMono-Regular.ttf", peso: 400 },
    { archivo: "IBMPlexMono-Medium.ttf", peso: 500 },
  ],
} as const;

export const FAMILIA = { display: "CCDisplay", texto: "CCTexto", mono: "CCMono" } as const;

/** Trazos del sello guilloché (la misma fórmula del logo en canvas), en un cuadro de `lado` unidades. */
export function trazosGuilloche(opt: OpcionesGuilloche, lado = 100, pasos = 360): string[] {
  const c = lado / 2,
    R = (opt.R * lado) / 2;
  const out: string[] = [];
  for (let k = 0; k < opt.lines; k++) {
    const ph = ((k / opt.lines) * Math.PI * 2) / opt.n;
    let d = "";
    for (let i = 0; i <= pasos; i++) {
      const th = (i / pasos) * Math.PI * 2;
      const r = R * (1 - opt.a) + R * opt.a * Math.sin(opt.n * th + ph) * Math.cos(opt.m * th - ph * 2);
      d += (i ? "L" : "M") + (c + r * Math.cos(th)).toFixed(2) + " " + (c + r * Math.sin(th)).toFixed(2);
    }
    out.push(d + "Z");
  }
  return out;
}
