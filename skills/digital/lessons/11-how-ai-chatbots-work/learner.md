---
title: How AI chatbots work
summary: Learn what a large language model is, why a chatbot can sound sure and still be wrong, and how to check an AI answer against the official source.
level: 1-2
time: 60 min
components: Use digital information; Apply safe and responsible practices online; Update and upgrade digital skills
---

# How AI chatbots work

Facts about how these tools work were checked against help pages from Google, OpenAI and Anthropic, and the safety rule against the WorkSafeBC website, on 2026-11-06. This lesson applies to any AI chatbot. Lessons 12 to 15 cover four products one at a time.

## Why this matters on the job

AI chatbots such as Claude, ChatGPT, Microsoft Copilot and Gemini can write a materials list, explain a regulation in plain words or help you word a message to your foreman. They answer fast and they sound sure. They can also be wrong. On a job site, a wrong height, quantity or rule can cost money or get someone hurt. If you know how the tool makes an answer, you know when and how to check it.

## Key ideas

### What a large language model is

A **large language model** (LLM) is the engine inside an AI chatbot.

- It was **trained** on a very large amount of text. During training it learned patterns: which words tend to follow which other words.
- It does **not** store that text like a filing cabinet or a database. Do not treat it as a reliable archive or an exact copy of a source.
- When you ask a question, it **predicts the next word**, then the next, then the next, until the answer is done. Google gives this example: after "think outside the", the word "box" is more likely than "blue".

### Tokens

The model does not read whole words. It reads **tokens**: small pieces of text. A token can be one letter, part of a word or a whole word. Spaces and punctuation count too.

OpenAI gives these rules of thumb for English text:

- 1 token is about 4 characters
- 100 tokens is about 75 words

Other languages often use more tokens for the same number of characters. Each chatbot has a limit on how much text it can hold in one conversation, and that limit is counted in tokens. A very long chat or a very large file can push early details out.

### The model and the app are different things

| | What it is | Example |
|---|---|---|
| **Model** | The trained engine that predicts text | The model behind Claude, ChatGPT, Copilot or Gemini |
| **App** | The website or phone app you type into | claude.ai, chatgpt.com, the Copilot app, the Gemini app |

The app adds tools around the model. Depending on the product, your plan and your settings, the app can:

- search the web
- read a file or photo you upload
- remember things from past chats (memory)
- create files, images or code

So two people using the "same" chatbot can get different results. One may have web search or memory turned on, and the other may not.

