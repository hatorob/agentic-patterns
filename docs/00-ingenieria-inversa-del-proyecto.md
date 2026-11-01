# Ingeniería inversa del proyecto base

> Qué había en el repositorio antes del patrón 01 (tool use), cómo está armado, cómo se conecta con los modelos y cómo funciona la trazabilidad.
> Versiones revisadas: `ai` 7.0.159, TypeScript 7, Node con `--env-file`.

---

## 1. Vista general

El proyecto es un **laboratorio de consola**. No es una API ni una web: es un script que se ejecuta, llama a un modelo de lenguaje y muestra los resultados en la terminal con colores.

```
npm run dev
   │
   ▼
tsx --env-file=.env src/main.ts      ← carga las API keys del .env en process.env
   │
   ├── import './helpers/string-colors.js'   (efecto secundario: agrega .green, .red… a los strings)
   │
   ├── toolUseMain()          ← el patrón que estás estudiando
   └── getMessageFromModel()  ← verificación de que el modelo responde
            │
            ▼
       generateText({ model, prompt })     ← AI SDK
            │
            ▼
       model  (helpers/selected-model.ts)  ← proveedor: Groq / OpenAI / Anthropic / Google / Ollama
            │
            ▼
       HTTP al proveedor  →  respuesta  →  console.log
```

Las tres ideas que sostienen todo el proyecto:

1. **Un solo modelo para todo** (`selected-model.ts`). Cambiar de proveedor no toca ningún patrón.
2. **Un solo punto de entrada** (`main.ts`). Para ejecutar otro patrón, cambias qué función llama.
3. **Trazabilidad opcional** (`create-tracer.ts`). Se conecta a cualquier llamada para ver paso a paso qué hizo el modelo.

---

## 2. Estructura de archivos

```
src/
├── main.ts                       Punto de entrada. Decide qué se ejecuta.
├── actions/
│   └── get-message-model.ts      3 formas de llamar al modelo (simple, con traza, a prueba de fallos)
├── helpers/
│   ├── index.ts                  "Barrel": reexporta todos los helpers
│   ├── selected-model.ts         El modelo que usa todo el proyecto
│   ├── create-tracer.ts          Trazabilidad por pasos y conteo de tokens
│   └── string-colors.ts          Colores ANSI en String.prototype
└── patterns/
    └── 01-tool-use/tool-use.ts   Tu primer patrón (en progreso)
```

Archivos de configuración:

| Archivo | Para qué sirve |
|---|---|
| `package.json` | `"type": "module"` → el proyecto es ESM. Scripts `dev`, `watch`, `build` y `start`. |
| `tsconfig.json` | `module/moduleResolution: Node16`, `strict`, compila `src/` → `dist/`. |
| `.env.template` | Plantilla de las API keys. Se copia a `.env` (que está en `.gitignore`). |
| `skills-lock.json` y `.agents/` | Una "skill" del AI SDK para agentes de código como Claude Code. No afecta la ejecución. |

---

## 3. Cómo se ejecuta

| Comando | Qué hace |
|---|---|
| `npm run dev` | `tsx` ejecuta el TypeScript directamente, sin compilar. Es el que vas a usar. |
| `npm run watch` | Igual, pero vuelve a ejecutar cada vez que guardas. ⚠️ Cada guardado es una llamada nueva al modelo y gasta tokens. |
| `npm run build` | `tsc` compila a `dist/`. También sirve para **revisar tipos**: si no compila, hay un error. |
| `npm start` | Ejecuta el JavaScript ya compilado en `dist/`. |

### `--env-file=.env`

Es una función nativa de Node (desde la v20.6), así que no hace falta `dotenv`. Node lee el `.env` y pone cada variable en `process.env`. **Nadie en el código lee `process.env` a mano**: los proveedores del AI SDK buscan su variable solos (lo vemos en la sección 4).

### ¿Por qué los imports terminan en `.js` si los archivos son `.ts`?

```ts
import { model } from '../helpers/index.js';   // el archivo real es index.ts
```

Con `"module": "Node16"` y `"type": "module"`, TypeScript exige escribir la ruta **tal como existirá en tiempo de ejecución**. Después de compilar, `index.ts` pasa a ser `index.js`, y Node en modo ESM no adivina extensiones. Si escribes `'../helpers/index'` sin extensión, el build falla.

### `await` en el nivel superior

`main.ts` usa `await toolUseMain()` fuera de cualquier función. Esto se llama *top-level await* y solo funciona en ESM, que es otra razón para el `"type": "module"`.

---

## 4. Cómo se conecta con los modelos

### 4.1 Las piezas del AI SDK

El AI SDK (paquete `ai`, de Vercel) separa dos cosas:

