import { buscarMetrica } from '../analisis/metricas';
import type { EstimacionError } from '../analisis/richardson';
import type { ResultadoSimulacion } from '../simulacion/tipos';
import { formatearFijo, formatearNumero } from '../util/formato';
import { NOMBRES_METODO } from './magnitudes';

/** Estado de la estimación del error por Richardson, que se calcula en segundo plano. */
export type EstadoRichardson =
  | { estado: 'calculando' }
  | { estado: 'hecho'; estimacion: EstimacionError | null }
  | { estado: 'error'; mensaje: string };

export interface PanelDiagnostico {
  cargar(resultado: ResultadoSimulacion): void;
  richardson(estado: EstadoRichardson): void;
}

function fila(tabla: HTMLTableSectionElement, celdas: readonly string[], titulo?: string): void {
  const tr = tabla.insertRow();
  if (titulo) tr.title = titulo;
  celdas.forEach((texto, i) => {
    const td = tr.insertCell();
    td.textContent = texto;
    td.className = i === 0 ? 'texto' : 'numero';
  });
}

function cabecera(tabla: HTMLTableElement, textos: readonly string[]): void {
  const tr = tabla.createTHead().insertRow();
  for (const t of textos) {
    const th = document.createElement('th');
    th.textContent = t;
    tr.append(th);
  }
}

const conUnidad = (valor: number, cifras: number, unidad: string): string =>
  Number.isFinite(valor) ? `${formatearNumero(valor, cifras)}${unidad ? ` ${unidad}` : ''}` : '—';

/**
 * Diagnóstico numérico: método, dt, pasos, tiempo de cálculo, deriva de energía y estimación
 * del error de cada métrica por extrapolación de Richardson (dt, dt/2 y dt/4). Escribe además
 * un resumen de una línea en el pie.
 */
export function crearDiagnostico(contenedor: HTMLElement, pie: HTMLElement): PanelDiagnostico {
  contenedor.replaceChildren();
  const tablaGeneral = document.createElement('table');
  tablaGeneral.className = 'tabla-datos';
  const tituloRichardson = document.createElement('div');
  tituloRichardson.className = 'panel-titulo';
  tituloRichardson.textContent = 'ERROR ESTIMADO (Richardson con dt, dt/2 y dt/4)';
  const estado = document.createElement('div');
  estado.className = 'nota';
  const tablaRichardson = document.createElement('table');
  tablaRichardson.className = 'tabla-datos';
  const nota = document.createElement('div');
  nota.className = 'nota';
  nota.textContent =
    'error = x(dt) − x exacto ≈ (x(dt) − x(dt/2))·2ᵖ/(2ᵖ − 1); orden obs. = log₂ de la razón de diferencias ' +
    'sucesivas («—» si el redondeo domina y el error no se puede resolver).';
  contenedor.append(tablaGeneral, tituloRichardson, estado, tablaRichardson, nota);

  let resultado: ResultadoSimulacion | null = null;
  let resumenRichardson = '';

  function pintarPie(): void {
    if (!resultado) return;
    const d = resultado.diagnostico;
    const partes = [
      `modelo ${d.modelo}`,
      `${NOMBRES_METODO[d.metodo]} dt = ${formatearNumero(d.dt, 4)} s`,
      `${formatearFijo(d.pasos, 0)} pasos`,
      `${formatearNumero(d.tiempoCalculoMs, 3)} ms`,
      `${formatearFijo(resultado.muestras.length, 0)} muestras`,
      `deriva E ${formatearNumero(d.derivaEnergia, 2)}`,
    ];
    if (resumenRichardson) partes.push(resumenRichardson);
    if (!resultado.despega) partes.unshift('NO DESPEGA: el empuje de la etapa 1 no supera el peso');
    pie.textContent = `DIAGNÓSTICO: ${partes.join(' · ')}`;
  }

  function pintarGeneral(r: ResultadoSimulacion): void {
    const d = r.diagnostico;
    tablaGeneral.replaceChildren();
    const cuerpo = tablaGeneral.createTBody();
    fila(cuerpo, ['modelo de vuelo', d.modelo]);
    fila(cuerpo, ['método', NOMBRES_METODO[d.metodo]]);
    fila(cuerpo, ['paso dt', `${formatearNumero(d.dt, 4)} s`]);
    fila(cuerpo, ['pasos', formatearFijo(d.pasos, 0)], 'incluye los pasos acortados en los fines de combustión y en los cambios del programa de inclinación');
    fila(cuerpo, ['tiempo de cálculo', `${formatearNumero(d.tiempoCalculoMs, 3)} ms`]);
    fila(cuerpo, ['muestras', formatearFijo(r.muestras.length, 0)], '20 Hz más una por evento');
    fila(
      cuerpo,
      ['deriva de energía', formatearNumero(d.derivaEnergia, 2)],
      'máx |ε(t) − ε(0)| relativo, con ε = v²/2 − μ/r − trabajo de empuje y arrastre; 0 en la solución exacta',
    );
  }

  function pintarRichardson(e: EstadoRichardson): void {
    tablaRichardson.replaceChildren();
    resumenRichardson = '';
    if (e.estado === 'calculando') {
      estado.textContent = 'calculando en segundo plano…';
      resumenRichardson = 'Richardson: calculando…';
      return;
    }
    if (e.estado === 'error') {
      estado.textContent = `no se ha podido estimar: ${e.mensaje}`;
      return;
    }
    const est = e.estimacion;
    if (!est) {
      estado.textContent = 'no disponible: dt/4 queda por debajo del paso mínimo admitido';
      return;
    }
    estado.textContent =
      `${NOMBRES_METODO[est.metodo]}, orden teórico p = ${est.orden} · ` +
      `${formatearNumero(est.tiempoCalculoMs, 3)} ms en segundo plano`;
    cabecera(tablaRichardson, ['métrica', 'x(dt)', 'error est.', 'extrapolado', 'orden obs.']);
    const cuerpo = tablaRichardson.createTBody();
    for (const f of est.filas) {
      const m = buscarMetrica(f.metrica);
      fila(cuerpo, [
        m.nombre,
        conUnidad(f.valores[0], m.cifras, m.unidad),
        conUnidad(f.error, 2, m.unidad),
        conUnidad(f.extrapolado, m.cifras + 2, m.unidad),
        Number.isFinite(f.ordenObservado) ? formatearNumero(f.ordenObservado, 3) : '—',
      ]);
    }
    const apogeo = est.filas.find((f) => f.metrica === 'apogeo');
    if (apogeo && Number.isFinite(apogeo.error)) {
      resumenRichardson = `Richardson Δh_ap ${formatearNumero(apogeo.error, 2)} m`;
    }
  }

  return {
    cargar(nuevo) {
      resultado = nuevo;
      pintarGeneral(nuevo);
      pintarPie();
    },
    richardson(e) {
      pintarRichardson(e);
      pintarPie();
    },
  };
}
