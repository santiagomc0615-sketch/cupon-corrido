import type { Metadata } from "next";
import { VistaInicio } from "@/components/inicio/VistaInicio";
import { BRAND } from "@/lib/brand";
import "./inicio.css";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.nombre} · Renta fija colombiana` },
  description: "Valora, analiza y gestiona renta fija colombiana con datos en vivo: calculadora de bonos, portafolio, carry y fondeo, curva TES y asesor IA.",
};

export default function Inicio() {
  return <VistaInicio />;
}
