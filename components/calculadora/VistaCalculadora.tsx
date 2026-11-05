"use client";
import { useDeferredValue, useMemo } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { DEFAULTS, LAYOUT, OPTS, toEngine, type Campo, type EntradasUI } from "@/lib/calculadora";
import { esError, type TipoBono } from "@/lib/engine";
import { useHidratado } from "@/lib/storage";
import { Resultados } from "./Resultados";

const TIPOS: [TipoBono, string][] = [
  ["TF", "Tasa fija"],
  ["IBR", "IBR"],
  ["IPC", "IPC"],
  ["UVR", "UVR"],
];

export function VistaCalculadora() {
  const { calc, setCalc, setEditingId } = useApp();
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
          <ResultadosDiferidos inputs={calc.inputs[calc.type] ?? DEFAULTS[calc.type]} />
        </div>
      ) : (
        <div className="panel empty">Cargando calculadora…</div>
      )}
    </section>
  );
}

function ResultadosDiferidos({ inputs }: { inputs: EntradasUI }) {
  const { motor } = useApp();
  // Mientras se escribe, React prioriza el formulario y recalcula con el valor diferido.
  const diferidas = useDeferredValue(inputs);
  const { b, o } = useMemo(() => {
    const b = toEngine(diferidas);
    return { b, o: motor.price(b) };
  }, [diferidas, motor]);
  return <Resultados b={b} o={o} />;
}

function Formulario() {
  const { calc, setCalc, motor, setPf, editingId, setEditingId, toast } = useApp();
  const tipo = calc.type;
  const inputs = calc.inputs[tipo] ?? DEFAULTS[tipo];
  const L = LAYOUT[tipo];

  const fijar = (k: string, v: string | number) =>
    setCalc((c) => ({ ...c, inputs: { ...c.inputs, [tipo]: { ...(c.inputs[tipo] ?? DEFAULTS[tipo]), [k]: v } } }));

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
    setCalc((c) => ({ ...c, inputs: { ...c.inputs, [tipo]: DEFAULTS[tipo] } }));
  };

  const campo = (f: Campo) => <CampoForm key={f[0]} f={f} valor={inputs[f[0]]} onChange={fijar} />;

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
