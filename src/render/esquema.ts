import type { Cohete, Muestra, ResultadoSimulacion } from '../simulacion/tipos';
import { valorRedondo } from '../util/escala';
import { formatearNumero } from '../util/formato';

/** Unidades en que se rotulan las fuerzas y longitudes del esquema. */
export type UnidadesEsquema = 'si' | 'practico';

export interface Esquema {
  cargar(cohete: Cohete, resultado: ResultadoSimulacion): void;
  dibujar(muestra: Muestra): void;
  setUnidades(unidades: UnidadesEsquema): void;
  refrescarTema(): void;
}

interface Colores {
  texto: string;
  tenue: string;
  fuente: string;
}

const MARGEN = 14;           // px
const PUNTA_FLECHA = 6;      // px
const ALTO_ESCALAS = 34;     // px reservados abajo para las barras de escala
const ALTO_LISTA = 46;       // px reservados arriba para la lista de módulos de las fuerzas
const FRACCION_FLECHA = 0.9; // la fuerza de referencia ocupa esta fracción de la semialtura disponible

function leerColores(): Colores {
  const estilo = getComputedStyle(document.documentElement);
  return {
    texto: estilo.getPropertyValue('--texto').trim(),
    tenue: estilo.getPropertyValue('--texto-tenue').trim(),
    fuente: `11px ${getComputedStyle(document.body).fontFamily}`,
  };
}

/** @param cifras cifras significativas: 4 para los módulos, 1 para la barra de escala (valor redondo) */
function textoFuerza(n: number, unidades: UnidadesEsquema, cifras = 4): string {
  return unidades === 'practico' ? `${formatearNumero(n / 1_000, cifras)} kN` : `${formatearNumero(n, cifras)} N`;
}

/**
 * Fuerza de referencia de la escala de los vectores: el máximo del empuje y del peso en todo el
 * vuelo. El arrastre no cuenta: en la reentrada puede multiplicar el empuje y dejaría los
 * vectores del ascenso en unos píxeles; si se sale del área se recorta (ver dibujar).
 */
function fuerzaReferencia(resultado: ResultadoSimulacion): number {
  let maximo = 0;
  for (const m of resultado.muestras) {
    maximo = Math.max(maximo, m.empuje, m.masa * m.gravedad);
  }
  return maximo;
}

/**
 * Esquema a escala en un canvas: perfil del cohete en líneas finas y diagrama de fuerzas
 * (empuje, peso y arrastre) con longitud proporcional al módulo y su escala en N.
 */
