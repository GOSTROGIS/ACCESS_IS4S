// Content for the résumé builder: action verbs, trade guides, tips and sources.
// Every fact in TRADE_GUIDES and TIPS was checked against the linked page on 2026-11-06.

export const CHECKED = '2026-11-06';

export const ACTION_VERBS = {
  'Hands-on work': ['Assembled', 'Built', 'Cut', 'Drilled', 'Fabricated', 'Framed', 'Installed', 'Loaded', 'Measured', 'Mixed', 'Operated', 'Poured', 'Repaired', 'Replaced', 'Rigged', 'Staged', 'Unloaded', 'Welded'],
  'Safety and quality': ['Checked', 'Cleaned', 'Completed', 'Followed', 'Inspected', 'Maintained', 'Reported', 'Secured', 'Tested', 'Tracked'],
  'Teamwork and leading': ['Coordinated', 'Guided', 'Helped', 'Led', 'Mentored', 'Organized', 'Scheduled', 'Supervised', 'Supported', 'Trained'],
  'Problem-solving': ['Diagnosed', 'Fixed', 'Found', 'Improved', 'Planned', 'Reduced', 'Resolved', 'Saved', 'Solved', 'Troubleshot'],
  'Communication': ['Answered', 'Explained', 'Recorded', 'Served', 'Signalled', 'Wrote'],
};

export const CREDENTIAL_TYPES = [
  { value: 'redseal', label: 'Red Seal endorsement' },
  { value: 'cofq', label: 'Certificate of Qualification' },
  { value: 'cofa', label: 'Certificate of Apprenticeship' },
  { value: 'cofc', label: 'Certificate of Completion (foundation program)' },
  { value: 'other', label: 'Other trade credential' },
];

export const APPRENTICE_LEVELS = [
  'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5',
  'Foundation program completed', 'All technical training levels completed',
];

export const LICENCE_CLASSES = [
  { value: '', label: 'Not listed on my résumé' },
  { value: '7L', label: "BC Class 7 learner's licence (L)" },
  { value: '7N', label: 'BC Class 7 novice licence (N)' },
  { value: '5', label: "BC Class 5 driver's licence" },
  { value: '4', label: "BC Class 4 driver's licence" },
  { value: '3', label: "BC Class 3 driver's licence" },
  { value: '2', label: "BC Class 2 driver's licence" },
  { value: '1', label: "BC Class 1 driver's licence" },
  { value: 'other', label: 'Another licence (type it below)' },
];

export const TICKET_SUGGESTIONS = [
  'WHMIS', 'Fall Protection', 'First Aid and CPR', 'Forklift Operator', 'Aerial Work Platform',
  'Confined Space Entry', 'Traffic Control', 'H2S Alive', 'Lockout/Tagout', 'Ground Disturbance',
  'Rigging and Signalling', 'Skid Steer', 'Chainsaw Safety', 'Fire Extinguisher',
];

export const SUMMARY_STARTERS = [
  {
    label: 'New to the trades',
    text: 'Reliable [trade or job] with hands-on experience in [skill] and [skill]. Holds [ticket] and [ticket]. Ready to learn on site and support the crew safely.',
  },
  {
    label: 'Apprentice',
    text: '[Level] [trade] apprentice with [number] work-based training hours in [type of work]. Skilled in [skill] and [skill]. Looking for a sponsor employer to keep building toward certification.',
  },
  {
    label: 'Changing careers',
    text: 'Hard-working [past role] moving into [trade]. Brings [skill] and [skill] from [past work] and a safe, steady work ethic. Holds [ticket].',
  },
];

const statcan = (code) =>
  `https://www23.statcan.gc.ca/imdb/p3VD.pl?Function=getVD&TVD=1322554&CVD=1322870&CPV=${code}&CST=01052021&CLV=5&MLV=5`;
const STC_URL = 'https://skilledtradesbc.ca/skilledtradescertification';

