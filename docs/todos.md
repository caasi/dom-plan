# Todos

Work that is planned but not done. Known limits and open questions are in `known-issues.md`.

## Before publication

- [ ] Write a `README.md`: the core idea, an install command, one example, and a link to `AGENTS.md` and the design record.
- [ ] Do the review with `review-loop`.
- [ ] Create the GitHub repository and add a remote.
- [ ] Decide if `dist/` is published as `tsc` output (6.4 KB) or minified (about 1.1 KB with gzip). The current decision is plain `tsc` output, because the bundler of the user minifies it.
- [ ] Add `package.json` fields for publication: `repository`, `keywords`, `engines`, and remove `"private": true`.

## Later

- **Generator style (`Plan.gen`).** `yield*` as do notation. At `run`, the steps execute in order, and the set of each step returns to the generator as one value.

  ```ts
  Plan.gen(function* () {
    const items = yield* Plan.all('li.todo') // Element[]
    yield* Plan.all('#count').setText(String(items.length))
  }).run(document)
  ```

  - In the step model, the set of each step is one value, so the generator runs forward once. It does not need the replay that burrido needs.
  - `yield*` needs `[Symbol.iterator]` on `Plan`. That makes a plan iterable, so spread and `for...of` must not mislead users. This risk is of the same kind as the thenable problem (Fable v3 #2 in `000-design.md`).
  - It brings back "the next step depends on the result". Evaluate it again together with D5 and D21.
  - References: `Effect.gen` (the smallest bundle of Effect v4 measured about 57 KB with gzip on 2026-10-05, too large to use), MobX `flow`, `pelotom/burrido`.

- **A test with agents.** The name `Plan` was chosen so that agents remember to call `run` (D19). This is a claim about behavior. To test it, give agents a task that uses dom-plan, across model tiers, and count the plans that are never run.
