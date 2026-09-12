# Conversation and Artifact Mine: Blog and Research Proposals

Date: 2026-09-12

## Executive read

The strongest public writing opportunity is a coherent body of work about **how to make AI useful when correctness, control, timing, and human judgment matter**. Your projects look disparate on the surface—financial infrastructure, MCP, language tutoring, sermon search, bug triage, cold email, and consumer-finance research—but the same ideas recur:

- The model should not own every decision.
- Good systems distinguish data access, reasoning, authorization, execution, and confirmation.
- Deterministic rules matter most at hard boundaries; models matter most where judgment is genuinely required.
- A fluent answer can still be pedagogically, financially, or operationally wrong.
- The best product insights came from failure: bad migrations, missing identifiers, stale data, curriculum leaks, generic semantic matches, false personalization, or users who never started.
- The interface is often a trust and review surface, not the place where the underlying work happens.

That gives you a recognizable authorial territory: **product judgment for high-stakes AI systems**. Voice learning is the most vivid experimental laboratory; agentic finance is the most professionally differentiated domain; infrastructure migrations provide the strongest proof that you have operated systems at scale.

## Coverage and limits

This mine reviewed:

- all **85 locally stored Codex task records** in `~/.codex/state_5.sqlite`, spanning April–September 2026;
- all **47 ChatGPT conversations currently exposed by the app's capped 50-task index** (the other three entries were the current parallel Codex tasks);
- the older workspace archive of **375 ChatGPT conversations** under `Documents/q1 plan/input`—374 full Markdown reconstructions containing **4,080 user turns**, plus the surviving extraction summary for the one malformed conversation;
- all **352 Granola meeting and note artifacts** in the same historical archive, including product reviews, design reviews, 1:1s, partner meetings, sprint rituals, migration planning, and postmortems;
- substantive artifacts across `voiceai`, `ideas`, `linking strategy`, `NewLevel`, `trinityai`, and `exaemailwriter`;
- existing blog drafts, product/design docs, experiment reports, QA reports, interview story banks, data analyses, research memos, code structure, lesson scripts, and generated artifact manifests.

This is exhaustive for the conversation and artifact sources available in the app and local workspace. The historical archive substantially overlaps the current app index; repeated conversations and derivative documents were treated as corroboration rather than new evidence. Nothing can establish coverage of deleted chats, cloud chats absent from both the app index and export, or artifacts stored outside the accessible filesystem, so “all” here means all accessible sources—not unknowable material.

Generated copies, dependency documentation, build output, repeated research snapshots, raw media, and duplicate task retries were counted as corroborating evidence rather than treated as independent ideas.

## The posts most worth writing

Scores are out of 10 and combine originality, evidence already in hand, usefulness to a serious audience, and how distinctively the story is yours. `Disclosure` indicates how much internal review/redaction a public version would need.

| Rank | Working title | Score | Why it is worth writing | Disclosure |
|---:|---|---:|---|---|
| 1 | **The AI Should Never Be the First Thing to Speak: Hiding Model Latency Inside the Conversation** | 9.7 | A measured, counterintuitive design result: instant stored affirmation can mask act-selection latency. It combines UX, systems design, pedagogy, and real benchmarks. | Low |
| 2 | **61% Rules, 39% Judgment: What One Great Teacher Taught Me About AI Architecture** | 9.6 | You manually classified 114 teaching moves into 32 acts and found four mechanical acts dominate. This is a rare empirical bridge from expert behavior to system architecture. | Low; avoid copyrighted transcript excerpts beyond brief fair quotation |
| 3 | **A Fluent Tutor Can Still Teach the Wrong Curriculum** | 9.5 | The models sounded warm while leaking untaught grammar and answers. The resulting inventory check, derivability rule, and answer-leak validator generalize well beyond language learning. | Low |
| 4 | **Controllable Delegation: A Product Model for AI Actions in Finance** | 9.4 | Separating explanation, simulation, preparation, approval, execution, and confirmation is a genuinely useful product framework for high-stakes agents. | High; publish principles, not unreleased product details |
| 5 | **Stop Testing Agent Answers. Test Their Behavior.** | 9.3 | Your MCP work shows why evals need tool choice, arguments, provenance, negative behavior, and capability boundaries—not exact answer strings. | Medium/high |
| 6 | **“Linked” Is Not a State: What Financial Infrastructure Taught Me About Product Semantics** | 9.2 | A link can be alive yet stale, visible yet unusable for transfers, or valid for one product but not another. Strong product and platform lesson. | High |
| 7 | **Pay for Freshness Where It Changes a Decision** | 9.1 | Your API work turns “fresh data is better” into an economic decision: use webhooks, scheduled refreshes, and execution-time checks according to consequence rather than refreshing everything. | High |
| 8 | **The Right Agent Architecture Is an Authority Model, Not a Tool List** | 9.1 | The Authority-State Atlas found that data access, decision authority, and execution authority are separate gates. This reframes agentic finance more sharply than generic agent taxonomies. | Medium/high |
| 9 | **“Good.” Is Not Filler** | 9.0 | Already drafted, memorable, emotionally true, and supported by a concrete LLM failure. It may be your most human piece. | Low |
| 10 | **When Semantic Search Lies Politely** | 8.9 | Trinity Search's “anxiety about marriage” failure makes the difference between semantic relatedness and locally grounded relevance immediately understandable. | Low |
| 11 | **The Best AI System I Built Was Not an Agent** | 8.8 | Your controlled comparison found a pipeline was faster and simpler while the agent version needed repair. Timely, evidence-based, and resistant to hype. | Low |
| 12 | **Same Product, Different Audience: 13% to 59%** | 8.7 | Already drafted with unusually clean quasi-experimental evidence about distribution and audience-product fit. | Low |
| 13 | **Why Personalization Must Be Earned** | 8.6 | Identity gating, source confidence, conservative fallback, and the cost of confident person-mixing offer a sharp framework for research-backed writing products. | Low |
| 14 | **A Migration Is a Portfolio of Risks, Not a Feature Launch** | 8.5 | Cohorts, kill switches, fallback rails, vendor uncertainty, and protection of ongoing flows make a strong product-operations essay. | High |
| 15 | **The Consumer Agent Is Not the Product; Accountable Completion Is** | 8.5 | Your finance research repeatedly found fragmented execution and nobody owning the exception tail. This is a strong market thesis. | Medium |

