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
- Colores claro: papel #E9EDE8, hoja #F8FAF7, tinta #0E1E19, tinta-2 #4B5C55, línea #C9D2CB, grabado #1C5A46, sello #8C6A2A, positivo #1D7A4B, negativo #B23F2E.
- Colores oscuro: papel #0B1411, hoja #111D19, tinta #E2EAE5, línea #23352E, grabado #72C6A3, sello #D4B067.
- Tipografías: Bodoni Moda (títulos y cifra principal), IBM Plex Sans (texto), IBM Plex Mono (todas las cifras, tabular-nums).
- Riel de navegación a la izquierda, cinta de mercado arriba, cifras en tablas alineadas a la derecha.
- Nada de gradientes morados, emojis como íconos ni tarjetas redondeadas iguales para todo.

## Reglas de trabajo
- Todo el texto de la interfaz en español de Colombia; números con coma decimal (`Intl.NumberFormat('es-CO')`).
- Cada cifra de mercado muestra fuente y fecha del dato.
- Avisos visibles: "Herramienta académica, no es asesoría financiera" y "Respuestas generadas por IA".
- Antes de cambios grandes, proponer un plan. Después de tocar el motor, correr `npm test`.
