import { areaFrontal, cdSegunMach, derivadaPresionDinamicaPlana, fuerzaArrastre, presionDinamica } from '../fisica/arrastre';
import { altitudesCapas, crearDatosAtmosfera, funcionAtmosfera, type FuncionAtmosfera } from '../fisica/atmosfera';
import { G0, MU_TIERRA, OMEGA_TIERRA, RADIO_TIERRA } from '../fisica/constantes';
import { gravedad } from '../fisica/gravedad';
import { masaInicial, masasCombustion } from '../fisica/masas';
import { caudalMasico, ispSegunPresion, nivelRegulacion } from '../fisica/motor';
import { elementosOrbitales, margenOrbita, periodoOrbital, type ElementosOrbitales } from '../fisica/orbita';
import { crearIntegrador, esAdaptativo, interpolarHermite, type FuncionDerivada, type Integrador } from './integrador';
import { buscarRaiz } from './raiz';
import type { Cohete, Etapa, Evento, Muestra, OpcionesSimulacion, ResultadoSimulacion, TipoEvento } from './tipos';
import { DURACION_MAXIMA, ErrorEntrada, validarCohete, validarOpciones } from './validacion';

// Índices del vector de estado. La posición tiene su origen en el centro de la Tierra y la
// plataforma está en (0, R); en 1D x y vx son siempre 0.
const X = 0;         // posición (m)
const Y = 1;         // posición (m)
const VX = 2;        // velocidad (m/s)
const VY = 3;        // velocidad (m/s)
const M = 4;         // masa (kg)
const DV_IDEAL = 5;  // Δv ideal acumulada (m/s)
const P_GRAV = 6;    // pérdida por gravedad acumulada (m/s)
const P_ARR = 7;     // pérdida por arrastre acumulada (m/s)
const P_CONTRA = 8;  // pérdida por contrapresión acumulada (m/s)
const P_DIR = 9;     // pérdida por dirección acumulada (m/s)
const ANGULO = 10;   // ángulo central recorrido desde la plataforma (rad), para el alcance
const TRABAJO = 11;  // trabajo específico de empuje y arrastre (J/kg), para la deriva de energía
const N = 12;

/** Periodo de muestreo de la salida (s): 20 Hz. */
const PERIODO_MUESTREO = 0.05;

/** Periodo de muestreo del vuelo orbital tras la inserción (s): 1 Hz basta con la interpolación lineal. */
export const PERIODO_MUESTREO_ORBITAL = 1;

/**
 * Vuelo orbital que se simula tras el fin de la combustión 2 con un método de paso fijo, si el
 * cohete queda en órbita (s). Basta para comprobar que los elementos se conservan; una vuelta
 * completa son unos 550 000 pasos más con dt = 0,01 s. Con paso adaptativo se simula una vuelta.
 */
export const DURACION_ORBITAL = 600;

/**
 * Paso máximo del método adaptativo (s). En órbita la tolerancia admitiría pasos mayores, pero
 * las muestras se interpolan dentro del paso con Hermite cúbico, cuyo error crece con h⁴.
 */
export const PASO_MAXIMO_ADAPTATIVO = 10;

/** Anchura del intervalo con la que se da por localizado un evento dentro del paso (s). */
const TOLERANCIA_EVENTO = 1e-12;

export const OPCIONES_POR_DEFECTO: Readonly<OpcionesSimulacion> = {
  modelo: '1D',
  metodo: 'rk4',
  dt: 0.01,
  tolerancia: 1e-9,
  atmosfera: 'exponencial',
  rotacion: false,
  duracionMaxima: DURACION_MAXIMA,
  altitudInicial: 0,
  velocidadInicial: 0,
  gravedad: true,
  arrastre: true,
  contrapresion: true,
  detenerEnApogeo: false,
};

/**
 * Opciones con las que se abre la interfaz: modelo 2D, US Standard Atmosphere 1976, rotación
 * terrestre y paso adaptativo. OPCIONES_POR_DEFECTO conserva los modelos anteriores para que los
 * enlaces y archivos antiguos den el mismo resultado.
 */
export const OPCIONES_ALTA_FIDELIDAD: Readonly<Partial<OpcionesSimulacion>> = {
  modelo: '2D',
  metodo: 'dormandPrince',
  atmosfera: 'estandar1976',
  rotacion: true,
};

/** Datos de un cohete que pueden faltar en archivos y enlaces anteriores a la fase en que se añadieron. */
export const DATOS_COHETE_POR_DEFECTO: Readonly<
  Pick<Cohete, 'velocidadManiobra' | 'anguloManiobra' | 'aceleracionMaxima' | 'latitudLanzamiento' | 'azimutLanzamiento'>
> = {
  velocidadManiobra: 60,
  anguloManiobra: 3,
  aceleracionMaxima: 0,
  latitudLanzamiento: 0,
  azimutLanzamiento: 90,
};

type Fase = 'plataforma' | 'combustion1' | 'pausa' | 'combustion2' | 'balistico';

/**
 * Programa de inclinación (solo 2D, docs/FISICA.md § Modelo 2D): subida vertical, maniobra con el
 * empuje inclinado un ángulo fijo respecto a la vertical local y giro gravitatorio con el empuje
 * alineado con la velocidad respecto al aire. En 1D el programa es siempre 'vertical'.
 */
type Programa = 'vertical' | 'maniobra' | 'giro';

/** Discontinuidades que dependen del estado: el paso se acorta para terminar justo en ellas. */
type Discontinuidad = 'impacto' | 'despegue' | 'agotado' | 'regulacion' | 'programa' | 'nodo';

/**
 * Valores de una magnitud en los que la derivada tiene una esquina (nodos de la tabla Cd(Mach),
 * cambios de capa de la atmósfera). El paso termina justo al cruzar cada uno para que la esquina
 * no degrade el orden del método.
 */
interface Nodos {
  valores: readonly number[]; // crecientes
  medir: (y: Float64Array) => number;
  tramo: number;              // −1 antes del primero, i si valores[i] ≤ x < valores[i + 1]
}

function tramoNodos(valores: readonly number[], x: number): number {
  let i = -1;
  while (i + 1 < valores.length && valores[i + 1]! <= x) i++;
  return i;
}

/** Por qué termina integrarHasta. */
type FinIntegracion = 'objetivo' | 'agotado' | 'fin';

