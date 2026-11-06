# What `interpret` reads wrong or lets through

Carried here on 2026-11-06 from `@orkestrel/learn`, which the user retired unpublished, so these readings outlive that package's folder. Its history stays in that repository. Every figure is from `learn`'s reads on the build named, and each row keeps its example message, so a later run can test it.

## Open, each on the user's word

**Law G, a real defect.** 0.0.22 holds `years` 5 on "for 5 years and 3 months" and `hours` 40 on "for 40 hours and 20 minutes", while "years 3 and 6 months" asks. Its statement, reach, and cost are in § Part of a group below. It was chosen on the rows that prompted it, so it needs one sealed read on a corpus that didn't, before anyone trusts it.

**Which number belongs to which field when they share a unit.** A word binds one number that isn't its own: "Need one hour on the lab microscope. Training on this microscope is 42.5 hours." holds `hours` 42.5, and "3.5 hours of training" holds `hours` 3.5. It's the single-number gap: `hours` is one field's name and another field's unit, and the word occurs once. A declared unit alone can't separate them, because booking, training, and supervision are all hours, so it also needs declared ownership. D24 below is where this was headed.

**The rate of part-of-a-group misreadings** depends on how people write: 25.4 per 1,000 bound rows on Taskmaster-1, 12.5 on RESTAURANTS-8K, and 0 on MultiWOZ booking, marked blind by two readers.

## Deferred rows, as `learn`'s plan held them

| Id | Row | Trigger | Where |
| --- | --- | --- | --- |
| D18 | Below § Hardening's bar. `interpret`'s question text reads "What is your years?", because it builds from the field name. | bar 1's example or M3 reads it badly enough to cost an answer |
| D19 | Below § Hardening's bar. `interpret`'s `Recipe` requires a `definition` this package never runs, and its domain words sit in the extractor, so a recipe alone cannot be matched. This package's recipe form derives both. | a second consumer composes `interpret` without this package, or the design session rules on bar 1's line count |
| D22 | Known, and stopped by the design session under § Size gate. `116 panels, and each panel is 440 watts` claims `panels: 440`, and `17 panels … though we first planned 31 panels` holds 31. Both are on `known-limits.md`. Rows 11 and 12 of `family-audit-verdict.md` were the last reading rules tuned against sum recipes before M3, because that is the depth the hardening stopped, and M3 says which errors cost decisions. Rows 13 to 15 are outside this stop, as the design session ruled, because they are wrong decisions at any recipe. | M3 shows these cost decisions |
| D24 | A field declaring its kind and unit in the shape, so a following word could be told from a mismatch and a number's unit from a field's. M2's checks give it its first evidence: a public `unit` can't say a unit is wrong for this field, so `running three days a week` loses its question, and a numeric shape carries no money or percent. It is the one mechanism there the design session expects to matter, and it adds to what authors write. M3 adds evidence: `interpret` binds `hours` to another field's number on 36 of 600 `laboratory` rows, as in `3.5 hours of training` or a booking of `1 hour`, with 0 wrong decisions, and nothing that closes the optional-field rows lands until this gap is handled (O39). | H3, which carries it as a veto with declared phrase ownership (O45) |
| D25 | Known, and left by the design session. `amount 50000, and up` claims 50000, because punctuation breaks the following-word test, so the narrowed `and` and `with` links catch `amount 50000 and up` only without the comma. It is pinned by one named test, and it is on `known-limits.md`. | M3 reads whether it costs decisions |

## Part of a group

## A number that's only part of a group

**The answer, 2026-11-06: mostly no law. One narrow law is true of any message, and it catches 5 of the 23 rows at almost no cost. The other 18 turn on what a word means, or need a declaration, so they stay known limits.** Nothing lands from this file. It's on paper, on spent rows, and it's development evidence. It isn't H3: law G removes 0 of the 37 wrong bindings M3 holds on its main rows, so H3's shared-unit question stays as `plan.md` § Sequence writes it.

### The class, measured

Every row the floor binds on `people` under the booking recipe, on both splits, read with no arm in view. Two readers marked every row. A third, larger reader marked the 15 rows they differed on, among 114 agreed rows as controls, and agreed with the 60 fine controls and 51 of the 54 marked ones.

