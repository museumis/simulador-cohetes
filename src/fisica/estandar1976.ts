import type { DatosAtmosfera } from './atmosfera';
import {
  G0,
  GAMMA_AIRE,
  MASA_MOLAR_AIRE_1976,
  PRESION_NIVEL_MAR,
  R_UNIVERSAL_1976,
  RADIO_GEOPOTENCIAL_1976,
  TEMPERATURA_NIVEL_MAR,
} from './constantes';

/** Constante específica del aire de la US Standard Atmosphere 1976 (J/(kg·K)): R* / M0. */
const R_1976 = R_UNIVERSAL_1976 / MASA_MOLAR_AIRE_1976;

/** Capa de la atmósfera: temperatura lineal en la altitud geopotencial. */
interface Capa {
  base: number;        // m', altitud geopotencial de la base
  temperatura: number; // K, temperatura molecular en la base
  gradiente: number;   // K/m', dT/dH
  presion: number;     // Pa, en la base
}

/**
 * Gradientes de las siete capas de la US Standard Atmosphere 1976 hasta 84 852 m' geopotenciales
 * (86 km geométricos), tabla 4 de NOAA-S/T 76-1562. La última fila es la continuación isoterma
 * por encima de 86 km, que no forma parte de la norma.
 */
const GRADIENTES: readonly (readonly [number, number])[] = [
  [0, -0.0065],
  [11_000, 0],
  [20_000, 0.001],
  [32_000, 0.0028],
  [47_000, 0],
  [51_000, -0.0028],
  [71_000, -0.002],
  [84_852, 0],
];

/** Constante hidrostática g0 / R (K/m'). */
const HIDROSTATICA = G0 / R_1976;

/**
 * Temperatura y presión en la base de cada capa, encadenando las fórmulas de la norma desde el
 * nivel del mar: así la presión es continua en cada cambio de capa.
 */
const CAPAS: readonly Capa[] = (() => {
  const capas: Capa[] = [];
  let temperatura = TEMPERATURA_NIVEL_MAR;
  let presion = PRESION_NIVEL_MAR;
  GRADIENTES.forEach(([base, gradiente], i) => {
    if (i > 0) {
      const anterior = capas[i - 1]!;
      const espesor = base - anterior.base;
      temperatura = anterior.temperatura + anterior.gradiente * espesor;
      presion = presionEnCapa(anterior, espesor);
    }
    capas.push({ base, temperatura, gradiente, presion });
  });
  return capas;
})();

/** Presión a `altura` m' sobre la base de una capa (ecuaciones 33a y 33b de la norma). */
function presionEnCapa(c: Capa, altura: number): number {
  if (c.gradiente === 0) return c.presion * Math.exp((-HIDROSTATICA * altura) / c.temperatura);
  const t = c.temperatura + c.gradiente * altura;
  return c.presion * Math.pow(c.temperatura / t, HIDROSTATICA / c.gradiente);
}

/**
 * Altitud geopotencial: H = r0 · Z / (r0 + Z), con r0 = 6 356 766 m.
 * @param altitud altitud geométrica Z (m)
 * @returns altitud geopotencial (m')
 */
export function altitudGeopotencial(altitud: number): number {
  return (RADIO_GEOPOTENCIAL_1976 * altitud) / (RADIO_GEOPOTENCIAL_1976 + altitud);
}

/**
 * Altitudes geométricas de los cambios de capa (m), donde la temperatura y la derivada de la
 * densidad cambian de pendiente: Z = r0 · H / (r0 − H).
 */
export const ALTITUDES_CAPAS_1976: readonly number[] = CAPAS.slice(1).map(
  (c) => (RADIO_GEOPOTENCIAL_1976 * c.base) / (RADIO_GEOPOTENCIAL_1976 - c.base),
);

/**
 * US Standard Atmosphere 1976 hasta 86 km y continuación isoterma (presión y densidad
 * exponenciales con la temperatura de 86 km) por encima. Escribe en `salida`.
 *
 * La temperatura es la temperatura molecular TM de la norma, con la que se calculan la densidad
 * (ρ = p / (R·TM)) y la velocidad del sonido (a = √(γ·R·TM)). Coincide con la temperatura cinética
 * hasta 80 km; entre 80 y 86 km la cinética es hasta un 0,04 % menor.
 * @param altitud altitud geométrica (m)
 */
export function datosAtmosfera1976(altitud: number, salida: DatosAtmosfera): DatosAtmosfera {
  const h = altitudGeopotencial(altitud);
  // Por debajo de 0 (raíz del impacto) sirve la primera capa.
  let i = CAPAS.length - 1;
  while (i > 0 && h < CAPAS[i]!.base) i--;
  const c = CAPAS[i]!;
  const altura = h - c.base;
  const temperatura = c.temperatura + c.gradiente * altura;
  const presion = presionEnCapa(c, altura);
  const densidad = presion / (R_1976 * temperatura);
  // dρ/dH = −ρ · (g0/R + L) / T y dH/dZ = (r0 / (r0 + Z))².
  const factor = RADIO_GEOPOTENCIAL_1976 / (RADIO_GEOPOTENCIAL_1976 + altitud);
  salida.densidad = densidad;
  salida.presion = presion;
  salida.derivadaDensidad = ((-densidad * (HIDROSTATICA + c.gradiente)) / temperatura) * factor * factor;
  salida.temperatura = temperatura;
  salida.velocidadSonido = Math.sqrt(GAMMA_AIRE * R_1976 * temperatura);
  return salida;
}