- **El núcleo** (`ai`): funciones como `generateText`, `streamText` y `tool`. No saben nada de ningún proveedor.
- **Los proveedores** (`@ai-sdk/groq`, `@ai-sdk/openai`, etc.): cada uno traduce la llamada al formato HTTP de su API.

Gracias a esa separación, el mismo `generateText({ model, prompt })` funciona igual con Groq, Claude o un modelo local. Es el patrón **Adapter**.

### 4.2 `selected-model.ts`, el único punto de configuración

```ts
import { groq } from '@ai-sdk/groq';
import { ollama } from 'ollama-ai-provider-v2';
// ...

// export const model = groq('openai/gpt-oss-20b');
export const model = ollama('gpt-oss');      // ← el que está activo ahora
```

`groq('openai/gpt-oss-20b')` **no hace ninguna llamada de red**. Solo crea un objeto que describe "este modelo, en este proveedor". La llamada real ocurre cuando se lo pasas a `generateText`.

Para cambiar de modelo, se comenta una línea y se descomenta otra. Todos los patrones importan `model` desde aquí, así que todos cambian a la vez.

> Ojo: en el estado actual del repo está activo **Ollama**, aunque el último commit dice "mantener groq como selector de modelo por defecto". Revisa cuál quieres usar antes de ejecutar.

### 4.3 Cómo encuentra cada proveedor su API key

Cada proveedor tiene un nombre de variable fijo y lo busca en `process.env` por su cuenta (en `@ai-sdk/groq` se ve como `environmentVariableName: "GROQ_API_KEY"`):

| Proveedor | Variable en `.env` | Notas |
|---|---|---|
| Groq | `GROQ_API_KEY` | Tiene plan gratuito y es rápido; buena opción para estudiar. |
| OpenAI | `OPENAI_API_KEY` | |
| Anthropic | `ANTHROPIC_API_KEY` | |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | |
| Ollama | — (no usa key) | Modelo local. Requiere `ollama serve` corriendo y el modelo descargado (`ollama pull gpt-oss`). Por defecto se conecta a `http://127.0.0.1:11434/api`. |

Solo necesitas la key del proveedor que tengas activo.

Si quisieras pasar la key o la URL a mano, cada proveedor tiene una función `create*`, por ejemplo `createGroq({ apiKey })` o `createOllama({ baseURL })`. El proyecto no la usa porque la detección automática es suficiente.

### 4.4 Una llamada de principio a fin

```ts
const { text, usage } = await generateText({
  model,
  prompt: 'Responde solamente con: "OK, todo listo!"',
});
```

1. `generateText` arma los mensajes (aquí, un único mensaje de usuario con el `prompt`).
2. El proveedor los traduce al JSON de su API y hace la petición HTTP.
3. El modelo responde y el SDK normaliza la respuesta a un objeto común:
   - `text`: la respuesta final.
   - `usage`: los tokens de entrada, de salida y el total.
   - `steps`: cada "paso" (llamada al modelo) que hubo. Importa cuando hay herramientas.
   - `toolCalls` / `toolResults`: las herramientas que pidió el modelo y lo que devolvieron.
   - `finishReason`: por qué paró (`stop`, `tool-calls`, `length`…).

`prompt` es la forma corta. La forma completa es `messages: [{ role: 'user', content: '...' }]`, y existe `system` para las instrucciones de sistema.

---

## 5. Las tres funciones de `actions/get-message-model.ts`

Las tres hacen la misma pregunta. Lo que cambia es **cuánto puedes ver** de lo que pasó.

### `getMessageFromModel()`, la mínima

Llama al modelo e imprime el texto en verde. Sirve para comprobar que la key y el modelo funcionan. `main.ts` la ejecuta al final.

### `getMessageFromModelWithTrace()`, con trazabilidad

```ts
const tracer = createTracer('get-message-model');
const { text } = await generateText({
  model,
  prompt: '...',
  onStepFinish: tracer.onStepFinish,   // el SDK avisa al tracer al terminar cada paso
});
console.table(tracer.summary());       // { steps: 1, totalTokens: N }
return tracer.summary();
```

Devuelve el resumen para que quien la llame pueda **comparar** ejecuciones. Esa es la base de las tablas comparativas de cada patrón.

### `getMessageFromModelFailSafe()`, diagnóstico de errores

Envuelve la llamada en `try/catch` y traduce el error a un mensaje que se entiende:

| Situación | Cómo la detecta | Causa típica |
|---|---|---|
| 401 / 403 | `APICallError.statusCode` | Key inválida, mal copiada o con el nombre de variable equivocado. |
| 429 | `statusCode` | Rate limit: esperar o cambiar a un modelo más pequeño. |
| 404 | `statusCode` | El ID del modelo no existe o se retiró. |
| ≥ 500 | `statusCode` | Falla del proveedor; no es culpa tuya. |
| `ECONNREFUSED` | `error.cause.code` | Ollama no está corriendo. |
| `ENOTFOUND` | `error.cause.code` | Sin internet o URL mal escrita. |

