/** Datos de entrada de una etapa. */
export interface Etapa {
  masaSeca: number;       // kg, estructura y motores sin propelente
  masaPropelente: number; // kg
  empujeVacio: number;    // N
  ispNivelMar: number;    // s
  ispVacio: number;       // s
  diametro: number;       // m, para el área frontal
  cd: number;             // coeficiente de arrastre, adimensional
}

/** Cohete de dos etapas. */
export interface Cohete {
  nombre: string;
  etapas: [Etapa, Etapa];
  masaCargaUtil: number;   // kg
  pausaSeparacion: number; // s, entre el fin de la etapa 1 y el encendido de la 2
}

/** Configuración de una simulación. Los interruptores físicos sirven para los tests de validación. */
export interface OpcionesSimulacion {
  dt: number;               // s, paso de integración
  duracionMaxima: number;   // s, límite de seguridad del vuelo simulado
  altitudInicial: number;   // m; con 0 y velocidad 0 el cohete parte de la plataforma
  velocidadInicial: number; // m/s
  gravedad: boolean;        // false: g = 0
  arrastre: boolean;        // false: D = 0
  contrapresion: boolean;   // false: Isp y empuje de vacío a cualquier altitud
}

/** Estado completo del vuelo en un instante. */
export interface Muestra {
  t: number;               // s
  altitud: number;         // m
  velocidad: number;       // m/s
  aceleracion: number;     // m/s²
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
}

export type TipoEvento =
  | 'despegue'
  | 'mach1'
  | 'maxQ'
  | 'finCombustion1'
  | 'separacion'
  | 'encendido2'
  | 'finCombustion2'
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
    metodo: 'rk4';
    dt: number;              // s
    pasos: number;
    tiempoCalculoMs: number; // ms
    derivaEnergia: number;   // máximo de |ε(t) − ε(0)| relativo, ver simular.ts
  };
}
