import { describe, expect, it } from 'vitest';
import { OPCIONES_POR_DEFECTO, simular } from '../../src/simulacion/simular';
import { ErrorEntrada, validarCohete, validarOpciones } from '../../src/simulacion/validacion';
import { COHETE_PRUEBA, conEtapa } from './cohetes';

describe('validación de la entrada', () => {
  it('el cohete de prueba y las opciones por defecto son válidos', () => {
    expect(validarCohete(COHETE_PRUEBA)).toEqual([]);
    expect(validarOpciones(OPCIONES_POR_DEFECTO)).toEqual([]);
  });

  it('indica campo, valor y rango admitido', () => {
    const errores = validarCohete(conEtapa(0, { masaSeca: -5 }));
    expect(errores).toEqual([
      {
        campo: 'etapas[0].masaSeca',
        valor: -5,
        rango: '(0, ∞) kg',
        mensaje: 'etapas[0].masaSeca = -5 kg: fuera del rango admitido (0, ∞) kg',
      },
    ]);
  });

  it('el Isp al nivel del mar no puede superar el de vacío', () => {
    const [error] = validarCohete(conEtapa(1, { ispNivelMar: 320 }));
    expect(error?.campo).toBe('etapas[1].ispNivelMar');
    expect(error?.rango).toBe('(0, 300] s');
    expect(error?.mensaje).toContain('no puede superar ispVacio');
  });

  it('rechaza NaN e infinitos aunque el rango no tenga límite superior', () => {
    const errores = validarCohete({ ...conEtapa(0, { empujeVacio: Number.NaN }), masaCargaUtil: Infinity });
    expect(errores.map((e) => e.campo)).toEqual(['etapas[0].empujeVacio', 'masaCargaUtil']);
  });

  it('admite propelente, carga útil, pausa y cd nulos', () => {
    const cohete = { ...conEtapa(1, { masaPropelente: 0, cd: 0 }), masaCargaUtil: 0, pausaSeparacion: 0 };
    expect(validarCohete(cohete)).toEqual([]);
  });

  it('comprueba dt, duración y estado inicial', () => {
    const campos = (o: Partial<typeof OPCIONES_POR_DEFECTO>): string[] =>
      validarOpciones({ ...OPCIONES_POR_DEFECTO, ...o }).map((e) => e.campo);
    expect(campos({ dt: 0 })).toEqual(['dt']);
    expect(campos({ dt: 2 })).toEqual(['dt']);
    expect(campos({ duracionMaxima: 10_000 })).toEqual(['duracionMaxima']);
    expect(campos({ altitudInicial: -1 })).toEqual(['altitudInicial']);
    expect(campos({ velocidadInicial: -1 })).toEqual(['velocidadInicial']);
    expect(campos({ altitudInicial: 100, velocidadInicial: -1 })).toEqual([]);
    expect(campos({ metodo: 'euler' as never })).toEqual(['metodo']);
  });

  it('simular lanza ErrorEntrada con todos los errores juntos', () => {
    let error: unknown;
    try {
      simular(conEtapa(0, { diametro: 0, cd: -1 }), { dt: 0 });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorEntrada);
    expect((error as ErrorEntrada).errores.map((e) => e.campo)).toEqual(['etapas[0].diametro', 'etapas[0].cd', 'dt']);
    expect((error as ErrorEntrada).message).toContain('etapas[0].diametro = 0 m');
  });

  it('tablas: puntos crecientes y dentro de rango, con el punto indicado', () => {
    expect(validarCohete(conEtapa(0, { tablaCd: [[0, 0.3], [1.2, 0.5]], regulacion: [[0, 1], [40, 0.7]] }))).toEqual([]);
    const cd = validarCohete(conEtapa(0, { tablaCd: [[0, 0.3], [0, 0.5], [2, -1]] }));
    expect(cd.map((e) => e.campo)).toEqual(['etapas[0].tablaCd', 'etapas[0].tablaCd']);
    expect(cd[0]!.mensaje).toContain('punto 2: Mach debe ser mayor que en el punto anterior');
    expect(cd[1]!.mensaje).toContain('punto 3');
    const nivel = validarCohete(conEtapa(1, { regulacion: [[0, 1.2]] }));
    expect(nivel[0]!.campo).toBe('etapas[1].regulacion');
    expect(validarCohete(conEtapa(1, { regulacion: [[Number.NaN, 0.5]] }))).toHaveLength(1);
  });

  it('lugar de lanzamiento, límite de aceleración y opciones nuevas', () => {
    const errores = validarCohete({ ...COHETE_PRUEBA, latitudLanzamiento: 91, azimutLanzamiento: 360, aceleracionMaxima: -1 });
    expect(errores.map((e) => e.campo)).toEqual(['aceleracionMaxima', 'latitudLanzamiento', 'azimutLanzamiento']);
    const opciones = validarOpciones({ ...OPCIONES_POR_DEFECTO, atmosfera: 'otra' as never, tolerancia: 1 });
    expect(opciones.map((e) => e.campo)).toEqual(['atmosfera', 'tolerancia']);
  });
});
