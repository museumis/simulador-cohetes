# Modelo físico

## Unidades

Todo el cálculo interno usa **unidades SI**: metros, segundos, kilogramos, newtons y pascales. La conversión a unidades legibles (km, t, kN, km/h) se hace solo en la interfaz.

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
| `cd` | — | Coeficiente de arrastre, constante (aprox. 0,3–0,5) |

Del cohete en conjunto: `masaCargaUtil` (kg) y `pausaSeparacion` (s, tiempo entre el fin de la etapa 1 y el encendido de la 2).

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

- RK4 con paso fijo `dt = 0,01 s` (configurable).
- Si el paso actual atravesaría el fin de una combustión, se acorta para terminar justo en ese instante. Así la masa nunca queda negativa y las discontinuidades del empuje no degradan el orden del método.
- Los eventos sin instante conocido de antemano (Mach 1, Max-Q, apogeo, impacto) se localizan dentro del paso buscando la raíz sobre el propio paso RK4 acortado (regula falsi de Illinois, tolerancia 10⁻¹² s). Así la precisión del evento es la del integrador y no la de una interpolación.
- Estimación del error: se repite la simulación con `dt/2` y se aplica extrapolación de Richardson, `error ≈ (x_dt − x_dt/2) / (2⁴ − 1)`.
- La salida se muestrea a 20 Hz (cada 0,05 s) con interpolación cúbica de Hermite dentro del paso (error O(dt⁴), sin evaluaciones extra), más una muestra exacta en cada evento. En una discontinuidad (separación) hay dos muestras con el mismo t: antes y después.
- Límite de seguridad: 2 horas de vuelo simulado.

### Eventos

| Evento | Condición |
|---|---|
| Despegue | Primer instante con F > m·g |
| Mach 1 | Mach cruza 1 hacia arriba (solo la primera vez) |
| Max-Q | Máximo global de q con v > 0: dq/dt pasa de + a −, dentro de un paso o justo en un fin de combustión |
| Fin de combustión 1 | Propelente 1 agotado |
| Separación | A la vez que el fin de combustión 1 |
| Encendido 2 | Fin de combustión 1 + `pausaSeparacion` |
| Fin de combustión 2 | Propelente 2 agotado |
| Apogeo | v cambia de signo de + a − (si ocurre más de una vez, el de mayor altitud) |
| Impacto | h ≤ 0 tras el despegue |

## Pérdidas de Δv

Se integran como variables de estado adicionales para explicar de dónde sale cada m/s:

```
Δv_ideal(t)        = ∫ F_vacío / m dt        (= Σ u_vacío · ln(m0/m) por etapa)
pérdida gravedad   = ∫ g(h) · sin γ dt        (1D: γ = 90°, sin γ = 1)
pérdida arrastre   = ∫ D / m dt
pérdida contrapres.= ∫ (F_vacío − F(p)) / m dt
pérdida dirección  = ∫ F/m · (1 − cos α) dt   (solo 2D; α = ángulo entre empuje y velocidad)
```

En la plataforma la reacción del suelo N anula el empuje que no levanta el cohete. Esa parte, `g − N/m = F/m`, se cuenta como pérdida por gravedad, de modo que la identidad también se cumple antes del despegue.

Identidad de cierre (exacta salvo error numérico, mientras el cohete asciende):

```
|v(t)| − |v(0)| = Δv_ideal − gravedad − arrastre − contrapresión − dirección
```

## Modelo 2D (fase 5)

- Origen en el centro de la Tierra, posición **r** y velocidad **v** como vectores.
- Gravedad: `a_g = −μ · r / |r|³`.
- Altitud: `h = |r| − R`.
- Arrastre con la velocidad relativa al aire (y a la rotación de la Tierra, si se activa).
- Programa de inclinación:
  1. Subida vertical hasta `velocidadManiobra` (p. ej. 60 m/s).
  2. Inclinación instantánea de `anguloManiobra` grados (p. ej. 2–5°).
  3. Giro gravitatorio: el empuje se alinea con la velocidad.
- Elementos orbitales a partir de r y v:

```
ε  = v²/2 − μ/r                    (energía específica)
a  = −μ / (2ε)                     (semieje mayor)
h⃗  = r⃗ × v⃗
e  = √(1 + 2·ε·|h⃗|² / μ²)          (excentricidad)
rp = a·(1 − e),   ra = a·(1 + e)
perigeo = rp − R,  apogeo = ra − R
```

- Órbita alcanzada si `ε < 0` y `perigeo > 100 km`.

## Validación

Tests que confirman que el simulador es correcto:

1. **Sin gravedad ni arrastre:** la velocidad final simulada coincide con la Δv de Tsiolkovski (Isp constante, igual al de vacío) con un error relativo menor que 10⁻⁶.
2. **Sin despegue:** con empuje menor que el peso, h se mantiene en 0 durante toda la combustión.
3. **Energía en vuelo balístico sin arrastre:** `v²/2 − μ/(R+h)` constante con un error relativo menor que 10⁻⁶.
4. **Caída libre cerca del suelo:** sin empuje ni arrastre, desde poca altura, `h(t) ≈ h0 − ½·g(h0)·t²`.
5. **Masa:** nunca negativa; tras la separación baja exactamente `masaSeca1`.
6. **Convergencia:** con RK4, reducir `dt` a la mitad reduce el error del apogeo unas 16 veces (orden 4).
7. **Cierre del presupuesto de Δv:** la identidad de [Pérdidas de Δv](#pérdidas-de-δv) se cumple con un error relativo menor que 10⁻⁶ en todo el ascenso.
8. **Órbita (2D):** en vuelo balístico fuera de la atmósfera, la energía específica y el momento angular se conservan, y por tanto apogeo y perigeo también.

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
