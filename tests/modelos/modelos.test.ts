import { describe, expect, it } from 'vitest';
import { calcularDerivados } from '../../src/analisis/derivados';
import { copiarCohete, MODELOS } from '../../src/modelos';
import { OPCIONES_ALTA_FIDELIDAD, simular } from '../../src/simulacion/simular';
import { validarCohete } from '../../src/simulacion/validacion';

describe('modelos predefinidos', () => {
  it('identificadores únicos', () => {
    expect(new Set(MODELOS.map((m) => m.id)).size).toBe(MODELOS.length);
  });

  describe.each(MODELOS.map((m) => [m.cohete.nombre, m.cohete] as const))('%s', (_, cohete) => {
    it('datos válidos', () => {
      expect(validarCohete(cohete)).toEqual([]);
    });

    it('despega con TWR > 1 y completa la secuencia de vuelo', () => {
      expect(calcularDerivados(cohete).etapas[0].twrInicial).toBeGreaterThan(1);
      const r = simular(cohete);
      expect(r.despega).toBe(true);
      expect(r.eventos.map((e) => e.tipo)).toContain('finCombustion2');
      expect(r.eventos.at(-1)!.tipo).toBe('impacto');
    });
  });

  // La masa publicada corresponde a una misión con recuperación; el modelo lleva la carga sin recuperación.
  it('Falcon 9: masa al despegue cercana a la publicada (549 t)', () => {
    const falcon = MODELOS.find((m) => m.id === 'falcon9')!.cohete;
    const masa = calcularDerivados(falcon).masaDespegue;
    expect(Math.abs(masa - 549_000) / 549_000).toBeLessThan(0.04);
  });

  it('Electron: masa al despegue cercana a la publicada (13,0 t)', () => {
    const electron = MODELOS.find((m) => m.id === 'electron')!.cohete;
    const masa = calcularDerivados(electron).masaDespegue;
    expect(Math.abs(masa - 13_000) / 13_000).toBeLessThan(0.03);
  });

  it('copiarCohete no comparte las etapas con el original', () => {
    const original = MODELOS[0]!.cohete;
    const copia = copiarCohete(original);
    copia.etapas[0].masaSeca = 1;
    expect(original.etapas[0].masaSeca).not.toBe(1);
    const falcon = MODELOS.find((m) => m.id === 'falcon9')!.cohete;
    const copiaFalcon = copiarCohete(falcon);
    expect(copiaFalcon.etapas[0].tablaCd).toEqual(falcon.etapas[0].tablaCd);
    expect(copiaFalcon.etapas[0].tablaCd).not.toBe(falcon.etapas[0].tablaCd);
  });

  it.each(['falcon9', 'electron'])('%s llega a órbita con la configuración de alta fidelidad', (id) => {
    const cohete = MODELOS.find((m) => m.id === id)!.cohete;
    const r = simular(cohete, OPCIONES_ALTA_FIDELIDAD);
    expect(r.eventos.map((e) => e.tipo)).toContain('orbita');
    const fin = r.eventos.find((e) => e.tipo === 'finCombustion2')!.estado;
    expect(fin.orbita.altitudPerigeo).toBeGreaterThan(200_000);
    expect(fin.orbita.excentricidad).toBeLessThan(0.05);
  });
});
