import type { Metadata } from "next";
import { VistaNoticias } from "@/components/noticias/VistaNoticias";
import { obtenerNoticias } from "@/lib/noticias/obtener";

export const metadata: Metadata = {
  title: "Noticias y fuentes",
  description: "Titulares de Bloomberg Línea (Colombia y mercados) y de fuentes oficiales, con fecha y enlace.",
};

export default async function Pagina() {
  const noticias = await obtenerNoticias();
  return <VistaNoticias noticias={noticias} />;
}
