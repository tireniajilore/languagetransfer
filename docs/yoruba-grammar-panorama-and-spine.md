# Yoruba LT Grammar Panorama and Draft Spine

Created: 2026-06-04

Purpose: turn the current Yoruba source pack into a Language Transfer-style course map before writing the full lesson set. This is not a script. It is the grammar panorama, atom graph, dependency plan, tension contour, and first numbered scaffold.

Sources used:

- `YorubaYeMi-textbook.pdf`: beginner institutional course scope, chapter sequence, topic domains, appendix sound practice.
- `Colloquial Yoruba ( PDFDrive ).pdf`: compact grammar summary and dialogue-based beginner coverage.
- `TMG+1ST+EDITION+FINAL+-+Google+Docs.pdf`: course-writing method, especially one thought at a time, cognitive load contours, weaving, masked repetition, cueing, and grammar/structure panoramas.
- Existing project docs: `docs/lt-course-design-learnings.md`, `docs/yoruba-design-doc.md`, `data/yoruba/lesson-01-script-v3.md`.

Out of scope for this pass:

- No OCR. Awobuluyi and Crowther are not used except as known future verification sources.
- No native correctness guarantee. Any Yoruba examples or sequencing decisions marked high-risk need native review before scripting.
- No assumption that the final course must be exactly 52 lessons. The first full grammar scaffold lands at 68 because the atom graph needs more recovery space than a textbook table of contents suggests.

---

## 1. Method Rules From TMG

These rules control the spine more than the textbook chapter order does.

1. A lesson teaches one new thought, not one textbook grammar label.
2. A grammar label often decomposes into several thought-moves.
3. The learner only knows what has been introduced, cued, and recycled.
4. Difficult clusters need tension contours: peak, recovery, return.
5. Repetition should usually be masked inside new communicative frames.
6. Audio-only design means no learner-facing spelling or diacritic talk.
7. A complete course should cover enough structure that the learner can derive spoken sentences, vocabulary permitting.
8. Native speaker work is a production gate, not a nice-to-have.

Working definition:

- **Main atom**: the single new thought the lesson is built to make conscious.
- **Recycled atoms**: older thoughts quietly reused so the learner keeps them alive.
- **Delayed temptations**: true Yoruba features that are intentionally not explained yet, even if they appear nearby.

---

## 2. Source Panorama

### YorubaYeMi Coverage

YorubaYeMi is useful for beginner scope and domains. Its order is classroom-first, not LT-first.

Core structures visible in the table of contents and sampled chapters:

- Sound system: vowels, consonants, syllabic `m/n`, tone practice, minimal pairs.
- Greetings and leave-taking.
- Simple verbs, subject pronouns, emphatic pronouns.
- `fẹ́` with nouns and verbs.
- Regular verb negation with `kò`.
- Questions: `Kí ni?`, `Ṣé?`, `Ta ni?`, `Mélòó?`, `Eélòó?`, and more interrogatives.
- Possessive pronouns.
- Plural marker `àwọn`.
- Numbers, time, date, days, months.
- Future marker `máa`.
- `jẹ́` and `ni` as "to be" patterns.
- Describing people and colors.
- Ownership/person-prefix patterns: `oní-`, `al-`, `ẹl-`, `ọl-`.
- `fẹ́ràn`.
- Possessive forms of emphatic pronouns.
- Body, health, sports, professions, home, clothing, campus.
- `kò tí ì` / `kò ì tí ì`.
- Ordinals.
- Reflexives with `fúnrara`.
- Vowel assimilation, vowel lengthening, vowel deletion/contraction.
- Verbs such as `fi`, `wọ`, `dé`, `wé`, `ró`, `gé`.

LT implication: YorubaYeMi tells us what a beginner eventually needs, but it groups too much by classroom chapter. We should split its "negation," "pronouns," "questions," and "time" material into smaller atoms.

### Colloquial Yoruba Coverage

Colloquial Yoruba gives the best compact grammar checklist so far.

Core structures from the grammar summary and unit sampling:

