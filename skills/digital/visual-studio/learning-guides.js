/**
 * Original IS4S practice adaptations of the cited ArtCraft documentation.
 * Upstream commit: 69f53c2f0358a91a5e35e5a7b3a91677320c3112.
 * ArtCraft source is MIT OR Apache-2.0; the IS4S adaptation selects MIT.
 * Preserve the upstream copyright and MIT license in the third-party notices.
 * Source concepts are identified below; these exercises do not run AI services.
 */
const COMMIT = '69f53c2f0358a91a5e35e5a7b3a91677320c3112';
const FAQ = 'frontend/libs/markdown-content/src/lib/content/faq/';
const source = file => ({
  repo: 'storytold/artcraft',
  commit: COMMIT,
  path: FAQ + file,
  url: `https://github.com/storytold/artcraft/blob/${COMMIT}/${FAQ}${file}`,
});

export const guides = [
  {
    id: 'brief-to-image',
    title: 'Turn a clear brief into a visual idea',
    skills: ['Writing', 'Digital'],
    source: source('text-to-image.md'),
    goal: 'Describe one subject, one action and the visual details your audience needs.',
    steps: [
      {
        title: 'Name the subject and action',
        action: 'Write a short description of the fictional learning day. Say who or what should be visible and what is happening.',
        check: 'Can another learner point to the subject and action without asking you to explain?',
      },
      {
        title: 'Choose the useful details',
        action: 'Add the setting, materials and lighting that help explain the activity. Keep the event facts in editable text.',
        check: 'Which details help the message? Which could distract from it?',
      },
      {
        title: 'Compare the result with the brief',
        action: 'Use a sketch or supplied illustration as a candidate. If you use an image tool separately, inspect its result against the same brief.',
        check: 'Identify one match and one mismatch. Check invented signs, object shapes and numbers before sharing.',
      },
    ],
    exercise: 'Write a two-sentence brief for a welcoming notice about the fictional Community Learning Day. Ask a partner what they expect the image to show.',
  },
  {
    id: 'compose-with-layers',
    title: 'Arrange the message before adding detail',
    skills: ['Creativity and innovation', 'Communication', 'Digital'],
    source: source('2d-canvas.md'),
    goal: 'Use a simple layout to direct attention and leave room for readable information.',
    steps: [
      {
        title: 'Block out the layout',
        action: 'Place a subject, a background and a space for the message. Use simple shapes before adding a detailed image.',
        check: 'Can you see the main subject when the layout is small?',
      },
      {
        title: 'Change one element',
        action: 'Move or resize one element, then compare the two arrangements. Keep the intended audience and action the same.',
        check: 'Does the change make the important information easier to find?',
      },
      {
        title: 'Keep a version you can revise',
        action: 'Save the editable layout and a separate viewing copy. Record which arrangement you chose and why.',
        check: 'Reopen your work. Can you still change the labels and positions?',
      },
    ],
    exercise: 'Make two notice layouts: one with a large setting image and one with a close-up. Compare where a reader looks first.',
  },
  {
    id: 'frame-a-scene',
    title: 'Choose what the audience can see',
    skills: ['Numeracy', 'Communication', 'Creativity and innovation'],
    source: source('3d-editor.md'),
    goal: 'Compare framing, subject position and camera choices before making a sequence.',
    steps: [
      {
        title: 'Place the important subject',
        action: 'Choose the object or action the audience needs to understand. Position it so its shape is clear.',
        check: 'Is anything covering the detail you want to explain?',
      },
      {
        title: 'Compare a setting shot and a detail shot',
        action: 'Use a wider frame to show where the activity happens. Use a closer frame to show one feature of the prototype.',
        check: 'What information is lost when you move closer? What becomes easier to see?',
      },
      {
        title: 'Keep related shots consistent',
        action: 'Compare the subject, room and lighting across your sequence. Change a camera choice for a clear reason.',
        check: 'Could a learner recognise the same activity in every frame?',
      },
    ],
    exercise: 'Plan a two-shot explanation of the fictional birdhouse demonstration. Name what the wide shot establishes and what the close-up explains.',
  },
  {
    id: 'mask-and-revise',
    title: 'Ask for one controlled change',
    skills: ['Problem solving', 'Writing', 'Digital'],
    source: source('edit-image.md'),
    goal: 'State what should change, what should stay, and how you will check the revision.',
    steps: [
      {
        title: 'Identify the problem area',
        action: 'Point to the region that needs a change. Describe the problem in plain language before choosing a tool.',
        check: 'Can someone else find the exact region from your description?',
      },
      {
        title: 'Write a small, specific edit',
        action: 'Describe one change, such as replacing a distracting background object. In a tool with masks, mark only the intended region.',
        check: 'Have you also stated the features that should remain unchanged?',
      },
      {
        title: 'Compare the whole image',
        action: 'Review the before and after views, including the unselected area. Keep the original and record the change.',
        check: 'Did the tool change anything else? A mask is a control to inspect, not a guarantee of an unchanged background.',
      },
    ],
    exercise: 'Write an edit request for one supplied illustration. Include the change, two things to preserve and the evidence you would compare afterward.',
  },
  {
    id: 'plan-short-motion',
    title: 'Explain an action through time',
    skills: ['Communication', 'Digital', 'Numeracy'],
    source: source('image-to-video.md'),
    goal: 'Plan a short sequence with a clear subject, useful motion and enough reading time.',
    steps: [
      {
        title: 'Choose a clear starting view',
        action: 'Start with an image in which the subject is easy to identify. Decide what one action the viewer should understand.',
        check: 'Can the first frame be understood without motion?',
      },
      {
        title: 'Specify the motion and duration',
        action: 'Decide whether the camera moves, the subject moves, or both. Set a short duration and keep each caption focused on one idea.',
        check: 'Does the movement help explain the action? Is the caption visible long enough to read?',
      },
      {
        title: 'Preview and revise',
        action: 'Play the storyboard sequence. If you make a generated video in another tool, check the actual exported clip as well.',
        check: 'Look for changing object shapes, abrupt cuts, misleading motion and missing captions.',
      },
    ],
    exercise: 'Build a three-frame orientation: show the setting, explain where to go, then show the event details. Adjust the timing after a partner reads the captions.',
  },
  {
    id: 'compare-and-handover',
    title: 'Choose a result you can explain',
    skills: ['Reading', 'Problem solving', 'Digital'],
    source: source('ai-image-generation-on-artcraft.md'),
    goal: 'Compare candidates against a purpose and describe the evidence behind your choice.',
    steps: [
      {
        title: 'Set the comparison criteria',
        action: 'Name the main subject, the information that must be accurate and the detail that should receive attention.',
        check: 'Are your criteria about understanding the message, rather than appearance alone?',
      },
      {
        title: 'Inspect candidates separately',
        action: 'Check each result against the brief. Record a useful feature and a problem before deciding which to revise.',
        check: 'Which observations come from the supplied facts? Which are only guesses based on an image?',
      },
      {
        title: 'Hand over the work honestly',
        action: 'Keep the editable file, identify generated illustrations and include the text needed to understand the message.',
        check: 'Can the recipient reopen the work, read the key information and see what still needs checking?',
      },
    ],
    exercise: 'Choose between two visual explanations. Give one reason tied to the audience, one verified fact and one remaining limitation.',
  },
];
