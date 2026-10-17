import type { Muestra } from '../simulacion/tipos';

/**
 * Índice de la última muestra con t ≤ tiempo (búsqueda binaria).
 * Si hay varias con el mismo t (discontinuidad), devuelve la última: el estado posterior.
 * Antes de la primera muestra devuelve 0.
 */
export function indiceMuestra(muestras: readonly Muestra[], tiempo: number): number {
  let bajo = 0;
  let alto = muestras.length - 1;
  if (alto < 0 || tiempo < muestras[0]!.t) return 0;
  while (bajo < alto) {
    const medio = (bajo + alto + 1) >> 1;
    if (muestras[medio]!.t <= tiempo) bajo = medio;
    else alto = medio - 1;
  }
  return bajo;
}

const lineal = (a: number, b: number, f: number): number => a + (b - a) * f;

/** Como lineal, pero admite valores infinitos (el apogeo de una trayectoria abierta): toma el más cercano. */
const linealExtendida = (a: number, b: number, f: number): number =>
  Number.isFinite(a) && Number.isFinite(b) ? lineal(a, b, f) : f < 0.5 ? a : b;

/**
 * Interpolación lineal entre dos muestras consecutivas. Las magnitudes discretas
 * (etapa, motor) se toman de la anterior. Los ángulos no dan la vuelta entre dos
 * muestras: γ y el eje están en [−90°, 270°) y cambian poco en 0,05 s.
 */
export function interpolarMuestras(a: Muestra, b: Muestra, tiempo: number): Muestra {
  const intervalo = b.t - a.t;
  if (!(intervalo > 0)) return tiempo < b.t ? a : b;
  const f = (tiempo - a.t) / intervalo;
  return {
    t: tiempo,
    altitud: lineal(a.altitud, b.altitud, f),
    velocidad: lineal(a.velocidad, b.velocidad, f),
    aceleracion: lineal(a.aceleracion, b.aceleracion, f),
    x: lineal(a.x, b.x, f),
    y: lineal(a.y, b.y, f),
    alcance: lineal(a.alcance, b.alcance, f),
    velocidadVertical: lineal(a.velocidadVertical, b.velocidadVertical, f),
    velocidadHorizontal: lineal(a.velocidadHorizontal, b.velocidadHorizontal, f),
    anguloTrayectoria: lineal(a.anguloTrayectoria, b.anguloTrayectoria, f),
    anguloEmpuje: lineal(a.anguloEmpuje, b.anguloEmpuje, f),
    anguloAtaque: lineal(a.anguloAtaque, b.anguloAtaque, f),
    anguloTrayectoriaAire: lineal(a.anguloTrayectoriaAire, b.anguloTrayectoriaAire, f),
    velocidadAire: lineal(a.velocidadAire, b.velocidadAire, f),
    masa: lineal(a.masa, b.masa, f),
    empuje: lineal(a.empuje, b.empuje, f),
    // Con el límite de aceleración el caudal varía de forma continua; sus saltos tienen dos muestras.
    caudal: lineal(a.caudal, b.caudal, f),
    regulacion: lineal(a.regulacion, b.regulacion, f),
    isp: lineal(a.isp, b.isp, f),
    twr: lineal(a.twr, b.twr, f),
    etapa: a.etapa,
    motorEncendido: a.motorEncendido,
    densidad: lineal(a.densidad, b.densidad, f),
    presion: lineal(a.presion, b.presion, f),
    temperatura: lineal(a.temperatura, b.temperatura, f),
    velocidadSonido: lineal(a.velocidadSonido, b.velocidadSonido, f),
    presionDinamica: lineal(a.presionDinamica, b.presionDinamica, f),
    mach: lineal(a.mach, b.mach, f),
    arrastre: lineal(a.arrastre, b.arrastre, f),
    cd: lineal(a.cd, b.cd, f),
    gravedad: lineal(a.gravedad, b.gravedad, f),
    perdidas: {
      gravedad: lineal(a.perdidas.gravedad, b.perdidas.gravedad, f),
      arrastre: lineal(a.perdidas.arrastre, b.perdidas.arrastre, f),
      contrapresion: lineal(a.perdidas.contrapresion, b.perdidas.contrapresion, f),
      direccion: lineal(a.perdidas.direccion, b.perdidas.direccion, f),
    },
    deltaVIdeal: lineal(a.deltaVIdeal, b.deltaVIdeal, f),
    orbita: {
      energia: lineal(a.orbita.energia, b.orbita.energia, f),
      momentoAngular: lineal(a.orbita.momentoAngular, b.orbita.momentoAngular, f),
      semiejeMayor: linealExtendida(a.orbita.semiejeMayor, b.orbita.semiejeMayor, f),
      excentricidad: lineal(a.orbita.excentricidad, b.orbita.excentricidad, f),
      altitudPerigeo: lineal(a.orbita.altitudPerigeo, b.orbita.altitudPerigeo, f),
      altitudApogeo: linealExtendida(a.orbita.altitudApogeo, b.orbita.altitudApogeo, f),
    },
  };
}

/**
 * Estado en un instante cualquiera, interpolando entre las muestras que lo rodean.
 * Fuera del intervalo simulado devuelve la primera o la última muestra.
 */
export function estadoEn(muestras: readonly Muestra[], tiempo: number): Muestra {
  if (muestras.length === 0) throw new RangeError('No hay muestras');
  const i = indiceMuestra(muestras, tiempo);
  const a = muestras[i]!;
  const b = muestras[i + 1];
  if (!b || tiempo <= a.t) return a;
  return interpolarMuestras(a, b, tiempo);
}