/** Configuración constante entre dos discontinuidades del vuelo. */
interface Tramo {
  fase: Fase;
  etapa: 1 | 2;          // etapa inferior acoplada
  motor: Etapa | null;   // etapa con el motor encendido
  caudalNominal: number; // kg/s, al 100 %
  masaFinal: number;     // kg, al agotar el propelente del motor encendido
  area: number;          // m², de la etapa inferior acoplada
  acoplada: Etapa;       // su Cd o su tabla Cd(Mach)
}

/** Fuerzas y condiciones en un instante. */
interface Fuerzas {
  radio: number;           // m, distancia al centro de la Tierra
  altitud: number;         // m
  rx: number;              // vertical local (unitario)
  ry: number;
  modulo: number;          // m/s, |v|
  velocidadAire: number;   // m/s, |v − ω × r|
  aireX: number;           // velocidad respecto al aire (m/s)
  aireY: number;
  ejeX: number;            // eje del cohete y dirección del empuje (unitario)
  ejeY: number;
  cosDireccion: number;    // coseno del ángulo entre el eje y la velocidad inercial; 1 si v = 0
  cosArrastre: number;     // coseno del ángulo entre la velocidad respecto al aire y la inercial; 1 si alguna es 0
  empuje: number;          // N
  empujeVacio: number;     // N, con el mismo caudal
  caudal: number;          // kg/s
  isp: number;             // s
  gravedad: number;        // m/s², la aplicada
  densidad: number;        // kg/m³
  presion: number;         // Pa
  temperatura: number;     // K
  velocidadSonido: number; // m/s
  mach: number;
  cd: number;
  presionDinamica: number; // Pa
  arrastre: number;        // N, módulo
  ax: number;              // m/s², aceleración
  ay: number;
}

/** Candidato a un evento de máximo (apogeo, Max-Q): se queda el de mayor valor. */
interface Candidato {
  t: number;
  y: Float64Array;
  tramo: Tramo;
  programa: Programa;
  valor: number;
}

const radio = (y: Float64Array): number => Math.sqrt(y[X]! * y[X]! + y[Y]! * y[Y]!);
const altitud = (y: Float64Array): number => radio(y) - RADIO_TIERRA;
const modulo = (y: Float64Array): number => Math.sqrt(y[VX]! * y[VX]! + y[VY]! * y[VY]!);
/** Componente radial de la velocidad, dh/dt. En 1D (x = 0) es exactamente vy. */
const velocidadVertical = (y: Float64Array): number => (y[X]! * y[VX]! + y[Y]! * y[VY]!) / radio(y);
const elementos = (y: Float64Array): ElementosOrbitales => elementosOrbitales(y[X]!, y[Y]!, y[VX]!, y[VY]!);

function crearTramo(fase: Fase, etapa: 1 | 2, acoplada: Etapa, motor: Etapa | null, masaFinal = 0): Tramo {
  return {
    fase,
    etapa,
    motor,
    caudalNominal: motor ? caudalMasico(motor) : 0,
    masaFinal,
    area: areaFrontal(acoplada.diametro),
    acoplada,
  };
}

/**
 * Simula el vuelo completo de un cohete de dos etapas, vertical (1D) o en el plano (2D).
 * Integra con paso fijo (RK4 o Euler simpléctico) o adaptativo (Dormand–Prince 5(4)). Los pasos
 * se acortan para terminar justo en cada discontinuidad (despegue, fines de combustión, cambios
 * de regulación, del programa de inclinación y nodos de la tabla Cd(Mach)), y los demás eventos se
 * localizan dentro del paso buscando la raíz sobre el propio paso del integrador.
 * En 2D, si el cohete queda en órbita, la simulación termina DURACION_ORBITAL (paso fijo) o una
 * vuelta (paso adaptativo) después del fin de la combustión 2.
 * @throws {ErrorEntrada} si algún dato está fuera de rango
 */
export function simular(cohete: Cohete, opciones: Partial<OpcionesSimulacion> = {}): ResultadoSimulacion {
  const o: OpcionesSimulacion = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const errores = [...validarCohete(cohete), ...validarOpciones(o)];
  if (errores.length > 0) throw new ErrorEntrada(errores);

  const inicio = performance.now();
  const vuelo = new Vuelo(cohete, o);
  vuelo.ejecutar();
  const resultado = vuelo.resultado();
  resultado.diagnostico.tiempoCalculoMs = performance.now() - inicio;
  return resultado;
}

/**
 * Intercala las muestras de los eventos entre las periódicas, ambas ya ordenadas por t.
 * Con el mismo t va primero la periódica, que se toma del tramo anterior a la discontinuidad.
 */
function mezclar(periodicas: Muestra[], eventos: Evento[]): Muestra[] {
  const resultado: Muestra[] = new Array(periodicas.length + eventos.length);
  let i = 0;
  let j = 0;
  for (let k = 0; k < resultado.length; k++) {
    const e = eventos[j];
    const p = periodicas[i];
    resultado[k] = e && (!p || e.estado.t < p.t) ? eventos[j++]!.estado : periodicas[i++]!;
  }
  return resultado;
}

class Vuelo {
  private readonly cohete: Cohete;
  private readonly opciones: OpcionesSimulacion;
  private readonly es2D: boolean;
  private readonly adaptativo: boolean;
  private readonly integrador: Integrador;
  private readonly derivada: FuncionDerivada = (y, dy) => this.evaluarDerivada(y, dy);
  private readonly calcularAtmosfera: FuncionAtmosfera;
  // Inclinación del empuje en la maniobra, respecto a la vertical local.
  private readonly senoManiobra: number;
  private readonly cosenoManiobra: number;
  /**
   * Velocidad angular de la atmósfera en el plano de la trayectoria (rad/s): ω · cos(latitud) ·
   * sen(azimut), la componente de la rotación terrestre normal al plano. 0 en 1D o sin rotación.
   * Gira en el sentido del alcance creciente: el viento en r⃗ es Ω · (y, −x).
   */
  private readonly omega: number;

  // Estado al principio (y, dy) y al final (y1, dy1) del paso en curso.
  private t = 0;
  private y = new Float64Array(N);
  private dy = new Float64Array(N);
  private y1 = new Float64Array(N);
  private dy1 = new Float64Array(N);
  // Estado en un instante intermedio del paso (eventos y muestras).
  private readonly yAux = new Float64Array(N);
  private readonly dyAux = new Float64Array(N);

