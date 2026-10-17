import { describe, expect, it } from 'vitest';
import {
  ALTITUD_TROPOPAUSA,
  G0,
  GRADIENTE_TERMICO,
  RADIO_TIERRA,
  TEMPERATURA_NIVEL_MAR,
  TEMPERATURA_TROPOPAUSA,
} from '../../src/fisica/constantes';
import { esperarCercano } from '../ayudas';

describe('constantes', () => {
  // Error 8 del proyecto Java: g0 = 9,807 y radio ecuatorial en km.
  it('usa g0 estándar y el radio medio en metros', () => {
    expect(G0).toBe(9.80665);
    expect(RADIO_TIERRA).toBe(6_371_000);
  });

  it('la temperatura de la tropopausa es coherente con el gradiente', () => {
    esperarCercano(TEMPERATURA_NIVEL_MAR - GRADIENTE_TERMICO * ALTITUD_TROPOPAUSA, TEMPERATURA_TROPOPAUSA);
  });
});
