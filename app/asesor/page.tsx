import type { Metadata } from "next";
import { VistaAsesor } from "@/components/asesor/VistaAsesor";

export const metadata: Metadata = {
  title: "Asesor IA",
  description: "Análisis con inteligencia artificial del mercado y del portafolio.",
};

export default function Pagina() {
  return <VistaAsesor />;
}