- Noun formation by vowel prefixing to verbs.
- Subject pronouns: `mo`, `o`, `ó`, `a`, `ẹ`, `wọn`.
- `ó` often drops before `kò`.
- First-person negative variants: `N kò`, `N ò`, `Mi ò`.
- Independent pronouns: `èmi`, `ìwọ`, `òun`, `àwa`, `ẹyin`, `àwọn`.
- Independent pronouns, not subject pronouns, with `ni` and `náà`.
- Object pronouns: `mi`, `ẹ`, third-person copied vowel, `wa`, `yín`, `wọn`.
- Object-pronoun tone depends on preceding monosyllabic verb tone.
- Possessive pronouns: `mi`, `(r)ẹ`, `(r)ẹ̀`, `wa`, `yín`, `wọn`.
- Prepositions: `sí`, `ní`, `lábẹ́`, `lẹ́gbẹ̀ẹ́`, `nítòsí`, `nínú`, `lórí`, `láàárín`.
- Basic verb form for past.
- `ti` for accomplished action.
- `kòì tíì` for "not yet."
- `máa ń` habitual, `kì í` habitual negative.
- `máa` future, `kò ní í` future negative.
- `ń` progressive/current action.
- Adjective patterns, including clauses with `tí`, and adjective-like forms from verbs.
- Negation by verb type: regular verbs use `kò`; `wà` negates as `kò sí`; `ni/jẹ́` uses a different negation pattern.
- Question types: `Ṣé`, `Níbo`, `Ta ni`, `Nígbà wo`, `Kí ni`, `Kí ló dé tí`, `wo`, `Eélòó`.
- `ìgbà tí`, `nígbà tí`, `nígbà tí ... bá`.
- `lẹ́yìn tí`, `lẹ́yìn tí ... bá`, and prepositional `lẹ́yìn`.
- Commands: drop `o`; negative commands use `Má`; keep `Ẹ` for plural/honorific.
- Feelings often use object pronouns/nouns: hunger, thirst, anger, tiredness, boredom.
- Existential `wà`; negative existential `kò sí`.
- `àti` joins nouns/phrases; `sì` joins sentences.
- `láti` does not map cleanly to English "to"; after `fẹ́`, no `láti` is normal, but after `fẹ́ràn + verb`, `láti` is required.
- Dialogue units also surface `lè` "can/may," `gbọdọ` "must," `pé` after verbs, relative `tí`, `bí ... bá`, comparisons with `ju ... lọ`, `gan an`, and `jùlọ`.

LT implication: Colloquial Yoruba makes clear that the course needs several "English trap" lessons: no automatic `to`, no automatic English-style subject for feelings, no single English "is," no single English "that," and no single English "not."

---

## 3. Grammar Atom Graph

Legend:

- **Load**: L = light, M = medium, H = high.
- **Risk**: L = likely stable from sources, M = needs native phrasing check, H = do not script without native review.

