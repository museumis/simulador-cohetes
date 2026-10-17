import { calcularDerivados } from '../analisis/derivados';
import { copiarCohete, MODELOS } from '../modelos';
import {
  buscarCampo,
  CAMPOS_ETAPA,
  CAMPOS_TABLA,
  copiarEntrada,
  tablaATexto,
  textoATabla,
  type Entrada,
} from '../simulacion/campos';
import { esAdaptativo } from '../simulacion/integrador';
import { OPCIONES_ALTA_FIDELIDAD, OPCIONES_POR_DEFECTO } from '../simulacion/simular';
import type { MetodoIntegracion, ModeloVuelo, TipoAtmosfera } from '../simulacion/tipos';
import { ATMOSFERAS, METODOS, MODELOS_VUELO, validarCohete, validarOpciones, type ErrorValidacion } from '../simulacion/validacion';
import { formatearNumero } from '../util/formato';
import { NOMBRES_ATMOSFERA, NOMBRES_METODO, NOMBRES_MODELO, textoConUnidad, type SistemaUnidades } from './magnitudes';

/** Retardo entre la última edición y el recálculo (ms). */
const RETARDO_RECALCULO = 250;

export interface Parametros {
  entrada(): Entrada;
  /** Sustituye toda la entrada (desde la URL o un JSON), la valida y la envía si es válida. */
  cargar(entrada: Entrada): void;
  setSistema(sistema: SistemaUnidades): void;
  /** Muestra un error de la simulación (o lo borra con null). */
  mostrarError(mensaje: string | null): void;
}

/** Interpreta un número escrito a mano; admite coma decimal. Vacío o ilegible da NaN. */
function leerNumero(texto: string): number {
  const limpio = texto.trim().replace(',', '.').replace(/[\s ]/g, '');
  return limpio === '' ? Number.NaN : Number(limpio);
}

function entrada(campo: string, valor: number | string, titulo: string): HTMLInputElement {
  const e = document.createElement('input');
  e.type = 'text';
  e.inputMode = typeof valor === 'number' ? 'decimal' : 'text';
  e.spellcheck = false;
  e.dataset.campo = campo;
  e.value = String(valor);
  e.title = titulo;
  e.setAttribute('aria-label', titulo);
  return e;
}

function desplegable<T extends string>(campo: string, titulo: string, opciones: readonly T[], nombres: Record<T, string>): HTMLSelectElement {
  const s = document.createElement('select');
  s.title = titulo;
  s.dataset.campo = campo;
  s.append(...opciones.map((o) => new Option(nombres[o], o)));
  return s;
}

function filaTabla(tabla: HTMLTableElement | HTMLTableSectionElement, celdas: (string | Node)[], claseNumero = true): HTMLTableRowElement {
  const tr = tabla.insertRow();
  celdas.forEach((c, i) => {
    const td = tr.insertCell();
    if (typeof c === 'string') td.textContent = c;
    else td.append(c);
    if (i > 0 && claseNumero) td.className = 'numero';
  });
  return tr;
}

/**
 * Panel lateral con todos los datos de entrada: validación campo a campo, valores derivados
 * y recálculo con un retardo corto tras cada cambio válido.
 */
