"use client";
/* Cinta de mercado: TPM, IPC, IBR, UVR, TRM, TES, tasa real, UST 10A, SOFR y spread TES−UST.
   Son datos del día (se renuevan dos veces al día), no cotizaciones en tiempo real. */
import { useApp } from "@/components/providers/AppProvider";
import { F, nf } from "@/lib/format";
import { spreadTesUst } from "@/lib/global";

export function CintaMercado() {
  const { snap, mk } = useApp();
  const ibr = mk.ibrLast.d;
  const items: [string, string, string][] = [
    ["TPM", F.pct(snap.macro.tpm, 2), ""],
    ["IPC 12M", F.pct(mk.ipcLast.annual, 2), mk.ipcLast.annual > mk.ipcPrev.annual ? "up" : "dn"],
    ["IBR ON", nf(3).format(ibr[1]) + "%", ""],
    ["IBR 3M", nf(3).format(ibr[3]) + "%", ""],
    ["IBR 12M", nf(3).format(ibr[5]) + "%", ""],
    ["UVR", nf(4).format(mk.uvrHoy.v), "up"],
    ...(snap.trm
      ? [["TRM", nf(2).format(snap.trm.valor), snap.trm.anterior == null ? "" : snap.trm.valor >= snap.trm.anterior ? "up" : "dn"] as [string, string, string]]
      : []),
    ...mk.tesSorted.map((r): [string, string, string] => ["TES " + r[1].slice(2, 4) + "/" + r[1].slice(5, 7), F.pct(r[3], 3), ""]),
    ["TASA REAL", F.pct(mk.realRate, 2), ""],
    ...(snap.ust10 ? [["UST 10A", F.pct(snap.ust10.valor, 2), ""] as [string, string, string]] : []),
    ...(snap.sofr ? [["SOFR", F.pct(snap.sofr.valor, 2), ""] as [string, string, string]] : []),
    ...(snap.ust10Curva
      ? [
          [
            "TES−UST 10A",
            nf(0).format(spreadTesUst({ nombre: mk.tes10[0], tir: mk.tes10[3], plazo: mk.tes10[4] }, snap.ust10Curva, snap.datos.curveDate).pb) + " pb",
            "",
          ] as [string, string, string],
        ]
      : []),
  ];
  const lista = (copia: boolean) => [
    <span key={(copia ? "b" : "a") + "-dia"} className="tape-dia" aria-hidden={copia || undefined}>
      Dato del día
    </span>,
    ...items.map(([k, v, c]) => (
      <span key={(copia ? "b" : "a") + k} aria-hidden={copia || undefined}>
        <b>{k}</b>
        <em className={c} style={{ fontStyle: "normal" }}>
          {v}
        </em>
      </span>
    )),
  ];
  return (
    // Región enfocable: con teclado se pausa (:focus-within) y, con movimiento reducido, se desplaza a mano.
    <div className="tape" role="region" aria-label="Cinta de mercado: datos del día, no en tiempo real" tabIndex={0}>
      <div className="tape-track">
        {lista(false)}
        {lista(true)}
      </div>
    </div>
  );
}