### Recommended publication order

1. **“Good.” Is Not Filler** — nearly ready, accessible, and establishes your voice.
2. **The AI Should Never Be the First Thing to Speak** — strongest new technical post.
3. **61% Rules, 39% Judgment** — the deeper companion essay.
4. **A Fluent Tutor Can Still Teach the Wrong Curriculum** — completes a three-part tutor architecture series.
5. **The Best AI System I Built Was Not an Agent** — broadens from pedagogy into general AI product design.
6. **When Semantic Search Lies Politely** — another compact, public-safe case study.
7. **Pay for Freshness Where It Changes a Decision** — the strongest historical platform essay, after careful anonymization.
8. **Controllable Delegation** — publish after professional review and careful abstraction.

The first six can establish credibility without relying on confidential work. The finance pieces then read as the generalization of principles you have already demonstrated publicly.

## Detailed briefs for the top ideas

### 1. The AI Should Never Be the First Thing to Speak

**Claim:** In a real-time AI experience, the first response can be deterministic even when the next decision is generative. Latency does not always need to be eliminated; it can be placed behind useful interaction.

**Opening scene:** A learner stops speaking. A naive system serially transcribes, selects a pedagogical act, generates speech, and synthesizes it. The silence feels like a crash. Your system says a stored “Good” immediately while the model chooses the next move during the 560–790 ms clip.

**Evidence:** `gpt-4.1-mini` act selection measured about 730 ms warm p50; `nano` saved only ~134 ms and failed half the cases; existing affirmation clips lasted almost exactly long enough to hide the competent model's decision.

**Structure:** latency budget → failed smaller-model shortcut → frequency distribution of teaching acts → overlap computation with useful speech → general pattern for support agents, copilots, games, and voice interfaces.

**Source:** `docs/lt-act-selection-latency.md` and `docs/lt-voice-model-findings.md`.

### 2. 61% Rules, 39% Judgment

**Claim:** The best hybrid architecture can be discovered by counting expert behavior instead of debating rules versus models in the abstract.

**Opening scene:** You labeled what a teacher was doing line by line, not what he was saying. Thirty-two teaching moves emerged; four accounted for 61% of the observed lesson.

**Structure:** build the taxonomy → identify repeated macros such as noun → verb → sentence → separate mechanically triggered acts from judgment acts → turn rare/high-risk acts into operational specifications → explain why a pure state machine loses teaching and a pure model leaks curriculum.

**Key nuance:** The percentage is from one lesson, so frame it as a discovery and research hypothesis, not a universal constant.

**Source:** `docs/lt-act-taxonomy-lesson-04.md` and `docs/lt-move-spec-format.md`.

### 3. A Fluent Tutor Can Still Teach the Wrong Curriculum

**Claim:** Conversational quality is not instructional correctness. A model can sound helpful while giving away the answer, introducing grammar too early, switching languages, or asking permission instead of teaching.

**Evidence:** No-move prompts leaked the answer 3/3; language drift occurred in 4/12 runs before an explicit pin and 0/18 after; mini audio models failed the answer-withholding task 0/6; global language instructions broke moves that needed silence in the target language.

**Product lesson:** Store a curriculum inventory, define derivability, attach language policy per act, validate generated lines against withheld answers, and fall back deterministically.

**Source:** `docs/lt-voice-model-findings.md` and the `tmp/voice-test` samples.

### 4. Controllable Delegation

**Claim:** “Can the agent do it?” is the wrong product question. The useful unit is the ladder from understanding to an accountable, revocable action.

**Framework:** explain → simulate → prepare → user approves → regulated system executes → system confirms and records attribution.

**Usefulness:** This gives product, compliance, design, and engineering a shared vocabulary. It also prevents both extremes: inert chat that cannot help and autonomous action that users cannot trust.

**Evidence:** MCP product strategy, bounded portfolio proposals, authenticated handoff, client authorship, provenance, revocation, and negative evals.

**Disclosure:** Remove company-specific roadmap, unreleased capability, internal user analysis, or legal conclusions unless approved.

### 5. Stop Testing Agent Answers. Test Their Behavior.

**Claim:** Agent evals should grade traces and boundaries: the selected tool, arguments, data dependencies, forbidden actions avoided, provenance, failure handling, and final semantic outcome.

**Examples:** cash balance versus investing-strategy tool selection; multi-account concentration requiring multiple calls; tax-lot capability boundaries; missing IDs; expired auth; portfolio changes that must stop at review.

**Distinctive angle:** Negative behavior is first-class. A passing test may be “did not call a tool,” “did not infer,” or “did not execute.”

**Source:** ChatGPT tasks “Writing MCP Evals,” “Test v2 working,” “Check Wealthfront Access,” and the MCP CV/project materials.

### 6. “Linked” Is Not a State

**Claim:** Product nouns become dangerous when they collapse multiple operational states. In financial aggregation, “linked” can mean authenticated, data-current, displayable, transferable, ACATS-usable, or recoverable—and those are not equivalent.

