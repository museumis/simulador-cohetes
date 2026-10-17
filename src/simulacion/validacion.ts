import type { Cohete, OpcionesSimulacion } from './tipos';

/** Paso de integración admitido (s). */
export const DT_MINIMO = 1e-4;
export const DT_MAXIMO = 1;

/** Límite de seguridad del vuelo simulado (s): 2 horas. */
export const DURACION_MAXIMA = 7_200;

/** Un dato de entrada fuera de rango. */
export interface ErrorValidacion {
  campo: string;   // ruta del dato, p. ej. "etapas[0].masaSeca"
  valor: unknown;
  rango: string;   // rango admitido con su unidad, p. ej. "(0, ∞) kg"
  mensaje: string;
}

/** Entrada no válida: reúne todos los errores, no solo el primero. */
export class ErrorEntrada extends Error {
  readonly errores: readonly ErrorValidacion[];

  constructor(errores: readonly ErrorValidacion[]) {
    super(`Entrada no válida:\n${errores.map((e) => `  ${e.mensaje}`).join('\n')}`);
    this.name = 'ErrorEntrada';
    this.errores = errores;
  }
}

interface Limites {
  min: number;
  max: number;
  minIncluido: boolean;
  maxIncluido: boolean;
  unidad: string;
  nota?: string;
}

function textoRango(l: Limites): string {
  const min = l.min === -Infinity ? '−∞' : String(l.min);
  const max = l.max === Infinity ? '∞' : String(l.max);
  const abre = l.minIncluido ? '[' : '(';
  const cierra = l.maxIncluido ? ']' : ')';
  const unidad = l.unidad ? ` ${l.unidad}` : '';
  return `${abre}${min}, ${max}${cierra}${unidad}`;
}

function comprobar(errores: ErrorValidacion[], campo: string, valor: unknown, l: Limites): void {
  const valido =
    typeof valor === 'number' &&
    Number.isFinite(valor) &&
    (l.minIncluido ? valor >= l.min : valor > l.min) &&
    (l.maxIncluido ? valor <= l.max : valor < l.max);
  if (valido) return;
  const rango = textoRango(l);
  const unidad = l.unidad && typeof valor === 'number' ? ` ${l.unidad}` : '';
  const nota = l.nota ? ` (${l.nota})` : '';
  errores.push({
    campo,
    valor,
    rango,
    mensaje: `${campo} = ${String(valor)}${unidad}: fuera del rango admitido ${rango}${nota}`,
  });
}

const positivo = (unidad: string): Limites => ({ min: 0, max: Infinity, minIncluido: false, maxIncluido: false, unidad });
const noNegativo = (unidad: string): Limites => ({ min: 0, max: Infinity, minIncluido: true, maxIncluido: false, unidad });

/** Comprueba los datos del cohete. Devuelve la lista de errores, vacía si todo es válido. */
export function validarCohete(cohete: Cohete): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  cohete.etapas.forEach((etapa, i) => {
    const p = `etapas[${i}]`;
    comprobar(errores, `${p}.masaSeca`, etapa.masaSeca, positivo('kg'));
    comprobar(errores, `${p}.masaPropelente`, etapa.masaPropelente, noNegativo('kg'));
    comprobar(errores, `${p}.empujeVacio`, etapa.empujeVacio, positivo('N'));
    comprobar(errores, `${p}.ispVacio`, etapa.ispVacio, positivo('s'));
    const ispVacioValido = Number.isFinite(etapa.ispVacio) && etapa.ispVacio > 0;
    comprobar(errores, `${p}.ispNivelMar`, etapa.ispNivelMar, {
      min: 0,
      max: ispVacioValido ? etapa.ispVacio : Infinity,
      minIncluido: false,
      maxIncluido: true,
      unidad: 's',
      ...(ispVacioValido ? { nota: 'no puede superar ispVacio' } : {}),
    });
    comprobar(errores, `${p}.diametro`, etapa.diametro, positivo('m'));
    comprobar(errores, `${p}.longitud`, etapa.longitud, positivo('m'));
    comprobar(errores, `${p}.cd`, etapa.cd, noNegativo(''));
  });
  comprobar(errores, 'masaCargaUtil', cohete.masaCargaUtil, noNegativo('kg'));
  comprobar(errores, 'pausaSeparacion', cohete.pausaSeparacion, noNegativo('s'));
  return errores;
}

/** Comprueba la configuración de la simulación. */
export function validarOpciones(opciones: OpcionesSimulacion): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  comprobar(errores, 'dt', opciones.dt, {
    min: DT_MINIMO,
    max: DT_MAXIMO,
    minIncluido: true,
    maxIncluido: true,
    unidad: 's',
  });
  comprobar(errores, 'duracionMaxima', opciones.duracionMaxima, {
    min: 0,
    max: DURACION_MAXIMA,
    minIncluido: false,
    maxIncluido: true,
    unidad: 's',
  });
  comprobar(errores, 'altitudInicial', opciones.altitudInicial, noNegativo('m'));
  if (opciones.altitudInicial === 0) {
    comprobar(errores, 'velocidadInicial', opciones.velocidadInicial, {
      ...noNegativo('m/s'),
      nota: 'en el suelo no puede ser negativa',
    });
  } else {
    comprobar(errores, 'velocidadInicial', opciones.velocidadInicial, {
      min: -Infinity,
      max: Infinity,
      minIncluido: false,
      maxIncluido: false,
      unidad: 'm/s',
    });
  }
  return errores;
}
