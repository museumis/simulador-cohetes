import type { Cohete, MetodoIntegracion, ModeloVuelo, OpcionesSimulacion, Tabla, TipoAtmosfera } from './tipos';

/** Métodos de integración admitidos. */
export const METODOS: readonly MetodoIntegracion[] = ['rk4', 'eulerSimplectico', 'dormandPrince'];

/** Modelos atmosféricos admitidos. */
export const ATMOSFERAS: readonly TipoAtmosfera[] = ['exponencial', 'estandar1976'];

/** Tolerancia admitida en los métodos adaptativos (relativa). */
export const TOLERANCIA_MINIMA = 1e-13;
export const TOLERANCIA_MAXIMA = 1e-3;

/** Modelos de vuelo admitidos. */
export const MODELOS_VUELO: readonly ModeloVuelo[] = ['1D', '2D'];

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

function comprobarOpcion(errores: ErrorValidacion[], campo: string, valor: unknown, admitidos: readonly string[]): void {
  if (admitidos.includes(valor as string)) return;
  const rango = `{${admitidos.join(', ')}}`;
  errores.push({ campo, valor, rango, mensaje: `${campo} = ${String(valor)}: no es ninguno de los admitidos ${rango}` });
}

/**
 * Comprueba una tabla (x, y): x finito, dentro de su rango y estrictamente creciente; y dentro de
 * su rango. El error se asigna a la tabla entera y el mensaje indica el punto.
 */
function comprobarTabla(
  errores: ErrorValidacion[],
  campo: string,
  tabla: Tabla,
  x: { nombre: string; limites: Limites },
  y: { nombre: string; limites: Limites },
): void {
  const errorPunto = (i: number, detalle: string): void => {
    errores.push({ campo, valor: tabla, rango: '', mensaje: `${campo}, punto ${i + 1}: ${detalle}` });
  };
  if (!Array.isArray(tabla)) {
    errores.push({ campo, valor: tabla, rango: '', mensaje: `${campo}: se esperaba una lista de puntos` });
    return;
  }
  for (let i = 0; i < tabla.length; i++) {
    const [px, py] = tabla[i]!;
    for (const [nombre, valor, l] of [
      [x.nombre, px, x.limites],
      [y.nombre, py, y.limites],
    ] as const) {
      const sub: ErrorValidacion[] = [];
      comprobar(sub, nombre, valor, l);
      if (sub.length > 0) errorPunto(i, sub[0]!.mensaje);
    }
    if (i > 0 && !(px > tabla[i - 1]![0])) errorPunto(i, `${x.nombre} debe ser mayor que en el punto anterior`);
  }
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
    comprobarTabla(
      errores,
      `${p}.tablaCd`,
      etapa.tablaCd,
      { nombre: 'Mach', limites: noNegativo('') },
      { nombre: 'Cd', limites: noNegativo('') },
    );
    comprobarTabla(
      errores,
      `${p}.regulacion`,
      etapa.regulacion,
      { nombre: 't', limites: noNegativo('s') },
      { nombre: 'nivel', limites: { min: 0, max: 1, minIncluido: false, maxIncluido: true, unidad: '' } },
    );
  });
  comprobar(errores, 'masaCargaUtil', cohete.masaCargaUtil, noNegativo('kg'));
  comprobar(errores, 'pausaSeparacion', cohete.pausaSeparacion, noNegativo('s'));
  comprobar(errores, 'velocidadManiobra', cohete.velocidadManiobra, positivo('m/s'));
  comprobar(errores, 'anguloManiobra', cohete.anguloManiobra, {
    min: 0,
    max: 90,
    minIncluido: false,
    maxIncluido: true,
    unidad: '°',
  });
  comprobar(errores, 'aceleracionMaxima', cohete.aceleracionMaxima, { ...noNegativo('m/s²'), nota: '0: sin límite' });
  comprobar(errores, 'latitudLanzamiento', cohete.latitudLanzamiento, {
    min: -90,
    max: 90,
    minIncluido: true,
    maxIncluido: true,
    unidad: '°',
  });
  comprobar(errores, 'azimutLanzamiento', cohete.azimutLanzamiento, {
    min: 0,
    max: 360,
    minIncluido: true,
    maxIncluido: false,
    unidad: '°',
  });
  return errores;
}

/** Comprueba la configuración de la simulación. */
export function validarOpciones(opciones: OpcionesSimulacion): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  comprobarOpcion(errores, 'modelo', opciones.modelo, MODELOS_VUELO);
  comprobarOpcion(errores, 'metodo', opciones.metodo, METODOS);
  comprobarOpcion(errores, 'atmosfera', opciones.atmosfera, ATMOSFERAS);
  comprobar(errores, 'tolerancia', opciones.tolerancia, {
    min: TOLERANCIA_MINIMA,
    max: TOLERANCIA_MAXIMA,
    minIncluido: true,
    maxIncluido: true,
    unidad: '',
  });
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
