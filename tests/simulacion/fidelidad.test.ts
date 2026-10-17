import { describe, expect, it } from 'vitest';
import { crearDatosAtmosfera } from '../../src/fisica/atmosfera';
import { G0, OMEGA_TIERRA, RADIO_TIERRA } from '../../src/fisica/constantes';
import { datosAtmosfera1976 } from '../../src/fisica/estandar1976';
import { caudalMasico, tiempoCombustionRegulada, velocidadExpulsion } from '../../src/fisica/motor';
import { periodoOrbital } from '../../src/fisica/orbita';
import { interpolarTabla } from '../../src/fisica/tabla';
import { deltaVEtapas } from '../../src/fisica/tsiolkovski';
import { FALCON_9 } from '../../src/modelos/falcon9';
import { OPCIONES_ALTA_FIDELIDAD, simular } from '../../src/simulacion/simular';
import type { Cohete, Evento, Muestra, ResultadoSimulacion, TipoEvento } from '../../src/simulacion/tipos';
import { esperarCercano } from '../ayudas';
import { COHETE_PRUEBA, conEtapa } from './cohetes';

function evento(r: ResultadoSimulacion, tipo: TipoEvento): Evento {
  const e = r.eventos.find((x) => x.tipo === tipo);
  if (!e) throw new Error(`Falta el evento ${tipo}`);
  return e;
}

/** Identidad del presupuesto de Δv (validación 7) en cada muestra. */
function esperarCierre(muestras: readonly Muestra[], tolerancia = 1e-6): void {
  const v0 = muestras[0]!.velocidad;
  for (const m of muestras) {
    const p = m.perdidas;
    const balance = m.deltaVIdeal - p.gravedad - p.arrastre - p.contrapresion - p.direccion;
    expect(Math.abs(Math.abs(m.velocidad) - Math.abs(v0) - balance)).toBeLessThanOrEqual(tolerancia * Math.max(m.deltaVIdeal, 1));
  }
}

const GRADO = Math.PI / 180;

describe('US Standard Atmosphere 1976 en la simulación', () => {
  it('las muestras llevan la atmósfera del modelo elegido', () => {
    const r = simular(COHETE_PRUEBA, { atmosfera: 'estandar1976' });
    const salida = crearDatosAtmosfera();
    for (const m of r.muestras.filter((_, i) => i % 500 === 0)) {
      const d = datosAtmosfera1976(m.altitud, salida);
      esperarCercano(m.densidad, d.densidad);
      esperarCercano(m.presion, d.presion);
      esperarCercano(m.temperatura, d.temperatura);
      esperarCercano(m.mach, Math.abs(m.velocidad) / d.velocidadSonido);
    }
    expect(r.diagnostico.atmosfera).toBe('estandar1976');
    // Validación 7 con la atmósfera estándar: el cierre no depende del modelo atmosférico.
    esperarCierre(r.muestras.filter((m) => m.t <= evento(r, 'apogeo').t));
  });
});