<div class="figure-art">
<svg viewBox="0 0 400 640" width="100%" style="max-width:560px" role="img" aria-labelledby="ai11-flow-title ai11-flow-desc" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="ai11-flow-title">How a chatbot turns a prompt into an answer</title>
<desc id="ai11-flow-desc">Five steps from top to bottom. 1. You type a prompt. 2. The app adds context: its own instructions, files you uploaded, memory if it is on, and web results if search is on. 3. The text is split into tokens. 4. The model predicts the next token, again and again, shown with a loop arrow. 5. The tokens are joined into the answer you read. A note at the bottom says the model uses patterns learned in training and only looks things up when the app uses a tool such as web search.</desc>
<rect x="0" y="0" width="400" height="640" fill="#FFFFFF"/>
<rect x="20" y="16" width="360" height="72" rx="10" fill="#F4F5F6" stroke="#4A4E54" stroke-width="2"/>
<circle cx="50" cy="52" r="18" fill="#D2181F"/>
<text x="50" y="58" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">1</text>
<text x="80" y="47" font-size="18" font-weight="bold" fill="#1A1A1A">You type a prompt</text>
<text x="80" y="71" font-size="15" fill="#4A4E54">A question or a request</text>
<path d="M200 88 L200 110" stroke="#1A1A1A" stroke-width="3"/>
<path d="M192 104 L200 116 L208 104 Z" fill="#1A1A1A"/>
<rect x="20" y="118" width="360" height="112" rx="10" fill="#F4F5F6" stroke="#4A4E54" stroke-width="2"/>
<circle cx="50" cy="154" r="18" fill="#D2181F"/>
<text x="50" y="160" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">2</text>
<text x="80" y="149" font-size="18" font-weight="bold" fill="#1A1A1A">The app adds context</text>
<text x="80" y="173" font-size="15" fill="#4A4E54">Its own instructions, your files,</text>
<text x="80" y="193" font-size="15" fill="#4A4E54">memory if it is on, web results</text>
<text x="80" y="213" font-size="15" fill="#4A4E54">if search is on</text>
<path d="M200 230 L200 252" stroke="#1A1A1A" stroke-width="3"/>
<path d="M192 246 L200 258 L208 246 Z" fill="#1A1A1A"/>
<rect x="20" y="260" width="360" height="92" rx="10" fill="#F4F5F6" stroke="#4A4E54" stroke-width="2"/>
<circle cx="50" cy="296" r="18" fill="#D2181F"/>
<text x="50" y="302" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">3</text>
<text x="80" y="291" font-size="18" font-weight="bold" fill="#1A1A1A">Text is split into tokens</text>
<rect x="80" y="310" width="62" height="28" rx="4" fill="#FFBC00"/>
<text x="111" y="330" font-size="15" fill="#1A1A1A" text-anchor="middle">fall</text>
<rect x="148" y="310" width="50" height="28" rx="4" fill="#FFBC00"/>
<text x="173" y="330" font-size="15" fill="#1A1A1A" text-anchor="middle">pro</text>
<rect x="204" y="310" width="66" height="28" rx="4" fill="#FFBC00"/>
<text x="237" y="330" font-size="15" fill="#1A1A1A" text-anchor="middle">tection</text>
<path d="M200 352 L200 374" stroke="#1A1A1A" stroke-width="3"/>
<path d="M192 368 L200 380 L208 368 Z" fill="#1A1A1A"/>
<rect x="20" y="382" width="360" height="92" rx="10" fill="#FFFFFF" stroke="#C60016" stroke-width="3"/>
<circle cx="50" cy="418" r="18" fill="#C60016"/>
<text x="50" y="424" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">4</text>
<text x="80" y="413" font-size="18" font-weight="bold" fill="#1A1A1A">The model predicts</text>
<text x="80" y="437" font-size="15" fill="#4A4E54">the next token, again</text>
<text x="80" y="457" font-size="15" fill="#4A4E54">and again</text>
<path d="M330 400 A26 26 0 1 1 330 456" stroke="#C60016" stroke-width="3" fill="none"/>
<path d="M322 450 L332 460 L336 446 Z" fill="#C60016"/>
<path d="M200 474 L200 496" stroke="#1A1A1A" stroke-width="3"/>
<path d="M192 490 L200 502 L208 490 Z" fill="#1A1A1A"/>
<rect x="20" y="504" width="360" height="62" rx="10" fill="#F4F5F6" stroke="#4A4E54" stroke-width="2"/>
<circle cx="50" cy="535" r="18" fill="#D2181F"/>
<text x="50" y="541" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">5</text>
<text x="80" y="541" font-size="18" font-weight="bold" fill="#1A1A1A">You read the answer</text>
<text x="20" y="598" font-size="15" fill="#1A1A1A">The model uses patterns from training.</text>
<text x="20" y="620" font-size="15" fill="#1A1A1A">It only looks things up if a tool does.</text>
</svg>
</div>

### Why it can sound sure and still be wrong

The model picks likely words. Likely is not the same as true. OpenAI's help page says ChatGPT can sound confident even when it is wrong. Google says the same about all large language models, Gemini included. Common mistakes:

- wrong numbers, dates or definitions
- made-up quotes, sources or section numbers
- a rule from another province or country presented as if it applies in BC
- an old version of a rule

When a chatbot invents something, people call it a **hallucination**.

### Knowledge cutoff and web search

A model only learned from text up to a certain date. This is its **knowledge cutoff**. It does not know about changes after that date unless the app uses a tool such as web search.

