import { describe, expect, it } from 'vitest';
import {
  crearDatosAtmosfera,
  datosAtmosfera,
  densidad,
  derivadaDensidad,
  numeroMach,
  presion,
  temperatura,
  velocidadSonido,
} from '../../src/fisica/atmosfera';
import { esperarCercano } from '../ayudas';

describe('atmósfera', () => {
  it('valores al nivel del mar', () => {
    esperarCercano(densidad(0), 1.225);
    esperarCercano(presion(0), 101_325);
    esperarCercano(temperatura(0), 288.15);
  });

  // A una altura de escala, ρ y p se dividen entre e: 1,225 / e y 101 325 / e.
  it('densidad y presión a una altura de escala (8500 m)', () => {
    esperarCercano(densidad(8_500), 0.4506523154350169);
    esperarCercano(presion(8_500), 37275.3843766964);
  });

  it('temperatura lineal en la troposfera y constante por encima, sin salto en 11 km', () => {
    esperarCercano(temperatura(5_000), 255.65);
    esperarCercano(temperatura(11_000 - 1e-9), 216.65);
    esperarCercano(temperatura(11_000), 216.65);
    esperarCercano(temperatura(30_000), 216.65);
  });

  // a = √(1,4 · 287,05 · T)
  it('velocidad del sonido', () => {
    esperarCercano(velocidadSonido(0), 340.29228686527705);
    esperarCercano(velocidadSonido(5_000), 320.52779208673934);
    esperarCercano(velocidadSonido(20_000), 295.06801842964956);
  });

  it('número de Mach con el módulo de la velocidad', () => {
    esperarCercano(numeroMach(340.29228686527705, 0), 1);
    esperarCercano(numeroMach(-590.1360368592991, 20_000), 2);
  });

  it('dρ/dh coincide con la diferencia finita centrada', () => {
    for (const h of [0, 5_000, 40_000]) {
      const paso = 1;
      const finita = (densidad(h + paso) - densidad(h - paso)) / (2 * paso);
      esperarCercano(derivadaDensidad(h), finita, 1e-7);
    }
  });

  it('datosAtmosfera coincide con las funciones sueltas', () => {
    const salida = crearDatosAtmosfera();
    for (const h of [0, 12_345, 80_000]) {
      const d = datosAtmosfera(h, salida);
      expect(d).toBe(salida);
      esperarCercano(d.densidad, densidad(h));
      esperarCercano(d.presion, presion(h));
      esperarCercano(d.derivadaDensidad, derivadaDensidad(h));
      esperarCercano(d.temperatura, temperatura(h));
      esperarCercano(d.velocidadSonido, velocidadSonido(h));
    }
  });
});
