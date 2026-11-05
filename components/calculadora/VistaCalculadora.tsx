"use client";
import { useDeferredValue, useMemo } from "react";
import { useApp, useCurvaNecesaria } from "@/components/providers/AppProvider";
import { LAYOUT, OPTS, toEngine, type Campo, type EntradasUI } from "@/lib/calculadora";
import { esError, toN, type TipoBono } from "@/lib/engine";
import { F } from "@/lib/format";
import { useHidratado } from "@/lib/storage";
import { Resultados } from "./Resultados";

const TIPOS: [TipoBono, string][] = [
  ["TF", "Tasa fija"],
  ["IBR", "IBR"],
  ["IPC", "IPC"],
  ["UVR", "UVR"],
];

export function VistaCalculadora() {
  const { calc, setCalc, setEditingId, defaults } = useApp();
  const hidratado = useHidratado();
  const cambiarTipo = (t: TipoBono) => {
    setEditingId(null);
    setCalc((c) => ({ ...c, type: t }));
  };
  return (
    <section className="view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span className="eyebrow">Valoración de títulos</span>
          <h1>
            Calculadora de <em>bonos</em>
          </h1>
        </div>
        <div className="seg" role="group" aria-label="Tipo de título">
          {TIPOS.map(([t, nombre]) => (
            <button key={t} type="button" aria-pressed={hidratado && calc.type === t} onClick={() => cambiarTipo(t)}>
              {nombre}
            </button>
          ))}
        </div>
      </div>
      {hidratado ? (
        <div className="calc">
          <Formulario />
          <ResultadosDiferidos inputs={calc.inputs[calc.type] ?? defaults[calc.type]} />
        </div>
      ) : (
        <div className="panel empty">Cargando calculadora…</div>
      )}
    </section>
  );
}

function ResultadosDiferidos({ inputs }: { inputs: EntradasUI }) {
  const { motor, curvas, pedirCurva, snap } = useApp();
  // Mientras se escribe, React prioriza el formulario y recalcula con el valor diferido.
  const diferidas = useDeferredValue(inputs);
  const { b, o } = useMemo(() => {
    const b = toEngine(diferidas);
    return { b, o: motor.price(b) };
  }, [diferidas, motor]);

  // Curva FRAC de compra: se descarga si todavía no está en el navegador
  const curva =
    b.tipo === "IBR" && b.metodologia === "Curva FRAC" && b.valoracion ? motor.elegirCurvaFrac(toN(b.valoracion), b.curvaFrac) : null;
  const falta = curva && !curva.serie ? curva.id : null;
  useCurvaNecesaria(falta);
  if (curva && falta) {
    return (
      <div className="panel empty">
        {curvas[falta] === "error" ? (
          <>
            No se pudo descargar la curva FRAC «{curva.nombre}».{" "}
            <button type="button" className="btn sm" onClick={() => pedirCurva(falta)}>
              Reintentar
            </button>
          </>
        ) : (
          <>Descargando la curva FRAC «{curva.nombre}» ({curva.filas.toLocaleString("es-CO")} filas)…</>
        )}
      </div>
    );
  }

  const avisos: string[] = [];
  const hasta12 = snap.fuentes.ibr12?.hasta;
  if (b.tipo === "IBR" && b.frecuencia === "Anual" && b.metodologia === "IBR vigente" && hasta12 && b.valoracion > hasta12)
    avisos.push(
      `Este título usa el IBR a 12 meses, que el BanRep no publica en su servicio SDMX: el último dato disponible es del ${F.date(hasta12)}. Cárguelo en «Cargar datos» para actualizarlo.`,
    );
  return <Resultados b={b} o={o} avisosExtra={avisos} />;
}

