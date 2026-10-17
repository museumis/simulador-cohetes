import { describe, expect, it } from 'vitest';
import { RADIO_TIERRA } from '../../src/fisica/constantes';
import { ALTITUD_PERIGEO_ORBITA } from '../../src/fisica/orbita';
import { ELECTRON } from '../../src/modelos/electron';
import { FALCON_9 } from '../../src/modelos/falcon9';
import { DURACION_ORBITAL, simular } from '../../src/simulacion/simular';
import type { Evento, Muestra, ResultadoSimulacion, TipoEvento } from '../../src/simulacion/tipos';
import { esperarCercano } from '../ayudas';
import { COHETE_PRUEBA } from './cohetes';

function evento(r: ResultadoSimulacion, tipo: TipoEvento): Evento {
  const e = r.eventos.find((x) => x.tipo === tipo);
  if (!e) throw new Error(`Falta el evento ${tipo}`);
  return e;
}

const GRADO = Math.PI / 180;

const falcon = simular(FALCON_9, { modelo: '2D' });
const sondeo = simular(COHETE_PRUEBA, { modelo: '2D' });

/** Comprueba la identidad del presupuesto de Δv en cada muestra (validación 7). */
function esperarCierre(muestras: readonly Muestra[], tolerancia = 1e-6): void {
  const v0 = muestras[0]!.velocidad;
  for (const m of muestras) {
    const p = m.perdidas;
    const balance = m.deltaVIdeal - p.gravedad - p.arrastre - p.contrapresion - p.direccion;
    expect(Math.abs(Math.abs(m.velocidad) - Math.abs(v0) - balance)).toBeLessThanOrEqual(tolerancia * Math.max(m.deltaVIdeal, 1));
  }
}

describe('modelo 2D: programa de inclinación', () => {
  it('eventos del ascenso a órbita en orden y sin impacto', () => {
    const tipos = falcon.eventos.map((e) => e.tipo);
    expect(tipos.slice(0, 3)).toEqual(['despegue', 'inicioManiobra', 'finManiobra']);
    expect(tipos).toContain('orbita');
    expect(tipos).not.toContain('impacto');
    expect(evento(falcon, 'orbita').t).toBeLessThanOrEqual(evento(falcon, 'finCombustion2').t);
    expect(falcon.diagnostico.modelo).toBe('2D');
  });

  it('la subida es vertical hasta la maniobra, que empieza a velocidadManiobra', () => {
    const inicio = evento(falcon, 'inicioManiobra');
    esperarCercano(inicio.estado.velocidad, FALCON_9.velocidadManiobra, 1e-9);
    for (const m of falcon.muestras.filter((x) => x.t <= inicio.t)) {
      expect(m.x).toBe(0);
      expect(m.alcance).toBe(0);
      expect(m.anguloTrayectoria).toBe(Math.PI / 2);
      expect(m.perdidas.direccion).toBe(0);
    }
    // Al empezar la maniobra el empuje se inclina de golpe anguloManiobra respecto a la vertical.
    esperarCercano(inicio.estado.anguloEmpuje, Math.PI / 2 - FALCON_9.anguloManiobra * GRADO, 1e-12);
    esperarCercano(inicio.estado.anguloAtaque, -FALCON_9.anguloManiobra * GRADO, 1e-9);
  });

  it('la maniobra termina cuando la velocidad tiene la inclinación del empuje', () => {
    const fin = evento(falcon, 'finManiobra').estado;
    esperarCercano(fin.anguloTrayectoria, Math.PI / 2 - FALCON_9.anguloManiobra * GRADO, 1e-9);
    expect(Math.abs(fin.anguloAtaque)).toBeLessThan(1e-9);
    // Después, giro gravitatorio: el empuje sigue a la velocidad y γ baja.
    const despues = falcon.muestras.filter((m) => m.t > fin.t && m.motorEncendido);
    for (const m of despues) expect(m.anguloAtaque).toBe(0);
    expect(despues.at(-1)!.anguloTrayectoria).toBeLessThan(fin.anguloTrayectoria);
  });

  it('pérdida por dirección: positiva solo durante la maniobra', () => {
    const inicio = evento(falcon, 'inicioManiobra').estado.perdidas.direccion;
    const fin = evento(falcon, 'finManiobra').estado.perdidas.direccion;
    expect(inicio).toBe(0);
    expect(fin).toBeGreaterThan(0);
    expect(evento(falcon, 'finCombustion2').estado.perdidas.direccion).toBe(fin);
  });

  it('el alcance crece y la altitud es |r| − R', () => {
    for (let i = 1; i < falcon.muestras.length; i++) {
      expect(falcon.muestras[i]!.alcance).toBeGreaterThanOrEqual(falcon.muestras[i - 1]!.alcance);
    }
    for (const m of [evento(falcon, 'finManiobra').estado, evento(falcon, 'finCombustion2').estado]) {
      esperarCercano(m.altitud, Math.hypot(m.x, m.y) - RADIO_TIERRA, 1e-9);
      esperarCercano(m.alcance, RADIO_TIERRA * Math.atan2(m.x, m.y), 1e-9);
      esperarCercano(m.velocidad, Math.hypot(m.velocidadVertical, m.velocidadHorizontal), 1e-12);
    }
  });
});