- With web search on, the app looks up pages and the model writes an answer from them. Good apps show links. Open the links: the answer can still misread the page.
- With web search off, the model can still use the conversation, uploaded files and other context the app supplies, as well as training patterns. That context is not automatically current or correct. For anything that changes (wages, rules, prices, forms, schedules), go to the official site.

### Check what information the app can use

A chatbot may receive information about you from what you type, uploaded files, saved memory, connected apps or work files that it has permission to access. It may also infer details from context. Turning memory off is not a guarantee that the app has no information about you. Check the account, connections and content before using it.

Each product has settings to see, turn off or delete memory. Lessons 12 to 15 show where. Treat anything you type as something that may be stored. Lesson 16 covers what never to paste.

### Good and bad jobs for a chatbot on a job site

| Good jobs (you still check) | Poor jobs (do not rely on it) |
|---|---|
| Turn your notes into a clear message | Deciding if a scaffold or ladder is safe |
| Explain a regulation in plain words, with the source open beside it | Telling you the current rule without a source |
| Make a first list of materials from your measurements | Final quantities for an order without your own math |
| Practise for an interview or a ticket exam | Medical, legal or emergency decisions |
| Rewrite a long email shorter | Anything that needs a licensed person to sign off |

### Worked example: check an AI answer against WorkSafeBC

Jordan, a first-year carpentry apprentice, asks a chatbot: "When do I need fall protection on a job site in BC?"

The chatbot answers: "In BC you need fall protection when working at 3 m (10 ft) or higher."

Jordan checks it with the **check-it loop**:

1. **What is the claim?** Fall protection is needed at 3 m (10 ft) or more.
2. **Find the official source.** Rules for BC workplaces are in the WorkSafeBC Occupational Health and Safety Regulation. Jordan searches `fall protection site:worksafebc.com` and opens Part 11, Fall Protection, at worksafebc.com.
3. **Compare.** Section 11.2(1) says the employer must make sure a fall protection system is used where a fall of 3 m (10 ft) or more may occur. It also covers falls from **less** than 3 m where the risk of injury is greater than landing on a flat surface. The chatbot left out that second part.
4. **Decide.** The number was right. The answer was incomplete. Jordan writes his own note: "Fall protection at 3 m or more, or lower where landing would be worse than a flat surface. OHS Regulation s. 11.2(1), worksafebc.com, checked 2026-11-06."
5. **Ask your supervisor** how it applies on your site. The employer must instruct workers in the fall protection system for the area before they go there (s. 11.2(6)).

<div class="figure-art">
<svg viewBox="0 0 400 560" width="100%" style="max-width:560px" role="img" aria-labelledby="ai11-check-title ai11-check-desc" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="ai11-check-title">The check-it loop</title>
<desc id="ai11-check-desc">Five steps in a column with a return arrow. 1. Ask the chatbot. 2. Name the claim: the number, rule or fact it gave. 3. Find the official source, such as worksafebc.com or canada.ca. 4. Compare the answer with the source, word for word. 5. Use it, fix it or drop it, and write where you checked. An arrow on the right goes from step 5 back to step 1, labelled ask again with the source.</desc>
<rect x="0" y="0" width="400" height="560" fill="#FFFFFF"/>
<rect x="20" y="16" width="300" height="76" rx="10" fill="#1A1A1A"/>
<rect x="20" y="124" width="300" height="76" rx="10" fill="#4A4E54"/>
<rect x="20" y="232" width="300" height="96" rx="10" fill="#D2181F"/>
<rect x="20" y="360" width="300" height="76" rx="10" fill="#C60016"/>
<rect x="20" y="468" width="300" height="76" rx="10" fill="#FFBC00"/>
<g font-size="18" font-weight="bold" fill="#FFFFFF">
<text x="36" y="46">1. Ask</text>
<text x="36" y="154">2. Name the claim</text>
<text x="36" y="262">3. Find the source</text>
<text x="36" y="390">4. Compare</text>
</g>
<g font-size="15" fill="#FFFFFF">
<text x="36" y="72">Type a clear question</text>
<text x="36" y="180">The number, rule or fact</text>
<text x="36" y="288">worksafebc.com, canada.ca,</text>
<text x="36" y="310">gov.bc.ca or the manufacturer</text>
<text x="36" y="416">Word for word, number by number</text>
</g>
<text x="36" y="498" font-size="18" font-weight="bold" fill="#1A1A1A">5. Use, fix or drop</text>
<text x="36" y="524" font-size="15" fill="#1A1A1A">Write where you checked</text>
<g stroke="#1A1A1A" stroke-width="3">
<line x1="170" y1="92" x2="170" y2="116"/>
<line x1="170" y1="200" x2="170" y2="224"/>
<line x1="170" y1="328" x2="170" y2="352"/>
<line x1="170" y1="436" x2="170" y2="460"/>
</g>
<g fill="#1A1A1A">
<path d="M162 112 L170 124 L178 112 Z"/>
<path d="M162 220 L170 232 L178 220 Z"/>
<path d="M162 348 L170 360 L178 348 Z"/>
<path d="M162 456 L170 468 L178 456 Z"/>
</g>
<path d="M320 506 L362 506 L362 54 L334 54" stroke="#4A4E54" stroke-width="3" fill="none"/>
<path d="M338 46 L324 54 L338 62 Z" fill="#4A4E54"/>
<text x="382" y="280" font-size="15" fill="#1A1A1A" text-anchor="middle" transform="rotate(90 382 280)">Ask again with the source</text>
</svg>
</div>

