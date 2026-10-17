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
│   ├── fisica/               # funciones puras: gravedad, atmósfera, motor, arrastre, Tsiolkovski
│   ├── simulacion/           # tipos, integrador RK4, bucle de simulación, eventos
│   ├── reproduccion/         # reloj de simulación e interpolación entre muestras
│   ├── render/               # esquema a escala en Canvas: perfil del cohete y vectores de fuerza
│   ├── analisis/             # presupuesto de Δv, Richardson, comparación, barridos
│   ├── exportacion/          # CSV, JSON, SVG y parámetros en la URL
│   ├── ui/                   # parámetros, telemetría, gráficas, eventos, línea de tiempo, diagnóstico
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
ui ──────────► exportacion
```

- `fisica/`, `simulacion/`, `reproduccion/`, `analisis/` y `util/` **no usan el DOM, Canvas ni `window`**. Solo reciben números y devuelven números u objetos. Se prueban con Vitest sin navegador.
- `render/` y `ui/` **solo leen** el estado interpolado del reproductor; nunca calculan física.
- `analisis/` llama a `simular()` (p. ej. con dt/2 o en un barrido) o a las funciones de `fisica/` (valores derivados de la entrada, sin simular).
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

interface OpcionesSimulacion {
  dt: number;               // s, 0,01 por defecto
  duracionMaxima: number;   // s, 7200 por defecto
  altitudInicial: number;   // m; con 0 y velocidad 0 parte de la plataforma
  velocidadInicial: number; // m/s
  gravedad: boolean;        // interruptores para los tests de validación
  arrastre: boolean;
  contrapresion: boolean;   // false: Isp de vacío a cualquier altitud
}

// simular(cohete, opciones?: Partial<OpcionesSimulacion>): ResultadoSimulacion
// Lanza ErrorEntrada (con la lista de campos fuera de rango) si la entrada no es válida.

interface ResultadoSimulacion {
  muestras: Muestra[];
  eventos: Evento[];
  despega: boolean;
  resumen: { apogeo: number; velocidadMaxima: number; maxQ: number; deltaVIdeal: number }; // velocidadMaxima = máx |v|
  diagnostico: { metodo: 'rk4'; dt: number; pasos: number; tiempoCalculoMs: number; derivaEnergia: number }; // 'eulerSimplectico' en la fase 4
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

## Decisiones

| Decisión | Motivo |
|---|---|
| Sin framework de interfaz (TypeScript puro) | La interfaz son paneles de datos; no compensa un framework |
| Canvas 2D para el esquema | Solo líneas y vectores; no hace falta WebGL |
| Sin elementos decorativos | Herramienta técnica: todo lo que se ve es un dato, una gráfica o un esquema a escala |
| Paso fijo RK4 en lugar de paso adaptativo | Simple, determinista y suficientemente preciso con dt = 0,01 s |
| Cálculo en el hilo principal | Tarda milisegundos; pasar a un Web Worker solo si el modo 2D se vuelve lento |
| uPlot para las gráficas | Muy ligero y rápido con miles de puntos |
| Todo en español | Preferencia del proyecto: documentación, código e interfaz |
