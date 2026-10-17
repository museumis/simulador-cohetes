import './estilos/base.css';
import { exportarCSV } from './exportacion/csv';
import { ErrorFormato, exportarJSON, leerJSON } from './exportacion/json';
import { codificarURL, decodificarURL } from './exportacion/url';
import { crearEsquema } from './render/esquema';
import { crearTrayectoria, type EscalaTrayectoria } from './render/trayectoria';
import { Reproductor } from './reproduccion/reproductor';
import type { Entrada } from './simulacion/campos';
import { simular } from './simulacion/simular';
import type { ResultadoSimulacion } from './simulacion/tipos';
import { ErrorEntrada } from './simulacion/validacion';
import { crearBarrido } from './ui/barrido';
import { crearComparacion, type Simulacion } from './ui/comparacion';
import { crearDiagnostico, textoMetodo } from './ui/diagnostico';
import { crearListaEventos } from './ui/eventos';
import { crearBarraExportar, descargar, nombreArchivo } from './ui/exportar';
import { crearGraficas } from './ui/graficas';
import { crearLineaTiempo } from './ui/linea-tiempo';
import { ABREVIATURAS_ATMOSFERA, type SistemaUnidades } from './ui/magnitudes';
import { crearParametros } from './ui/parametros';
import { crearPestanas } from './ui/pestanas';
import { crearPresupuesto } from './ui/presupuesto';
import { crearTarea, TareaCancelada } from './ui/segundo-plano';
import { crearTelemetria } from './ui/telemetria';
import { instalarTeclado } from './ui/teclado';

/** Mayor salto de reloj real que se aplica de una vez (s): evita saltos al volver a la pestaña. */
const DT_REAL_MAXIMO = 0.1;

function elemento<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Falta el elemento #${id}`);
  return e as T;
}

type Tema = 'oscuro' | 'claro';

const raiz = document.documentElement;
const botonTema = elemento<HTMLButtonElement>('boton-tema');
const botonUnidades = elemento<HTMLButtonElement>('boton-unidades');
const botonParametros = elemento<HTMLButtonElement>('boton-parametros');
const panelParametros = elemento('panel-parametros');
const resumen = elemento('resumen-configuracion');
const panelTrayectoria = elemento('panel-trayectoria');
const botonEscalaTrayectoria = elemento<HTMLButtonElement>('boton-escala-trayectoria');

let sistema: SistemaUnidades = 'practico';
let tema: Tema = matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
let iniciado = false;
let actual: Simulacion;
let referencia: Simulacion | null = null;
let escalaTrayectoria: EscalaTrayectoria = 'exagerada';

const tareaRichardson = crearTarea();
const tareaBarrido = crearTarea();

const pestanas = crearPestanas(elemento('panel-analisis'), [
  { id: 'eventos', titulo: 'eventos' },
  { id: 'diagnostico', titulo: 'diagnóstico' },
  { id: 'comparacion', titulo: 'comparación' },
  { id: 'barrido', titulo: 'barrido' },
]);
const telemetria = crearTelemetria(elemento('panel-telemetria'));
const presupuesto = crearPresupuesto(elemento('panel-presupuesto'));
const graficas = crearGraficas(elemento('graficas-tiempo'), (t) => reproductor.irA(t));
const trayectoria = crearTrayectoria(elemento<HTMLCanvasElement>('lienzo-trayectoria'), (t) => reproductor.irA(t));
const esquema = crearEsquema(elemento<HTMLCanvasElement>('lienzo-esquema'));
const eventos = crearListaEventos(pestanas.panel('eventos'), (t) => reproductor.irA(t));
const diagnostico = crearDiagnostico(pestanas.panel('diagnostico'), elemento('panel-diagnostico'));
const parametros = crearParametros(panelParametros, (e) => {
  if (iniciado) calcular(e);
});
const comparacion = crearComparacion(pestanas.panel('comparacion'), {
  fijar() {
    referencia = actual;
    graficas.setReferencia(referencia.resultado);
    comparacion.actualizar(actual, referencia);
  },
  quitar() {
    referencia = null;
    graficas.setReferencia(null);
    comparacion.actualizar(actual, referencia);
  },
});
const barrido = crearBarrido(pestanas.panel('barrido'), () => parametros.entrada(), tareaBarrido, (nombre, texto) =>
  descargar(nombre, texto, 'text/csv'),
);
const barraExportar = crearBarraExportar(elemento('barra-exportar'), elemento<HTMLButtonElement>('boton-exportar'), {
  csv: () => descargar(`${nombreArchivo(actual.entrada.cohete.nombre)}.csv`, exportarCSV(actual.resultado), 'text/csv'),
  json: () =>
    descargar(`${nombreArchivo(actual.entrada.cohete.nombre)}.json`, exportarJSON(actual.entrada, actual.resultado), 'application/json'),
  svg: () =>
    descargar(`${nombreArchivo(actual.entrada.cohete.nombre)}-graficas.svg`, graficas.exportarSVG(textoConfiguracion()), 'image/svg+xml'),
  async enlace() {
    await navigator.clipboard.writeText(location.href);
    return location.href;
  },
  cargarJSON(texto) {
    try {
      const entrada = leerJSON(texto);
      parametros.cargar(entrada);
      barraExportar.avisar(`cargado: ${entrada.cohete.nombre}`);
    } catch (e) {
      if (!(e instanceof ErrorFormato)) throw e;
      barraExportar.avisar(`no se ha podido cargar: ${e.message}`);
    }
  },
});

