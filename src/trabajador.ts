// Web Worker para los cálculos de análisis que repiten la simulación: la estimación del error
// por Richardson (dt/2 y dt/4) y los barridos. Así la interfaz no se bloquea mientras tanto.
import { barrer, type PuntoBarrido } from './analisis/barrido';
import { estimarError, type EstimacionError } from './analisis/richardson';
import { buscarCampo, type Entrada } from './simulacion/campos';

export type Peticion =
  | { tipo: 'richardson'; entrada: Entrada }
  | { tipo: 'barrido'; entrada: Entrada; ruta: string; valores: number[] };

export type Respuesta =
  | { tipo: 'richardson'; estimacion: EstimacionError | null }
  | { tipo: 'progreso'; hechos: number; total: number }
  | { tipo: 'barrido'; puntos: PuntoBarrido[] }
  | { tipo: 'error'; mensaje: string };

const responder = (r: Respuesta): void => self.postMessage(r);

self.addEventListener('message', (e: MessageEvent<Peticion>) => {
  const p = e.data;
  try {
    if (p.tipo === 'richardson') {
      responder({ tipo: 'richardson', estimacion: estimarError(p.entrada) });
    } else {
      const total = p.valores.length;
      const puntos = barrer(p.entrada, buscarCampo(p.ruta), p.valores, (hechos) => responder({ tipo: 'progreso', hechos, total }));
      responder({ tipo: 'barrido', puntos });
    }
  } catch (error) {
    responder({ tipo: 'error', mensaje: error instanceof Error ? error.message : String(error) });
  }
});
