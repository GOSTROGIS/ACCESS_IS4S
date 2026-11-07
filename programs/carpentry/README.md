# Carpentry: instructor notes

The Carpentry trade page (`programs/carpentry/index.html`) is the top level. Intakes sit inside it, and every intake reuses the shared materials listed on the trade page.

## What is shared

- **Math deck library.** 27 daily math decks, listed by day and topic in `materials.json`. The files live in `intake-142/PDF/` and `intake-142/PowerPoint/` because that is where Intake 142 learners first got them. Do not move or rename them, or those links break.
- **BC Building Code Part 9 plates** in `bcbc-part-9/`, also used by the Carpentry tab of the Numeracy Hub.
- **Lecture quizzes** in `intake-142/Quizzes/`: the quiz game, the generator with its answer key, and the fillable quiz PDFs.
- **War Against The Poor** simulator in `intake-142/war-against-the-poor/`.
- **Numeracy Hub Carpentry tab** and **Shape Canvas** under `skills/numeracy/`.

## Add the next intake

1. Make a folder `programs/carpentry/intake-NNN/`, using the new intake number.
2. Give it its own schedule: which day number of the deck library is taught on which date. Link each day to the shared deck in `../intake-142/PDF/` and `../intake-142/PowerPoint/`, or to the library on the trade page (`../#decks`).
3. If the intake gets its own dated decks, put them in `intake-NNN/PDF/` and `intake-NNN/PowerPoint/`, named `Day-NN_YYYY-MM-DD_Week-N`. The build then makes the intake page the same way it makes the Intake 142 page.
4. Add the intake to the `intakes` list in `materials.json`: folder, name, provider, program, eyebrow, lede and a one-line summary.
5. If you add or change decks, add each one to the `decks` list in `materials.json`. Copy the topics from the block titles printed on page 1 of the deck.
6. Rebuild and check links:

   ```
   python3 source/site/build_pages.py
   python3 source/check-links.py
   ```

   The link check must report 0 missing.

## Facts on the trade page

The trade facts come from SkilledTradesBC and Statistics Canada, and the Sources list gives the date each page was checked. Check them again before each new intake and update `CHECKED` in `source/site/build_pages.py`.