| ID | Atom | Learner Thought | Prerequisites | Source | Load | Risk |
|---|---|---|---|---|---|---|
| SND-01 | Audio-only tone orientation | Yoruba uses held pitch as part of the word. | none | YYM appendix, TMG audio-only rule | M | M |
| SND-02 | Three tone levels by voice | Hold high, middle, low without sliding. | SND-01 | YYM appendix | M | M |
| SND-03 | Tone minimal contrast | Changing pitch can change meaning. | SND-02 | YYM appendix | M | H |
| SND-04 | Syllable timing | Yoruba words are built from clear syllables. | SND-01 | YYM intro | L | M |
| SND-05 | Syllabic nasal | `m/n` can carry a beat. | SND-04 | YYM intro | M | M |
| SND-06 | Vowel assimilation as listening issue | Neighboring vowels may blend in speech. | OBJ-05, POSS-01 | YYM Ch10 | H | H |
| SND-07 | Vowel lengthening | A vowel may sound held because of grammar/contact. | SND-06 | YYM Ch10 | H | H |
| SND-08 | Vowel deletion/contraction | Two neighboring vowels may collapse. | SND-06 | YYM Ch10 | H | H |
| SENT-01 | No articles | Yoruba often says noun directly where English says a/the. | none | YYM Ch1 | L | L |
| SENT-02 | Basic SVO order | "I want water" lines up as subject-verb-object. | SENT-01 | YYM Ch1 | L | L |
| SENT-03 | Verbs do not conjugate by person | Person changes around the verb, not inside it. | PRON-01 | YYM Ch1, CY summary | M | M |
| SENT-04 | Plain verb can mean past | A regular verb without an aspect marker can be past. | ACT-01 | CY summary | M | M |
| SENT-05 | Serial verb feel | Yoruba can put verbs in sequence where English inserts "to." | ACT-02 | CY `láti`, YYM Ch1/7 | M | M |
| PRON-01 | `mo` as "I" | Put the speaker at the start. | SENT-02 | YYM Ch1, CY summary | L | L |
| PRON-02 | `o` as informal "you" | One person you are talking to. | PRON-01 | YYM Ch1, CY summary | M | M |
| PRON-03 | `ó` as he/she/it | A high-tone pronoun covers he, she, it. | SND-02, PRON-01 | YYM Ch1, CY summary | M | M |
| PRON-04 | `a` as "we" | The speaker plus others. | PRON-01 | YYM Ch1 | L | L |
| PRON-05 | `ẹ` as plural/honorific you | Respect and plural share the same pronoun. | PRON-02 | YYM Ch1, CY summary | M | M |
| PRON-06 | `wọn` as they / honorific he/she | The same form can mark plural or respect. | PRON-05 | YYM Ch1, CY | H | M |
| PRON-07 | Emphatic/independent pronouns | Use bigger pronouns when the pronoun acts like a noun. | PRON-01..06 | YYM Ch1, CY summary | H | M |
| PRON-08 | Pronouns with `ni` | Subject pronouns do not simply plug into `ni`. | BE-01, PRON-07 | CY summary | H | M |
| POSS-01 | Possessive pronouns after nouns | "my water" is noun + my. | PRON-01..06 | YYM Ch2, CY summary | M | M |
| POSS-02 | `(r)ẹ` variants | Some possessives surface with or without `r`. | POSS-01 | CY summary | M | H |
| POSS-03 | Possessive emphatic forms | "my own / his own" uses bigger pronoun material. | PRON-07, POSS-01 | YYM Ch8 | H | H |
| OBJ-01 | Object pronouns after verbs | "see me" uses a post-verbal object pronoun. | ACT-01, PRON-01..06 | CY summary | M | M |
| OBJ-02 | Third-person object as copied vowel | "see it" may be `rí i`, `so ó`, `gbà á`. | OBJ-01, SND-02 | CY summary | H | H |
| OBJ-03 | Object-pronoun tone response | The object vowel's tone responds to the verb tone. | OBJ-02 | CY summary | H | H |
| OBJ-04 | `fún mi` / indirect object | "for me/to me" uses `fún`. | OBJ-01 | CY units | M | M |
| OBJ-05 | Reflexive `fúnrara` | "myself/yourself" uses `fúnrara` plus possessive. | POSS-01 | YYM Ch10 | H | H |
| ACT-01 | Simple action verbs | Build sentences with regular action verbs. | SENT-02, PRON-01 | YYM Ch1 | L | L |
| ACT-02 | `fẹ́ + noun` | Wanting a thing is direct. | PRON-01, SENT-02 | YYM Ch1/7 | L | M |
| ACT-03 | `fẹ́ + verb` | Wanting to do something does not need English "to." | ACT-02, SENT-05 | YYM Ch1/7, CY `láti` | M | M |
| ACT-04 | `fẹ́ràn + noun` | Liking/loving a thing. | ACT-02 | YYM Ch7, CY | L | M |
| ACT-05 | `fẹ́ràn láti + verb` | Loving to do something requires `láti`. | ACT-04, PREP-01 | CY `láti`, YYM Ch7 | H | M |
| ACT-06 | `lè + verb` | Can/may do something. | ACT-03 | CY/YYM dialogues | M | M |
| ACT-07 | `gbọdọ + verb` | Must/have to do something. | ACT-03 | CY/YYM dialogues | M | M |
| ASP-01 | Progressive `ń` | Mark an action happening now/around now. | ACT-01 | YYM Ch1, CY summary | M | M |
| ASP-02 | Basic past with plain verb | Past can be unmarked. | ACT-01, SENT-04 | CY summary | M | M |
| ASP-03 | Completed `ti` | Mark an action as accomplished. | ASP-02 | CY summary | M | M |
| ASP-04 | Not-yet `kòì tíì` | Negate completion as "not yet." | ASP-03, NEG-01 | CY summary, YYM Ch9 | H | M |
| ASP-05 | Future `máa` | Put `máa` before verb for future. | ACT-01 | YYM Ch3, CY summary | M | M |
| ASP-06 | Future negative `kò ní í` | Future has its own negative pattern. | ASP-05, NEG-01 | CY summary | H | M |
| ASP-07 | Habitual `máa ń` | Regularly/usually doing something. | ASP-01, ASP-05 | CY summary | H | M |
| ASP-08 | Habitual negative `kì í` | Usually does not. | ASP-07, NEG-04 | CY summary | H | M |
| NEG-01 | Regular `kò` | Put `kò` before regular verb to negate. | ACT-01 | YYM Ch1, CY summary | M | M |
| NEG-02 | First-person negative shape | `mo` changes in negative speech. | NEG-01, PRON-01 | CY summary | H | M |
| NEG-03 | `ó` drop before `kò` | Third-person subject can disappear before `kò`. | NEG-01, PRON-03 | CY summary | H | M |
| NEG-04 | Not all negatives use `kò` the same way | Yoruba negation depends on verb type. | NEG-01 | CY summary | H | M |
| BE-01 | `ni` identification | "It is X / X is..." is not the same as location. | PRON-07 | YYM Ch5, CY | M | M |
| BE-02 | `jẹ́` category/profession | Being a kind of person/profession. | BE-01 | YYM Ch5 | M | H |
| BE-03 | `wà` location/existence | Being somewhere / existing somewhere. | PREP-02 | CY summary, YYM Ch2 | M | M |
| BE-04 | `kò sí` for absent/not there | Negative of `wà` is not `kò wà` in the beginner frame. | BE-03, NEG-04 | CY summary | H | M |
| BE-05 | `kì í ṣe` / not being X | Negating identity/category uses a different pattern. | BE-01, BE-02, NEG-04 | CY summary | H | H |
| Q-01 | `Ṣé` yes/no question | Add a question particle rather than changing word order. | SENT-02 | YYM Ch1, CY summary | M | M |
| Q-02 | Short yes/no answers | `Bẹ́ẹ̀ ni`, `Rárá`, then full answer. | Q-01 | YYM/CY Unit 1 | L | M |
| Q-03 | `Kí ni` what | Ask for the thing/action. | ACT-02, Q-01 | YYM Ch1, CY summary | M | M |
| Q-04 | `Níbo ni ... wà` where | Where questions need the location frame. | BE-03 | CY summary, YYM Ch2 | M | M |
| Q-05 | `Ta ni` who | Who questions use identification. | BE-01 | YYM Ch5, CY summary | M | M |
| Q-06 | `Mélòó` how many | Quantity questions over count nouns. | NUM-01 | YYM Ch4, CY summary | M | M |
| Q-07 | `Eélòó` how much | Price/cost questions. | NUM-02 | YYM Ch6, CY summary | M | M |
| Q-08 | `Nígbà wo` when | Time questions. | ASP-05, TIME-01 | CY summary | M | M |
| Q-09 | `wo` which | Which noun? | Q-03 | CY summary, YYM Ch11 | M | M |
| Q-10 | `Irú ... wo` what kind | Ask for type/kind. | Q-09, DESC-01 | CY units | M | M |
| Q-11 | `Kí ló dé tí` why | Ask for reason. | CLAUSE-03 | CY summary | H | M |
| Q-12 | `Báwo ni` / `bí ... ṣe` how | Direct how-question vs embedded how-clause. | CLAUSE-02 | CY units | H | M |
| PREP-01 | `sí` to | Movement/direction to a place. | ACT-01 | CY summary | M | M |
| PREP-02 | `ní` in/at | Location in/at. | BE-03 | CY summary | M | M |
| PREP-03 | Location nouns | Under, beside, near, inside, on top, between. | PREP-02 | CY summary, YYM Ch10 | M | M |
| PREP-04 | `láti` as real preposition | To/from, but not English infinitive "to." | ACT-03, PREP-01 | CY summary | H | M |
| NUM-01 | 1-20 counting | Numbers as useful slots. | none | YYM Ch2/3, CY Unit 3 | M | M |
| NUM-02 | Money and larger numbers | Larger numbers for market/price. | NUM-01, Q-07 | YYM Ch6 | M | H |
| NUM-03 | Ordinals | First, second, etc. | NUM-01 | YYM Ch10 | M | M |
| TIME-01 | Today/tomorrow/yesterday | Time adverbs anchor aspect. | ASP-02, ASP-05 | YYM Ch3/4, CY | L | M |
| TIME-02 | Days/months/date | Calendar expressions. | TIME-01, NUM-01 | YYM Ch3 | M | M |
| TIME-03 | Clock time | What time is it / at what time? | NUM-01, Q-06 | YYM Ch4 | M | M |
| DESC-01 | Basic descriptors | Big, small, good, bad, tall, short. | BE-02 | YYM Ch5, CY summary | M | M |
| DESC-02 | Adjective from verb | Some descriptors are built from verb-like forms. | DESC-01 | CY summary | H | M |
| DESC-03 | Intensifiers `gan an`, `púpọ̀` | Very/a lot. | DESC-01 | CY/YYM dialogues | L | M |
| DESC-04 | Comparison `ju ... lọ` | More than / too much. | DESC-01 | CY/YYM units | H | M |
| DESC-05 | Colors | Color descriptors. | DESC-01 | YYM Ch4 | L | M |
| DESC-06 | `tí` relative descriptor | "the house that is big." | CLAUSE-01, DESC-01 | CY summary | H | M |
| PL-01 | Plural `àwọn` | Plural can be marked before noun. | SENT-01 | YYM Ch2 | M | M |
| PL-02 | Plural not always required | Yoruba can leave number unmarked when context handles it. | PL-01 | native review needed | M | H |
| OWN-01 | `oní-` owner/doer/seller | A prefix can build person/owner words. | ACT-01, POSS-01 | YYM Ch6 | H | H |
| FEEL-01 | Hunger/thirst as things acting on me | English subject feeling becomes Yoruba object. | OBJ-01, ASP-01 | CY summary, YYM Ch8 | H | M |
| FEEL-02 | Anger/tired/bored patterns | More feeling expressions use object/pronoun logic. | FEEL-01 | CY summary | H | M |
| CMD-01 | Simple commands | Drop informal `o` before the verb. | PRON-02, ACT-01 | CY summary | M | M |
| CMD-02 | Negative commands | `Má` before command. | CMD-01, NEG-01 | CY summary | M | M |
| CMD-03 | Respectful/plural commands | Keep `Ẹ` for plural/honorific command. | PRON-05, CMD-01 | CY summary | M | M |
| CONJ-01 | `àti` for nouns/phrases | Join things. | SENT-01 | CY summary | L | L |
| CONJ-02 | `sì` for sentences | Join full thoughts. | ACT-01 | CY summary, YYM | M | M |
| CLAUSE-01 | `tí` after nouns | "that/which" after a noun. | DESC-06 | CY units | H | M |
| CLAUSE-02 | `pé` after verbs | "that" after saying/knowing/believing. | ACT-01 | CY units | H | M |
| CLAUSE-03 | Reasons with `nítorí pé` | Because/reason clauses. | CLAUSE-02 | CY/YYM units | H | M |
| CLAUSE-04 | `nígbà tí` when statement | When something happened. | ASP-02, CLAUSE-01 | CY summary | H | M |
| CLAUSE-05 | `nígbà tí ... bá` future/conditional when | When/if condition for future action. | ASP-05, CLAUSE-04 | CY summary, YYM | H | H |
| CLAUSE-06 | `bí ... bá` if/when | Conditional frame. | CLAUSE-05 | CY/YYM dialogues | H | H |
| CLAUSE-07 | `lẹ́yìn tí` after clause | After something happened. | CLAUSE-04 | CY summary | H | M |
| CLAUSE-08 | `lẹ́yìn tí ... bá` after-condition | After X happens, Y will happen. | CLAUSE-05, CLAUSE-07 | CY summary | H | H |
| CLAUSE-09 | Prepositional `lẹ́yìn` | After work/class as a phrase. | PREP-03, CLAUSE-07 | CY summary | M | M |