**Structure:** tell one “linked but cannot transfer” story → enumerate the state dimensions → show how a single green check creates false promises → propose an ownership model and user-action model.

**Generalization:** The same error appears in “connected,” “synced,” “verified,” “deployed,” and “completed” across software.

**Source:** Linking meeting analyses, `Product_Principles_Linked_Data.md`, and the Plaid migration interview packet.

### 7. The Right Agent Architecture Is an Authority Model

**Claim:** Agent products should be mapped by who can observe, decide, approve, execute, recover, revoke, and bear responsibility—not by whether they have a chatbot, an MCP server, or browser control.

**Evidence:** Thirty episodes clustered into Benefits Orchestrator, Transition Commander, Household Diplomat, Fiduciary Decision Engine, Treasury Autopilot, and Recovery Advocate. Cross-cutting infrastructure appeared as mandate, policy, receipt, revocation, and exception handling rather than a consumer category.

**Source:** `authority_state_atlas/AUTHORITY_STATE_ATLAS_V1_MEMO.md`.

### 8. “Good.” Is Not Filler

The draft already has the correct center: LLM “cleanup” removed tiny confirmations and turned a teacher into a drill. Tighten it by adding the later quantitative taxonomy finding: affirmation was not only warmth; it was one of the four dominant acts and became useful latency-covering infrastructure.

**Source:** `docs/blog/04-good-is-not-filler.md`, `docs/lt-act-taxonomy-lesson-04.md`, and `docs/lt-act-selection-latency.md`.

### 9. When Semantic Search Lies Politely

**Claim:** Embedding similarity is excellent at returning something plausibly related and therefore uniquely dangerous when “plausibly related” is failure.

**Example:** A sermon mentioning anxiety in one place and marriage elsewhere is not necessarily about anxiety in marriage. Requiring local concept co-occurrence reduced recall but restored truthfulness.

**Broader lesson:** Retrieval quality is a product definition of evidence, not an embedding-model selection exercise.

**Source:** `trinityai/docs/blog/02-why-semantic-search-was-not-enough.md`.

### 10. The Best AI System I Built Was Not an Agent

**Claim:** Agent architecture is valuable when stages need independent judgment, inspection, and intervention. It is wasteful when a bounded pipeline plus validators already expresses the job.

**Evidence:** In the initial comparison, the current email pipeline ran in roughly 6–7 seconds and passed 2/3 scenarios; the agent version passed 3/3 but took roughly 11–14 seconds and required repair on every case.

**Structure:** define the same product contract → compare architectures under one evaluator → measure first-pass quality, repair rate, latency, cost, and human preference → state the decision rule.

**Source:** `exaemailwriter/blog-posts/09-current-pipeline-vs-agents-sdk-tradeoffs.md` and comparison results.

### 11. Same Product, Different Audience

Already close to publishable. The most interesting line is not that Discord “performed better”; it is that changing only distribution changed starts from 13% to 59% and completions from 3% to 22%. Add caution about tiny samples, then use the result to explain why product judgment without audience definition is underidentified.

**Source:** `docs/blog/05-same-product-different-audience.md`.

### 12. Why Personalization Must Be Earned

**Claim:** Specificity increases the burden of identity certainty. A generic but grounded message is safer than a vividly personalized message about the wrong person.

**Framework:** identity gate → source match → role/company/time checks → confounder search → confidence-dependent writing → sender-story fallback.

**Source:** `exaemailwriter/blog-posts/04-why-i-added-identity-gating-and-linkedin-enrichment.md`.

### 13. Pay for Freshness Where It Changes a Decision

**Claim:** Data freshness is not a binary quality target. It is an allocation problem: the value of a refresh depends on the decision, the cost of the call, the staleness tolerance, and the harm of acting on old information.

**Structure:** distinguish display freshness from action freshness → classify use cases by consequence → combine webhooks, periodic pulls, cached data, and just-in-time verification → add cost guardrails and degraded states → show why “refresh everything” is not a serious product strategy.

**Evidence:** The historical archive contains the efficient-API design work, webhook reviews, balance-age rules, transfer and Autopilot dependencies, vendor-cost discussions, and rollout dashboards. This is high-disclosure material; publish the decision framework and normalized examples, not partner pricing or internal volumes.

## Full blog proposal bank

The following are additional viable posts. Some can stand alone; others are better as sections or follow-ups to the top-ranked pieces.

### Voice, pedagogy, and language learning

