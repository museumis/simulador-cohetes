import { describe, it } from 'vitest';
import { gravedad } from '../../src/fisica/gravedad';
import { esperarCercano } from '../ayudas';

describe('gravedad', () => {
  // μ / R² = 3,986004418e14 / 6 371 000² = 9,820250487064 (no g0 = 9,80665)
  it('vale μ/R² en la superficie', () => {
    esperarCercano(gravedad(0), 9.820250487064);
  });

  // Portado de GravedadServiceTest (5000 km, que en Java daba 3,0816 con g0 = 9,807 y R = 6378 km).
  // 3,986004418e14 / 11 371 000² = 3,082765263053
  it('a 5000 km de altitud', () => {
    esperarCercano(gravedad(5_000_000), 3.082765263053);
  });

  // 3,986004418e14 / 6 771 000² = 8,694250482824
  it('a 400 km de altitud', () => {
    esperarCercano(gravedad(400_000), 8.694250482824);
  });

  it('disminuye con el cuadrado de la distancia al centro', () => {
    esperarCercano(gravedad(6_371_000), gravedad(0) / 4);
  });
});
