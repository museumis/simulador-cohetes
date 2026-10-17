import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { ResultadoSimulacion } from '../simulacion/tipos';
import { formatearNumero } from '../util/formato';
import { buscarMagnitud, GRAFICAS_POR_DEFECTO, MAGNITUDES, unidadDe, type SistemaUnidades } from './magnitudes';

/** Altura de la cabecera de cada gráfica (selector y escala), en px; coincide con el CSS. */
const ALTO_CABECERA = 22;
/** Altura del eje de tiempo, solo en la última gráfica (px). */
const ALTO_EJE_X = 34;
/** Altura mínima del área de cada gráfica (px); si no caben, el panel se desplaza. */
const ALTO_MINIMO = 40;
/** Décadas que abarca como mucho el eje vertical en escala logarítmica. */
const DECADAS_LOG = 15;
/** Anchura aproximada de un carácter de la fuente de los ejes (px). */
const ANCHO_CARACTER = 7;

/** Separación mínima entre marcas del eje vertical (px). */
const ESPACIO_MARCAS_Y = 24;

/** Rótulos de las marcas de un eje: el cero como «0» y el resto con las cifras significativas pedidas. */
function rotulosEje(valores: (number | null)[], cifras = 3): string[] {
  return valores.map((v) => (v === null ? '' : v === 0 ? '0' : formatearNumero(v, cifras)));
}

const esPotenciaDe10 = (v: number): boolean => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9;

/**
 * Marcas de un eje logarítmico: solo potencias de 10 y, si no caben, una de cada n décadas.
 * uPlot propone 1…9 × 10ⁿ en cada década, que con muchas décadas se amontonan.
 */
function filtrarMarcasLog(u: uPlot, marcas: number[]): (number | null)[] {
  const decadas = marcas.filter(esPotenciaDe10).length;
  const caben = Math.max(2, Math.floor(u.bbox.height / devicePixelRatio / ESPACIO_MARCAS_Y));
  const paso = Math.ceil(decadas / caben);
  return marcas.map((v) => (esPotenciaDe10(v) && Math.round(Math.log10(v)) % paso === 0 ? v : null));
}

/** Desplazamiento máximo del ratón para tratar una pulsación como clic y no como zoom (px). */
const TOLERANCIA_CLIC = 3;

export interface Graficas {
  cargar(resultado: ResultadoSimulacion): void;
  setSistema(sistema: SistemaUnidades): void;
  /** Vuelve a crear las gráficas con los colores del tema actual. */
  refrescarTema(): void;
  /** Mueve el cursor de tiempo del reproductor. */
  cursor(t: number): void;
}

interface Colores {
  texto: string;
  tenue: string;
  rejilla: string;
  acento: string;
  fuente: string;
}

interface Panel {
  magnitudId: string;
  log: boolean;
  elemento: HTMLElement;
  selector: HTMLSelectElement;
  botonLog: HTMLButtonElement;
  lienzo: HTMLElement;
  grafica: uPlot | null;
  cursor: HTMLElement;
}

function leerColores(): Colores {
  const estilo = getComputedStyle(document.documentElement);
  const v = (nombre: string): string => estilo.getPropertyValue(nombre).trim();
  return {
    texto: v('--texto'),
    tenue: v('--texto-tenue'),
    rejilla: v('--rejilla'),
    acento: v('--acento'),
    fuente: `11px ${getComputedStyle(document.body).fontFamily}`,
  };
}

/**
 * Gráficas apiladas con eje de tiempo común: zoom con arrastre sincronizado, doble clic para
 * restablecer, líneas en los eventos, escala logarítmica opcional y un clic para ir a ese instante.
 */
