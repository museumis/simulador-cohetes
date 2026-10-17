import uPlot from 'uplot';
import { PUNTOS_MAXIMOS, valoresBarrido, type PuntoBarrido } from '../analisis/barrido';
import { buscarMetrica, METRICAS_HASTA_APOGEO } from '../analisis/metricas';
import { buscarCampo, CAMPOS_ENTRADA, type CampoEntrada, type Entrada } from '../simulacion/campos';
import { formatearNumero } from '../util/formato';
import { leerColores } from './colores';
import { TareaCancelada, type TareaSegundoPlano } from './segundo-plano';

/** Alto de la gráfica del barrido (px). */
const ALTO_GRAFICA = 200;
const PUNTOS_POR_DEFECTO = 11;

export interface PanelBarrido {
  refrescarTema(): void;
}

interface ResultadoBarrido {
  campo: CampoEntrada;
  valorActual: number; // valor del campo en la entrada barrida
  puntos: PuntoBarrido[];
  tiempoMs: number;
}

function etiqueta(nombre: string, unidad: string): string {
  return unidad ? `${nombre} [${unidad}]` : nombre;
}

function leerNumero(texto: string): number {
  const limpio = texto.trim().replace(',', '.').replace(/[\s ]/g, '');
  return limpio === '' ? Number.NaN : Number(limpio);
}

/**
 * Barrido de un parámetro: simula la entrada actual con el parámetro variando en un rango
 * (en segundo plano) y dibuja una métrica del vuelo frente a ese parámetro.
 */
