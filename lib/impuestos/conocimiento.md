# Tributación de inversiones de renta fija en Colombia

Resumen verificado el 17 de noviembre de 2026 en el normograma de la DIAN y en textos oficiales. Las cifras para calcular están en `lib/impuestos/parametros.ts`. Es material académico: **no constituye asesoría tributaria; cada caso debe confirmarse con un contador**.

## 1. Retención en la fuente sobre rendimientos financieros

- **Tarifa: 4 %** sobre los rendimientos (intereses, descuentos y utilidad en la enajenación) de títulos de renta fija, CDT y TES.
- La tarifa era del 7 %. Pasó al 4 % con el Decreto 2418 de 2013 (art. 3), que modificó el Decreto 700 de 1997. Hoy está compilada en el DUR 1625 de 2016 (arts. 1.2.4.2.32 y 1.2.4.2.83).
- La DIAN confirma que la tarifa aplica a los TES, incluidos los TES clase B colocados con descuento:
  - [Oficio DIAN 19736 de 2014](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_19736_2014.htm)
  - [Oficio DIAN 905222 de 2021](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_905222_2021.htm)
- Es un **anticipo** del impuesto de renta, no un costo adicional: se descuenta del impuesto en la declaración.
- Las entidades vigiladas por la Superintendencia Financiera no son sujetas a esta retención; aplican autorretención.

## 2. Componente inflacionario de los rendimientos financieros