function Formulario() {
  const { calc, setCalc, motor, setPf, editingId, setEditingId, toast, defaults } = useApp();
  const tipo = calc.type;
  const inputs = calc.inputs[tipo] ?? defaults[tipo];
  const L = LAYOUT[tipo];

  const fijar = (k: string, v: string | number) =>
    setCalc((c) => ({ ...c, inputs: { ...c.inputs, [tipo]: { ...(c.inputs[tipo] ?? defaults[tipo]), [k]: v } } }));

  const agregar = () => {
    const inp: EntradasUI = JSON.parse(JSON.stringify(inputs));
    const o = motor.price(toEngine(inp));
    if (esError(o)) {
      toast(o.error);
      return;
    }
    if (editingId) {
      setPf((pf) => pf.map((p) => (p.id === editingId ? { ...p, inputs: inp, ejemplo: false } : p)));
      setEditingId(null);
      toast("Posición actualizada");
    } else {
      setPf((pf) => [...pf, { id: "p" + Date.now(), inputs: inp }]);
      toast("Agregado al portafolio: " + inp.nombre);
    }
  };

  const restaurar = () => {
    setEditingId(null);
    setCalc((c) => ({ ...c, inputs: { ...c.inputs, [tipo]: defaults[tipo] } }));
  };

  const campo = (f: Campo) => <CampoForm key={f[0]} f={f} valor={inputs[f[0]]} onChange={fijar} />;
  const conFrac = tipo === "IBR" && inputs.metodologia === "Curva FRAC";
  const curvaAuto = conFrac && inputs.valoracion ? motor.elegirCurvaFrac(toN(String(inputs.valoracion))) : null;

  return (
    <form className="sheet" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>1 · Datos faciales</legend>
        {LAYOUT.common1.map(campo)}
        {L.faciales.map(campo)}
      </fieldset>
      <div className="perf" />
      <fieldset>
        <legend>2 · Negociación</legend>
        {campo(["valoracion", "Fecha de negociación / valoración", "date", "w"])}
        {L.neg.map(campo)}
        {conFrac && (
          <div className="f w">
            <label htmlFor="in_curvaFrac">Curva FRAC (compra)</label>
            <select id="in_curvaFrac" value={String(inputs.curvaFrac ?? "")} onChange={(e) => fijar("curvaFrac", e.target.value)}>
              <option value="">Automática: {curvaAuto ? `${curvaAuto.nombre} (${F.date(curvaAuto.fechaBase)})` : "según la fecha"}</option>
              {motor.mercado.curvasFrac.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {F.date(c.fechaBase)}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>
      <div className="sheet-foot">
        <button type="button" className="btn primary" onClick={agregar}>
          {editingId ? "Guardar cambios" : "+ Agregar al portafolio"}
        </button>
        <button type="button" className="btn ghost" onClick={restaurar}>
          Restaurar ejemplo
        </button>
      </div>
    </form>
  );
}

function CampoForm({
  f: [k, etiqueta, tipo, ancho, unidad],
  valor,
  onChange,
}: {
  f: Campo;
  valor: string | number | undefined;
  onChange: (k: string, v: string | number) => void;
}) {
  const id = "in_" + k;
  const v = valor ?? "";
  if (tipo === "sel") {
    return (
      <div className={"f " + (ancho || "")}>
        <label htmlFor={id}>{etiqueta}</label>
        <select id={id} value={String(v)} onChange={(e) => onChange(k, e.target.value)}>
          {OPTS[k].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  }
  const esNumero = tipo === "pct" || tipo === "num";
  const sufijo = (unidad ?? "") + (tipo === "pct" ? " %" : "");
  return (
    <div className={"f " + (ancho || "")}>
      <label htmlFor={id}>{etiqueta}</label>
      <div className="u">
        <input
          id={id}
          type={tipo === "date" ? "date" : tipo === "text" ? "text" : "number"}
          step={tipo === "pct" ? "0.001" : tipo === "num" ? "any" : undefined}
          inputMode={tipo === "text" ? "text" : tipo === "date" ? undefined : "decimal"}
          value={v}
          onChange={(e) => onChange(k, esNumero ? (e.target.value === "" ? "" : +e.target.value) : e.target.value)}
          style={sufijo.trim() ? { paddingRight: 12 + sufijo.length * 7.5 } : undefined}
        />
        {sufijo.trim() && <span>{sufijo.trim()}</span>}
      </div>
    </div>
  );
}