export const TRADE_GUIDES = [
  {
    id: 'labourer',
    title: 'Construction labourer',
    noc: { code: '75110', title: 'Construction trades helpers and labourers', url: statcan('75110') },
    duties: [
      'Load and unload construction materials, and move materials to work areas',
      'Put up and take down concrete forms, scaffolding, ramps, catwalks, shoring and barricades',
      'Mix, pour and spread materials such as concrete and asphalt',
      'Help tradespeople such as carpenters, bricklayers, cement finishers, roofers and glaziers',
      'Signal heavy equipment operators and help attach special attachments to equipment',
      'Direct traffic at or near construction sites',
    ],
    requirements: [
      'Some experience as a general construction labourer may be required for helper jobs.',
      'Flagpersons may need a traffic control certificate. Riggers and slingers may need a rigging certificate.',
      'On-the-job training may be provided.',
    ],
    bc: [
      'The related BC apprenticeship is Construction Craft Worker (Labourer). It is a Red Seal trade.',
      'Two levels of technical training, 8 weeks over 2 years.',
      'Work-based training: 4,000 hours in the program in effect until December 31, 2026. The updated program that starts January 1, 2027 lists 3,330 hours.',
      'It is not one of the seven compulsory trades on the SkilledTradesBC Skilled Trades Certification list.',
    ],
    words: ['load and unload materials', 'scaffolding', 'concrete forms', 'mix and pour concrete', 'traffic control', 'signal equipment operators', 'site cleanup'],
    sources: [
      { label: 'NOC 2021: 75110', url: statcan('75110') },
      { label: 'SkilledTradesBC: Construction Craft Worker (Labourer)', url: 'https://skilledtradesbc.ca/construction-craft-worker-labourer' },
      { label: 'SkilledTradesBC: Construction Craft Worker program profile, August 2026', url: 'https://skilledtradesbc.ca/media/3006/download' },
      { label: 'SkilledTradesBC: Skilled Trades Certification', url: STC_URL },
    ],
  },
  {
    id: 'carpenter',
    title: 'Carpenter apprentice',
    noc: { code: '72310', title: 'Carpenters', url: statcan('72310') },
    duties: [
      'Read and interpret blueprints, drawings and sketches to work out specifications and quantities',
      'Prepare layouts to building codes, using measuring tools',
      'Measure, cut, shape, assemble and join wood, wood substitutes, lightweight steel and other materials',
      'Build foundations, install floor beams, lay subflooring and put up walls and roof systems',
      'Fit and install trim such as doors, stairs, moulding and hardware',
    ],
    requirements: [
      'Completion of secondary school is usually required.',
      'A three- to four-year apprenticeship, or over four years of work in the trade plus some courses, is usually needed to be eligible for certification.',
    ],
    bc: [
      'Carpenter is a Red Seal trade in BC.',
      'Technical training: 28 weeks over 4 years.',
      'Work-based training: 6,360 hours.',
      'It is not one of the seven compulsory trades on the SkilledTradesBC Skilled Trades Certification list.',
    ],
    words: ['read blueprints', 'layout', 'framing', 'formwork', 'install doors and trim', 'hand and power tools', 'building code'],
    sources: [
      { label: 'NOC 2021: 72310', url: statcan('72310') },
      { label: 'SkilledTradesBC: Carpenter', url: 'https://skilledtradesbc.ca/carpenter' },
      { label: 'SkilledTradesBC: Skilled Trades Certification', url: STC_URL },
    ],
  },
  {
    id: 'electrician',
    title: 'Electrician apprentice (construction)',
    noc: { code: '72200', title: 'Electricians (except industrial and power system)', url: statcan('72200') },
    duties: [
      'Read and interpret drawings, circuit diagrams and electrical code specifications',
      'Pull wire through conduits and through holes in walls and floors',
      'Install brackets and hangers to support electrical equipment',
      'Install, replace and repair lighting fixtures, switches, relays and circuit breaker panels',
      'Splice, join and connect wire to form circuits, then test continuity with test equipment',
      'Troubleshoot and isolate faults, and replace faulty components',
    ],
    requirements: [
      'Completion of secondary school is usually required.',
      'Completion of a four- to five-year apprenticeship program is usually required.',
    ],
    bc: [
      'Construction Electrician is a Red Seal trade in BC.',
      'It is a compulsory trade (Skilled Trades Certification). To work in it in BC you must be a registered apprentice, a certified journeyperson, or have applied as a Trade Qualifier or Uncertified Experienced Worker.',
      'Technical training: 40 weeks over 4 years.',
      'Work-based training: 6,000 hours.',
    ],
    words: ['pull wire', 'conduit', 'install fixtures and panels', 'test circuits', 'troubleshoot', 'Canadian Electrical Code', 'read drawings'],
    sources: [
      { label: 'NOC 2021: 72200', url: statcan('72200') },
      { label: 'SkilledTradesBC: Electrician, Construction', url: 'https://skilledtradesbc.ca/electrician-construction' },
      { label: 'SkilledTradesBC: Skilled Trades Certification', url: STC_URL },
    ],
  },
  {
    id: 'plumber',
    title: 'Plumber apprentice',
    noc: { code: '72300', title: 'Plumbers', url: statcan('72300') },
    duties: [
      'Read blueprints, drawings and specifications to lay out plumbing, water supply and drainage systems',
      'Install, repair and maintain plumbing fixtures and systems',
      'Locate and mark positions for pipe connections, passage holes and fixtures',
      'Measure, cut, bend and thread pipe using hand and power tools or machines',
      'Join pipe using couplings, clamps, screws, bolts, cement, soldering, brazing or welding',
      'Test pipes for leaks using air and water pressure gauges',
    ],
    requirements: [
      'Completion of secondary school is usually required.',
      'A four- to five-year apprenticeship, or over five years of work in the trade plus some courses, is usually needed to be eligible for certification.',
    ],
    bc: [
      'Plumber is a Red Seal trade in BC.',
      'Technical training: 30 weeks over 4 years.',
      'Work-based training: 6,300 hours.',
      'It is not one of the seven compulsory trades on the SkilledTradesBC Skilled Trades Certification list.',
    ],
    words: ['read blueprints', 'install fixtures', 'cut and thread pipe', 'soldering', 'pressure testing', 'hand and power tools'],
    sources: [
      { label: 'NOC 2021: 72300', url: statcan('72300') },
      { label: 'SkilledTradesBC: Plumber', url: 'https://skilledtradesbc.ca/plumber' },
      { label: 'SkilledTradesBC: Skilled Trades Certification', url: STC_URL },
    ],
  },
  {
    id: 'welder',
    title: 'Welder',
    noc: { code: '72106', title: 'Welders and related machine operators', url: statcan('72106') },
    duties: [
      'Read and interpret blueprints or welding process specifications',
      'Run manual or semi-automatic welding equipment using processes such as GTAW, GMAW, FCAW, SMAW and oxy-acetylene welding',
      'Welders may specialize in custom fabrication, ship building and repair, pressure vessels, pipeline, structural, or machinery and equipment repair welding',
    ],
    requirements: [
      'Completion of secondary school is usually required.',
      'A three-year apprenticeship, or over three years of work in the trade plus some courses, is usually needed to be eligible for certification.',
    ],
    bc: [
      'Welder is a Red Seal trade in BC.',
      'Technical training: 26 weeks over 3 years.',
      'Work-based training: 4,620 hours.',
      'It is not one of the seven compulsory trades on the SkilledTradesBC Skilled Trades Certification list.',
    ],
    words: ['read blueprints', 'GMAW (MIG)', 'GTAW (TIG)', 'SMAW (stick)', 'FCAW (flux core)', 'fabrication', 'oxy-acetylene'],
    sources: [
      { label: 'NOC 2021: 72106', url: statcan('72106') },
      { label: 'SkilledTradesBC: Welder', url: 'https://skilledtradesbc.ca/welder' },
      { label: 'SkilledTradesBC: Skilled Trades Certification', url: STC_URL },
    ],
  },
  {
    id: 'millwright',
    title: 'Millwright (industrial mechanic)',
    noc: { code: '72400', title: 'Construction millwrights and industrial mechanics', url: statcan('72400') },
    duties: [
      'Read blueprints, diagrams and schematic drawings to plan the work',
      'Install, align, take apart and move stationary machinery such as pumps, fans, tanks, conveyors, furnaces and generators',
      'Operate hoisting and lifting devices such as cranes and jacks to position machinery and parts',
      'Inspect machinery to find problems, then adjust it and repair or replace defective parts',
      'Install, troubleshoot and maintain power transmission, vacuum, hydraulic and pneumatic systems, and programmable logic controls',
      'Clean, lubricate and do other routine maintenance on machinery',
    ],
    requirements: [
      'Completion of secondary school and training courses or a vocational program is usually required.',
      'A three- to four-year apprenticeship, or over five years of work experience plus industry courses, is usually needed to be eligible for certification.',
    ],
    bc: [
      'Industrial Mechanic (Millwright) is a Red Seal trade in BC.',
      'Technical training: 28 weeks over 4 years.',
      'Work-based training: 6,360 hours.',
      'It is not one of the seven compulsory trades on the SkilledTradesBC Skilled Trades Certification list.',
    ],
    words: ['install and align machinery', 'preventive maintenance', 'hydraulics', 'pneumatics', 'pumps and conveyors', 'troubleshoot', 'rigging and hoisting'],
    sources: [
      { label: 'NOC 2021: 72400', url: statcan('72400') },
      { label: 'SkilledTradesBC: Industrial Mechanic (Millwright)', url: 'https://skilledtradesbc.ca/industrial-mechanic-millwright' },
      { label: 'SkilledTradesBC: Skilled Trades Certification', url: STC_URL },
    ],
  },
  {
    id: 'heo',
    title: 'Heavy equipment operator',
    noc: { code: '73400', title: 'Heavy equipment operators', url: statcan('73400') },
    duties: [
      'Operate backhoes, bulldozers, loaders and graders to dig, move, load and grade earth, rock and gravel',
      'Operate heavy paving and surfacing equipment to lay, spread or compact concrete and asphalt',
      'Operate heavy equipment to move, load and unload cargo',
      'Do pre-operational checks on equipment, and clean, lubricate and refill it',
    ],
    requirements: [
      'Some secondary school education is required.',
      'A one- to two-year apprenticeship, or some high school, college or industry courses with on-the-job training, is required.',
      'Some employers may require their own company certification.',
    ],
    bc: [
      'SkilledTradesBC offers a Heavy Equipment Operator program: technical training of 4 weeks over 1 year, leading to a Certificate of Qualification.',
      'Endorsements are earned for each machine: articulated haul truck, backhoe, dozer, excavator, grader and loader.',
      'The Road Builder and Heavy Construction Foundation course is a prerequisite for registering in the apprenticeship program.',
      'The national Red Seal Program lists three heavy equipment operator trades (Dozer, Excavator, and Tractor-Loader-Backhoe). Not every Red Seal trade is designated in every province, so check with SkilledTradesBC.',
    ],
    words: ['excavator', 'loader', 'dozer', 'backhoe', 'grader', 'pre-operational checks', 'grading'],
    sources: [
      { label: 'NOC 2021: 73400', url: statcan('73400') },
      { label: 'SkilledTradesBC: Heavy Equipment Operator', url: 'https://skilledtradesbc.ca/heavy-equipment-operator' },
      { label: 'SkilledTradesBC: Heavy Equipment Operator program profile, July 2026', url: 'https://skilledtradesbc.ca/media/2965/download' },
      { label: 'Red Seal Program brochure (list of Red Seal trades)', url: 'https://red-seal.ca/_conf/assets/custom/docms/rs2020_brochure_eng.pdf' },
    ],
  },
];

