# Modelo físico

## Unidades

Todo el cálculo interno usa **unidades SI**: metros, segundos, kilogramos, newtons y pascales. La conversión a unidades legibles (km, kN, km/h) se hace solo en la interfaz.

## Constantes

| Constante | Símbolo | Valor |
|---|---|---|
| Gravedad estándar | g0 | 9,80665 m/s² |
| Radio medio de la Tierra | R | 6 371 000 m |
| Parámetro gravitacional terrestre | μ = G·M | 3,986004418 × 10¹⁴ m³/s² |
| Densidad del aire al nivel del mar | ρ0 | 1,225 kg/m³ |
| Presión al nivel del mar | p0 | 101 325 Pa |
| Altura de escala atmosférica | H | 8 500 m |
| Índice adiabático del aire | γ | 1,4 |
| Constante específica del aire | R_aire | 287,05 J/(kg·K) |
| Constante universal de los gases (US76) | R* | 8 314,32 J/(kmol·K) |
| Masa molar del aire (US76) | M0 | 28,9644 kg/kmol |
| Radio para la altitud geopotencial (US76) | r0 | 6 356 766 m |
| Velocidad angular de la Tierra (sidérea) | ω | 7,292115 × 10⁻⁵ rad/s |

## Datos de entrada

Por cada etapa:

| Campo | Unidad | Notas |
|---|---|---|
| `masaSeca` | kg | Estructura y motores, sin propelente |
| `masaPropelente` | kg | |
| `empujeVacio` | N | Empuje en vacío |
| `ispNivelMar` | s | Impulso específico al nivel del mar |
| `ispVacio` | s | Impulso específico en vacío |
| `diametro` | m | Para calcular el área frontal |
| `longitud` | m | Solo para el esquema a escala; en la etapa 2 incluye la cofia y la carga útil |
| `cd` | — | Coeficiente de arrastre constante (aprox. 0,3–0,5); se usa si `tablaCd` está vacía |
| `tablaCd` | (Mach, —) | Puntos (Mach, Cd) con el Mach creciente, [interpolados linealmente](#arrastre); vacía: Cd constante |
| `regulacion` | (s, —) | Puntos (t desde el encendido, nivel en (0, 1]) del [perfil de regulación](#regulación-y-límite-de-aceleración); vacía: empuje nominal |

Del cohete en conjunto: `masaCargaUtil` (kg), `pausaSeparacion` (s, tiempo entre el fin de la etapa 1 y el encendido de la 2), `aceleracionMaxima` (m/s², [límite de F/m](#regulación-y-límite-de-aceleración); 0 = sin límite) y, solo para el modelo 2D, `velocidadManiobra` (m/s) y `anguloManiobra` (°) del [programa de inclinación](#programa-de-inclinación), y `latitudLanzamiento` y `azimutLanzamiento` (°, desde el norte hacia el este) para la [rotación terrestre](#rotación-terrestre).

Opciones del modelo (`OpcionesSimulacion`): `modelo` (`'1D'` o `'2D'`), `atmosfera` (`'exponencial'` o `'estandar1976'`), `rotacion` (solo 2D), `metodo` (`'rk4'`, `'eulerSimplectico'` o `'dormandPrince'`), `dt` (paso, o paso inicial con Dormand–Prince) y `tolerancia` (solo Dormand–Prince). Por defecto, `simular()` usa la atmósfera exponencial, sin rotación y RK4, como antes de la fase 6, para que los enlaces y archivos antiguos den el mismo resultado; la interfaz se abre con `OPCIONES_ALTA_FIDELIDAD`: 2D, US Standard Atmosphere 1976, rotación y Dormand–Prince.

## Gravedad

```
g(h) = μ / (R + h)²
```

En la superficie da μ/R² ≈ 9,8203 m/s², no g0. Se usa μ en lugar de `g0 · (R/(R+h))²` para que el modelo 1D sea coherente con la energía `v²/2 − μ/(R+h)` del test de validación 3 y con la gravedad vectorial del modelo 2D. g0 solo interviene en la velocidad de expulsión.

## Motor

Velocidad de expulsión efectiva. Se usa siempre **g0**, nunca la gravedad local:

```
u = Isp · g0
```

Caudal másico, constante durante la combustión:

```
ṁ = empujeVacio / (ispVacio · g0)
```

Isp y empuje según la presión exterior p(h):

```
Isp(p) = ispVacio − (ispVacio − ispNivelMar) · p / p0
F(p)   = ṁ · g0 · Isp(p)
```

Tiempo de combustión: `t_comb = masaPropelente / ṁ` (sin regulación).

### Regulación y límite de aceleración

- **Perfil de regulación** por tramos: el nivel k(t) es el del último punto con t ≤ tiempo desde el encendido (antes del primero, 1). El caudal se escala con el nivel, `ṁ = k · ṁ0`, y el Isp no cambia (simplificación: en un motor real baja algo al regular). Los cambios de nivel son discontinuidades de instante conocido: el paso termina justo en ellos y hay dos muestras con el mismo t, antes y después. Sin límite de aceleración el tiempo de combustión se calcula recorriendo los tramos (`tiempoCombustionRegulada`).
- **Límite de aceleración:** si el empuje nominal superaría `aceleracionMaxima · m`, se regula automáticamente para que `F/m = a_max` exactamente, con el caudal que da ese empuje al Isp actual, `ṁ = a_max · m / (g0 · Isp(p))`. Se limita la aceleración debida al empuje, no la sentida (que restaría el arrastre). La entrada y la salida del régimen limitado se localizan como eventos (raíz de `a_max − F_nominal/m`) y el paso termina en ellas, porque la fuerza es continua pero su derivada no.
- Con el límite el caudal depende del estado, así que el fin de combustión ya no se conoce de antemano: en todos los casos se localiza como la raíz de `m − m_final` y después se fija `m = m_final` exactamente. La Δv ideal sigue siendo la de Tsiolkovski: no depende de cómo se queme el propelente.

Validación con solución analítica (sin gravedad, arrastre ni contrapresión): el límite se alcanza en `t_l = (m0 − F/a)/ṁ0` y desde ahí `m(t) = m_l · e^(−a·(t − t_l)/u)`, con `m_l = F/a`, así que la combustión termina en `t_l + (u/a)·ln(m_l/m_f)`.

## Tsiolkovski (Δv ideal)

```
Δv = u · ln(m0 / mf)
```

- Etapa 1: `m0 = todo`; `mf = m0 − propelente1`.
- Etapa 2: `m0 = seca2 + propelente2 + carga útil`; `mf = seca2 + carga útil`.
- Δv total = Δv1 + Δv2.

Cada etapa usa su propio Isp: el de vacío para la Δv ideal.

## Fracciones de masa

- Fracción de propelente de una etapa: `propelente / (seca + propelente)` de esa etapa.
- Fracción de carga útil: `carga útil / masa total al despegue`.

Se devuelven entre 0 y 1; la interfaz las muestra como porcentaje.

## Atmósfera

Dos modelos, a elegir con la opción `atmosfera`.

### Exponencial

Modelo exponencial para densidad y presión:

```
ρ(h) = ρ0 · e^(−h/H)
p(h) = p0 · e^(−h/H)
```

Temperatura (solo para la velocidad del sonido y el número de Mach), atmósfera estándar simplificada:

```
T(h) = 288,15 − 0,0065·h     si h < 11 000 m
T(h) = 216,65                si h ≥ 11 000 m
a(h) = √(γ · R_aire · T(h))
Mach = |v| / a(h)
```

Por encima de unos 100 km, la densidad es despreciable.

### US Standard Atmosphere 1976

`fisica/estandar1976.ts`, según NOAA-S/T 76-1562. Hasta 86 km geométricos (84 852 m′ geopotenciales) la temperatura es lineal por capas en la altitud geopotencial `H = r0·Z / (r0 + Z)`:

| Base H (m′) | Gradiente L (K/m′) |
|---|---|
| 0 | −0,0065 |
| 11 000 | 0 |
| 20 000 | +0,001 |
| 32 000 | +0,0028 |
| 47 000 | 0 |
| 51 000 | −0,0028 |
| 71 000 | −0,002 |
| 84 852 | 0 (continuación, fuera de la norma) |

```
T = Tb + L·(H − Hb)
p = pb · (Tb / T)^(g0/(R·L))          si L ≠ 0
p = pb · e^(−g0·(H − Hb)/(R·Tb))      si L = 0
ρ = p / (R·T),  a = √(γ·R·T),  R = R*/M0 = 287,0531 J/(kg·K)
dρ/dZ = −ρ·(g0/R + L)/T · (r0/(r0 + Z))²
```

Las bases de cada capa se encadenan desde el nivel del mar con las mismas fórmulas, así que p y ρ son continuas. T es la temperatura molecular de la norma, con la que se calculan ρ y a; coincide con la cinética hasta 80 km y entre 80 y 86 km la cinética es hasta un 0,04 % menor.

Por encima de 86 km la norma usa otro modelo (difusión, temperatura creciente). Aquí se continúa con una capa isoterma a 186,95 K: p y ρ bajan exponencialmente con una altura de escala de unos 5,5 km. A 100 km da ρ = 5,4·10⁻⁷ kg/m³ (la tabla: 5,60·10⁻⁷) y por encima de 150 km se queda corta en un factor creciente, pero la presión dinámica ya es despreciable.

En cada cambio de capa la temperatura y dρ/dh cambian de pendiente: son esquinas de las fuerzas y el paso termina justo en ellas (ver [Integración numérica](#integración-numérica)). En el modelo exponencial solo la tropopausa es una esquina, de la velocidad del sonido, y solo importa si hay tabla Cd(Mach).

## Arrastre

```
A = π · (diametro / 2)²
q = ½ · ρ · v_aire²           (presión dinámica)
D = q · cd(Mach) · A          (opuesto a la velocidad respecto al aire)
Mach = v_aire / a(h)
```

`v_aire` es la velocidad respecto a la atmósfera: la inercial sin rotación terrestre, `v − Ω × r` con ella (ver [Rotación terrestre](#rotación-terrestre)).

El Cd es el de la tabla (Mach, Cd) de la etapa inferior acoplada, interpolado linealmente y con el valor del extremo fuera de ella; sin tabla, el `cd` constante. Tras la separación, se usan el diámetro y el Cd de la etapa 2. Cada nodo de la tabla es una esquina de Cd(Mach): el paso termina justo al cruzarlo, como en los cambios de capa de la atmósfera, para que no degrade el orden del método (con RK4 y sin hacerlo el orden observado del apogeo baja a 1).

## Ecuaciones del movimiento (1D vertical)

Estado: `[h, v, m]`.

```
dh/dt = v
dv/dt = (F − D·signo(v)) / m − g(h)
dm/dt = −ṁ       (solo durante la combustión)
```

### Secuencia de vuelo

1. **En la plataforma:** mientras `F ≤ m·(g − Ω²·r)`, el cohete no se mueve respecto al suelo (h = 0; sin rotación, v = 0; con ella, gira con la Tierra). El despegue se localiza como la raíz de `m·(g − Ω²·r) − F`; como la masa baja linealmente, la raíz es exacta. Sin rotación equivale a `t = (m0 − F/g) / ṁ`, con F y g a nivel del mar. Si el empuje de la etapa 1 nunca supera el peso, se informa de que no despega y la simulación termina al fin de su combustión.
2. **Combustión de la etapa 1** hasta agotar `masaPropelente1`, recorriendo su perfil de regulación.
3. **Separación:** `m −= masaSeca1`. Comienza un vuelo libre durante `pausaSeparacion`.
4. **Combustión de la etapa 2.**
5. **Vuelo balístico** hasta el apogeo y la caída.
6. **Impacto:** h ≤ 0 después del despegue → fin de la simulación.

### Integración numérica

- RK4 con paso fijo `dt = 0,01 s` (configurable). Para comparar se puede elegir Euler simpléctico (semiimplícito, orden 1): todas las componentes avanzan con la derivada al principio del paso salvo la posición, que usa la velocidad ya actualizada, `v₁ = v₀ + a(y₀)·dt`, `r₁ = r₀ + v₁·dt`. En vuelo balístico conserva una energía modificada (la deriva no crece), pero su error es mucho mayor que el de RK4.
- **Dormand–Prince 5(4)** (Dormand y Prince, 1980), de paso adaptativo: avanza con la solución de orden 5 y estima el error local con la diferencia respecto a la embebida de orden 4. Escala del error de cada componente: `tol · (1 + max(|y₀|, |y₁|))`, relativa en las magnitudes grandes y absoluta cerca de 0; norma RMS. Si el error supera 1 el paso se repite; el siguiente es `h · 0,9 · error^(−1/5)`, entre ×0,2 y ×5, y como mucho 10 s (`PASO_MAXIMO_ADAPTATIVO`), para que la interpolación de Hermite de las muestras siga siendo precisa. `dt` es el paso inicial. Con `tol = 10⁻⁹` el Falcon 9 necesita unos 700 pasos para el ascenso y una vuelta completa, frente a 115 000 de RK4 con dt = 0,01 s solo para el ascenso y 600 s de órbita.
- El paso se acorta para terminar justo en cada discontinuidad de las fuerzas o de su derivada: fines de combustión, despegue, cambios del programa de inclinación (2D), entrada y salida del límite de aceleración, nodos de la tabla Cd(Mach) y cambios de capa de la atmósfera; los cambios del perfil de regulación tienen instante conocido y el paso se ajusta para terminar en ellos. Las que dependen del estado se localizan como los eventos. Así la masa nunca queda negativa y las discontinuidades no degradan el orden del método.
- Los eventos sin instante conocido de antemano (Mach 1, Max-Q, órbita, apogeo, impacto) se localizan dentro del paso buscando la raíz sobre el propio paso del integrador acortado (regula falsi de Illinois, tolerancia 10⁻¹² s). Así la precisión del evento es la del integrador y no la de una interpolación.
- Estimación del error con paso fijo: se repite la simulación con `dt/2` y `dt/4` y se aplica extrapolación de Richardson con el orden p del método (4 en RK4, 1 en Euler simpléctico). Si `x(h) = X + C·hᵖ`:
  - error del valor mostrado: `x(dt) − X ≈ (x_dt − x_dt/2) · 2ᵖ / (2ᵖ − 1)` (el de `x(dt/2)` es `(x_dt − x_dt/2) / (2ᵖ − 1)`);
  - valor extrapolado: `X ≈ x_dt/2 + (x_dt/2 − x_dt) / (2ᵖ − 1)`;
  - orden observado: `log₂((x_dt − x_dt/2) / (x_dt/2 − x_dt/4))`, que debe salir cercano a p. Si las dos diferencias no tienen el mismo signo, el error está al nivel del redondeo y no se puede resolver (con RK4 y dt = 0,01 s suele ocurrir: el apogeo cambia en 10⁻⁷ m).
- Estimación del error con Dormand–Prince: el control del paso hace que el error global sea aproximadamente proporcional a la tolerancia, así que se repite con `tol/10` y `tol/100` y se aplican las mismas fórmulas con razón 10 y orden 1 respecto a la tolerancia: error `≈ (x_tol − x_tol/10) · 10/9` y orden observado `log₁₀((x_tol − x_tol/10) / (x_tol/10 − x_tol/100))`, que debe salir cercano a 1.
- La salida se muestrea a 20 Hz (cada 0,05 s) con interpolación cúbica de Hermite dentro del paso (error O(dt⁴), sin evaluaciones extra), más una muestra exacta en cada evento. En el vuelo orbital tras la inserción se muestrea a 1 Hz: una vuelta son unos 5 500 s y a 20 Hz serían 110 000 muestras. En una discontinuidad (separación, cambio de regulación) hay dos muestras con el mismo t: antes y después.
- Límite de seguridad: 2 horas de vuelo simulado.

### Eventos

| Evento | Condición |
|---|---|
| Despegue | Primer instante con F > m·(g − Ω²·r) |
| Inicio maniobra (2D) | \|v_aire\| = `velocidadManiobra` |
| Giro gravitatorio (2D) | γ_aire = 90° − `anguloManiobra` |
| Mach 1 | Mach cruza 1 hacia arriba (solo la primera vez) |
| Max-Q | Máximo global de q con v > 0: dq/dt pasa de + a −, dentro de un paso o justo en un fin de combustión |
| Fin de combustión 1 | Propelente 1 agotado |
| Separación | A la vez que el fin de combustión 1 |
| Encendido 2 | Fin de combustión 1 + `pausaSeparacion` |
| Fin de combustión 2 | Propelente 2 agotado |
| Órbita (2D) | ε < 0 y perigeo > 100 km, la primera vez |
| Apogeo | La velocidad vertical cambia de signo de + a − (si ocurre más de una vez, el de mayor altitud) |
| Impacto | h ≤ 0 tras el despegue |

## Pérdidas de Δv

Se integran como variables de estado adicionales para explicar de dónde sale cada m/s:

```
Δv_ideal(t)        = ∫ F_vacío / m dt        (= Σ u_vacío · ln(m0/m) por etapa)
pérdida gravedad   = ∫ g(h) · sin γ dt        (1D: se toma siempre sin γ = 1)
pérdida arrastre   = ∫ D / m · cos δ dt     (δ = ángulo entre la velocidad respecto al aire y la inercial; 0 sin rotación)
pérdida contrapres.= ∫ (F_vacío − F(p)) / m dt
pérdida dirección  = ∫ F/m · (1 − cos β) dt   (solo 2D; β = ángulo entre el empuje y la velocidad inercial)
```

En 2D, `sin γ` es el de la trayectoria y la pérdida por gravedad baja en el descenso.

En la plataforma la reacción del suelo N anula el empuje que no levanta el cohete. Esa parte, `g − N/m = F/m`, se cuenta como pérdida por gravedad, de modo que la identidad también se cumple antes del despegue.

Identidad de cierre (exacta salvo error numérico; en 1D, mientras el cohete asciende; en 2D, en todo el vuelo):

```
|v(t)| − |v(0)| = Δv_ideal − gravedad − arrastre − contrapresión − dirección
```

## Modelo 2D

Se elige con la opción `modelo` (`'1D'` o `'2D'`). Los dos comparten el mismo bucle de integración: el estado es siempre plano y el 1D es el caso en que el empuje va por la vertical local, así que x y vx son exactamente 0 y la trayectoria es vertical sin redondeo.

- Origen en el centro de la Tierra; la plataforma está en (0, R) y el alcance crece hacia +x. Estado: `[x, y, vx, vy, m]` más las pérdidas, el ángulo central recorrido (para el alcance) y el trabajo de empuje y arrastre (para la deriva de energía).
- Gravedad: `a_g = −μ · r / |r|³`. Altitud: `h = |r| − R`. Alcance: `R · φ`, con φ el ángulo central desde la plataforma, integrado como variable de estado (`dφ/dt = (y·vx − x·vy) / r²`) para que no salte al dar media vuelta.
- Arrastre opuesto a la velocidad respecto al aire. Sin sustentación.
- Ángulos, medidos desde la horizontal local: trayectoria `γ = atan2(v_vertical, v_horizontal)` (velocidad inercial), trayectoria respecto al aire γ_aire (igual a γ sin rotación), eje del cohete (dirección del empuje) θ y ataque `α = θ − γ_aire`.

### Rotación terrestre

Con la opción `rotacion` (solo 2D). El plano de la trayectoria es el que contiene la plataforma y la dirección de lanzamiento: desde la latitud φ con azimut Az, su inclinación cumple `cos i = cos φ · sen Az`. La rotación terrestre ω⃗ tiene una componente normal al plano, `Ω = ω · cos i = ω · cos φ · sen Az`, y otra en el plano, que produce un viento fuera de él. El modelo 2D solo conserva la primera: la atmósfera gira en el plano con velocidad angular Ω, en el sentido del alcance creciente, y el viento en r⃗ es `Ω · (y, −x)`. En la plataforma la componente fuera del plano es nula y el viento en el plano coincide con la velocidad del suelo, `Ω·R = ω·R·cos φ·sen Az` (408 m/s en Cabo Cañaveral hacia el este); a medida que el cohete se aleja, la componente que se descarta crece con el alcance.

- Estado inicial: en la plataforma, velocidad `(Ω·R, 0)`. Mientras no despega, el cohete describe un movimiento circular uniforme con el suelo (`a = −Ω²·r⃗`).
- La velocidad respecto al aire, `v_aire = v − Ω·(y, −x)`, da q, el Mach y la dirección del arrastre. El programa de inclinación también la usa: la maniobra empieza a `|v_aire| = velocidadManiobra`, termina cuando γ_aire = 90° − `anguloManiobra` y en el giro gravitatorio el empuje sigue a v_aire (α = 0, sin carga aerodinámica lateral). Por eso hay pérdida por dirección también en el giro: el empuje no va según la velocidad inercial.
- Alcance sobre la superficie, que gira: `R · (φ − Ω·t)`.
- Max-Q usa `dq/dt = ½·(dρ/dh)·v_vertical·v_aire² + ρ·(v⃗_aire · (a⃗ − Ω·(vy, −vx)))`.
- En 1D no interviene: la trayectoria es radial.

### Programa de inclinación

Datos del cohete (solo intervienen en 2D): `velocidadManiobra` (m/s) y `anguloManiobra` (grados, en (0, 90]; es un dato de entrada y se convierte a radianes al simular).

1. **Subida vertical:** el empuje va por la vertical local hasta que |v| = `velocidadManiobra` (evento «inicio maniobra»).
2. **Maniobra:** el empuje se inclina de golpe `anguloManiobra` respecto a la vertical local, hacia el alcance creciente, y se mantiene así respecto a la vertical local. La gravedad y el empuje van girando la velocidad hasta que su inclinación iguala la del empuje, γ = 90° − `anguloManiobra` (evento «giro gravitatorio»). Para ángulos pequeños la ecuación de β = 90° − γ es lineal en (β, ángulo), así que la duración de la maniobra casi no depende del ángulo.
3. **Giro gravitatorio:** el empuje se alinea con la velocidad (α = 0) hasta el final. Con el motor apagado el eje sigue la misma regla que el programa.

Los dos cambios del programa son discontinuidades del empuje: el paso se acorta para terminar justo en ellas, igual que en los fines de combustión, y los instantes se localizan con la misma búsqueda de raíz.

### Pérdidas en 2D

La pérdida por gravedad es `∫ g · sin γ dt` (en 1D se mantiene `∫ g dt`) y la de dirección `∫ F/m · (1 − cos β) dt`; sin rotación β = α y solo es distinta de 0 durante la maniobra. Como `d|v|/dt = a⃗ · v̂`, y del arrastre solo frena |v| su componente según v̂ (de ahí el cos δ), la identidad de cierre vale en todo el vuelo, también en el descenso, y no solo en el ascenso como en 1D.

### Elementos orbitales

A partir de r y v en cada muestra (`fisica/orbita.ts`):

```
ε  = v²/2 − μ/r                    (energía específica)
a  = −μ / (2ε)                     (semieje mayor; negativo en una hipérbola)
h  = |r⃗ × v⃗|                       (momento angular específico)
e  = √(1 + 2·ε·h² / μ²)            (excentricidad)
p  = h²/μ,  rp = p / (1 + e),  ra = p / (1 − e) si e < 1, ∞ si no
perigeo = rp − R,  apogeo = ra − R
```

`rp = p / (1 + e)` equivale a `a·(1 − e)` pero vale para cualquier cónica y no pierde precisión en órbitas casi circulares.

- **Órbita alcanzada** si `ε < 0` y `perigeo > 100 km`. El instante se localiza con la raíz de `min(perigeo − 100 km, −ε / g0)`, continua y positiva solo cuando se cumplen las dos condiciones.
- Si al terminar la combustión 2 el cohete está en órbita, la simulación sigue una vuelta completa, `T = 2π·√(a³/μ)`, con Dormand–Prince, y 600 s (`DURACION_ORBITAL`) con los métodos de paso fijo: una vuelta son unos 550 000 pasos más con dt = 0,01 s.
- El apogeo de la tabla de eventos es la altitud máxima del vuelo simulado (vertical: `v_vertical` cambia de + a −); el apogeo orbital es un elemento orbital y puede no alcanzarse dentro del tramo simulado.

## Validación

Tests que confirman que el simulador es correcto:

1. **Sin gravedad ni arrastre:** la velocidad final simulada coincide con la Δv de Tsiolkovski (Isp constante, igual al de vacío) con un error relativo menor que 10⁻⁶.
2. **Sin despegue:** con empuje menor que el peso, h se mantiene en 0 durante toda la combustión.
3. **Energía en vuelo balístico sin arrastre:** `v²/2 − μ/(R+h)` constante con un error relativo menor que 10⁻⁶.
4. **Caída libre cerca del suelo:** sin empuje ni arrastre, desde poca altura, `h(t) ≈ h0 − ½·g(h0)·t²`.
5. **Masa:** nunca negativa; tras la separación baja exactamente `masaSeca1`.
6. **Convergencia:** con RK4, reducir `dt` a la mitad reduce el error del apogeo unas 16 veces (orden 4).
7. **Cierre del presupuesto de Δv:** la identidad de [Pérdidas de Δv](#pérdidas-de-δv) se cumple con un error relativo menor que 10⁻⁶ en todo el ascenso.
8. **Órbita (2D):** en vuelo balístico fuera de la atmósfera, la energía específica y el momento angular se conservan, y por tanto apogeo y perigeo también (error relativo menor que 10⁻⁹ en ε y h, y que 10⁻⁶ en apogeo y perigeo, durante los 600 s de vuelo orbital del Falcon 9 con RK4; menor que 10⁻⁸ en ε y h durante una vuelta completa con Dormand–Prince y tol = 10⁻⁹).

Validaciones de la alta fidelidad (fase 6), cada una frente a un valor de referencia:

9. **US Standard Atmosphere 1976:** temperatura, presión y densidad de la tabla I de la norma entre 0 y 86 km (cinco cifras significativas), velocidad del sonido (340,29 m/s al nivel del mar, 295,07 m/s en la estratosfera) y 86 km geométricos = 84 852 m′.
10. **Rotación terrestre:** velocidad inicial `ω·R·cos φ` = 408,3 m/s en Cabo Cañaveral (28,5° N) hacia el este; en la plataforma, altitud, alcance y velocidad respecto al aire nulos.
11. **Cd(Mach):** el Cd aplicado es el interpolado de la tabla en el Mach de cada muestra; una tabla constante reproduce el Cd constante, y con nodos el orden del método se conserva.
12. **Regulación y límite de aceleración:** fin de combustión igual al del perfil, y al de la solución analítica con el límite (ver [Regulación y límite de aceleración](#regulación-y-límite-de-aceleración)); F/m ≤ a_max; Δv ideal igual a la de Tsiolkovski.
13. **Dormand–Prince:** orden 5 en el oscilador armónico; tras un periodo de Kepler el cohete vuelve al punto de inserción; coincide con RK4 dentro de la tolerancia.

La identidad de cierre (validación 7) se comprueba también con la atmósfera estándar, la rotación, la regulación y el límite de aceleración.

En 2D se comprueban además la identidad de cierre en todo el vuelo (validación 7), la convergencia de orden 4 (validación 6) y que, sin maniobra, el vuelo 2D reproduce el 1D.

## Errores corregidos del proyecto Java

Errores encontrados en `CalculoTrayectorias` que no deben repetirse:

1. **Velocidad de expulsión con gravedad local:** usaba `g(h) · Isp` en lugar de `g0 · Isp`, así que a más altitud `u` salía más baja de lo real.
2. **Velocidad final sin etapas:** `NewtonService` calculaba como si el cohete tuviera una sola etapa y nunca soltara la estructura de la etapa 1. Daba una Δv menor que la suma por etapas.
3. **Pérdida por gravedad nula:** el tiempo siempre era 0, así que `g·t` nunca restaba nada.
4. **Campo sobrescrito:** la velocidad de expulsión se sobrescribía con la velocidad final en el mismo campo de la respuesta.
5. **Fracciones de masa:** la de propelente incluía la carga útil pero no la etapa 2; la de carga útil solo usaba la etapa 1. Además se llamaban "porcentaje" pero devolvían un valor entre 0 y 1.
6. **Mismo Isp para las dos etapas.**
7. **Nombres engañosos:** "aceleración de escape" era en realidad Δv; "velocidad de escape" no era la velocidad de escape física (√(2μ/r)).
8. **Constantes:** g0 = 9,807 (estándar: 9,80665), radio ecuatorial 6378 km en lugar del medio 6371 km, G = 6,67191 × 10⁻¹¹ (CODATA: 6,67430 × 10⁻¹¹).