describe('modelo 2D: órbita', () => {
  it('el modelo de referencia llega a órbita con perigeo sobre 100 km', () => {
    const fin = evento(falcon, 'finCombustion2').estado;
    expect(fin.orbita.energia).toBeLessThan(0);
    expect(fin.orbita.altitudPerigeo).toBeGreaterThan(ALTITUD_PERIGEO_ORBITA);
    expect(fin.orbita.excentricidad).toBeLessThan(0.05);
    const orbita = evento(falcon, 'orbita').estado;
    esperarCercano(orbita.orbita.altitudPerigeo, ALTITUD_PERIGEO_ORBITA, 1e-6);
    expect(simular(ELECTRON, { modelo: '2D' }).eventos.map((e) => e.tipo)).toContain('orbita');
  });

  it('en órbita se simula DURACION_ORBITAL tras el fin de la combustión 2', () => {
    esperarCercano(falcon.muestras.at(-1)!.t, evento(falcon, 'finCombustion2').t + DURACION_ORBITAL);
  });

  // Validación 8: fuera de la atmósfera y sin motor, ε y h se conservan, y con ellas apogeo y perigeo.
  it('validación 8: elementos orbitales constantes en vuelo balístico', () => {
    const fin = evento(falcon, 'finCombustion2');
    const balisticas = falcon.muestras.filter((m) => m.t > fin.t);
    expect(balisticas.length).toBeGreaterThan(10_000);
    const o = fin.estado.orbita;
    for (const m of balisticas) {
      esperarCercano(m.orbita.energia, o.energia, 1e-9);
      esperarCercano(m.orbita.momentoAngular, o.momentoAngular, 1e-9);
      esperarCercano(m.orbita.altitudPerigeo, o.altitudPerigeo, 1e-6);
      esperarCercano(m.orbita.altitudApogeo, o.altitudApogeo, 1e-6);
    }
    expect(falcon.diagnostico.derivaEnergia).toBeLessThan(1e-9);
  });

  it('un cohete de sondeo hace un vuelo suborbital y cae lejos de la plataforma', () => {
    const impacto = evento(sondeo, 'impacto').estado;
    expect(sondeo.eventos.map((e) => e.tipo)).not.toContain('orbita');
    expect(Math.abs(impacto.altitud)).toBeLessThan(1e-6);
    expect(impacto.alcance).toBeGreaterThan(100_000);
    expect(impacto.anguloTrayectoria).toBeLessThan(0);
    expect(evento(sondeo, 'apogeo').estado.velocidadVertical).toBeCloseTo(0, 6);
  });
});

describe('modelo 2D: validación', () => {
  // Validación 7 en 2D: la identidad vale en todo el vuelo, también en el descenso,
  // porque la pérdida por gravedad es ∫ g · sin γ dt.
  it('7: cierre del presupuesto de Δv en todo el vuelo', () => {
    esperarCierre(falcon.muestras);
    esperarCierre(sondeo.muestras);
    // Con Euler simpléctico |v| no se integra exactamente (no es lineal en vx, vy): el cierre es O(dt).
    esperarCierre(simular(COHETE_PRUEBA, { modelo: '2D', metodo: 'eulerSimplectico' }).muestras, 1e-4);
  });

  it('sin maniobra, el vuelo 2D es el vertical del modelo 1D', () => {
    const cohete = { ...COHETE_PRUEBA, velocidadManiobra: 1e9 };
    const plano = simular(cohete, { modelo: '2D' });
    const vertical = simular(cohete);
    esperarCercano(plano.resumen.apogeo, vertical.resumen.apogeo, 1e-12);
    esperarCercano(evento(plano, 'maxQ').t, evento(vertical, 'maxQ').t, 1e-12);
    for (const m of plano.muestras) expect(m.x).toBe(0);
  });

  // Con dt = 0,8 s la maniobra (6 s) dura muy pocos pasos y el error aún no es asintótico.
  it('6: convergencia de orden 4 del apogeo', () => {
    const [a1, a2, a3] = [0.4, 0.2, 0.1].map((dt) => simular(COHETE_PRUEBA, { modelo: '2D', dt }).resumen.apogeo) as [
      number,
      number,
      number,
    ];
    const cociente = (a1 - a2) / (a2 - a3);
    expect(cociente).toBeGreaterThan(14);
    expect(cociente).toBeLessThan(18);
  });

  it('detenerEnApogeo termina en el apogeo balístico con los mismos valores', () => {
    const r = simular(COHETE_PRUEBA, { modelo: '2D', detenerEnApogeo: true });
    expect(r.eventos.at(-1)!.tipo).toBe('apogeo');
    expect(r.resumen.apogeo).toBe(sondeo.resumen.apogeo);
  });
});
