# Hoja de ruta

Cada fase termina con algo que se puede ver o probar. Los detalles de la física están en [docs/FISICA.md](docs/FISICA.md), la estructura del código en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) y la interfaz en [docs/INTERFAZ.md](docs/INTERFAZ.md).

**Hitos**

| Hito | Fase | Resultado |
|---|---|---|
| Primera versión usable | 3 | Telemetría, gráficas y esquema de un lanzamiento 1D |
| Herramienta de análisis | 4 | Presupuesto de Δv, diagnóstico numérico y exportación |
| Puesta en órbita | 5 | Trayectoria 2D y elementos orbitales |
| Alta fidelidad | 6 | Atmósfera estándar completa, Cd(Mach), rotación terrestre |

---

## Fase 0: preparar el proyecto

- [x] `git init` y repositorio `simulador-cohetes` en GitHub.
- [x] Crear el proyecto con Vite + TypeScript (`npm create vite@latest`, plantilla `vanilla-ts`).
- [x] Añadir Vitest y los scripts `dev`, `build`, `test` y `preview`.
- [x] Configurar TypeScript en modo estricto.
- [x] Crear la estructura de carpetas de [ARQUITECTURA.md](docs/ARQUITECTURA.md).
- [x] Configurar `base: '/simulador-cohetes/'` en `vite.config.ts`.
- [x] Workflow de GitHub Actions que ejecute los tests y publique en Pages ([DESPLIEGUE.md](docs/DESPLIEGUE.md)).

**Hecho cuando:** la página vacía está publicada en `https://museumis.github.io/simulador-cohetes/` y cada push la actualiza.

## Fase 1: portar la física, ya corregida

- [x] `src/fisica/constantes.ts`: g0, radio terrestre, μ y valores atmosféricos, todo en unidades SI y con su fuente.
- [x] `src/fisica/gravedad.ts`: gravedad según la altitud.
- [x] `src/fisica/motor.ts`: velocidad de expulsión `u = Isp · g0`, caudal másico, Isp y empuje según la presión.
- [x] `src/fisica/tsiolkovski.ts`: Δv por etapa y total.
- [x] `src/fisica/masas.ts`: masa inicial, fracciones de propelente y de carga útil.
- [x] Portar los tests del proyecto Java con los valores esperados recalculados y comparación con tolerancia.

**Hecho cuando:** `npm test` pasa y los resultados coinciden con los cálculos a mano de [FISICA.md](docs/FISICA.md).

## Fase 2: simulador 1D vertical