| Corpus | Rows bound | Part of a party | Per 1,000, 95 percent |
| --- | --- | --- | --- |
| Taskmaster-1, the floor | 473 | 12 | 25.4, 13.2 to 43.9 |
| Taskmaster-1, what only a repair for a sentence-end period binds | 217 | 1 | 4.6, 0.1 to 25.4 |
| RESTAURANTS-8K | 642 | 8 | 12.5, 5.4 to 24.4 |
| MultiWOZ 2.4 booking | 566 | 0 | 0, 0 to 6.5 |

- The rate depends on how people write. MultiWOZ's writers followed goal cards and wrote "a table for 8 people at 14:15", with nothing continuing past the field word.
- 4 of RESTAURANTS' 8 are one template with the name swapped.
- About 10 further rows are honestly ambiguous, in two forms: a child or high chair that may be in the count ("4 people, plus one high chair", "Three people, one child"), and whether the speaker is in the count ("I'll be bringing two people"). The third reader called them fine, and marked each as a call another careful reader could make differently. With them, Taskmaster-1's floor reads at most 15 of 473.
- The score reads 0 on these rows, because a turn with no annotated party isn't counted wrong and the annotation holds the same number on the ones it marks.
- On Taskmaster-1's booking recipe none flips a decision, one true party unknown. On RESTAURANTS "one for 5 people and one for 7" approves on 5 where 12 is the party, so one does.

### What the floor reads today

Law 2 reads a number's neighbours and accepts a number whose next word is its anchor. Nothing reads past the anchor. So "4 people and one kid" binds 4, because the 4 is followed by `people`, and "and one kid" is never read.

### The candidates, replayed

Each is a pure function of the message, the held number, and the declared field words, using the numbers the reader already scans and the times and dates it already marks. Part caught is of the 23 rows either of the two readers marked. Fine rows are the 1,865 neither marked. Hotel is cost only, on 4,004 bindings with both fields declared.

| Law | What it refuses | Part caught | Fine rows asking | Hotel refused |
| --- | --- | --- | --- | --- |
| A | any other plain number in the sentence | 11 | 129, 6.92 percent | 2,857, 71.35 percent |
| B | another number in the sentence with a word after it | 10 | 92, 4.93 percent | 298, 7.44 percent |
| D | C, or a counted number before the bound one in the sentence | 9 | 46, 2.47 percent | 257, 6.42 percent |
| F | C or E | 10 | 8, 0.43 percent | 8, 0.20 percent |
| C | a counted number joined straight after the field word, comma and dash included | 7 | 4, 0.21 percent | 7, 0.17 percent |
| E | the field word, then `and` or `plus`, then an article and a word | 3 | 4, 0.21 percent | 1, 0.02 percent |
| **G** | **C with explicit joiners only** | **5** | **2, 0.11 percent** | **4, 0.10 percent** |

On M3's 1,800 main rows, C refuses 11 of 1,178 right bindings, all list forms such as "138 pages, 18.35 US dollars for each page", and 0 of 37 wrong ones. G refuses 0 of each.

**E isn't a law.** "and a kid" and "and a booth" have the same grammar, and it can't tell them apart without a word list: it refuses "for four people and a outdoor seat" as readily as "4 people and a kid". **A, B, and D cost too much,** because a second number in a sentence is usually a date or a duration.

### The proposal, if the user wants one

**Law G: a number doesn't bind when its anchor is followed, in the same sentence, by an explicit joiner and another readable number with a word after it.** The joiners are `and`, `plus`, `with`, `+`, `&`, and `, and`. The other number isn't one the reader marks as a time or date, and the word after it isn't a declared anchor or one of Law 2's links. A refusal asks, and it substitutes no value.

- **Why it's true of any message:** a count joined to another count may be part of a larger total, whatever the unit. It reads no field's name or unit.
- **It catches, with all three readers agreeing:** "4 people and one kid", "3 people plus 2 children", "For 4 people plus one child", "Two portions for two people and one for the rest", and "one for 5 people and one for 7".
- **It also reaches compound quantities.** On handwritten sentences the floor today holds `years` 5 on "for 5 years and 3 months" and `hours` 40 on "for 40 hours and 20 minutes". G refuses both. It keeps both on "5 years and 300 pages", where both fields are declared.
- **What it costs:** "5 people and 2 high chairs" and "7 people with 2 high chairs" ask, which is arguably right. On hotel, "two nights and 1 person" asks because `person` isn't declared there, and "two people and one room" asks where nothing was wrong. "40 hours and 2 supervisors" asks.
- **The vocabulary:** no domain word. `and` and `with` are already Law 2's links. `plus`, `+`, and `&` are new, a closed list of grammar of the same kind. 2 of its 5 rows need `plus`.

