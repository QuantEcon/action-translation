# Test Action on GitHub - Data Files

This directory contains test scenarios for validating the translation action against real GitHub repositories.

## Structure

- **sync-workflow-template.yml**: The source repo's sync workflow, rendered once per harness language. Its mode step passes `sync-scope: existing` for a PR with the `test-sync-scope-existing` label (#344), and `all` otherwise
- **Base documents**: Starting point for all tests (identical between EN, ZH-CN, and FA repos)
  - `base-minimal.md` / `base-minimal-zh-cn.md` / `base-minimal-fa.md` - Simple 2-section document
  - `base-lecture.md` / `base-lecture-zh-cn.md` / `base-lecture-fa.md` - Realistic lecture example
  - `base-toc.yml` / `base-toc-zh-cn.yml` / `base-toc-fa.yml` - Table of contents with 2 files
  - `game-theory.md` - New document for testing NEW document mode
  - `linear-algebra.md` - Copy of base-lecture for rename testing

- **Test scenarios**: Modified versions for testing specific changes (28 total)
  - **Basic Tests (01-08)**:
    - `01-intro-change-minimal.md` - Intro text modified
    - `02-title-change-minimal.md` - Title modified
    - `03-section-content-minimal.md` - Section content modified
    - `04-section-reorder-minimal.md` - Sections reordered
    - `05-add-section-minimal.md` - New section added
    - `06-delete-section-minimal.md` - Section removed
    - `07-subsection-change-minimal.md` - Subsection modified
    - `08-multi-element-minimal.md` - Multiple changes
  
  - **Scientific Content Tests (09-16)**:
    - `09-real-world-lecture.md` - Realistic lecture update
    - `10-add-subsubsection-lecture.md` - #### subsection added
    - `11-change-subsubsection-lecture.md` - #### content changed
    - `12-change-code-cell-lecture.md` - Code cell modified
    - `13-change-display-math-lecture.md` - Math equations changed
    - `14-delete-subsection-lecture.md` - ### deleted
    - `15-delete-subsubsection-lecture.md` - #### deleted
    - `16-pure-section-reorder-minimal.md` - Pure reorder test
  
  - **Document Lifecycle Tests (17-20)**:
    - `17-new-document-toc.yml` - NEW document added + TOC updated
    - `18-delete-document-toc.yml` - Document deleted + TOC updated
    - `19-multi-file-minimal.md` + `19-multi-file-lecture.md` - Multiple files
    - `20-rename-document-toc.yml` - Document renamed + TOC updated
  
  - **Edge Cases (21-26)**, then **Shared Assets and Directives (27-28)**:
    - `21-preamble-only-minimal.md` - Only frontmatter changed
    - `22-deep-nesting-lecture.md` - ##### and ###### nesting
    - `23-special-chars-lecture.md` - Special characters in headings
    - `24-empty-sections-minimal.md` - Sections with no content
    - `25-pre-title-content-lecture.md` - Anchor + raw block before title
    - `26-heading-case-change-lecture.md` - Heading case change (title → sentence)
    - `27-add-citation-minimal.md` - `{cite}` role whose key the target's `references.bib` lacks
    - `28-add-exercise-lecture.md` - Exercise family added (`{exercise-start}`, `{hint}`, `{solution-start}`)

## File Structure

Test files use **flat structure** (no `lectures/` folder):
- Source repo: `lecture.md` (root level)
- Target repo: `lecture.md` (root level)
- Workflow configured with `docs-folder: ''` to match root files

## Usage

The test script (`test-action-on-github.sh`) uses these files to:

```bash
./tool-test-action-on-github/test-action-on-github.sh
```

## Test Scenarios

### Phase 1: Basic Structure (Tests 01-08)
1. **Intro Change** - Only introduction paragraph modified
2. **Title Change** - Only document title modified  
3. **Section Content** - Content within one section modified
4. **Section Reorder** - Sections rearranged (tests heading-map)
5. **Add Section** - New section added to document
6. **Delete Section** - Existing section removed
7. **Subsection Change** - Content within subsection modified
8. **Multi-Element** - Complex change (title + intro + section + new section)

### Phase 2: Scientific Content (Tests 09-16)
9. **Real World** - Realistic lecture update with real content
10. **Add ####** - Sub-subsection added
11. **Change ####** - Sub-subsection content modified
12. **Code Cells** - Code cell comments/titles changed
13. **Math** - Display math equations changed
14. **Delete ###** - Subsection removed
15. **Delete ####** - Sub-subsection removed
16. **Pure Reorder** - Sections reordered without content changes

### Phase 3: Document Lifecycle (Tests 17-20)
17. **NEW Document** - Add new document (game-theory.md) + update _toc.yml
18. **DELETE Document** - Remove lecture.md + update _toc.yml
19. **Multiple Files** - Modify both lecture-minimal.md and lecture.md in single PR
20. **RENAME Document** - Rename lecture.md → linear-algebra.md + update _toc.yml

### Phase 4: Edge Cases (Tests 21-26)
21. **Preamble Only** - Only YAML frontmatter changed, no content
22. **Deep Nesting** - ##### and ###### level subsections
23. **Special Characters** - Headings with `code`, **bold**, [links], $math$
24. **Empty Sections** - Sections with headings but no content
25. **Pre-title Content** - `(label)=` anchor + `{raw} jupyter` block before `# title`
26. **Heading Case Change** - Title-case → sentence-case headings (tests heading-map case-insensitive lookup)

### Phase 5: Shared Assets and Directives (Tests 27-28)
27. **Citation Backfill** - `{cite}` role introduced; the cited key is in the source's `references.bib` but not the target's, so the sync PR must carry the entry (see `base-config.yml`)
28. **Exercise Family** - `## Exercises` with `{exercise-start}`/`{hint}`/`{solution-start}` blocks appended to `lecture.md`; `.ml` keeps them byte-identical to the source

## Notes

- All scenarios use the same base document state
- Minimal scenarios test in isolation
- Real-world scenario tests realistic content
- PRs are created as drafts with `test-translation` label
- Under `--sync-scope existing` the target reset also writes `.translate/state/lecture.md.yml`, and none for `lecture-minimal.md`; see "Scope runs" in `../README.md`
