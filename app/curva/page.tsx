import type { Metadata } from "next";
import { VistaCurva } from "@/components/curva/VistaCurva";

export const metadata: Metadata = {
  title: "Curva TES",
  description: "Curva cero cupón de TES tasa fija, forwards implícitos y referencias de mercado.",
};

export default function Pagina() {
  return <VistaCurva />;
}
