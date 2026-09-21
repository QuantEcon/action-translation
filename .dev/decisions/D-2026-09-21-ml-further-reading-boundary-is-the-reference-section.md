# Malayalam: the Further Reading boundary is the outside-pointing reference section

**Context**: `D-2026-09-18-ml-further-reading-lists-stay-english` accepted that the `ml` edition
keeps its Further Reading bullets in English, and left one question open: where the editor of
record draws the line — that section heading, any list of external links, or any bullet that
opens with a link. It was put to him on lecture-python-programming.ml#22. He answered on
2026-09-19: *"Keep the Further Reading section in English - this was intentional. Further
Reading is reference material pointing outside the lecture - the reader will follow those links
into English content anyway."*

**Decision**: The boundary is the **section**: a closing block of reference material whose
bullets point outside the lecture ("Further Reading", "References" and the like). The test is
his reason, not the markup — the reader is about to land in English content, so an English
pointer serves that reader better. It follows that the ruling does **not** extend to a link-led bullet
in the body of a lecture, nor to a list that points at other lectures of the same edition
(those land in Malayalam): both are ordinary prose and are translated. The 09-18 record stands
unchanged; this one settles the question it left open, and the existing prompt rule already
describes exactly this region, so its wording does not change.

**Consequences**: The boundary now has no judgement in it for the heading-anchored case, so it
can move from prompt to code as the 09-18 record anticipated — restore the list under a
recognised reference heading from the source bytes, `verbatim-directives.ts`-style, and check it
in `diff-checks`. That is follow-up work under #260, not part of this change; until then the
prompt rule carries it (regeneration evidence: Further Reading verbatim 6/6 in the 2026-09-18
arm). A reference list that sits under an unrecognised heading stays with the prompt rule.
#promote
