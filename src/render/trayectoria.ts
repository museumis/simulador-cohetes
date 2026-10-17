import type { Muestra, ResultadoSimulacion } from '../simulacion/tipos';
import { marcasLineales, pasoRedondo, valorRedondo } from '../util/escala';
import { formatearNumero } from '../util/formato';
import { indiceMuestra } from '../util/interpolacion';

/** Unidades de los ejes: metros (SI) o kilómetros. */
export type UnidadesTrayectoria = 'si' | 'practico';

/**
 * Escala vertical: 'real' usa los mismos px/m en los dos ejes; 'exagerada' multiplica la vertical
 * por un factor redondo (1, 2 o 5 × 10ⁿ) para llenar el área, y lo indica en el eje.
 */
export type EscalaTrayectoria = 'real' | 'exagerada';

export interface Trayectoria {
  cargar(resultado: ResultadoSimulacion): void;
  dibujar(muestra: Muestra): void;
  setUnidades(unidades: UnidadesTrayectoria): void;
  setEscala(escala: EscalaTrayectoria): void;
  refrescarTema(): void;
}

interface Colores {
  texto: string;
  tenue: string;
  rejilla: string;
  acento: string;
  fuente: string;
}

const MARGEN_IZQUIERDO = 58; // px, rótulos del eje vertical
const MARGEN_INFERIOR = 32;  // px, rótulos y título del eje horizontal
const MARGEN_SUPERIOR = 18;  // px, título del eje vertical
const MARGEN_DERECHO = 12;   // px
const RADIO_MARCA = 3;       // px, posición actual
const SEPARACION_PUNTOS = 0.5; // px: los puntos más cercanos al anterior no se dibujan
const DISTANCIA_CLIC = 12;   // px, distancia máxima a la trayectoria para elegir un instante

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

/** Geometría del dibujo: área de la gráfica y transformación de (alcance, h) en m a píxeles. */
interface Geometria {
  izquierda: number;
  arriba: number;
  ancho: number;
  alto: number;
  xMin: number;   // m, en el borde izquierdo
  yMin: number;   // m, en el borde inferior
  kx: number;     // px/m
  ky: number;     // px/m; ky = exageracion · kx
  exageracion: number;
}

/**
 * Trayectoria en el plano: altitud frente al alcance sobre la superficie, con la parte ya recorrida
 * resaltada y la posición actual con el color de acento. La superficie es la recta h = 0.
 * Un clic cerca de la trayectoria lleva el reproductor a ese instante.
 */
