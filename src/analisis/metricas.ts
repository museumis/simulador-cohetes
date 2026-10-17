import type { Muestra, ResultadoSimulacion, TipoEvento } from '../simulacion/tipos';

/** Un número que resume un vuelo, para estimar su error, compararlo o barrerlo. */
export interface Metrica {
  id: string;
  nombre: string;
  unidad: string;      // SI
  cifras: number;      // cifras significativas al mostrarla
  /** true si se conoce al llegar al apogeo: vale para simulaciones con detenerEnApogeo. */
  hastaApogeo: boolean;
  /** Valor SI; NaN si el vuelo no llega al evento del que depende. */
  valor(r: ResultadoSimulacion): number;
}

function estadoEvento(r: ResultadoSimulacion, tipo: TipoEvento): Muestra | undefined {
  return r.eventos.find((e) => e.tipo === tipo)?.estado;
}

function enEvento(tipo: TipoEvento, valor: (m: Muestra) => number): (r: ResultadoSimulacion) => number {
  return (r) => {
    const m = estadoEvento(r, tipo);
    return m ? valor(m) : Number.NaN;
  };
}

/** Estado en el apogeo o, si no lo hay, al final del vuelo simulado. */
function estadoApogeo(r: ResultadoSimulacion): Muestra {
  return estadoEvento(r, 'apogeo') ?? r.muestras[r.muestras.length - 1]!;
}

export const METRICAS: readonly Metrica[] = [
  { id: 'apogeo', nombre: 'apogeo', unidad: 'm', cifras: 8, hastaApogeo: true, valor: (r) => r.resumen.apogeo },
  { id: 'tApogeo', nombre: 't del apogeo', unidad: 's', cifras: 8, hastaApogeo: true, valor: enEvento('apogeo', (m) => m.t) },
  {
    id: 'velocidadFinal',
    nombre: 'v al fin de comb. 2',
    unidad: 'm/s',
    cifras: 8,
    hastaApogeo: true,
    valor: enEvento('finCombustion2', (m) => m.velocidad),
  },
  {
    id: 'altitudFinal',
    nombre: 'h al fin de comb. 2',
    unidad: 'm',
    cifras: 8,
    hastaApogeo: true,
    valor: enEvento('finCombustion2', (m) => m.altitud),
  },
  { id: 'maxQ', nombre: 'Max-Q', unidad: 'Pa', cifras: 6, hastaApogeo: true, valor: (r) => r.resumen.maxQ },
  { id: 'tMaxQ', nombre: 't de Max-Q', unidad: 's', cifras: 7, hastaApogeo: true, valor: enEvento('maxQ', (m) => m.t) },
  { id: 'tMach1', nombre: 't de Mach 1', unidad: 's', cifras: 7, hastaApogeo: true, valor: enEvento('mach1', (m) => m.t) },
  {
    id: 'perdidaGravedad',
    nombre: 'pérdida gravedad (apogeo)',
    unidad: 'm/s',
    cifras: 7,
    hastaApogeo: true,
    valor: (r) => estadoApogeo(r).perdidas.gravedad,
  },
  {
    id: 'perdidaArrastre',
    nombre: 'pérdida arrastre (apogeo)',
    unidad: 'm/s',
    cifras: 7,
    hastaApogeo: true,
    valor: (r) => estadoApogeo(r).perdidas.arrastre,
  },
  {
    id: 'perdidaContrapresion',
    nombre: 'pérdida contrapresión (apogeo)',
    unidad: 'm/s',
    cifras: 7,
    hastaApogeo: true,
    valor: (r) => estadoApogeo(r).perdidas.contrapresion,
  },
  { id: 'deltaVIdeal', nombre: 'Δv ideal', unidad: 'm/s', cifras: 8, hastaApogeo: true, valor: (r) => r.resumen.deltaVIdeal },
  { id: 'tImpacto', nombre: 't del impacto', unidad: 's', cifras: 8, hastaApogeo: false, valor: enEvento('impacto', (m) => m.t) },
  {
    id: 'velocidadImpacto',
    nombre: 'v en el impacto',
    unidad: 'm/s',
    cifras: 7,
    hastaApogeo: false,
    valor: enEvento('impacto', (m) => m.velocidad),
  },
];

/** Métricas que se pueden obtener deteniendo la simulación en el apogeo. */
export const METRICAS_HASTA_APOGEO: readonly Metrica[] = METRICAS.filter((m) => m.hastaApogeo);

export function buscarMetrica(id: string): Metrica {
  const m = METRICAS.find((x) => x.id === id);
  if (!m) throw new RangeError(`Métrica desconocida: ${id}`);
  return m;
}