1. **The Pause Is the Product** — Why active construction before reveal changes an audio lesson more than speech recognition does.
2. **Why I Removed the Chatbot From My AI Tutor** — Moving from FastAPI + Gemini evaluation + open conversation to a transcript-faithful state machine.
3. **The Three-Layer Tutor** — Curriculum inventory, pedagogical act selection, and generated speech as separate control layers.
4. **What Great Teachers Do Between Questions** — Affirm, echo, model, diagnose, redirect, connect, and zoom out.
5. **Derivable Is Not the Same as Taught** — How to let a learner infer a new word without letting the model jump the curriculum.
6. **Why Global Prompts Fail in Multi-Act Systems** — The language instruction that fixed one behavior and broke another.
7. **Few-Shot Examples Copy Form Better Than They Guarantee Compliance** — Real teacher lines improved turn shape, but deterministic checks still carried reliability.
8. **The Smaller Model Was Faster and Wrong** — Why a 134 ms saving was a losing optimization.
9. **The Hidden Cost of Speech-Out Models** — When natural voice generation adds 2–3 seconds and what product design can do about it.
10. **A Course Is a Dependency Graph, Not a Playlist** — Yoruba grammar panorama, atom sequencing, recovery space, and masked repetition.
11. **Why a Textbook Table of Contents Is a Bad Audio Curriculum** — One grammar label can contain multiple learnable thought-moves.
12. **Building Yoruba Voice Lessons When the Language Is Tonal** — Tone, diacritics, code-switching, and native-review gates.
13. **Human Recordings as Both Product and Evaluation Set** — Why direct clips can outperform premature voice cloning while creating a gold dataset.
14. **How to Evaluate a Bilingual Voice That Switches Mid-Sentence** — Segmenting by language, testing transitions, and preserving one teacher identity.
15. **Why I Burned $22 of TTS Credits** — Generate only after script review; free voices are a staging environment.
16. **From 508-Page PDF to 88 Interactive Lessons** — Parser, formatting signals, LLM cleanup, and segment regeneration.
17. **When LLM Cleanup Removes the Teaching** — The raw transcript kept 1,175 tutor words; the cleaned lesson kept 284 and dropped much of the method.
18. **How to Turn One Long Lesson Into Six Standalone Micro-Lessons** — Dependency-complete TikTok scripting rather than arbitrary clipping.
19. **Why Standalone Content Needs Different Scaffolding** — A learner arriving at lesson 35 cannot inherit the assumptions of lesson 34.
20. **Prompt, Pause, Reveal Is a Reusable Media Primitive** — Spanish, management concepts, interview practice, and other knowledge domains.
21. **Why “Organize Me” Became “Organize Myself”** — Small English prompt choices can change the learner's mental mapping.
22. **The Difference Between a Drill and a Teacher** — Pacing, warmth, diagnosis, and choice.

### AI agents, MCP, and high-stakes product design

23. **MCP Is a Boundary, Not a Magic Permission Slip** — Explicit tools and fields are useful precisely because general API access is too broad.
24. **The Six Stages of an AI-Mediated Financial Action** — Explanation through confirmation with actor attribution.
25. **Why the Human Review Screen Is Part of the Agent Architecture** — Authentication and approval are not a bolted-on safety modal.
26. **The Most Important Agent Eval Is Often “Did Nothing”** — Negative tests for forbidden calls, inference, and execution.
27. **A Missing Identifier Can Break an Entire Agent Experience** — The portfolio-edit regression as a contract-integrity case study.
28. **Tool Availability Is a Product State** — Plugin mounted, endpoint reachable, user authenticated, account authorized, and action supported are different conditions.
29. **Why Agents Need Capability Honesty** — Clearly saying tax lots, transactions, or editability are unavailable.
30. **From Computer Use to Agent-Native Software** — Pixels as universal compatibility layer, APIs/MCP as structured actuation, UI as review and exception layer.
31. **Computer Use Is Not the End State; It Is the Bridge** — Why “AI clicking buttons” can still matter while better interfaces emerge.
32. **What Becomes Possible When the Agent Runtime Commoditizes** — Vertical agents win through workflow knowledge, permissions, evals, and distribution.
33. **The Agent's Moat Is the Exception Tail** — Happy-path execution is easy; unsupported institutions, recovery, and accountable completion are the product.
34. **Receipts for AI Actions** — Binding original intent, inputs, approval, execution, dispute rights, and revocation outcome.
35. **Revocation Is a Product Experience** — What it means to stop an agent's authority after credentials, drafts, and scheduled actions exist.
36. **Why Financial Facts Need Four Dates** — Period described, publication, market availability, and retrieval/cache time.
37. **Finance Agents Need a Security Master, Not Better Embeddings** — Entity resolution across issuers, securities, listings, and time.
38. **A Citation Does Not Make a Financial Claim Authoritative** — Source precedence, conflict handling, and provenance classes.
39. **The General Model Is Probably Good Enough; Timing Is the Product** — Users may need the system to notice the right financial issue more than a finance foundation model.
40. **From Tool Catalog to Decision Architecture** — Prioritizing 15 candidate financial actions using value, reversibility, risk, and partner compatibility.

### Financial infrastructure and product strategy

41. **How to Migrate a Financial Data Provider Without Betting the Company** — Cohorts, kill switches, fallback paths, and ongoing-flow protection.
42. **Why I Chose a 5% Rollout Over a Big-Bang Migration** — Small exposure as a way to learn operational truth.
43. **The Eight-Week Chase Migration** — A narrow urgent wedge inside a much larger migration.
44. **Protect the Automated Money First** — Why Autopilot and recurring-transfer dependencies shaped the migration more than UI polish.
45. **Breaking the Last Legacy Links** — When forced cleanup is safer than indefinite dual infrastructure.
46. **Freshness Has a Price** — Selective API calls, webhooks, execution-time checks, and deciding which data deserves to be live.
47. **Fallback Rails Are Product Features** — Microdeposits and manual paths as first-class design, not failure shame.
48. **Institution Mismatch Is Not User Error** — How customized institution handling changed outcomes.
49. **Build the Migration Hub or Test the Behavior First?** — Distinguishing a coordination surface from a hypothesis.
50. **Unsupported Institutions Deserve an Honest Product State** — Visibility, eligibility, recovery, and expectation-setting.
51. **When Vendor Pricing Uncertainty Becomes Product Risk** — API economics can shape migration sequencing and client experience.
52. **The Support Queue Is a Product Research Database** — Turning ticket language into quantified opportunities and better vendor escalation.
53. **People Paying for Personal-Finance Apps Are Not Average Users** — Detected subscribers had far more linked complexity and external wealth. Public version must anonymize/approve all internal data.
54. **Build for the Client's Project, Not Their Anxiety** — Life events create action; evergreen worry rarely does.
55. **The Insight Trap in Fintech** — Dashboards feel valuable but often leave the execution gap untouched.
56. **Manufactured Urgency Is Not Demand** — Completion scores and stale-link warnings versus real deadlines in a client's life.
57. **Earn the Right to Advise** — Show the math, climb the value ladder, and do not put recommendations on stale aggregation.
58. **Design for Refresh Before You Design the Screen** — Triggers, decay rules, and re-engagement as part of the initial spec.
59. **Compliance Is a Design Input, Not a Review Gate** — How early legal constraints can produce a better product rather than merely block one.
60. **Household Finance Is an Authority Problem** — Roles, co-consent, shared decisions, personal boundaries, and revocation.
61. **Why “Casa for Finances” Became MergeKit** — Narrowing a broad household operating system to one bounded post-marriage outcome.
62. **The Life-Trigger Wedge** — Organize around job change, marriage, inheritance, or a new child rather than generic financial action types.
63. **The Recovery Advocate** — A product category built around owning cross-institution remediation, not generating advice.
64. **Who Owns the Outcome When Five Institutions Are Involved?** — Accountable completion as the missing consumer-finance layer.