export function crearParametros(
  contenedor: HTMLElement,
  alCambiar: (entrada: Entrada) => void,
): Parametros {
  // La página se abre en alta fidelidad: modelo 2D (con la trayectoria visible), US Standard
  // Atmosphere 1976, rotación terrestre y paso adaptativo.
  let entradaActual: Entrada = {
    cohete: copiarCohete(MODELOS[0]!.cohete),
    opciones: { ...OPCIONES_POR_DEFECTO, ...OPCIONES_ALTA_FIDELIDAD },
  };
  let sistema: SistemaUnidades = 'si';
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  contenedor.replaceChildren();
  const titulo = document.createElement('div');
  titulo.className = 'panel-titulo';
  titulo.textContent = 'PARÁMETROS';

  const selector = document.createElement('select');
  selector.title = 'Modelo predefinido';
  // La opción vacía queda elegida cuando la entrada viene de una URL o de un JSON.
  const personalizado = new Option('(cargado)', '');
  personalizado.hidden = true;
  selector.append(personalizado, ...MODELOS.map((m) => new Option(m.cohete.nombre, m.id)));
  selector.value = MODELOS[0]!.id;
  const filaModelo = document.createElement('label');
  filaModelo.className = 'fila-modelo';
  filaModelo.append('cohete ', selector);

  const tablaEntrada = document.createElement('table');
  tablaEntrada.className = 'tabla-parametros';
  const errores = document.createElement('ul');
  errores.className = 'errores';
  const errorSimulacion = document.createElement('div');
  errorSimulacion.className = 'errores';
  const tablaDerivados = document.createElement('table');
  tablaDerivados.className = 'tabla-parametros';
  const tituloDerivados = document.createElement('div');
  tituloDerivados.className = 'panel-titulo';
  tituloDerivados.textContent = 'VALORES DERIVADOS';
  const configuracion = document.createElement('div');
  configuracion.className = 'nota';

  const selectorModelo = desplegable('modelo', 'Modelo de vuelo', MODELOS_VUELO, NOMBRES_MODELO);
  const selectorMetodo = desplegable('metodo', 'Método de integración', METODOS, NOMBRES_METODO);
  const selectorAtmosfera = desplegable('atmosfera', 'Modelo atmosférico', ATMOSFERAS, NOMBRES_ATMOSFERA);
  const selectorRotacion = desplegable('rotacion', 'Solo 2D: rotación terrestre (velocidad inicial y viento de la atmósfera)', ['si', 'no'], {
    si: 'sí',
    no: 'no',
  });
  const selectores = [selectorModelo, selectorMetodo, selectorAtmosfera, selectorRotacion];

  contenedor.append(titulo, filaModelo, configuracion, tablaEntrada, errores, errorSimulacion, tituloDerivados, tablaDerivados);

  const entradas: HTMLInputElement[] = [];
  const entradasTabla: HTMLInputElement[] = [];
  let filaTolerancia: HTMLTableRowElement | null = null;

  function construirEntrada(): void {
    const { cohete, opciones } = entradaActual;
    tablaEntrada.replaceChildren();
    entradas.length = 0;
    entradasTabla.length = 0;
    const cab = tablaEntrada.createTHead();
    filaTabla(cab, ['', 'etapa 1', 'etapa 2', 'unidad'], false);
    const cuerpo = tablaEntrada.createTBody();
    for (const c of CAMPOS_ETAPA) {
      const e0 = entrada(`etapas[0].${c.clave}`, cohete.etapas[0][c.clave], `etapa 1: ${c.nombre} [${c.unidad || '—'}]`);
      const e1 = entrada(`etapas[1].${c.clave}`, cohete.etapas[1][c.clave], `etapa 2: ${c.nombre} [${c.unidad || '—'}]`);
      entradas.push(e0, e1);
      filaTabla(cuerpo, [c.nombre, e0, e1, c.unidad || '—'], false);
    }
    // Tablas por etapa como texto «x:y x:y …».
    for (const [clave, nombre, unidad, ayuda] of [
      ['tablaCd', 'Cd(Mach)', 'Mach:Cd', 'puntos Mach:Cd separados por espacios, interpolados linealmente; vacío: Cd constante'],
      ['regulacion', 'regulación', 's:nivel', 'puntos t:nivel (s desde el encendido, nivel en (0, 1]) por tramos; vacío: empuje nominal'],
    ] as const) {
      const celdas = ([0, 1] as const).map((i) => {
        const campo = CAMPOS_TABLA.find((c) => c.ruta === `etapas[${i}].${clave}`)!;
        const e = entrada(campo.ruta, tablaATexto(campo.leer(entradaActual)), `${campo.nombre}: ${ayuda}`);
        e.className = 'entrada-tabla';
        e.placeholder = '—';
        entradasTabla.push(e);
        return e;
      });
      filaTabla(cuerpo, [nombre, ...celdas, unidad], false);
    }
    const carga = entrada('masaCargaUtil', cohete.masaCargaUtil, 'carga útil [kg]');
    const pausa = entrada('pausaSeparacion', cohete.pausaSeparacion, 'pausa entre etapas [s]');
    const vManiobra = entrada('velocidadManiobra', cohete.velocidadManiobra, 'solo 2D: |v| al empezar la maniobra de inclinación [m/s]');
    const aManiobra = entrada('anguloManiobra', cohete.anguloManiobra, 'solo 2D: inclinación del empuje respecto a la vertical local [°]');
    const aMax = entrada('aceleracionMaxima', cohete.aceleracionMaxima, 'límite de F/m con regulación automática del empuje [m/s²]; 0: sin límite');
    const latitud = entrada('latitudLanzamiento', cohete.latitudLanzamiento, 'solo 2D con rotación: latitud de lanzamiento, positiva al norte [°]');
    const azimut = entrada('azimutLanzamiento', cohete.azimutLanzamiento, 'solo 2D con rotación: azimut de lanzamiento desde el norte hacia el este [°]');
    const dt = entrada('dt', opciones.dt, 'paso de integración; en el método adaptativo, paso inicial [s]');
    const tolerancia = entrada('tolerancia', opciones.tolerancia, 'solo paso adaptativo: error local admitido por paso, relativo');
    entradas.push(carga, pausa, aMax, vManiobra, aManiobra, latitud, azimut, dt, tolerancia);
    filaTabla(cuerpo, ['carga útil', carga, '', 'kg'], false);
    filaTabla(cuerpo, ['pausa entre etapas', pausa, '', 's'], false);
    filaTabla(cuerpo, ['aceleración máx. (0: sin)', aMax, '', 'm/s²'], false);
    filaTabla(cuerpo, ['modelo de vuelo', selectorModelo, '', ''], false);
    filaTabla(cuerpo, ['v maniobra (2D)', vManiobra, '', 'm/s'], false);
    filaTabla(cuerpo, ['ángulo maniobra (2D)', aManiobra, '', '°'], false);
    filaTabla(cuerpo, ['atmósfera', selectorAtmosfera, '', ''], false);
    filaTabla(cuerpo, ['rotación terrestre (2D)', selectorRotacion, '', ''], false);
    filaTabla(cuerpo, ['latitud (2D)', latitud, '', '°'], false);
    filaTabla(cuerpo, ['azimut (2D)', azimut, '', '°'], false);
    filaTabla(cuerpo, ['método de integración', selectorMetodo, '', ''], false);
    filaTabla(cuerpo, ['paso de integración dt', dt, '', 's'], false);
    filaTolerancia = filaTabla(cuerpo, ['tolerancia', tolerancia, '', '—'], false);
    selectorModelo.value = opciones.modelo;
    selectorMetodo.value = opciones.metodo;
    selectorAtmosfera.value = opciones.atmosfera;
    selectorRotacion.value = opciones.rotacion ? 'si' : 'no';
    pintarConfiguracion();
    for (const e of entradas) e.addEventListener('input', () => alEditar(e));
    for (const e of entradasTabla) e.addEventListener('input', () => alEditarTabla(e));
  }

  function pintarConfiguracion(): void {
    const o = entradaActual.opciones;
    const plano = o.modelo === '2D';
    const adaptativo = esAdaptativo(o.metodo);
    configuracion.textContent = [
      plano
        ? 'modelo 2D: gravedad vectorial y programa de inclinación (subida vertical, maniobra, giro gravitatorio)'
        : 'modelo 1D vertical (la maniobra, la rotación y el lugar de lanzamiento no intervienen)',
      `atmósfera ${NOMBRES_ATMOSFERA[o.atmosfera]}`,
      plano && o.rotacion ? 'con rotación terrestre' : 'sin rotación terrestre',
      adaptativo ? 'paso adaptativo (dt es el paso inicial)' : 'paso fijo (la tolerancia no interviene)',
    ].join(' · ');
    filaTolerancia?.classList.toggle('inactivo', !adaptativo);
  }

  function aplicar(campo: string, valor: number): void {
    entradaActual = buscarCampo(campo).escribir(entradaActual, valor);
  }

  function validar(): ErrorValidacion[] {
    return [...validarCohete(entradaActual.cohete), ...validarOpciones(entradaActual.opciones)];
  }

  function pintarErrores(lista: ErrorValidacion[]): void {
    const porCampo = new Map(lista.map((e) => [e.campo, e]));
    for (const e of [...entradas, ...entradasTabla, ...selectores]) {
      const error = porCampo.get(e.dataset.campo ?? '');
      e.classList.toggle('invalido', error !== undefined);
      e.setAttribute('aria-invalid', String(error !== undefined));
    }
    errores.replaceChildren(
      ...lista.map((e) => {
        const li = document.createElement('li');
        li.textContent = e.mensaje;
        return li;
      }),
    );
  }

  function pintarDerivados(valido: boolean): void {
    tablaDerivados.replaceChildren();
    if (!valido) {
      filaTabla(tablaDerivados, ['Corregir los datos marcados para ver los valores derivados.'], false);
      return;
    }
    const d = calcularDerivados(entradaActual.cohete);
    const masa = (kg: number): string => textoConUnidad(kg, 'kg', 6, sistema);
    const cuerpo = tablaDerivados.createTBody();
    filaTabla(cuerpo, ['masa al despegue', masa(d.masaDespegue), '']);
    filaTabla(cuerpo, ['fracción de carga útil', formatearNumero(d.fraccionCargaUtil, 4), '']);
    filaTabla(cuerpo, ['', 'etapa 1', 'etapa 2'], false);
    const [a, b] = d.etapas;
    filaTabla(cuerpo, ['masa inicial', masa(a.masaInicial), masa(b.masaInicial)]);
    filaTabla(cuerpo, ['masa final', masa(a.masaFinal), masa(b.masaFinal)]);
    filaTabla(cuerpo, ['caudal ṁ', `${formatearNumero(a.caudal, 4)} kg/s`, `${formatearNumero(b.caudal, 4)} kg/s`]);
    filaTabla(cuerpo, ['tiempo de combustión', `${formatearNumero(a.tiempoCombustion, 4)} s`, `${formatearNumero(b.tiempoCombustion, 4)} s`]);
    const twr = filaTabla(cuerpo, ['TWR inicial', formatearNumero(a.twrInicial, 3), formatearNumero(b.twrInicial, 3)]);
    twr.title = 'Al encenderse, con la gravedad en la superficie: etapa 1 con empuje a nivel del mar, etapa 2 con empuje en vacío';
    filaTabla(cuerpo, ['Δv ideal', `${formatearNumero(a.deltaVIdeal, 5)} m/s`, `${formatearNumero(b.deltaVIdeal, 5)} m/s`]);
    filaTabla(cuerpo, ['Δv ideal total', `${formatearNumero(d.deltaVIdeal, 5)} m/s`, '']);
  }

  function alEditar(e: HTMLInputElement): void {
    aplicar(e.dataset.campo ?? '', leerNumero(e.value));
    revisar(true);
  }

  function alEditarTabla(e: HTMLInputElement): void {
    const campo = CAMPOS_TABLA.find((c) => c.ruta === e.dataset.campo);
    if (!campo) return;
    entradaActual = campo.escribir(entradaActual, textoATabla(e.value));
    revisar(true);
  }

  /** Valida, pinta y, si todo es válido, programa el recálculo. */
  function revisar(conRetardo: boolean): void {
    const lista = validar();
    pintarErrores(lista);
    pintarDerivados(lista.length === 0);
    clearTimeout(temporizador);
    if (lista.length > 0) return;
    const enviar = (): void => alCambiar(copiarEntrada(entradaActual));
    if (conRetardo) temporizador = setTimeout(enviar, RETARDO_RECALCULO);
    else enviar();
  }

  selector.addEventListener('change', () => {
    const modelo = MODELOS.find((m) => m.id === selector.value);
    if (!modelo) return;
    entradaActual = { ...entradaActual, cohete: copiarCohete(modelo.cohete) };
    construirEntrada();
    revisar(false);
  });

  selectorModelo.addEventListener('change', () => {
    entradaActual = { ...entradaActual, opciones: { ...entradaActual.opciones, modelo: selectorModelo.value as ModeloVuelo } };
    pintarConfiguracion();
    revisar(false);
  });

  selectorMetodo.addEventListener('change', () => {
    entradaActual = { ...entradaActual, opciones: { ...entradaActual.opciones, metodo: selectorMetodo.value as MetodoIntegracion } };
    pintarConfiguracion();
    revisar(false);
  });

  selectorAtmosfera.addEventListener('change', () => {
    entradaActual = { ...entradaActual, opciones: { ...entradaActual.opciones, atmosfera: selectorAtmosfera.value as TipoAtmosfera } };
    pintarConfiguracion();
    revisar(false);
  });

  selectorRotacion.addEventListener('change', () => {
    entradaActual = { ...entradaActual, opciones: { ...entradaActual.opciones, rotacion: selectorRotacion.value === 'si' } };
    pintarConfiguracion();
    revisar(false);
  });

  construirEntrada();
  pintarErrores([]);
  pintarDerivados(validar().length === 0);

  return {
    entrada: () => copiarEntrada(entradaActual),
    cargar(nueva) {
      entradaActual = copiarEntrada(nueva);
      const modelo = MODELOS.find((m) => m.cohete.nombre === nueva.cohete.nombre);
      selector.value = modelo ? modelo.id : '';
      construirEntrada();
      revisar(false);
    },
    setSistema(nuevo) {
      sistema = nuevo;
      pintarDerivados(validar().length === 0);
    },
    mostrarError(mensaje) {
      errorSimulacion.textContent = mensaje ?? '';
    },
  };
}
