# Arquitectura

## Idea principal: calcular primero, reproducir después

Al cambiar un parámetro, se calcula **el vuelo completo** de una vez (unos milisegundos) y se guarda como una lista de muestras. El reproductor solo recorre esa lista en el tiempo.

```
parámetros ──► simular() ──► ResultadoSimulacion ──► reproductor ──► telemetría + gráficas + esquema
 (tabla)        (física)      { muestras, eventos }   (reloj, t)       (paneles)
```

Ventajas:
- Rebobinar, pausar, cambiar la velocidad y saltar a un evento salen gratis.
- El resultado es determinista y exportable: mismos parámetros, mismas muestras.
- La física nunca depende de los fotogramas por segundo.
- Las gráficas tienen todos los datos desde el principio.
- La física se prueba sin navegador.

## Estructura de carpetas

```
simulador-cohetes/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.ts               # arranque: conecta parámetros, simulación y reproductor
│   ├── trabajador.ts         # Web Worker: Richardson y barridos en segundo plano
│   ├── fisica/               # funciones puras: gravedad, atmósfera, motor, arrastre, Tsiolkovski
│   ├── simulacion/           # tipos, integradores, bucle de simulación, eventos, campos de entrada
│   ├── reproduccion/         # reloj de simulación e interpolación entre muestras
│   ├── render/               # esquema a escala en Canvas: perfil del cohete y vectores de fuerza
│   ├── analisis/             # métricas, presupuesto de Δv, Richardson, comparación, barridos
│   ├── exportacion/          # CSV, JSON, SVG y parámetros en la URL
│   ├── ui/                   # parámetros, telemetría, gráficas, eventos, línea de tiempo, análisis
│   ├── modelos/              # cohetes predefinidos, con la fuente de cada dato
│   ├── util/                 # formato numérico y de unidades, interpolación
│   └── estilos/              # CSS
├── tests/                    # tests de Vitest, misma estructura que src/
└── docs/
```

## Reglas de dependencia

```
ui, render ──► reproduccion ──► simulacion ──► fisica
ui ──────────► analisis ───────► simulacion, fisica
ui ──────────► exportacion ───► simulacion
trabajador.ts ──► analisis      (Richardson y barridos en segundo plano)
```

- `fisica/`, `simulacion/`, `reproduccion/`, `analisis/`, `exportacion/` y `util/` **no usan el DOM, Canvas ni `window`**. Solo reciben números y devuelven números u objetos. Se prueban con Vitest sin navegador.
- `render/` y `ui/` **solo leen** el estado interpolado del reproductor; nunca calculan física.
- `analisis/` llama a `simular()` (p. ej. con dt/2 o en un barrido) o a las funciones de `fisica/` (valores derivados de la entrada, sin simular).
- `exportacion/` genera texto (CSV, JSON, SVG, parámetros de la URL); la descarga y el portapapeles son cosa de `ui/`.
- `simulacion/campos.ts` describe cada dato numérico de la entrada (ruta, clave en la URL, unidad, lectura y escritura). Lo usan la tabla de parámetros, la URL, la comparación y los barridos, para que ningún dato se quede fuera de alguno de ellos.
- Nada depende de `ui/` salvo `main.ts`.

## Tipos principales

```ts
interface Etapa {
  masaSeca: number;        // kg
  masaPropelente: number;  // kg
  empujeVacio: number;     // N
  ispNivelMar: number;     // s
  ispVacio: number;        // s
  diametro: number;        // m
  longitud: number;        // m, solo para el esquema; en la etapa 2 incluye la cofia
  cd: number;
}

interface Cohete {
  nombre: string;
  etapas: [Etapa, Etapa];
  masaCargaUtil: number;   // kg
  pausaSeparacion: number; // s
}

interface Muestra {
  t: number;               // s
  altitud: number;         // m
  velocidad: number;       // m/s
  aceleracion: number;     // m/s²
  masa: number;            // kg
  empuje: number;          // N
  caudal: number;          // kg/s
  isp: number;             // s
  twr: number;             // empuje / peso
  etapa: 1 | 2;            // etapa acoplada
  motorEncendido: boolean;
  densidad: number;        // kg/m³
  presion: number;         // Pa
  temperatura: number;     // K
  velocidadSonido: number; // m/s
  presionDinamica: number; // Pa
  mach: number;
  arrastre: number;        // N
  gravedad: number;        // m/s²
  perdidas: {              // acumuladas, m/s
    gravedad: number;
    arrastre: number;
    contrapresion: number;
    direccion: number;     // 0 en 1D
  };
  deltaVIdeal: number;     // acumulada, m/s
}

type TipoEvento =
  | 'despegue' | 'mach1' | 'maxQ' | 'finCombustion1' | 'separacion'
  | 'encendido2' | 'finCombustion2' | 'apogeo' | 'impacto';

interface Evento { tipo: TipoEvento; t: number; estado: Muestra; }

type MetodoIntegracion = 'rk4' | 'eulerSimplectico';

interface OpcionesSimulacion {
  metodo: MetodoIntegracion; // 'rk4' por defecto
  dt: number;               // s, 0,01 por defecto
  duracionMaxima: number;   // s, 7200 por defecto
  altitudInicial: number;   // m; con 0 y velocidad 0 parte de la plataforma
  velocidadInicial: number; // m/s
  gravedad: boolean;        // interruptores para los tests de validación
  arrastre: boolean;
  contrapresion: boolean;   // false: Isp de vacío a cualquier altitud
  detenerEnApogeo: boolean; // true: termina en el apogeo del vuelo balístico (barridos)
}

interface Entrada { cohete: Cohete; opciones: OpcionesSimulacion; } // lo que se edita, se comparte y se barre

// simular(cohete, opciones?: Partial<OpcionesSimulacion>): ResultadoSimulacion
// Lanza ErrorEntrada (con la lista de campos fuera de rango) si la entrada no es válida.

interface ResultadoSimulacion {
  muestras: Muestra[];
  eventos: Evento[];
  despega: boolean;
  resumen: { apogeo: number; velocidadMaxima: number; maxQ: number; deltaVIdeal: number }; // velocidadMaxima = máx |v|
  diagnostico: { metodo: MetodoIntegracion; dt: number; pasos: number; tiempoCalculoMs: number; derivaEnergia: number };
}
```