describe('Cd según el Mach', () => {
  it('una tabla constante da el mismo vuelo que el Cd constante', () => {
    const constante = simular(COHETE_PRUEBA);
    const tabla = simular({
      ...COHETE_PRUEBA,
      etapas: [
        { ...COHETE_PRUEBA.etapas[0], tablaCd: [[0, 0.4], [3, 0.4]] },
        { ...COHETE_PRUEBA.etapas[1], tablaCd: [[0, 0.35]] },
      ],
    });
    esperarCercano(tabla.resumen.apogeo, constante.resumen.apogeo, 1e-12);
  });

  it('el Cd aplicado es la interpolación de la tabla en el Mach de cada muestra', () => {
    const tablaCd = FALCON_9.etapas[0].tablaCd;
    const r = simular(FALCON_9, { modelo: '2D', atmosfera: 'estandar1976' });
    const enEtapa1 = r.muestras.filter((m) => m.etapa === 1 && m.t > 0);
    for (const m of enEtapa1) esperarCercano(m.cd, interpolarTabla(tablaCd, m.mach), 1e-6);
    // La tabla tiene su máximo transónico, 0,495, en Mach 1,1.
    const maximo = Math.max(...enEtapa1.map((m) => m.cd));
    expect(maximo).toBeLessThanOrEqual(0.495);
    expect(maximo).toBeGreaterThan(0.49);
  });

  // Sin terminar el paso en los nodos (y en la tropopausa, donde el Mach tiene una esquina) el
  // cociente es ≈ 2. Con la esquina tan marcada de esta tabla aún no es asintótico: ≈ 22 (orden 4,5).
  it('el paso termina justo en cada nodo de la tabla: se conserva el orden 4', () => {
    const cohete = conEtapa(0, { tablaCd: [[0, 0.3], [0.8, 0.32], [1.1, 0.6], [2, 0.4], [4, 0.3]] });
    const [a1, a2, a3] = [0.4, 0.2, 0.1].map((dt) => simular(cohete, { dt }).resumen.apogeo) as [number, number, number];
    const cociente = (a1 - a2) / (a2 - a3);
    expect(cociente).toBeGreaterThan(12);
    expect(cociente).toBeLessThan(25);
  });
});

describe('rotación terrestre', () => {
  // Velocidad del suelo en Cabo Cañaveral (28,5° N): ω·R·cos φ ≈ 408 m/s, el valor que se cita
  // habitualmente como ayuda de la rotación a un lanzamiento hacia el este.
  it('velocidad inicial ω·R·cos(latitud)·sen(azimut)', () => {
    const cohete: Cohete = { ...FALCON_9, latitudLanzamiento: 28.5, azimutLanzamiento: 90 };
    const r = simular(cohete, { modelo: '2D', rotacion: true });
    const v0 = r.muestras[0]!;
    esperarCercano(v0.velocidad, OMEGA_TIERRA * RADIO_TIERRA * Math.cos(28.5 * GRADO), 1e-12);
    esperarCercano(v0.velocidad, 408.3, 1e-3);
    expect(v0.velocidadAire).toBe(0);
    // Hacia el oeste la rotación resta.
    const oeste = simular({ ...cohete, azimutLanzamiento: 270 }, { modelo: '2D', rotacion: true });
    esperarCercano(oeste.muestras[0]!.velocidadHorizontal, -v0.velocidadHorizontal, 1e-12);
    expect(r.diagnostico.rotacion).toBe(true);
  });

  it('en la plataforma gira con el suelo: altitud, alcance y velocidad respecto al aire nulos', () => {
    const cohete: Cohete = { ...conEtapa(0, { empujeVacio: 120_000 }), latitudLanzamiento: 0 };
    const r = simular(cohete, { modelo: '2D', rotacion: true });
    const despegue = evento(r, 'despegue');
    expect(despegue.t).toBeGreaterThan(5);
    for (const m of r.muestras.filter((x) => x.t < despegue.t)) {
      expect(Math.abs(m.altitud)).toBeLessThan(1e-6);
      expect(Math.abs(m.alcance)).toBeLessThan(1e-6);
      expect(m.velocidadAire).toBeLessThan(1e-9);
      esperarCercano(m.velocidad, OMEGA_TIERRA * RADIO_TIERRA, 1e-9);
    }
    // El despegue llega antes que sin rotación: la fuerza centrífuga resta peso.
    const sinRotacion = simular(cohete, { modelo: '2D' });
    expect(despegue.t).toBeLessThan(evento(sinRotacion, 'despegue').t);
  });

  it('el giro gravitatorio sigue a la velocidad respecto al aire y el cierre vale en todo el vuelo', () => {
    const r = simular(FALCON_9, { ...OPCIONES_ALTA_FIDELIDAD, metodo: 'rk4' });
    const fin = evento(r, 'finManiobra');
    esperarCercano(fin.estado.anguloTrayectoriaAire, Math.PI / 2 - FALCON_9.anguloManiobra * GRADO, 1e-9);
    for (const m of r.muestras.filter((x) => x.t > fin.t && x.motorEncendido)) expect(m.anguloAtaque).toBe(0);
    // La velocidad inercial no coincide con el eje: hay pérdida por dirección también en el giro.
    expect(evento(r, 'finCombustion2').estado.perdidas.direccion).toBeGreaterThan(fin.estado.perdidas.direccion);
    esperarCierre(r.muestras);
  });

  it('un lanzamiento hacia el este gana energía orbital', () => {
    const conRotacion = simular(FALCON_9, { modelo: '2D', atmosfera: 'estandar1976', rotacion: true, metodo: 'dormandPrince' });
    const sinRotacion = simular(FALCON_9, { modelo: '2D', atmosfera: 'estandar1976', metodo: 'dormandPrince' });
    expect(evento(conRotacion, 'finCombustion2').estado.orbita.energia).toBeGreaterThan(
      evento(sinRotacion, 'finCombustion2').estado.orbita.energia,
    );
  });

  it('en 1D no interviene', () => {
    const r = simular(COHETE_PRUEBA, { rotacion: true });
    expect(r.resumen.apogeo).toBe(simular(COHETE_PRUEBA).resumen.apogeo);
    expect(r.diagnostico.rotacion).toBe(false);
  });
});