export function crearTrayectoria(lienzo: HTMLCanvasElement, alElegirInstante: (t: number) => void): Trayectoria {
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  let resultado: ResultadoSimulacion | null = null;
  let unidades: UnidadesTrayectoria = 'si';
  let escala: EscalaTrayectoria = 'exagerada';
  let colores = leerColores();
  let ultima: Muestra | null = null;
  let geometria: Geometria | null = null;
  // Puntos ya transformados a píxeles, diezmados; con su instante para la parte recorrida y los clics.
  let px: number[] = [];
  let py: number[] = [];
  let pt: number[] = [];

  const divisor = (): number => (unidades === 'practico' ? 1_000 : 1);
  const unidad = (): string => (unidades === 'practico' ? 'km' : 'm');

  function ajustarTamano(): { ancho: number; alto: number } {
    const dpr = devicePixelRatio;
    const ancho = lienzo.clientWidth;
    const alto = lienzo.clientHeight;
    if (lienzo.width !== Math.round(ancho * dpr) || lienzo.height !== Math.round(alto * dpr)) {
      lienzo.width = Math.round(ancho * dpr);
      lienzo.height = Math.round(alto * dpr);
    }
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ancho, alto };
  }

  /** Calcula la escala y transforma toda la trayectoria a píxeles. */
  function preparar(anchoLienzo: number, altoLienzo: number): void {
    geometria = null;
    if (!resultado) return;
    const ancho = anchoLienzo - MARGEN_IZQUIERDO - MARGEN_DERECHO;
    const alto = altoLienzo - MARGEN_SUPERIOR - MARGEN_INFERIOR;
    if (ancho <= 0 || alto <= 0) return;
    let xMin = 0;
    let xMax = 0;
    let yMin = 0;
    let yMax = 0;
    for (const m of resultado.muestras) {
      xMin = Math.min(xMin, m.alcance);
      xMax = Math.max(xMax, m.alcance);
      yMin = Math.min(yMin, m.altitud);
      yMax = Math.max(yMax, m.altitud);
    }
    // Un vuelo vertical o sin despegue no tiene extensión en algún eje.
    const rangoY = Math.max(yMax - yMin, 1);
    const rangoX = Math.max(xMax - xMin, 1);
    const kxLleno = ancho / rangoX;
    const kyLleno = alto / rangoY;
    let kx: number;
    let exageracion: number;
    if (escala === 'real') {
      kx = Math.min(kxLleno, kyLleno);
      exageracion = 1;
    } else {
      // El mayor factor redondo que deja caber la altura con el alcance ocupando todo el ancho.
      const f = kyLleno / kxLleno;
      exageracion = f >= 1 ? valorRedondo(f) : 1 / pasoRedondo(1 / f);
      kx = kxLleno;
      if (exageracion * kx > kyLleno) kx = kyLleno / exageracion;
    }
    const ky = exageracion * kx;
    geometria = { izquierda: MARGEN_IZQUIERDO, arriba: MARGEN_SUPERIOR, ancho, alto, xMin, yMin, kx, ky, exageracion };

    px = [];
    py = [];
    pt = [];
    for (const m of resultado.muestras) {
      const x = geometria.izquierda + (m.alcance - xMin) * kx;
      const y = geometria.arriba + alto - (m.altitud - yMin) * ky;
      const n = px.length;
      if (n > 0 && Math.abs(x - px[n - 1]!) < SEPARACION_PUNTOS && Math.abs(y - py[n - 1]!) < SEPARACION_PUNTOS) continue;
      px.push(x);
      py.push(y);
      pt.push(m.t);
    }
  }

  function linea(x0: number, y0: number, x1: number, y1: number): void {
    ctx!.beginPath();
    ctx!.moveTo(x0, y0);
    ctx!.lineTo(x1, y1);
    ctx!.stroke();
  }

  function polilinea(hasta: number, final?: { x: number; y: number }): void {
    if (px.length === 0) return;
    ctx!.beginPath();
    ctx!.moveTo(px[0]!, py[0]!);
    for (let i = 1; i <= hasta && i < px.length; i++) ctx!.lineTo(px[i]!, py[i]!);
    if (final) ctx!.lineTo(final.x, final.y);
    ctx!.stroke();
  }

  function dibujarEjes(g: Geometria): void {
    const d = divisor();
    ctx!.font = colores.fuente;
    ctx!.lineWidth = 1;
    ctx!.textBaseline = 'middle';
    const xMax = g.xMin + g.ancho / g.kx;
    const yMax = g.yMin + g.alto / g.ky;
    // Marcas en las unidades mostradas.
    for (const v of marcasLineales(g.xMin / d, xMax / d, Math.max(2, Math.floor(g.ancho / 70)))) {
      const x = Math.round(g.izquierda + (v * d - g.xMin) * g.kx) + 0.5;
      ctx!.strokeStyle = colores.rejilla;
      linea(x, g.arriba, x, g.arriba + g.alto);
      ctx!.fillStyle = colores.tenue;
      ctx!.textAlign = 'center';
      ctx!.fillText(v === 0 ? '0' : formatearNumero(v, 3), x, g.arriba + g.alto + 10);
    }
    for (const v of marcasLineales(g.yMin / d, yMax / d, Math.max(2, Math.floor(g.alto / 30)))) {
      const y = Math.round(g.arriba + g.alto - (v * d - g.yMin) * g.ky) + 0.5;
      ctx!.strokeStyle = colores.rejilla;
      linea(g.izquierda, y, g.izquierda + g.ancho, y);
      ctx!.fillStyle = colores.tenue;
      ctx!.textAlign = 'right';
      ctx!.fillText(v === 0 ? '0' : formatearNumero(v, 3), g.izquierda - 6, y);
    }
    ctx!.fillStyle = colores.texto;
    ctx!.textAlign = 'center';
    ctx!.fillText(`alcance [${unidad()}]`, g.izquierda + g.ancho / 2, g.arriba + g.alto + 24);
    ctx!.textAlign = 'left';
    const nota = g.exageracion === 1 ? 'a escala real' : `exageración vertical ×${formatearNumero(g.exageracion, 1)}`;
    ctx!.fillText(`h [${unidad()}] · ${nota}`, 4, 8);

    // Superficie: h = 0.
    const ySuperficie = Math.round(g.arriba + g.alto + g.yMin * g.ky) + 0.5;
    ctx!.strokeStyle = colores.texto;
    linea(g.izquierda, ySuperficie, g.izquierda + g.ancho, ySuperficie);
  }

  function dibujar(muestra: Muestra): void {
    ultima = muestra;
    const { ancho, alto } = ajustarTamano();
    ctx!.clearRect(0, 0, ancho, alto);
    if (!geometria) preparar(ancho, alto);
    const g = geometria;
    if (!g) return;
    dibujarEjes(g);
    ctx!.save();
    ctx!.beginPath();
    ctx!.rect(g.izquierda, g.arriba, g.ancho, g.alto);
    ctx!.clip();
    // Trayectoria completa en tono tenue y la parte ya recorrida en el color del texto.
    ctx!.lineWidth = 1;
    ctx!.strokeStyle = colores.tenue;
    polilinea(px.length - 1);
    const x = g.izquierda + (muestra.alcance - g.xMin) * g.kx;
    const y = g.arriba + g.alto - (muestra.altitud - g.yMin) * g.ky;
    let hasta = -1;
    for (let lo = 0, hi = pt.length - 1; lo <= hi; ) {
      const medio = (lo + hi) >> 1;
      if (pt[medio]! <= muestra.t) {
        hasta = medio;
        lo = medio + 1;
      } else hi = medio - 1;
    }
    ctx!.strokeStyle = colores.texto;
    if (hasta >= 0) polilinea(hasta, { x, y });
    ctx!.strokeStyle = colores.acento;
    ctx!.beginPath();
    ctx!.arc(x, y, RADIO_MARCA, 0, 2 * Math.PI);
    ctx!.stroke();
    ctx!.restore();
  }

  function redibujar(): void {
    geometria = null;
    if (ultima) dibujar(ultima);
  }

  lienzo.addEventListener('click', (e) => {
    if (!geometria || px.length === 0 || !resultado) return;
    const r = lienzo.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    let mejor = -1;
    let distancia = DISTANCIA_CLIC * DISTANCIA_CLIC;
    for (let i = 0; i < px.length; i++) {
      const d2 = (px[i]! - cx) ** 2 + (py[i]! - cy) ** 2;
      if (d2 <= distancia) {
        distancia = d2;
        mejor = i;
      }
    }
    if (mejor < 0) return;
    // Se va a la muestra original más cercana a ese instante.
    alElegirInstante(resultado.muestras[indiceMuestra(resultado.muestras, pt[mejor]!)]!.t);
  });

  new ResizeObserver(redibujar).observe(lienzo);

  return {
    cargar(nuevo) {
      resultado = nuevo;
      geometria = null;
    },
    dibujar,
    setUnidades(nuevas) {
      unidades = nuevas;
      redibujar();
    },
    setEscala(nueva) {
      escala = nueva;
      redibujar();
    },
    refrescarTema() {
      colores = leerColores();
      redibujar();
    },
  };
}
