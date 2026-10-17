import type { Cohete, Etapa, Muestra, ResultadoSimulacion } from '../simulacion/tipos';
import { valorRedondo } from '../util/escala';
import { formatearNumero } from '../util/formato';

/** Unidades en que se rotulan las fuerzas, longitudes y ángulos del esquema. */
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

/** Módulo de una fuerza para la lista de arriba a la derecha. */
interface FilaFuerza {
  simbolo: string;
  valor: number;      // N
  recortado: boolean; // no cabe a escala
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

function textoAngulo(rad: number, unidades: UnidadesEsquema): string {
  return unidades === 'practico' ? `${formatearNumero((rad * 180) / Math.PI, 3)}°` : `${formatearNumero(rad, 3)} rad`;
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
 * (empuje, peso y arrastre) con longitud proporcional al módulo y su escala en N. En 2D, el cohete
 * se inclina según su eje y se acotan los ángulos de trayectoria γ y de ataque α.
 */
export function crearEsquema(lienzo: HTMLCanvasElement): Esquema {
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  let cohete: Cohete | null = null;
  let plano = false; // modelo 2D
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

  /** Flecha desde (x0, y0) con componentes (dx, dy) en píxeles de pantalla. */
  function flecha(x0: number, y0: number, dx: number, dy: number): void {
    const x1 = x0 + dx;
    const y1 = y0 + dy;
    linea(x0, y0, x1, y1);
    const l = Math.hypot(dx, dy);
    if (l < PUNTA_FLECHA) return;
    const ux = dx / l;
    const uy = dy / l;
    const p = PUNTA_FLECHA;
    ctx!.beginPath();
    ctx!.moveTo(x1 - p * ux - (p / 2) * uy, y1 - p * uy + (p / 2) * ux);
    ctx!.lineTo(x1, y1);
    ctx!.lineTo(x1 - p * ux + (p / 2) * uy, y1 - p * uy - (p / 2) * ux);
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

  /**
   * Perfil del cohete con la base en (xc, yBase) y el eje hacia arriba.
   * @param k escala (px/m)
   * @param tramos etapas acopladas, de abajo arriba
   */
  function perfil(xc: number, yBase: number, k: number, tramos: readonly Etapa[]): void {
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
  }

  /** En la punta de cada vector solo va el símbolo; los módulos, en una lista para que no se solapen. */
  function listaFuerzas(ancho: number, filas: readonly FilaFuerza[]): void {
    filas.forEach((c, i) => {
      const nota = c.recortado ? ' (fuera de escala)' : '';
      rotulo(`${c.simbolo} = ${textoFuerza(c.valor, unidades)}${nota}`, ancho - MARGEN, MARGEN + 10 + 14 * i, 'right');
    });
  }

  /** Barras de escala: longitud y fuerza. */
  function barras(ancho: number, alto: number, k: number, s: number): void {
    ctx!.strokeStyle = colores.tenue;
    ctx!.fillStyle = colores.tenue;
    const anchoBarra = ancho * 0.25;
    const metros = valorRedondo(anchoBarra / k);
    barraEscala(MARGEN, alto - MARGEN - 18, metros * k, `${formatearNumero(metros, 1)} m`);
    const newtons = valorRedondo(anchoBarra / s);
    barraEscala(MARGEN, alto - MARGEN, newtons * s, textoFuerza(newtons, unidades, 1));
  }

  /**
   * Arco de cota entre dos direcciones (rad, sobre la horizontal) con el símbolo junto a su centro.
   * Si el ángulo es casi nulo no hay arco ni símbolo: su valor sigue en la lista de ángulos.
   */
  function cota(cx: number, cy: number, radio: number, desde: number, hasta: number, simbolo: string): void {
    if (Math.abs(hasta - desde) < 1e-3) return;
    // En pantalla y crece hacia abajo: la dirección φ sobre la horizontal es −φ en el canvas.
    ctx!.beginPath();
    ctx!.arc(cx, cy, radio, -desde, -hasta, hasta > desde);
    ctx!.stroke();
    const medio = (desde + hasta) / 2;
    rotulo(simbolo, cx + (radio + 8) * Math.cos(medio), cy - (radio + 8) * Math.sin(medio) + 4);
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
    if (plano) dibujar2D(cohete, muestra, ancho, alto);
    else dibujar1D(cohete, muestra, ancho, alto);
  }

  function dibujar1D(cohete: Cohete, muestra: Muestra, ancho: number, alto: number): void {
    const [e1, e2] = cohete.etapas;
    const altoUtil = alto - 2 * MARGEN - ALTO_ESCALAS - ALTO_LISTA;
    const yArriba = MARGEN + ALTO_LISTA;

    // Perfil del cohete. La escala se fija con el cohete completo y no cambia tras la separación.
    const longitudTotal = e1.longitud + e2.longitud;
    const diametroMax = Math.max(e1.diametro, e2.diametro);
    const k = Math.min(altoUtil / longitudTotal, (ancho * 0.22) / diametroMax); // px/m
    perfil(ancho * 0.18, yArriba + altoUtil, k, muestra.etapa === 1 ? [e1, e2] : [e2]);

    // Diagrama de fuerzas con origen común.
    const yOrigen = yArriba + altoUtil / 2;
    const semialtura = altoUtil / 2 - 24; // px, deja sitio al símbolo en la punta
    const s = (FRACCION_FLECHA * semialtura) / fMax; // px/N
    const peso = muestra.masa * muestra.gravedad;
    // El arrastre se opone a la velocidad.
    const sentidoArrastre = muestra.velocidad > 0 ? -1 : 1;
    const columnas = [
      { simbolo: 'F', valor: muestra.empuje, longitud: muestra.empuje * s, x: ancho * 0.48, recortado: false },
      { simbolo: 'W', valor: peso, longitud: -peso * s, x: ancho * 0.66, recortado: false },
      { simbolo: 'D', valor: muestra.arrastre, longitud: sentidoArrastre * muestra.arrastre * s, x: ancho * 0.84, recortado: false },
    ];
    ctx!.strokeStyle = colores.tenue;
    ctx!.setLineDash([2, 3]);
    linea(ancho * 0.4, yOrigen, ancho - MARGEN, yOrigen);
    ctx!.setLineDash([]);
    ctx!.strokeStyle = colores.texto;
    for (const c of columnas) {
      // Un vector que no cabe se recorta y se dibuja discontinuo: su longitud ya no es a escala.
      c.recortado = Math.abs(c.longitud) > semialtura;
      if (c.recortado) {
        c.longitud = Math.sign(c.longitud) * semialtura;
        ctx!.setLineDash([4, 3]);
      }
      flecha(c.x, yOrigen, 0, -c.longitud);
      ctx!.setLineDash([]);
      const arriba = c.longitud > 0 || (c.longitud === 0 && c.simbolo === 'F');
      const yPunta = yOrigen - c.longitud;
      rotulo(c.simbolo, c.x, arriba ? yPunta - 6 : yPunta + 14);
    }
    listaFuerzas(ancho, columnas);
    barras(ancho, alto, k, s);
  }

  /**
   * Esquema 2D en los ejes locales (horizontal a la derecha, vertical arriba): el cohete inclinado
   * según su eje, la dirección de la velocidad con las cotas de γ y α, y el diagrama de cuerpo libre
   * con la dirección real de cada fuerza.
   */
  function dibujar2D(cohete: Cohete, muestra: Muestra, ancho: number, alto: number): void {
    const [e1, e2] = cohete.etapas;
    const altoUtil = alto - 2 * MARGEN - ALTO_ESCALAS - ALTO_LISTA;
    const yArriba = MARGEN + ALTO_LISTA;
    const tramos = muestra.etapa === 1 ? [e1, e2] : [e2];
    const eje = muestra.anguloEmpuje;
    const gamma = muestra.anguloTrayectoria;

    // Perfil a escala fija (el cohete completo cabe con cualquier inclinación), girado alrededor de su centro.
    const anchoCaja = ancho * 0.46 - MARGEN;
    const lado = Math.min(anchoCaja, altoUtil);
    const cx = MARGEN + anchoCaja / 2;
    const cy = yArriba + altoUtil / 2;
    const k = (0.9 * lado) / (e1.longitud + e2.longitud); // px/m
    const longitudMostrada = tramos.reduce((suma, e) => suma + e.longitud, 0) * k;

    ctx!.strokeStyle = colores.tenue;
    ctx!.fillStyle = colores.tenue;
    ctx!.setLineDash([2, 3]);
    linea(MARGEN, cy, MARGEN + anchoCaja, cy);
    ctx!.setLineDash([]);
    rotulo('horizontal local', MARGEN, cy + 14, 'left');

    ctx!.strokeStyle = colores.texto;
    ctx!.fillStyle = colores.texto;
    ctx!.save();
    ctx!.translate(cx, cy);
    // El perfil se dibuja hacia arriba; el giro lo lleva a la dirección del eje.
    ctx!.rotate(Math.PI / 2 - eje);
    perfil(0, longitudMostrada / 2, k, tramos);
    ctx!.restore();

    // Dirección de la velocidad: longitud fija, solo indica la dirección.
    const largo = 0.48 * lado;
    if (muestra.velocidad > 0) {
      flecha(cx, cy, largo * Math.cos(gamma), -largo * Math.sin(gamma));
      rotulo('v', cx + (largo + 8) * Math.cos(gamma), cy - (largo + 8) * Math.sin(gamma) + 4);
    }
    cota(cx, cy, 0.36 * lado, 0, gamma, 'γ');
    cota(cx, cy, 0.24 * lado, gamma, eje, 'α');
    // Valores de los ángulos, arriba a la izquierda.
    [
      `γ = ${textoAngulo(gamma, unidades)}  (trayectoria)`,
      `θ = ${textoAngulo(eje, unidades)}  (eje)`,
      `α = ${textoAngulo(muestra.anguloAtaque, unidades)}  (ataque)`,
    ].forEach((texto, i) => rotulo(texto, MARGEN, MARGEN + 10 + 14 * i, 'left'));

    // Diagrama de cuerpo libre con origen común.
    const ox = ancho * 0.74;
    const oy = cy;
    const radio = Math.max(Math.min(ancho - MARGEN - ox, ox - ancho * 0.5, altoUtil / 2) - 16, 1); // px
    const s = (FRACCION_FLECHA * radio) / fMax; // px/N
    const vectores = [
      { simbolo: 'F', valor: muestra.empuje, angulo: eje, recortado: false },
      { simbolo: 'W', valor: muestra.masa * muestra.gravedad, angulo: -Math.PI / 2, recortado: false },
      // El arrastre se opone a la velocidad.
      { simbolo: 'D', valor: muestra.arrastre, angulo: gamma + Math.PI, recortado: false },
    ];
    ctx!.strokeStyle = colores.tenue;
    ctx!.setLineDash([2, 3]);
    linea(ox - radio, oy, ox + radio, oy);
    ctx!.setLineDash([]);
    ctx!.strokeStyle = colores.texto;
    for (const c of vectores) {
      let longitud = c.valor * s;
      // Un vector que no cabe se recorta y se dibuja discontinuo: su longitud ya no es a escala.
      c.recortado = longitud > radio;
      if (c.recortado) {
        longitud = radio;
        ctx!.setLineDash([4, 3]);
      }
      const ux = Math.cos(c.angulo);
      const uy = -Math.sin(c.angulo);
      flecha(ox, oy, longitud * ux, longitud * uy);
      ctx!.setLineDash([]);
      if (c.valor > 0) rotulo(c.simbolo, ox + (longitud + 9) * ux, oy + (longitud + 9) * uy + 4);
    }
    listaFuerzas(ancho, vectores);
    barras(ancho, alto, k, s);
  }

  new ResizeObserver(() => {
    if (ultima) dibujar(ultima);
  }).observe(lienzo);

  return {
    cargar(nuevoCohete, resultado) {
      cohete = nuevoCohete;
      plano = resultado.diagnostico.modelo === '2D';
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