### What's not established

- G was chosen on these rows, and the comma came out after reading M3's 11, so **M3 isn't independent evidence for it, and no read here is.** It needs one sealed read on a corpus that didn't prompt it, before anyone relies on these figures.
- This is a replay of a wrapper, not `interpret`'s compiler. Its anchors and sentence bounds approximate the floor's.
- Only `people` on booking has marks. Hotel and M3 read cost, not benefit, and the compound-quantity gain rests on handwritten sentences.
- Most rows here are a corpus's own writing, and all three corpora had people following a task.

### What stays a known limit

| Form | Rows | Why no law reaches it |
| --- | --- | --- |
| a person added by a word: "and a kid", "plus the baby" | 3 | same grammar as "and a booth" |
| an add-on: "add two guests" | 4, one template | the verb carries it |
| the speaker beside the count: "with me", "joining us", "myself and three people" | 4 | the words carry it, and "I'm bringing 2 people" is honestly ambiguous |
| a per-table count: "each sit 10 people", "with three people each" | 2 | the word `each` carries it, and a law on the earlier count costs 2.47 percent |
| a stated total: "three people with me, so four total" | 2 | a person can adopt this one: with `total` and `table of` declared, both ask by `anchor-conflict` on handwritten versions |
| a comma and an unstated child: "Three people, one child" | 2 | the readers differ, and the comma costs list forms |
| a subset: "just two people are lactose intolerant" | 1 | the predicate carries it |

### What I'd do

1. Keep part of a group on `known-limits.md`, with the rates above in place of one corpus's figure.
2. Hold G as a candidate, and don't land it. It's cheap and honest, but it reaches 5 of 23, and it hasn't had a sealed read. If the user wants it, read it sealed on a corpus that didn't prompt it, then land it in `interpret` on its own. It doesn't wait for H3, and H3 doesn't wait for it.
3. Report wrong-binding rates read by hand beside wrong accepted, since the score can't see this class.


## Known limits

## Known limits of the reader

What `interpret` reads wrong or lets through, kept here rather than fixed, under the freeze in `plan.md` § Sequence (O33). Each row holds its example message, so a run can test it. M3 reads which of these cost decisions, and those come back with their numbers.

A row leaves this list when a fix lands after M3 shows it costs decisions, or when a later reader closes it. A new reading rule enters `interpret` before M3 only if it is a wrong decision reproduced through the whole model and it holds for a class of messages. The two laws in `plan.md` § Sequence closed most of this list's first rows in `interpret` `cb0bb5c`, each read through the whole model: `116 panels, and each panel is 440 watts`, `50000 a month`, `5 of 3000000`, `3 a million`, `3 at most`, `3 to start`, `3 of them`, `3 is wrong`, `3 (months)`, `3 - months`, `3 (million)`, `50000/month`, `3 / 12`, `3+`, `3 €`, and `3€`.

### A wrong value that holds