  private tramo!: Tramo;
  private tramoDespegue!: Tramo;
  private programa: Programa = 'vertical';
  private nivel = 1;          // nivel del perfil de regulación
  private limitada = false;   // empuje regulado por el límite de aceleración
  private readonly nodosMach: Nodos;  // de la tabla Cd(Mach) de la etapa inferior acoplada
  private readonly nodosCapa: Nodos;  // cambios de capa de la atmósfera
  private readonly atmosfera = crearDatosAtmosfera();
  private readonly f: Fuerzas = {
    radio: 0,
    altitud: 0,
    rx: 0,
    ry: 0,
    modulo: 0,
    velocidadAire: 0,
    aireX: 0,
    aireY: 0,
    ejeX: 0,
    ejeY: 0,
    cosDireccion: 1,
    cosArrastre: 1,
    empuje: 0,
    empujeVacio: 0,
    caudal: 0,
    isp: 0,
    gravedad: 0,
    densidad: 0,
    presion: 0,
    temperatura: 0,
    velocidadSonido: 0,
    mach: 0,
    cd: 0,
    presionDinamica: 0,
    arrastre: 0,
    ax: 0,
    ay: 0,
  };
  private despegado = false;
  private mach1Visto = false;
  private orbitaVista = false;
  private apogeo: Candidato | null = null;
  private maxQ: Candidato | null = null;
  private periodoMuestreo = PERIODO_MUESTREO;
  private origenMuestreo = 0;
  private siguienteMuestra = 1;
  private dqInicio = 0;      // dq/dt al principio del paso, la del final del anterior
  private margenInicio = 0;  // margenOrbita al principio del paso (2D)
  private pasoPropuesto: number; // s, siguiente paso del método adaptativo
  private pasos = 0;
  private rechazados = 0;
  private energiaInicial = 0;
  private derivaEnergiaMaxima = 0;
  private terminado = false; // apogeo balístico con detenerEnApogeo

  private readonly muestras: Muestra[] = []; // las periódicas, en orden
  private readonly eventos: Evento[] = [];

  constructor(cohete: Cohete, opciones: OpcionesSimulacion) {
    this.cohete = cohete;
    this.opciones = opciones;
    this.es2D = opciones.modelo === '2D';
    this.adaptativo = esAdaptativo(opciones.metodo);
    this.integrador = crearIntegrador(opciones.metodo, N, [X, Y], [VX, VY], opciones.tolerancia);
    this.calcularAtmosfera = funcionAtmosfera(opciones.atmosfera);
    this.nodosMach = { valores: [], medir: (y) => this.machEn(y), tramo: -1 };
    // Con Cd constante y la atmósfera exponencial la esquina de la temperatura no afecta a las fuerzas.
    const capasRelevantes =
      opciones.arrastre && (opciones.atmosfera === 'estandar1976' || cohete.etapas.some((e) => e.tablaCd.length > 0));
    this.nodosCapa = { valores: capasRelevantes ? altitudesCapas(opciones.atmosfera) : [], medir: altitud, tramo: -1 };
    this.pasoPropuesto = opciones.dt;
    const grado = Math.PI / 180;
    this.senoManiobra = Math.sin(cohete.anguloManiobra * grado);
    this.cosenoManiobra = Math.cos(cohete.anguloManiobra * grado);
    this.omega =
      this.es2D && opciones.rotacion
        ? OMEGA_TIERRA * Math.cos(cohete.latitudLanzamiento * grado) * Math.sin(cohete.azimutLanzamiento * grado)
        : 0;
  }

  /** Recorre la secuencia de vuelo de FISICA.md hasta el impacto, la órbita o el límite de duración. */
  ejecutar(): void {
    const { cohete, opciones } = this;
    const [e1, e2] = cohete.etapas;
    const [masas1, masas2] = masasCombustion(cohete.etapas, cohete.masaCargaUtil);

    const plataforma = crearTramo('plataforma', 1, e1, e1, masas1.final);
    const combustion1 = crearTramo('combustion1', 1, e1, e1, masas1.final);
    const pausa = crearTramo('pausa', 2, e2, null);
    const combustion2 = crearTramo('combustion2', 2, e2, e2, masas2.final);
    const balistico = crearTramo('balistico', 2, e2, null);
    this.tramoDespegue = combustion1;

    // Velocidad inicial vertical respecto al suelo, más la del suelo: solo la usan los tests.
    const r0 = RADIO_TIERRA + opciones.altitudInicial;
    this.y[Y] = r0;
    this.y[VX] = this.omega * r0;
    this.y[VY] = opciones.velocidadInicial;
    this.y[M] = masaInicial(cohete.etapas, cohete.masaCargaUtil);
    this.energiaInicial = this.energia(this.y);

    if (opciones.altitudInicial === 0 && opciones.velocidadInicial === 0) {
      this.iniciar(plataforma);
      this.comprobarDespegue();
    } else {
      this.despegado = true;
      this.iniciar(combustion1);
      if (this.es2D && this.velocidadAire(this.y) >= cohete.velocidadManiobra) this.cambiarPrograma('maniobra');
    }

    if (this.quemar(e1) === 'fin') return;
    this.y[M] = masas1.final; // elimina el redondeo acumulado
    this.registrarEvento('finCombustion1');
    // F ≤ m·g durante toda la combustión de la etapa 1: no despega.
    if (!this.despegado) return;
    this.cambiarTramo(pausa, e1.masaSeca);
    this.registrarEvento('separacion');

    if (this.integrarHasta(this.t + cohete.pausaSeparacion) === 'fin') return;
    this.cambiarTramo(combustion2);
    this.registrarEvento('encendido2');

    if (this.quemar(e2) === 'fin') return;
    this.y[M] = masas2.final;
    this.registrarEvento('finCombustion2');
    this.cambiarTramo(balistico);

    // En órbita el vuelo no termina en un impacto: se simula un tramo de vuelo orbital.
    const orbita = elementos(this.y);
    if (this.es2D && margenOrbita(orbita) > 0) {
      this.periodoMuestreo = PERIODO_MUESTREO_ORBITAL;
      this.origenMuestreo = this.t;
      this.siguienteMuestra = 1;
      this.integrarHasta(this.t + (this.adaptativo ? periodoOrbital(orbita.semiejeMayor) : DURACION_ORBITAL));
    } else {
      this.integrarHasta(Infinity);
    }
  }

