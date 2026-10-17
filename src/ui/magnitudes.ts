import { G0 } from '../fisica/constantes';
import type { MetodoIntegracion, Muestra, TipoEvento } from '../simulacion/tipos';
import { formatearNumero } from '../util/formato';

/** Sistema de unidades de la interfaz: SI estricto o unidades prácticas (km, km/h, kN, kPa); la masa siempre en kg. */
export type SistemaUnidades = 'si' | 'practico';

/** Una magnitud que se puede mostrar en la telemetría o en una gráfica. */
export interface Magnitud {
  id: string;
  simbolo: string;
  nombre: string;
  unidad: string;                                   // SI
  practica?: { unidad: string; divisor: number };   // valor práctico = valor SI / divisor
  cifras: number;                                   // cifras significativas en SI
  valor: (m: Muestra) => number;                    // valor SI
}

const km = { unidad: 'km', divisor: 1_000 };
const kg = { unidad: 'kg', divisor: 1 };
const kN = { unidad: 'kN', divisor: 1_000 };
const kPa = { unidad: 'kPa', divisor: 1_000 };
const kmh = { unidad: 'km/h', divisor: 1 / 3.6 };

/** Todas las magnitudes de una muestra, en el orden de la telemetría. */
export const MAGNITUDES: readonly Magnitud[] = [
  { id: 'altitud', simbolo: 'h', nombre: 'altitud', unidad: 'm', practica: km, cifras: 6, valor: (m) => m.altitud },
  { id: 'velocidad', simbolo: 'v', nombre: 'velocidad', unidad: 'm/s', practica: kmh, cifras: 6, valor: (m) => m.velocidad },
  { id: 'aceleracion', simbolo: 'a', nombre: 'aceleración', unidad: 'm/s²', cifras: 4, valor: (m) => m.aceleracion },
  { id: 'masa', simbolo: 'm', nombre: 'masa', unidad: 'kg', cifras: 6, valor: (m) => m.masa },
  { id: 'empuje', simbolo: 'F', nombre: 'empuje', unidad: 'N', practica: kN, cifras: 4, valor: (m) => m.empuje },
  { id: 'caudal', simbolo: 'ṁ', nombre: 'caudal másico', unidad: 'kg/s', cifras: 4, valor: (m) => m.caudal },
  { id: 'isp', simbolo: 'Isp', nombre: 'impulso específico', unidad: 's', cifras: 4, valor: (m) => m.isp },
  { id: 'twr', simbolo: 'TWR', nombre: 'empuje / peso', unidad: '', cifras: 3, valor: (m) => m.twr },
  { id: 'densidad', simbolo: 'ρ', nombre: 'densidad', unidad: 'kg/m³', cifras: 4, valor: (m) => m.densidad },
  { id: 'presion', simbolo: 'p', nombre: 'presión', unidad: 'Pa', practica: kPa, cifras: 4, valor: (m) => m.presion },
  { id: 'temperatura', simbolo: 'T', nombre: 'temperatura', unidad: 'K', cifras: 4, valor: (m) => m.temperatura },
  { id: 'sonido', simbolo: 'c', nombre: 'velocidad del sonido', unidad: 'm/s', cifras: 4, valor: (m) => m.velocidadSonido },
  { id: 'mach', simbolo: 'Mach', nombre: 'número de Mach', unidad: '', cifras: 3, valor: (m) => m.mach },
  { id: 'q', simbolo: 'q', nombre: 'presión dinámica', unidad: 'Pa', practica: kPa, cifras: 4, valor: (m) => m.presionDinamica },
  { id: 'arrastre', simbolo: 'D', nombre: 'arrastre', unidad: 'N', practica: kN, cifras: 4, valor: (m) => m.arrastre },
  { id: 'gravedad', simbolo: 'g', nombre: 'gravedad local', unidad: 'm/s²', cifras: 5, valor: (m) => m.gravedad },
  { id: 'dvIdeal', simbolo: 'Δv id', nombre: 'Δv ideal acumulada', unidad: 'm/s', cifras: 5, valor: (m) => m.deltaVIdeal },
  { id: 'perdGrav', simbolo: 'Δv g', nombre: 'pérdida por gravedad', unidad: 'm/s', cifras: 5, valor: (m) => m.perdidas.gravedad },
  { id: 'perdArr', simbolo: 'Δv D', nombre: 'pérdida por arrastre', unidad: 'm/s', cifras: 5, valor: (m) => m.perdidas.arrastre },
  { id: 'perdContra', simbolo: 'Δv p', nombre: 'pérdida por contrapresión', unidad: 'm/s', cifras: 5, valor: (m) => m.perdidas.contrapresion },
];

/** Magnitudes de las gráficas por defecto. */
export const GRAFICAS_POR_DEFECTO = ['altitud', 'velocidad', 'aceleracion', 'masa', 'q', 'mach'] as const;

export function buscarMagnitud(id: string): Magnitud {
  const m = MAGNITUDES.find((x) => x.id === id);
  if (!m) throw new RangeError(`Magnitud desconocida: ${id}`);
  return m;
}

/** Unidad y divisor de una magnitud en el sistema elegido. */
export function unidadDe(m: Magnitud, sistema: SistemaUnidades): { unidad: string; divisor: number } {
  return sistema === 'practico' && m.practica ? m.practica : { unidad: m.unidad, divisor: 1 };
}

/** Valor ya formateado de una magnitud en el sistema elegido, sin la unidad. */
export function textoMagnitud(m: Magnitud, muestra: Muestra, sistema: SistemaUnidades): string {
  const { divisor } = unidadDe(m, sistema);
  // Cambiar de escala no cambia las cifras significativas.
  return formatearNumero(m.valor(muestra) / divisor, m.cifras);
}

/** Aceleración en múltiplos de g0, solo para mostrarla junto a la aceleración en m/s². */
export function aceleracionEnG(aceleracion: number): number {
  return aceleracion / G0;
}

/** Valores sueltos (no de una muestra) con la unidad de una magnitud del mismo tipo. */
export function textoConUnidad(valor: number, unidadSI: 'kg' | 'N' | 'm' | 'Pa', cifras: number, sistema: SistemaUnidades): string {
  const practica = { kg, N: kN, m: km, Pa: kPa }[unidadSI];
  const { unidad, divisor } = sistema === 'practico' ? practica : { unidad: unidadSI, divisor: 1 };
  return `${formatearNumero(valor / divisor, cifras)} ${unidad}`;
}

export const NOMBRES_EVENTOS: Record<TipoEvento, string> = {
  despegue: 'despegue',
  mach1: 'Mach 1',
  maxQ: 'Max-Q',
  finCombustion1: 'fin comb. 1',
  separacion: 'separación',
  encendido2: 'encendido 2',
  finCombustion2: 'fin comb. 2',
  apogeo: 'apogeo',
  impacto: 'impacto',
};

/** Nombre de cada método de integración en la interfaz. */
export const NOMBRES_METODO: Record<MetodoIntegracion, string> = {
  rk4: 'RK4',
  eulerSimplectico: 'Euler simpléctico',
};