- **55,43 % de los rendimientos financieros del año gravable 2025 no constituye renta ni ganancia ocasional.** Lo fija el [Decreto 898 de 2026](https://normograma.dian.gov.co/dian/compilacion/docs/decreto_0898_2026.htm), del 29 de julio de 2026, en desarrollo del art. 40-1 del Estatuto Tributario.
- **A quién aplica:** solo a personas naturales y sucesiones ilíquidas **no obligadas a llevar contabilidad**.
- **Fondos:** el mismo porcentaje aplica a las utilidades que distribuyen los fondos mutuos de inversión, los fondos de inversión y los fondos de valores.
- **Cambia cada año:** el porcentaje se fija por decreto para cada año gravable. Para años distintos de 2025 hay que usar el decreto correspondiente.

## 3. Cédula general de personas naturales (art. 241)

- **Dónde quedan los rendimientos:** los rendimientos financieros de una persona natural son rentas de capital de la cédula general. Se suman a las rentas de trabajo y no laborales, y la renta líquida gravable se liquida con la tabla del art. 241 ([texto del Estatuto Tributario](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/estatuto_tributario_pr010.pdf); tabla modificada por la Ley 2010 de 2019, art. 34).
- **Tabla en UVT:**

| Desde (UVT) | Hasta (UVT) | Impuesto |
| --- | --- | --- |
| 0 | 1.090 | 0 % |
| 1.090 | 1.700 | (base − 1.090) × 19 % |
| 1.700 | 4.100 | (base − 1.700) × 28 % + 116 UVT |
| 4.100 | 8.670 | (base − 4.100) × 33 % + 788 UVT |
| 8.670 | 18.970 | (base − 8.670) × 35 % + 2.296 UVT |
| 18.970 | 31.000 | (base − 18.970) × 37 % + 5.901 UVT |
| Más de 31.000 | — | (base − 31.000) × 39 % + 10.352 UVT |

- **UVT 2026: $52.374**, según la [Resolución DIAN 000238 de 2025](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0238_2025.htm).
- **Tarifa marginal:** como la tabla es progresiva, la tarifa que paga un rendimiento adicional depende de los demás ingresos del año.
- **Límite de beneficios (art. 336):** las rentas exentas y deducciones de la cédula general no pueden superar el 40 % del subtotal ni 1.340 UVT al año. El límite lo fijó la [Ley 2277 de 2022, art. 7](https://normograma.dian.gov.co/dian/compilacion/docs/ley_2277_2022.htm).

## 4. Ganancia ocasional

- **Tarifa: 15 %** para personas naturales (art. 314 E.T.) y jurídicas (art. 313 E.T.), según la [Ley 2277 de 2022](https://normograma.dian.gov.co/dian/compilacion/docs/ley_2277_2022.htm).
- **Cuándo aplica (art. 300 E.T.):** es ganancia ocasional la utilidad en la venta de bienes que fueron **activo fijo** del contribuyente durante **dos años o más** ([Oficio DIAN 49408 de 2014](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_49408_2014.htm)).
  - **Renta fija: la DIAN no lo ha confirmado.** Para títulos de renta fija, la utilidad o pérdida se realiza al vender y es el precio menos el costo fiscal (art. 33 E.T.; [Oficio DIAN 1807 de 2018](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_1807_2018.htm)). En la venta de TIDIS, la DIAN trata la utilidad como rendimiento financiero.
  - Por eso la calculadora trata por defecto la utilidad en venta de un bono como **renta ordinaria**. Solo la trata como ganancia ocasional si el usuario marca el título como activo fijo con 2 años o más y la utilidad es positiva. Esa decisión debe respaldarla un contador.
  - Los **intereses causados siempre son rendimientos financieros** (renta ordinaria).
- **Cuándo no aplica:** si el título se tenía para negociar (inventario) o por menos de dos años, la utilidad es renta ordinaria.
- **Depende del caso:** clasificar el título como activo fijo o como inventario depende de cada contribuyente.
- **Pérdidas:** las pérdidas en ganancias ocasionales no se compensan con la renta ordinaria.

## 5. Gravamen a los movimientos financieros (GMF)

- **Tarifa: 4 por mil** sobre los retiros (art. 872 E.T., [Estatuto Tributario](https://normograma.dian.gov.co/dian/compilacion/docs/estatuto_tributario.htm)).
- **Exención (art. 879, num. 1):** los retiros de cuentas de ahorro hasta **350 UVT al mes**.
  - El art. 881-1 (Ley 2277 de 2022) busca que la exención se aplique por persona y no por cuenta marcada. Lo confirma el Concepto DIAN 362 de 2024.
  - Mientras el sistema de información de las entidades no esté operativo, sigue la marcación de una cuenta.
- **Depende del caso:** si el GMF se causa o no depende de cómo se muevan los recursos (cuentas exentas, operaciones entre cuentas del mismo titular).

## 6. Persona natural frente a persona jurídica

| Tema | Persona natural no obligada a contabilidad | Persona natural obligada | Persona jurídica |
| --- | --- | --- | --- |
| Componente inflacionario no gravado | Sí (55,43 % en 2025) | No | No |
| Tarifa de renta | Tabla progresiva del art. 241 (0 % a 39 %) | Tabla del art. 241 | 35 % (art. 240 E.T., Ley 2277 de 2022) |
| Ganancia ocasional | 15 % | 15 % | 15 % |
| Retención en la fuente | 4 % | 4 % | 4 % (las vigiladas por la Superfinanciera autorretienen) |
| Cuándo se gravan los rendimientos | Cuando se reciben (realización, art. 27 E.T.) | Según la contabilidad (causación) | Según la contabilidad (causación) |

- **Sobretasa:** las instituciones financieras con renta gravable de 120.000 UVT o más pagan 5 puntos adicionales entre 2023 y 2027 (art. 240, parágrafo 2).
- **Fuentes:**
  - Art. 240: [Ley 2277 de 2022](https://normograma.dian.gov.co/dian/compilacion/docs/ley_2277_2022.htm).
  - Componente inflacionario: [Decreto 898 de 2026](https://normograma.dian.gov.co/dian/compilacion/docs/decreto_0898_2026.htm).
  - Art. 27 (realización del ingreso): [Estatuto Tributario](https://normograma.dian.gov.co/dian/compilacion/docs/estatuto_tributario.htm).

## 7. Alternativas legales de planeación (cada una tiene requisitos y riesgos)

### 7.1 Fondos de inversión colectiva (FIC)

- **Norma:** los FIC no son contribuyentes de renta (arts. 23 y 23-1 E.T.).
- **Transparencia:** lo que distribuyen a los inversionistas conserva la naturaleza y la fuente del ingreso. La retención la practica la sociedad administradora (art. 368-1 E.T.; DUR 1625 de 2016, art. 1.2.4.2.80; [Oficio DIAN 31255 de 2016](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_31255_2016.htm)).
- **Para qué sirve:**
  - Diversificar con montos pequeños.
  - El componente inflacionario también aplica a las utilidades que distribuyen los fondos (Decreto 898 de 2026).
- **Riesgos:**
  - **No es un beneficio fiscal en sí mismo:** el rendimiento queda gravado igual que si se tuviera el título directamente.
  - El valor de la unidad fluctúa y no hay rentabilidad garantizada.
  - Hay comisión de administración.
  - Puede haber pacto de permanencia con penalidad.

### 7.2 Fondos de pensiones voluntarias (art. 126-1 E.T.)

- **Beneficio:** los aportes voluntarios son **renta exenta** y no hacen parte de la base de retención.
- **Límite del beneficio:**
  - Sumados con las cuentas AFC, hasta el **30 % del ingreso laboral o tributario del año** y máximo **3.800 UVT al año**.
  - Además, todo queda dentro del límite del art. 336 (40 % y 1.340 UVT, junto con las demás rentas exentas y deducciones).
- **Requisitos (permanencia):** 10 años de permanencia. La excepción es cumplir los requisitos de pensión de vejez o jubilación, o un caso de muerte o incapacidad. También se puede retirar para comprar vivienda, acreditándolo.
- **Riesgos y efectos:**
  - Retirar sin cumplir los requisitos pierde el beneficio.
  - Para aportes desde 2017, el retiro es **renta gravada** del año en que se saca, con retención del 7 %.
  - Los rendimientos de un retiro que cumple los requisitos se mantienen exentos.
- **Fuente:** texto vigente del art. 126-1, modificado por la Ley 1819 de 2016 (art. 15) ([Estatuto Tributario](https://normograma.dian.gov.co/dian/compilacion/docs/estatuto_tributario.htm)).
- **Depende del caso:** el beneficio real depende de los ingresos del año, de las demás rentas exentas y del cupo del art. 336.

### 7.3 Cuentas AFC y AVC (art. 126-4 E.T.)

- **Beneficio:** los depósitos son renta exenta.
- **Límite:** el mismo cupo conjunto con los aportes voluntarios a pensiones: 30 % del ingreso y 3.800 UVT al año, dentro del límite del art. 336.
- **Requisitos:** se usan para comprar vivienda (crédito hipotecario, leasing habitacional o sin financiación, presentando la escritura), o se retiran después de 10 años de permanencia.
- **Riesgos:**
  - Retirar para otro fin antes de 10 años pierde el beneficio.
  - Desde 2017, ese retiro es renta gravada con retención del 7 %, y los rendimientos sufren retención según las reglas generales.
- **Fuente:** texto vigente modificado por la Ley 1819 de 2016 (art. 16) ([Estatuto Tributario](https://normograma.dian.gov.co/dian/compilacion/docs/estatuto_tributario.htm)).

### 7.4 Momento de la venta: año gravable y tiempo de tenencia

- **Año gravable:** la persona natural no obligada a contabilidad declara los rendimientos cuando los recibe (art. 27 E.T.). Vender en diciembre o en enero cambia el año en que se declara la utilidad, y con ello la tarifa marginal (art. 241) y el porcentaje de componente inflacionario de ese año.
- **Tenencia de dos años o más:** solo si el título fue activo fijo, la utilidad en precio podría ser ganancia ocasional al 15 % (art. 300) en lugar de renta ordinaria. Para renta fija no está confirmado por la DIAN (ver la sección 4), así que no debe darse por hecho. Los intereses siempre son renta ordinaria.
- **Riesgos:**
  - Esperar para vender expone al riesgo de mercado: la tasa puede subir y el precio caer.
  - La clasificación como activo fijo debe sostenerse.
  - Las tarifas y los porcentajes cambian con las reformas.
- **Depende del caso:** siempre depende de los demás ingresos del año, de las pérdidas compensables y de la situación de cada contribuyente.

## 8. Lo que este resumen no cubre

Este resumen no cubre:
- Inversionistas no residentes, ni rentas de fuente extranjera o descuentos tributarios.
- El régimen simple, ni las entidades del régimen tributario especial.
- La declaración de activos en el exterior.
- El impuesto al patrimonio.
- Sanciones.

Para todos estos temas, y para cualquier decisión real, debe consultarse a un contador o abogado tributarista.
