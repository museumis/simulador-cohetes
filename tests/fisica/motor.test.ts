import { describe, it } from 'vitest';
import {
  caudalMasico,
  empujeSegunPresion,
  ispSegunPresion,
  tiempoCombustion,
  velocidadExpulsion,
  type Motor,
} from '../../src/fisica/motor';
import { esperarCercano } from '../ayudas';

const motor: Motor = { empujeVacio: 1_000_000, ispNivelMar: 270, ispVacio: 300 };

describe('motor', () => {
  // Error 1 del proyecto Java: u = g(h) · Isp. Debe ser siempre g0 · Isp.
  it('la velocidad de expulsión usa g0', () => {
    esperarCercano(velocidadExpulsion(300), 2941.995);
    esperarCercano(velocidadExpulsion(450), 4412.9925);
  });

  // ṁ = 1e6 / (300 · 9,80665) = 339,90540432598
  it('caudal másico', () => {
    esperarCercano(caudalMasico(motor), 339.90540432598);
  });

  it('Isp en vacío, al nivel del mar y a media presión', () => {
    esperarCercano(ispSegunPresion(motor, 0), 300);
    esperarCercano(ispSegunPresion(motor, 101_325), 270);
    esperarCercano(ispSegunPresion(motor, 101_325 / 2), 285);
  });

  // Con ṁ constante, F es proporcional al Isp: F(p) = empujeVacio · Isp(p) / ispVacio.
  it('empuje en vacío, al nivel del mar y a media presión', () => {
    esperarCercano(empujeSegunPresion(motor, 0), 1_000_000);
    esperarCercano(empujeSegunPresion(motor, 101_325), 900_000);
    esperarCercano(empujeSegunPresion(motor, 101_325 / 2), 950_000);
  });

  // t = 100 000 / 339,90540432598 = 294,1995 s
  it('tiempo de combustión', () => {
    esperarCercano(tiempoCombustion(motor, 100_000), 294.1995);
  });
});
