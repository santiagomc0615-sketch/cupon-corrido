/* Nombres legibles de las herramientas del asesor (los usa la interfaz; sin dependencias del motor). */
export const ETIQUETA_HERRAMIENTA: Record<string, string> = {
  valorar_titulo: "Valoró el título",
  simular_escenario_tasas: "Simuló el escenario de tasas",
  comparar_opciones: "Comparó TES, IBR, IPC, UVR y CDT",
  analizar_fondeo: "Analizó el fondeo",
  resumen_portafolio: "Resumió el portafolio",
  datos_mercado: "Consultó los datos del día",
  calcular_impuestos: "Liquidó los impuestos",
  calcular_pyg: "Calculó el P&G",
  curva_tes: "Leyó la curva TES",
  inflacion_implicita: "Calculó la inflación implícita",
  retorno_esperado: "Calculó el retorno con roll-down",
  analisis_titulo: "Analizó liquidez, valorización y spread",
  simular_venta: "Simuló la venta",
  flujos: "Listó los flujos",
  comparador_cdt_tes: "Comparó CDT y bonos con impuestos",
};

export const etiquetaHerramienta = (nombre: string) => ETIQUETA_HERRAMIENTA[nombre] ?? nombre;
