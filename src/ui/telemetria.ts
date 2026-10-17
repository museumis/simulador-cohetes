import type { ModeloVuelo, Muestra } from '../simulacion/tipos';
import { formatearFijo, formatearNumero, partirPorPunto } from '../util/formato';
import { aceleracionEnG, magnitudesDelModelo, textoMagnitud, unidadDe, type Magnitud, type SistemaUnidades } from './magnitudes';

interface Fila {
  magnitud: Magnitud;
  entera: HTMLElement;
  fraccion: HTMLElement;
  unidad: HTMLElement;
  extra: HTMLElement;
}

export interface Telemetria {
  actualizar(muestra: Muestra): void;
  setSistema(sistema: SistemaUnidades): void;
  /** Muestra las magnitudes del modelo de vuelo (en 2D, también posición, ángulos y órbita). */
  setModelo(modelo: ModeloVuelo): void;
}

function celda(fila: HTMLTableRowElement, clase: string, texto = ''): HTMLTableCellElement {
  const c = fila.insertCell();
  c.className = clase;
  c.textContent = texto;
  return c;
}

/** Panel de telemetría: todas las magnitudes del instante actual, alineadas por el punto decimal. */
export function crearTelemetria(contenedor: HTMLElement): Telemetria {
  contenedor.replaceChildren();
  const cabecera = document.createElement('div');
  cabecera.className = 'panel-titulo';
  const titulo = document.createElement('span');
  titulo.textContent = 'TELEMETRÍA';
  const tiempo = document.createElement('span');
  tiempo.className = 'valor';
  cabecera.append(titulo, tiempo);

  const tabla = document.createElement('table');
  tabla.className = 'tabla-valores';
  let filas: Fila[] = [];
  let etapa: HTMLElement;
  let motor: HTMLElement;
  let modelo: ModeloVuelo | null = null;

  function construir(nuevo: ModeloVuelo): void {
    modelo = nuevo;
    tabla.replaceChildren();
    filas = magnitudesDelModelo(nuevo).map((magnitud) => {
      const tr = tabla.insertRow();
      tr.title = magnitud.nombre;
      celda(tr, 'simbolo', magnitud.simbolo);
      return {
        magnitud,
        entera: celda(tr, 'entera'),
        fraccion: celda(tr, 'fraccion'),
        unidad: celda(tr, 'unidad'),
        extra: celda(tr, 'extra'),
      };
    });
    const filaEtapa = tabla.insertRow();
    filaEtapa.title = 'etapa inferior acoplada y estado de su motor';
    celda(filaEtapa, 'simbolo', 'etapa');
    etapa = celda(filaEtapa, 'entera');
    celda(filaEtapa, 'fraccion');
    motor = celda(filaEtapa, 'unidad');
    celda(filaEtapa, 'extra');
    pintarUnidades();
  }

  contenedor.append(cabecera, tabla);

  let sistema: SistemaUnidades = 'si';
  let ultima: Muestra | null = null;

  function pintarUnidades(): void {
    for (const f of filas) f.unidad.textContent = unidadDe(f.magnitud, sistema).unidad;
  }
  construir('1D');

  const actualizar = (muestra: Muestra): void => {
    ultima = muestra;
    tiempo.textContent = `T+ ${formatearFijo(muestra.t, 3)} s`;
    for (const f of filas) {
      const [entera, fraccion] = partirPorPunto(textoMagnitud(f.magnitud, muestra, sistema));
      f.entera.textContent = entera;
      f.fraccion.textContent = fraccion;
    }
    const a = filas.find((f) => f.magnitud.id === 'aceleracion');
    if (a) a.extra.textContent = `${formatearNumero(aceleracionEnG(muestra.aceleracion), 3)} g0`;
    etapa.textContent = String(muestra.etapa);
    motor.textContent = muestra.motorEncendido ? 'motor encendido' : 'motor apagado';
  };

  return {
    actualizar,
    setSistema(nuevo) {
      sistema = nuevo;
      pintarUnidades();
      if (ultima) actualizar(ultima);
    },
    setModelo(nuevo) {
      if (nuevo === modelo) return;
      construir(nuevo);
      if (ultima) actualizar(ultima);
    },
  };
}