describe('perfil de regulación', () => {
  const perfil = [
    [10, 0.7],
    [25, 1],
  ] as const;
  const cohete = conEtapa(0, { regulacion: perfil.map(([t, n]) => [t, n] as const) });
  const r = simular(cohete);

  it('el fin de combustión cae en el instante del perfil', () => {
    const e1 = cohete.etapas[0];
    esperarCercano(evento(r, 'finCombustion1').t, tiempoCombustionRegulada(e1, e1.masaPropelente, e1.regulacion), 1e-12);
    // 8 000 kg a 98,05 kg/s con 15 s al 70 %: 4,5 s más que sin regular.
    esperarCercano(evento(r, 'finCombustion1').t, 8_000 / caudalMasico(e1) + 15 * 0.3, 1e-12);
  });

  it('nivel y caudal de cada tramo; la Δv ideal no cambia', () => {
    const caudal = caudalMasico(cohete.etapas[0]);
    // En los instantes de cambio hay dos muestras; se comprueban aparte.
    for (const m of r.muestras.filter((x) => x.etapa === 1 && x.motorEncendido && x.t !== 10 && x.t !== 25)) {
      const nivel = m.t >= 10 && m.t < 25 ? 0.7 : 1;
      esperarCercano(m.regulacion, nivel, 1e-12);
      esperarCercano(m.caudal, nivel * caudal, 1e-12);
    }
    const dv = deltaVEtapas(cohete.etapas, cohete.masaCargaUtil);
    esperarCercano(evento(r, 'finCombustion2').estado.deltaVIdeal, dv.total, 1e-9);
    esperarCierre(r.muestras.filter((m) => m.t <= evento(r, 'apogeo').t));
  });

  it('cada cambio de nivel tiene dos muestras, antes y después', () => {
    const en10 = r.muestras.filter((m) => m.t === 10);
    expect(en10).toHaveLength(2);
    esperarCercano(en10[0]!.regulacion, 1, 1e-12);
    esperarCercano(en10[1]!.regulacion, 0.7, 1e-12);
  });
});

