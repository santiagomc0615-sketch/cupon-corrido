import type { Metadata } from "next";
import { VistaNoticias } from "@/components/noticias/VistaNoticias";

export const metadata: Metadata = {
  title: "Noticias y fuentes",
  description: "Fuentes oficiales y noticias de mercado de renta fija en Colombia.",
};

export default function Pagina() {
  return <VistaNoticias />;
}