---

## 4. Major Dependency Chains

### Pronouns

`mo` -> regular subject set -> respect/plural distinction -> emphatic/independent pronouns -> `ni` with independent pronouns -> possessives -> object pronouns -> reflexives.

Do not introduce object-pronoun vowel copying until the learner has heard many verb + object combinations and is comfortable with tone.

### Negation

Regular `kò` -> first-person negative variants -> third-person drop before `kò` -> `wà` becoming `kò sí` -> `ni/jẹ́` negative -> not-yet `kòì tíì` -> habitual negative `kì í` -> future negative `kò ní í`.

Do not teach "Yoruba negation" as one lesson. It is a recurring course thread.

### Aspect and Time

Plain verb/simple action -> progressive `ń` -> plain verb as past -> `ti` completed -> `kòì tíì` not-yet -> future `máa` -> habitual `máa ń` -> negative future/habitual.

Keep time words as recovery material after aspect peaks. Dates and clock time are useful because they recycle aspect without adding much grammar.

### Location and Existence

`ní` in/at -> `wà` be located/exist -> `Níbo ni ... wà?` -> `kò sí` not there/there is no -> location nouns -> existential sentences.

This chain should come before heavy object pronouns and before classroom/house domains.

### English "to"

`fẹ́ + verb` with no `láti` -> movement `sí` as "to" -> `láti` as actual to/from -> `fẹ́ràn láti + verb`.

