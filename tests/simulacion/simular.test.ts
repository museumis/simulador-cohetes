import { describe, expect, it } from 'vitest';
import { MU_TIERRA, RADIO_TIERRA } from '../../src/fisica/constantes';
import { gravedad } from '../../src/fisica/gravedad';
import { caudalMasico, empujeSegunPresion, tiempoCombustion } from '../../src/fisica/motor';
import { deltaVEtapas } from '../../src/fisica/tsiolkovski';
import { simular } from '../../src/simulacion/simular';
import type { Cohete, Evento, Muestra, ResultadoSimulacion, TipoEvento } from '../../src/simulacion/tipos';
import { esperarCercano } from '../ayudas';
import { COHETE_PRUEBA, conEtapa } from './cohetes';

function evento(r: ResultadoSimulacion, tipo: TipoEvento): Evento {
  const e = r.eventos.find((x) => x.tipo === tipo);
  if (!e) throw new Error(`Falta el evento ${tipo}`);
  return e;
}

const [e1, e2] = COHETE_PRUEBA.etapas;
const finCombustion1 = tiempoCombustion(e1, e1.masaPropelente);
const encendido2 = finCombustion1 + COHETE_PRUEBA.pausaSeparacion;
const finCombustion2 = encendido2 + tiempoCombustion(e2, e2.masaPropelente);

const nominal = simular(COHETE_PRUEBA);

/** Cohete que no despega al principio: F < m·g hasta que quema parte del propelente. */
const despegueTardio = conEtapa(0, { empujeVacio: 120_000 });

describe('secuencia de vuelo', () => {
  it('eventos en el orden esperado', () => {
    expect(nominal.despega).toBe(true);
    expect(nominal.eventos.map((e) => e.tipo)).toEqual([
      'despegue',
      'mach1',
      'maxQ',
      'finCombustion1',
      'separacion',
      'encendido2',
      'finCombustion2',
      'apogeo',
      'impacto',
    ]);
  });

  it('los fines de combustión y el encendido caen en su instante exacto', () => {
    expect(evento(nominal, 'despegue').t).toBe(0);
    esperarCercano(evento(nominal, 'finCombustion1').t, finCombustion1);
    esperarCercano(evento(nominal, 'separacion').t, finCombustion1);
    esperarCercano(evento(nominal, 'encendido2').t, encendido2);
    esperarCercano(evento(nominal, 'finCombustion2').t, finCombustion2);
  });

  it('el motor y la etapa acoplada cambian en cada evento', () => {
    const estado = (tipo: TipoEvento): Muestra => evento(nominal, tipo).estado;
    expect([estado('finCombustion1').etapa, estado('finCombustion1').motorEncendido]).toEqual([1, true]);
    expect([estado('separacion').etapa, estado('separacion').motorEncendido]).toEqual([2, false]);
    expect([estado('encendido2').etapa, estado('encendido2').motorEncendido]).toEqual([2, true]);
    expect(estado('apogeo').motorEncendido).toBe(false);
    expect(estado('separacion').empuje).toBe(0);
    esperarCercano(estado('encendido2').caudal, caudalMasico(e2));
  });

  it('los eventos localizados cumplen su condición', () => {
    esperarCercano(evento(nominal, 'mach1').estado.mach, 1, 1e-9);
    expect(Math.abs(evento(nominal, 'apogeo').estado.velocidad)).toBeLessThan(1e-6);
    expect(Math.abs(evento(nominal, 'impacto').estado.altitud)).toBeLessThan(1e-6);
    expect(evento(nominal, 'impacto').estado.velocidad).toBeLessThan(0);
  });

  it('Max-Q es el máximo de q en el ascenso', () => {
    const maxQ = evento(nominal, 'maxQ').estado.presionDinamica;
    const tApogeo = evento(nominal, 'apogeo').t;
    const enAscenso = nominal.muestras.filter((m) => m.t <= tApogeo);
    expect(Math.max(...enAscenso.map((m) => m.presionDinamica))).toBeLessThanOrEqual(maxQ);
    esperarCercano(nominal.resumen.maxQ, maxQ);
  });

  it('el resumen coincide con los eventos', () => {
    esperarCercano(nominal.resumen.apogeo, evento(nominal, 'apogeo').estado.altitud);
    // Cae desde más de 1000 km: el máximo de |v| está en la reentrada, no al fin de la combustión.
    esperarCercano(nominal.resumen.velocidadMaxima, Math.max(...nominal.muestras.map((m) => Math.abs(m.velocidad))));
    expect(nominal.resumen.velocidadMaxima).toBeGreaterThan(evento(nominal, 'finCombustion2').estado.velocidad);
    esperarCercano(nominal.resumen.deltaVIdeal, evento(nominal, 'impacto').estado.deltaVIdeal);
  });

  it('muestras a 20 Hz más una por evento, ordenadas', () => {
    const { muestras, eventos } = nominal;
    expect(muestras[0]!.t).toBe(0);
    expect(muestras[muestras.length - 1]).toBe(evento(nominal, 'impacto').estado);
    for (let i = 1; i < muestras.length; i++) {
      expect(muestras[i]!.t - muestras[i - 1]!.t).toBeGreaterThanOrEqual(0);
      expect(muestras[i]!.t - muestras[i - 1]!.t).toBeLessThanOrEqual(0.05 + 1e-9);
    }
    for (const e of eventos) expect(muestras).toContain(e.estado);
    const tImpacto = evento(nominal, 'impacto').t;
    // t = 0 y k·0,05 hasta el impacto, más los eventos (el despegue coincide con t = 0).
    expect(muestras.length).toBe(1 + Math.floor(tImpacto / 0.05) + eventos.length);
  });

  it('la deriva de energía es despreciable', () => {
    expect(nominal.diagnostico.derivaEnergia).toBeLessThan(1e-9);
    expect(nominal.diagnostico.pasos).toBeGreaterThan(evento(nominal, 'impacto').t / 0.01);
  });
});

