import type { Evento, Muestra, ResultadoSimulacion } from '../simulacion/tipos';
import { estadoEn, indiceMuestra } from '../util/interpolacion';

/** Velocidades de reproducción admitidas (tiempo simulado / tiempo real). */
export const VELOCIDADES = [0.1, 1, 10, 100] as const;
export type Velocidad = (typeof VELOCIDADES)[number];

/** Margen para comparar instantes al saltar entre muestras o eventos (s). */
const EPSILON_T = 1e-9;

/** Lo que recibe quien escucha al reproductor tras cada cambio. */
export interface CambioReproductor {
  t: number;                        // s
  estado: Muestra;                  // interpolado en t
  reproduciendo: boolean;
  velocidad: Velocidad;
  eventosCruzados: readonly Evento[]; // eventos atravesados al avanzar reproduciendo
}

export type OyenteReproductor = (cambio: CambioReproductor) => void;

/**
 * Reloj de simulación sobre un resultado ya calculado. No usa el DOM: quien lo use llama a
 * `avanzar(dtReal)` en cada fotograma.
 */
export class Reproductor {
  private resultado: ResultadoSimulacion;
  private tActual = 0;
  private reproduciendoAhora = false;
  private velocidadActual: Velocidad = 1;
  private estadoCache: Muestra | null = null;
  private readonly oyentes = new Set<OyenteReproductor>();

  constructor(resultado: ResultadoSimulacion) {
    if (resultado.muestras.length === 0) throw new RangeError('El resultado no tiene muestras');
    this.resultado = resultado;
    this.tActual = this.tInicial;
  }

  get t(): number {
    return this.tActual;
  }

  get reproduciendo(): boolean {
    return this.reproduciendoAhora;
  }

  get velocidad(): Velocidad {
    return this.velocidadActual;
  }

  get tInicial(): number {
    return this.resultado.muestras[0]!.t;
  }

  get tFinal(): number {
    return this.resultado.muestras[this.resultado.muestras.length - 1]!.t;
  }

  get eventos(): readonly Evento[] {
    return this.resultado.eventos;
  }

  /** Estado interpolado en el instante actual. */
  estadoActual(): Muestra {
    this.estadoCache ??= estadoEn(this.resultado.muestras, this.tActual);
    return this.estadoCache;
  }

  /** Eventos con t ≤ instante actual. */
  eventosOcurridos(): Evento[] {
    return this.resultado.eventos.filter((e) => e.t <= this.tActual + EPSILON_T);
  }

  /**
   * Sustituye el resultado (p. ej. al recalcular con otros parámetros) manteniendo el
   * instante actual, recortado al nuevo intervalo.
   */
  cargar(resultado: ResultadoSimulacion): void {
    if (resultado.muestras.length === 0) throw new RangeError('El resultado no tiene muestras');
    this.resultado = resultado;
    this.fijarT(this.tActual, []);
  }

  suscribir(oyente: OyenteReproductor): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  reproducir(): void {
    if (this.reproduciendoAhora) return;
    // Al final, volver a empezar.
    if (this.tActual >= this.tFinal) this.tActual = this.tInicial;
    this.reproduciendoAhora = true;
    this.fijarT(this.tActual, []);
  }

  pausar(): void {
    if (!this.reproduciendoAhora) return;
    this.reproduciendoAhora = false;
    this.notificar([]);
  }

  alternar(): void {
    if (this.reproduciendoAhora) this.pausar();
    else this.reproducir();
  }

  setVelocidad(velocidad: Velocidad): void {
    this.velocidadActual = velocidad;
    this.notificar([]);
  }

  irA(t: number): void {
    this.fijarT(t, []);
  }

  reiniciar(): void {
    this.reproduciendoAhora = false;
    this.fijarT(this.tInicial, []);
  }

  /**
   * Avanza el reloj `dtReal · velocidad` si está reproduciendo. Se detiene al final.
   * @param dtReal tiempo real transcurrido (s)
   */
  avanzar(dtReal: number): void {
    if (!this.reproduciendoAhora || !(dtReal > 0)) return;
    const anterior = this.tActual;
    const siguiente = Math.min(anterior + dtReal * this.velocidadActual, this.tFinal);
    const cruzados = this.resultado.eventos.filter((e) => e.t > anterior && e.t <= siguiente);
    if (siguiente >= this.tFinal) this.reproduciendoAhora = false;
    this.fijarT(siguiente, cruzados);
  }

  /** Salta a la muestra siguiente (+1) o anterior (−1) y pausa. */
  pasoMuestra(sentido: 1 | -1): void {
    const muestras = this.resultado.muestras;
    let i = indiceMuestra(muestras, this.tActual);
    if (sentido > 0) {
      while (i < muestras.length - 1 && muestras[i]!.t <= this.tActual + EPSILON_T) i++;
    } else {
      while (i > 0 && muestras[i]!.t >= this.tActual - EPSILON_T) i--;
    }
    this.reproduciendoAhora = false;
    this.fijarT(muestras[i]!.t, []);
  }

  /** Salta al evento siguiente (+1) o anterior (−1). Si no hay, no cambia nada. */
  saltarEvento(sentido: 1 | -1): void {
    const eventos = this.resultado.eventos;
    const evento =
      sentido > 0
        ? eventos.find((e) => e.t > this.tActual + EPSILON_T)
        : eventos.findLast((e) => e.t < this.tActual - EPSILON_T);
    if (evento) this.fijarT(evento.t, []);
  }

  private fijarT(t: number, cruzados: readonly Evento[]): void {
    this.tActual = Math.min(Math.max(t, this.tInicial), this.tFinal);
    this.estadoCache = null;
    this.notificar(cruzados);
  }

  private notificar(eventosCruzados: readonly Evento[]): void {
    const cambio: CambioReproductor = {
      t: this.tActual,
      estado: this.estadoActual(),
      reproduciendo: this.reproduciendoAhora,
      velocidad: this.velocidadActual,
      eventosCruzados,
    };
    for (const oyente of this.oyentes) oyente(cambio);
  }
}