## Practice

You do not need an AI account for Tasks 1, 2, 3, 5 and 6. Task 4 needs a web browser.

**Task 1** (level 1) Match each word to its meaning. Write the letter.

| Word | Letter | Meaning |
|---|---|---|
| 1. Prompt | ___ | A. The trained engine that predicts text |
| 2. Token | ___ | B. The date the model's training text stops |
| 3. Model | ___ | C. What you type or say to the chatbot |
| 4. Knowledge cutoff | ___ | D. A setting that lets the app keep details from past chats |
| 5. Memory | ___ | E. A small piece of text the model reads |
| 6. Hallucination | ___ | F. An answer the chatbot made up |

**Task 2** (level 1) Write **G** for a good job for a chatbot (you still check it) or **P** for a poor job.

- a. Turn your rough notes about a late delivery into a short, polite text to your foreman. ___
- b. Tell you if the guardrail on a third-floor deck is strong enough. ___
- c. Explain the word "anchorage" in plain language. ___
- d. Give you today's BC minimum wage with web search turned off. ___
- e. Quiz you on the parts of a framing square. ___

**Task 3** (level 2) Use OpenAI's rule of thumb: 100 tokens is about 75 words. A safety talk handout has 600 words. About how many tokens is that? Show your math.

______________________________________________________________

**Task 4** (level 2) A chatbot says: "In BC, a worker can decide not to use the fall protection the employer gives them if they feel safe." Use the check-it loop. Open Part 11 of the OHS Regulation at https://www.worksafebc.com/en/law-policy/occupational-health-safety/searchable-ohs-regulation/ohs-regulation/part-11-fall-protection and find section 11.2. Is the answer right? Write the section number that settles it.

______________________________________________________________

**Task 5** (level 2) You ask a chatbot with web search turned off: "What is the minimum wage in BC today?" Explain why this answer could be out of date, and write two better ways to get the current figure.

______________________________________________________________

**Task 6** (level 1) For each case, write **Yes** or **No**: could the chatbot know this about you?

- a. Your employer's name, in a new chat with memory off, no connected apps or files, and no identifying information in the chat or account context. ___
- b. Your trade, if you told it last week and memory is on. ___
- c. Your street address, if it was in a résumé you uploaded in this chat. ___

## Check yourself

1. In your own words, how does a large language model write an answer?
2. What is the difference between the model and the app?
3. Why can a chatbot sound sure and still be wrong?
4. What does web search change, and what does it not change?
5. Name the five steps of the check-it loop.