export function crearEsquema(lienzo: HTMLCanvasElement): Esquema {
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  let cohete: Cohete | null = null;
  let fMax = 1;
  let unidades: UnidadesEsquema = 'si';
  let colores = leerColores();
  let ultima: Muestra | null = null;

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

  function linea(x0: number, y0: number, x1: number, y1: number): void {
    ctx!.beginPath();
    ctx!.moveTo(x0, y0);
    ctx!.lineTo(x1, y1);
    ctx!.stroke();
  }

  /** Flecha vertical desde (x, y0) con longitud con signo (positiva hacia arriba). */
  function flecha(x: number, y0: number, longitud: number): void {
    const y1 = y0 - longitud;
    linea(x, y0, x, y1);
    if (Math.abs(longitud) < PUNTA_FLECHA) return;
    const s = Math.sign(longitud);
    ctx!.beginPath();
    ctx!.moveTo(x - PUNTA_FLECHA / 2, y1 + s * PUNTA_FLECHA);
    ctx!.lineTo(x, y1);
    ctx!.lineTo(x + PUNTA_FLECHA / 2, y1 + s * PUNTA_FLECHA);
    ctx!.stroke();
  }

  function rotulo(texto: string, x: number, y: number, alineacion: CanvasTextAlign = 'center'): void {
    ctx!.textAlign = alineacion;
    ctx!.fillText(texto, x, y);
  }

  /** Barra de escala horizontal con su rótulo. */
  function barraEscala(x: number, y: number, ancho: number, texto: string): void {
    linea(x, y, x + ancho, y);
    linea(x, y - 3, x, y + 3);
    linea(x + ancho, y - 3, x + ancho, y + 3);
    rotulo(texto, x + ancho + 6, y + 4, 'left');
  }

  function dibujar(muestra: Muestra): void {
    ultima = muestra;
    const { ancho, alto } = ajustarTamano();
    ctx!.clearRect(0, 0, ancho, alto);
    if (!cohete || ancho === 0 || alto === 0) return;
    ctx!.lineWidth = 1;
    ctx!.font = colores.fuente;
    ctx!.textBaseline = 'alphabetic';
    ctx!.strokeStyle = colores.texto;
    ctx!.fillStyle = colores.texto;

    const [e1, e2] = cohete.etapas;
    const altoUtil = alto - 2 * MARGEN - ALTO_ESCALAS - ALTO_LISTA;
    const yArriba = MARGEN + ALTO_LISTA;

    // Perfil del cohete. La escala se fija con el cohete completo y no cambia tras la separación.
    const longitudTotal = e1.longitud + e2.longitud;
    const diametroMax = Math.max(e1.diametro, e2.diametro);
    const k = Math.min(altoUtil / longitudTotal, (ancho * 0.22) / diametroMax); // px/m
    const xc = ancho * 0.18;
    const yBase = yArriba + altoUtil;
    const tramos = muestra.etapa === 1 ? [e1, e2] : [e2];
    let y = yBase;
    tramos.forEach((etapa, i) => {
      const r = (etapa.diametro * k) / 2;
      const l = etapa.longitud * k;
      const esSuperior = i === tramos.length - 1;
      if (!esSuperior) {
        ctx!.strokeRect(xc - r, y - l, 2 * r, l);
      } else {
        // Ojiva cónica en la etapa superior: 1,5 diámetros como máximo, un 35 % de su longitud como mucho.
        const ojiva = Math.min(1.5 * etapa.diametro * k, 0.35 * l);
        ctx!.beginPath();
        ctx!.moveTo(xc - r, y);
        ctx!.lineTo(xc - r, y - l + ojiva);
        ctx!.lineTo(xc, y - l);
        ctx!.lineTo(xc + r, y - l + ojiva);
        ctx!.lineTo(xc + r, y);
        ctx!.closePath();
        ctx!.stroke();
      }
      y -= l;
    });

    // Diagrama de fuerzas con origen común.
    const yOrigen = yArriba + altoUtil / 2;
    const semialtura = altoUtil / 2 - 24; // px, deja sitio al símbolo en la punta
    const s = (FRACCION_FLECHA * semialtura) / fMax; // px/N
    const peso = muestra.masa * muestra.gravedad;
    // El arrastre se opone a la velocidad.
    const sentidoArrastre = muestra.velocidad > 0 ? -1 : 1;
    const columnas = [
      { simbolo: 'F', valor: muestra.empuje, longitud: muestra.empuje * s, x: ancho * 0.48 },
      { simbolo: 'W', valor: peso, longitud: -peso * s, x: ancho * 0.66 },
      { simbolo: 'D', valor: muestra.arrastre, longitud: sentidoArrastre * muestra.arrastre * s, x: ancho * 0.84 },
    ];
    ctx!.strokeStyle = colores.tenue;
    ctx!.setLineDash([2, 3]);
    linea(ancho * 0.4, yOrigen, ancho - MARGEN, yOrigen);
    ctx!.setLineDash([]);
    ctx!.strokeStyle = colores.texto;
    // En la punta solo el símbolo; los módulos van en una lista para que no se solapen.
    columnas.forEach((c, i) => {
      // Un vector que no cabe se recorta y se dibuja discontinuo: su longitud ya no es a escala.
      const recortado = Math.abs(c.longitud) > semialtura;
      if (recortado) {
        c.longitud = Math.sign(c.longitud) * semialtura;
        ctx!.setLineDash([4, 3]);
      }
      flecha(c.x, yOrigen, c.longitud);
      ctx!.setLineDash([]);
      const arriba = c.longitud > 0 || (c.longitud === 0 && c.simbolo === 'F');
      const yPunta = yOrigen - c.longitud;
      rotulo(c.simbolo, c.x, arriba ? yPunta - 6 : yPunta + 14);
      const nota = recortado ? ' (fuera de escala)' : '';
      rotulo(`${c.simbolo} = ${textoFuerza(c.valor, unidades)}${nota}`, ancho - MARGEN, MARGEN + 10 + 14 * i, 'right');
    });

    // Barras de escala: longitud y fuerza.
    ctx!.strokeStyle = colores.tenue;
    ctx!.fillStyle = colores.tenue;
    const anchoBarra = ancho * 0.25;
    const metros = valorRedondo(anchoBarra / k);
    barraEscala(MARGEN, alto - MARGEN - 18, metros * k, `${formatearNumero(metros, 1)} m`);
    const newtons = valorRedondo(anchoBarra / s);
    barraEscala(MARGEN, alto - MARGEN, newtons * s, textoFuerza(newtons, unidades, 1));
  }

  new ResizeObserver(() => {
    if (ultima) dibujar(ultima);
  }).observe(lienzo);

  return {
    cargar(nuevoCohete, resultado) {
      cohete = nuevoCohete;
      fMax = Math.max(fuerzaReferencia(resultado), 1);
    },
    dibujar,
    setUnidades(nuevas) {
      unidades = nuevas;
      if (ultima) dibujar(ultima);
    },
    refrescarTema() {
      colores = leerColores();
      if (ultima) dibujar(ultima);
    },
  };
}
