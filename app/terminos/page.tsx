import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: `Términos de uso de ${BRAND.nombre}: herramienta académica, sin asesoría financiera, con respuestas generadas por IA.`,
};

const R = BRAND.responsable;

export default function Terminos() {
  return (
    <section className="view">
      <Encabezado eyebrow={`Última actualización: ${BRAND.fechaLegal}`}>
        Términos de <em>uso</em>
      </Encabezado>
      <article className="legal">
        <p>
          Al usar {BRAND.nombre} usted acepta estos términos. Si no está de acuerdo, por favor no use el sitio.
        </p>

        <h2>1. Herramienta académica, no asesoría financiera</h2>
        <p>
          {BRAND.nombre} es un {R.contexto}. Sus cálculos, gráficos, escenarios y textos tienen fines educativos.{" "}
          <b>No constituyen asesoría financiera, de inversión, tributaria ni legal, ni una recomendación de compra o venta de
          valores.</b> El sitio no es una entidad vigilada por la Superintendencia Financiera de Colombia ni un proveedor de
          precios de valoración. Antes de tomar decisiones de inversión, consulte a un profesional autorizado y las
          fuentes oficiales.
        </p>

        <h2>2. Respuestas generadas por inteligencia artificial</h2>
        <p>
          Las respuestas del asesor son generadas automáticamente por un modelo de IA (Claude, de Anthropic) a partir de los
          datos cargados en el sitio. Pueden contener errores, omisiones o interpretaciones incorrectas, y no reemplazan el
          juicio de un analista. Verifique siempre las cifras. El uso del asesor está limitado a 20 consultas por hora por
          dirección IP y puede suspenderse sin aviso.
        </p>

        <h2>3. Datos de mercado</h2>
        <p>
          Las series provienen del Banco de la República (servicio SDMX), datos.gov.co, el DANE y archivos cargados por el
          administrador del sitio; los titulares de noticias, de los canales RSS de Bloomberg Línea y Google Noticias, y
          pertenecen a sus autores (cada titular enlaza a su fuente). Los datos pueden tener retrasos, errores o
          interrupciones. Cada cifra muestra su fuente y fecha; revise el estado de cada serie en{" "}
          <Link href="/noticias">Noticias y fuentes</Link>.
        </p>

        <h2>4. Cálculos</h2>
        <p>
          La calculadora replica las fórmulas del modelo de Excel del curso (convenciones de días, truncamiento del precio
          sucio, proyecciones de IPC, IBR y UVR). Son modelos simplificados con fines didácticos y pueden diferir de las
          metodologías de un proveedor de precios o de una entidad financiera.
        </p>

        <h2>5. Uso aceptable</h2>
        <ul>
          <li>No intente evadir el límite de consultas, saturar el servicio ni acceder a funciones de administración sin autorización.</li>
          <li>No use el asesor para obtener contenido ajeno a fines académicos o contrario a la ley.</li>
          <li>No escriba datos personales propios o de terceros en el chat.</li>
        </ul>

        <h2>6. Responsabilidad</h2>
        <p>
          El sitio se ofrece «tal como está», sin garantías de exactitud, disponibilidad o idoneidad para un propósito
          particular. En la medida permitida por la ley, el responsable no responde por pérdidas o daños derivados del uso de
          la información, los cálculos o las respuestas del asesor.
        </p>

        <h2>7. Propiedad intelectual</h2>
        <p>
          Las marcas, nombres y contenidos de terceros (Banco de la República, DANE, Bloomberg Línea, Anthropic y otros)
          pertenecen a sus titulares y se citan solo como fuente.
        </p>

        <h2>8. Datos personales</h2>
        <p>
          El tratamiento de datos se describe en la <Link href="/privacidad">política de privacidad</Link>, conforme a la Ley
          1581 de 2012 y el Decreto 1377 de 2013.
        </p>

        <h2>9. Cambios, ley aplicable y contacto</h2>
        <p>
          Estos términos pueden cambiar; la versión vigente es la publicada aquí. Se rigen por las leyes de la República de
          Colombia. Contacto: <a href={`mailto:${R.correo}`}>{R.correo}</a>.
        </p>
      </article>
    </section>
  );
}