### Search, triage, outreach, and building with AI

65. **One Sermon Per Result, Not Ten Similar Moments** — Product-level deduplication in long-document search.
66. **I Would Rather Return No Result Than a Fake One** — Precision and trust in spiritually sensitive search.
67. **Searchable Now, Perfect Later** — Using YouTube captions before expensive retranscription.
68. **I Was Solving a Data-Ingestion Problem Like a Media Problem** — Reframing bottlenecks by desired outcome.
69. **Root Cause, Not Visible Symptom** — Classifying voice-agent bugs by where the failure began.
70. **Disagreement Only Matters When It Changes the Owner** — Route-aware confidence in AI triage.
71. **Why Severity Rules May Only Escalate** — Models propose; deterministic floors protect compliance, privacy, financial, and outage cases.
72. **The Safer Default Is Sometimes Lower Severity** — How false urgency trains teams to ignore labels.
73. **A Broken Model Call Should Degrade the Tool, Not Break It** — Parallel rules/model classification with graceful fallback.
74. **Do Not Overfit a Triage System to 15 Examples** — Rubrics, root-cause abstractions, and test-set expansion.
75. **The Audit Trail Must Start Before the First Click** — Designing provenance for human overrides.
76. **Why I Added a Repair Stage to an AI Writer** — Specific validator feedback beats a generic retry prompt.
77. **“Like You” as a Product Constraint** — A forcing function for shared lived reality rather than decorative personalization.
78. **Latency Is Also an Evaluation Problem** — Slow test suites stop getting run; performance protects the learning loop.
79. **Good Fallbacks Change Strategy Instead of Hallucinating** — Sender-story fallback when research confidence is low.
80. **Architecture Should Protect the Learning Loop** — Returning from a heavier backend to the simpler Lovable/Supabase shape.
81. **Why I Modernized Product Logic Before Adding Agents** — Extract rules, schemas, and evals before adding autonomy.
82. **Side Doors Need Artifacts, Not Just Networking** — Work samples, precise research, and warm-route verification.
83. **AI Can Map a Network, but It Must Not Invent Relationships** — Direct ties, institutional affinity, and careful labels.

### Work, organizations, and career

84. **The PM's Durable Job Is Consequential Choice, Not Artifact Production** — PRDs and simulations get cheaper; ownership under uncertainty remains.
85. **What Happens When Customer Support Starts Doing Product Management?** — Quantifying patterns, writing decision artifacts, and shipping outcomes.
86. **Turn Judgment Into Team Mechanisms** — Frameworks, checklists, dashboards, and standards as the path from strong engineer to organizational leverage.
87. **Delegation Without Decision Boundaries Is Ambiguity** — “Go figure it out” works only when teams know what they can decide.
88. **How to Tell a Platform Story in an Interview** — Choose one high-pressure decision rather than narrating an entire multi-year program.
89. **The Difference Between a Risk Story and a Product-Judgment Story** — Why some migration moments demonstrate operations and others show product authorship.
90. **Working Like an Investor Who Became a Product Builder** — Mechanisms, counterfactuals, evidence, and the recurring need to commit sooner.
91. **The Career Moat Is Translating New Technical Primitives Into Regulated Products** — MCP will commoditize; cross-functional product formation will not.
92. **Behavioral Simulation Will Change Product Work, Not Eliminate Product Ownership** — Evidence generation versus deciding what the organization should optimize.
93. **Why a Narrow Public Body of Work Can Be More Valuable Than Another Side Project** — Converting private judgment into durable, inspectable proof.

### Computational discovery and market evidence

94. **Search for the Trigger, Not the Feature** — Retrieve the event, overwhelm, workaround, and delegation language that precedes action rather than mentions of a proposed product category.
95. **Read the Workaround, Not the Complaint** — Revealed effort, dependencies, maintenance, and failure cost are often stronger demand evidence than emotional language.
96. **False Positives Are Part of Product Discovery** — Exclusion phrases, misleading communities, and adjacent meanings are first-class research outputs.
97. **Negative Research Results Are Product Results** — A zero-result search should reshape or kill a thesis, provided query failure has been separated from demand failure.
98. **“Ready to Pay” Is Too Rare to Be the Only Demand Signal** — Use an evidence ladder spanning workarounds, active help-seeking, named professionals, repeated attempts, consequences, and delegation language.
99. **Exact Language Beats Invented Personas** — Build targeting and interview guides from how people describe the stuck moment, not from a marketer's imagined vocabulary.
100. **Why Subreddit Choice Can Predetermine the Conclusion** — Commercial-cleaning cash-flow pain appeared more clearly in general operator communities than in cleaning-specific forums.
101. **“Bad Credit but Revenue” Is More Actionable Than “Immigrant Entrepreneur”** — Search by the financial condition first and identity second.
102. **Revenue Without Liquidity** — Why growing service businesses can be closest to failure when customers pay net-30 and payroll is immediate.
103. **Invoice Factoring Is a Latent Category** — Owners describe the timing crisis and alternatives without using the product category's vocabulary.
104. **Proof of Completion as an Accounts-Payable Primitive** — Vendor verification, insurance status, work evidence, approval authority, and invoice provenance.
105. **What 160 Million Views Do—and Do Not—Tell You About Learning Demand** — Social engagement reveals formats and language but does not validate retention, transfer, or willingness to use a product.
106. **Professional Speaking Tools Should Diagnose the Moment, Not Score the Accent** — A better frame for non-native professionals and executive-presence feedback.
107. **Negative Feedback as a Life Trigger** — Vague communication anxiety becomes action-ready when a specific meeting or review changes the stakes.

