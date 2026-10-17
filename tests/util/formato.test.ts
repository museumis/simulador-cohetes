import { describe, expect, it } from 'vitest';
import { formatearDuracion, formatearFijo, formatearNumero, partirPorPunto, SEPARADOR_MILES as S, SIN_VALOR } from '../../src/util/formato';

describe('formatearNumero', () => {
  it('redondea a las cifras significativas pedidas', () => {
    expect(formatearNumero(3.14159, 4)).toBe('3.142');
    expect(formatearNumero(31.8249, 4)).toBe('31.82');
    expect(formatearNumero(339.81, 4)).toBe('339.8');
    expect(formatearNumero(-0.25, 2)).toBe('-0.25');
  });

  it('agrupa los miles con un espacio estrecho', () => {
    expect(formatearNumero(48_213.71, 6)).toBe(`48${S}213.7`);
    expect(formatearNumero(1_512.04, 6)).toBe(`1${S}512.04`);
    expect(formatearNumero(934_100, 4)).toBe(`934${S}100`);
    expect(formatearNumero(-1_234_567, 7)).toBe(`-1${S}234${S}567`);
  });

  it('usa notación científica fuera de [1e-2, 1e7)', () => {
    expect(formatearNumero(1.3814e-3, 4)).toBe('1.381e-3');
    expect(formatearNumero(9.8e-4, 3)).toBe('9.80e-4');
    expect(formatearNumero(0.0123, 3)).toBe('0.0123');
    expect(formatearNumero(8.227e6, 4)).toBe(`8${S}227${S}000`);
    expect(formatearNumero(1.2345e7, 4)).toBe('1.235e7');
  });

  it('cambia de década si el redondeo la sube', () => {
    expect(formatearNumero(9.9996, 4)).toBe('10.00');
    expect(formatearNumero(9_999_999, 4)).toBe('1.000e7');
  });

  it('cero y valores no finitos', () => {
    expect(formatearNumero(0, 4)).toBe('0.000');
    expect(formatearNumero(Number.NaN)).toBe(SIN_VALOR);
    expect(formatearNumero(Infinity)).toBe(SIN_VALOR);
  });
});

describe('formatearFijo', () => {
  it('decimales fijos con miles agrupados', () => {
    expect(formatearFijo(142.35, 3)).toBe('142.350');
    expect(formatearFijo(1_234.5, 1)).toBe(`1${S}234.5`);
    expect(formatearFijo(Number.NaN, 3)).toBe(SIN_VALOR);
  });
});

describe('formatearDuracion', () => {
  it('usa solo las unidades necesarias', () => {
    expect(formatearDuracion(5.1234)).toBe('5.123 s');
    expect(formatearDuracion(125.5)).toBe('2 min 05.500 s');
    expect(formatearDuracion(3725.123)).toBe('1 h 02 min 05.123 s');
  });

  it('redondea antes de repartir en unidades', () => {
    expect(formatearDuracion(59.9996)).toBe('1 min 00.000 s');
    expect(formatearDuracion(3599.9999)).toBe('1 h 00 min 00.000 s');
  });

  it('admite signo y valores no finitos', () => {
    expect(formatearDuracion(-65)).toBe('-1 min 05.000 s');
    expect(formatearDuracion(Number.NaN)).toBe(SIN_VALOR);
  });
});

describe('partirPorPunto', () => {
  it('separa por el punto decimal o por el exponente', () => {
    expect(partirPorPunto('48 213.7')).toEqual(['48 213', '.7']);
    expect(partirPorPunto('1.381e-3')).toEqual(['1', '.381e-3']);
    expect(partirPorPunto('1e-4')).toEqual(['1', 'e-4']);
    expect(partirPorPunto('250')).toEqual(['250', '']);
  });
});
