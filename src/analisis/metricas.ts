import type { ModeloVuelo, Muestra, ResultadoSimulacion, TipoEvento } from '../simulacion/tipos';

/** Un número que resume un vuelo, para estimar su error, compararlo o barrerlo. */
export interface Metrica {
  id: string;
  nombre: string;
  unidad: string;      // SI
  cifras: number;      // cifras significativas al mostrarla
  /** true si se conoce al llegar al apogeo: vale para simulaciones con detenerEnApogeo. */
  hastaApogeo: boolean;
  /** true si solo tiene sentido en el modelo 2D (elementos orbitales, alcance); en 1D vale NaN. */
  solo2D?: boolean;
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

/** Solo en 2D: en 1D la trayectoria es radial y sus elementos orbitales no informan de nada. */
function en2D(valor: (r: ResultadoSimulacion) => number): (r: ResultadoSimulacion) => number {
  return (r) => (r.diagnostico.modelo === '2D' ? valor(r) : Number.NaN);
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
  {
    id: 'perdidaDireccion',
    nombre: 'pérdida dirección (apogeo)',
    unidad: 'm/s',
    cifras: 7,
    hastaApogeo: true,
    solo2D: true,
    valor: en2D((r) => estadoApogeo(r).perdidas.direccion),
  },
  {
    id: 'perigeoFinal',
    nombre: 'perigeo al fin de comb. 2',
    unidad: 'm',
    cifras: 8,
    hastaApogeo: true,
    solo2D: true,
    valor: en2D(enEvento('finCombustion2', (m) => m.orbita.altitudPerigeo)),
  },
  {
    id: 'apogeoOrbitalFinal',
    nombre: 'apogeo orbital al fin de comb. 2',
    unidad: 'm',
    cifras: 8,
    hastaApogeo: true,
    solo2D: true,
    valor: en2D(enEvento('finCombustion2', (m) => m.orbita.altitudApogeo)),
  },
  {
    id: 'excentricidadFinal',
    nombre: 'excentricidad al fin de comb. 2',
    unidad: '',
    cifras: 7,
    hastaApogeo: true,
    solo2D: true,
    valor: en2D(enEvento('finCombustion2', (m) => m.orbita.excentricidad)),
  },
  {
    id: 'gammaFinal',
    nombre: 'γ al fin de comb. 2',
    unidad: 'rad',
    cifras: 7,
    hastaApogeo: true,
    solo2D: true,
    valor: en2D(enEvento('finCombustion2', (m) => m.anguloTrayectoria)),
  },
  {
    id: 'tOrbita',
    nombre: 't de órbita alcanzada',
    unidad: 's',
    cifras: 8,
    hastaApogeo: true,
    solo2D: true,
    valor: en2D(enEvento('orbita', (m) => m.t)),
  },
  { id: 'deltaVIdeal', nombre: 'Δv ideal', unidad: 'm/s', cifras: 8, hastaApogeo: true, valor: (r) => r.resumen.deltaVIdeal },
  { id: 'tImpacto', nombre: 't del impacto', unidad: 's', cifras: 8, hastaApogeo: false, valor: enEvento('impacto', (m) => m.t) },
  {
    id: 'alcanceImpacto',
    nombre: 'alcance en el impacto',
    unidad: 'm',
    cifras: 8,
    hastaApogeo: false,
    solo2D: true,
    valor: en2D(enEvento('impacto', (m) => m.alcance)),
  },
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

/** Métricas que tienen sentido en un modelo de vuelo. */
export function metricasDelModelo(modelo: ModeloVuelo, lista: readonly Metrica[] = METRICAS): Metrica[] {
  return lista.filter((m) => modelo === '2D' || !m.solo2D);
}

export function buscarMetrica(id: string): Metrica {
  const m = METRICAS.find((x) => x.id === id);
  if (!m) throw new RangeError(`Métrica desconocida: ${id}`);
  return m;
}