describe('despegue', () => {
  it('el cohete espera en la plataforma hasta que F > m·g', () => {
    const r = simular(despegueTardio);
    const e = despegueTardio.etapas[0];
    const empuje = empujeSegunPresion(e, 101_325);
    const esperado = (11_700 - empuje / gravedad(0)) / caudalMasico(e);
    const despegue = evento(r, 'despegue');
    esperarCercano(despegue.t, esperado);
    esperarCercano(despegue.estado.twr, 1);
    for (const m of r.muestras.filter((x) => x.t < despegue.t)) {
      expect([m.altitud, m.velocidad, m.aceleracion]).toEqual([0, 0, 0]);
    }
    expect(r.muestras.find((x) => x.t > despegue.t)!.altitud).toBeGreaterThan(0);
  });

  // Validación 2: con empuje menor que el peso, h se mantiene en 0 durante toda la combustión.
  it('validación 2: sin despegue, h = 0 durante toda la combustión', () => {
    const cohete = conEtapa(0, { empujeVacio: 40_000 });
    const r = simular(cohete);
    expect(r.despega).toBe(false);
    expect(r.eventos.map((e) => e.tipo)).toEqual(['finCombustion1']);
    esperarCercano(r.eventos[0]!.t, tiempoCombustion(cohete.etapas[0], cohete.etapas[0].masaPropelente));
    for (const m of r.muestras) expect([m.altitud, m.velocidad]).toEqual([0, 0]);
    esperarCercano(r.muestras[r.muestras.length - 1]!.masa, 11_700 - 8_000);
  });
});