  resultado(): ResultadoSimulacion {
    for (const [tipo, c] of [['apogeo', this.apogeo], ['maxQ', this.maxQ]] as const) {
      if (c) this.registrarEvento(tipo, c.t, c.y, c.tramo, c.programa);
    }
    // Orden estable: en una discontinuidad se conserva el orden antes → después.
    this.eventos.sort((a, b) => a.t - b.t);
    // Si el vuelo se corta por duracionMaxima o en órbita, la última muestra es el estado final.
    const ultimoInstante = Math.max(this.muestras.at(-1)!.t, this.eventos.at(-1)?.t ?? 0);
    if (this.t > ultimoInstante) this.muestras.push(this.crearMuestra(this.t, this.y, this.tramo, this.programa));
    const muestras = mezclar(this.muestras, this.eventos);

    let apogeo = -Infinity;
    let velocidadMaxima = 0;
    for (const m of muestras) {
      apogeo = Math.max(apogeo, m.altitud);
      velocidadMaxima = Math.max(velocidadMaxima, Math.abs(m.velocidad));
    }
    const escalaEnergia = Math.max(Math.abs(this.energiaInicial), 0.5 * velocidadMaxima * velocidadMaxima);
    const ultima = muestras[muestras.length - 1]!;
    const o = this.opciones;

    return {
      muestras,
      eventos: this.eventos,
      despega: this.despegado,
      resumen: {
        apogeo,
        velocidadMaxima,
        maxQ: this.maxQ?.valor ?? 0,
        deltaVIdeal: ultima.deltaVIdeal,
      },
      diagnostico: {
        modelo: o.modelo,
        metodo: o.metodo,
        dt: o.dt,
        tolerancia: o.tolerancia,
        atmosfera: o.atmosfera,
        rotacion: this.omega !== 0,
        pasos: this.pasos,
        pasosRechazados: this.rechazados,
        tiempoCalculoMs: 0,
        derivaEnergia: escalaEnergia > 0 ? this.derivaEnergiaMaxima / escalaEnergia : 0,
      },
    };
  }

  /**
   * Combustión de la etapa con el motor encendido, desde el instante actual hasta agotar su
   * propelente, recorriendo los tramos de su perfil de regulación.
   */
  private quemar(etapa: Etapa): FinIntegracion {
    const encendido = this.t;
    // Sin propelente la combustión termina en el mismo instante.
    if (this.y[M]! <= this.tramo.masaFinal) return 'agotado';
    for (const [t, nivel] of etapa.regulacion) {
      if (t <= 0) continue;
      const fin = this.integrarHasta(encendido + t);
      if (fin !== 'objetivo') return fin;
      // El caudal salta: dos muestras con el mismo t, antes y después (la de antes puede ser la periódica).
      if (this.muestras.at(-1)!.t !== this.t) this.muestras.push(this.crearMuestra(this.t, this.y, this.tramo, this.programa));
      this.nivel = nivel;
      this.elegirRegimen();
      this.trasDiscontinuidad();
      this.muestras.push(this.crearMuestra(this.t, this.y, this.tramo, this.programa));
      this.comprobarDespegue();
    }
    return this.integrarHasta(Infinity);
  }

  /** Velocidad respecto al aire, |v − Ω · (y, −x)|. */
  private velocidadAire(y: Float64Array): number {
    return Math.hypot(y[VX]! - this.omega * y[Y]!, y[VY]! + this.omega * y[X]!);
  }

  /** Empuje nominal (sin el límite de aceleración) en un estado: nivel · ṁ0 · g0 · Isp(p). */
  private empujeNominal(tramo: Tramo, y: Float64Array): number {
    if (!tramo.motor) return 0;
    const isp = this.opciones.contrapresion
      ? ispSegunPresion(tramo.motor, this.calcularAtmosfera(altitud(y), this.atmosfera).presion)
      : tramo.motor.ispVacio;
    return this.nivel * tramo.caudalNominal * G0 * isp;
  }

  /** Margen hasta el límite de aceleración: a_max − F_nominal / m; positivo si no limita. */
  private margenLimite(y: Float64Array): number {
    return this.cohete.aceleracionMaxima - this.empujeNominal(this.tramo, y) / y[M]!;
  }

  /** Decide en el instante actual si el límite de aceleración regula el empuje. */
  private elegirRegimen(): void {
    this.limitada = this.tramo.motor !== null && this.cohete.aceleracionMaxima > 0 && this.margenLimite(this.y) < 0;
  }

  /**
   * En la plataforma, peso efectivo menos empuje: m · (g − Ω² · r) − F. El despegue es su cruce
   * por 0 hacia abajo.
   */
  private margenDespegue(y: Float64Array): number {
    const f = this.fuerzas(this.tramo, this.programa, y);
    return y[M]! * (f.gravedad - this.omega * this.omega * f.radio) - f.empuje;
  }

  /** Si el empuje ya supera el peso en la plataforma, despega en el instante actual. */
  private comprobarDespegue(): void {
    if (this.tramo.fase === 'plataforma' && this.margenDespegue(this.y) <= 0) this.despegar();
  }

  private despegar(): void {
    this.despegado = true;
    this.cambiarTramo(this.tramoDespegue);
    this.registrarEvento('despegue');
  }

