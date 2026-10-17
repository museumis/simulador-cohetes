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
| `cd` | — | Coeficiente de arrastre, constante (aprox. 0,3–0,5) |

Del cohete en conjunto: `masaCargaUtil` (kg), `pausaSeparacion` (s, tiempo entre el fin de la etapa 1 y el encendido de la 2) y, solo para el modelo 2D, `velocidadManiobra` (m/s) y `anguloManiobra` (°) del [programa de inclinación](#programa-de-inclinación).

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

Tiempo de combustión: `t_comb = masaPropelente / ṁ`.

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

## Arrastre

```
A = π · (diametro / 2)²
q = ½ · ρ · v²                (presión dinámica)
D = q · cd · A                (opuesto a la velocidad)
```

Tras la separación, se usan el diámetro y el cd de la etapa 2.

## Ecuaciones del movimiento (1D vertical)

Estado: `[h, v, m]`.

```
dh/dt = v
dv/dt = (F − D·signo(v)) / m − g(h)
dm/dt = −ṁ       (solo durante la combustión)
```

### Secuencia de vuelo

1. **En la plataforma:** mientras `F ≤ m·g`, el cohete no se mueve (h = 0, v = 0). Como la masa baja linealmente, el instante del despegue se calcula de forma exacta: `t = (m0 − F/g) / ṁ`, con F y g a nivel del mar. Si el empuje de la etapa 1 nunca supera el peso, se informa de que no despega y la simulación termina al fin de su combustión.
2. **Combustión de la etapa 1** hasta agotar `masaPropelente1`.
3. **Separación:** `m −= masaSeca1`. Comienza un vuelo libre durante `pausaSeparacion`.
4. **Combustión de la etapa 2.**
5. **Vuelo balístico** hasta el apogeo y la caída.
6. **Impacto:** h ≤ 0 después del despegue → fin de la simulación.

### Integración numérica

- RK4 con paso fijo `dt = 0,01 s` (configurable). Para comparar se puede elegir Euler simpléctico (semiimplícito, orden 1): todas las componentes avanzan con la derivada al principio del paso salvo la posición, que usa la velocidad ya actualizada, `v₁ = v₀ + a(y₀)·dt`, `r₁ = r₀ + v₁·dt`. En vuelo balístico conserva una energía modificada (la deriva no crece), pero su error es mucho mayor que el de RK4.
- Si el paso actual atravesaría el fin de una combustión, se acorta para terminar justo en ese instante; en 2D, también en cada cambio del programa de inclinación (localizado como los eventos). Así la masa nunca queda negativa y las discontinuidades del empuje no degradan el orden del método.
- Los eventos sin instante conocido de antemano (Mach 1, Max-Q, órbita, apogeo, impacto) se localizan dentro del paso buscando la raíz sobre el propio paso del integrador acortado (regula falsi de Illinois, tolerancia 10⁻¹² s). Así la precisión del evento es la del integrador y no la de una interpolación.
- Estimación del error: se repite la simulación con `dt/2` y `dt/4` y se aplica extrapolación de Richardson con el orden p del método (4 en RK4, 1 en Euler simpléctico). Si `x(h) = X + C·hᵖ`:
  - error del valor mostrado: `x(dt) − X ≈ (x_dt − x_dt/2) · 2ᵖ / (2ᵖ − 1)` (el de `x(dt/2)` es `(x_dt − x_dt/2) / (2ᵖ − 1)`);
  - valor extrapolado: `X ≈ x_dt/2 + (x_dt/2 − x_dt) / (2ᵖ − 1)`;
  - orden observado: `log₂((x_dt − x_dt/2) / (x_dt/2 − x_dt/4))`, que debe salir cercano a p. Si las dos diferencias no tienen el mismo signo, el error está al nivel del redondeo y no se puede resolver (con RK4 y dt = 0,01 s suele ocurrir: el apogeo cambia en 10⁻⁷ m).
- La salida se muestrea a 20 Hz (cada 0,05 s) con interpolación cúbica de Hermite dentro del paso (error O(dt⁴), sin evaluaciones extra), más una muestra exacta en cada evento. En una discontinuidad (separación) hay dos muestras con el mismo t: antes y después.
- Límite de seguridad: 2 horas de vuelo simulado.

### Eventos

| Evento | Condición |
|---|---|
| Despegue | Primer instante con F > m·g |
| Inicio maniobra (2D) | \|v\| = `velocidadManiobra` |
| Giro gravitatorio (2D) | γ = 90° − `anguloManiobra` |
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
pérdida arrastre   = ∫ D / m dt
pérdida contrapres.= ∫ (F_vacío − F(p)) / m dt
pérdida dirección  = ∫ F/m · (1 − cos α) dt   (solo 2D; α = ángulo entre empuje y velocidad)
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
- Arrastre opuesto a la velocidad (sin rotación terrestre la velocidad relativa al aire es la inercial; la rotación llega en la fase 6). Sin sustentación.
- Ángulos, medidos desde la horizontal local: trayectoria `γ = atan2(v_vertical, v_horizontal)`, eje del cohete (dirección del empuje) θ y ataque `α = θ − γ`.

### Programa de inclinación

Datos del cohete (solo intervienen en 2D): `velocidadManiobra` (m/s) y `anguloManiobra` (grados, en (0, 90]; es un dato de entrada y se convierte a radianes al simular).

1. **Subida vertical:** el empuje va por la vertical local hasta que |v| = `velocidadManiobra` (evento «inicio maniobra»).
2. **Maniobra:** el empuje se inclina de golpe `anguloManiobra` respecto a la vertical local, hacia el alcance creciente, y se mantiene así respecto a la vertical local. La gravedad y el empuje van girando la velocidad hasta que su inclinación iguala la del empuje, γ = 90° − `anguloManiobra` (evento «giro gravitatorio»). Para ángulos pequeños la ecuación de β = 90° − γ es lineal en (β, ángulo), así que la duración de la maniobra casi no depende del ángulo.
3. **Giro gravitatorio:** el empuje se alinea con la velocidad (α = 0) hasta el final. Con el motor apagado el eje sigue la misma regla que el programa.

Los dos cambios del programa son discontinuidades del empuje: el paso se acorta para terminar justo en ellas, igual que en los fines de combustión, y los instantes se localizan con la misma búsqueda de raíz.

### Pérdidas en 2D

La pérdida por gravedad es `∫ g · sin γ dt` (en 1D se mantiene `∫ g dt`) y la de dirección `∫ F/m · (1 − cos α) dt`, que solo es distinta de 0 durante la maniobra. Como `d|v|/dt = a⃗ · v̂`, la identidad de cierre vale en todo el vuelo, también en el descenso, y no solo en el ascenso como en 1D.

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
- Si al terminar la combustión 2 el cohete está en órbita, la simulación sigue 600 s de vuelo orbital (`DURACION_ORBITAL`) y termina: basta para comprobar que los elementos se conservan. Una vuelta completa son unos 550 000 pasos más con dt = 0,01 s y queda para el integrador de paso adaptativo de la fase 6.
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
8. **Órbita (2D):** en vuelo balístico fuera de la atmósfera, la energía específica y el momento angular se conservan, y por tanto apogeo y perigeo también (error relativo menor que 10⁻⁹ en ε y h, y que 10⁻⁶ en apogeo y perigeo, durante los 600 s de vuelo orbital del Falcon 9).

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
