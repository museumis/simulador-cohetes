import { CAMPOS_ETAPA, type Entrada } from '../simulacion/campos';
import { OPCIONES_POR_DEFECTO } from '../simulacion/simular';
import type { Cohete, Etapa, OpcionesSimulacion, ResultadoSimulacion } from '../simulacion/tipos';

/** Identificador y versión del formato, para reconocer el archivo al volver a cargarlo. */
export const FORMATO_JSON = 'simulador-cohetes';
export const VERSION_JSON = 1;

/** Configuración del modelo físico, fija en esta versión. */
export const MODELO = { dimension: '1D', atmosfera: 'exponencial', gravedad: 'μ/(R+h)²' } as const;

/**
 * JSON con la entrada, la configuración del modelo, el resumen, el diagnóstico y los eventos
 * con su estado completo. Con la entrada se reproduce la simulación exactamente.
 */
export function exportarJSON(entrada: Entrada, resultado: ResultadoSimulacion): string {
  return JSON.stringify(
    {
      formato: FORMATO_JSON,
      version: VERSION_JSON,
      modelo: MODELO,
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

function leerEtapa(valor: unknown, ruta: string): Etapa {
  const o = objeto(valor, ruta);
  const etapa = {} as Etapa;
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
  };

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
