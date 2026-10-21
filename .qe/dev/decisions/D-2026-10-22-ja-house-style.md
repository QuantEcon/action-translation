# Japanese: the edition's house style, and four glossary points

**Context**: The terminology policy (`D-2026-09-01-ja-terminology-policy`) left the edition's
prose style unset. No rule fixed the register, the punctuation, the parentheses around Latin
text or the spacing between Japanese and Latin words, so the model chose, and could choose
differently from one lecture to the next. Four glossary points were also raised on #69 after
the v1.1 rebuild. #337 put both to the edition's two translators, Chihiro2000GitHub and
xuanguang-li, and the rulings were recorded there on 2026-10-02 and 2026-10-22
([comment](https://github.com/QuantEcon/action-translation/issues/337#issuecomment-6328366808)).

**Decision**:
- **Register (H1):** the plain である style throughout, as Japanese textbooks and lecture
  notes use; exercise instructions end in 〜なさい.
- **Punctuation (H2):** 、。, never ，．.
- **Parentheses (H3):** full-width around Latin text, abbreviations and asides in prose.
- **Spacing (H4):** a half-width space between Japanese and a Latin word or inline code
  (NumPy の配列, AR(1) 過程).
- **Code comments (H5):** translated into Japanese, as in the Chinese and French editions.
- **Figure labels (H6):** English until Japanese font support lands (#260), so drafts use
  `--localize code-comments`.
- **Glossary (T1–T4):** オーソリティ中心性, for consistency with ハブ中心性; 資本の限界生産力,
  as Japanese Wikipedia has it; 連邦準備制度経済データ（FRED）; Survey of Consumer
  Finances（SCF）, because the lectures use the acronym on its own.
- **Datasets:** the 2026-09-01 clause "named datasets and surveys keep their English name"
  becomes "…unless the glossary gives a Japanese one". FRED and NBER on their own stay bare
  acronyms (C2).
- **Katakana glosses (C1):** decided term by term. A gloss is kept where the katakana word is
  familiar to economics or statistics readers (通貨発行益（シニョリッジ）, 台（サポート）) and
  dropped otherwise (年金 for annuity); new cases are settled in each lecture's review.

**Consequences**: `glossary/ja.json` v1.1 → v1.2 (five values); `LANGUAGE_CONFIGS.ja` rules
1, 2 and 7 amended, and rules 8 (register) and 9 (parentheses) added, keeping 1–7 in the
order #337 cites them; a Japanese example for the code-comments localisation. Tests pin the
four glossary values, the spacing (no Latin word abuts Japanese in any entry) and the new rule
text. Supersedes the dataset clause of `D-2026-09-01-ja-terminology-policy`.

**Refs**: #337 (the rulings), #338 (this change), #69, #260 (Japanese fonts), #339 (the
programming terms, next).