export const SOURCES = [
  { id: 'jobbank', label: 'Job Bank (Government of Canada): How to write a good resume', url: 'https://www.jobbank.gc.ca/findajob/resources/write-good-resume' },
  { id: 'greenhouse', label: 'Greenhouse Support: Unsuccessful resume parse', url: 'https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse' },
  { id: 'workday', label: 'Workday Developers: Resume REST API, resume guidelines for improved parsing results', url: 'https://developer.workday.com/documentation/GUID-f07adb7f-630e-42a2-9de9-a39652e34ec5-enHYPHENus/ResumeRESTAPI' },
  { id: 'lever', label: 'Lever Help Center: Understanding Resume Parsing', url: 'https://help.lever.co/hc/en-us/articles/20087345054749-Understanding-Resume-Parsing' },
  { id: 'taleo', label: 'Oracle Taleo Enterprise documentation: Candidate Management (resume parsing)', url: 'https://docs.oracle.com/en/cloud/saas/taleo-enterprise/21b/otrec/candidate-management.html' },
  { id: 'icbc', label: 'ICBC: Graduated licensing', url: 'https://www.icbc.com/driver-licensing/new-drivers/Graduated-licensing' },
  { id: 'icbc-air', label: 'ICBC: Air brake endorsements', url: 'https://icbc.com/driver-licensing/types-licences/Air-brake-endorsements' },
  { id: 'stc', label: 'SkilledTradesBC: Skilled Trades Certification (compulsory trades)', url: STC_URL },
  { id: 'hope', label: 'Indigenous Services Canada: Hope for Wellness Helpline', url: 'https://www.sac-isc.gc.ca/eng/1576089519527/1576089566478' },
];
