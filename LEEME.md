# Kit Cupón Corrido → Claude Code

## Qué hay en esta carpeta
- `CLAUDE.md` — reglas del proyecto. Claude Code lo lee solo en cada sesión. No lo muevas de la raíz.
- `PROMPTS.md` — los prompts listos para pegar, fase por fase.
- `prototipo/cupon-corrido.html` — el prototipo completo. Ábrelo con doble clic para verlo.
- `prototipo/engine.js` — motor de cálculo (TF, IBR, IPC, UVR) validado contra el Excel.
- `prototipo/app-plantilla.html` — código de la interfaz del prototipo, sin datos (para leerlo fácil).
- `prototipo/datos-mercado.json` — IBR, IPC, UVR, curva TES y expectativas sacados de tu Excel.
- `excel/Calculadora_para_pagina.xlsx` — tu Excel.
- `validacion/casos-prueba.json` — resultados esperados para las pruebas automáticas.

## Pasos
1. Descomprime esta carpeta donde guardes tus proyectos, por ejemplo `Documentos/cupon-corrido`.
2. Instala Node.js versión LTS (nodejs.org) si no lo tienes. Hace falta para Next.js.
3. Abre Claude Code en esa carpeta:
   - Terminal: `cd` a la carpeta y escribe `claude`.
   - App de escritorio o VS Code: abre la carpeta como proyecto.
4. Instala la skill de diseño: escribe `/plugin`, busca `frontend-design` en el marketplace oficial de Anthropic e instálala.
5. Activa el modo plan (Shift+Tab hasta ver "plan mode") y pega el prompt de la Fase 0 de `PROMPTS.md`.
6. Aprueba el plan y sigue fase por fase. Al final de cada fase pide `npm run dev` y revisa en http://localhost:3000.
7. Para la IA crea una clave en console.anthropic.com y guárdala en `.env.local` como `ANTHROPIC_API_KEY=...`. Nunca la subas a GitHub.

## Consejos
- Una fase por conversación. Si una sesión se alarga mucho, usa `/clear` y empieza la siguiente fase.
- Si algo del cálculo no cuadra, dile: "compara con el Excel en excel/ y con validacion/casos-prueba.json".
- Haz commit en git al terminar cada fase. Así puedes volver atrás si algo se daña.
