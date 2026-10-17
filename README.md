# Simulador de cohetes

**Web:** https://museumis.github.io/simulador-cohetes/

Simulador técnico del ascenso de un cohete de dos etapas. Integra numéricamente el vuelo completo en el navegador (empuje dependiente de la presión, gravedad variable, atmósfera estándar, arrastre según el Mach, rotación terrestre, separación de etapas, giro gravitatorio e inserción en órbita) y lo presenta como telemetría, gráficas sincronizadas y un esquema a escala, con presupuesto de Δv y diagnóstico del error numérico.

Es una herramienta de ingeniería, no un juego: no hay ilustraciones, partículas, sonido ni efectos. Todo lo que aparece en pantalla es una magnitud con su unidad, una gráfica con ejes rotulados o un esquema a escala. Funciona entero en el navegador, sin servidor.

## Contenido

- [Funcionalidades](#funcionalidades)
- [Modelo físico](#modelo-físico)
- [Modelos predefinidos](#modelos-predefinidos)
- [Validación](#validación)
- [Uso](#uso)
- [Arquitectura](#arquitectura)
- [Desarrollo](#desarrollo)
- [Despliegue](#despliegue)
- [Estado y hoja de ruta](#estado-y-hoja-de-ruta)
- [Documentación](#documentación)
- [Origen](#origen)

## Funcionalidades

### Simulación

- Cohete de dos etapas definido por etapa: masa seca, masa de propelente, empuje en vacío, Isp a nivel del mar y en vacío, diámetro, longitud, Cd constante o tabla Cd(Mach) y perfil de regulación del empuje.
- Datos del conjunto: carga útil, pausa entre separación y encendido de la etapa 2, límite de aceleración (regulación automática), maniobra de inclinación (velocidad y ángulo) y lugar de lanzamiento (latitud y azimut).
- Modelo **1D** (vertical) o **2D** (plano, con origen en el centro de la Tierra, programa de inclinación y giro gravitatorio).
- Atmósfera **exponencial** o **US Standard Atmosphere 1976** completa hasta 86 km.
- **Rotación terrestre** en 2D: velocidad inicial del suelo y velocidad respecto al aire.
- Integradores: **RK4** de paso fijo, **Euler simpléctico** (para comparar) y **Dormand–Prince 5(4)** de paso adaptativo con tolerancia configurable.
- Si el cohete llega a órbita, la simulación sigue una vuelta completa (con Dormand–Prince).
- La página se abre en alta fidelidad: 2D, US Standard 1976, rotación terrestre y Dormand–Prince.

### Telemetría y eventos

- Todas las variables en cada instante, con su unidad: t, h, v, a (también en g), m, F, ṁ, nivel de regulación, Isp, TWR, ρ, p, T, velocidad del sonido, Mach, q, arrastre, Cd aplicado, etapa y estado del motor.
- En 2D, además: posición, alcance, velocidades vertical y horizontal, ángulos de trayectoria γ, de eje θ y de ataque α, velocidad respecto al aire y elementos orbitales instantáneos (energía, momento angular, semieje mayor, excentricidad, perigeo y apogeo).
- Eventos con instante exacto (T+ con milisegundos) y estado completo: despegue, inicio y fin de la maniobra, Mach 1, Max-Q, fin de combustión 1, separación, encendido 2, fin de combustión 2, órbita alcanzada, apogeo e impacto.
- Unidades SI o prácticas (km, km/h, kN, kPa, t, grados).

### Gráficas y esquema

- Gráficas apiladas (uPlot) con eje de tiempo común, cursor sincronizado con el reproductor, líneas en los eventos, zoom y escala logarítmica por eje. Cualquier variable de la telemetría se puede representar.
- En 2D, altitud frente al alcance, a escala real o con exageración vertical indicada.
- Esquema a escala (Canvas 2D): perfil del cohete en líneas finas y diagrama de cuerpo libre con empuje, arrastre y peso proporcionales a su módulo. En 2D, el cohete inclinado con la velocidad y las cotas de γ y α.

### Análisis

- **Presupuesto de Δv:** Δv ideal menos las pérdidas por gravedad, arrastre, contrapresión y dirección, con la comprobación de cierre frente a la velocidad ganada.
- **Diagnóstico numérico:** método, dt o tolerancia, pasos (y rechazados), tiempo de cálculo, deriva de energía y error de cada métrica estimado por extrapolación de Richardson, con el orden de convergencia observado.
- **Comparación:** fijar una simulación como referencia, superponerla en las gráficas y ver las diferencias de entrada, métricas y eventos.
- **Barrido:** variar un parámetro en un intervalo (2 a 200 puntos) y representar el apogeo, la velocidad final, Max-Q… frente a él.
- Richardson y los barridos se calculan en un Web Worker para no bloquear la interfaz.

### Exportación

- CSV con todas las muestras y variables (unidades en la cabecera).
- JSON con la entrada, la configuración y los eventos; se puede volver a cargar para repetir la simulación.
- Gráficas en SVG, tal como se ven.
- La URL lleva siempre todos los parámetros: copiar el enlace basta para compartir y reproducir exactamente una simulación.

## Modelo físico

Resumen; las ecuaciones completas, las constantes y su fuente están en [docs/FISICA.md](docs/FISICA.md).

| Aspecto | Modelo |
|---|---|
| Unidades | SI internamente (m, s, kg, N, Pa); la conversión solo en la interfaz |
| Gravedad | `g = μ / (R + h)²`, vectorial en 2D |
| Motor | `u = Isp · g0` con `g0 = 9,80665 m/s²`; Isp y empuje interpolados según la presión exterior |
| Δv ideal | Tsiolkovski por etapa, con el Isp de vacío |
| Atmósfera | Exponencial (H = 8 500 m) o US Standard 1976 por capas hasta 86 km, con continuación isoterma |
| Arrastre | `D = ½ · ρ · v_aire² · Cd(Mach) · A`, opuesto a la velocidad respecto al aire |
| Rotación | Componente de la rotación terrestre normal al plano de la trayectoria (`Ω = ω · cos φ · sen Az`) |
| Guiado (2D) | Subida vertical, maniobra de inclinación y giro gravitatorio (α = 0) |
| Órbita | Energía, semieje mayor, excentricidad, perigeo y apogeo a partir de r y v |
| Pérdidas | Gravedad, arrastre, contrapresión y dirección integradas como variables de estado |

Las discontinuidades (fines de combustión, despegue, cambios del guiado, de regulación, de capa atmosférica o de tramo de la tabla Cd) terminan el paso justo en su instante, y los eventos se localizan como raíces sobre el propio paso del integrador, así que su precisión es la del método.

## Modelos predefinidos

| Modelo | Descripción |
|---|---|
| Prueba | Caso con valores redondos para comprobar los cálculos a mano |
| Falcon 9 | 22,8 t de carga desde Cabo Cañaveral hacia el este; llega a una órbita de unos 292 × 377 km |
| Electron | 270 kg desde Mahia hacia órbita heliosíncrona; llega a una órbita de unos 225 × 575 km |

Los datos de los cohetes reales son aproximaciones a partir de datos públicos; la fuente de cada uno está citada en su archivo de `src/modelos/`. Las tablas Cd(Mach) son estimaciones propias.

## Validación

La física se comprueba con tests frente a soluciones analíticas y valores publicados (detalle en [docs/FISICA.md § Validación](docs/FISICA.md#validación)):

1. Sin gravedad ni arrastre, la velocidad final coincide con Tsiolkovski (error relativo < 10⁻⁶).
2. Con empuje menor que el peso, el cohete no despega.
3. La energía se conserva en vuelo balístico sin arrastre.
4. Caída libre cerca del suelo.
5. La masa nunca es negativa y baja exactamente la masa seca 1 en la separación.
6. Convergencia de orden 4 con RK4.
7. Cierre del presupuesto de Δv (error relativo < 10⁻⁶).
8. Conservación de los elementos orbitales en órbita.
9. Tabla I de la US Standard Atmosphere 1976.
10. Velocidad del suelo en Cabo Cañaveral (408 m/s).
11. Interpolación de Cd(Mach) sin pérdida de orden.
12. Regulación y límite de aceleración frente a la solución analítica.
13. Dormand–Prince: orden 5 y periodo de Kepler.

## Uso

1. Abrir la [web](https://museumis.github.io/simulador-cohetes/).
2. Elegir un modelo o editar los parámetros (P). Cada cambio se recalcula al momento.
3. Reproducir el vuelo y consultar telemetría, gráficas, eventos y análisis.
4. Exportar (E) o copiar el enlace para compartir la simulación.

| Tecla | Acción |
|---|---|
| Espacio | Reproducir / pausar |
| ← / → | Retroceder / avanzar una muestra |
| Mayús + ← / → | Evento anterior / siguiente |
| 1–4 | Velocidad ×0,1 / ×1 / ×10 / ×100 |
| Inicio | Volver a T+0 |
| P | Abrir o cerrar los parámetros |
| E | Abrir o cerrar la barra de exportación |

## Arquitectura

**Calcular primero, reproducir después:** al cambiar un parámetro, `simular()` calcula el vuelo completo (unos 50 ms) y devuelve las muestras y los eventos. El reproductor avanza un reloj e interpola entre muestras; la telemetría, las gráficas y el esquema solo leen ese estado.

```
parámetros ──► simular() ──► { muestras, eventos } ──► reproductor ──► telemetría + gráficas + esquema
```

```
src/
├── main.ts          # arranque: conecta parámetros, simulación y reproductor
├── trabajador.ts    # Web Worker: Richardson y barridos
├── fisica/          # gravedad, atmósferas, motor, arrastre, tablas, órbita, Tsiolkovski
├── simulacion/      # tipos, integradores, bucle de simulación, eventos, campos de entrada
├── reproduccion/    # reloj e interpolación entre muestras
├── render/          # Canvas: esquema a escala y trayectoria
├── analisis/        # métricas, presupuesto de Δv, Richardson, comparación, barridos
├── exportacion/     # CSV, JSON, SVG y parámetros en la URL
├── ui/              # paneles de la interfaz
├── modelos/         # cohetes predefinidos
├── util/            # formato numérico, unidades, interpolación
└── estilos/         # CSS
tests/               # tests de Vitest, misma estructura que src/
```

Las dependencias van en un solo sentido (`ui`/`render` → `reproduccion` → `simulacion` → `fisica`). `fisica`, `simulacion`, `reproduccion`, `analisis`, `exportacion` y `util` no usan el DOM ni Canvas, y se prueban sin navegador. Detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

### Tecnología

- [Vite](https://vitejs.dev/) + TypeScript estricto, sin framework de interfaz.
- [uPlot](https://github.com/leeoniya/uPlot) para las gráficas y Canvas 2D para el esquema.
- [Vitest](https://vitest.dev/) para los tests.
- GitHub Actions + GitHub Pages para el despliegue.

## Desarrollo

Requiere Node.js 22.12 o superior (lo exigen Vite 8 y Vitest 5).

```bash
npm install
npm run dev                                   # servidor de desarrollo
npm test                                      # tests en modo watch
npm test -- --run                             # una sola pasada (la usa CI)
npx vitest run tests/fisica/gravedad.test.ts  # un archivo
npm run build                                 # build de producción en dist/
npm run preview                               # sirve dist/ en local
```

Convenciones: todo en español (código, comentarios, interfaz y documentación), unidades SI internas con la unidad comentada en cada propiedad, y tests numéricos con tolerancia, nunca con igualdad exacta.

## Despliegue

Cada push a `main` ejecuta el workflow `.github/workflows/desplegar.yml`: instala, pasa los tests, compila y publica `dist/` en GitHub Pages. Si un test falla, no se publica. `base` en `vite.config.ts` es `/simulador-cohetes/`. Detalle en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Estado y hoja de ruta

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Proyecto, CI y despliegue | Hecha |
| 1 | Física portada y corregida | Hecha |
| 2 | Simulador 1D vertical | Hecha |
| 3 | Primera versión usable: telemetría, gráficas y esquema | Hecha |
| 4 | Herramienta de análisis: Δv, diagnóstico, exportación, comparación y barridos | Hecha |
| 5 | Trayectoria 2D y órbita | Hecha |
| 6 | Alta fidelidad: US Standard 1976, Cd(Mach), rotación, regulación, Dormand–Prince | Hecha (J2 opcional pendiente) |
| 7 | Extras: cohetes propios en `localStorage`, PWA, simulación principal en un worker | Pendiente |

Fuera de alcance: elementos decorativos, backend o usuarios, controles en vuelo en tiempo real, viento y turbulencia. Detalle en [ROADMAP.md](ROADMAP.md).

## Documentación

- [ROADMAP.md](ROADMAP.md): fases y tareas.
- [docs/FISICA.md](docs/FISICA.md): modelo físico, ecuaciones, constantes y validación.
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md): estructura del código, tipos y decisiones.
- [docs/INTERFAZ.md](docs/INTERFAZ.md): paneles, gráficas, exportación y teclado.
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md): publicación en GitHub Pages.

## Origen

Nace a partir del microservicio Java `CalculoTrayectorias` (Spring Boot), que calculaba la Δv de un cohete de dos etapas. La física se portó ya corregida: entre otros errores, usaba la gravedad local en lugar de g0 para la velocidad de expulsión, no separaba las etapas y la pérdida por gravedad siempre era nula. La lista completa está en [docs/FISICA.md](docs/FISICA.md#errores-corregidos-del-proyecto-java).
