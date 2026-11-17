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
- Paleta grafito y esmeralda (v3; tokens en `app/globals.css`; `--engrave` = acento esmeralda para texto, `--acento-fondo` = relleno, `--seal` = dorado).
- Colores claro: fondo #F5F6F7, superficie #FFFFFF, superficie 2 #EEF0F2, línea #DCE0E5, texto #14171C, texto 2 #525A66, texto 3 #666C74 (el #868E99 pedido no llega a AA; queda en `--ink-4` para trazos), acento #12805C (texto: #117A57), dorado #9A7A3F (texto: #816635), positivo #1B7B50, negativo #BE402C, advertencia #A86B0C (texto: #97600B). Tarjetas con sombras suaves en capas, sin bordes grises fuertes.
- Colores oscuro: fondo #0E1013, superficie #15181D, superficie elevada #1C2027, línea #2A2F38, texto #ECEEF1, texto 2 #A2A9B4, texto 3 #808997 (el #6E7682 pedido no llega a AA; queda en `--ink-4`), acento esmeralda #34B489, dorado champán #C9A86A, positivo #3DCB8F, negativo #F0705F, advertencia #E2B04A.
- Acento solo en elementos clave (pestaña activa, botón principal, cifra principal, línea principal de gráficos); lo demás en neutros. Todo texto ≥ AA en ambos temas.
- Guilloché del héroe: esquina superior derecha, opacidad ≤ 0,12, detrás del contenido, oculto bajo 900 px.
- Tipografías: Bodoni Moda (títulos), IBM Plex Sans (texto), Geist 600 con números tabulares para las cifras grandes (token `--f-cifra`), Geist Mono 500 para las tablas (`--f-mono`). Todas con next/font (`app/fuentes.ts`).
- Riel de navegación a la izquierda, cinta de mercado arriba, cifras en tablas alineadas a la derecha.
- Nada de gradientes morados, emojis como íconos ni tarjetas redondeadas iguales para todo.

## Reglas de trabajo
- Todo el texto de la interfaz en español de Colombia; números con coma decimal (`Intl.NumberFormat('es-CO')`).
- Cada cifra de mercado muestra fuente y fecha del dato.
- Avisos visibles: "Herramienta académica, no es asesoría financiera" y "Respuestas generadas por IA".
- Antes de cambios grandes, proponer un plan. Después de tocar el motor, correr `npm test`.
