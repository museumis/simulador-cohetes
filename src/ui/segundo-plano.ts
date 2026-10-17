import type { Peticion, Respuesta } from '../trabajador';

/** La petición se ha sustituido por otra o se ha cancelado antes de terminar. */
export class TareaCancelada extends Error {
  constructor() {
    super('Tarea cancelada');
    this.name = 'TareaCancelada';
  }
}

export interface TareaSegundoPlano {
  /**
   * Envía una petición al worker. Si había otra en curso, se cancela (su promesa se rechaza
   * con TareaCancelada): solo interesa el resultado de la última.
   */
  ejecutar(peticion: Peticion, alProgreso?: (hechos: number, total: number) => void): Promise<Respuesta>;
  cancelar(): void;
}

/** Cada petición se atiende en un worker nuevo, que se termina al responder o al cancelarla. */
export function crearTarea(): TareaSegundoPlano {
  let worker: Worker | null = null;
  let rechazarActual: ((e: Error) => void) | null = null;

  function cancelar(): void {
    worker?.terminate();
    worker = null;
    rechazarActual?.(new TareaCancelada());
    rechazarActual = null;
  }

  return {
    ejecutar(peticion, alProgreso) {
      cancelar();
      const w = new Worker(new URL('../trabajador.ts', import.meta.url), { type: 'module' });
      worker = w;
      return new Promise<Respuesta>((resolver, rechazar) => {
        rechazarActual = rechazar;
        w.addEventListener('message', (e: MessageEvent<Respuesta>) => {
          const r = e.data;
          if (r.tipo === 'progreso') {
            alProgreso?.(r.hechos, r.total);
            return;
          }
          rechazarActual = null;
          w.terminate();
          if (worker === w) worker = null;
          if (r.tipo === 'error') rechazar(new Error(r.mensaje));
          else resolver(r);
        });
        w.addEventListener('error', (e) => {
          rechazarActual = null;
          w.terminate();
          if (worker === w) worker = null;
          rechazar(new Error(e.message || 'Error en el worker'));
        });
        w.postMessage(peticion);
      });
    },
    cancelar,
  };
}