  /** Calcula las fuerzas en `this.f`, que se reutiliza para no reservar memoria en cada evaluación. */
  private fuerzas(tramo: Tramo, programa: Programa, y: Float64Array): Fuerzas {
    const o = this.opciones;
    const f = this.f;
    const omega = this.omega;
    const x = y[X]!;
    const yy = y[Y]!;
    const vx = y[VX]!;
    const vy = y[VY]!;
    const m = y[M]!;
    // En 1D x = 0, así que r = y, la vertical local es (0, 1) y todo queda en el eje y sin redondeo.
    const r = Math.sqrt(x * x + yy * yy);
    const h = r - RADIO_TIERRA;
    const rx = x / r;
    const ry = yy / r;
    const v = Math.sqrt(vx * vx + vy * vy);
    const ux = v > 0 ? vx / v : 0;
    const uy = v > 0 ? vy / v : 0;
    // Velocidad respecto a la atmósfera, que gira con la Tierra.
    const aireX = vx - omega * yy;
    const aireY = vy + omega * x;
    const va = Math.sqrt(aireX * aireX + aireY * aireY);
    const uax = va > 0 ? aireX / va : 0;
    const uay = va > 0 ? aireY / va : 0;

    // Eje del cohete según el programa de inclinación. La horizontal local es (ry, −rx).
    let ejeX = rx;
    let ejeY = ry;
    if (programa === 'maniobra') {
      ejeX = this.cosenoManiobra * rx + this.senoManiobra * ry;
      ejeY = this.cosenoManiobra * ry - this.senoManiobra * rx;
    } else if (programa === 'giro' && va > 0) {
      ejeX = uax;
      ejeY = uay;
    }

    const atm = this.calcularAtmosfera(h, this.atmosfera);
    const mach = va / atm.velocidadSonido;
    let empuje = 0;
    let empujeVacio = 0;
    let caudal = 0;
    let isp = 0;
    if (tramo.motor) {
      isp = o.contrapresion ? ispSegunPresion(tramo.motor, atm.presion) : tramo.motor.ispVacio;
      caudal = this.nivel * tramo.caudalNominal;
      empuje = caudal * G0 * isp;
      if (this.limitada) {
        // Regulación automática: F/m = a_max, con el caudal que da ese empuje al Isp actual.
        empuje = this.cohete.aceleracionMaxima * m;
        caudal = empuje / (G0 * isp);
      }
      empujeVacio = caudal * G0 * tramo.motor.ispVacio;
    }
    const g = o.gravedad ? gravedad(h) : 0;
    const cd = cdSegunMach(tramo.acoplada.tablaCd, tramo.acoplada.cd, mach);
    const q = presionDinamica(atm.densidad, va);
    const arrastre = o.arrastre ? fuerzaArrastre(q, cd, tramo.area) : 0;
    if (tramo.fase === 'plataforma') {
      // Quieto respecto al suelo: movimiento circular uniforme con la rotación (en reposo sin ella).
      f.ax = 0 - omega * omega * x;
      f.ay = 0 - omega * omega * yy;
    } else {
      // Empuje según el eje, arrastre opuesto a la velocidad respecto al aire y gravedad hacia el centro.
      f.ax = (empuje * ejeX - arrastre * uax) / m - g * rx;
      f.ay = (empuje * ejeY - arrastre * uay) / m - g * ry;
    }
    f.radio = r;
    f.altitud = h;
    f.rx = rx;
    f.ry = ry;
    f.modulo = v;
    f.velocidadAire = va;
    f.aireX = aireX;
    f.aireY = aireY;
    f.ejeX = ejeX;
    f.ejeY = ejeY;
    // Sin rotación la velocidad respecto al aire es la inercial: cosArrastre = 1 y, en el giro, cosDireccion = 1 sin redondeo.
    const cosAire = omega !== 0 && v > 0 && va > 0 ? uax * ux + uay * uy : 1;
    f.cosDireccion = programa === 'giro' && va > 0 ? cosAire : v > 0 ? ejeX * ux + ejeY * uy : 1;
    f.cosArrastre = cosAire;
    f.empuje = empuje;
    f.empujeVacio = empujeVacio;
    f.caudal = caudal;
    f.isp = isp;
    f.gravedad = g;
    f.densidad = atm.densidad;
    f.presion = atm.presion;
    f.temperatura = atm.temperatura;
    f.velocidadSonido = atm.velocidadSonido;
    f.mach = mach;
    f.cd = cd;
    f.presionDinamica = q;
    f.arrastre = arrastre;
    return f;
  }

  private evaluarDerivada(y: Float64Array, dy: Float64Array): void {
    const tramo = this.tramo;
    const vx = y[VX]!;
    const vy = y[VY]!;
    const m = y[M]!;
    const f = this.fuerzas(tramo, this.programa, y);
    const enPlataforma = tramo.fase === 'plataforma';
    dy[X] = vx;
    dy[Y] = vy;
    dy[VX] = f.ax;
    dy[VY] = f.ay;
    dy[M] = -f.caudal;
    dy[DV_IDEAL] = f.empujeVacio / m;
    dy[P_CONTRA] = (f.empujeVacio - f.empuje) / m;
    // En la plataforma la reacción del suelo N anula lo que el empuje no levanta:
    // g − N/m = F/m se cuenta como pérdida por gravedad y el presupuesto sigue cerrando.
    // En 2D la pérdida es g · sin γ; en 1D se toma sin γ = 1 (docs/FISICA.md § Pérdidas de Δv).
    const senoTrayectoria = f.modulo > 0 ? (f.rx * vx + f.ry * vy) / f.modulo : 1;
    dy[P_GRAV] = enPlataforma ? f.empuje / m : this.es2D ? f.gravedad * senoTrayectoria : f.gravedad;
    // Solo la componente del arrastre según la velocidad inercial frena |v|.
    dy[P_ARR] = (f.arrastre * f.cosArrastre) / m;
    dy[P_DIR] = this.es2D && !enPlataforma ? (f.empuje * (1 - f.cosDireccion)) / m : 0;
    dy[ANGULO] = (y[Y]! * vx - y[X]! * vy) / (f.radio * f.radio);
    dy[TRABAJO] = enPlataforma ? 0 : (f.empuje * (f.ejeX * vx + f.ejeY * vy) - f.arrastre * f.cosArrastre * f.modulo) / m;
  }

  /** dq/dt en un estado, con la aceleración de su derivada y la velocidad respecto al aire. */
  private derivadaQ(y: Float64Array, dy: Float64Array): number {
    const atm = this.calcularAtmosfera(altitud(y), this.atmosfera);
    const omega = this.omega;
    const ax = y[VX]! - omega * y[Y]!;
    const ay = y[VY]! + omega * y[X]!;
    // d(v − Ω·(y, −x))/dt = a − Ω·(vy, −vx)
    const dax = dy[VX]! - omega * y[VY]!;
    const day = dy[VY]! + omega * y[VX]!;
    return derivadaPresionDinamicaPlana(atm.densidad, atm.derivadaDensidad, velocidadVertical(y), ax * ax + ay * ay, ax * dax + ay * day);
  }