Dos detalles técnicos que vale la pena entender:

- `APICallError.isInstance(error)` y no `error instanceof APICallError`: el SDK usa una marca propia porque `instanceof` falla si hay dos copias del paquete en `node_modules`.
- Los errores de red llegan envueltos: `fetch` lanza un `TypeError` y el código real (`ECONNREFUSED`) está en `error.cause`.

**Úsala cuando algo no funcione.** Cambia temporalmente `main.ts` para llamarla a ella.

---

## 6. Trazabilidad: `helpers/create-tracer.ts`

### 6.1 Qué es un "paso" (step)

Sin herramientas, una llamada a `generateText` = **1 paso** = 1 petición al modelo.

Con herramientas, el modelo puede responder "quiero llamar a `buscarCurso('docker')`". El SDK ejecuta tu función y le devuelve el resultado al modelo, que vuelve a pensar. Cada ida y vuelta es un paso:

```
Paso 1: modelo → "llama buscarCurso(typescript) y buscarCurso(docker)"
         SDK ejecuta las funciones → resultados
Paso 2: modelo → "llama calcularDescuento(...)"
         SDK ejecuta → resultado
Paso 3: modelo → texto final: "El total sería $X y son Y horas"
```

Ese ciclo de razonar, actuar y observar es el corazón de un agente, y el tracer existe para **verlo**.

### 6.2 Cómo funciona por dentro

```ts
export function createTracer(label: string) {
  let step = 0;          // variables "privadas" gracias al closure
  let totalTokens = 0;

  return {
    onStepFinish({ toolCalls, toolResults, text, usage }) { ... },
    summary: () => ({ steps: step, totalTokens }),
  };
}
```

- Es una **fábrica con closure**: cada `createTracer()` tiene sus propios contadores. Así puedes tener un tracer `'Sin-herramientas'` y otro `'Con-herramientas'` sin que se mezclen.
- `onStepFinish` es el **callback** que le pasas al SDK. El SDK lo llama al terminar cada paso con un objeto `GenerateTextStepEndEvent`.
- En cada paso imprime:

```
  ┌─ [Con-herramientas] step 1 · 312 tokens
  │  TOOL  → buscarCurso({"nombre":"docker"})
  │  RESULT← {"precio":20,"horas":12}
  │  TEXT  → ...
  └─
```

- Los resultados y el texto se recortan a 150 caracteres para no llenar la consola.
- Todo va dentro de `try/catch` para que **un error al trazar nunca rompa la ejecución del agente**. Es una regla general de observabilidad: el registro nunca debe tumbar el sistema que registra.

### 6.3 `onStepFinish` vs `onStepEnd` (AI SDK v7)

En `ai` v7, el nombre oficial del callback es **`onStepEnd`**. `onStepFinish` sigue funcionando, pero está **deprecado** (es un alias). En el repo conviven los dos:

- `get-message-model.ts` usa `onStepFinish: tracer.onStepFinish` (el nombre viejo).
- Tu `tool-use.ts` usa `onStepEnd: tracer.onStepFinish` (el nombre nuevo). ✅

Los dos compilan y hacen lo mismo. Para código nuevo, usa `onStepEnd`. El método del tracer se sigue llamando `onStepFinish`, pero eso es solo un nombre interno.

### 6.4 Otros puntos de trazabilidad en el SDK

Para cuando el tracer se te quede corto, v7 ofrece más callbacks en `generateText`:

| Callback | Cuándo se dispara |
|---|---|
| `onStepStart` | Antes de que cada paso llame al proveedor. |
| `onStepEnd` | Al terminar cada paso (lo que usa el tracer). |
| `onToolExecutionStart` / `onToolExecutionEnd` | Antes y después de ejecutar cada herramienta (útil para medir cuánto tarda). |
| `onEnd` | Una vez, al final de todo (`onFinish` es el alias deprecado). |
| `onStepError` | Cuando falla un paso. |
| `experimental_telemetry` | Integración con OpenTelemetry para enviar trazas a herramientas como Langfuse, etc. Es el siguiente nivel para producción. |

Además, el resultado de `generateText` trae `steps`, con el detalle de cada paso, así que puedes inspeccionarlo después aunque no hayas usado callbacks.

---

## 7. `helpers/string-colors.ts`

```ts
console.log(text.green);
console.log(`step ${n}`.yellow);
```

Funciona porque el archivo modifica `String.prototype`, el "molde" de todos los strings:

1. `Object.defineProperty(String.prototype, 'green', { get() {...} })` agrega un **getter**. Por eso es `.green` y no `.green()`.
2. El getter envuelve el texto en códigos ANSI: `\u001B[32m` + texto + `\u001B[0m` (reset).
3. `declare global { interface String { readonly green: string } }` le dice a TypeScript que esas propiedades existen. Sin eso, `text.green` sería un error de tipos.
4. `export {}` convierte el archivo en módulo, que es requisito para usar `declare global`.

