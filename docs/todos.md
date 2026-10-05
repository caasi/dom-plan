# Todos

Work that is planned but not done. Known limits and open questions are in `known-issues.md`.

- **Generator style (`Plan.gen`).** `yield*` as do notation. At `run`, the steps execute in order, and the set of each step returns to the generator as one value.

  ```ts
  Plan.gen(function* () {
    const items = yield* Plan.all('li.todo') // Element[]
    yield* Plan.all('#count').setText(String(items.length))
  }).run(document)
  ```

  - In the step model, the set of each step is one value, so the generator runs forward once. It does not need the replay that burrido needs.
  - `yield*` needs `[Symbol.iterator]` on `Plan`. That makes a plan iterable, so spread and `for...of` must not mislead users. This risk is of the same kind as the thenable problem (Fable v3 #2 in `000-design.md`).
  - It brings back "the next step depends on the result" inside one `run`. Read D5 (the only exit is `run`) and D21 again before you decide.
  - It adds no new function. Today a `tap` with the native API, or a `run` inside `tap` (D21), lets a later step use the elements of an earlier step. `Plan.gen` is a shorter form of the same thing.
  - The body of a generator is known only at `run`. Then a plan is no longer a complete array of steps before `run`, and the batch item below cannot see all reads. Decide the two items together.
  - It does not help with asynchronous work. A `fetch` needs an async generator, and that brings back the Promise wrapper that D21 rejects.
  - The examples do not need it (read on 2026-10-05). The todo `count` counts the open items of each `.todoapp`. A generator version with `yield* Plan.all('.todos li:not(.done)')` counts the items of the whole document. The handlers `add`, `startEdit` and `toggle` have their values when they start. The weather example depends on a `fetch`.
  - Evaluate it again when real code has a chain of three or more reads, each read uses the result of the read before it, and the nested `tap` and `run` are hard to read.
  - References: `Effect.gen` (the smallest bundle of Effect v4 measured about 57 KB with gzip on 2026-10-05, too large to use), MobX `flow`, `pelotom/burrido`.

- **Batch reads before writes (layout thrashing).** A common complaint about jQuery is that a chain mixes reads and writes, so the browser computes the layout again and again. The same selector is also queried again at each use. A plan is a complete array of steps before `run`, so `run` can see all reads and writes before it does any of them. jQuery runs each call at once and cannot do this. Today `exec` runs the steps in the written order, and a plan queries again at each `run`. This conflicts with D26 (no composition of effect order), so it needs a new decision first. It also conflicts with `Plan.gen` (above).

- **A test with agents.** The name `Plan` was chosen so that agents remember to call `run` (D19). This is a claim about behavior. To test it, give agents a task that uses dom-plan, across model tiers, and count the plans that are never run.

- **The README in the 0.1.0 package is old.** It says that the package is not on npm. The next release corrects it. A release only for this change is not necessary.