export function crearBarrido(
  contenedor: HTMLElement,
  obtenerEntrada: () => Entrada,
  tarea: TareaSegundoPlano,
  descargarCSV: (nombre: string, texto: string) => void,
): PanelBarrido {
  contenedor.replaceChildren();
  const formulario = document.createElement('div');
  formulario.className = 'controles-analisis';

  const selectorCampo = document.createElement('select');
  selectorCampo.title = 'Parámetro que se barre';
  selectorCampo.append(...CAMPOS_ENTRADA.map((c) => new Option(etiqueta(c.nombre, c.unidad), c.ruta)));
  selectorCampo.value = 'masaCargaUtil';
  const desde = document.createElement('input');
  const hasta = document.createElement('input');
  const puntos = document.createElement('input');
  for (const [e, titulo] of [
    [desde, 'desde (SI)'],
    [hasta, 'hasta (SI)'],
    [puntos, `número de puntos, de 2 a ${PUNTOS_MAXIMOS}`],
  ] as const) {
    e.type = 'text';
    e.inputMode = 'decimal';
    e.spellcheck = false;
    e.title = titulo;
    e.setAttribute('aria-label', titulo);
    e.className = 'campo-corto';
  }
  puntos.value = String(PUNTOS_POR_DEFECTO);
  const botonCalcular = document.createElement('button');
  botonCalcular.type = 'button';
  botonCalcular.textContent = 'calcular';
  const botonCancelar = document.createElement('button');
  botonCancelar.type = 'button';
  botonCancelar.textContent = 'cancelar';
  botonCancelar.disabled = true;
  formulario.append(selectorCampo, ' de ', desde, ' a ', hasta, ' en ', puntos, ' puntos ', botonCalcular, botonCancelar);

  const filaMetrica = document.createElement('div');
  filaMetrica.className = 'controles-analisis';
  const selectorMetrica = document.createElement('select');
  selectorMetrica.title = 'Métrica representada';
  selectorMetrica.append(...METRICAS_HASTA_APOGEO.map((m) => new Option(etiqueta(m.nombre, m.unidad), m.id)));
  const botonCSV = document.createElement('button');
  botonCSV.type = 'button';
  botonCSV.textContent = 'CSV del barrido';
  botonCSV.disabled = true;
  filaMetrica.append('eje vertical ', selectorMetrica, botonCSV);

  const estado = document.createElement('div');
  estado.className = 'nota';
  const lienzo = document.createElement('div');
  lienzo.className = 'barrido-lienzo';
  contenedor.append(formulario, filaMetrica, estado, lienzo);

  let resultado: ResultadoBarrido | null = null;
  let grafica: uPlot | null = null;

  function proponerIntervalo(): void {
    const valor = buscarCampo(selectorCampo.value).leer(obtenerEntrada());
    const [a, b] = valor > 0 ? [valor * 0.5, valor * 1.5] : [0, 1];
    desde.value = String(Number(a.toPrecision(6)));
    hasta.value = String(Number(b.toPrecision(6)));
  }

  function dibujar(): void {
    grafica?.destroy();
    grafica = null;
    if (!resultado || lienzo.clientWidth === 0) return;
    const r = resultado;
    const metrica = buscarMetrica(selectorMetrica.value);
    const xs = r.puntos.map((p) => p.valor);
    const ys = r.puntos.map((p) => {
      const v = p.metricas?.[metrica.id];
      return v !== undefined && Number.isFinite(v) ? v : null;
    });
    const colores = leerColores();
    const eje = {
      stroke: colores.texto,
      font: colores.fuente,
      labelFont: colores.fuente,
      labelSize: 14,
      grid: { stroke: colores.rejilla, width: 1 },
      ticks: { stroke: colores.rejilla, width: 1 },
    };
    const rotulos = (_u: uPlot, valores: number[]): string[] => valores.map((v) => (v === 0 ? '0' : formatearNumero(v, 3)));
    grafica = new uPlot(
      {
        width: lienzo.clientWidth,
        height: ALTO_GRAFICA,
        legend: { show: false },
        cursor: { drag: { x: false, y: false }, points: { show: false } },
        scales: { x: { time: false } },
        axes: [
          { ...eje, label: etiqueta(r.campo.nombre, r.campo.unidad), values: rotulos },
          { ...eje, label: etiqueta(metrica.nombre, metrica.unidad), size: 70, values: rotulos },
        ],
        series: [{}, { stroke: colores.texto, width: 1, points: { show: true, size: 5, stroke: colores.texto, fill: colores.texto } }],
        hooks: {
          // Línea vertical en el valor de la entrada con la que se lanzó el barrido.
          draw: [
            (u) => {
              const x = Math.round(u.valToPos(r.valorActual, 'x', true)) + 0.5;
              const { top, height, left, width } = u.bbox;
              if (x < left || x > left + width) return;
              const ctx = u.ctx;
              ctx.save();
              ctx.strokeStyle = colores.acento;
              ctx.lineWidth = devicePixelRatio;
              ctx.beginPath();
              ctx.moveTo(x, top);
              ctx.lineTo(x, top + height);
              ctx.stroke();
              ctx.restore();
            },
          ],
        },
      },
      [xs, ys],
      lienzo,
    );
  }

  function pintarEstado(): void {
    if (!resultado) return;
    const fallidos = resultado.puntos.filter((p) => !p.metricas);
    const sinDespegue = resultado.puntos.filter((p) => p.metricas && !p.despega).length;
    const partes = [
      `${resultado.puntos.length} simulaciones en ${formatearNumero(resultado.tiempoMs / 1000, 3)} s`,
      `línea vertical: valor actual ${formatearNumero(resultado.valorActual, 6)}`,
    ];
    if (sinDespegue) partes.push(`${sinDespegue} sin despegue`);
    if (fallidos.length) partes.push(`${fallidos.length} con entrada no válida (p. ej. ${fallidos[0]!.error})`);
    estado.textContent = partes.join(' · ');
  }

  async function calcular(): Promise<void> {
    const campo = buscarCampo(selectorCampo.value);
    const n = leerNumero(puntos.value);
    let valores: number[];
    try {
      valores = valoresBarrido(leerNumero(desde.value), leerNumero(hasta.value), n);
    } catch (e) {
      estado.textContent = e instanceof Error ? e.message : String(e);
      return;
    }
    const entrada = obtenerEntrada();
    botonCalcular.disabled = true;
    botonCancelar.disabled = false;
    estado.textContent = `calculando 0 / ${valores.length}…`;
    const inicio = performance.now();
    try {
      const r = await tarea.ejecutar({ tipo: 'barrido', entrada, ruta: campo.ruta, valores }, (hechos, total) => {
        estado.textContent = `calculando ${hechos} / ${total}…`;
      });
      if (r.tipo !== 'barrido') return;
      resultado = { campo, valorActual: campo.leer(entrada), puntos: r.puntos, tiempoMs: performance.now() - inicio };
      botonCSV.disabled = false;
      pintarEstado();
      dibujar();
    } catch (e) {
      estado.textContent = e instanceof TareaCancelada ? 'cancelado' : `error: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      botonCalcular.disabled = false;
      botonCancelar.disabled = true;
    }
  }

  function exportarCSV(): void {
    if (!resultado) return;
    const { campo, puntos: lista } = resultado;
    const cabecera = [etiqueta(campo.ruta, campo.unidad), ...METRICAS_HASTA_APOGEO.map((m) => etiqueta(m.id, m.unidad)), 'despega', 'error'];
    const lineas = [cabecera.join(',')];
    for (const p of lista) {
      const metricas = METRICAS_HASTA_APOGEO.map((m) => (p.metricas ? String(p.metricas[m.id]) : ''));
      // El mensaje de error lleva comas: va entre comillas, con las comillas dobladas (RFC 4180).
      const error = p.error ? `"${p.error.replace(/"/g, '""')}"` : '';
      lineas.push([String(p.valor), ...metricas, p.despega ? 1 : 0, error].join(','));
    }
    descargarCSV(`barrido-${campo.clave}.csv`, `${lineas.join('\r\n')}\r\n`);
  }

  selectorCampo.addEventListener('change', proponerIntervalo);
  selectorMetrica.addEventListener('change', dibujar);
  botonCalcular.addEventListener('click', () => void calcular());
  botonCancelar.addEventListener('click', () => tarea.cancelar());
  botonCSV.addEventListener('click', exportarCSV);
  for (const e of [desde, hasta, puntos]) {
    e.addEventListener('keydown', (k) => {
      if (k.key === 'Enter') void calcular();
    });
  }
  new ResizeObserver(() => {
    if (grafica && lienzo.clientWidth > 0) grafica.setSize({ width: lienzo.clientWidth, height: ALTO_GRAFICA });
    else if (!grafica) dibujar();
  }).observe(lienzo);

  proponerIntervalo();
  estado.textContent = 'Elegir el parámetro, el intervalo y el número de puntos. Cada simulación termina en el apogeo.';

  return { refrescarTema: dibujar };
}