En la fase 5 se añaden `x`, `y` y los elementos orbitales; `altitud` y `velocidad` se mantienen para que el panel y las gráficas sigan funcionando.

## Reproductor

- Lleva el tiempo de simulación `t`. `main.ts` llama a `avanzar(dtReal)` en cada `requestAnimationFrame` (`t += dtReal · velocidad`); el reproductor no usa el DOM y se prueba sin navegador.
- Busca las dos muestras que rodean `t` con búsqueda binaria e interpola linealmente (`util/interpolacion.ts`). En una discontinuidad (dos muestras con el mismo t) toma el estado posterior.
- Expone `estadoActual(): Muestra` y los eventos ya ocurridos.
- Operaciones: `reproducir()`, `pausar()`, `alternar()`, `irA(t)`, `setVelocidad(x)`, `reiniciar()`, `pasoMuestra(±1)`, `saltarEvento(±1)` y `cargar(resultado)` (al recalcular, mantiene el instante).
- Avisa a sus oyentes (`suscribir`) de cada cambio, con los eventos cruzados al avanzar. Las vistas se redibujan solo entonces.

## Render

- Un `<canvas>` solo para el esquema; las gráficas son de uPlot y la telemetría es HTML con texto.
- Esquema a escala: perfil del cohete en líneas finas y vectores de fuerza con su escala en N. Sin rellenos, sin color salvo el acento.
- La escala de longitudes se fija con el cohete completo y la de fuerzas con el máximo del empuje y del peso en todo el vuelo, para que ninguna cambie durante la reproducción. El arrastre de la reentrada puede superar esa escala: el vector se recorta, se dibuja discontinuo y su módulo se rotula «fuera de escala».
- Se redibuja solo cuando cambia el instante del reproductor.

## Análisis

- `analisis/metricas.ts` define los números que resumen un vuelo (apogeo, v al fin de la combustión 2, Max-Q, instantes de los eventos, pérdidas en el apogeo…). Los usan Richardson, la comparación y los barridos.
- La simulación con la entrada actual se hace en el hilo principal. Lo que repite la simulación varias veces (Richardson con dt/2 y dt/4, barridos de hasta 200 puntos) va a un Web Worker (`trabajador.ts`, cliente en `ui/segundo-plano.ts`): cada petición abre un worker nuevo y una petición nueva cancela la anterior terminando su worker.
- Los barridos simulan con `detenerEnApogeo` y solo ofrecen las métricas que se conocen en el apogeo.
- Comparar: la simulación actual se fija como referencia (entrada y resultado). Las gráficas la superponen sobre un eje t común (`util/series.ts`, interpolando cada serie en los instantes de la otra) y el panel lista las diferencias actual − referencia.
- La URL lleva siempre la entrada de la simulación que se ve (`history.replaceState` tras cada cálculo), con los números escritos por `String()`, que en JavaScript da el double exacto.

## Decisiones

| Decisión | Motivo |
|---|---|
| Sin framework de interfaz (TypeScript puro) | La interfaz son paneles de datos; no compensa un framework |
| Canvas 2D para el esquema | Solo líneas y vectores; no hace falta WebGL |
| Sin elementos decorativos | Herramienta técnica: todo lo que se ve es un dato, una gráfica o un esquema a escala |
| Paso fijo RK4 en lugar de paso adaptativo | Simple, determinista y suficientemente preciso con dt = 0,01 s |
| Simulación principal en el hilo principal | Tarda decenas de milisegundos y la interfaz necesita el resultado enseguida |
| Richardson y barridos en un Web Worker | Repiten la simulación hasta cientos de veces; en el hilo principal bloquearían la interfaz durante segundos |
| SVG generado a mano en lugar de serializar uPlot | uPlot dibuja en canvas; el SVG se construye con los mismos datos, diezmados a unos pocos puntos por píxel |
| uPlot para las gráficas | Muy ligero y rápido con miles de puntos |
| Todo en español | Preferencia del proyecto: documentación, código e interfaz |