The learner should first feel that English "to" is not automatically translated. Only later should `láti` appear as a real Yoruba tool.

### English "is"

`ni` identification -> `jẹ́` category/profession -> `wà` location/existence -> `dára/burú` adjective-like evaluation -> different negative patterns.

This should be a multi-lesson arc. English "is" is one word hiding several thoughts.

### Clauses

`tí` after nouns -> `pé` after verbs -> reason clauses -> `nígbà tí` -> `nígbà tí ... bá` -> `bí ... bá` -> `lẹ́yìn tí`.

Delay clauses until the learner can already handle pronouns, aspect, questions, and negation with low effort.

---

## 5. Tension Contour Design

The course should alternate between structural peaks and communicative recovery domains.

| Arc | Lessons | Main Job | Load Shape | Recovery Domains |
|---|---:|---|---|---|
| 0 | 1-4 | First sentence engine and tone awareness | M, L, M, M | Water/food/sleep, greetings |
| 1 | 5-12 | Pronouns, regular negation, first questions | M, H, L, M, H, L, M, M | Wanting, names, greetings |
| 2 | 13-20 | Possession, plural, location/existence | M, H, L, M, M, L, M, M | Classroom/home |
| 3 | 21-31 | Time/aspect system | H, L, M, H, L, M, H, L, H, L, H | Days, dates, routines |
| 4 | 32-38 | Being, family, description, identity negation | H, M, L, H, M, L, H | Family/person descriptions |
| 5 | 39-48 | Objects, food/market, `láti`, ability, feelings | H, L, M, M, H, L, M, M, H, L | Food, health, shopping |
| 6 | 49-51 | Commands and respect | M, M, H | Greetings, practical requests |
| 7 | 52-58 | Core clauses and conditionals | H, H, L, H, H, H, H | Travel, visits |
| 8 | 59-68 | Late grammar, word-building, sound synthesis | M, H, L, M, H, H, H, H, H, M | Home, campus, storytelling |

