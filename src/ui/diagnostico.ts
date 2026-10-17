import { buscarMetrica } from '../analisis/metricas';
import type { EstimacionError } from '../analisis/richardson';
import { esAdaptativo } from '../simulacion/integrador';
import type { ResultadoSimulacion } from '../simulacion/tipos';
import { formatearFijo, formatearNumero } from '../util/formato';
import { NOMBRES_ATMOSFERA, NOMBRES_METODO } from './magnitudes';

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

/** Método con su paso o su tolerancia, p. ej. «RK4 dt = 1.000e-2 s» o «Dormand–Prince 5(4) tol = 1.0e-9». */
export function textoMetodo(d: ResultadoSimulacion['diagnostico']): string {
  return esAdaptativo(d.metodo)
    ? `${NOMBRES_METODO[d.metodo]} tol = ${formatearNumero(d.tolerancia, 2)}`
    : `${NOMBRES_METODO[d.metodo]} dt = ${formatearNumero(d.dt, 4)} s`;
}

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
  tituloRichardson.textContent = 'ERROR ESTIMADO (Richardson)';
  const estado = document.createElement('div');
  estado.className = 'nota';
  const tablaRichardson = document.createElement('table');
  tablaRichardson.className = 'tabla-datos';
  const nota = document.createElement('div');
  nota.className = 'nota';

  contenedor.append(tablaGeneral, tituloRichardson, estado, tablaRichardson, nota);

  let resultado: ResultadoSimulacion | null = null;
  let resumenRichardson = '';

  function pintarPie(): void {
    if (!resultado) return;
    const d = resultado.diagnostico;
    const partes = [
      `modelo ${d.modelo}`,
      textoMetodo(d),
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
    fila(cuerpo, ['atmósfera', NOMBRES_ATMOSFERA[d.atmosfera]]);
    fila(cuerpo, ['rotación terrestre', d.rotacion ? 'sí' : 'no'], 'solo interviene en el modelo 2D');
    fila(cuerpo, ['método', NOMBRES_METODO[d.metodo]]);
    const adaptativo = esAdaptativo(d.metodo);
    if (adaptativo) {
      fila(cuerpo, ['tolerancia', formatearNumero(d.tolerancia, 2)], 'error local admitido en cada paso, relativo a 1 + |y| en cada componente');
      fila(cuerpo, ['paso inicial dt', `${formatearNumero(d.dt, 4)} s`]);
    } else {
      fila(cuerpo, ['paso dt', `${formatearNumero(d.dt, 4)} s`]);
    }
    fila(
      cuerpo,
      ['pasos', formatearFijo(d.pasos, 0)],
      'aceptados; incluye los pasos acortados en las discontinuidades (despegue, fines de combustión, regulación, programa de inclinación, nodos de Cd(Mach) y capas de la atmósfera)',
    );
    if (adaptativo) fila(cuerpo, ['pasos rechazados', formatearFijo(d.pasosRechazados, 0)], 'error estimado mayor que la tolerancia: se repiten con un paso menor');
    fila(cuerpo, ['tiempo de cálculo', `${formatearNumero(d.tiempoCalculoMs, 3)} ms`]);
    fila(cuerpo, ['muestras', formatearFijo(r.muestras.length, 0)], '20 Hz (1 Hz en el vuelo orbital) más una por evento');
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
      estado.textContent = 'no disponible: dt/4 o tol/100 queda por debajo del mínimo admitido';
      nota.textContent = '';
      return;
    }
    const h = est.adaptativo ? 'tol' : 'dt';
    const r = est.razon;
    estado.textContent = est.adaptativo
      ? `${NOMBRES_METODO[est.metodo]} con tol, tol/10 y tol/100: error ∝ tolᵖ con p = ${est.orden} · ` +
        `${formatearNumero(est.tiempoCalculoMs, 3)} ms en segundo plano`
      : `${NOMBRES_METODO[est.metodo]} con dt, dt/2 y dt/4, orden teórico p = ${est.orden} · ` +
        `${formatearNumero(est.tiempoCalculoMs, 3)} ms en segundo plano`;
    nota.textContent =
      `error = x(${h}) − x exacto ≈ (x(${h}) − x(${h}/${r}))·${r}ᵖ/(${r}ᵖ − 1); orden obs. = log${r === 2 ? '₂' : '₁₀'} de la razón ` +
      'de diferencias sucesivas («—» si el redondeo domina y el error no se puede resolver).';
    cabecera(tablaRichardson, ['métrica', `x(${h})`, 'error est.', 'extrapolado', 'orden obs.']);
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