/** Simula; si la entrada no es válida, informa y devuelve null. */
function intentarSimular(e: Entrada): ResultadoSimulacion | null {
  try {
    const r = simular(e.cohete, e.opciones);
    parametros.mostrarError(null);
    return r;
  } catch (error) {
    if (error instanceof ErrorEntrada) {
      parametros.mostrarError(error.message);
      return null;
    }
    throw error;
  }
}

function textoConfiguracion(): string {
  const d = actual.resultado.diagnostico;
  const rotacion = d.modelo === '2D' ? `   ROT: ${d.rotacion ? 'sí' : 'no'}` : '';
  return `COHETE: ${actual.entrada.cohete.nombre}   MODELO: ${d.modelo}   ATM: ${ABREVIATURAS_ATMOSFERA[d.atmosfera]}${rotacion}   INT: ${textoMetodo(d)}`;
}

/** Estima el error por Richardson en segundo plano; una simulación nueva cancela la anterior. */
function estimarError(sim: Simulacion): void {
  diagnostico.richardson({ estado: 'calculando' });
  tareaRichardson.ejecutar({ tipo: 'richardson', entrada: sim.entrada }).then(
    (r) => {
      if (r.tipo === 'richardson' && sim === actual) diagnostico.richardson({ estado: 'hecho', estimacion: r.estimacion });
    },
    (e: unknown) => {
      if (e instanceof TareaCancelada) return;
      diagnostico.richardson({ estado: 'error', mensaje: e instanceof Error ? e.message : String(e) });
    },
  );
}

/** Reparte una simulación nueva entre todas las vistas. El reproductor va el último: su aviso las redibuja. */
function cargarSimulacion(sim: Simulacion): void {
  actual = sim;
  resumen.textContent = textoConfiguracion();
  const plano = sim.resultado.diagnostico.modelo === '2D';
  telemetria.setModelo(sim.resultado.diagnostico.modelo);
  panelTrayectoria.hidden = !plano;
  trayectoria.cargar(sim.resultado);
  graficas.cargar(sim.resultado);
  esquema.cargar(sim.entrada.cohete, sim.resultado);
  eventos.cargar(sim.resultado.eventos);
  presupuesto.cargar(sim.resultado);
  diagnostico.cargar(sim.resultado);
  comparacion.actualizar(sim, referencia);
  estimarError(sim);
  // La URL reproduce siempre la simulación que se ve.
  history.replaceState(null, '', `?${codificarURL(sim.entrada)}`);
}

/** Recalcula tras un cambio de parámetros. Solo se llama después del arranque. */
function calcular(e: Entrada): void {
  const r = intentarSimular(e);
  if (!r) return;
  cargarSimulacion({ entrada: e, resultado: r });
  // El reproductor necesita la duración nueva antes de colocar las marcas de la línea de tiempo.
  reproductor.cargar(r);
  lineaTiempo.cargar(r.eventos);
}

