import { compararEventos, compararMetricas, diferenciasEntrada } from '../analisis/comparacion';
import type { Entrada } from '../simulacion/campos';
import type { ResultadoSimulacion } from '../simulacion/tipos';
import { formatearFijo, formatearNumero } from '../util/formato';
import { NOMBRES_EVENTOS, NOMBRES_METODO } from './magnitudes';

/** Una simulación con la entrada que la produjo. */
export interface Simulacion {
  entrada: Entrada;
  resultado: ResultadoSimulacion;
}

export interface PanelComparacion {
  /** Redibuja las tablas con la simulación actual y la de referencia (o sin referencia). */
  actualizar(actual: Simulacion, referencia: Simulacion | null): void;
}

function tabla(cabecera: readonly string[]): { tabla: HTMLTableElement; cuerpo: HTMLTableSectionElement } {
  const t = document.createElement('table');
  t.className = 'tabla-datos';
  const tr = t.createTHead().insertRow();
  for (const texto of cabecera) {
    const th = document.createElement('th');
    th.textContent = texto;
    tr.append(th);
  }
  return { tabla: t, cuerpo: t.createTBody() };
}

function fila(cuerpo: HTMLTableSectionElement, celdas: readonly string[]): void {
  const tr = cuerpo.insertRow();
  celdas.forEach((texto, i) => {
    const td = tr.insertCell();
    td.textContent = texto;
    td.className = i === 0 ? 'texto' : 'numero';
  });
}

const valor = (v: number | string, cifras: number): string => (typeof v === 'string' ? v : formatearNumero(v, cifras));

/** Diferencia con signo explícito: +12.3, −4.5e-3. */
function conSigno(v: number, cifras: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  return `${v > 0 ? '+' : ''}${formatearNumero(v, cifras)}`;
}

/**
 * Comparación entre la simulación actual y una de referencia fijada: datos de entrada que
 * cambian, diferencias de cada métrica y de los instantes de los eventos. Las gráficas
 * superponen la referencia con línea discontinua.
 */
export function crearComparacion(
  contenedor: HTMLElement,
  acciones: { fijar(): void; quitar(): void },
): PanelComparacion {
  contenedor.replaceChildren();
  const controles = document.createElement('div');
  controles.className = 'controles-analisis';
  const botonFijar = document.createElement('button');
  botonFijar.type = 'button';
  botonFijar.textContent = 'fijar la actual como referencia';
  botonFijar.addEventListener('click', acciones.fijar);
  const botonQuitar = document.createElement('button');
  botonQuitar.type = 'button';
  botonQuitar.textContent = 'quitar la referencia';
  botonQuitar.addEventListener('click', acciones.quitar);
  controles.append(botonFijar, botonQuitar);
  const descripcion = document.createElement('div');
  descripcion.className = 'nota';
  const tablas = document.createElement('div');
  contenedor.append(controles, descripcion, tablas);

  function titulo(texto: string): HTMLElement {
    const d = document.createElement('div');
    d.className = 'panel-titulo';
    d.textContent = texto;
    return d;
  }

  return {
    actualizar(actual, referencia) {
      botonQuitar.disabled = referencia === null;
      tablas.replaceChildren();
      if (!referencia) {
        descripcion.textContent =
          'Sin referencia. Al fijarla, las gráficas la superponen con línea discontinua y aquí aparecen las diferencias (actual − referencia).';
        return;
      }
      const o = referencia.entrada.opciones;
      descripcion.textContent =
        `referencia: ${referencia.entrada.cohete.nombre} · ${NOMBRES_METODO[o.metodo]} dt = ${formatearNumero(o.dt, 4)} s · ` +
        'diferencias = actual − referencia';

      const entrada = diferenciasEntrada(actual.entrada, referencia.entrada);
      tablas.append(titulo('ENTRADA'));
      if (entrada.length === 0) {
        const n = document.createElement('div');
        n.className = 'nota';
        n.textContent = 'misma entrada';
        tablas.append(n);
      } else {
        const t = tabla(['dato', 'actual', 'referencia', 'unidad']);
        for (const d of entrada) fila(t.cuerpo, [d.nombre, valor(d.actual, 8), valor(d.referencia, 8), d.unidad || '—']);
        tablas.append(t.tabla);
      }

      const metricas = tabla(['métrica', 'actual', 'referencia', 'Δ', 'Δ rel.', 'unidad']);
      for (const d of compararMetricas(actual.resultado, referencia.resultado)) {
        const c = d.metrica.cifras;
        fila(metricas.cuerpo, [
          d.metrica.nombre,
          formatearNumero(d.actual, c),
          formatearNumero(d.referencia, c),
          conSigno(d.diferencia, 4),
          conSigno(d.relativa, 3),
          d.metrica.unidad || '—',
        ]);
      }
      tablas.append(titulo('RESULTADOS'), metricas.tabla);

      const eventos = tabla(['evento', 'T+ actual [s]', 'T+ ref. [s]', 'Δt [s]']);
      for (const d of compararEventos(actual.resultado, referencia.resultado)) {
        fila(eventos.cuerpo, [NOMBRES_EVENTOS[d.tipo], formatearFijo(d.actual, 3), formatearFijo(d.referencia, 3), conSigno(d.diferencia, 4)]);
      }
      tablas.append(titulo('EVENTOS'), eventos.tabla);
    },
  };
}
