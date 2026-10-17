import type { ElementosOrbitales } from '../fisica/orbita';
import type { MetodoIntegracion } from './integrador';

export type { ElementosOrbitales, MetodoIntegracion };

/** Datos de entrada de una etapa. */
export interface Etapa {
  masaSeca: number;       // kg, estructura y motores sin propelente
  masaPropelente: number; // kg
  empujeVacio: number;    // N
  ispNivelMar: number;    // s
  ispVacio: number;       // s
  diametro: number;       // m, para el área frontal
  longitud: number;       // m, solo para el esquema a escala; en la etapa 2 incluye la cofia
  cd: number;             // coeficiente de arrastre, adimensional
}

/** Cohete de dos etapas. */
export interface Cohete {
  nombre: string;
  etapas: [Etapa, Etapa];
  masaCargaUtil: number;   // kg
  pausaSeparacion: number; // s, entre el fin de la etapa 1 y el encendido de la 2
  velocidadManiobra: number; // m/s, solo 2D: |v| al empezar la maniobra de inclinación
  anguloManiobra: number;    // °, solo 2D: inclinación del empuje respecto a la vertical local en la maniobra
}

/** Modelo de vuelo: vertical (1D) o en el plano de la trayectoria (2D). */
export type ModeloVuelo = '1D' | '2D';

/** Configuración de una simulación. Los interruptores físicos sirven para los tests de validación. */
export interface OpcionesSimulacion {
  modelo: ModeloVuelo;
  metodo: MetodoIntegracion;
  dt: number;               // s, paso de integración
  duracionMaxima: number;   // s, límite de seguridad del vuelo simulado
  altitudInicial: number;   // m; con 0 y velocidad 0 el cohete parte de la plataforma
  velocidadInicial: number; // m/s, vertical
  gravedad: boolean;        // false: g = 0
  arrastre: boolean;        // false: D = 0
  contrapresion: boolean;   // false: Isp y empuje de vacío a cualquier altitud
  detenerEnApogeo: boolean; // true: termina en el apogeo del vuelo balístico (barridos)
}

/** Estado completo del vuelo en un instante. */
export interface Muestra {
  t: number;               // s
  altitud: number;         // m
  velocidad: number;       // m/s; en 1D con signo (positiva hacia arriba), en 2D el módulo |v|
  aceleracion: number;     // m/s²; en 1D con signo, en 2D d|v|/dt
  x: number;               // m, posición con origen en el centro de la Tierra; el eje y pasa por la plataforma
  y: number;               // m
  alcance: number;         // m, distancia sobre la superficie desde la plataforma
  velocidadVertical: number;   // m/s, componente radial de la velocidad
  velocidadHorizontal: number; // m/s, componente horizontal local, positiva hacia el alcance creciente
  anguloTrayectoria: number;   // rad, γ: de la horizontal local a la velocidad
  anguloEmpuje: number;        // rad, de la horizontal local al eje del cohete (dirección del empuje)
  anguloAtaque: number;        // rad, α: de la velocidad al eje del cohete
  masa: number;            // kg
  empuje: number;          // N
  caudal: number;          // kg/s
  isp: number;             // s, 0 con el motor apagado
  twr: number;             // empuje / peso con la gravedad local
  etapa: 1 | 2;            // etapa inferior acoplada
  motorEncendido: boolean;
  densidad: number;        // kg/m³
  presion: number;         // Pa
  temperatura: number;     // K
  velocidadSonido: number; // m/s
  presionDinamica: number; // Pa
  mach: number;
  arrastre: number;        // N, módulo
  gravedad: number;        // m/s², la aplicada en la simulación
  perdidas: {              // acumuladas, m/s
    gravedad: number;
    arrastre: number;
    contrapresion: number;
    direccion: number;     // 0 en 1D
  };
  deltaVIdeal: number;     // acumulada, m/s
  orbita: ElementosOrbitales; // instantáneos
}

export type TipoEvento =
  | 'despegue'
  | 'inicioManiobra'
  | 'finManiobra'
  | 'mach1'
  | 'maxQ'
  | 'finCombustion1'
  | 'separacion'
  | 'encendido2'
  | 'finCombustion2'
  | 'orbita'
  | 'apogeo'
  | 'impacto';

export interface Evento {
  tipo: TipoEvento;
  t: number;        // s
  estado: Muestra;
}

export interface ResultadoSimulacion {
  muestras: Muestra[]; // ordenadas por t; en un evento con discontinuidad hay dos con el mismo t
  eventos: Evento[];   // ordenados por t
  despega: boolean;
  resumen: {
    apogeo: number;          // m, altitud máxima
    velocidadMaxima: number; // m/s, máximo de |v|
    maxQ: number;            // Pa, 0 si no hay Max-Q
    deltaVIdeal: number;     // m/s, acumulada al final
  };
  diagnostico: {
    modelo: ModeloVuelo;
    metodo: MetodoIntegracion;
    dt: number;              // s
    pasos: number;
    tiempoCalculoMs: number; // ms
    derivaEnergia: number;   // máximo de |ε(t) − ε(0)| relativo, ver simular.ts
  };
}
