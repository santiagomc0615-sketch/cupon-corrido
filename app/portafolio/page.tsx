import type { Metadata } from "next";
import { VistaPortafolio } from "@/components/portafolio/VistaPortafolio";

export const metadata: Metadata = {
  title: "Portafolio",
  description: "Posiciones de renta fija con métricas de riesgo, estrés y escalera de flujos.",
};

export default function Pagina() {
  return <VistaPortafolio />;
}
