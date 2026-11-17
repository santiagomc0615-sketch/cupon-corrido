"use client";
/* Botón «Descargar reporte PDF» con el nombre del cliente (opcional). La librería de PDF, los documentos
   y las fuentes se cargan solo al pulsar (no pesan en la página). Las cifras se arman con
   lib/reporte/datos.ts, que solo lee lib/engine y lib/carry. */
import { useState, type ReactElement } from "react";
import { useFondeo, useMercadoFondeo } from "@/components/fondeo/ControlesFondeo";
import { useApp } from "@/components/providers/AppProvider";
import { useImpuestos } from "@/components/pyg/Impuestos";
import { edate, toN, toS } from "@/lib/engine";
import { NOMBRE_CONTRIBUYENTE } from "@/lib/impuestos/perfil";
import { costoFondeo, entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { estadoPyG } from "@/lib/pyg/estado";
import { entradasPortafolio } from "@/lib/pyg/portafolio";
import type { Bono, ResultadoValoracion } from "@/lib/engine";
import { seccionesInforme } from "@/lib/asesor/informe";
import { armarReportePortafolio, armarReporteTitulo, fuentesReporte } from "@/lib/reporte/datos";
import { useGuardado } from "@/lib/storage";

/** ¿El usuario configuró el fondeo alguna vez? (si no, el reporte no trae el bloque de carry). */
export function fondeoConfigurado(): boolean {
  try {
    return localStorage.getItem("cc_fondeo-v2") != null;
  } catch {
    return false;
  }
}

const nombreArchivo = (base: string, fecha: string) =>
  `Reporte ${base} ${fecha}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "-") + ".pdf";

async function generarYDescargar(crear: () => Promise<ReactElement>, archivo: string) {
  const [{ pdf }, { registrarFuentes }] = await Promise.all([import("@react-pdf/renderer"), import("./piezas")]);
  registrarFuentes(window.location.origin);
  const doc = await crear();
  const blob = await pdf(doc as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const ahora = () => new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

function Formulario({ alGenerar, id, etiqueta = "Descargar reporte PDF" }: { alGenerar: (cliente: string) => Promise<void>; id: string; etiqueta?: string }) {
  const [cliente, setCliente] = useGuardado<string>("reporteCliente", "");
  const [estado, setEstado] = useState<"listo" | "generando" | "error">("listo");
  const generar = async () => {
    setEstado("generando");
    try {
      await alGenerar(cliente);
      setEstado("listo");
    } catch (e) {
      console.error("[reporte]", e);
      setEstado("error");
    }
  };
  return (
    <div className="reporte-pdf">
      <div className="f">
        <label htmlFor={id}>Cliente (opcional)</label>
        <input id={id} type="text" maxLength={80} placeholder="Nombre para el reporte" value={cliente} onChange={(e) => setCliente(e.target.value)} />
      </div>
      <button type="button" className="btn primary" onClick={() => void generar()} disabled={estado === "generando"}>
        {estado === "generando" ? "Generando PDF…" : etiqueta}
      </button>
      {estado === "error" && (
        <span className="src" role="alert">
          No se pudo generar el PDF. Intente de nuevo.
        </span>
      )}
    </div>
  );
}

export function BotonReporteTitulo({ b, o, titulo }: { b: Bono; o: ResultadoValoracion; titulo: string }) {
  const { snap, motor, datosMotor } = useApp();
  const { params, perfil } = useImpuestos();
  const { c } = useFondeo();
  const mercado = useMercadoFondeo();
  const [tasaPropia] = useGuardado<number | null>("tasaCDT", null);
  return (
    <Formulario
      id="reporte-cliente-titulo"
      alGenerar={async (cliente) => {
        const r = armarReporteTitulo({
          b,
          o,
          titulo,
          cliente,
          fondeo: fondeoConfigurado() ? c : null,
          mercado,
          tasaCDT: tasaPropia ?? snap.dtf?.valor ?? null,
          fuentes: snap.fuentes,
        });
        // P&G al vencimiento con el perfil tributario del usuario
        const e = entradasDesdeMotor(
          motor,
          b,
          o,
          { alVencimiento: true, costoFondeo: fondeoConfigurado() ? costoFondeo(o.giro, c, mercado, toN(b.vencimiento) - toN(b.valoracion)) : 0 },
          { ipc: datosMotor.ipc, exp: datosMotor.exp },
        );
        const pyg = "error" in e ? null : { resultado: estadoPyG(e, perfil, params), supuesto: `Se mantiene hasta el vencimiento (${b.vencimiento})`, perfil: NOMBRE_CONTRIBUYENTE[perfil.tipo] };
        await generarYDescargar(async () => {
          const { DocTitulo } = await import("./DocTitulo");
          return <DocTitulo r={r} generado={ahora()} pyg={pyg} />;
        }, nombreArchivo(titulo, b.valoracion));
      }}
    />
  );
}

export function BotonReportePortafolio() {
  const { snap, pfValorado, pfDate, motor, datosMotor } = useApp();
  const { params, perfil } = useImpuestos();
  if (!pfValorado.length) return null;
  return (
    <Formulario
      id="reporte-cliente-pf"
      alGenerar={async (cliente) => {
        const r = armarReportePortafolio({
          posiciones: pfValorado.map((x) => ({ b: x.b, o: x.o, titulo: String(x.p.inputs.nombre) })),
          valoracion: pfDate,
          cliente,
          fuentes: snap.fuentes,
        });
        if (!r) return;
        // P&G vendiendo todo en un año a las mismas tasas (los que vencen antes, al vencimiento)
        const venta = toS(edate(toN(pfDate), 12));
        const e = entradasPortafolio(motor, pfValorado.map((x) => ({ b: x.b, o: x.o })), venta, { ipc: datosMotor.ipc, exp: datosMotor.exp });
        const pyg = "error" in e ? null : { resultado: estadoPyG(e, perfil, params), supuesto: `Venta de todo el portafolio el ${venta} a las mismas tasas de compra`, perfil: NOMBRE_CONTRIBUYENTE[perfil.tipo] };
        await generarYDescargar(async () => {
          const { DocPortafolio } = await import("./DocPortafolio");
          return <DocPortafolio r={r} generado={ahora()} pyg={pyg} />;
        }, nombreArchivo("portafolio", pfDate));
      }}
    />
  );
}

/** PDF del «Informe para el cliente» que redactó el asesor de IA. */
export function BotonInformeAsesor({ texto, perfil }: { texto: string; perfil: string }) {
  const { snap } = useApp();
  return (
    <Formulario
      id="reporte-cliente-informe"
      etiqueta="Descargar informe PDF"
      alGenerar={async (cliente) => {
        const r = {
          secciones: seccionesInforme(texto),
          perfil,
          valoracion: snap.fechaAnalisis,
          cliente,
          fuentes: fuentesReporte(snap.fuentes, ["tpm", "ibr", "ipc", "uvr", "tes", "trm", "sofr", "dtf"]),
        };
        await generarYDescargar(async () => {
          const { DocInforme } = await import("./DocInforme");
          return <DocInforme r={r} generado={ahora()} />;
        }, nombreArchivo("informe cliente", snap.fechaAnalisis));
      }}
    />
  );
}