  private presionDinamicaEn(y: Float64Array): number {
    return presionDinamica(this.calcularAtmosfera(altitud(y), this.atmosfera).densidad, this.velocidadAire(y));
  }

  private machEn(y: Float64Array): number {
    return this.velocidadAire(y) / this.calcularAtmosfera(altitud(y), this.atmosfera).velocidadSonido;
  }

  /**
   * Energía mecánica específica menos el trabajo de empuje y arrastre: ε = v²/2 − μ/r − W.
   * Es constante en la solución exacta; su deriva mide el error numérico.
   */
  private energia(y: Float64Array): number {
    const v = modulo(y);
    const potencial = this.opciones.gravedad ? -MU_TIERRA / radio(y) : 0;
    return 0.5 * v * v + potencial - y[TRABAJO]!;
  }

  /**
   * Función que se anula en el siguiente cambio del programa de inclinación, positiva antes;
   * null si no hay ninguno pendiente. Usa la velocidad respecto al aire.
   */
  private funcionPrograma(): ((y: Float64Array) => number) | null {
    if (!this.es2D || !this.despegado) return null;
    if (this.programa === 'vertical') return (y) => this.cohete.velocidadManiobra - this.velocidadAire(y);
    if (this.programa === 'maniobra') {
      // La maniobra termina cuando la velocidad tiene la inclinación del empuje: γ = 90° − θ.
      const objetivo = Math.atan2(this.cosenoManiobra, this.senoManiobra);
      return (y) => {
        const r = radio(y);
        const vr = (y[X]! * y[VX]! + y[Y]! * y[VY]!) / r;
        const vh = (y[Y]! * y[VX]! - y[X]! * y[VY]!) / r - this.omega * r;
        return Math.atan2(vr, vh) - objetivo;
      };
    }
    return null;
  }

  private iniciar(tramo: Tramo): void {
    this.tramo = tramo;
    this.nivel = tramo.motor ? nivelRegulacion(tramo.motor.regulacion, 0) : 1;
    this.elegirRegimen();
    this.situarNodos();
    this.derivada(this.y, this.dy);
    this.dqInicio = this.derivadaQ(this.y, this.dy);
    if (this.es2D) this.margenInicio = margenOrbita(elementos(this.y));
    this.muestras.push(this.crearMuestra(0, this.y, tramo, this.programa));
  }

  /**
   * Cambia de tramo en el instante actual, soltando `masaSoltada` (kg). Un motor que se enciende
   * empieza con el primer nivel de su perfil de regulación.
   */
  private cambiarTramo(nuevo: Tramo, masaSoltada = 0): void {
    this.y[M] = this.y[M]! - masaSoltada;
    if (nuevo.motor !== this.tramo.motor) this.nivel = nuevo.motor ? nivelRegulacion(nuevo.motor.regulacion, 0) : 1;
    this.tramo = nuevo;
    this.elegirRegimen();
    this.situarNodos();
    this.trasDiscontinuidad();
  }

  /** Pasa a la siguiente fase del programa de inclinación en el instante actual y registra el evento. */
  private cambiarPrograma(nuevo: Programa): void {
    this.programa = nuevo;
    this.trasDiscontinuidad();
    this.registrarEvento(nuevo === 'maniobra' ? 'inicioManiobra' : 'finManiobra');
  }

  /**
   * Recalcula la derivada tras un cambio de las fuerzas en el instante actual.
   * Si dq/dt pasa de positiva a negativa justo aquí (p. ej. al apagarse el motor),
   * el Max-Q puede estar en este instante.
   */
  private trasDiscontinuidad(): void {
    const dqAntes = this.dqInicio;
    this.derivada(this.y, this.dy);
    const dqDespues = this.derivadaQ(this.y, this.dy);
    this.dqInicio = dqDespues;
    if (this.despegado && velocidadVertical(this.y) > 0 && dqAntes > 0 && dqDespues <= 0) {
      this.maxQ = this.proponer(this.maxQ, this.t, this.y, this.presionDinamicaEn(this.y));
    }
  }

  /** Funciones de las discontinuidades que dependen del estado, positivas antes de cada una. */
  private discontinuidades(): [Discontinuidad, (y: Float64Array) => number][] {
    const lista: [Discontinuidad, (y: Float64Array) => number][] = [];
    const tramo = this.tramo;
    if (this.despegado) lista.push(['impacto', altitud]);
    if (tramo.fase === 'plataforma') lista.push(['despegue', (y) => this.margenDespegue(y)]);
    if (tramo.motor) {
      lista.push(['agotado', (y) => y[M]! - tramo.masaFinal]);
      if (this.cohete.aceleracionMaxima > 0) {
        const signo = this.limitada ? -1 : 1;
        lista.push(['regulacion', (y) => signo * this.margenLimite(y)]);
      }
    }
    const programa = this.funcionPrograma();
    if (programa) lista.push(['programa', programa]);
    return lista;
  }

  /** Toma los nodos Cd(Mach) de la etapa acoplada y sitúa el estado actual entre los nodos. */
  private situarNodos(): void {
    this.nodosMach.valores = this.opciones.arrastre ? this.tramo.acoplada.tablaCd.map(([mach]) => mach) : [];
    for (const n of [this.nodosMach, this.nodosCapa]) n.tramo = tramoNodos(n.valores, n.medir(this.y));
  }

  /**
   * Si al final del paso la magnitud está en otro tramo de los nodos, función que se anula en el
   * nodo que se cruza primero (positiva antes) y tramo al que se pasa; null si no cruza ninguno.
   */
  private cruceNodo(n: Nodos): { funcion: (y: Float64Array) => number; tramo: number } | null {
    if (n.valores.length === 0) return null;
    const final = tramoNodos(n.valores, n.medir(this.y1));
    if (final === n.tramo) return null;
    const sube = final > n.tramo;
    const nodo = n.valores[sube ? n.tramo + 1 : n.tramo]!;
    return { funcion: (y) => (sube ? nodo - n.medir(y) : n.medir(y) - nodo), tramo: sube ? n.tramo + 1 : n.tramo - 1 };
  }

