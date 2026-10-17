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
ui ──────────► analisis ───────► simulacion
ui ──────────► exportacion
```

- `fisica/` y `simulacion/` **no usan el DOM, Canvas ni `window`**. Solo reciben números y devuelven números u objetos. Se prueban con Vitest sin navegador.
- `render/` y `ui/` **solo leen** el estado interpolado del reproductor; nunca calculan física.
- `analisis/` llama a `simular()` (p. ej. con dt/2 o en un barrido) y no usa el DOM.
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

interface ResultadoSimulacion {
  muestras: Muestra[];
  eventos: Evento[];
  despega: boolean;
  resumen: { apogeo: number; velocidadMaxima: number; maxQ: number; deltaVIdeal: number };
  diagnostico: { metodo: 'rk4' | 'eulerSimplectico'; dt: number; pasos: number; tiempoCalculoMs: number; derivaEnergia: number };
}
```

En la fase 5 se añaden `x`, `y` y los elementos orbitales; `altitud` y `velocidad` se mantienen para que el panel y las gráficas sigan funcionando.

## Reproductor

- Lleva el tiempo de simulación `t` y lo avanza en cada `requestAnimationFrame`: `t += dtReal · velocidad`.
- Busca las dos muestras que rodean `t` con búsqueda binaria e interpola linealmente.
- Expone `estadoActual(): Muestra` y los eventos ya ocurridos.
- Operaciones: `reproducir()`, `pausar()`, `irA(t)`, `setVelocidad(x)` y `reiniciar()`.
- Avisa a `ui/` cuando se cruza un evento (para resaltarlo en la lista).

## Render

- Un `<canvas>` solo para el esquema; las gráficas son de uPlot y la telemetría es HTML con texto.
- Esquema a escala: perfil del cohete en líneas finas y vectores de fuerza con su escala en N. Sin rellenos, sin color salvo el acento.
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