Why 68 instead of 52 for the first full scaffold:

- The atom graph exposes four high-load clusters that need breathing room: negation, aspect, object pronouns, and clauses.
- The source pack also includes late beginner structures that should not be hidden: after-clauses, comparison, must/can, `àti` vs `sì`, ordinals, derivational prefixes, reflexives, object-vowel copying, and vowel contact processes.
- TMG warns against turning a resolved teacher thought into a learner overload.
- The scaffold can shrink after rater feedback, but the first map should not hide the recovery lessons.

---

## 6. Draft Lesson Spine

This is the first numbered scaffold. Lesson numbers are provisional containers, not sacred structure.

| # | Load | Main atom | Recycled atoms | Delayed temptations |
|---:|---|---|---|---|
| 1 | M | Tone as held pitch; `mo fẹ́` frame | no articles, SVO, `fẹ́ + noun`, `fẹ́ + verb` | `Ṣé`, `láti`, full pronoun set |
| 2 | L | Same frame with more nouns/actions | `mo`, `fẹ́`, tone copying, no articles | negation, question particles |
| 3 | M | `o` informal you vs `mo` | `fẹ́ + noun/verb`, SVO | honorific `ẹ`, object `ẹ` |
| 4 | M | `ó` he/she/it and tone contrast | `mo/o`, tone levels, simple verbs | object `ó/i`, third-person negation drop |
| 5 | M | `a` we and regular pronoun swapping | `mo/o/ó`, `fẹ́`, simple verbs | emphatic pronouns |
| 6 | H | `ẹ` as plural/respectful you | all prior subject pronouns | `wọn` honorific, commands |
| 7 | L | Greetings as recovery and respect practice | `ẹ`, `o`, tone, short answers | grammar of every greeting |
| 8 | M | `wọn` as they | pronoun swapping, simple verbs | `wọn` honorific singular |
| 9 | H | Regular `kò` negation | pronouns, simple verbs, `fẹ́` | first-person negative variants, `kò sí` |
| 10 | L | More regular negation in desire/actions | `kò`, `fẹ́ + noun/verb`, pronouns | `kò tíì`, `kì í` |
| 11 | M | `Ṣé` yes/no questions | pronouns, negation, short answers | wh-questions |
| 12 | M | `Kí ni` what? | `Ṣé`, `fẹ́`, nouns/actions | embedded questions |
| 13 | M | Possessive pronouns after nouns | pronouns, `Kí ni`, no articles | `(r)ẹ` details, reflexives |
| 14 | H | Plural `àwọn` | possessives, pronouns, simple questions | plural optionality |
| 15 | L | Classroom/home nouns as masked repetition | plural, possessives, `Kí ni` | location grammar |
| 16 | M | `ní` in/at | classroom/home nouns, possessives | `sí`, `wà`, contraction |
| 17 | M | `wà` location/existence | `ní`, pronouns, nouns | `kò sí` |
| 18 | L | `Níbo ni ... wà?` where is/are? | `wà`, `ní`, `Ṣé`, pronouns | location nouns |
| 19 | M | `kò sí` not there / there is no | `wà`, `níbo`, regular `kò` contrast | existential abstraction |
| 20 | M | `sí` to, movement toward | `wà/ní`, simple verbs | `láti`, serial motion chains |
| 21 | H | Plain verb as past | simple actions, time words | `ti`, progressive contrast |
| 22 | L | Yesterday/today/tomorrow recovery | plain past, movement, location | clock time |
| 23 | M | Progressive `ń` | simple action, location, pronouns | habitual `máa ń` |
| 24 | H | `ti` completed action | plain past, progressive contrast | `kòì tíì`, `ti ... rí` |
| 25 | L | Days/months/date as recycle field | `ti`, plain past, questions | full calendrical culture load |
| 26 | M | Future `máa` | tomorrow, movement, desire | future negative |
| 27 | H | `kòì tíì` not yet | `ti`, `kò`, time words | `kò ní í`, `kì í` |
| 28 | L | Plans and routines recovery | `máa`, `ti`, `kòì tíì` | habitual |
| 29 | H | Habitual `máa ń` | progressive `ń`, future `máa` | habitual negative |
| 30 | L | Daily routine domain | `máa ń`, time words, pronouns | `kì í` |
| 31 | H | Habitual negative `kì í` | `máa ń`, regular negation | `ni/jẹ́` negation |
| 32 | H | `ni` identification | pronouns, names, `Ta ni` preview | `jẹ́`, independent pronoun rules |
| 33 | M | `Ta ni` who? | `ni`, family nouns, pronouns | relative clauses |
| 34 | L | Family tree recovery | `ni`, `Ta ni`, possessives | honorific `wọn` as singular respect |
| 35 | H | `jẹ́` category/profession | `ni`, family/person words | `kì í ṣe` |
| 36 | M | Basic descriptions | `jẹ́`, `ni`, family/person words | adjective formation |
| 37 | L | Colors/describing people | descriptions, questions, possessives | comparison |
| 38 | H | Negating identity/category | `ni`, `jẹ́`, regular `kò` contrast | full negative paradigm |
| 39 | H | Object pronouns: me/you/us/them | action verbs, pronouns, `fún` preview | third-person copied vowel |
| 40 | L | Food/market recovery with objects | object pronouns, `fẹ́`, `fẹ́ràn` | `láti` after `fẹ́ràn` |
| 41 | M | `fẹ́ràn + noun` | desire frame, object pronouns | `fẹ́ràn láti + verb` |
| 42 | M | `láti` trap: not English "to" | `fẹ́ + verb`, `sí`, `fẹ́ràn` | all uses of `láti` |
| 43 | H | `fẹ́ràn láti + verb` | `láti`, serial verb frame | stilted `fẹ́ láti` |
| 44 | L | Market/price recovery | `Eélòó`, numbers, `fẹ́ràn` | haggling idioms |
| 45 | M | `Eélòó` and money | numbers, price nouns, questions | big-number overload |
| 46 | M | `lè + verb` can/may | `fẹ́ + verb`, `sí`, object pronouns | permission nuance |
| 47 | H | Feelings as object patterns | object pronouns, progressive `ń` | all idiomatic body expressions |
| 48 | L | Health/body recovery | feelings, object pronouns, questions | medical vocabulary breadth |
| 49 | M | Commands: drop `o` | `o`, simple verbs | respectful commands |
| 50 | M | `Má` negative commands | commands, regular negation | prohibitive idioms |
| 51 | H | Respectful/plural commands with `Ẹ` | `ẹ`, commands, greetings | honorific `wọn` expansion |
| 52 | H | `tí` relative descriptors | descriptions, nouns, `ni/wà` | `pé`, nested clauses |
| 53 | H | `pé` after verbs | saying/knowing/wanting, `tí` contrast | reported speech depth |
| 54 | L | Travel/visits recovery | `pé`, `tí`, future, location | conditionals |
| 55 | H | `nígbà tí` when clauses | aspect, time words, `tí` | `bá` conditionals |
| 56 | H | `bí/nígbà tí ... bá` conditional future | future `máa`, clauses, time | deep conditionals, subjunctive-like analysis |
| 57 | H | `lẹ́yìn tí` after-clauses | `nígbà tí`, aspect, time words | `lẹ́yìn tí ... bá` |
| 58 | H | `lẹ́yìn tí ... bá` and prepositional `lẹ́yìn` | future, conditional `bá`, time clauses | overbuilding clause stacks |
| 59 | M | `gbọdọ + verb` must/have to | `lè`, commands, future | obligation nuance |
| 60 | H | Comparison `ju ... lọ`, `jù`, `jùlọ` | descriptions, numbers, questions | proverbial/idiomatic comparison |
| 61 | L | `àti` for nouns vs `sì` for sentences | family, food, action chains | other conjunctions |
| 62 | M | Ordinals and sequencing | numbers, time, family order | ceremonial/cultural ordering vocabulary |
| 63 | H | `oní-/al-/ẹl-/ọl-` owner/doer/seller words | possession, market, professions | full morphophonology |
| 64 | H | Noun formation by vowel prefix | verbs, `oní-` word-building | predicting all prefix vowels |
| 65 | H | Reflexive `fúnrara` | possessives, object pronouns, body verbs | vowel contact details |
| 66 | H | Third-person object copied vowel | object pronouns, tone, simple verbs | full tone rule |
| 67 | H | Object-pronoun tone response | copied vowel, monosyllabic verbs | spelling/notation talk |
| 68 | M | Vowel assimilation, lengthening, deletion as listening synthesis | object vowels, possessives, reflexives | teaching it as a written rule |