  /**
   * Integra con el tramo actual hasta `tFin`, o hasta una discontinuidad que termine el tramo
   * (fin de la combustión), el impacto o el límite de duración.
   */
  private integrarHasta(tFin: number): FinIntegracion {
    const { dt, duracionMaxima } = this.opciones;
    const objetivo = Math.min(tFin, duracionMaxima);
    const inicio = this.t;
    let k = 1;
    while (this.t < objetivo) {
      let t1: number;
      let h: number;
      let recortado = false;
      if (this.adaptativo) {
        h = Math.min(this.pasoPropuesto, PASO_MAXIMO_ADAPTATIVO);
        if (this.t + h > objetivo - 1e-9 * h) {
          h = objetivo - this.t;
          recortado = true;
        }
        t1 = this.t + h;
      } else {
        // Paso fijo contado desde el inicio del tramo; el último se ajusta para acabar en `objetivo`.
        t1 = inicio + k * dt;
        if (t1 > objetivo - 1e-9 * dt) t1 = objetivo;
        h = t1 - this.t;
      }
      this.integrador.paso(this.derivada, this.y, this.dy, h, this.y1);
      if (this.adaptativo) {
        const error = this.integrador.error();
        // Control clásico del paso: h · 0,9 · error^(−1/5), entre ×0,2 y ×5.
        const factor = error > 0 ? Math.min(5, Math.max(0.2, 0.9 * error ** -0.2)) : 5;
        if (error > 1) {
          this.pasoPropuesto = h * factor;
          this.rechazados++;
          continue;
        }
        // Un paso recortado para llegar a `objetivo` no hace crecer el siguiente.
        this.pasoPropuesto = recortado ? Math.min(this.pasoPropuesto, h * factor) : h * factor;
      } else {
        k++;
      }
      this.derivada(this.y1, this.dy1);
      this.pasos++;

      // Discontinuidades dentro del paso: se acorta para terminar justo en la primera.
      let fin: Discontinuidad | null = null;
      for (const [tipo, funcion] of this.discontinuidades()) {
        const g0 = funcion(this.y);
        const g1 = funcion(this.y1);
        if (g0 > 0 && g1 <= 0) {
          h = this.acortar(h, funcion, g0, g1);
          fin = tipo;
        }
      }
      // Nodos: el tramo nuevo solo se aplica si el paso termina en el nodo o después.
      const tramosNodos: [Nodos, number][] = [];
      let nodoFinal: Nodos | null = null;
      for (const n of [this.nodosMach, this.nodosCapa]) {
        const cruce = this.cruceNodo(n);
        if (!cruce) continue;
        const g0 = cruce.funcion(this.y);
        const g1 = cruce.funcion(this.y1);
        if (g0 > 0 && g1 <= 0) {
          h = this.acortar(h, cruce.funcion, g0, g1);
          fin = 'nodo';
          nodoFinal = n;
        }
        tramosNodos.push([n, cruce.tramo]);
      }
      if (fin === 'impacto') {
        // La raíz deja un residuo del orden de 1e-9 m; el impacto es h = 0 por definición.
        const escala = RADIO_TIERRA / radio(this.y1);
        this.y1[X] = this.y1[X]! * escala;
        this.y1[Y] = this.es2D ? this.y1[Y]! * escala : RADIO_TIERRA;
      }
      if (fin) t1 = this.t + h;

      this.detectarEventos(h);
      this.muestrear(h, t1);
      this.avanzar(t1);
      for (const [n, tramo] of tramosNodos) {
        // Si otra discontinuidad ha acortado el paso, solo se pasa el nodo en el que termina.
        if (fin === null || n === nodoFinal) n.tramo = tramo;
      }
      switch (fin) {
        case 'impacto':
          this.registrarEvento('impacto');
          return 'fin';
        case 'agotado':
          return 'agotado';
        case 'despegue':
          this.despegar();
          break;
        case 'regulacion':
          this.limitada = !this.limitada;
          this.trasDiscontinuidad();
          break;
        case 'programa':
          this.cambiarPrograma(this.programa === 'vertical' ? 'maniobra' : 'giro');
          break;
        default:
          break;
      }
      if (this.terminado) return 'fin';
    }
    return tFin > duracionMaxima ? 'fin' : 'objetivo';
  }

  /** Acorta el paso en curso hasta la raíz de `funcion` y deja ahí el estado final (y1, dy1). */
  private acortar(h: number, funcion: (y: Float64Array) => number, g0: number, g1: number): number {
    const tau = this.localizar(h, funcion, g0, g1);
    this.y1.set(this.yAux);
    this.dy1.set(this.dyAux);
    return tau;
  }

  /** Busca dentro del paso [t, t + h] los eventos sin instante conocido de antemano. */
  private detectarEventos(h: number): void {
    const { y, y1, dy1 } = this;
    const dq0 = this.dqInicio;
    const dq1 = this.derivadaQ(y1, dy1);
    this.dqInicio = dq1;
    let margen0 = 0;
    let margen1 = 0;
    if (this.es2D) {
      margen0 = this.margenInicio;
      margen1 = margenOrbita(elementos(y1));
      this.margenInicio = margen1;
    }
    if (!this.despegado) return;

    if (!this.mach1Visto) {
      const mach = (ya: Float64Array): number => this.machEn(ya) - 1;
      const g0 = mach(y);
      const g1 = mach(y1);
      if (g0 < 0 && g1 >= 0) {
        const tau = this.localizar(h, mach, g0, g1);
        this.mach1Visto = true;
        this.registrarEvento('mach1', this.t + tau, this.yAux);
      }
    }

    if (this.es2D && !this.orbitaVista && margen0 <= 0 && margen1 > 0) {
      const tau = this.localizar(h, (ya) => margenOrbita(elementos(ya)), margen0, margen1);
      this.orbitaVista = true;
      this.registrarEvento('orbita', this.t + tau, this.yAux);
    }

    const vr0 = velocidadVertical(y);
    const vr1 = velocidadVertical(y1);
    if (vr0 > 0 && vr1 <= 0) {
      const tau = this.localizar(h, velocidadVertical, vr0, vr1);
      // Igual que en el impacto: en 1D v = 0 por definición, sin el residuo de la raíz.
      if (!this.es2D) this.yAux[VY] = 0;
      this.apogeo = this.proponer(this.apogeo, this.t + tau, this.yAux, altitud(this.yAux));
      // Sin motor ya no puede haber otro apogeo más alto.
      if (this.opciones.detenerEnApogeo && this.tramo.fase === 'balistico') this.terminado = true;
    }

    if (vr0 > 0 && dq0 > 0 && dq1 <= 0) {
      const tau = this.localizar(h, (ya, dya) => this.derivadaQ(ya, dya), dq0, dq1);
      if (velocidadVertical(this.yAux) > 0) {
        this.maxQ = this.proponer(this.maxQ, this.t + tau, this.yAux, this.presionDinamicaEn(this.yAux));
      }
    }
  }

