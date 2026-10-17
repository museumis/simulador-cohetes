import { describe, expect, it } from 'vitest';
import { MU_TIERRA, RADIO_TIERRA } from '../../src/fisica/constantes';
import { ALTITUD_PERIGEO_ORBITA, elementosOrbitales, margenOrbita, periodoOrbital } from '../../src/fisica/orbita';
import { esperarCercano } from '../ayudas';

describe('elementos orbitales', () => {
  it('órbita circular: e = 0, a = r y perigeo = apogeo = h', () => {
    const r = RADIO_TIERRA + 400_000;
    const v = Math.sqrt(MU_TIERRA / r);
    // Sobre la plataforma, moviéndose hacia +x: la horizontal local es (1, 0).
    const e = elementosOrbitales(0, r, v, 0);
    expect(e.excentricidad).toBeLessThan(1e-7);
    esperarCercano(e.semiejeMayor, r);
    esperarCercano(e.energia, -MU_TIERRA / (2 * r));
    esperarCercano(e.momentoAngular, r * v);
    esperarCercano(e.altitudPerigeo, 400_000, 1e-6);
    esperarCercano(e.altitudApogeo, 400_000, 1e-6);
  });

  it('órbita elíptica desde el perigeo: recupera rp y ra en cualquier punto', () => {
    const rp = RADIO_TIERRA + 200_000;
    const ra = RADIO_TIERRA + 2_000_000;
    const a = (rp + ra) / 2;
    const vp = Math.sqrt(MU_TIERRA * (2 / rp - 1 / a));
    // El mismo estado girado 40°: los elementos no dependen de la orientación.
    const giro = (40 * Math.PI) / 180;
    const [c, s] = [Math.cos(giro), Math.sin(giro)];
    const e = elementosOrbitales(rp * s, rp * c, vp * c, -vp * s);
    esperarCercano(e.semiejeMayor, a, 1e-12);
    esperarCercano(e.excentricidad, (ra - rp) / (ra + rp), 1e-10);
    esperarCercano(e.altitudPerigeo, 200_000, 1e-8);
    esperarCercano(e.altitudApogeo, 2_000_000, 1e-9);
  });

  it('trayectoria hiperbólica: a < 0, e > 1 y sin apogeo', () => {
    const r = RADIO_TIERRA + 300_000;
    const e = elementosOrbitales(0, r, 1.2 * Math.sqrt((2 * MU_TIERRA) / r), 0);
    expect(e.energia).toBeGreaterThan(0);
    expect(e.semiejeMayor).toBeLessThan(0);
    expect(e.excentricidad).toBeGreaterThan(1);
    expect(e.altitudApogeo).toBe(Infinity);
    esperarCercano(e.altitudPerigeo, 300_000, 1e-9);
  });

  it('trayectoria radial (1D): h = 0, e = 1 y el perigeo en el centro de la Tierra', () => {
    const e = elementosOrbitales(0, RADIO_TIERRA + 100_000, 0, 2_000);
    expect(e.momentoAngular).toBe(0);
    expect(e.excentricidad).toBe(1);
    expect(e.altitudPerigeo).toBe(-RADIO_TIERRA);
  });

  it('periodo de una órbita baja: unos 92 minutos a 400 km', () => {
    const a = RADIO_TIERRA + 400_000;
    esperarCercano(periodoOrbital(a), 2 * Math.PI * Math.sqrt(a ** 3 / MU_TIERRA));
    expect(periodoOrbital(a) / 60).toBeCloseTo(92.4, 1);
  });

  it('margen hasta la órbita: positivo solo con ε < 0 y perigeo sobre 100 km', () => {
    const r = RADIO_TIERRA + 300_000;
    const circular = Math.sqrt(MU_TIERRA / r);
    expect(margenOrbita(elementosOrbitales(0, r, circular, 0))).toBeGreaterThan(0);
    // Demasiado lenta: el perigeo queda bajo la superficie.
    expect(margenOrbita(elementosOrbitales(0, r, 0.8 * circular, 0))).toBeLessThan(0);
    // Más rápida que la de escape: ε > 0.
    expect(margenOrbita(elementosOrbitales(0, r, 1.5 * circular, 0))).toBeLessThan(0);
    // Justo en el límite del perigeo.
    const rp = RADIO_TIERRA + ALTITUD_PERIGEO_ORBITA;
    const vp = Math.sqrt(MU_TIERRA * (2 / rp - 2 / (rp + r)));
    expect(Math.abs(margenOrbita(elementosOrbitales(0, rp, vp, 0)))).toBeLessThan(1e-3);
  });
});