describe('validación (FISICA.md)', () => {
  // 1. Sin gravedad, arrastre ni contrapresión, la velocidad final es la Δv de Tsiolkovski.
  it('1: sin gravedad ni arrastre, v final = Δv de Tsiolkovski', () => {
    const r = simular(COHETE_PRUEBA, {
      gravedad: false,
      arrastre: false,
      contrapresion: false,
      duracionMaxima: finCombustion2 + 1,
    });
    const ideal = deltaVEtapas(COHETE_PRUEBA.etapas, COHETE_PRUEBA.masaCargaUtil).total;
    esperarCercano(evento(r, 'finCombustion2').estado.velocidad, ideal, 1e-6);
    esperarCercano(r.muestras[r.muestras.length - 1]!.velocidad, ideal, 1e-6);
    esperarCercano(r.resumen.deltaVIdeal, ideal, 1e-6);
  });

  // 3. Energía v²/2 − μ/(R+h) constante en vuelo balístico sin arrastre.
  it('3: energía constante en vuelo balístico sin arrastre', () => {
    const r = simular(COHETE_PRUEBA, { arrastre: false });
    const energia = (m: Muestra): number => (m.velocidad * m.velocidad) / 2 - MU_TIERRA / (RADIO_TIERRA + m.altitud);
    const inicial = energia(evento(r, 'finCombustion2').estado);
    const balisticas = r.muestras.filter((m) => m.t > finCombustion2);
    expect(balisticas.length).toBeGreaterThan(1000);
    for (const m of balisticas) esperarCercano(energia(m), inicial, 1e-6);
  });

  // 4. Caída libre desde poca altura sin empuje ni arrastre: h(t) ≈ h0 − ½·g(h0)·t².
  it('4: caída libre cerca del suelo', () => {
    const sinPropelente: Cohete = {
      ...conEtapa(0, { masaPropelente: 0 }, conEtapa(1, { masaPropelente: 0 })),
      pausaSeparacion: 0,
    };
    const h0 = 500;
    const r = simular(sinPropelente, { altitudInicial: h0, arrastre: false });
    const g = gravedad(h0);
    // En 500 m de caída g varía un 1,6·10⁻⁴: la aproximación vale con esa tolerancia.
    for (const m of r.muestras.filter((x) => x.t > 1)) {
      esperarCercano(h0 - m.altitud, 0.5 * g * m.t * m.t, 2e-4);
    }
    esperarCercano(evento(r, 'impacto').t, Math.sqrt((2 * h0) / g), 1e-4);
    expect(r.eventos.map((e) => e.tipo)).toEqual([
      'finCombustion1',
      'separacion',
      'encendido2',
      'finCombustion2',
      'impacto',
    ]);
  });

  // 5. La masa nunca es negativa y en la separación baja exactamente masaSeca1.
  it('5: masa positiva y salto exacto en la separación', () => {
    for (const m of nominal.muestras) expect(m.masa).toBeGreaterThan(0);
    const antes = evento(nominal, 'finCombustion1').estado.masa;
    const despues = evento(nominal, 'separacion').estado.masa;
    esperarCercano(antes, 11_700 - 8_000);
    esperarCercano(antes - despues, e1.masaSeca);
    esperarCercano(evento(nominal, 'encendido2').estado.masa, despues);
    esperarCercano(evento(nominal, 'finCombustion2').estado.masa, e2.masaSeca + COHETE_PRUEBA.masaCargaUtil);
    expect(evento(nominal, 'impacto').estado.masa).toBe(evento(nominal, 'finCombustion2').estado.masa);
  });

  // 6. RK4 es de orden 4: con dt/2 el error del apogeo baja unas 16 veces.
  //    Los errores se estiman con las diferencias entre dt, dt/2 y dt/4.
  it('6: convergencia de orden 4 del apogeo', () => {
    const [a1, a2, a3] = [0.8, 0.4, 0.2].map((dt) => simular(COHETE_PRUEBA, { dt }).resumen.apogeo) as [number, number, number];
    const cociente = (a1 - a2) / (a2 - a3);
    expect(cociente).toBeGreaterThan(14);
    expect(cociente).toBeLessThan(18);
  });

  // 7. |v| − |v0| = Δv ideal − pérdidas, en todo el ascenso, también en la plataforma.
  it('7: cierre del presupuesto de Δv en el ascenso', () => {
    for (const r of [nominal, simular(despegueTardio)]) {
      const tApogeo = evento(r, 'apogeo').t;
      for (const m of r.muestras.filter((x) => x.t <= tApogeo)) {
        const p = m.perdidas;
        const balance = m.deltaVIdeal - p.gravedad - p.arrastre - p.contrapresion - p.direccion;
        expect(Math.abs(Math.abs(m.velocidad) - balance)).toBeLessThanOrEqual(1e-6 * Math.max(m.deltaVIdeal, 1));
      }
    }
  });

  it('las pérdidas son positivas y el Δv ideal coincide con Tsiolkovski', () => {
    const p = evento(nominal, 'apogeo').estado.perdidas;
    expect(p.gravedad).toBeGreaterThan(0);
    expect(p.arrastre).toBeGreaterThan(0);
    expect(p.contrapresion).toBeGreaterThan(0);
    expect(p.direccion).toBe(0);
    const ideal = deltaVEtapas(COHETE_PRUEBA.etapas, COHETE_PRUEBA.masaCargaUtil).total;
    esperarCercano(nominal.resumen.deltaVIdeal, ideal, 1e-9);
  });
});

describe('límite de duración', () => {
  it('se detiene en duracionMaxima sin los eventos posteriores', () => {
    const r = simular(COHETE_PRUEBA, { duracionMaxima: 100.01 });
    expect(r.eventos.map((e) => e.tipo)).not.toContain('finCombustion2');
    esperarCercano(r.muestras[r.muestras.length - 1]!.t, 100.01);
  });
});