That means the honest first full beginner grammar scaffold is **68 lessons**, not 52. A 52-lesson version is possible, but it would be a core conversational course with several late grammar structures moved into bonus tracks or postponed to an intermediate course.

---

## 7. Missing/Unresolved Grammar Questions

These need native speaker or stronger grammar-source confirmation before full scripting.

1. Lesson 1 eat frame: whether `Mo fẹ́ jẹ`, `Mo fẹ́ jẹun`, or both should be taught, and what register/meaning difference the learner should feel.
2. The safest beginner form for first-person negation: `N kò`, `N ò`, `Mi ò`, and how dialect/register affects a heritage learner audience.
3. Exact treatment of `jẹ́` vs `ni` for identity/category/profession.
4. Whether to teach `kì í ṣe` early as the negative of identity/category or delay until after habitual negative.
5. How soon to expose `wọn` as honorific singular.
6. How to teach object-pronoun copied vowels in audio without turning the lesson into notation talk.
7. Which tone minimal pairs are safe, common, and emotionally useful for a heritage learner.
8. How much vowel assimilation/contraction belongs in the core course versus speaker notes.
9. Whether the course should include visible transcript support. If yes, the audio-only script rule still governs teacher talk.

---

## 8. Production Recommendation

Do not script all 68 lessons now.

Professional sequence:

1. Lock this panorama after one native/teacher review.
2. Write Lessons 1-4 as full scripts.
3. Native review the scripts for correctness, tone, register, and "would you give this to a cousin?"
4. Adjust the atom graph.
5. Write Lessons 5-12.
6. Review again.
7. Only then automate lesson generation from the graph.

The automation target should not be "make 68 lessons." It should be:

- choose one main atom,
- pull prerequisite atoms,
- select recycled atoms,
- enforce delayed temptations,
- design a tension contour,
- produce a script,
- run method QA,
- run grammar QA,
- send to native review.

The grammar atom graph is the real spine. The numbered lessons are the current draft delivery plan.
