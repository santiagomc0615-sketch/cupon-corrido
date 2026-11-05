import type { Metadata } from "next";
import { VistaDatos } from "@/components/datos/VistaDatos";

export const metadata: Metadata = {
  title: "Cargar datos",
  description: "Carga de curvas FRAC, IPC, expectativas de inflación, IBR a 12 meses y referencias TES desde Excel o CSV.",
};

export default function Pagina() {
  return <VistaDatos />;
}