describe('límite de aceleración', () => {
  // Sin gravedad, arrastre ni contrapresión, con F/m = a constante la masa cae exponencialmente:
  // m(t) = m_l · e^(−a·(t − t_l)/u), así que el fin de combustión llega en
  // t_l + (u/a)·ln(m_l / m_f), con m_l = F/a y t_l = (m0 − m_l)/ṁ.
  it('fin de combustión de la solución analítica y F/m ≤ a_max', () => {
    const limite = 30;
    const cohete: Cohete = { ...COHETE_PRUEBA, aceleracionMaxima: limite };
    const r = simular(cohete, { gravedad: false, arrastre: false, contrapresion: false });
    const e1 = cohete.etapas[0];
    const u = velocidadExpulsion(e1.ispVacio);
    const masaLimite = e1.empujeVacio / limite;
    const tLimite = (11_700 - masaLimite) / caudalMasico(e1);
    const esperado = tLimite + (u / limite) * Math.log(masaLimite / 3_700);
    esperarCercano(evento(r, 'finCombustion1').t, esperado, 1e-9);
    for (const m of r.muestras) expect(m.empuje / m.masa).toBeLessThanOrEqual(limite * (1 + 1e-9));
    // Regulado al final de la etapa 1: nivel = a·m_f / F.
    esperarCercano(evento(r, 'finCombustion1').estado.regulacion, (limite * 3_700) / e1.empujeVacio, 1e-9);
    // La Δv ideal es la de Tsiolkovski: no depende de cómo se queme el propelente.
    const dv = deltaVEtapas(cohete.etapas, cohete.masaCargaUtil);
    esperarCercano(evento(r, 'finCombustion2').estado.deltaVIdeal, dv.total, 1e-9);
  });

  it('con gravedad y arrastre el cierre se mantiene y el orden sigue siendo 4', () => {
    const cohete: Cohete = { ...COHETE_PRUEBA, aceleracionMaxima: 4 * G0 };
    esperarCierre(simular(cohete, { modelo: '2D' }).muestras);
    const [a1, a2, a3] = [0.4, 0.2, 0.1].map((dt) => simular(cohete, { dt }).resumen.apogeo) as [number, number, number];
    const cociente = (a1 - a2) / (a2 - a3);
    expect(cociente).toBeGreaterThan(14);
    expect(cociente).toBeLessThan(18);
  });
});

describe('Dormand–Prince 5(4)', () => {
  const r = simular(FALCON_9, OPCIONES_ALTA_FIDELIDAD);
  const fin = evento(r, 'finCombustion2');

  // Tercera ley de Kepler: tras un periodo T = 2π·√(a³/μ) el cohete vuelve al punto de inserción.
  it('simula una vuelta completa y vuelve al punto de partida', () => {
    const periodo = periodoOrbital(fin.estado.orbita.semiejeMayor);
    const ultima = r.muestras.at(-1)!;
    esperarCercano(ultima.t, fin.t + periodo, 1e-12);
    // El arrastre residual a casi 300 km de perigeo desplaza el punto unos metros.
    expect(Math.hypot(ultima.x - fin.estado.x, ultima.y - fin.estado.y)).toBeLessThan(100);
    expect(r.diagnostico.pasos).toBeLessThan(2_000);
  });

  it('validación 8 a lo largo de la vuelta: ε y |r × v| constantes', () => {
    const o = fin.estado.orbita;
    const vuelta = r.muestras.filter((m) => m.t > fin.t);
    expect(vuelta.length).toBeGreaterThan(5_000);
    for (const m of vuelta) {
      esperarCercano(m.orbita.energia, o.energia, 1e-8);
      esperarCercano(m.orbita.momentoAngular, o.momentoAngular, 1e-8);
    }
    esperarCierre(r.muestras);
  });

  it('coincide con RK4 dentro de la tolerancia', () => {
    const dp = simular(COHETE_PRUEBA, { metodo: 'dormandPrince', tolerancia: 1e-10 });
    const rk4 = simular(COHETE_PRUEBA);
    esperarCercano(dp.resumen.apogeo, rk4.resumen.apogeo, 1e-8);
    esperarCercano(evento(dp, 'maxQ').t, evento(rk4, 'maxQ').t, 1e-7);
    expect(dp.diagnostico.pasos).toBeLessThan(rk4.diagnostico.pasos / 20);
  });

  it('el error baja con la tolerancia', () => {
    const exacto = simular(COHETE_PRUEBA, { metodo: 'dormandPrince', tolerancia: 1e-13 }).resumen.apogeo;
    const error = (tol: number): number =>
      Math.abs(simular(COHETE_PRUEBA, { metodo: 'dormandPrince', tolerancia: tol }).resumen.apogeo - exacto);
    expect(error(1e-8)).toBeLessThan(error(1e-6));
    expect(error(1e-10)).toBeLessThan(error(1e-8));
  });
});
