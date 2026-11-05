# Prompts para Claude Code (pégalos en orden, uno por sesión o por paso)

Espera a que termine cada fase, revisa el resultado en el navegador y luego sigue con la próxima.

---

## Fase 0 · Arranque (con modo plan)
```
Lee CLAUDE.md, abre prototipo/cupon-corrido.html y prototipo/engine.js, y revisa el Excel en excel/.
Propón un plan para migrar este prototipo a Next.js + TypeScript + Tailwind conservando el motor de cálculo,
las 6 secciones (Mercado, Calculadora, Portafolio, Curva TES, Asesor IA, Noticias) y el diseño.
Muéstrame la estructura de carpetas antes de escribir código.
```

## Fase 1 · Motor con pruebas
```
Crea el proyecto Next.js y pasa prototipo/engine.js a TypeScript en lib/engine/ (funciones puras, tipos para cada bono).
Configura Vitest y escribe pruebas que carguen validacion/casos-prueba.json y comparen cada resultado.
No cambies la lógica financiera. Corre las pruebas hasta que todas pasen.
```

## Fase 2 · Interfaz
```
Construye la interfaz igual al prototipo: riel lateral, cinta de mercado, y las 6 secciones como rutas
(/mercado, /calculadora, /portafolio, /curva, /asesor, /noticias). Usa los colores y tipografías de CLAUDE.md,
tema claro/oscuro, y que funcione bien en celular. Por ahora usa prototipo/datos-mercado.json como datos.
Los gráficos pueden ser SVG propios (como el prototipo) o Recharts con los mismos colores.
```

## Fase 3 · Datos en vivo (BanRep, DANE, datos.gov.co)
```
Crea rutas de servidor en app/api/mercado/ que traigan: tasa de política monetaria, IBR (overnight, 1, 3, 6 y 12 meses),
UVR diaria e IPC (índice y variación anual), desde la API de series estadísticas del Banco de la República
y/o datos.gov.co. Investiga primero los endpoints actuales y muéstrame cuáles vas a usar.
Guarda en caché, refresca a diario con Vercel Cron y deja el JSON del prototipo como respaldo si la fuente falla.
Cada dato debe llevar su fecha y fuente.
```

## Fase 4 · Asesor de IA
```
Crea app/api/asesor que reciba la pregunta + un resumen del mercado y del portafolio (como ctxSnapshot() en el prototipo)
y llame a la API de Anthropic con streaming. La clave va en ANTHROPIC_API_KEY en .env.local.
Usa el mismo prompt de sistema del prototipo (constante SYS). Agrega límite de 20 consultas por hora por IP
y muestra la respuesta en streaming en /asesor con las 4 consultas rápidas.
```

## Fase 5 · Noticias
```
En /noticias muestra los últimos titulares de Bloomberg Línea (sección Colombia/mercados) y de fuentes oficiales,
leyendo sus RSS desde el servidor (no iframes). Título, fecha, fuente y enlace que abra en pestaña nueva.
Cachea 30 minutos.
```

## Fase 6 · Extras para destacar (elige)
```
Agrega [una de estas]:
- Inflación implícita (breakeven) comparando la curva TES tasa fija con la curva TES UVR.
- Constructor de escenarios: "si BanRep recorta X pb" → impacto en cada posición y en el portafolio.
- Carry y roll-down de cada título a 3, 6 y 12 meses.
- "Modo clase": al tocar un resultado muestra la fórmula y los números paso a paso.
- Reporte PDF del portafolio descargable.
```

## Fase 7 · Legal y publicación
```
Crea /privacidad y /terminos en español (Ley 1581 de 2012 y Decreto 1377 de 2013: qué datos guarda la página,
finalidad, derechos del titular y contacto; aviso de no asesoría financiera y de uso de IA). Agrega enlaces en el pie.
Luego guíame paso a paso para subir el proyecto a GitHub, desplegarlo en Vercel, configurar ANTHROPIC_API_KEY
y conectar mi dominio.
```
