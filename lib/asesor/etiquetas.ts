/* Nombres legibles de las herramientas del asesor (los usa la interfaz; sin dependencias del motor). */
export const ETIQUETA_HERRAMIENTA: Record<string, string> = {
  valorar_titulo: "Valoró el título",
  simular_escenario_tasas: "Simuló el escenario de tasas",
  comparar_opciones: "Comparó TES, IBR, IPC, UVR y CDT",
  analizar_fondeo: "Analizó el fondeo",
  resumen_portafolio: "Resumió el portafolio",
  datos_mercado: "Consultó los datos del día",
};

export const etiquetaHerramienta = (nombre: string) => ETIQUETA_HERRAMIENTA[nombre] ?? nombre;