Por eso `main.ts` lo importa **primero** y sin traer nada (`import './helpers/string-colors.js'`): solo interesa el efecto secundario.

> Modificar prototipos globales está bien en un script de estudio, pero se evita en librerías y en apps grandes, porque puede chocar con otro código. En producción se usarían paquetes como `picocolors` o `chalk`.

---

## 8. `helpers/index.ts` (barrel)

```ts
export * from './create-tracer.js';
export * from './selected-model.js';
export * from './string-colors.js';
```

Permite importar todo desde un solo lugar:

```ts
import { createTracer, model } from '../../helpers/index.js';
```

---

## 9. Dónde encaja tu patrón 01 (tool use)

### Estado actual de `tool-use.ts`

`withoutTools()` le hace al modelo una pregunta que **no puede responder bien sin datos**: el precio y las horas de dos cursos con un 20 % de descuento. El modelo no tiene el catálogo, así que va a **inventar** números con total seguridad. Ese es justamente el problema que resuelve el patrón.

`toolUseMain()` está pensada para **comparar** variantes en una tabla (`console.table`), siguiendo la misma idea de `getMessageFromModelWithTrace()`: cada variante devuelve `tracer.summary()`.

### Dos cosas a revisar

1. **`withoutTools()` no devuelve nada**, así que `resultA` queda en `undefined` y la tabla sale vacía. Falta un `return tracer.summary();` al final, igual que en `getMessageFromModelWithTrace()`.
2. **`main.ts` ejecuta el patrón y además `getMessageFromModel()`**. Es una llamada extra al modelo en cada ejecución. Coméntala si no la necesitas.

### Hacia dónde va el patrón (vista previa de la API)

Esto es solo para que reconozcas la forma de la API cuando aparezca en el video, no la solución del curso:

```ts
import { generateText, tool, isStepCount } from 'ai';
import { z } from 'zod';

const { text } = await generateText({
  model,
  prompt: QUESTION,
  tools: {
    nombreDeLaHerramienta: tool({
      description: 'Qué hace. El modelo lee esto para decidir si la usa.',
      inputSchema: z.object({ /* parámetros, validados con Zod */ }),
      execute: async (input) => { /* tu código: BD, API, cálculo… */ },
    }),
  },
  stopWhen: isStepCount(5),        // por defecto es 1 paso: sin esto, el modelo pide la herramienta y no llega a responder
  onStepEnd: tracer.onStepFinish,
});
```

Las piezas clave:

- **`description`**: el modelo decide qué herramienta usar **solo** por la descripción y el nombre. Escribirlas bien es la mitad del patrón.
- **`inputSchema` con Zod**: define y **valida** lo que el modelo puede enviar. Es el límite de confianza entre el modelo y tu código.
- **`execute`**: código normal tuyo. El modelo nunca lo ejecuta; solo pide que se ejecute.
- **`stopWhen`**: cuántos pasos se permiten. Es el límite que evita bucles infinitos y gasto descontrolado.

---

## 10. Resumen mental

| Concepto | Dónde vive | Idea clave |
|---|---|---|
| Configuración del modelo | `selected-model.ts` | Un solo lugar; el proveedor es intercambiable (Adapter). |
| API keys | `.env` → `process.env` | Cada proveedor busca su variable solo. |
| Llamar al modelo | `generateText` | Devuelve `text`, `usage`, `steps`, `toolCalls`… |
| Paso (step) | AI SDK | 1 petición al modelo. Con herramientas, hay varios. |
| Trazabilidad | `create-tracer.ts` + `onStepEnd` | Ver cada paso, herramienta y token gastado. |
| Errores | `getMessageFromModelFailSafe` | `APICallError.statusCode` y `error.cause.code`. |
| Comparar variantes | `tracer.summary()` + `console.table` | Medir con números, no a ojo. |

---

## 11. Ejercicios para afianzar (antes de seguir con el curso)

1. Cambia `main.ts` para ejecutar `getMessageFromModelWithTrace()` y observa la traza de un solo paso.
2. Pon una key falsa en `.env` y ejecuta `getMessageFromModelFailSafe()`. Luego apaga Ollama y vuelve a ejecutarla. Lee qué rama del `switch` se activa en cada caso.
3. Cambia de proveedor en `selected-model.ts` y compara tokens y velocidad con la misma pregunta.
4. Agrega `return tracer.summary();` a `withoutTools()` y comprueba que la tabla comparativa se llena.
5. Ejecuta `withoutTools()` 2 o 3 veces y anota los números que inventa el modelo. Vas a ver que **cambian en cada ejecución**: esa es la mejor razón para usar herramientas.
