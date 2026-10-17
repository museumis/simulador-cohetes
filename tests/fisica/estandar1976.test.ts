import { describe, expect, it } from 'vitest';
import { crearDatosAtmosfera, type DatosAtmosfera } from '../../src/fisica/atmosfera';
import { altitudGeopotencial, datosAtmosfera1976 } from '../../src/fisica/estandar1976';
import { esperarCercano } from '../ayudas';

const datos = (h: number): DatosAtmosfera => datosAtmosfera1976(h, crearDatosAtmosfera());

/**
 * Tabla I de la US Standard Atmosphere 1976 (NOAA-S/T 76-1562), en altitud geométrica:
 * [Z (m), T (K), p (Pa), ρ (kg/m³)], con cinco cifras significativas.
 */
const TABLA_1976: readonly (readonly [number, number, number, number])[] = [
  [0, 288.15, 101_325, 1.225],
  [5_000, 255.676, 54_048, 0.73643],
  [10_000, 223.252, 26_500, 0.41351],
  [20_000, 216.65, 5_529.3, 0.08891],
  [30_000, 226.509, 1_197.0, 0.018410],
  [40_000, 250.35, 287.14, 3.9957e-3],
  [50_000, 270.65, 79.779, 1.0269e-3],
  [60_000, 247.021, 21.958, 3.0968e-4],
  [70_000, 219.585, 5.2209, 8.2829e-5],
  [80_000, 198.639, 1.0524, 1.8458e-5],
  [86_000, 186.87, 0.37338, 6.958e-6],
];

describe('US Standard Atmosphere 1976', () => {
  it('coincide con la tabla publicada hasta 86 km', () => {
    for (const [z, t, p, rho] of TABLA_1976) {
      const d = datos(z);
      // A 86 km la tabla da la temperatura cinética, un 0,04 % menor que la molecular.
      esperarCercano(d.temperatura, t, 5e-4);
      esperarCercano(d.presion, p, 2e-4);
      esperarCercano(d.densidad, rho, 5e-4);
    }
  });

  // Tabla I: a = 340,29 m/s al nivel del mar y 295,07 m/s en la estratosfera isoterma.
  it('velocidad del sonido', () => {
    esperarCercano(datos(0).velocidadSonido, 340.29, 2e-5);
    esperarCercano(datos(15_000).velocidadSonido, 295.07, 2e-5);
  });

  it('altitud geopotencial: 86 km geométricos son 84 852 m′', () => {
    esperarCercano(altitudGeopotencial(86_000), 84_852, 1e-5);
  });

  it('presión y densidad continuas en los cambios de capa', () => {
    for (const z of [11_019.1, 20_063.1, 32_161.9, 47_350.1, 51_412.5, 71_802]) {
      const abajo = datos(z * (1 - 1e-12));
      const arriba = datos(z * (1 + 1e-12));
      esperarCercano(arriba.presion, abajo.presion, 1e-9);
      esperarCercano(arriba.densidad, abajo.densidad, 1e-9);
    }
  });

  it('continuación isoterma por encima de 86 km', () => {
    const d86 = datos(86_000);
    const d100 = datos(100_000);
    expect(d100.temperatura).toBe(d86.temperatura);
    // Tabla I: ρ(100 km) = 5,604e-7; la continuación isoterma la reproduce con un 5 % de error.
    esperarCercano(d100.densidad, 5.604e-7, 0.05);
    expect(datos(300_000).densidad).toBeLessThan(1e-15);
  });

  it('dρ/dh coincide con la diferencia finita centrada', () => {
    for (const z of [1_000, 15_000, 25_000, 40_000, 60_000, 75_000, 120_000]) {
      const paso = 0.5;
      const finita = (datos(z + paso).densidad - datos(z - paso).densidad) / (2 * paso);
      esperarCercano(datos(z).derivadaDensidad, finita, 1e-7);
    }
  });
});
