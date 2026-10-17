import { CAMPOS_ENTRADA, type Entrada } from '../simulacion/campos';
import type { ResultadoSimulacion, TipoEvento } from '../simulacion/tipos';
import { METRICAS, metricasDelModelo, type Metrica } from './metricas';

/** Diferencia de una métrica entre la simulación actual y la de referencia. */
export interface DiferenciaMetrica {
  metrica: Metrica;
  actual: number;
  referencia: number;
  diferencia: number; // actual − referencia
  relativa: number;   // diferencia / |referencia|; NaN si la referencia es 0
}

export interface DiferenciaEvento {
  tipo: TipoEvento;
  actual: number;     // s; NaN si no ocurre en la actual
  referencia: number; // s; NaN si no ocurre en la referencia
  diferencia: number; // s
}

/** Un dato de entrada que no coincide entre las dos simulaciones. */
export interface DiferenciaEntrada {
  nombre: string;
  unidad: string;
  actual: number | string;
  referencia: number | string;
}

function relativa(diferencia: number, referencia: number): number {
  return referencia !== 0 ? diferencia / Math.abs(referencia) : Number.NaN;
}

/** Diferencias de las métricas; las de 2D solo si alguna de las dos simulaciones es 2D. */
export function compararMetricas(actual: ResultadoSimulacion, referencia: ResultadoSimulacion): DiferenciaMetrica[] {
  const algun2D = actual.diagnostico.modelo === '2D' || referencia.diagnostico.modelo === '2D';
  return (algun2D ? METRICAS : metricasDelModelo('1D')).map((metrica) => {
    const a = metrica.valor(actual);
    const r = metrica.valor(referencia);
    return { metrica, actual: a, referencia: r, diferencia: a - r, relativa: relativa(a - r, r) };
  });
}

/**
 * Instantes de los eventos de las dos simulaciones, emparejados por tipo y en el orden en que
 * ocurren en la actual; los que solo están en la referencia van al final.
 */
export function compararEventos(actual: ResultadoSimulacion, referencia: ResultadoSimulacion): DiferenciaEvento[] {
  const tipos: TipoEvento[] = [];
  for (const e of [...actual.eventos, ...referencia.eventos]) if (!tipos.includes(e.tipo)) tipos.push(e.tipo);
  const instante = (r: ResultadoSimulacion, tipo: TipoEvento): number => r.eventos.find((e) => e.tipo === tipo)?.t ?? Number.NaN;
  return tipos.map((tipo) => {
    const a = instante(actual, tipo);
    const r = instante(referencia, tipo);
    return { tipo, actual: a, referencia: r, diferencia: a - r };
  });
}

/** Datos de entrada que cambian entre las dos simulaciones, incluidos el modelo de vuelo y el método de integración. */
export function diferenciasEntrada(actual: Entrada, referencia: Entrada): DiferenciaEntrada[] {
  const lista: DiferenciaEntrada[] = [];
  if (actual.cohete.nombre !== referencia.cohete.nombre) {
    lista.push({ nombre: 'nombre', unidad: '', actual: actual.cohete.nombre, referencia: referencia.cohete.nombre });
  }
  if (actual.opciones.modelo !== referencia.opciones.modelo) {
    lista.push({ nombre: 'modelo', unidad: '', actual: actual.opciones.modelo, referencia: referencia.opciones.modelo });
  }
  if (actual.opciones.metodo !== referencia.opciones.metodo) {
    lista.push({ nombre: 'método', unidad: '', actual: actual.opciones.metodo, referencia: referencia.opciones.metodo });
  }
  for (const c of CAMPOS_ENTRADA) {
    const a = c.leer(actual);
    const r = c.leer(referencia);
    if (a !== r) lista.push({ nombre: c.nombre, unidad: c.unidad, actual: a, referencia: r });
  }
  return lista;
}
