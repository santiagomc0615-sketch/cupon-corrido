# Cupón Corrido — calculadora de renta fija colombiana

Proyecto académico para la clase de Portafolio de Renta Fija. Página web que valora bonos colombianos (Tasa Fija, IBR, IPC, UVR), gestiona un portafolio, muestra datos de mercado (BanRep, DANE, curva TES) y trae un asesor de IA.

## Fuente de verdad
- `excel/Calculadora_para_pagina.xlsx`: las fórmulas del Excel mandan. Si hay duda sobre un cálculo, léelo de ahí (hojas Calculadora_*, Cronograma_*, Rentabilidad, Curva_Rendimiento).
- `prototipo/engine.js`: motor ya validado contra el Excel. Pásalo a TypeScript sin cambiar la lógica.
- `prototipo/cupon-corrido.html`: prototipo funcionando (diseño, secciones, textos). Ábrelo en el navegador como referencia visual.
- `validacion/casos-prueba.json`: valores esperados. Todo cambio al motor debe pasar estas pruebas (tolerancia 0,001 en precios y 1e-6 en tasas).

## Convenciones financieras (no cambiar)
- Precio sucio truncado a 3 decimales (`TRUNC(x,3)`); precio limpio = sucio − cupón corrido.
- Bases: 365/365 (días reales sin 29-feb), Real/365, 30/360 europeo (DAYS360 con TRUE), Real/360.
- Fechas de cupón con EDATE desde la emisión; el último cupón es el vencimiento.
- D* = ROUND(Macaulay, 3) / (1 + TIR). DV01 = ROUND(D*,3) × precio sucio/100 × nominal × 0,0001 (× UVR en títulos UVR).
- Convexidad = Σ t(t+1)·VP / (Σ VP · (1+TIR)²).
- IPC: tasa = (1+IPC)(1+spread) − 1; el IPC rige desde el 5.º día hábil del mes siguiente + 1.
- IBR: cupón = (IBR + spread) × días/base; IBR publicado del día hábil anterior al inicio del periodo.
- UVR: flujos en UVR, conversión a pesos con UVR proyectada con inflación; TIR en pesos con XIRR.

## Stack
- Next.js (App Router) + TypeScript + Tailwind. Despliegue en Vercel.
- Motor en `lib/engine/` como funciones puras, con pruebas en Vitest.
- Datos: rutas de servidor en `app/api/` que consultan BanRep y datos.gov.co, guardan en caché y se refrescan a diario con Vercel Cron. El navegador nunca llama a esas fuentes directamente.
- IA: `app/api/asesor` llama a la API de Anthropic. La clave va en `ANTHROPIC_API_KEY` (archivo `.env.local`, nunca en el repositorio ni en el cliente). Límite de consultas por IP.
- Portafolio: localStorage al inicio (luego Supabase si se quieren cuentas).

## Diseño (no hacerlo genérico)
- Concepto: título valor grabado (guilloché de papel de seguridad) + terminal de mesa de dinero.
- Paleta de banca institucional (tokens en `app/globals.css`; `--engrave` = acento verde petróleo, `--seal` = dorado).
- Colores claro: fondo #F6F7F9, superficie #FFFFFF, superficie 2 #EEF1F5, texto #0F1B2D, texto 2 #4A5568, texto 3 #5F6B7E (el #8A94A6 pedido no llega a AA), línea #DDE2EA, acento #0F5C5C, dorado #A07C3B (texto: #8A6A2E), positivo #1F7A4D, negativo #B42318, advertencia #B7791F (texto: #855D23).
- Colores oscuro: fondo #0B1220, superficie #111A2B, superficie 2 #16213A, texto #E6EAF0, texto 2 #A3AEC2, texto 3 #8592A8, línea #22304A, acento #6CCAC4, dorado #D2B06A, positivo #4CC38A, negativo #F07A6A.
- Acento solo en elementos clave (pestaña activa, botón principal, cifra principal, línea principal de gráficos); lo demás en neutros. Todo texto ≥ AA en ambos temas.
- Guilloché del héroe: esquina superior derecha, opacidad ≤ 0,12, detrás del contenido, oculto bajo 900 px.
- Tipografías: Bodoni Moda (títulos), IBM Plex Sans (texto; seminegrita para las cifras grandes, token `--f-cifra`), IBM Plex Mono (cifras de tablas, tabular-nums).
- Riel de navegación a la izquierda, cinta de mercado arriba, cifras en tablas alineadas a la derecha.
- Nada de gradientes morados, emojis como íconos ni tarjetas redondeadas iguales para todo.

## Reglas de trabajo
- Todo el texto de la interfaz en español de Colombia; números con coma decimal (`Intl.NumberFormat('es-CO')`).
- Cada cifra de mercado muestra fuente y fecha del dato.
- Avisos visibles: "Herramienta académica, no es asesoría financiera" y "Respuestas generadas por IA".
- Antes de cambios grandes, proponer un plan. Después de tocar el motor, correr `npm test`.