// Arranque: la entrada de la URL si la hay; si no es válida, el modelo por defecto mientras se corrige.
const porDefecto = parametros.entrada();
const desdeURL = decodificarURL(location.search, porDefecto);
if (desdeURL) parametros.cargar(desdeURL);
let entradaInicial = parametros.entrada();
let inicial = intentarSimular(entradaInicial);
if (!inicial) {
  entradaInicial = porDefecto;
  inicial = intentarSimular(porDefecto);
  if (!inicial) throw new Error('El modelo por defecto no es válido');
  parametros.mostrarError('La URL contiene datos no válidos: se muestra el modelo por defecto hasta corregirlos.');
}
const reproductor = new Reproductor(inicial);
const lineaTiempo = crearLineaTiempo(elemento('panel-reproductor'), reproductor);

reproductor.suscribir((cambio) => {
  telemetria.actualizar(cambio.estado);
  presupuesto.actualizar(cambio.estado);
  graficas.cursor(cambio.t);
  esquema.dibujar(cambio.estado);
  if (!panelTrayectoria.hidden) trayectoria.dibujar(cambio.estado);
  eventos.actualizar(cambio.t);
  lineaTiempo.actualizar(cambio);
});

function aplicarTema(): void {
  raiz.dataset.theme = tema === 'claro' ? 'light' : 'dark';
  botonTema.textContent = `tema: ${tema}`;
  graficas.refrescarTema();
  esquema.refrescarTema();
  trayectoria.refrescarTema();
  barrido.refrescarTema();
}

function aplicarSistema(): void {
  botonUnidades.textContent = sistema === 'si' ? 'unidades: SI' : 'unidades: km · km/h · kN';
  telemetria.setSistema(sistema);
  graficas.setSistema(sistema);
  eventos.setSistema(sistema);
  parametros.setSistema(sistema);
  esquema.setUnidades(sistema);
  trayectoria.setUnidades(sistema);
  reproductor.irA(reproductor.t);
}

function alternarParametros(): void {
  const abrir = panelParametros.hidden;
  panelParametros.hidden = !abrir;
  botonParametros.setAttribute('aria-expanded', String(abrir));
}

botonTema.addEventListener('click', () => {
  tema = tema === 'oscuro' ? 'claro' : 'oscuro';
  aplicarTema();
  reproductor.irA(reproductor.t);
});
botonUnidades.addEventListener('click', () => {
  sistema = sistema === 'si' ? 'practico' : 'si';
  aplicarSistema();
});
botonParametros.addEventListener('click', alternarParametros);
function aplicarEscalaTrayectoria(): void {
  botonEscalaTrayectoria.textContent = escalaTrayectoria === 'real' ? 'escala real' : 'exageración vertical';
  botonEscalaTrayectoria.setAttribute('aria-pressed', String(escalaTrayectoria === 'exagerada'));
  trayectoria.setEscala(escalaTrayectoria);
}
botonEscalaTrayectoria.addEventListener('click', () => {
  escalaTrayectoria = escalaTrayectoria === 'real' ? 'exagerada' : 'real';
  aplicarEscalaTrayectoria();
});
aplicarEscalaTrayectoria();
instalarTeclado(reproductor, { alternarParametros, alternarExportar: () => barraExportar.alternar() });

raiz.dataset.theme = tema === 'claro' ? 'light' : 'dark';
botonTema.textContent = `tema: ${tema}`;
botonParametros.setAttribute('aria-expanded', 'true');
cargarSimulacion({ entrada: entradaInicial, resultado: inicial });
lineaTiempo.cargar(inicial.eventos);
aplicarSistema();
iniciado = true;

let instanteAnterior = performance.now();
function fotograma(ahora: number): void {
  reproductor.avanzar(Math.min((ahora - instanteAnterior) / 1000, DT_REAL_MAXIMO));
  instanteAnterior = ahora;
  requestAnimationFrame(fotograma);
}
requestAnimationFrame(fotograma);
