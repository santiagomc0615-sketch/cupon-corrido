import type { Metadata } from "next";
import Link from "next/link";
import { BorrarDatos } from "@/components/legal/BorrarDatos";
import { Encabezado } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Política de tratamiento de datos personales de ${BRAND.nombre} (Ley 1581 de 2012 y Decreto 1377 de 2013).`,
};

const R = BRAND.responsable;

export default function Privacidad() {
  return (
    <section className="view">
      <Encabezado eyebrow={`Última actualización: ${BRAND.fechaLegal}`}>
        Política de <em>privacidad</em>
      </Encabezado>
      <article className="legal">
        <p>
          Esta política explica qué datos trata {BRAND.nombre}, para qué y cómo puede ejercer sus derechos, conforme a la
          Ley Estatutaria 1581 de 2012 de protección de datos personales y el Decreto 1377 de 2013 (compilado en el
          Decreto 1074 de 2015). En resumen: la página no tiene cuentas de usuario, no usa cookies de seguimiento ni
          analítica, y casi todo lo que usted escribe se queda en su propio navegador.
        </p>

        <h2>1. Responsable del tratamiento</h2>
        <ul>
          <li>
            <b>Responsable:</b> {R.nombre}, {R.contexto} ({R.pais}).
          </li>
          <li>
            <b>Correo de contacto:</b> <a href={`mailto:${R.correo}`}>{R.correo}</a>
          </li>
          <li>
            <b>Sitio:</b> {BRAND.dominio}
          </li>
        </ul>

        <h2>2. Qué datos se tratan</h2>
        <h3>2.1 Datos que se quedan en su navegador</h3>
        <p>
          El portafolio, las entradas de la calculadora y sus preferencias (tema claro u oscuro, modo clase, escenario y
          horizonte de carry) se guardan en el almacenamiento local de su navegador (<i>localStorage</i>). Si usa la sección
          «Cargar datos», la clave de administrador se guarda solo mientras la pestaña está abierta (<i>sessionStorage</i>).
          Estos datos no se envían al servidor ni se comparten, salvo lo descrito en el punto 2.3. Puede borrarlos cuando
          quiera con el botón al final de esta página.
        </p>
        <h3>2.2 Dirección IP y registros técnicos</h3>
        <p>
          Al visitar el sitio, el proveedor de alojamiento (Vercel Inc.) registra datos técnicos como la dirección IP, el
          navegador y las páginas solicitadas, para operar y proteger el servicio. La página usa además la dirección IP para
          limitar el uso del asesor de IA (20 consultas por hora): se guarda un contador asociado a la IP durante una hora,
          en la memoria del servidor o en una base de datos Upstash Redis.
        </p>
        <h3>2.3 Consultas al asesor de IA</h3>
        <p>
          Cuando usted hace una pregunta al asesor, el servidor envía a Anthropic, PBC (proveedor del modelo Claude) la
          pregunta, las últimas preguntas y respuestas de esa conversación y un resumen de los datos de mercado y de su
          portafolio (títulos, tasas, duraciones y pesos; sin su nombre ni datos de identificación). La página no guarda las
          conversaciones. La respuesta a «Resumen de la economía» se guarda hasta 24 horas para reutilizarla, y no contiene
          datos personales. <b>Le pedimos no escribir datos personales en el chat.</b>
        </p>
        <h3>2.4 Lo que la página no hace</h3>
        <ul>
          <li>No crea cuentas ni pide nombre, documento, correo o teléfono.</li>
          <li>No usa cookies de publicidad ni herramientas de analítica.</li>
          <li>No vende ni cede datos a terceros.</li>
          <li>No trata datos sensibles ni datos de niños, niñas y adolescentes; el sitio no está dirigido a menores.</li>
        </ul>

        <h2>3. Finalidades</h2>
        <ul>
          <li>Prestar las funciones de la calculadora, el portafolio y el asesor de IA.</li>
          <li>Evitar el abuso del asesor (límite de consultas) y controlar sus costos.</li>
          <li>Mantener la seguridad y el funcionamiento técnico del sitio.</li>
        </ul>

        <h2>4. Encargados y transferencias internacionales</h2>
        <p>
          Para funcionar, el sitio usa proveedores que actúan como encargados y procesan datos fuera de Colombia,
          principalmente en Estados Unidos: Vercel Inc. (alojamiento y almacenamiento de archivos), Anthropic, PBC (modelo
          de IA del asesor) y, si está configurado, Upstash Inc. (contador de consultas y caché). Al usar el asesor de IA
          usted autoriza el envío de su consulta a Anthropic con la finalidad descrita en el punto 2.3. Cada proveedor
          aplica sus propias políticas de seguridad y retención.
        </p>

        <h2>5. Derechos del titular</h2>
        <p>Según el artículo 8 de la Ley 1581 de 2012, usted puede:</p>
        <ul>
          <li>Conocer, actualizar y rectificar sus datos personales.</li>
          <li>Solicitar prueba de la autorización otorgada, cuando esta se requiera.</li>
          <li>Ser informado sobre el uso que se ha dado a sus datos.</li>
          <li>Revocar la autorización y solicitar la supresión de sus datos cuando no se respeten los principios, derechos y garantías legales.</li>
          <li>Acceder gratuitamente a sus datos personales.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley, después de agotar el trámite de consulta o reclamo ante el responsable.</li>
        </ul>

        <h2>6. Cómo ejercer sus derechos</h2>
        <p>
          Escriba a <a href={`mailto:${R.correo}`}>{R.correo}</a> indicando su solicitud y, si se refiere al asesor o al
          límite de consultas, la fecha aproximada y la dirección IP desde la que usó el sitio (la página no tiene otro
          dato para identificarlo). Las <b>consultas</b> se responden en un máximo de diez (10) días hábiles, prorrogables
          por cinco (5) días hábiles más; los <b>reclamos</b> (corrección, actualización o supresión) en un máximo de
          quince (15) días hábiles, prorrogables por ocho (8) días hábiles más, según los artículos 14 y 15 de la Ley 1581.
          Los datos guardados en su navegador los controla usted directamente con el botón de abajo.
        </p>

        <h2>7. Seguridad</h2>
        <p>
          La conexión al sitio es cifrada (HTTPS). Las claves de servicio (como la de la API de Anthropic) solo existen en el
          servidor y nunca se envían al navegador. Las funciones de carga de datos requieren una clave de administrador.
        </p>

        <h2>8. Vigencia y cambios</h2>
        <p>
          Esta política rige desde el {BRAND.fechaLegal}. Si cambia, se publicará aquí con su nueva fecha. Vea también los{" "}
          <Link href="/terminos">términos de uso</Link>.
        </p>

        <h2>Sus datos en este navegador</h2>
        <BorrarDatos />
      </article>
    </section>
  );
}
