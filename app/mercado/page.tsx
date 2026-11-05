import type { Metadata } from "next";
import { VistaMercado } from "@/components/mercado/VistaMercado";

export const metadata: Metadata = {
  title: "Mercado",
  description: "Tasa de política, inflación, IBR, UVR y curva TES de Colombia.",
};

export default function Pagina() {
  return <VistaMercado />;
}