- [x] Tipos `Cohete`, `Etapa`, `Muestra`, `Evento` y `ResultadoSimulacion` en `src/simulacion/tipos.ts`.
- [x] `src/fisica/atmosfera.ts`: densidad, presión, temperatura y velocidad del sonido.
- [x] `src/fisica/arrastre.ts`: fuerza de arrastre y presión dinámica.
- [x] `src/simulacion/integrador.ts`: RK4 con paso fijo.
- [x] `src/simulacion/simular.ts`: bucle principal, cambio de etapa y suelo.
- [x] Detección de eventos: despegue, Mach 1, Max-Q, fin de combustión 1, separación, encendido 2, fin de combustión 2, apogeo e impacto.
- [x] Ajustar el paso de integración para que los fines de combustión caigan en el instante exacto, y localizar el resto de eventos por interpolación dentro del paso.
- [x] Integrar las pérdidas de Δv (gravedad, arrastre, contrapresión) como variables de estado.
- [x] Muestreo de salida a 20 Hz más los eventos.
- [x] Validar la entrada con mensajes precisos (campo, valor, rango admitido).
- [x] Tests de validación ([FISICA.md § Validación](docs/FISICA.md#validación)).

**Hecho cuando:** todos los tests de validación pasan y una simulación completa tarda menos de 50 ms.

## Fase 3: primera versión usable

- [x] Esqueleto de `index.html` con la distribución de [INTERFAZ.md](docs/INTERFAZ.md): telemetría, gráficas, esquema, eventos, reproductor y parámetros.
- [x] Estilos base: escala de grises, fuente monoespaciada, tema oscuro y claro.
- [x] `src/reproduccion/reproductor.ts`: reloj de simulación, velocidades ×0.1 a ×100, pausa, paso a paso e interpolación entre muestras.
- [x] `src/ui/telemetria.ts`: todas las variables con unidad y cifras significativas coherentes.
- [x] `src/ui/graficas.ts`: gráficas apiladas con uPlot, eje de tiempo común, cursor sincronizado, marcas de eventos, zoom y escala logarítmica.
- [x] `src/render/esquema.ts`: perfil del cohete a escala en líneas finas y vectores de fuerza con su escala.
- [x] `src/ui/eventos.ts`: lista de eventos con salto al instante.
- [x] `src/ui/parametros.ts`: tabla de entrada con validación y valores derivados (masa al despegue, ṁ, tiempo de combustión, TWR inicial, Δv ideal).
- [x] `src/modelos/`: un caso de prueba con valores redondos y dos cohetes reales con datos públicos aproximados, con la fuente citada en el propio archivo.
- [x] Recalcular al cambiar un parámetro, con un retardo corto.
- [x] Atajos de teclado (la exportación con E llega en la fase 4).

**Hecho cuando:** se carga un modelo, se ejecuta y todos los paneles muestran valores coherentes y sincronizados.

## Fase 4: herramienta de análisis

- [ ] Panel de presupuesto de Δv con comprobación de cierre.
- [ ] Panel de diagnóstico numérico: pasos, tiempo de cálculo, deriva de energía y error estimado por Richardson.
- [ ] Selector de método de integración (RK4, Euler simpléctico para comparar) y de dt.
- [ ] Exportar a CSV (todas las muestras y variables) y JSON (entrada, configuración y eventos).
- [ ] Exportar gráficas a SVG.
- [ ] Codificar los parámetros en la URL para reproducir y compartir una simulación exacta.
- [ ] Comparar dos simulaciones: series superpuestas y tabla de diferencias.
- [ ] Barrido de un parámetro: un parámetro variando en un rango → gráfica de apogeo, velocidad final o Max-Q frente a ese parámetro.

**Hecho cuando:** se puede justificar numéricamente cada resultado (de dónde sale cada m/s y qué error tiene).

## Fase 5: trayectoria 2D y órbita

- [ ] Física 2D en coordenadas con origen en el centro de la Tierra (gravedad vectorial).
- [ ] Programa de inclinación: subida vertical, maniobra de inclinación y giro gravitatorio.
- [ ] Parámetros nuevos: velocidad y ángulo de la maniobra de inclinación.
- [ ] Pérdida por dirección en el presupuesto de Δv.
- [ ] Elementos orbitales instantáneos: energía, semieje mayor, excentricidad, apogeo y perigeo. Evento "órbita alcanzada".
- [ ] Gráfica de altitud frente al alcance, a escala o con exageración vertical indicada.
- [ ] Esquema con vectores de velocidad, ángulo de ataque y ángulo de trayectoria.
- [ ] Mantener el modo 1D seleccionable.

**Hecho cuando:** un modelo de referencia llega a órbita y los elementos orbitales se conservan en vuelo balístico fuera de la atmósfera.

## Fase 6: alta fidelidad

- [ ] Atmósfera US Standard 1976 completa hasta 86 km, con continuación exponencial por encima.
- [ ] Coeficiente de arrastre según el Mach (tabla interpolada por etapa).
- [ ] Rotación terrestre y latitud de lanzamiento (velocidad inicial y velocidad relativa al aire).
- [ ] Perfil de empuje (regulación) por tramos durante la combustión.
- [ ] Límite de aceleración máxima con regulación automática.
- [ ] Integrador de paso adaptativo (Dormand–Prince 5(4)) con tolerancia configurable.
- [ ] Opcional: término J2 de la gravedad terrestre.

**Hecho cuando:** cada mejora tiene un test que compara con un valor de referencia publicado.

## Fase 7: extras

- [ ] Guardar cohetes propios en `localStorage`.
- [ ] PWA para funcionar sin conexión.
- [ ] Web Worker para el cálculo si el modo 2D o los barridos lo hacen lento.

## Fuera de alcance

- Cualquier elemento decorativo: ilustraciones, partículas, efectos, sonido.
- Backend, usuarios o galería pública.
- Simulación en tiempo real con controles en vuelo.
- Viento y turbulencia.