| Example message | What it does | Why it stays | Source |
| --- | --- | --- | --- |
| `17 panels … though we first planned 31 panels` | holds 31 | a later anchor, stopped by the design session as depth tuned against sum recipes | `plan.md` D22 |
| `amount 50000, and up` | claims 50000 | the comma stays admitted unless a number follows it, and this is pinned by one named test | `plan.md` D25 |
| `years 3, months` | claims 3 | the same comma | M1's re-audit |
| `amount 3%`, `amount 3 percent`, `amount $5%` | claims 3 or 5 | percent is a declared form, and a claim doesn't check its unit | M1's re-audit; the reader's falsify round |
| `years 3. months` | claims 3 | a sentence end is a boundary, the sibling of `years 3, months` | the reader's falsify round |
| `3 years ago`, `3 years old` | claims 3 | a word after the anchor is outside what the law reads | the reader's falsify round |
| `amount 50000ish` | claims 50000 | the hedge mark is read only for a number before its anchor; M3 reads this form on 0 of 1,800 main rows and 2 of 46 marked rows written to test it, wrong on both routes (`plan.md` O39) | the reader's falsify round |
| `can I book a table for 2ish` | with `table for` declared, holds 2 and decides | the same hedge limit, reached through an alias. It's 1 row of a held-out read | H2's held-out hand reading |
| `perfect! book one table for monday at noon please`, `Book 1 table for me` | with `table for` declared, holds 1 | a number before the phrase: the alias reads a number on either side, and the one before it counts the tables. The first is the 1 real wrong binding `table for` added on Taskmaster-1's development rows | Taskmaster-1's development hand reading |
| `amount 007` | claims 7 | the digits are a declared form | the reader's falsify round |
| `EUR 50000 amount`, `GBP 90000 amount` | claims the digits | a word before a number passes, so `for 3 years` still reads, and `amount EUR 50000` asks | the reader's falsify round |
| `two thousand three thousand`, `five hundred hundred` | reads 5000 and 50000 | the word-number grammar, and it's uncommon | the reader's falsify round |
| `Reserve the lab microscope for 97 total hours. A supervisor will be present for 16 hours` | holds `hours` 16 | the modifier breaks the link to 97, so the word binds one number, which is the single-number gap in `plan.md` D24 | the review of `interpret`'s repair |
| `hours 30. hours 50. days 2` | computes `hours`, with 30 and 50 unclaimed and no question | a field both mapped and computed is computed | the review of `interpret`'s repair |
| turn 1 `hours 40`, turn 2 a conflict that asks, turn 3 no answer | carries 40 at 0.7 with no question | a carried value outlives the conflict that followed it | the review of `interpret`'s repair |
| `pre-lab hours 97. hours 16` | holds `hours` 16 | a phrase that fails the token gate still owns the word, so `hours` binds one number | the review of `interpret`'s repair |
| `Can I add two guests to my booked table`, `three of the four guests are veggie`, `4 people and a kid`, `we need 4 tables that each seat 10 people` | holds `people` 2, 3, 4, or 10 | the number counts an add-on or part of the group, and the anchor can't tell. H1 reads this and the next row on 5 of 4,250 rows of `RESTAURANTS-8K` development, under the bar. On every row the floor binds on `people`, read blind by two readers with a third on their differences, it's 12 of 473 on Taskmaster-1, 8 of 642 on RESTAURANTS-8K, and 0 of 566 on MultiWOZ, so it depends on how people write. The annotation holds the same number on the ones it marks, so the score reads 0 | H1's hand reading; `designs/partofgroup.md` |
| `Can I book a table for 12? I don't mind having two tables of 6. Or one for 5 people and one for 7.` | decides approved on 5, where 12 is the party | a number and a smaller alternative: the field word binds the alternative. It's 1 of 4,212 truth-known rows on a held-out read, and the only real wrong decision reader-free made there. Declaring `table for` happens to fix it, because 12 and 5 then conflict and ask, which isn't the same as a law fixing it | H2's held-out hand reading |
| `for 5 people and I need to cancel it` | decides on 5 | the request isn't a booking. By the design session's ruling there's no refusal word: a developer declares the other request as its own recipe, which makes the message name two recipes and ask. The score counts these rows right when a person wouldn't, 49 on blind aliases, because the annotation gives the party size | H1's hand reading; `plan.md` O49 |
| `amount 50000 a year` where `years` has the alias `year` | claims 50000 | `a` followed by an anchor is admitted, as the law is written | the reader's falsify round |
| `my 401k`, `403k` with no anchor declaring them | reads 401,000 and 403,000, where they read foreign before | `k` is a declared suffix and the plan shape went with the lists, because no list-free rule tells them apart. A declared anchor keeps its own digits | the two laws |

### A right answer that asks

