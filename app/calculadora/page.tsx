import type { Metadata } from "next";
import { VistaCalculadora } from "@/components/calculadora/VistaCalculadora";

export const metadata: Metadata = {
  title: "Calculadora de bonos",
  description: "Valoración de títulos tasa fija, IBR, IPC y UVR: precio sucio y limpio, cupón corrido, duración, DV01 y convexidad.",
};

export default function Pagina() {
  return <VistaCalculadora />;
}
