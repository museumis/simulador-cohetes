import { VELOCIDADES, type CambioReproductor, type Reproductor } from '../reproduccion/reproductor';
import type { Evento } from '../simulacion/tipos';
import { formatearFijo } from '../util/formato';
import { NOMBRES_EVENTOS } from './magnitudes';

export interface LineaTiempo {
  /** Redibuja las marcas de los eventos y el tiempo total tras cargar un resultado. */
  cargar(eventos: readonly Evento[]): void;
  actualizar(cambio: CambioReproductor): void;
}

function boton(texto: string, titulo: string, alPulsar: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.title = titulo;
  b.addEventListener('click', alPulsar);
  return b;
}

/** Controles del reproductor: reproducir, paso a paso, velocidades y línea de tiempo arrastrable. */
export function crearLineaTiempo(contenedor: HTMLElement, reproductor: Reproductor): LineaTiempo {
  contenedor.replaceChildren();

  const botonReproducir = boton('▶', 'Reproducir / pausar [Espacio]', () => reproductor.alternar());
  const controles = document.createElement('div');
  controles.className = 'controles';
  controles.append(
    boton('|◂', 'Volver a T+0 [Inicio]', () => reproductor.reiniciar()),
    boton('◂', 'Muestra anterior [←]', () => reproductor.pasoMuestra(-1)),
    botonReproducir,
    boton('▸', 'Muestra siguiente [→]', () => reproductor.pasoMuestra(1)),
  );
  const botonesVelocidad = VELOCIDADES.map((v, i) => {
    const b = boton(`×${v}`, `Velocidad ×${v} [${i + 1}]`, () => reproductor.setVelocidad(v));
    controles.append(b);
    return b;
  });

  const pista = document.createElement('div');
  pista.className = 'pista';
  pista.title = 'Arrastrar para cambiar el instante';
  const marcas = document.createElement('div');
  marcas.className = 'pista-marcas';
  const progreso = document.createElement('div');
  progreso.className = 'pista-progreso';
  const cabezal = document.createElement('div');
  cabezal.className = 'pista-cabezal';
  pista.append(marcas, progreso, cabezal);

  const tiempo = document.createElement('div');
  tiempo.className = 'valor tiempo-total';

  contenedor.append(controles, pista, tiempo);

  const fraccion = (t: number): number => {
    const total = reproductor.tFinal - reproductor.tInicial;
    return total > 0 ? (t - reproductor.tInicial) / total : 0;
  };

  const tiempoDesdePuntero = (e: PointerEvent): number => {
    const caja = pista.getBoundingClientRect();
    const f = Math.min(Math.max((e.clientX - caja.left) / caja.width, 0), 1);
    return reproductor.tInicial + f * (reproductor.tFinal - reproductor.tInicial);
  };

  pista.addEventListener('pointerdown', (e) => {
    pista.setPointerCapture(e.pointerId);
    reproductor.irA(tiempoDesdePuntero(e));
  });
  pista.addEventListener('pointermove', (e) => {
    if (pista.hasPointerCapture(e.pointerId)) reproductor.irA(tiempoDesdePuntero(e));
  });

  return {
    cargar(eventos) {
      marcas.replaceChildren(
        ...eventos.map((e) => {
          const marca = document.createElement('div');
          marca.className = 'pista-marca';
          marca.style.left = `${fraccion(e.t) * 100}%`;
          marca.title = `T+ ${formatearFijo(e.t, 3)} s · ${NOMBRES_EVENTOS[e.tipo]}`;
          return marca;
        }),
      );
    },
    actualizar(cambio) {
      const porcentaje = `${fraccion(cambio.t) * 100}%`;
      cabezal.style.left = porcentaje;
      progreso.style.width = porcentaje;
      botonReproducir.textContent = cambio.reproduciendo ? '❚❚' : '▶';
      botonesVelocidad.forEach((b, i) => b.setAttribute('aria-pressed', String(VELOCIDADES[i] === cambio.velocidad)));
      tiempo.textContent = `T+ ${formatearFijo(cambio.t, 3)} / ${formatearFijo(reproductor.tFinal, 3)} s`;
    },
  };
}
