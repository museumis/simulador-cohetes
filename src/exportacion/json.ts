import { CAMPOS_ETAPA, type Entrada } from '../simulacion/campos';
import { DATOS_COHETE_POR_DEFECTO, OPCIONES_POR_DEFECTO } from '../simulacion/simular';
import type { Cohete, Etapa, OpcionesSimulacion, ResultadoSimulacion, Tabla } from '../simulacion/tipos';

/** Identificador y versión del formato, para reconocer el archivo al volver a cargarlo. */
export const FORMATO_JSON = 'simulador-cohetes';
export const VERSION_JSON = 1;

/** Configuración del modelo físico, descrita a partir de las opciones. */
export function modeloFisico(opciones: OpcionesSimulacion): {
  dimension: string;
  atmosfera: string;
  gravedad: string;
  rotacion: string;
} {
  const plano = opciones.modelo === '2D';
  return {
    dimension: opciones.modelo,
    atmosfera: opciones.atmosfera === 'estandar1976' ? 'US Standard Atmosphere 1976' : 'exponencial',
    gravedad: plano ? '−μ·r/|r|³' : 'μ/(R+h)²',
    rotacion: plano && opciones.rotacion ? 'ω·cos(latitud)·sen(azimut) en el plano' : 'no',
  };
}

/**
 * JSON con la entrada, la configuración del modelo, el resumen, el diagnóstico y los eventos
 * con su estado completo. Con la entrada se reproduce la simulación exactamente.
 */
export function exportarJSON(entrada: Entrada, resultado: ResultadoSimulacion): string {
  return JSON.stringify(
    {
      formato: FORMATO_JSON,
      version: VERSION_JSON,
      modelo: modeloFisico(entrada.opciones),
      cohete: entrada.cohete,
      opciones: entrada.opciones,
      despega: resultado.despega,
      resumen: resultado.resumen,
      diagnostico: resultado.diagnostico,
      eventos: resultado.eventos,
    },
    null,
    2,
  );
}

/** El archivo no tiene el formato esperado. */
export class ErrorFormato extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorFormato';
  }
}

function objeto(valor: unknown, ruta: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new ErrorFormato(`${ruta}: se esperaba un objeto`);
  }
  return valor as Record<string, unknown>;
}

function numero(valor: unknown, ruta: string): number {
  if (typeof valor !== 'number') throw new ErrorFormato(`${ruta}: se esperaba un número`);
  return valor;
}

/** Número opcional: los archivos anteriores a las fases 5 y 6 no llevan algunos datos del cohete. */
function numeroOpcional(valor: unknown, ruta: string, porDefecto: number): number {
  return valor === undefined ? porDefecto : numero(valor, ruta);
}

/** Tabla opcional de puntos [x, y]; vacía si falta (archivos anteriores a la fase 6). */
function tablaOpcional(valor: unknown, ruta: string): Tabla {
  if (valor === undefined) return [];
  if (!Array.isArray(valor)) throw new ErrorFormato(`${ruta}: se esperaba una lista de puntos`);
  return valor.map((punto: unknown, i): [number, number] => {
    if (!Array.isArray(punto) || punto.length !== 2) throw new ErrorFormato(`${ruta}[${i}]: se esperaba un punto [x, y]`);
    return [numero(punto[0], `${ruta}[${i}][0]`), numero(punto[1], `${ruta}[${i}][1]`)];
  });
}

function leerEtapa(valor: unknown, ruta: string): Etapa {
  const o = objeto(valor, ruta);
  const etapa = { tablaCd: tablaOpcional(o.tablaCd, `${ruta}.tablaCd`), regulacion: tablaOpcional(o.regulacion, `${ruta}.regulacion`) } as Etapa;
  for (const c of CAMPOS_ETAPA) etapa[c.clave] = numero(o[c.clave], `${ruta}.${c.clave}`);
  return etapa;
}

/**
 * Lee la entrada de un JSON exportado. Comprueba la estructura y los tipos; los rangos los
 * comprueba la validación de la simulación. Las opciones que falten toman su valor por defecto.
 * @throws {ErrorFormato} si el texto no es un JSON de este formato
 */
export function leerJSON(texto: string): Entrada {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorFormato('El archivo no es JSON válido');
  }
  const raiz = objeto(datos, 'raíz');
  if (raiz.formato !== FORMATO_JSON) throw new ErrorFormato(`formato: se esperaba "${FORMATO_JSON}"`);
  if (raiz.version !== VERSION_JSON) throw new ErrorFormato(`version: solo se admite la ${VERSION_JSON}`);

  const c = objeto(raiz.cohete, 'cohete');
  if (typeof c.nombre !== 'string') throw new ErrorFormato('cohete.nombre: se esperaba un texto');
  if (!Array.isArray(c.etapas) || c.etapas.length !== 2) throw new ErrorFormato('cohete.etapas: se esperaban dos etapas');
  const cohete: Cohete = {
    nombre: c.nombre,
    etapas: [leerEtapa(c.etapas[0], 'cohete.etapas[0]'), leerEtapa(c.etapas[1], 'cohete.etapas[1]')],
    masaCargaUtil: numero(c.masaCargaUtil, 'cohete.masaCargaUtil'),
    pausaSeparacion: numero(c.pausaSeparacion, 'cohete.pausaSeparacion'),
    ...DATOS_COHETE_POR_DEFECTO,
  };
  for (const clave of Object.keys(DATOS_COHETE_POR_DEFECTO) as (keyof typeof DATOS_COHETE_POR_DEFECTO)[]) {
    cohete[clave] = numeroOpcional(c[clave], `cohete.${clave}`, DATOS_COHETE_POR_DEFECTO[clave]);
  }

  const o = raiz.opciones === undefined ? {} : objeto(raiz.opciones, 'opciones');
  const opciones: OpcionesSimulacion = { ...OPCIONES_POR_DEFECTO };
  for (const clave of Object.keys(OPCIONES_POR_DEFECTO) as (keyof OpcionesSimulacion)[]) {
    const valor = o[clave];
    if (valor === undefined) continue;
    if (typeof valor !== typeof OPCIONES_POR_DEFECTO[clave]) {
      throw new ErrorFormato(`opciones.${clave}: se esperaba un valor de tipo ${typeof OPCIONES_POR_DEFECTO[clave]}`);
    }
    (opciones as unknown as Record<string, unknown>)[clave] = valor;
  }
  return { cohete, opciones };
}