## Existing drafts: disposition

### Publish with light editing

- `voiceai/docs/blog/04-good-is-not-filler.md`
- `voiceai/docs/blog/05-same-product-different-audience.md`
- `trinityai/docs/blog/02-why-semantic-search-was-not-enough.md`
- `trinityai/docs/blog/03-the-moment-i-realized-i-was-solving-the-wrong-problem.md`
- `exaemailwriter/blog-posts/04-why-i-added-identity-gating-and-linkedin-enrichment.md`
- `exaemailwriter/blog-posts/09-current-pipeline-vs-agents-sdk-tradeoffs.md`

### Combine or substantially sharpen

- The first three VoiceAI posts form a useful build diary, but each needs a stronger claim than chronology. Merge the first two into a single “prototype → first users → wrong audience” narrative; keep scaling as a separate piece about content pipelines and premature TTS spend.
- The nine Exa email posts contain good principles but overlap. A stronger public series would be: identity and evidence; product rules and validators; pipeline versus agents. Fold batching, backend oscillation, and hook-pack implementation into those three.
- Trinity's first MVP post is competent but generic. Use it as setup inside the semantic-search or wrong-bottleneck essay instead of publishing it alone.

### Do not publish as written

- Raw career analysis, colleague performance reviews, immigration strategy, financial-account testing, and internal company metrics. They are evidence for your thinking, not public source material.
- Posts whose only claim is “I used tool X.” Every strong idea above survives the tool name.

## Deeper and academic research agenda

These are not just blog posts with more citations. Each has a researchable question, a plausible method, and a contribution that could survive contact with academic review.

### 1. A computational taxonomy of expert pedagogical acts

**Question:** What stable teaching-act vocabulary appears across a complete audio language course, and how does act frequency change with learner level and concept difficulty?

**Method:** Label a stratified sample across early, middle, and late lessons; establish inter-rater agreement with language teachers; test whether a compact ontology explains most turns; model transitions between acts.

**Contribution:** A reusable act ontology and sequential model for voice tutors, more precise than generic dialogue-act labels.

### 2. Hybrid deterministic/generative tutoring versus end-to-end generation

**Question:** Does a rules-first, model-for-judgment tutor reduce curriculum violations and latency without harming perceived naturalness or learning?

**Method:** Randomized comparison of state machine, fully generative tutor, and hybrid tutor. Outcomes: answer leaks, untaught concepts, response latency, retention, transfer, completion, and teacher-rated quality.

### 3. Conversational affirmation as pedagogical and computational infrastructure

**Question:** Do short confirmations improve learning, motivation, and conversational timing, and can they mask system latency without feeling deceptive?

**Method:** Factorial experiment varying affirmation presence and latency placement; measure dropout, response timing, affect, recall, and perceived responsiveness.

### 4. Curriculum leakage benchmark for language-learning models

**Question:** How often do models introduce technically correct but pedagogically unavailable material?

**Method:** Publish curriculum inventories and learner states; create prompts covering correctness, silence, error types, and derivable-but-untaught items; score answer leakage, premature grammar, and recoverability.

**Contribution:** A benchmark for pedagogical safety distinct from general factuality.

### 5. Derivability under constrained learner knowledge

**Question:** Can models reliably distinguish a novel answer constructible from taught pieces from an answer requiring untaught knowledge?

**Method:** Formalize a curriculum graph; generate minimal pairs; compare symbolic graph checks, retrieval, and language-model judgments.

### 6. Code-switching TTS evaluation for tonal, under-resourced languages

**Question:** How do multilingual TTS systems preserve lexical tone, speaker identity, prosody, and intelligibility when switching between English and Yoruba within one teaching utterance?

**Method:** Build a consented bilingual corpus; compare direct multilingual synthesis, segmented monolingual synthesis, voice cloning, fine-tuning, and human recordings; evaluate with native raters and acoustic tone measures.

### 7. Transcript-faithful versus adaptive AI instruction

**Question:** When does preserving an expert-designed lesson outperform real-time personalization, and which deviations add value rather than erode method fidelity?

**Method:** Compare fixed, bounded-adaptive, and open-adaptive conditions across retention, trust, error correction, and completion.

### 8. Authority-state ontology for consumer financial agents

**Question:** What minimal state model adequately represents observation, recommendation, preparation, approval, execution, revocation, recovery, and liability across institutions?

**Method:** Validate the provisional ontology against real workflows, legal regimes, and expert interviews; measure coverage and ambiguity; map state transitions and forbidden transitions.

### 9. Consumer willingness to delegate financial actions by authority level

**Question:** Which action characteristics—reversibility, dollar value, familiarity, urgency, auditability, and recourse—determine willingness to delegate?

**Method:** Conjoint experiment or discrete-choice study across explanation, simulation, preparation, approval-each, policy-bounded autonomy, and full autonomy.

### 10. Portable household mandate and co-consent protocols

