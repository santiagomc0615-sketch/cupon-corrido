"use client";
import { Chart, nearest } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { F, nf, pctAx } from "@/lib/format";

export function CurvaMini() {
  const { mk } = useApp();
  const { zs, mk: pts } = mk.curva;
  return (
    <Chart
      series={[
        { data: zs, cls: "s-a" },
        { data: pts, cls: "s-a", pointsOnly: true, points: "pt-b" },
      ]}
      yf={pctAx(1)}
      xf={(v) => v + "a"}
      label="Curva TES"
      tip={(x) => {
        const p = nearest(pts, x);
        return {
          x: p[0],
          y: p[1],
          content: (
            <>
              {p[2]}
              <br />
              {nf(2).format(p[0])} años · {F.pct(p[1], 3)}
            </>
          ),
        };
      }}
    />
  );
}
