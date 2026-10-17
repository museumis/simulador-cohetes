import { describe, it } from 'vitest';
import { gravedad } from '../../src/fisica/gravedad';
import { esperarCercano } from '../ayudas';

describe('gravedad', () => {
  it('vale g0 en la superficie', () => {
    esperarCercano(gravedad(0), 9.80665);
  });

  // Portado de GravedadServiceTest (5000 km, que en Java daba 3,0816 con g0 = 9,807 y R = 6378 km).
  // 9,80665 · (6371 / 11 371)² = 3,0784958089145
  it('a 5000 km de altitud', () => {
    esperarCercano(gravedad(5_000_000), 3.0784958089145);
  });

  // 9,80665 · (6371 / 6771)² = 8,6822094415715
  it('a 400 km de altitud', () => {
    esperarCercano(gravedad(400_000), 8.6822094415715);
  });

  it('disminuye con el cuadrado de la distancia al centro', () => {
    esperarCercano(gravedad(6_371_000), 9.80665 / 4);
  });
});
