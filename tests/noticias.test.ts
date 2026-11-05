/* Lector de RSS de /noticias. */
import { describe, expect, it } from "vitest";
import { leerRSS, seleccionar, textoPlano } from "@/lib/noticias/rss";

const BLOOMBERG = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[BanRep mantiene la tasa en 12,25 %]]></title><link>https://www.bloomberglinea.com/latinoamerica/colombia/banrep-tasa/</link><pubDate>Thu, 05 Nov 2026 22:13:58 +0000</pubDate></item>
<item><title>S&amp;P 500 sube &#8220;fuerte&#8221;</title><link>https://www.bloomberglinea.com/mercados/sp500/</link><pubDate>Wed, 04 Nov 2026 10:00:00 +0000</pubDate></item>
<item><title>Sin fecha</title><link>https://x.co/a</link></item>
<item><title>Enlace peligroso</title><link>javascript:alert(1)</link><pubDate>Wed, 04 Nov 2026 10:00:00 +0000</pubDate></item>
</channel></rss>`;

const GOOGLE = `<rss><channel>
<item><title>La Junta Directiva mantuvo la tasa - Banco de la República</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Thu, 05 Nov 2026 22:35:27 GMT</pubDate><source url="https://www.banrep.gov.co">Banco de la República</source></item>
<item><title>Página vieja - Banco de la República</title><link>https://news.google.com/rss/articles/old</link><pubDate>Wed, 18 Oct 2023 21:30:43 GMT</pubDate><source url="https://www.banrep.gov.co">Banco de la República</source></item>
</channel></rss>`;

describe("Lector de RSS", () => {
  it("lee título, enlace y fecha; decodifica CDATA y entidades", () => {
    const t = leerRSS(BLOOMBERG, "Bloomberg Línea");
    expect(t.map((x) => x.titulo)).toEqual(["BanRep mantiene la tasa en 12,25 %", "S&P 500 sube “fuerte”"]);
    expect(t[0].fecha).toBe("2026-11-05T22:13:58.000Z");
    expect(t[0].fuente).toBe("Bloomberg Línea");
  });

  it("descarta ítems sin fecha y enlaces que no son http(s)", () => {
    const t = leerRSS(BLOOMBERG, "x");
    expect(t.some((x) => x.titulo === "Sin fecha" || x.titulo === "Enlace peligroso")).toBe(false);
  });

  it("toma la fuente de <source> y quita el sufijo « - Medio» de Google Noticias", () => {
    const t = leerRSS(GOOGLE, "Oficial");
    expect(t[0]).toMatchObject({ titulo: "La Junta Directiva mantuvo la tasa", fuente: "Banco de la República" });
  });

  it("limpia separadores en el nombre de la fuente y al final del título", () => {
    const xml = `<item><title>Informe de Política Monetaria - | Banco de la República</title><link>https://news.google.com/a</link><pubDate>Thu, 05 Nov 2026 00:06:44 GMT</pubDate><source url="https://www.banrep.gov.co">| Banco de la República</source></item>`;
    expect(leerRSS(xml, "x")[0]).toMatchObject({ titulo: "Informe de Política Monetaria", fuente: "Banco de la República" });
  });

  it("selecciona los recientes, ordenados y sin repetidos", () => {
    const t = leerRSS(GOOGLE + GOOGLE, "Oficial");
    const s = seleccionar(t, { max: 10, dias: 30, ahora: Date.UTC(2026, 10, 6) });
    expect(s.map((x) => x.titulo)).toEqual(["La Junta Directiva mantuvo la tasa"]);
  });

  it("quita etiquetas HTML del texto", () => {
    expect(textoPlano("<b>Hola</b> &lt;mundo&gt;")).toBe("Hola <mundo>");
  });
});