| Example message | What it does | Why it stays | Source |
| --- | --- | --- | --- |
| `profit and loss 5. loss 6`, with mappings `profit and loss` and `loss` | asks | `and` is a clause break, so a phrase holding one owns nothing | the review of `interpret`'s repair |
| `term 30 interest rate, rate 6`, with `term`, and `rate` with alias `interest rate` | asks | the displaced span links term's 30, the same family as `age 25 hours 40. hours 40` | the review of `interpret`'s repair |
| `man-hours 97. 38 hours` | asks | the anchor pattern admits a hyphen, so `hours` occurs with two numbers. It is safe, and it is listed so nobody reads it as a bug | the review of `interpret`'s repair |
| `We have export clearance`, `We have no export clearance` | asks, on both routes, with a boolean field or a 0/1 number | a yes/no fact in words has no number for the exact checks to find, and a yes/no reader isn't in M3. If this row is what costs bar 2, it goes to the user as an option with the numbers | the design session, on M3's grid |
| `amount 50000 income 120000` | asks for both | `income` sits equally close to each number, so the tie rule refuses both | the design session, on the two laws |
| `The rent is $3,875 a month for 6 months` | asks for the rent | `a` is a link only before an anchor, and `month` is not this recipe's `months` | the two laws, a right case lost |
| `Pickup is on the 8th.` | asks an optional field | `8th` is undeclared where it was a foreign ordinal, so it raises a doubt | the two laws, a right case lost |
| `31 parcels that add up to 1,902 kilograms` | asks for the weight | the reader marks `up to` hedged, and a hedged number before its anchor asks, in a case already asking | the seam's last turn |
| `amount 50000, income 120000, 3 years in business.` | asks for the income | a comma followed by a number asks, which is very common in a list | the reader's falsify round |
| `amount 50000 and income 120000 and 3 years` | asks for the income | a link followed by a number asks | the reader's falsify round |
| `amount:50000, income:120000, years:3`, and with `=` | asks for all three | a glued anchor is an undeclared token | the reader's falsify round |
| `years 3 thanks`, `3 please`, `3 :)` | asks for years | the neighbor law | the reader's falsify round |
| `loan (amount 50000, income 120000, years 3)` | asks for years | `3)` is undeclared | the reader's falsify round |
| `amount 50000 - income 120000 - years 3`, also with `—`, `/`, `|`, `&`, `+` | asks for amount and income | lone punctuation asks | the reader's falsify round |
| `amount **50000**`, `` amount `50000` `` | asks | markup attached to digits is undeclared | the reader's falsify round |
| `amount $50,000 (USD)` | asks | the neighbor law | the reader's falsify round |
| `years 3, Q3 start` | asks for years | `Q3` holds a digit, so a number follows the comma | the reader's falsify round |
| `$2.05 million` | asks, where `$2.06 million` reads | binary rounding in the exact-precision check, for about 34 in 990 such forms | the reader's falsify round |
| `borrow $590,000 at 3.25%` | asks for the amount | `at` is a link only before an anchor | the two laws, in a case already asking |
| `income is $134,000 and the upfront fee` | asks for the income | `upfront` starts no anchor | the narrowed links, in a case already asking |
| `the 6-battery setup over the 1-battery option`, `$8-per-thousand-showings`, `73 solar panels—wait, 71—rated 300 watts` | refuses the whole token, so a reader's proposal from it fails `appears` and asks | the token law working, since nothing declares these forms | M2's checks |

### A reader's value M3 read wrong

Each holds for no class on M3's reading, under the ruling in `plan.md` O38.

| Example message | What it does | Why it stays | Source |
| --- | --- | --- | --- |
| `A single paper traces its origin … I saved the draft 3 times` | the reader holds `records` 3, and it decides with no question | one row, and the number is stated | `plan.md` O38 |
| `The specimen is a 1 for danger out of 4` | the reader holds `hazard` 4, the scale's top | one row, and the number is stated | `plan.md` O38 |
| `Training finished on this laboratory microscope is 6 hours, and I want 69 hours` | the reader holds `training` 69, the booking's number | one row, beside the `hours` class `plan.md` O38 reopens | `plan.md` O38 |
| `museum: records amount not 1. 3. 4.` with a reply of `amount` 4 | the reader holds `amount` 4 past a doubt that also covers it | a number's refusal records one field, so the law in `plan.md` O39 can't read a doubt two field words share. A crafted form, which M3's main rows don't show causing harm | the law's re-audit |

### Crafted cost, not a limit on a reading

A recipe declaring a link word such as `to` as an anchor reads quadratic at 65 KB, which is the developer's own choice.

A message at the text limit built as `loan: amount ====… 1 1 1…` reads in about 2 s, against about 74 ms for a message of ordinary shape. It is quadratic in one gap test, and bounded by the limit. The design session ruled it advisory, because it isn't a realistic load.