**Question:** Can a cross-institution representation of household roles, joint approval, expiry, override, and revocation be both usable and legally operational?

**Method:** Design-science prototype across two people and multiple financial rails; threat modeling; legal analysis; usability tests; interoperability evaluation.

### 11. Intent-to-action receipts for AI-mediated transactions

**Question:** What information must a receipt preserve to reconstruct user intent, model inputs, recommendation provenance, approval, execution, and remediation?

**Method:** Derive a schema from disputes and regulated workflows; test whether independent reviewers can reconstruct responsibility and detect unauthorized deviations.

### 12. Accountable completion and the economics of exception handling

**Question:** When can agentic services own an end-to-end outcome while supporting long-tail institutions and human exceptions at software-like margins?

**Method:** Workflow time-and-motion studies; exception taxonomy; simulation of automation rates and operator leverage; field studies with episode-specific services.

### 13. Behavioral agent evals for high-stakes tool use

**Question:** Which evaluation design best predicts real failures: final-answer grading, trace grading, contract tests, adversarial multi-turn scenarios, or human red teaming?

**Method:** Seed known tool, auth, missing-field, ambiguity, and permission failures; compare evaluation methods on detection rate and false reassurance.

### 14. Route-aware confidence in human-AI triage

**Question:** Should system confidence reflect exact label certainty or downstream decision stability?

**Method:** Compare label-based and route-based confidence in bug triage; measure correct team assignment, override rate, response time, and user trust.

### 15. Monotonic rule floors around probabilistic severity judgments

**Question:** Do deterministic escalation rules improve safety and calibration when models propose severity in compliance, privacy, financial, and outage cases?

**Method:** Retrospective incident corpus plus prospective shadow deployment; compare model-only, rules-only, and hybrid policies.

### 16. Local concept grounding in long-document semantic retrieval

**Question:** Does requiring local co-occurrence of query concepts reduce false thematic matches without unacceptable recall loss?

**Method:** Benchmark long sermons, meetings, or reports with multi-concept queries; compare dense retrieval, hybrid retrieval, local-window constraints, rerankers, and no-result calibration.

### 17. Point-in-time correctness for finance agents

**Question:** How often do finance agents answer historical questions with revised, restated, or temporally unavailable facts?

**Method:** Build questions with known vintage-sensitive answers; compare systems that model period end, publication, market availability, and retrieval time.

### 18. Source authority and claim-level provenance in financial synthesis

**Question:** Does an explicit source hierarchy improve factual accuracy, conflict detection, and expert trust beyond citation count?

**Method:** Compare flat retrieval against authority-aware retrieval on filings, investor materials, news, and aggregators; expert-grade claim correctness and source appropriateness.

### 19. Inferring competitor use from transaction descriptors

**Question:** How accurately can subscription behavior be detected from noisy payment descriptions, and what selection and privacy biases result?

**Method:** Validate merchant rules against consented ground truth; quantify App Store undercount, annual-plan censoring, false positives, and demographic/wealth skews.

**Caution:** This is academically interesting but requires strict privacy governance and cannot be published from internal data without authorization.

### 20. Life triggers, execution friction, and financial delegation

**Question:** Are households more willing to delegate during acute transitions than for evergreen financial optimization, and does willingness persist after the episode?

**Method:** Longitudinal study across job change, marriage, childbirth, home purchase, inheritance, and bereavement; separate stated willingness from completed action.

### 21. Retrospective enrollment bias in crowdsourced immigration timelines

**Question:** How much do late enrollment, changing cohort membership, non-absorbing status categories, and competing outcomes distort processing-time curves?

**Method:** Compare prospective cohorts with reconstructed platform cohorts; use survival analysis with competing risks and sensitivity bounds.

**Source:** The USCIS I-131/Lawfully extraction showed implausibly high filing-month “decision” rates, declining cumulative-looking curves, cohort-total mismatches, and evidence of backfill.

### 22. Human versus synthetic behavioral evidence in product decisions

**Question:** When do behavioral simulations change product decisions correctly, and when do they amplify framing errors or historical-data blind spots?

**Method:** Pre-register real product decisions, compare forecasts from simulations, surveys, experiments, and expert judgment, then score against observed outcomes.

### 23. Compliance rule libraries as shared infrastructure

**Question:** Can deterministic claim classification and disclosure attachment provide a defensible pre-send control layer for AI-generated regulated communications?

**Method:** Build a rule/evidence library; compare model-only review, human review, and hybrid pre-send enforcement; measure missed obligations, false blocks, reviewer time, and auditability.

### 24. Product-team adaptation when artifacts become cheap

**Question:** As AI reduces the cost of PRDs, research synthesis, and behavioral evidence, do product roles contract or shift toward decision rights and resource ownership?

**Method:** Longitudinal organizational study of PM-to-engineer ratios, decision structures, artifact volumes, and product outcomes across AI-native and incumbent firms.

### 25. Revealed workaround effort as demand evidence

**Question:** Is the complexity and persistence of an existing workaround more predictive of adoption than self-reported pain?

**Method:** Develop a workaround-cost scale covering people, tools, time, data dependencies, failure consequence, and maintenance; test it prospectively across multiple products.

### 26. Negative-result interpretation in computational discovery

**Question:** How can a researcher distinguish absent demand from vocabulary mismatch, inaccessible communities, bad queries, or platform sampling bias?

**Method:** Preregister alternative query families and community sets; use human relevance labels; model conclusion sensitivity to each retrieval specification.

### 27. Public-language signals of willingness to pay and delegate

**Question:** Which observable signals predict real payment or authority delegation when explicit “I would pay” language is rare?

**Method:** Label workarounds, active seeking, consequence severity, professional contact, repeated attempts, and delegation language; validate against interviews and behavioral tests.

