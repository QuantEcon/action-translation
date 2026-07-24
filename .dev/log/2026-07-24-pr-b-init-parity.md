# 2026-07-24 — #159 (PR B): init's structural-parity guard, with the corpus measured first

The four-line fix as specified: `translateLecture` runs `checkStructuralParity` on the exact
bytes it would write (after typography + heading-map injection, matching `forward`'s
placement) and throws `formatParityViolations` instead of writing; `runInit`'s existing
per-file catch turns that into a counted, reported failure. New `init-parity.test.ts`
(dropped anchor, mutated directive — both write nothing — plus a clean pass); no module
mocks needed since `translateLecture` takes the translator as a parameter, exported for
tests like `forward`'s `resyncSingleFile`.

**The measurement the wave brief required** (how loud will the guard be), run against the
built check over 248 source/target pairs in five editions — local checkouts except
`lecture-python.myst`/`.zh-cn`, which were stale locally and shallow-cloned fresh:

| edition | pairs | failing |
|---|---|---|
| programming.fa | 26 | 2 |
| programming.fr | 26 | 1* |
| programming.zh-cn | 26 | 1 |
| python.zh-cn | 121 | 3 |
| intro.zh-cn | 49 | **25** |

\* stale local checkout: the one .fr failure is `sympy.md`'s `(sympy)=`, restored by .fr#16
(merged 2026-07-21, after the 07-16 checkout) — verified present in the live repo, so the
current-estate number is **31/248**, and programming.fr is clean.

Reading: the four guard-era editions are nearly clean (6/199, including the known
`about_py.fa` and `jax_intro.zh-cn` damage — both real, both pre-date the guard).
`intro.zh-cn` (seeded pre-guard, checkout 2026-07-16) fails half its corpus, mostly
wholesale directive-count mismatches vs today's source — pending drift and old seed damage
conflated; a re-init would compare fresh output against today's source, so these numbers
are the *visible backlog*, not a prediction of fresh-translation failure rate. Full detail
in `scratch/init-parity-measurement-2026-07-24.txt` (gitignored).

STATE's v0.20.0 bullet updated: `init` is no longer the one unguarded write path.