export function crearGraficas(contenedor: HTMLElement, alElegirInstante: (t: number) => void): Graficas {
  contenedor.replaceChildren();
  let resultado: ResultadoSimulacion | null = null;
  let sistema: SistemaUnidades = 'si';
  let colores = leerColores();
  let tCursor = 0;
  let sincronizando = false;
  let rangoX: { min: number; max: number } | null = null;

  const paneles: Panel[] = GRAFICAS_POR_DEFECTO.map((id) => crearPanel(id));

  function crearPanel(magnitudId: string): Panel {
    const elemento = document.createElement('div');
    elemento.className = 'grafica';
    const cabecera = document.createElement('div');
    cabecera.className = 'grafica-cabecera';
    const selector = document.createElement('select');
    selector.title = 'Magnitud representada';
    const botonLog = document.createElement('button');
    botonLog.type = 'button';
    botonLog.textContent = 'log';
    botonLog.title = 'Escala logarítmica en el eje vertical';
    cabecera.append(selector, botonLog);
    const lienzo = document.createElement('div');
    lienzo.className = 'grafica-lienzo';
    elemento.append(cabecera, lienzo);
    contenedor.append(elemento);

    const cursor = document.createElement('div');
    cursor.className = 'grafica-cursor';
    const panel: Panel = { magnitudId, log: false, elemento, selector, botonLog, lienzo, grafica: null, cursor };
    selector.addEventListener('change', () => {
      panel.magnitudId = selector.value;
      construir(panel);
    });
    botonLog.addEventListener('click', () => {
      panel.log = !panel.log;
      construir(panel);
    });
    return panel;
  }

  function rellenarSelector(panel: Panel): void {
    panel.selector.replaceChildren(
      ...MAGNITUDES.map((m) => {
        const unidad = unidadDe(m, sistema).unidad;
        return new Option(unidad ? `${m.simbolo} [${unidad}]` : m.simbolo, m.id, false, m.id === panel.magnitudId);
      }),
    );
    panel.botonLog.setAttribute('aria-pressed', String(panel.log));
  }

  function tamano(panel: Panel): { width: number; height: number } {
    const ultimo = panel === paneles[paneles.length - 1];
    const alto = (contenedor.clientHeight - ALTO_EJE_X) / paneles.length - ALTO_CABECERA;
    return { width: Math.max(contenedor.clientWidth, 200), height: Math.max(alto, ALTO_MINIMO) + (ultimo ? ALTO_EJE_X : 0) };
  }

  function dibujarEventos(u: uPlot): void {
    if (!resultado) return;
    const ctx = u.ctx;
    const { top, height, left, width } = u.bbox;
    const dpr = devicePixelRatio;
    ctx.save();
    ctx.strokeStyle = colores.tenue;
    ctx.lineWidth = dpr;
    ctx.setLineDash([2 * dpr, 3 * dpr]);
    for (const e of resultado.eventos) {
      const x = Math.round(u.valToPos(e.t, 'x', true)) + 0.5;
      if (x < left || x > left + width) continue;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function propagarEscalaX(u: uPlot, clave: string): void {
    if (clave !== 'x' || sincronizando) return;
    const { min, max } = u.scales.x!;
    if (min === undefined || max === undefined || min === null || max === null) return;
    rangoX = { min, max };
    sincronizando = true;
    for (const p of paneles) if (p.grafica && p.grafica !== u) p.grafica.setScale('x', rangoX);
    sincronizando = false;
    colocarCursor(paneles.find((p) => p.grafica === u) ?? paneles[0]!);
  }

  function construir(panel: Panel): void {
    panel.grafica?.destroy();
    panel.grafica = null;
    rellenarSelector(panel);
    if (!resultado) return;
    const magnitud = buscarMagnitud(panel.magnitudId);
    const { divisor } = unidadDe(magnitud, sistema);
    const muestras = resultado.muestras;
    const xs = muestras.map((m) => m.t);
    const valores = muestras.map((m) => magnitud.valor(m) / divisor);
    // En escala logarítmica solo se dibujan los valores dentro de DECADAS_LOG décadas bajo el
    // máximo: ρ y q bajan a ~1e-200 a miles de km y uPlot no termina de generar las marcas.
    const minimoLog = valores.reduce((a, b) => Math.max(a, b), -Infinity) * 10 ** -DECADAS_LOG;
    const ys = panel.log ? valores.map((v) => (v > 0 && v >= minimoLog ? v : null)) : valores;
    const ultimo = panel === paneles[paneles.length - 1];
    const eje = {
      stroke: colores.texto,
      font: colores.fuente,
      grid: { stroke: colores.rejilla, width: 1 },
      ticks: { stroke: colores.rejilla, width: 1 },
    };
    const opciones: uPlot.Options = {
      ...tamano(panel),
      legend: { show: false },
      cursor: {
        sync: { key: 'graficas' },
        drag: { x: true, y: false },
        points: { show: false },
      },
      scales: {
        x: { time: false },
        y: panel.log ? { distr: 3, log: 10 } : {},
      },
      axes: [
        {
          ...eje,
          size: ultimo ? ALTO_EJE_X : 4,
          values: ultimo ? (_u, valores) => rotulosEje(valores) : () => [],
          ...(ultimo ? { label: 't [s]', labelSize: 12, labelFont: colores.fuente } : {}),
        },
        {
          ...eje,
          space: ESPACIO_MARCAS_Y,
          ...(panel.log
            ? {
                filter: filtrarMarcasLog,
                grid: { ...eje.grid, filter: filtrarMarcasLog },
                ticks: { ...eje.ticks, filter: filtrarMarcasLog },
              }
            : {}),
          // Anchura según el rótulo más largo, para que no se corten los valores grandes.
          size: (_u, rotulos) => Math.max(40, ...(rotulos ?? []).map((r) => r.length * ANCHO_CARACTER + 16)),
          // En escala logarítmica las marcas son potencias de 10: 1e-9 en lugar de 1.00e-9.
          values: (_u, valores) => rotulosEje(valores, panel.log ? 1 : 3),
        },
      ],
      series: [{}, { stroke: colores.texto, width: 1, points: { show: false } }],
      hooks: {
        draw: [dibujarEventos],
        setScale: [propagarEscalaX],
      },
    };
    const u = new uPlot(opciones, [xs, ys], panel.lienzo);
    panel.grafica = u;
    if (rangoX) {
      sincronizando = true;
      u.setScale('x', rangoX);
      sincronizando = false;
    }
    u.over.append(panel.cursor);
    let inicio: number | null = null;
    u.over.addEventListener('mousedown', (e) => {
      inicio = e.clientX;
    });
    u.over.addEventListener('mouseup', (e) => {
      if (inicio !== null && Math.abs(e.clientX - inicio) <= TOLERANCIA_CLIC) {
        alElegirInstante(u.posToVal(e.offsetX, 'x'));
      }
      inicio = null;
    });
    colocarCursor(panel);
  }

  function colocarCursor(panel: Panel): void {
    const u = panel.grafica;
    if (!u) return;
    const x = u.valToPos(tCursor, 'x');
    const visible = x >= 0 && x <= u.over.clientWidth;
    panel.cursor.style.display = visible ? 'block' : 'none';
    panel.cursor.style.transform = `translateX(${x}px)`;
  }

  const construirTodas = (): void => paneles.forEach(construir);

  new ResizeObserver(() => {
    for (const p of paneles) p.grafica?.setSize(tamano(p));
    paneles.forEach(colocarCursor);
  }).observe(contenedor);

  paneles.forEach(rellenarSelector);

  return {
    cargar(nuevo) {
      resultado = nuevo;
      rangoX = null;
      construirTodas();
    },
    setSistema(nuevo) {
      sistema = nuevo;
      construirTodas();
    },
    refrescarTema() {
      colores = leerColores();
      construirTodas();
    },
    cursor(t) {
      tCursor = t;
      paneles.forEach(colocarCursor);
    },
  };
}
