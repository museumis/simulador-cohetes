import { describe, expect, it } from 'vitest';
import { Reproductor, type CambioReproductor } from '../../src/reproduccion/reproductor';
import { simular } from '../../src/simulacion/simular';
import { COHETE_PRUEBA } from '../simulacion/cohetes';

const resultado = simular(COHETE_PRUEBA);

function crear(): { r: Reproductor; cambios: CambioReproductor[] } {
  const r = new Reproductor(resultado);
  const cambios: CambioReproductor[] = [];
  r.suscribir((c) => cambios.push(c));
  return { r, cambios };
}

describe('Reproductor', () => {
  it('empieza en T+0, en pausa y a ×1', () => {
    const { r } = crear();
    expect(r.t).toBe(0);
    expect(r.reproduciendo).toBe(false);
    expect(r.velocidad).toBe(1);
    expect(r.tFinal).toBe(resultado.muestras.at(-1)!.t);
  });

  it('solo avanza reproduciendo, y a la velocidad elegida', () => {
    const { r } = crear();
    r.avanzar(1);
    expect(r.t).toBe(0);
    r.reproducir();
    r.setVelocidad(10);
    r.avanzar(0.5);
    expect(r.t).toBeCloseTo(5, 12);
    r.pausar();
    r.avanzar(1);
    expect(r.t).toBeCloseTo(5, 12);
  });

  it('se detiene al final y vuelve a empezar al reproducir de nuevo', () => {
    const { r } = crear();
    r.reproducir();
    r.setVelocidad(100);
    r.avanzar(1e6);
    expect(r.t).toBe(r.tFinal);
    expect(r.reproduciendo).toBe(false);
    r.reproducir();
    expect(r.t).toBe(0);
  });

  it('avisa de los eventos cruzados al avanzar', () => {
    const { r, cambios } = crear();
    const despegue = resultado.eventos[0]!;
    const fin1 = resultado.eventos.find((e) => e.tipo === 'finCombustion1')!;
    r.reproducir();
    r.setVelocidad(100);
    r.avanzar((fin1.t + 0.001) / 100);
    const cruzados = cambios.at(-1)!.eventosCruzados.map((e) => e.tipo);
    expect(cruzados).toContain('mach1');
    expect(cruzados).toContain('separacion');
    expect(cruzados).not.toContain('encendido2');
    // El despegue en t = 0 no se «cruza»: ya había ocurrido al empezar.
    expect(despegue.t).toBe(0);
    expect(cruzados).not.toContain('despegue');
  });

  it('irA recorta al intervalo y el estado se interpola', () => {
    const { r } = crear();
    r.irA(-10);
    expect(r.t).toBe(0);
    r.irA(1e9);
    expect(r.t).toBe(r.tFinal);
    r.irA(12.3456);
    expect(r.estadoActual().t).toBe(12.3456);
  });

  it('paso a paso recorre muestras consecutivas y pausa', () => {
    const { r } = crear();
    r.reproducir();
    r.pasoMuestra(1);
    expect(r.reproduciendo).toBe(false);
    expect(r.t).toBe(resultado.muestras.find((m) => m.t > 0)!.t);
    const t1 = r.t;
    r.pasoMuestra(1);
    r.pasoMuestra(-1);
    expect(r.t).toBe(t1);
    r.reiniciar();
    r.pasoMuestra(-1);
    expect(r.t).toBe(0);
  });

  it('salta al evento siguiente y al anterior', () => {
    const { r } = crear();
    const tipos = resultado.eventos.map((e) => e.tipo);
    r.saltarEvento(1);
    expect(r.t).toBe(resultado.eventos[tipos.indexOf('mach1')]!.t);
    r.saltarEvento(1);
    expect(r.t).toBe(resultado.eventos[tipos.indexOf('maxQ')]!.t);
    r.saltarEvento(-1);
    expect(r.t).toBe(resultado.eventos[tipos.indexOf('mach1')]!.t);
    expect(r.eventosOcurridos().map((e) => e.tipo)).toEqual(['despegue', 'mach1']);
  });

  it('cargar mantiene el instante si cabe en el nuevo resultado', () => {
    const { r } = crear();
    r.irA(50);
    r.cargar(simular({ ...COHETE_PRUEBA, masaCargaUtil: 100 }));
    expect(r.t).toBe(50);
  });
});
