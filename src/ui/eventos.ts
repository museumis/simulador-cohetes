import type { Evento } from '../simulacion/tipos';
import { formatearFijo } from '../util/formato';
import { buscarMagnitud, NOMBRES_EVENTOS, textoMagnitud, unidadDe, type SistemaUnidades } from './magnitudes';

/** Margen para considerar que un evento ya ha ocurrido en el instante actual (s). */
const EPSILON_T = 1e-9;

/** Magnitudes que se muestran en cada fila; el estado completo aparece en la telemetría al saltar. */
const COLUMNAS = ['altitud', 'velocidad', 'masa', 'q'].map(buscarMagnitud);

export interface ListaEventos {
  cargar(eventos: readonly Evento[]): void;
  setSistema(sistema: SistemaUnidades): void;
  /** Marca los eventos ya ocurridos y el último. */
  actualizar(t: number): void;
}

/** Lista de eventos con su instante exacto y el estado en ese instante; un clic salta al evento. */
export function crearListaEventos(contenedor: HTMLElement, alElegir: (t: number) => void): ListaEventos {
  contenedor.replaceChildren();
  const titulo = document.createElement('div');
  titulo.className = 'panel-titulo';
  titulo.textContent = 'EVENTOS';
  const tabla = document.createElement('table');
  tabla.className = 'tabla-eventos';
  const cabecera = tabla.createTHead().insertRow();
  const cuerpo = tabla.createTBody();
  contenedor.append(titulo, tabla);

  let eventos: readonly Evento[] = [];
  let sistema: SistemaUnidades = 'si';
  let filas: HTMLTableRowElement[] = [];
  let tActual = 0;

  function pintar(): void {
    cabecera.replaceChildren();
    for (const texto of ['T+ [s]', 'evento', ...COLUMNAS.map((m) => {
      const unidad = unidadDe(m, sistema).unidad;
      return unidad ? `${m.simbolo} [${unidad}]` : m.simbolo;
    })]) {
      const th = document.createElement('th');
      th.textContent = texto;
      cabecera.append(th);
    }
    filas = eventos.map((e) => {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.title = 'Ir a este instante';
      const celdas = [formatearFijo(e.t, 3), NOMBRES_EVENTOS[e.tipo], ...COLUMNAS.map((m) => textoMagnitud(m, e.estado, sistema))];
      celdas.forEach((texto, i) => {
        const td = tr.insertCell();
        td.textContent = texto;
        td.className = i === 1 ? 'texto' : 'numero';
      });
      const elegir = (): void => alElegir(e.t);
      tr.addEventListener('click', elegir);
      tr.addEventListener('keydown', (k) => {
        if (k.key === 'Enter') elegir();
      });
      return tr;
    });
    cuerpo.replaceChildren(...filas);
    actualizar(tActual);
  }

  function actualizar(t: number): void {
    tActual = t;
    let ultimo = -1;
    eventos.forEach((e, i) => {
      const ocurrido = e.t <= t + EPSILON_T;
      filas[i]?.classList.toggle('futuro', !ocurrido);
      if (ocurrido) ultimo = i;
    });
    filas.forEach((f, i) => f.classList.toggle('actual', i === ultimo));
  }

  return {
    cargar(nuevos) {
      eventos = nuevos;
      pintar();
    },
    setSistema(nuevo) {
      sistema = nuevo;
      pintar();
    },
    actualizar,
  };
}
