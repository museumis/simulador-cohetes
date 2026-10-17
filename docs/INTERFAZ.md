# Interfaz

## Principios

- **Herramienta de ingeniería, no un juego.** Sin ilustraciones, partículas, llamas, sonido, vibraciones, degradados ni decoración.
- **Los datos son la interfaz:** cada elemento en pantalla es una magnitud con su unidad, una gráfica con ejes rotulados o un esquema a escala.
- **Paleta neutra:** escala de grises sobre fondo oscuro o claro. Un único color de acento para el cursor de tiempo y la selección. Las series de una gráfica se distinguen por tipo de línea (continua, discontinua, punteada) antes que por color.
- **Tipografía monoespaciada** para todos los valores numéricos, alineados por la coma decimal.
- **Precisión explícita:** cifras significativas coherentes con el modelo, notación científica cuando corresponda y unidades SI siempre visibles (con la opción de mostrar km, t y kN).
- **Manejo con teclado** en todo.

## Distribución

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ COHETE: prueba-01   MODELO: 1D  ATM: exp  INT: RK4 dt=1.000e-2 s   [PARÁM]   │
├────────────────────────────────────┬─────────────────────────────────────────┤
│ TELEMETRÍA            T+ 142.350 s │                                         │
│ h        48 213.7    m             │   h [km]                                │
│ v         1 512.04   m/s           │   80 ┤                     ╭──          │
│ a            31.82   m/s²  3.24 g  │   40 ┤             ╭───────╯            │
│ m        93 418.     kg            │    0 ┼─────────────╯                    │
│ F       934.1e3      N             │      └────┬────┬────┬────┬──── t [s]    │
│ ṁ           291.5    kg/s          │          50  100  150  200              │
│ Isp         339.8    s             │                                         │
│ TWR           3.24                 │   (gráficas apiladas, eje t común)      │
│ ρ        1.381e-3    kg/m³         ├─────────────────────────────────────────┤
│ p           11.92    Pa            │ ESQUEMA (a escala)    │ EVENTOS         │
│ q         1 578.     Pa            │                       │ T+  0.000 desp. │
│ Mach          5.01                 │        ↑ F            │ T+ 58.210 M1    │
│ etapa         2   (on)             │        ▯              │ T+ 71.904 maxQ  │
├────────────────────────────────────┤        ▯              │ T+ 138.0 MECO   │
│ PRESUPUESTO Δv            [m/s]    │        ↓ D  ↓ W       │ T+ 138.0 sep.   │
│ ideal (vacío)   3 048.8            │                       │ T+ 141.0 ign.2  │
│ − gravedad      1 302.8            │                       │                 │
│ − arrastre        141.6            │                       │                 │
│ − contrapresión    92.4            │                       │                 │
│ = actual        1 512.0  (Δ 3e-7)  │                       │                 │
├────────────────────────────────────┴───────────────────────┴─────────────────┤
│ [␣] ▶  ×1 ×10 ×100   ├──────●──┼──┼───────┼─────────────────┤  T+ / T_total  │
├──────────────────────────────────────────────────────────────────────────────┤
│ DIAGNÓSTICO: 23 815 pasos · 4.2 ms · deriva E 2.1e-9 · Richardson Δh_ap 0.4 m │
└──────────────────────────────────────────────────────────────────────────────┘
```

Los valores son solo ilustrativos. El presupuesto de Δv se refiere a lo acumulado hasta el instante actual: la Δv ideal crece con el propelente quemado.

## Paneles

### Telemetría
Todas las variables de estado y derivadas en el instante actual, con su unidad: t, h, v, a (también en g), m, F, ṁ, Isp, TWR, ρ, p, T, velocidad del sonido, Mach, q, etapa y estado del motor. En 2D se añaden x, y, alcance, ángulo de trayectoria γ, ángulo de empuje y los elementos orbitales instantáneos.

### Gráficas
- Gráficas apiladas con un eje de tiempo común y un cursor sincronizado con el reproductor.
- Series disponibles: cualquier variable de la telemetría. Por defecto: h, v, a, m, q y Mach.
- Líneas verticales en los eventos.
- Zoom y desplazamiento con el ratón; doble clic para restablecer.
- Escala logarítmica opcional por eje (útil para ρ, p y q).
- En 2D, además: altitud frente al alcance, a escala real o con exageración vertical indicada en el eje.

### Esquema
- Perfil del cohete en líneas finas y a escala (longitud y diámetro de cada etapa), sin relleno ni color.
- Vectores de fuerza (empuje, arrastre, peso) con longitud proporcional al módulo y escala indicada en N.
- En 2D: vector velocidad, ángulo de ataque y ángulo de trayectoria con cotas.

### Presupuesto de Δv
Δv ideal menos cada pérdida acumulada hasta el instante actual (ver [FISICA.md § Pérdidas de Δv](FISICA.md#pérdidas-de-δv)), y la diferencia con la velocidad real como comprobación de cierre.

### Eventos
Lista con el instante exacto (T+ con milisegundos) y el estado completo en ese instante. Al hacer clic, el reproductor salta al evento.

### Diagnóstico numérico
Método de integración, dt, número de pasos, tiempo de cálculo, deriva de energía en las fases balísticas y estimación del error por extrapolación de Richardson (comparando con dt/2).

### Parámetros
- Panel lateral con todos los datos de entrada en una tabla, con unidad y validación en cada campo.
- Valores derivados mostrados al lado, sin editar: masa al despegue, ṁ, tiempo de combustión, TWR inicial y Δv ideal por etapa.
- Selección de modelo: 1D o 2D, tipo de atmósfera, método de integración y dt.

## Reproductor

- Reproducir/pausar, ×0.1, ×1, ×10 y ×100, paso a paso de una muestra.
- Línea de tiempo con marcas en los eventos; se puede arrastrar.
- Tiempo actual y tiempo total con milisegundos.

## Exportación

- CSV con todas las muestras y todas las variables, con unidades en la cabecera.
- JSON con los parámetros de entrada, la configuración del modelo y los eventos, para reproducir la simulación exactamente.
- Gráficas en SVG.

## Teclado

| Tecla | Acción |
|---|---|
| Espacio | Reproducir / pausar |
| ← / → | Retroceder / avanzar una muestra |
| Mayús + ← / → | Saltar al evento anterior / siguiente |
| 1–4 | Velocidad ×0.1 / ×1 / ×10 / ×100 |
| Inicio | Volver a T+0 |
| P | Abrir o cerrar los parámetros |
| E | Exportar |

## Adaptación

- Pensada para escritorio (pantallas de 1280 px o más).
- En pantallas estrechas, los paneles se apilan en vertical; no se eliminan datos.
- Tema oscuro y claro, ambos en escala de grises.
