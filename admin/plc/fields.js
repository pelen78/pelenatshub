export const STAGES = [
  {
    key: 'reassess', title: 'Reassess', question: "Did last week's response work?",
    description: 'Review the instructional action from the previous PLC and determine whether student learning improved.',
    groups: [{ fields: [
      { key: 'previousResponse', label: 'Previous instructional response', prompt: 'What did you commit to trying last week?' },
      { quick: true, key: 'whatHappened', label: 'What happened after the response?', prompt: 'Teacher observation goes here.' },
      { key: 'improvement', label: 'Evidence of improvement', prompt: 'Add evidence showing whether learning improved.' },
      { quick: true, key: 'stillNeeds', label: 'What still needs attention?', prompt: 'Note what is still unresolved.' }
    ]}]
  },
  {
    key: 'analyze', title: 'Analyze', question: 'What does current evidence show?',
    description: 'Look at this week\u2019s evidence and name what it shows. Log individual pieces of evidence in Classroom evidence.',
    groups: [{ fields: [
      { key: 'evidenceAnalyzed', label: 'Evidence analyzed', prompt: 'Add evidence from current student work.' },
      { quick: true, key: 'strengths', label: 'Strengths observed', prompt: 'Teacher observation goes here.' },
      { quick: true, key: 'gaps', label: 'Learning gaps', prompt: 'Describe what students struggled with.' },
      { key: 'misconceptions', label: 'Common misconceptions', prompt: 'Describe the most common misconception observed.' },
      { key: 'patterns', label: 'Patterns in student work', prompt: 'Note patterns across the class, such as missing work.' }
    ]}]
  },
  {
    key: 'respond', title: 'Respond', question: 'Who needs reteaching, intervention, or extension?',
    description: 'Describe groups in general terms. Student names are not required.',
    groups: [
      { key: 'reteach', title: 'Reteach', note: 'Students or skills needing another explanation.', fields: [
        { key: 'skill', label: 'Skill / concept', prompt: 'Which skill needs another explanation?' },
        { quick: true, key: 'group', label: 'Student group', prompt: 'For example: students who did not complete all required sections.', short: true },
        { quick: true, key: 'strategy', label: 'Planned reteaching strategy', prompt: 'How will you explain it differently?' }
      ]},
      { key: 'intervention', title: 'Intervention', note: 'Students needing targeted support.', fields: [
        { key: 'group', label: 'Student group', prompt: 'Describe the group.', short: true },
        { key: 'need', label: 'Area of need', prompt: 'What do they need help with?' },
        { key: 'support', label: 'Planned support', prompt: 'What support will you give?' }
      ]},
      { key: 'extension', title: 'Extension', note: 'Students who already showed proficiency and need deeper application.', fields: [
        { key: 'group', label: 'Student group', prompt: 'Describe the group.', short: true },
        { quick: true, key: 'activity', label: 'Enrichment or extension activity', prompt: 'What will they do next?' }
      ]}
    ]
  },
  {
    key: 'plan', title: 'Plan', question: 'What must students learn next?',
    description: 'Name the next priority and what students need to get there.',
    groups: [{ fields: [
      { quick: true, key: 'priorityTarget', label: 'Priority learning target', prompt: 'State the next priority target.' },
      { key: 'know', label: 'What students should know', prompt: 'Key knowledge.' },
      { key: 'do', label: 'What students should be able to do', prompt: 'Key skills.' },
      { key: 'prerequisite', label: 'Prerequisite skill', prompt: 'What must already be in place?' },
      { key: 'nextLevel', label: 'Next-level skill', prompt: 'Where does this lead?' },
      { key: 'supports', label: 'Supports needed', prompt: 'Scaffolds, tools, or grouping.' }
    ]}]
  },
  {
    key: 'design', title: 'Design', question: 'How will students demonstrate learning?',
    description: 'Decide what evidence you will collect and when.',
    groups: [{ fields: [
      { quick: true, key: 'task', label: 'Assessment / task', prompt: 'What will students complete?' },
      { key: 'evidence', label: 'Evidence students will produce', prompt: 'What will you look at?' },
      { key: 'alignment', label: 'How it aligns with the learning target', prompt: 'Connect the task to the target.' },
      { quick: true, key: 'when', label: 'When evidence will be collected', prompt: 'Day or class period.' },
      { key: 'reassessPlan', label: 'Reassessment plan', prompt: 'How can students show growth later?' }
    ]}]
  },
  {
    key: 'calibrate', title: 'Calibrate', question: 'What counts as proficient work?',
    description: 'Make expectations clear enough that proficient work is easy to recognize.',
    groups: [{ fields: [
      { quick: true, key: 'successCriteria', label: 'Success criteria', prompt: 'List the success criteria.' },
      { key: 'proficient', label: 'Features of proficient work', prompt: 'What does proficient work include?' },
      { key: 'rubric', label: 'Rubric / checklist', prompt: 'Rubric or checklist items.' },
      { key: 'exemplar', label: 'Exemplar or example', prompt: 'Describe or link an example.' },
      { key: 'expectations', label: 'Notes about expectations', prompt: 'Anything students often misread.' },
      { key: 'link', label: 'Rubric, assignment, or project link', prompt: 'Paste a link.', type: 'url' }
    ]}]
  }
];

export const COMMITMENT_FIELDS = [
  { quick: true, key: 'action', label: 'Specific instructional action', prompt: 'What exactly will you do next week?' },
  { key: 'group', label: 'Student group', prompt: 'Who is this for?', short: true },
  { key: 'evidence', label: 'Evidence to collect', prompt: 'What will show whether it worked?' },
  { quick: true, key: 'reassessDate', label: 'Date to reassess', prompt: 'Pick a date.', type: 'date' },
  { key: 'notes', label: 'Notes', prompt: 'Optional notes.' }
];

// Quick classroom notes (teacher only). Shown in the Classroom evidence panel.
export const CLASSROOM_FIELDS = [
  { key: 'observed', label: 'What I observed', prompt: 'Teacher observation goes here.' },
  { key: 'struggled', label: 'What students struggled with', prompt: 'Describe where students got stuck.' },
  { key: 'didWell', label: 'What students did well', prompt: 'Describe strengths you saw in student work.' },
  { key: 'missingWork', label: 'Missing work', prompt: 'Note missing or incomplete work, by group or section.' },
  { key: 'instructionNotes', label: 'Notes about instruction', prompt: 'What you would keep or change about this week\u2019s instruction.' }
];
const classroomList = () => CLASSROOM_FIELDS.map(f => ({ path: 'classroom.' + f.key, field: f }));