  /**
   * Localiza dentro del paso actual el instante en que `funcion` se anula, evaluando el
   * propio paso del integrador acortado. Deja en yAux y dyAux el estado en ese instante.
   * @returns tiempo desde el inicio del paso (s)
   */
  private localizar(
    h: number,
    funcion: (y: Float64Array, dy: Float64Array) => number,
    g0: number,
    g1: number,
  ): number {
    const evaluar = (tau: number): number => {
      this.integrador.paso(this.derivada, this.y, this.dy, tau, this.yAux);
      this.derivada(this.yAux, this.dyAux);
      return funcion(this.yAux, this.dyAux);
    };
    const tau = buscarRaiz(evaluar, 0, h, g0, g1, TOLERANCIA_EVENTO);
    evaluar(tau);
    return tau;
  }

  private proponer(actual: Candidato | null, t: number, y: Float64Array, valor: number): Candidato {
    if (actual && actual.valor >= valor) return actual;
    return { t, y: y.slice(), tramo: this.tramo, programa: this.programa, valor };
  }

  /** Añade las muestras periódicas que caen en (t, t1], interpolando dentro del paso. */
  private muestrear(h: number, t1: number): void {
    const instante = (): number => this.origenMuestreo + this.siguienteMuestra * this.periodoMuestreo;
    for (let tm = instante(); tm <= t1; this.siguienteMuestra++, tm = instante()) {
      interpolarHermite(this.y, this.dy, this.y1, this.dy1, h, (tm - this.t) / h, this.yAux);
      this.muestras.push(this.crearMuestra(tm, this.yAux, this.tramo, this.programa));
    }
  }

  private avanzar(t1: number): void {
    const y = this.y;
    this.y = this.y1;
    this.y1 = y;
    const dy = this.dy;
    this.dy = this.dy1;
    this.dy1 = dy;
    this.t = t1;
    const deriva = Math.abs(this.energia(this.y) - this.energiaInicial);
    if (deriva > this.derivaEnergiaMaxima) this.derivaEnergiaMaxima = deriva;
  }

  private registrarEvento(
    tipo: TipoEvento,
    t: number = this.t,
    y: Float64Array = this.y,
    tramo: Tramo = this.tramo,
    programa: Programa = this.programa,
  ): void {
    const estado = this.crearMuestra(t, y, tramo, programa);
    this.eventos.push({ tipo, t, estado });
  }

  private crearMuestra(t: number, y: Float64Array, tramo: Tramo, programa: Programa): Muestra {
    const vx = y[VX]!;
    const vy = y[VY]!;
    const m = y[M]!;
    const f = this.fuerzas(tramo, programa, y);
    const h = f.altitud;
    const v = f.modulo;
    const vr = f.rx * vx + f.ry * vy;
    const vh = f.ry * vx - f.rx * vy;
    const gamma = v > 0 ? Math.atan2(vr, vh) : Math.PI / 2;
    // Sin rotación, la velocidad respecto al aire es la inercial: mismo ángulo, sin redondeo.
    const gammaAire =
      this.omega === 0 ? gamma : f.velocidadAire > 0 ? Math.atan2(vr, f.ry * f.aireX - f.rx * f.aireY) : Math.PI / 2;
    // En el giro gravitatorio el eje es la velocidad respecto al aire: α = 0 exacto, sin el redondeo de las dos atan2.
    const eje =
      programa === 'giro' && f.velocidadAire > 0
        ? gammaAire
        : Math.atan2(f.rx * f.ejeX + f.ry * f.ejeY, f.ry * f.ejeX - f.rx * f.ejeY);
    let ataque = eje - gammaAire;
    if (ataque > Math.PI) ataque -= 2 * Math.PI;
    else if (ataque <= -Math.PI) ataque += 2 * Math.PI;
    // En 2D la aceleración es d|v|/dt; con v = 0 fuera de la plataforma, |a|.
    const tangencial = v > 0 ? (f.ax * vx + f.ay * vy) / v : Math.hypot(f.ax, f.ay);
    return {
      t,
      altitud: h,
      velocidad: this.es2D ? v : vy,
      aceleracion: this.es2D ? tangencial : f.ay,
      x: y[X]!,
      y: y[Y]!,
      // Sobre la superficie, que gira Ω·t desde el lanzamiento.
      alcance: RADIO_TIERRA * (y[ANGULO]! - this.omega * t),
      velocidadVertical: vr,
      velocidadHorizontal: vh,
      anguloTrayectoria: gamma,
      anguloEmpuje: eje,
      anguloAtaque: ataque,
      anguloTrayectoriaAire: gammaAire,
      velocidadAire: f.velocidadAire,
      masa: m,
      empuje: f.empuje,
      caudal: f.caudal,
      regulacion: tramo.motor ? f.caudal / tramo.caudalNominal : 0,
      isp: f.isp,
      // Con la gravedad local, para que el despegue sea exactamente TWR = 1 sin rotación.
      twr: f.empuje / (m * gravedad(h)),
      etapa: tramo.etapa,
      motorEncendido: tramo.motor !== null,
      densidad: f.densidad,
      presion: f.presion,
      temperatura: f.temperatura,
      velocidadSonido: f.velocidadSonido,
      presionDinamica: f.presionDinamica,
      mach: f.mach,
      arrastre: f.arrastre,
      cd: f.cd,
      gravedad: f.gravedad,
      perdidas: {
        gravedad: y[P_GRAV]!,
        arrastre: y[P_ARR]!,
        contrapresion: y[P_CONTRA]!,
        direccion: y[P_DIR]!,
      },
      deltaVIdeal: y[DV_IDEAL]!,
      orbita: elementos(y),
    };
  }
}