### 28. Evidence-span validation and appropriate reliance

**Question:** Do explanations restricted to verbatim source spans improve error detection and trust calibration compared with fluent generated rationales?

**Method:** Randomized review tasks measuring decision accuracy, inappropriate reliance, time to verify, and perceived trustworthiness.

### 29. Accent fairness in professional communication systems

**Question:** Do automated assessments confuse accent, dialect, turn-taking convention, or code-switching with poor workplace communication?

**Method:** Balanced speech corpus, blinded human outcome ratings, model error analysis, and uncertainty/abstention policies.

### 30. Social engagement versus durable learning

**Question:** Which short-video patterns improve delayed retention and transfer rather than views, likes, or perceived insight?

**Method:** Convert high-performing patterns into randomized micro-lessons and measure immediate recall, delayed retention, generalization, completion, and return.

### 31. Vendor verification in property operations

**Question:** Can structured proof of work, insurance status, approval authority, and invoice provenance reduce disputes and payment delay?

**Method:** Field study with property managers and service vendors; prototype an evidence/approval ledger; measure exception rates and cycle time.

## Which research directions are genuinely thesis-worthy

The best candidates for a paper, serious independent study, or academic collaboration are:

1. **Computational taxonomy of expert pedagogical acts** — you already have a novel seed ontology and a 90-lesson corpus.
2. **Hybrid deterministic/generative tutoring RCT** — practical product value plus a clear causal comparison.
3. **Curriculum leakage benchmark** — a real missing evaluation category with broad educational relevance.
4. **Code-switching TTS for Yoruba** — socially useful, technically difficult, and under-researched relative to high-resource languages.
5. **Authority-state ontology for financial agents** — potentially important conceptual work, but needs legal and industry collaborators.
6. **Willingness to delegate by authority level** — publishable human-computer interaction/consumer-finance question with tractable experimental design.
7. **Behavioral evals for high-stakes tool use** — directly relevant to industry and safety research.
8. **Route-aware confidence in triage** — narrower, highly testable, and suitable for an applied HCI/software-engineering paper.
9. **Point-in-time correctness for finance agents** — strong benchmark opportunity at the intersection of retrieval and financial data.
10. **Retrospective bias in immigration timelines** — methodologically meaningful and socially useful if the data can be acquired ethically.

## Evidence map

### VoiceAI

- `docs/blog/01-built-an-interactive-spanish-app.md`
- `docs/blog/02-first-users-first-data-first-disappointment.md`
- `docs/blog/03-scaling-from-1-to-88-lessons.md`
- `docs/blog/04-good-is-not-filler.md`
- `docs/blog/05-same-product-different-audience.md`
- `docs/lt-act-taxonomy-lesson-04.md`
- `docs/lt-act-selection-latency.md`
- `docs/lt-move-spec-format.md`
- `docs/lt-voice-model-findings.md`
- `docs/yoruba-grammar-panorama-and-spine.md`
- `docs/design-demand-test.md`
- TikTok lesson scripts, variants, carousel manifests, TTS QA scripts, and finalized render artifacts.

### Agentic finance and linking

- `linking strategy/authority_state_atlas/AUTHORITY_STATE_ATLAS_V1_MEMO.md`
- `linking strategy/Product_Principles_Linked_Data.md`
- `linking strategy/Linked_Data_Experiments.md`
- `linking strategy/Hypothesis_Data_Requirements.md`
- `linking strategy/competitor_subscription_profile_report.md`
- `linking strategy/uscis_i131_cohort/README.md` and its cohort extracts.
- `NewLevel/percepta_interview_packet/02_interview_prep_and_cv_stories/plaid_migration_story_bank.md`
- `NewLevel/percepta_interview_packet/02_interview_prep_and_cv_stories/percepta_project_deep_dive_prep.md`

### Other AI product experiments

- `trinityai/docs/blog/01-building-trinity-search-mvp.md`
- `trinityai/docs/blog/02-why-semantic-search-was-not-enough.md`
- `trinityai/docs/blog/03-the-moment-i-realized-i-was-solving-the-wrong-problem.md`
- `exaemailwriter/blog-posts/01-09`
- `exaemailwriter/comparison-results/*`
- `ideas/bug-triage-console/docs/DECISIONS.md`
- `ideas/bug-triage-console/docs/WRITEUP.md`
- `ideas/bug-triage-console/docs/TRIAGE_LOGIC.md`
- `ideas/wave2-dialog/*.md`

### Conversation clusters

- MCP design, safety, evals, live plugin failures, and CV reconstruction.
- Plaid migration stories, linking ownership, support-derived product insights, and leadership/organizational analysis.
- Language Transfer licensing pivot, voice-only prototype, lesson parsing, TikTok scripting/rendering, and Yoruba voice research.
- Household financial executive function, life-trigger research, MergeKit, authority-state atlas, and workaround-driven startup discovery.
- Trinity Search, Exa email research/writing, bug-triage system, and agent-versus-pipeline testing.
- Career strategy, role-fit research, side-door outreach, and the effect of AI/simulations on product work.

## Final recommendation

Do not publish 93 disconnected posts. Treat this as three linked series:

1. **Teaching a machine how to teach** — warmth, acts, curriculum boundaries, latency, voice.
2. **Building AI that can be trusted to act** — evals, controllable delegation, authority states, receipts, exceptions.
3. **What real infrastructure failures teach product people** — migrations, state semantics, fallbacks, freshness, support evidence.

The unifying thesis is simple enough to own publicly:

> The hard part of AI products is not getting a model to produce an answer. It is deciding what the system is allowed to know, what kind of judgment is required, what must be checked, when a person must stay in control, and who owns the outcome when reality does not follow the happy path.
