/* ============================================================================
   dimensions.js — window.MCDIM. The published size of a real thing.
   ----------------------------------------------------------------------------
   WHY THIS FILE EXISTS, AND WHY IT IS NOT A COSMETIC CONCERN.

   Every asset in engine/sitelib/ was drawn by a generator holding hand-chosen
   numbers, picked to look right in an isometric thumbnail. Measured through
   MCEXT — which is the SAME path MCCLASH.volOf() uses to build a clash volume
   — the catalogue said:

     40 ft shipping container   16.12 x 4.20 x 4.00 m   ISO 668: 12.192 x 2.438 x 2.591
     10 ft shipping container    7.12 x 4.20 x 4.00 m   ISO 668:  2.991 x 2.438 x 2.591
     scaffold run                6.09 x 3.90 x 9.10 m   deck 4.0 m front to back
     mini / midi / large excavator 12.92 / 13.39 / 14.55 m long
                                    reality  ~6.7 /  ~9.5 / ~11.2 m

   A container 72% too wide interferes with things a real one clears, and
   nothing throws. The three container length errors were +138%, +84% and +32%,
   so no single correction factor existed either — the geometry had to be
   rebuilt against real figures rather than stretched. And the size classes did
   not separate: a mini excavator and a 36-tonne machine differed by 12% in the
   model and by about 67% in life, so the model could not answer "will a mini
   fit down this access?", which is most of what a site logistics drawing is FOR.

   ============================================================================
   THE THREE THINGS AN ADVERSARIAL AUDIT OF THIS DATA FOUND
   ============================================================================

   A dimension table is not a list of numbers. Three fields below exist because
   without them the numbers are ambiguous in ways that render perfectly.

   1. `state` — TRANSPORT, WORKING or DEPLOYED. The same machine has more than
      one size and the difference is not small. A Liebherr LTM 1090-4.2 is
      2.55 m wide travelling and 7.30 m across its outriggers: a factor of
      2.86. Every road closure, ground-bearing check and lift plan turns on the
      deployed figure, and the travelling figure is the one everybody models. A
      row that does not declare its state is a row that will be confidently
      wrong for the job it is used on.

   2. `configuration` — WHICH OPTIONS. A Cat 336 GC is 3.19 m or 3.44 m wide
      depending only on shoe choice. A Liebherr 154 EC-H is offered in eight
      jib lengths from 25 to 60 m. Recording one number without recording which
      build it belongs to is recording a coincidence.

   3. `slew` — THE SWEPT CIRCLE, WHICH IS NOT THE BOX. This is the important
      one. A slewing machine's real envelope is a cylinder, and an
      axis-aligned box always understates it. A Liebherr LR 1300 SX has a
      6.98 m tail swing, so it sweeps a 13.96 m circle — against a box of
      11.52 x 8.00 m. The box is 17% short in length and 43% SHORT IN WIDTH.
      Clearance is checked against the circle, never the box, and a box-only
      clash volume is wrong in the direction that says "it clears" — which is
      the dangerous direction. So a slewing asset carries `slew` beside its
      box, and `sweptEnvelope()` states what the box misses.

   ============================================================================
   RULES
   ============================================================================

   · EVERY row states its source and a URL. `add()` refuses anything unsourced —
     there is no such thing as a dimension we just know. REFUSED must stay empty.

   · `confidence` is 'published' | 'derived' | 'typical' | 'uncertain'.
     'published' means it was read off a spec sheet or a standard. 'derived'
     means computed from other published figures. 'typical' means the real
     thing varies and this is representative. An 'uncertain' row is NOT SHIPPED
     — see REJECTED below, which is the honest place for a figure that failed
     its own cross-check.

   · TOLERANCE IS PER ROW. ISO 668 fixes container lengths exactly, so those are
     held to 2%. A scaffold bay is a module with a published range, so its row
     declares the range and the gate asserts containment rather than equality.

   · A SPEC IS NOT A LICENCE TO FAKE A MODEL. Naming a row after a specific
     machine means the geometry is built to that machine's published figures.
     The catalogue used to carry a dozen 'world record' machines that were the
     same recoloured generic body with identical extents; an object claiming to
     be a named machine while being five times too small is a worse lie than an
     unnamed one. Those rows are now in THE RECORD MACHINES block below, each
     built to its own spec sheet — and the four that could not be sourced to
     that standard are in REJECTED, with core3.js naming them by machine class
     instead. tools/cases/asset_scale.js makes that a wall: an entry in the
     'World-record machines' category with no row here fails the build.

   ============================================================================ */
window.MCDIM = (function () {
  'use strict';

  var SPECS = Object.create(null);
  var REFUSED = [];
  var REJECTED = [];        /* rows deliberately NOT shipped, and why */

  var STATES = { transport: 1, working: 1, deployed: 1, static: 1 };

  function add(id, o) {
    if (!o || !o.source || !o.sourceUrl) { REFUSED.push(id + ': no source recorded'); return; }
    if (!(o.L > 0 && o.W > 0 && o.H > 0)) { REFUSED.push(id + ': incomplete overall dimensions'); return; }
    if (o.state && !STATES[o.state]) { REFUSED.push(id + ': unknown state "' + o.state + '"'); return; }
    SPECS[id] = {
      id: id, name: o.name || id,
      source: o.source, sourceUrl: o.sourceUrl,
      L: o.L, W: o.W, H: o.H,
      state: o.state || 'static',
      configuration: o.configuration || null,
      slew: o.slew || null,
      /* opt in to mc-extents.js's DERIVED FIT: the generator draws a
         recognisably correct machine at the wrong size, so the measured
         bounds are scaled onto these published ones rather than the shape
         being rebuilt by hand. Never set this where the TOPOLOGY is wrong —
         no scaling turns a 12 m jib into a 60 m one. */
      fit: !!o.fit,
      /* WHICH AXES CAN BE CHECKED. Default all three. A row states fewer when
         an axis genuinely has no published figure — a mobile crane set up on
         its outriggers has a published PLAN footprint (the outrigger spread is
         what the ground-bearing check and the road closure turn on) but its
         HEIGHT is a boom angle and an extension, i.e. a configuration rather
         than a dimension. Asserting a height there would mean inventing one,
         and `check()` says which axes it actually checked rather than implying
         it checked all of them. */
      checkAxes: o.checkAxes || ['L', 'W', 'H'],
      range: o.range || null,
      extras: o.extras || {},
      confidence: o.confidence || 'published',
      tol: o.tol != null ? o.tol : (o.confidence === 'typical' ? 0.15 : 0.02),
      note: o.note || ''
    };
  }

  /* A row that failed its own cross-check is recorded HERE rather than shipped
     with a caveat nobody reads. Naming what we refused is the honest half of
     naming what we carry. */
  function reject(id, why) { REJECTED.push({ id: id, why: why }); }

  /* ==================================================================== */
  /* ISO 668 — INTERMODAL FREIGHT CONTAINERS                              */
  /* DEFINED values, not measurements: 2438 mm = 8 ft and 12192 mm = 40 ft */
  /* exactly, which is the whole reason a container fits a ship, a chassis */
  /* and a crane spreader anywhere on Earth. Highest-traffic row here — a  */
  /* site uses them as stores, offices, welfare and canteen units.         */
  /* ==================================================================== */
  var ISO668 = 'ISO 668:2020, Series 1 freight containers — classification, dimensions and ratings';
  var ISO668URL = 'https://www.iso.org/standard/76912.html';

  add('container-10ft', { name: '10 ft ISO container (1DD)', source: ISO668, sourceUrl: ISO668URL,
    L: 2.991, W: 2.438, H: 2.591, state: 'static',
    extras: { height1D: 2.438 },
    note: '1DD, the 8 ft 6 in height a site store is actually built to. ISO 668 also ' +
          'defines 1D at 2438 mm; the taller one is what turns up. 2991 mm is exact — ' +
          '10 ft less the coupling allowance, so four 10 ft units occupy a 40 ft slot ' +
          'including the gaps.' });
  add('container-20ft', { name: '20 ft ISO container (1CC)', source: ISO668, sourceUrl: ISO668URL,
    L: 6.058, W: 2.438, H: 2.591, state: 'static',
    extras: { minInternalHeight: 2.261, height8ftType1C: 2.438 },
    note: '1CC. 6058 mm, not 6096 (= 20 ft): the 38 mm is the coupling gap that lets ' +
          'two 20 ft units sit in a 40 ft cell.' });
  add('container-40ft', { name: '40 ft ISO container (1AA)', source: ISO668, sourceUrl: ISO668URL,
    L: 12.192, W: 2.438, H: 2.591, state: 'static',
    extras: { minInternalLength: 11.998, minInternalHeight: 2.261 },
    note: '1AA. 12192 mm = 40 ft exactly, with no coupling deduction — the 40 ft cell ' +
          'is the reference length the whole series is built around.' });
  add('container-40ft-hc', { name: '40 ft high-cube ISO container (1AAA)', source: ISO668, sourceUrl: ISO668URL,
    L: 12.192, W: 2.438, H: 2.896, state: 'static',
    note: '1AAA. Identical in plan to a 1AA and 305 mm (1 ft) taller. That extra foot ' +
          'is the one that clashes with a soffit or a gate head.' });

  /* ==================================================================== */
  /* EARTHMOVING                                                           */
  /* Sizes here are TRANSPORT envelopes unless stated, because that is what */
  /* a spec sheet publishes and what a low-loader and a site gate care      */
  /* about. The swept circle is carried separately.                        */
  /* ==================================================================== */
  var CAT = 'https://www.cat.com/en_US/products/new/equipment.html';

  add('excavator-mini-8t', {
    name: 'Mini excavator, 8 t class', source: 'Caterpillar 308 CR technical specifications',
    sourceUrl: CAT, L: 6.706, W: 2.300, H: 2.541, state: 'transport',
    configuration: 'standard boom, standard shoes',
    slew: { tailSwing: 1.585, kind: 'compact-radius', bodySlews: true, clearance: 0.620 },
    extras: { trackGauge: 1.850, trackShoeWidth: 0.450, maxDigDepth: 4.510,
              counterweightClearance: 0.620 },
    note: 'A compact-radius machine: the tail barely oversails the tracks, which is ' +
          'the entire reason it is specified in a confined access.' });

  add('excavator-20t', {
    name: 'Crawler excavator, 20 t class', source: 'Caterpillar 320 / 320 GC technical specifications',
    sourceUrl: CAT, L: 9.530, W: 3.170, H: 2.960, state: 'transport',
    configuration: 'boom + stick + bucket, 790 mm shoes',
    slew: { tailSwing: 2.830, kind: 'conventional', bodySlews: true, sweptRadius: 9.860, clearance: 1.050 },
    extras: { trackGauge: 2.380, trackShoeWidth: 0.790, trackLength: 4.450,
              maxReachAtGroundLevel: 9.860, maxDiggingDepth: 6.720, groundClearance: 0.470,
              counterweightClearance: 1.050 },
    note: 'THE default machine on most sites. 2.83 m tail swing against a 3.17 m track ' +
          'width is the classic pinch-point and the most-drawn exclusion zone in ' +
          'construction.' });

  add('excavator-36t', {
    name: 'Crawler excavator, 36 t class', source: 'Caterpillar 336 GC technical specifications',
    sourceUrl: CAT, L: 11.200, W: 3.440, H: 3.670, state: 'transport',
    configuration: '850 mm shoes (3.19 m on 600 mm shoes)',
    slew: { tailSwing: 3.530, kind: 'conventional', bodySlews: true, sweptRadius: 11.760, clearance: 1.250 },
    extras: { trackGauge: 2.590, trackShoeWidth: 0.850, trackLength: 5.030,
              undercarriageWidth600mmShoes: 3.190, cabHeight: 3.170,
              maxDigDepth: 8.230, maxReachAtGroundLine: 11.760,
              counterweightClearance: 1.250 },
    note: 'Width is SHOE-DEPENDENT: 3.44 m on 850 mm shoes, 3.19 m on 600 mm. A row ' +
          'that did not say which would be quietly wrong by 250 mm on every access check.' });

  add('excavator-long-reach', {
    name: 'Long-reach excavator', source: 'Caterpillar long-reach front specifications',
    sourceUrl: CAT, L: 12.750, W: 3.170, H: 3.190, state: 'transport',
    slew: { tailSwing: 2.830, kind: 'conventional', bodySlews: true, sweptRadius: 15.570, clearance: 1.050 },
    extras: { boomLength: 8.850, stickLength: 6.280, maxReachAtGroundLine: 15.570 },
    note: 'The reach, not the body, is what a long-reach is for: 15.57 m at ground line.' });

  add('dozer-d6', {
    name: 'Crawler dozer, D6 class', source: 'Caterpillar D6 technical specifications',
    sourceUrl: CAT, L: 5.436, W: 3.312, H: 3.172, fit: true, state: 'working',
    configuration: 'straight blade fitted',
    extras: { lengthWithoutBlade: 4.730, trackGauge: 1.930, trackShoeWidth: 0.610 },
    note: 'Length INCLUDES the blade, which is how it is transported and how it sits ' +
          'on a plan. Without the blade it is 4.73 m.' });

  add('wheel-loader-966', {
    name: 'Wheel loader, 966 class', source: 'Caterpillar 966 GC technical specifications',
    sourceUrl: CAT, L: 8.937, W: 3.220, H: 3.582, fit: true, state: 'working',
    configuration: 'general-purpose bucket, level on ground',
    extras: { overallLengthWithoutBucket: 7.500, bucketWidth: 3.220, clearanceCircle: 13.350 },
    note: 'The 13.35 m figure is a clearance CIRCLE, not a radius. Halving it, or not, ' +
          'is a 6.7 m error in the space reserved for it to turn.' });

  add('adt-745', {
    name: 'Articulated dump truck, 45 t', source: 'Caterpillar 745 technical specifications',
    sourceUrl: CAT, L: 11.432, W: 3.801, H: 3.762, fit: true, state: 'transport',
    configuration: 'body down',
    extras: { overallLengthWithTailgate: 11.559, bodyUpHeight: 7.288,
              axleFrontToHitch: 3.418, axleHitchToRear1: 4.590, axleRear1ToRear2: 1.966, rearOverhang: 1.458 },
    note: 'Body DOWN is 3.762 m; body UP is 7.288 m, and the tipping height is what ' +
          'clears an overhead service or does not.' });

  add('backhoe-loader-3cx', {
    name: 'Backhoe loader, 3CX class', source: 'JCB 3CX technical specifications',
    sourceUrl: 'https://www.jcb.com/en-gb/products/backhoe-loaders/3cx',
    L: 7.190, W: 2.450, H: 3.430, fit: true, state: 'transport',
    extras: { stabiliserSpreadWorking: 3.300, transportHeight: 3.430 },
    note: 'Transport width 2.45 m becomes 3.30 m on stabilisers — a road-space decision ' +
          'on every utilities job.' });

  add('motor-grader-140', {
    name: 'Motor grader, 140 class', source: 'Caterpillar 140 technical specifications',
    sourceUrl: CAT, L: 10.100, W: 2.480, H: 3.780, fit: true, state: 'transport',
    extras: { bladeWidth: 3.700 },
    note: 'Narrow over tyres, wide across the moldboard — 2.48 m against 3.70 m.' });

  add('roller-single-drum', {
    name: 'Single-drum vibratory roller', source: 'Caterpillar CS11 technical specifications',
    sourceUrl: CAT, L: 5.700, W: 2.300, H: 3.000, fit: true, state: 'working' });
  add('roller-tandem', {
    name: 'Tandem vibratory roller', source: 'Caterpillar CB10 technical specifications',
    sourceUrl: CAT, L: 4.565, W: 1.872, H: 2.982, fit: true, state: 'working' });
  add('skid-steer', {
    name: 'Skid-steer loader', source: 'Bobcat S76 specifications',
    sourceUrl: 'https://www.bobcat.com/emea/loaders/skid-steer-loaders/s76',
    L: 3.607, W: 1.880, H: 2.079, fit: true, state: 'working', configuration: 'standard bucket' });

  /* ==================================================================== */
  /* LIFTING — where the swept circle matters most                        */
  /*                                                                       */
  /* L/W/H for a tower crane is the MAST AND HOOK HEIGHT, not the jib.     */
  /* The jib is a radius and lives in `slew`. Putting a 60 m radius into   */
  /* an L would render a 60 m long slab, which is not a lossy model of a   */
  /* slewing machine — it is a wrong one.                                  */
  /* ==================================================================== */
  add('tower-crane-saddle-jib', {
    name: 'Saddle-jib tower crane, 150 tm class',
    source: 'Liebherr 154 EC-H 6 Litronic technical data',
    sourceUrl: 'https://www.liebherr.com/en-gb/products/construction-machines/tower-cranes/tower-cranes.html',
    L: 1.800, W: 1.800, H: 65.200, state: 'deployed',
    configuration: '60 m jib (eight lengths offered, 25-60 m), free-standing hook height 65.2 m',
    slew: { radius: 61.400, counterRadius: 14.700, kind: 'slewing', bodySlews: true,
            sweptRadius: 61.400, baseFootprint: 6.000, mastSquare: 1.800 },
    extras: { maxJibRadius: 60.000, maxJibTipRadius: 61.400, minJibRadius: 25.000,
              counterJibLength: 13.700, tailSwingRadius: 14.700,
              maxCapacityTonnes: 6, radiusAtMaxCapacity: 25.700, designationTonneMetres: 154 },
    note: 'THE swept circle is a statutory drawing — a crane oversailing a boundary is ' +
          'trespass, and the circle swept by the jib end is what a highways or ' +
          'planning submission asks for. Note the counter side sweeps 14.7 m, not the ' +
          '13.7 m of jib steel: the counterweight hangs a metre beyond it. Load-moment ' +
          'check: 6 t x 25.7 m = 154, which is the designation.' });

  add('tower-crane-self-erecting', {
    name: 'Self-erecting tower crane', source: 'Potain Igo T 85 A technical data',
    sourceUrl: 'https://www.manitowoc.com/potain',
    L: 4.500, W: 4.500, H: 38.000, state: 'deployed',
    configuration: '45 m jib, ballast base',
    slew: { radius: 45.000, counterRadius: 3.000, kind: 'slewing', bodySlews: true,
            sweptRadius: 45.000, baseFootprint: 4.500 },
    extras: { maxRadius: 45.000, tailSlewingRadiusMin: 3.000 },
    note: 'The small-site alternative to a saddle jib. L/W is the 4.5 m ballast base, ' +
          'which IS the siting decision.' });

  add('crawler-crane', {
    name: 'Lattice crawler crane, 300 t', source: 'Liebherr LR 1300 SX technical data, doc 10539843',
    sourceUrl: 'https://www.liebherr.com/en-gb/products/construction-machines/crawler-cranes/crawler-cranes.html',
    L: 11.520, W: 8.000, H: 5.000, state: 'deployed',
    configuration: '1200 mm track pads (8.3 m on 1500 mm pads); transport width 3.0 m',
    slew: { radius: 9.750, counterRadius: 6.980, kind: 'slewing', bodySlews: true, sweptRadius: 9.750 },
    extras: { trackLength: 8.500, trackPadWidthStandard: 1.200, tailSwingRadius: 6.980,
              aFrameSwingRadius: 9.750, mainBoomMax: 92.000, maxRadius: 143.000,
              transportWidth: 3.000 },
    note: 'The clearest case for the swept circle: a 6.98 m tail swing is a 13.96 m ' +
          'circle against a box of 11.52 x 8.00 m. The box is 43% short in width.' });

  add('mobile-crane-at', {
    name: 'All-terrain mobile crane, 90 t', source: 'Liebherr LTM 1090-4.2 technical data, drawing S3087.02',
    sourceUrl: 'https://www.liebherr.com/en-gb/products/construction-machines/mobile-and-crawler-cranes/mobile-and-crawler-cranes.html',
    L: 13.390, W: 2.550, H: 4.000, state: 'transport',
    configuration: 'travelling; outriggers retracted',
    slew: { radius: 7.474, counterRadius: 7.474, kind: 'slewing', bodySlews: false,
            deployedWidth: 7.300, deployedLength: 7.474 },
    extras: { outriggerSpreadTransverseMax: 7.300, outriggerSpreadTransverseMin: 2.320,
              outriggerSpreadLongitudinalFront: 7.446, outriggerSpreadLongitudinalRear: 7.474,
              outriggerPadSquare: 0.500, boomRetracted: 11.400, boomExtended: 60.000 },
    note: '2.55 m travelling, 7.30 m across the outriggers — a factor of 2.86. Every ' +
          'road closure, ground-bearing check and lift plan turns on the deployed ' +
          'figure, and the travelling figure is the one everybody models.' });

  add('mobile-crane-at-deployed', {
    name: 'All-terrain mobile crane, 90 t — SET UP ON OUTRIGGERS',
    source: 'Liebherr LTM 1090-4.2 technical data, drawing S3087.02',
    sourceUrl: 'https://www.liebherr.com/en-gb/products/construction-machines/mobile-and-crawler-cranes/mobile-and-crawler-cranes.html',
    L: 13.390, W: 7.300, H: 4.000, state: 'deployed',
    configuration: 'outriggers fully extended, 7.30 m transverse x 7.474 m longitudinal',
    checkAxes: ['L', 'W'],
    slew: { radius: 7.474, counterRadius: 7.474, kind: 'slewing', bodySlews: false,
            deployedWidth: 7.300, deployedLength: 7.474 },
    extras: { outriggerSpreadTransverseMax: 7.300, outriggerSpreadLongitudinalRear: 7.474,
              outriggerPadSquare: 0.500, carrierWidthTravelling: 2.550 },
    note: 'The SAME machine as `mobile-crane-at` and a different object on a site ' +
          'plan: 2.55 m wide travelling, 7.30 m across the outriggers, a factor of ' +
          '2.86. Every road closure, ground-bearing check and lift plan turns on the ' +
          'deployed figure and the travelling figure is the one everybody models. ' +
          'HEIGHT IS NOT CHECKED because the height of a set-up crane is a boom angle ' +
          'and ' +
          'an extension — a configuration, not a dimension — and inventing one to ' +
          'complete the row would be exactly the kind of confident wrong number this ' +
          'table exists to remove.' });

  add('telehandler', {
    name: 'Telescopic handler, 17 m', source: 'JCB 540-170 technical specifications',
    sourceUrl: 'https://www.jcb.com/en-gb/products/telescopic-handlers',
    L: 6.360, W: 2.440, H: 2.690, fit: true, state: 'transport',
    configuration: 'travelling; 3.51 m on stabilisers',
    extras: { maxLiftHeight: 16.700, maxForwardReach: 12.500, stabiliserWidth: 3.510,
              wheelbase: 2.750, frontOverhang: 1.940, rearOverhang: 1.670 },
    note: 'Axle chain closes exactly: 1.940 + 2.750 + 1.670 = 6.360 = L.' });

  add('scissor-lift', {
    name: 'Scissor lift, 32 ft', source: 'Genie GS-3246 specifications',
    sourceUrl: 'https://www.genielift.com/en/aerial-work-platforms/slab-scissor-lifts/gs-3246',
    L: 2.440, W: 1.160, H: 2.430, fit: true, state: 'transport',
    extras: { platformHeightMaxIndoor: 9.780, workingHeightIndoor: 11.780,
              platformHeightMaxOutdoor: 6.710, workingHeightOutdoor: 8.710 },
    note: 'Stowed 2.44 x 1.16 m decides whether it gets through the door and into the ' +
          'lift, which is the only question anybody asks about a scissor lift.' });

  add('boom-lift', {
    name: 'Articulating boom lift, 45 ft', source: 'Genie Z-45/25J specifications',
    sourceUrl: 'https://www.genielift.com/en/aerial-work-platforms/articulating-boom-lifts',
    L: 6.830, W: 1.790, H: 2.000, fit: true, fit: true, state: 'transport',
    slew: { radius: 1.790, counterRadius: 0.000, kind: 'slewing', bodySlews: false, deployedWidth: 1.790 },
    extras: { platformHeightMax: 13.940, workingHeightMax: 15.940, horizontalReachMax: 7.650 },
    note: 'Zero tailswing, so the footprint barely matters; the 7.65 m outreach is the ' +
          'whole decision.' });

  add('construction-hoist', {
    name: 'Rack-and-pinion construction hoist', source: 'Alimak Scando 650 product data',
    sourceUrl: 'https://alimak.com/products/construction-hoists/',
    L: 3.900, W: 1.500, H: 2.300, fit: true, state: 'deployed',
    configuration: 'single car; mast repeats to 250 m',
    extras: { mastSectionSquare: 0.650, mastSectionLength: 1.508, carWidth: 1.500, carLength: 3.900 },
    note: 'The car is the published figure; the GROUND RESERVATION is larger and is not ' +
          'published, so the base enclosure is not stated here rather than guessed.' });

  add('concrete-boom-pump', {
    name: 'Truck-mounted concrete boom pump, 42 m', source: 'Putzmeister M42-5 technical data',
    sourceUrl: 'https://www.putzmeister.com/en/concrete-pumps',
    L: 11.350, W: 2.550, H: 4.000, state: 'transport',
    slew: { radius: 8.300, counterRadius: 7.500, kind: 'slewing', bodySlews: false,
            deployedWidth: 8.300, deployedLength: 8.300 },
    extras: { verticalReach: 41.600, grossHorizontalReach: 37.300, netHorizontalReach: 34.500,
              outriggerFront: 7.500, outriggerRear: 8.300, unfoldingHeight: 8.600 },
    note: 'One object that simultaneously sets a position, an exclusion zone and an ' +
          'overhead-services clearance. The 8.6 m unfolding height is the one that ' +
          'catches an 11 kV line.' });

  /* ==================================================================== */
  /* SITE ESTABLISHMENT AND TEMPORARY WORKS                               */
  /* ==================================================================== */
  add('scaffold-bay', {
    name: 'Scaffold run — two bays x four lifts, EN 12811 modules',
    source: 'EN 12811-1 temporary works equipment (working scaffolds); EN 39 scaffold tube',
    sourceUrl: 'https://www.hse.gov.uk/construction/safetytopics/scaffoldinginfo.htm',
    L: 5.150, W: 1.200, H: 9.000, state: 'static',
    range: { L: [3.750, 6.150], W: [0.600, 1.500], H: [8.000, 9.600] },
    extras: { bayLength: 2.500, liftHeight: 2.000, deckWidth: 1.200,
              tubeDiameter: 0.0483, boardWidth: 0.225, boardThickness: 0.038,
              guardrailHeight: 0.950, toeBoardHeight: 0.150 },
    confidence: 'derived', tol: 0.03,
    note: 'The asset draws a TWO-BAY, FOUR-LIFT run, so that is what this row ' +
          'describes. L = 2 x 2.5 m bay + a 150 mm base plate; W is a five-board deck; ' +
          'H = 4 lifts x 2.0 m plus the 0.95 m guardrail. Tube OD 48.3 mm is exact ' +
          '(EN 39) and is drawn as a LINE WEIGHT, not a solid — at 12 px/m it is ' +
          '0.58 px across, and reaching for a fatter solid to make it visible is ' +
          'exactly what produced the 300 mm standards this replaced.' });

  add('fence-panel', {
    name: 'Temporary mesh fence panel (Heras type)',
    source: 'Heras temporary fencing panel, common UK-EU module',
    sourceUrl: 'https://www.heras.co.uk/products/temporary-fencing/',
    L: 3.500, W: 0.195, H: 2.000, fit: true, state: 'static',
    range: { L: [3.400, 3.500], H: [1.800, 2.100] },
    extras: { footLength: 0.770, footWidth: 0.195, footHeight: 0.122 },
    confidence: 'typical',
    note: 'Defines the boundary every other object is placed against, and the 3.5 m ' +
          'module sets gate and sign positions. The panel is essentially PLANAR — its ' +
          'depth is the foot block, and a fence line must not carry a metre-deep clash ' +
          'volume along the whole site perimeter.' });

  add('jersey-barrier', {
    name: 'Concrete Jersey barrier (F-shape)',
    source: 'Standard precast temporary vertical concrete barrier, 10 ft unit',
    sourceUrl: 'https://highways.dot.gov/safety/roadway-departure/barriers',
    L: 3.048, W: 0.610, H: 0.813, fit: true, state: 'static',
    range: { L: [2.000, 6.000], W: [0.560, 0.700], H: [0.810, 1.070] },
    extras: { topWidth: 0.178, toeHeight: 0.076 },
    confidence: 'typical',
    note: 'A CDM 2015 regulation 27 traffic-management deliverable, not decoration.' });

  add('traffic-cone-750', {
    name: 'Traffic cone, 750 mm', source: 'BS EN 13422 / UK Chapter 8 Traffic Signs Manual',
    sourceUrl: 'https://www.gov.uk/government/publications/traffic-signs-manual',
    L: 0.430, W: 0.430, H: 0.750, fit: true, state: 'static',
    extras: { heightMin450: 0.450, height1000: 1.000 }, confidence: 'typical' });

  add('road-plate', {
    name: 'Steel road plate', source: 'Standard steel trench cover, 5 x 10 ft',
    sourceUrl: 'https://www.gov.uk/government/publications/safety-at-street-works-and-road-works',
    L: 3.048, W: 1.524, H: 0.025, fit: true, state: 'static',
    extras: { width6ft: 1.829, width8ft: 2.438 }, confidence: 'typical' });

  add('trackway-mat', {
    name: 'Temporary roadway mat', source: 'Composite trackway panel, standard 3.0 x 2.5 m',
    sourceUrl: 'https://www.groundguards.co.uk/', L: 3.000, W: 2.500, H: 0.038,
    fit: true, state: 'static', confidence: 'typical',
    note: 'Sets the haul route width, and therefore whether anything fits beside it.' });

  add('pallet-euro', { name: 'Euro pallet (EUR/EPAL)', source: 'EN 13698-1 / ISO 6780 size 4',
    sourceUrl: 'https://www.iso.org/standard/38266.html', L: 1.200, W: 0.800, H: 0.144, state: 'static' });

  add('portable-toilet', { name: 'Portable toilet unit', source: 'PolyJohn PJN3 product data',
    sourceUrl: 'https://polyjohn.com/', L: 1.194, W: 1.105, H: 2.311, fit: true, state: 'static' });

  add('welfare-unit-mobile', { name: 'Mobile welfare unit, 12 ft',
    source: 'Standard towable mobile welfare unit', sourceUrl: 'https://www.boels.com/',
    L: 3.615, W: 2.420, H: 2.700, fit: true, state: 'transport', confidence: 'typical' });

  add('concrete-mixer-truck', {
    name: 'Concrete truck mixer, 8 m3', source: 'Standard 8 m3 truck mixer on an 8x4 chassis',
    sourceUrl: 'https://www.mineralproducts.org/', L: 9.760, W: 2.542, H: 3.750,
    fit: true, state: 'transport', confidence: 'derived',
    extras: { widthIncludingMirrors: 3.101, chuteReach: 2.750 },
    note: 'The highest-frequency vehicle movement on most jobs — it drives gate width, ' +
          'standing area and pour sequencing. The TURNING CIRCLE, which decides the ' +
          'gate and the standing area, is not published consistently and is therefore ' +
          'not stated here rather than invented.' });

  /* ==================================================================== */
  /* HUMAN AND VEHICLE SCALE — the yardsticks everything is judged against */
  /* ==================================================================== */
  add('person-standing', {
    name: 'Standing adult', source: "Neufert, Architects' Data — standard adult reference figure",
    sourceUrl: 'https://www.wiley.com/en-gb/Architects+Data%2C+5th+Edition-p-9781119284352',
    L: 0.400, W: 0.485, H: 1.750, fit: true, state: 'static',
    range: { H: [1.600, 1.900] }, confidence: 'typical',
    extras: { statureMale50: 1.745, statureFemale50: 1.620, shoulderBreadth: 0.485 },
    note: 'If a site model reads as a toy, this is the object to check first.' });

  add('car-passenger', { name: 'Passenger car (C-segment)', source: 'Ford Focus / VW Golf class mean',
    sourceUrl: 'https://www.euroncap.com/', L: 4.284, W: 1.789, H: 1.456, fit: true, state: 'static',
    confidence: 'typical' });

  add('parking-bay-uk', { name: 'Standard parking bay (UK)', source: 'UK standard perpendicular bay, 2.4 x 4.8 m',
    sourceUrl: 'https://www.gov.uk/government/publications/manual-for-streets',
    L: 4.800, W: 2.400, H: 2.490, state: 'static', confidence: 'typical' });

  add('lorry-artic-eu', {
    name: 'Articulated lorry (EU maximum)', source: 'EU Directive 96/53/EC maximum dimensions',
    sourceUrl: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A31996L0053',
    L: 16.500, W: 2.550, H: 4.000, fit: true, state: 'transport',
    extras: { roadTrainMaxLength: 18.750 },
    note: 'A legal MAXIMUM, not a measurement — which is why it is exact and why every ' +
          'gate, turning head and haul route is designed to it.' });

  add('site-sign-post', {
    name: 'Post-mounted site safety sign, 600 x 450 mm',
    source: 'UK construction site sign standard size; mounting height from the Traffic Signs Manual',
    sourceUrl: 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/771873/traffic-signs-manual-chapter-1.pdf',
    L: 0.600, W: 0.076, H: 1.650, state: 'static',
    configuration: 'face 600 x 450 mm, lower edge at 1.200 m on a verge',
    checkAxes: ['L', 'H'],
    extras: { faceWidth: 0.600, faceHeight: 0.450, lowerEdge: 1.200,
              minHeadroomOverFootway: 2.100, warningSignLowerEdgeMin: 0.900,
              warningSignLowerEdgeMax: 1.500 },
    note: 'DEPTH IS NOT CHECKED: a sign face is a few millimetres of composite on a ' +
          'post, and the drawn depth is whatever reads as a board from the side — a ' +
          'drawing artefact, not a published figure. The two that are published are ' +
          'the face and the mounting height, and both are checked. 1.200 m is the ' +
          'verge figure; a warning sign sits between 0.900 and 1.500 m to its lower ' +
          'edge, and 2.100 m is the absolute minimum headroom where a sign is over a ' +
          'footway — that last one is the case where a sign legitimately IS high, and ' +
          'it is 2.1 m, not 4. Ninety-four entries drew a 3.20 x 3.00 m board with its ' +
          'underside at 4.00 m and its top at 7.00 m: four times the height of the ' +
          'human figure standing next to it.' });

  add('rigid-hgv', {
    name: 'Rigid HGV cross-section (8-wheel tipper reference)',
    source: 'Tillicoultry Quarries published vehicle dimensions, 8-wheel 32 t tipper',
    sourceUrl: 'https://tillicoultryquarries.com/vehicle-dimensions/',
    L: 9.600, W: 2.500, H: 3.100, fit: true, state: 'transport',
    configuration: 'body down, unladen; 3.00 m over mirrors',
    checkAxes: ['W', 'H'],
    extras: { widthOverMirrors: 3.000, tippingHeight: 9.500, grossWeight: 32,
              legalMaxWidth: 2.550, legalMaxHeightUK: 4.000 },
    note: 'THE CROSS-SECTION IS THE FIXED PART AND THE LENGTH IS NOT, which is why ' +
          'only W and H are checked: a tipper, a flatbed, a fuel truck, a water truck ' +
          'and a sweeper are all this wide and this tall and are all different lengths. ' +
          'Drawn before this: 4.40-4.52 m wide against a LEGAL MAXIMUM of 2.55 m — up ' +
          'to 77% over a figure that is not an opinion, it is EU Directive 96/53/EC — ' +
          'and up to 6.48 m tall against a UK limit of 4.00 m. A lorry that could not ' +
          'legally be driven to the site is a poor thing to plan the gate around. ' +
          'The mirrors figure is kept because 3.00 m is what a gate has to pass, and ' +
          'the body figure is what a bay has to hold.' });

  add('bowser-site-tow-2000l', {
    name: 'Towable site bowser, 2000 litre',
    source: 'Tungsten 2000 litre site-tow water bowser published dimensions',
    sourceUrl: 'https://www.tanks-uk.com/product/2000-litre-site-towable-water-bowser-tungsten/',
    L: 3.600, W: 2.050, H: 1.650, fit: true, state: 'static',
    configuration: 'SITE tow, flotation tyres; the HIGHWAY tow variant is 3.80 x 1.80 x 1.475 m',
    confidence: 'typical',
    extras: { capacityLitres: 2000, highwayTowLength: 3.800, highwayTowWidth: 1.800,
              highwayTowHeight: 1.475 },
    note: 'The two variants differ in the direction you would expect and it is worth ' +
          'keeping both: the SITE tow is shorter, wider and taller because it rides on ' +
          'flotation tyres for rough ground, and the HIGHWAY tow is narrower because it ' +
          'has to be. The catalogue draws one sitting on site, so the site figures are ' +
          'the row. Water and fuel bowsers share it — they share a trailer and differ ' +
          'by colour — which is why this is `typical` rather than published. Drawn ' +
          'before: 7.40 x 3.30 x 3.88 m, roughly twice a real one in every direction.' });

  add('panel-van-transit', {
    name: 'Panel van / minibus, long-wheelbase medium-roof',
    source: 'Ford Transit L3H2 published dimensions',
    sourceUrl: 'https://vanreviewer.co.uk/ford/transit/dimensions/1801/',
    L: 5.531, W: 2.474, H: 2.570, fit: true, state: 'transport',
    configuration: 'W is over mirrors; the body alone is about 2.06 m',
    confidence: 'typical',
    extras: { widthOverMirrors: 2.474 },
    note: 'WIDTH IS OVER THE MIRRORS on purpose — that is the envelope a gate and a ' +
          'parking bay have to pass, and it is the figure the source states. The van ' +
          'and the minibus share this row because they share a body. Marked `typical` ' +
          'because L3/H2 cover a range of model years rather than one drawing. Drawn ' +
          'before this: 3.90 m wide, which is a metre and a half over the legal ' +
          'maximum for anything on a road.' });

  add('pickup-double-cab', {
    name: 'Double-cab pickup', source: 'Ford Ranger double cab published dimensions',
    sourceUrl: 'https://vanreviewer.co.uk/ford/ranger/dimensions/9929/',
    L: 5.370, W: 1.918, H: 1.884, fit: true, state: 'transport',
    configuration: 'width excluding mirrors, height unladen',
    extras: { previousGenerationWidth: 1.860 },
    note: 'The commonest vehicle on a UK site and it was drawn 3.70 m wide — wider ' +
          'than the 32 t tipper it parks next to.' });

  add('site-cabin-jackleg', {
    name: 'Jackleg / anti-vandal site cabin, 20 ft x 10 ft',
    source: 'Portable Space 20 ft x 10 ft jackleg office cabin, external dimensions',
    sourceUrl: 'https://www.portablespace.co.uk/product/20ftx10ft-jackleg-cabin',
    L: 6.100, W: 3.050, H: 2.750, state: 'static',
    configuration: '3.05 m wide excluding jacks, 3.18 m including them',
    checkAxes: ['W'],
    extras: { widthOverJacks: 3.180, jackSection: 0.060, basePlate: 0.180 },
    note: 'WIDTH IS THE ONLY AXIS CHECKED, and both exclusions are deliberate. ' +
          'LENGTH is the model — 20, 24, 32 and 40 ft cabins share this section and ' +
          'differ only in length, so the catalogue passes its own `len` and a fit onto ' +
          'one published L would shrink a 12 m canteen to 6.1 m. HEIGHT is 2.75 m for ' +
          'the base unit and a rooftop condenser really does make an air-conditioned ' +
          'one taller, so asset_scale.js checks the height on a cabin without one ' +
          'rather than this row failing every cabin that has it. Drawn before the ' +
          'rebuild: 4.50 m wide and 4.60 m tall, floor a metre off the ground.' });

  /* ==================================================================== */
  /* THE RECORD MACHINES.                                                  */
  /*                                                                       */
  /* The catalogue carries a 'World-record machines' category, and every    */
  /* row in it named a real machine while being drawn by the same generic   */
  /* generator as its ordinary sibling. The measured result was not a       */
  /* little wrong. `Herrenknecht 17.6 m TBM` — a name that STATES its own   */
  /* dimension — measured 6.00 m across. Bagger 293 measured 28.80 x 7.20   */
  /* x 18.30 against a published 225 x 46 x 96, so it was 5.2x short and    */
  /* 6.4x narrow. The F60 conveyor bridge measured 30 m long against 502.   */
  /* Bagger 288 and Bagger 293 measured IDENTICALLY, as did the Cat 6090    */
  /* and the R 9800, and as did all three of the giant crawler cranes —     */
  /* which is the tell: they are one generator wearing three nameplates.    */
  /*                                                                       */
  /* This is the header's own rule applied to itself. A row here is a       */
  /* published figure with a source, or the catalogue entry does not get    */
  /* to carry the model designation. Four of the fifteen could not be       */
  /* sourced to that standard and are in REJECTED below with the reason;    */
  /* core3.js names those by their machine CLASS instead.                   */
  /* ==================================================================== */

  add('haul-truck-belaz-75710', {
    name: 'BelAZ 75710 — ultra-class haul truck, 450 t payload',
    source: 'BelAZ 75710 published specification',
    sourceUrl: 'https://www.lectura-specs.com/en/model/construction-machinery/rigid-dump-trucks-belaz/75710-11738579',
    L: 20.600, W: 9.870, H: 8.260, fit: true, state: 'transport',
    configuration: 'body down, unladen',
    extras: { payloadTonnes: 450, bodyCapacity: 268.3 },
    note: 'The width is the number that matters and it is the one a generic haul-truck ' +
          'body gets wrong: 9.87 m across means a 450 t truck does not pass another ' +
          'on a haul road built for a 100 t one.' });

  add('bucket-wheel-bagger-293', {
    name: 'Bagger 293 — bucket-wheel excavator, tallest terrestrial vehicle',
    source: 'TAKRAF Bagger 293 published dimensions',
    sourceUrl: 'https://en.wikipedia.org/wiki/Bagger_293',
    L: 225.000, W: 46.000, H: 96.000, fit: true, state: 'working',
    extras: { massTonnes: 14200, bucketWheelDiameter: 21.000, buckets: 18 },
    note: 'At 96 m it is taller than the tower cranes in the same catalogue by a ' +
          'factor of two and a half. Drawn generic it was 18.30 m — SHORTER than the ' +
          'saddle-jib crane beside it, which inverts the one comparison a viewer of a ' +
          'site model actually makes.' });

  add('bucket-wheel-bagger-288', {
    name: 'Bagger 288 — bucket-wheel excavator',
    source: 'Krupp Bagger 288 published dimensions',
    sourceUrl: 'https://en.wikipedia.org/wiki/Bagger_288',
    L: 220.000, W: 46.000, H: 96.000, fit: true, state: 'working',
    extras: { massTonnes: 13500, bucketWheelDiameter: 21.000, buckets: 18 },
    note: 'Five metres shorter than the 293 and otherwise its twin. It gets its own ' +
          'row precisely so the two stop measuring identically — sharing one row would ' +
          'reproduce the defect this block exists to remove, one level up.' });

  add('conveyor-bridge-f60', {
    name: 'F60 overburden conveyor bridge',
    source: 'Besucherbergwerk F60 (the preserved machine’s own operator), "The bridge in detail"',
    sourceUrl: 'https://www.f60.de/en/the-bridge/details.html',
    L: 502.000, W: 204.000, H: 80.000, fit: true, state: 'static',
    configuration: 'the preserved Lichterfeld machine',
    confidence: 'published', tol: 0.05,
    extras: { massTonnes: 11000 },
    note: 'THE SOURCES DISAGREE ON WIDTH and the operator wins: f60.de says 204 m, ' +
          'Wikipedia says 241 m. The operator owns the machine and publishes a guided ' +
          'tour of it. Height is given as "almost 80 metres", which is why this row ' +
          'takes a 5% tolerance rather than the default 2% — the figure is a real one ' +
          'reported loosely, not a precise one we are pretending to.' });

  add('dozer-d575a', {
    name: 'Komatsu D575A-3 SD — largest production dozer',
    source: 'Komatsu D575A-3 Super Dozer brochure',
    sourceUrl: 'https://www.komatsu.eu/-/media/projects/komatsu/brochures/archive-products/d575a_3_brochure_en.ashx',
    L: 11.710, W: 7.390, H: 4.880, fit: true, state: 'working',
    configuration: 'SD blade fitted; W is the blade width',
    extras: { flywheelPowerKW: 860 },
    note: 'W is the BLADE, not the tracks, and that is the correct envelope for a ' +
          'dozer on a plan: the blade is what hits things.' });

  add('wheel-loader-l2350', {
    name: 'LeTourneau L-2350 — largest production wheel loader',
    source: 'LeTourneau L-2350 published specification',
    sourceUrl: 'https://en.wikipedia.org/wiki/LeTourneau_L-2350',
    L: 20.270, W: 6.760, H: 6.450, fit: true, state: 'working',
    configuration: 'bucket down; 40.5 m3 bucket',
    confidence: 'published', tol: 0.04,
    extras: { operatingWeightKg: 262176, bucketCapacity: 40.52 },
    note: 'The imperial spec figures are 66 ft 6 in x 22 ft 2 in x 21 ft 2 in and ' +
          'convert to these. Secondary sources round to 19.7 x 6.4 x 6.6 m, which ' +
          'disagrees by up to 3% and in BOTH directions — hence 4% rather than the ' +
          'default 2%. A row whose sources disagree says so in its tolerance.' });

  add('mining-shovel-6090fs', {
    name: 'Caterpillar 6090 FS — largest hydraulic mining shovel',
    source: 'Cat 6090 FS Hydraulic Shovel general data',
    sourceUrl: 'https://s7d2.scene7.com/is/content/Caterpillar/C823636',
    L: 13.530, W: 9.720, H: 9.990, fit: true, state: 'transport',
    configuration: 'transport envelope; 980 t operating weight, face-shovel',
    extras: { operatingWeightTonnes: 980, bucketCapacity: 52, maxHorizontalReach: 19.300 },
    note: 'The TRANSPORT envelope, which is smaller than the machine working — its ' +
          'reach alone is 19.3 m. Stated because the state field is the only thing ' +
          'that stops a 13.5 m box being read as the clearance a 19.3 m boom needs.' });

  add('mining-excavator-r9800', {
    name: 'Liebherr R 9800 — mining excavator',
    source: 'Liebherr R 9800 published specification',
    sourceUrl: 'https://www.lectura-specs.com/en/model/construction-machinery/crawler-excavators-liebherr/r-9800-1156397',
    L: 14.023, W: 8.880, H: 10.338, fit: true, state: 'transport',
    configuration: 'R 9800, 2011-2020 generation; the G6 is a LARGER machine at 23.91 x 10.55 x 11.07',
    extras: { generationG6Length: 23.910, generationG6Width: 10.550, generationG6Height: 11.070 },
    note: 'THE GENERATION IS PART OF THE NAME even though the catalogue entry omits ' +
          'it. G6 is 70% longer than the machine this row describes, so a row that did ' +
          'not say which one it was would be wrong half the time and never say so.' });

  add('tbm-bertha', {
    name: '"Big Bertha" — largest-diameter EPB tunnel boring machine',
    source: 'Bertha (Hitachi Zosen) published machine data, Alaskan Way replacement tunnel',
    sourceUrl: 'https://en.wikipedia.org/wiki/Bertha_(tunnel_boring_machine)',
    L: 99.000, W: 17.500, H: 17.500, fit: true, state: 'working',
    configuration: 'cutterhead diameter 17.5 m; overall length including trailing gear',
    extras: { cutterheadDiameter: 17.500, massTonnes: 6100, discCutters: 122 },
    note: 'W AND H ARE THE SAME NUMBER BECAUSE THE MACHINE IS A CYLINDER. Built by ' +
          'Hitachi Zosen, not Herrenknecht — the two TBM rows here are different ' +
          'manufacturers and the catalogue drew them as one object.' });

  add('tbm-mixshield-s880', {
    name: 'Herrenknecht Mixshield S-880 — largest TBM by diameter',
    source: 'Herrenknecht Tuen Mun–Chek Lap Kok Link project reference',
    sourceUrl: 'https://www.herrenknecht.com/en/references/referencesdetail/hong-kong-tuen-mun-chek-lap-kok-link/',
    L: 120.000, W: 17.600, H: 17.600, fit: true, state: 'working',
    configuration: 'cutterhead diameter 17.6 m; overall length including trailing gear',
    extras: { cutterheadDiameter: 17.600, massTonnes: 4850 },
    note: 'THE CATALOGUE ENTRY PUTS THE DIMENSION IN ITS OWN NAME — "17.6 m TBM" — ' +
          'and the object measured 6.00 m across. That is the whole argument for this ' +
          'file in one row: the claim was on screen, in words, beside geometry that ' +
          'contradicted it, and nothing anywhere compared the two. 0.1 m more than ' +
          'Bertha, which is exactly why both rows exist and why they must differ.' });

  add('mobile-crane-ltm11200-rigged', {
    name: 'Liebherr LTM 11200-9.1 — 1200 t all-terrain crane, SET UP ON OUTRIGGERS',
    source: 'Mammoet LTM 11200-9.1 datasheet, load table T3 ("Outrigger base: 13x13 m")',
    sourceUrl: 'https://www.mammoet.com/siteassets/06-equipment/cranes/mobile-cranes/all-terrain-cranes/ltm-11200-9.1/datasheet-ltm-11200-9.1/',
    L: 13.000, W: 13.000, H: 4.000, fit: true, state: 'deployed',
    configuration: 'outrigger base 13 x 13 m; transport envelope is 28.2 x 3.0 x 4.0 m',
    checkAxes: ['L', 'W'],
    slew: { radius: 13.000, counterRadius: 13.000, kind: 'slewing', bodySlews: false,
            deployedWidth: 13.000, deployedLength: 13.000 },
    extras: { transportLength: 28.200, transportWidth: 3.000, transportHeight: 4.000,
              mainBoomMax: 100.000, maxCapacity: 1200 },
    note: 'HEIGHT IS NOT CHECKED AND NOT FITTED, for the same reason as ' +
          '`mobile-crane-at-deployed`: the height of a rigged crane is a boom angle. ' +
          'The 4.000 m here is the TRAVELLING carrier and is a placeholder so the row ' +
          'can exist — mc-extents.js reads checkAxes and leaves the z factor at 1, ' +
          'because scaling a 100 m boom down into a 4 m box would be a squashed ' +
          'drawing reported as a measurement. The transport figures are recorded in ' +
          'extras rather than as the row, because the catalogue draws it rigged.' });

  /* ====================================================================
     THE W3 WORLDS — five libraries that were PLACEABLE AND UNMEASURED.

     engine/sitelib/worlds3.js and cityfam3.js push eleven libraries into
     window.W3, and modules/module-site-plan.html splices every one of them
     into CATALOG at :254. They are placeable, they are drawn, MCEXT measures
     them and MCCLASH.volOf() builds its clash solid from the result — and
     this table carried no row for any of them, so MCEXT.of() returned the RAW
     GENERATOR BOUNDS and MCDIM.check() answered null for 244,617 of 350,635
     entries. tools/cases/asset_scale.js spliced only MF_CATALOG, so the blind
     spot was invisible to the gate as well as to the reader.

     THE MEASUREMENT WORTH QUOTING, because it is the whole argument in one
     line: MCEXT.of('airliner-red') returned 16.00 x 8.00 x 4.00 m against a
     narrow-body airliner's published 39.47 x 35.79 x 12.55. The clash volume
     was 2.5x SHORT in plan length and the wing was a stub — 2.00:1 drawn
     against a real 1.10:1 — so the axis a parked aircraft actually blocks was
     the one most understated, in the direction that says IT CLEARS. And the
     body had no landing gear, so its lowest drawn point was the fuselage
     underside at z0 = 1.400 m: fitting the height would have lifted the clash
     solid's FLOOR to 4.393 m and let steps, a tug, a bowser and a person pass
     underneath reported clear. That is why gAirliner was rebuilt by hand and
     carries no fit, and it is the general shape of the risk in this whole
     wave — a fit corrects a SIZE and can make a POSITION worse.

     THE SECOND LIVE DEFECT the splice exposed: 28 `Shipping container` entries
     were resolving to `container-40ft` through MAP's `^shipping-container`
     rule. A twenty-foot body was being checked against the forty-foot row, on
     every one of them, and the rule was evaluated against nothing at all until
     the gate saw W3. It is a genRe rule to `container-20ft` now and the
     generator is trimmed to ISO 668.

     WHAT IS AND IS NOT FITTED HERE. A row carries `fit: true` only where the
     TOPOLOGY is right and the size is wrong, and three separate ways of
     getting that wrong turned up in these libraries and are refused by name:

       - THE PLAN IS A FRAGMENT. gSlide draws its chute inside
         `if(VIEW!=='top')`, so the plan bounds are the two posts and the
         platform — 1.20 x 1.60 m of a 7.39 m object. A fit scales measured
         bounds, so it would faithfully scale the fragment. Same defect in
         gSeesaw (the pivot block alone), gLander (the descent-stage body, not
         the footpad span) and gSpaceShuttle (the tank and boosters, with the
         orbiter's 23.774 m wingspan absent from the plan entirely).

       - THE PUBLISHED FIGURE EXCEEDS THE DRAWN LONG PLAN AXIS. A row that
         checks only the cross-section fits exactly the short axis, so a
         45.000 m runway width lands on a tile drawn 16.20 long x 4.00 wide
         and produces 16.20 x 45.00 — after which MCDIM.check() compares the
         plan pair UNORDERED and fails the asset against the row that had just
         corrected it. A cross-section-only row can only be fitted when the
         published cross-section is SMALLER than the drawn long plan axis.

       - THE CORRECTNESS DEPENDS ON TWO NESTED DIMENSIONS. gPool draws a
         12 x 8 m deck with a 10 x 6 m water body inset 1 m all round; any
         factor that puts the deck on 50 x 25 leaves the water at
         41.667 x 18.750, and check() would report ok for a pool that is not
         50 m long. The derived fit is a similarity transform and cannot hold
         two figures at once.

     Thirteen rows below are therefore SOURCED AND DELIBERATELY UNMAPPED, each
     recorded in UNMAPPED with kind `topology` and the rebuild named. That is a
     fourth kind and it is a real one: the asset exists, the figure is real,
     and what stands between them is a generator edit rather than a number.
     ==================================================================== */

  /* -------------------------------------------------------------------- */
  /* W3 · TRANSPORT INFRASTRUCTURE                                         */
  /* Road and aerodrome geometry is the one part of this catalogue whose    */
  /* dimensions are fixed by a published standard rather than by a          */
  /* manufacturer, so the errors are checkable against something that is    */
  /* not an opinion — and they were large. A drawn `motorway` is narrower   */
  /* than two real lanes; a drawn `runway` is narrower than one.            */
  /* -------------------------------------------------------------------- */
  var CDN127 = 'https://www.standardsforhighways.co.uk/tses/attachments/10442706-b592-42c8-85f8-2a0c779a8e37';

  add('runway-code-4', {
    name: 'Runway, aerodrome reference code number 4 (code letter D or E)',
    source: 'EASA CS-ADR-DSN Issue 4: CS ADR-DSN.B.045 Table B-1 "Width of runway" (code number 4 = 45 m); ' +
            'CS ADR-DSN.B.135 (runway plus shoulders not less than 60 m where the code letter is D or E); ' +
            'CS ADR-DSN.A.005 Table A-1 for the reference code',
    sourceUrl: 'https://www.easa.europa.eu/sites/default/files/dfu/Annex%20to%20EDD%202017-021-R%20-%20CS-ADR-DSN%20Issue%204_0.pdf',
    L: 45.000, W: 45.000, H: 0.200, state: 'static',
    checkAxes: ['W'], fit: false,
    extras: { runwayPlusShoulders: 60.000, codeNumber: 4 },
    note: 'MEASURED: runway-segment-0 and -1 both 16.200 x 4.000 x 0.200 m. The 4.00 m ' +
          'cross-section is 11.25x short against a standard that is not an opinion, and ' +
          'it is narrower than a single 3.65 m motorway lane. ONLY W IS CHECKED: runway ' +
          'LENGTH is not a class dimension (CS ADR-DSN.A.005 says the aeroplane reference ' +
          'field length "is not intended to influence the actual runway length provided"), ' +
          'so L repeats W and the row makes no length claim, and H repeats the drawn ' +
          '0.200 m because pavement construction depth is a design outcome. The 60.000 m ' +
          'including shoulders is in extras, not in W: the asset draws the paved runway ' +
          'and its markings, with no shoulders. NOT FITTED AND NOT MAPPED — 45.000 ' +
          'exceeds the drawn long plan axis of 16.200, so a W-only fit would produce ' +
          '16.20 x 45.00 and check()\'s unordered plan pair would then fail the asset ' +
          'against the row that had just corrected it. Lengthen the tile (90 x 45 is the ' +
          'natural choice) and re-lay the markings at that scale, and this row takes ' +
          'fit:true unchanged.' });

  add('motorway-carriageway-d3m', {
    name: 'Motorway mainline carriageway, D3M — paved width',
    source: 'DMRB CD 127 "Cross-sections and headrooms" Version 1.0.1 (29-Jul-2021): traffic lane ' +
            '3.65 m (clause 2.18(2) and Table E/1.4 priority-1 row, which gives D3M lanes ' +
            '3.65 / 3.70 / 3.65 m), hard shoulder 3.30 m and offside hard strip 0.70 m; ' +
            '"paved width includes the width of the carriageway plus any hard shoulders and ' +
            'hard strips" (NOTE to clause 4.9)',
    sourceUrl: CDN127,
    L: 15.000, W: 15.000, H: 0.300, state: 'static',
    checkAxes: ['W'], fit: false, confidence: 'derived',
    extras: { lane: 3.650, hardShoulder: 3.300, offsideHardStrip: 0.700,
              centralReserve: 4.500, bothCarriagewaysOverall: 33.400 },
    note: 'MEASURED: motorway-segment-0 and -1 both 14.000 x 6.200 x 0.300 m — one drawn ' +
          '"motorway" is narrower than two real lanes. 15.000 = 3.65 + 3.70 + 3.65 (the ' +
          'middle D3M lane really is 3.70 m) + 3.30 + 0.70. CITATION HONESTY: the standard ' +
          'cross-sections live in Figures 2.1.1N1a-h, which are raster images carrying no ' +
          'extractable text; Table E/1.4 restates the same UN-REDUCED values in its ' +
          'priority-1 row and clause 2.18(2) independently gives 3.65 m. NOT FITTED AND ' +
          'NOT MAPPED for the runway\'s reason: 15.000 exceeds the drawn long plan axis of ' +
          '14.000. A SECOND DEFECT A FIT WOULD NOT TOUCH: the drawn markings are a single ' +
          'carriageway\'s, with a painted centre line — a motorway has a central reserve ' +
          'instead. This row sizes ONE carriageway, which is the correction with the least ' +
          'assumption in it and the one the clash solid needs.' });

  add('roundabout-normal-icd', {
    name: 'Normal roundabout — minimum inscribed circle diameter',
    source: 'DMRB CD 116 "Geometric design of roundabouts": clause 3.5 "The minimum value of the ' +
            'ICD for a normal or compact roundabout shall be 28 metres"; clause 3.5.2 the ICD ' +
            'should not exceed 100 metres; clause 3.7 central island at least 4 m in diameter; ' +
            'clause 3.6 circulatory carriageway 1.0 to 1.2 times the maximum entry width',
    sourceUrl: 'https://standardsforhighways.co.uk/tses/attachments/html/7b5ea157-9b3e-4774-9781-7d1656e83338',
    L: 28.000, W: 28.000, H: 2.400, state: 'static',
    checkAxes: ['L', 'W'], fit: true,
    range: { L: [28.000, 100.000], W: [28.000, 100.000] },
    extras: { centralIslandMinDiameter: 4.000 },
    note: 'MEASURED 14.000 x 14.000 x 2.400 m — the drawn ICD is exactly HALF the minimum ' +
          'for a normal roundabout. THE ROW CARRIES A RANGE because clauses 3.5 and 3.5.2 ' +
          'give a band rather than a value, so check() asserts containment while the fit ' +
          'targets the 28.000 m minimum: anything above it is a capacity decision this ' +
          'catalogue has no input for. FIT IS SAFE and the arithmetic was checked rather ' +
          'than assumed — the plan is square, both plan axes are named, sx = sy = 2.000 ' +
          'exactly and z is left alone. The result is coherent as a roundabout and not ' +
          'merely as a box: the central island goes 6.00 -> 12.00 m (clause 3.7 wants at ' +
          'least 4.00), the circulatory carriageway becomes (28-12)/2 = 8.00 m, which ' +
          'clause 3.6 satisfies at an entry width of 6.7 to 8.0 m. H is unchecked and ' +
          'unfitted on purpose: the 2.40 m mound is landscaping and CD 116 publishes no ' +
          'island height. MAPPED BY GENERATOR: this library\'s roundabout collides with ' +
          'site-core\'s gRoad roundabout and LOSES the bare id to the ~N dedup pass, so a ' +
          '`re` rule written against /^roundabout/ would reach the road feature instead.' });

  add('bridge-deck-s2', {
    name: 'Highway bridge deck carrying a single 7.30 m carriageway — width between parapets',
    source: 'DMRB CD 127 "Cross-sections and headrooms" Version 1.0.1: traffic lane 3.65 m ' +
            '(clause 2.18(2); Table E/1.4) and clause 3.6, "For cross-sections above bridge ' +
            'decks where the VRS is a parapet, a raised verge of 600mm minimum width ... shall ' +
            'be provided between the paved width and adjacent parapets"',
    sourceUrl: CDN127,
    L: 8.500, W: 8.500, H: 4.100, state: 'static',
    checkAxes: ['W'], fit: true, confidence: 'derived', tol: 0.15,
    extras: { carriageway: 7.300, raisedVergeEachSide: 0.600,
              headroomNewConstruction: 5.300, headroomMaintained: 5.030 },
    note: 'ONE ROW, THREE GENERATORS — a beam bridge, an arch bridge and a flyover carry ' +
          'the SAME road and therefore the same deck cross-section, and their names share ' +
          'no substring; the same discipline as the rigid-HGV row. MEASURED: gBeamBridge ' +
          '14.000 x 3.000 x 4.100, gArchBridge 14.000 x 2.400 x 4.600, gFlyover ' +
          '14.000 x 3.200 x 4.600 — every one of those decks is NARROWER THAN A SINGLE ' +
          '3.65 m TRAFFIC LANE. 8.500 IS DERIVED, not published as one figure: 2 x 3.65 = ' +
          '7.30 m carriageway plus 2 x 0.600 m raised verge. It excludes hard strips, so it ' +
          'is a strict MINIMUM and the row takes 15% rather than the default 2%. THE SPAN ' +
          'IS NOT TOUCHED AND SHOULD NOT BE: 14 m is a real small overbridge or masonry ' +
          'arch, which is exactly why these three can be fitted while the suspension and ' +
          'cable-stayed bridges cannot. A SEPARATE DEFECT THE WIDTH FIT DOES NOT REPAIR: ' +
          'gFlyover\'s deck soffit is drawn at 3.50 m against CD 127 Table 4.1\'s 5.30 m + S ' +
          'new-construction headroom, which is below the 4.00 m UK legal vehicle height ' +
          'this table already carries on `lorry-artic-eu` — the catalogue\'s own lorry ' +
          'cannot pass under the catalogue\'s own flyover. Raising a soffit is a ' +
          'translation, and no fit of any kind performs one.' });

  /* -------------------------------------------------------------------- */
  /* W3 · TRANSPORT VEHICLES                                               */
  /* An aeroplane, a locomotive, a tram and a freight wagon are all objects */
  /* whose maker publishes an envelope, so every row here is a spec sheet   */
  /* rather than a standard. The diagnosis is almost entirely ONE AXIS in   */
  /* each case: the drawn locomotive is within 0.3% on width and 47% short  */
  /* on length, which is the fingerprint of a body drawn to look right in a */
  /* thumbnail rather than to a dimension.                                  */
  /* -------------------------------------------------------------------- */
  add('airliner-narrowbody', {
    name: 'Narrow-body airliner (Boeing 737-800 with winglets)',
    source: 'Boeing, 737 Airplane Characteristics for Airport Planning, D6-58325-7 Rev C, ' +
            'October 2025, section 2.2.6 General Dimensions: Model 737-800W — overall length ' +
            '129 FT 6 IN (39.47 M), wing span 117 FT 5 IN (35.79 M), tail height 41 FT 2 IN (12.55 M)',
    sourceUrl: 'https://www.boeing.com/content/dam/boeing/v2/airports/acaps/737NG_REV_C.pdf',
    L: 39.470, W: 35.790, H: 12.550, state: 'static',
    fit: false,
    extras: { wingspanWithoutWinglets: 34.320 },
    note: 'REBUILT BY HAND, NOT FITTED, ON A MEASUREMENT RATHER THAN A PREFERENCE. All 56 ' +
          'gAirliner entries measured 16.000 x 8.000 x 4.000 m with z0 = 1.400, because the ' +
          'generator drew NO LANDING GEAR — the lowest drawn point was the fuselage ' +
          'underside. MCCLASH.volOf() takes z0 straight from MCEXT and mc-extents.js\'s ' +
          '_applyFit multiplies it, so a height factor of 12.55/4.000 = 3.1375 would have ' +
          'lifted the clash solid\'s floor from 1.40 m to 4.393 m and its ceiling to ' +
          '16.94 m: the height becomes right and the POSITION becomes wrong, and steps, a ' +
          'tug, a bowser and a person all pass under the aircraft reported clear. The plan ' +
          'aspect was the other half — 2.00:1 drawn against a real 1.10:1, so the wing was ' +
          'a stub. CAUTION FOR THE NEXT TYPE: _fitFactors uses max(L,W)/min(L,W) and not ' +
          'the field names, so a type whose SPAN exceeds its LENGTH (an A380 is 79.75 m ' +
          'span against 72.72 m long) would be rotated by a fit. This one is safe by ' +
          '3.68 m. Configuration is with winglets, the larger and safer of the two spans ' +
          'Boeing prints.' });

  add('helicopter-light-single', {
    name: 'Light single-engine helicopter, rotors turning (Bell 407GXi, low skid gear)',
    source: 'Bell Textron, BELL 407GXi SPECIFICATIONS, February 2026, page 4 "Helicopter ' +
            'Dimensions", LOW SKID GEAR — overall length rotors turning 41.4 FT (12.61 m), ' +
            'overall height 10.2 FT (3.10 m), main-rotor radius from mast 17.5 FT (5.33 m), ' +
            'skid width 8.1 FT (2.47 m), tail rotor diameter 5.4 FT (1.65 m)',
    sourceUrl: 'https://www.bellflight.com/products/bell-407',
    L: 12.610, W: 10.670, H: 3.100, state: 'working',
    fit: false,
    extras: { mainRotorRadius: 5.330, skidWidth: 2.470, tailRotorDiameter: 1.650,
              fuselagePlanLength: 11.190 },
    note: 'W IS THE ROTOR DISC DIAMETER and it is twice a printed figure rather than a ' +
          'printed one: Bell dimensions the rotor RADIUS from the mast as 17.5 FT, so the ' +
          'disc is 35 ft = 10.67 m. MEASURED, all 50 entries: 8.000 x 1.700 x 3.200, ' +
          'z0 = 0.600. NOT FITTED AND NOT MAPPED: the main rotor is drawn inside ' +
          '`if(VIEW!==\'top\')`, so it reaches the SIDE view only — plan x 8.000 against a ' +
          'side x-range of 11.000, and plan y 1.700. THE ONE ENVELOPE A HELICOPTER IS ' +
          'DANGEROUS IN IS ABSENT FROM THE PLAN BOUNDS ENTIRELY, and those bounds are what ' +
          'the clash solid is built from. A fit would give sy = 6.28 and stretch the 1.7 m ' +
          'fuselage sideways into a 10.67 m slab rather than producing a disc, and ' +
          'sz = 0.969 would leave the skids floating at 0.581 m. Draw the rotor disc in the ' +
          'top view and put the skids on the ground; then this row is fittable, with the ' +
          'same max(L,W) caution as the airliner and a smaller margin (1.94 m). state is ' +
          '`working` because L and W are the ROTORS-TURNING envelope.' });

  add('locomotive-bobo', {
    name: 'Four-axle (Bo\'Bo\') mainline locomotive',
    source: 'Alpha Trains, TECHNICAL DATA VECTRON MS (Siemens Vectron MS electric locomotive) — ' +
            'wheelset arrangement Bo\'Bo\', length over buffer 18,980 mm, total width 3,012 mm, ' +
            'total height 3,860 mm, track gauge 1,435 mm, total weight 90 t',
    sourceUrl: 'https://www.alphatrains.eu/downloads/fleet/loco/alpha_data_sheet_loco_vectron_ms.pdf',
    L: 18.980, W: 3.012, H: 3.860, state: 'static',
    fit: true,
    extras: { trackGauge: 1.435, massTonnes: 90 },
    note: 'MEASURED, all 56 entries: 10.000 x 3.020 x 3.400 m. THE DIAGNOSIS IS ALMOST ' +
          'ENTIRELY ONE AXIS — the drawn width is within 0.3% of a real Bo\'Bo\' mainline ' +
          'locomotive and the drawn height is 12% under, so the section is right and the ' +
          'clash solid is 47% SHORT IN LENGTH and nothing else. The shape agrees with the ' +
          'row too: a long hood with a raised cab over one bogie and four wheels in side ' +
          'elevation is what Bo\'Bo\' means. Named after a specific machine for the same ' +
          'reason excavator-mini-8t is named after the Caterpillar 308 CR. The drawn ' +
          'locomotive carries no pantograph and 3,860 mm is the total height of the ' +
          'electric machine, so a diesel Bo\'Bo\' of the same body sits inside it.' });

  add('tram-lrv', {
    name: 'Low-floor light rail vehicle (tram)',
    source: 'Stadler Rail, TRAMLINK low floor light rail vehicle, Baselland Transport AG data ' +
            'sheet TLBLT0221e (2020) — length over coupling 44,180 mm, vehicle width 2,400 mm, ' +
            'vehicle height 3,610 mm, seven-section multi-articulated, track gauge 1,000 mm',
    sourceUrl: 'https://www.stadlerrail.com/api/docs/x/f6df7f1948/tramlink_blt_en.pdf',
    L: 44.180, W: 2.400, H: 3.610, state: 'static',
    fit: true,
    extras: { trackGauge: 1.000, sections: 7 },
    note: 'MEASURED, all 56 entries: 11.000 x 2.820 x 4.600 m. FITTED DESPITE A 4x STRETCH, ' +
          'deliberately: the alternative leaves the clash box 4x short in the direction ' +
          'that says it clears, and the shape being scaled — a long box on rails sitting on ' +
          'the ground — is the tram\'s envelope. The cost is a drawing artefact (two axles ' +
          '38 m apart) that a section-articulated rebuild would fix without changing the ' +
          'solid. H IS CHECKED ON PURPOSE, and note what it replaces: the drawn 4.600 m top ' +
          'is the tip of a RAISED PANTOGRAPH, which is a contact-wire height belonging to ' +
          'the overhead line rather than a vehicle dimension — and at 4.6 m it is neither ' +
          'the 3.610 m vehicle nor a real street-running wire at 5.5-6.0 m, it is a made-up ' +
          'middle. MAPPED BY GENERATOR AND THAT IS NOT OPTIONAL: cityfam3.js declares a ' +
          'DIFFERENT gTram which owns the bare `tram-<colour>` ids and measures ' +
          '12.10 x 3.66 x 5.60, so an id rule would check a different object against this ' +
          'row.' });

  add('wagon-box-bogie', {
    name: 'Bogie covered freight wagon (60 ft 9 in Plate F boxcar)',
    source: 'The Greenbrier Companies, 60\' Boxcar specification sheet, Oct. 2019 — length over ' +
            'couplers 67\'-10 1/2" (20.688 m), width extreme 10\'-7 7/8" (3.248 m), height ' +
            'extreme 17\'-0" (5.182 m), clearance AAR Plate F, capacity 7,550 cu ft',
    sourceUrl: 'https://www.gbrx.com/wp-content/uploads/2021/06/60-Boxcar.pdf',
    L: 20.688, W: 3.248, H: 5.182, state: 'static',
    fit: true,
    extras: { clearancePlate: 'AAR Plate F' },
    note: 'MEASURED: gWagon kind `box` = 8.000 x 3.020 x 3.300 m across 52 entries. WHY AN ' +
          'AAR CAR AND NOT A EUROPEAN WAGON: European builders publish length over buffers, ' +
          'the loading dimensions and the weights but NOT an overall width or height — ' +
          'checked on Transwaggon\'s Habbiins HB16 sheet, Greenbrier Europe\'s Sgnss and ' +
          'Falns pages, VTG\'s Zans sheet and DB Cargo\'s Gueterwagenkatalog. Their envelope ' +
          'is the G1 loading gauge, which is a CLEARANCE PROFILE and not a vehicle ' +
          'dimension; taking it as one would inflate the clash box. AAR-standard cars ' +
          'publish extreme width and extreme height outright, so all three axes come from ' +
          'one document. THE MAP IS PER KIND AND BY ID, NOT BY GENERATOR: one gWagon draws ' +
          'four kinds at three different heights, so a generator rule would check the ' +
          'hopper and the flat against this row. SEPARATE FINDING: the drawn `box` and ' +
          '`tank` kinds measured IDENTICALLY — the identical-extents fingerprint, here ' +
          'inside a single generator — and these two rows are what separates them.' });

  add('wagon-tank-bogie', {
    name: 'Bogie tank wagon (four-axle general service tank car)',
    source: 'TrinityRail, 23,589 Gallon General Service Tank Car — length over coupler pulling ' +
            'faces 55\'-4 1/4" (16.872 m), extreme width 10\'-7 3/8" (3.235 m), extreme height ' +
            '15\'-0 5/8" (4.588 m), clearance diagram Plate B',
    sourceUrl: 'https://www.trinityrail.com/railcars/tank-cars/23589-gallon-general-service-tank-car/',
    L: 16.872, W: 3.235, H: 4.588, state: 'static',
    fit: true,
    extras: { clearancePlate: 'AAR Plate B', capacityUSGallons: 23589 },
    note: 'MEASURED: gWagon kind `tank` = 8.000 x 3.020 x 3.300 m over 12 entries. The ' +
          'metres are the printed feet-and-inches converted at 25.4 mm to the inch: ' +
          '664.25, 127.375 and 180.625 in. The European alternative was checked and refused ' +
          'for the boxcar\'s reason — VTG\'s Zans sheet for a 98 m3 four-axle mineral-oil ' +
          'tank wagon publishes length over buffers, outer axle distance and tare, and no ' +
          'width or height at all, so only one axis of three could be sourced there.' });

  add('wagon-hopper-bogie', {
    name: 'Bogie open-top hopper wagon (four-axle)',
    source: 'TrinityRail, 2,480 Cubic Foot RDL-A Longitudinal Rapid Discharge Open Top Hopper — ' +
            'length over coupler pulling faces 44\'-11 1/2" (13.703 m), extreme width ' +
            '10\'-7 1/2" (3.239 m), extreme height 13\'-5" (4.089 m)',
    sourceUrl: 'https://www.trinityrail.com/railcars/covered-hoppers/2480-cubic-foot-rdl-a-longitudinal-rapid-discharge-open-top-hopper/',
    L: 13.703, W: 3.239, H: 4.089, state: 'static',
    fit: true,
    extras: { capacityCubicFeet: 2480 },
    note: 'MEASURED: gWagon kind `hopper` = 8.000 x 3.020 x 2.700 m over 12 entries. An ' +
          'OPEN-TOP hopper is the right reference for what the generator actually draws — a ' +
          'body with a sloped end quad and no roof — rather than a covered hopper. Metres ' +
          'are the printed feet-and-inches at 25.4 mm to the inch: 539.5, 127.5 and 161 in. ' +
          'Greenbrier Europe\'s Falns 87 m3 publishes length over buffers 13,500 mm, within ' +
          '1.5% of this car, which is a useful independent check on the length even though ' +
          'it publishes neither of the other two axes.' });

  /* -------------------------------------------------------------------- */
  /* W3 · RECREATION                                                       */
  /* A sports pitch is the most exactly sourceable object in this whole     */
  /* catalogue — IFAB, FIBA, the ITF, World Athletics and World Aquatics    */
  /* all publish the field of play to the millimetre — and they were the    */
  /* worst drawn: a football pitch 12 x 8 m, a 400 m running track 16 m     */
  /* across. The play equipment is the opposite case and is worth stating   */
  /* because it stops a blanket factor being applied to the class: the      */
  /* fairground carousel was already inside 11%, so `recreation` is not     */
  /* uniformly oversized and a single correction would be wrong here in the */
  /* other direction.                                                      */
  /* -------------------------------------------------------------------- */
  var IFAB = 'https://www.theifab.com/laws/latest/the-field-of-play/';
  var WA_MANUAL = 'https://worldathletics.org/download/download?filename=7d39b677-8043-45f4-89f4-6c8814023057.pdf&urlslug=Track+and+Field+Facilities+Manual+2019+Edition+-+Chapters+1-3';

  add('goal-football-11aside', {
    name: 'Football goal, 11-a-side (IFAB Law 1)',
    source: 'IFAB Laws of the Game, Law 1 — The Field of Play (goals): 7.32 m between the inside ' +
            'of the posts, 2.44 m from the ground to the lower edge of the crossbar, posts and ' +
            'crossbar not more than 12 cm wide and deep',
    sourceUrl: IFAB,
    L: 7.560, W: 0.120, H: 2.560, state: 'static',
    checkAxes: ['L', 'H'], fit: true,
    range: { L: [7.320, 7.560], H: [2.440, 2.560] },
    extras: { clearOpeningWidth: 7.320, clearOpeningHeight: 2.440, maxSection: 0.120 },
    note: 'THE MOST EXACTLY SOURCEABLE OBJECT IN THE RECREATION LIBRARY. Law 1 publishes the ' +
          'CLEAR opening and caps the post section at 12 cm, so L and H here are the derived ' +
          'OUTSIDE envelope a bounding box measures — 7.320 + 2 x 0.120 and 2.440 + 0.120 — ' +
          'and the row carries the range so the clear opening passes too. MEASURED ' +
          '4.200 x 0.200 x 3.000 m: the span is 1.80x short and the height 1.17x OVER, so ' +
          'the drawn goal is 1.4:1 where a real one is 2.95:1, which is precisely why the ' +
          'fit has to be per axis. W IS NOT CHECKED: Law 1 fixes only a maximum section and ' +
          'says nothing about how far the net is carried back, so the drawn 0.200 m depth ' +
          'is a drawing artefact in exactly the sense site-sign-post already records for a ' +
          'sign face.' });

  add('pitch-football-11aside', {
    name: 'Football pitch, 11-a-side (105 x 68 m standard)',
    source: 'IFAB Laws of the Game, Law 1 (field dimensions); corroborated by World Athletics ' +
            'Track and Field Facilities Manual 2019, section 2.2.1.1 and Table 1.2.3b ' +
            '(standard football pitch 68 m x 105 m inside a 400 m Standard Track)',
    sourceUrl: IFAB,
    L: 105.000, W: 68.000, H: 0.200, state: 'static',
    checkAxes: ['L', 'W'], fit: true,
    extras: { lawRangeNonInternational: '90-120 x 45-90 m', lawRangeInternational: '100-110 x 64-75 m',
              withSafetyZone: '70 x 109 m' },
    note: 'Law 1 gives a RANGE and 105 x 68 is the standard within it, stated independently ' +
          'by World Athletics twice — section 2.2.1.1 says the 400 m Standard Track infield ' +
          'holds "a standard football pitch (68m x 105m)" and Table 1.2.3b lists the same ' +
          'pair. MEASURED 12.000 x 8.000 m, so 8.75x and 8.50x short; the drawn aspect is ' +
          '1.500 against a true 1.544, within 3%, which is why a per-axis fit lands the ' +
          'markings roughly where they belong. H is the drawn slab thickness carried only ' +
          'so the row can exist: a pitch has no published vertical dimension, checkAxes ' +
          'omits it and _fitFactors therefore leaves z at 1, so the value is inert by ' +
          'construction.' });

  add('court-basketball-fiba', {
    name: 'Basketball court, FIBA (28 x 15 m)',
    source: 'FIBA Official Basketball Rules 2024, Article 2.1 Court: "28 m in length by 15 m in ' +
            'width measured from the inner edge of the boundary line"; Article 2.2 adds a 2 m ' +
            'obstruction-free boundary lane',
    sourceUrl: 'https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf',
    L: 28.000, W: 15.000, H: 0.200, state: 'static',
    checkAxes: ['L', 'W'], fit: true,
    extras: { lineWidth: 0.050, obstructionFreeBoundaryLane: 2.000, minimumFloor: '32 x 19 m' },
    note: 'MEASURED 9.000 x 6.000 m, so 3.11x and 2.50x short. IT HAS TO BE AN ID RULE AND ' +
          'NOT A GENERATOR RULE: gCourt draws all three courts, so /^gCourt$/ would put a ' +
          'basketball court\'s dimensions on a tennis court — and the row would fit ' +
          'perfectly while being the wrong game, which is the telehandler-operator hazard ' +
          'in another domain. The 2 m obstruction-free lane is run-off and is NOT what this ' +
          'row describes; it is in extras.' });

  add('court-tennis-doubles', {
    name: 'Tennis court, doubles (ITF Rule 1)',
    source: 'ITF Rules of Tennis, Rule 1 — The Court: "a rectangle, 78 feet (23.77 m) long and, ' +
            'for singles matches, 27 feet (8.23 m) wide. For doubles matches, the court shall ' +
            'be 36 feet (10.97 m) wide."',
    sourceUrl: 'https://www.itftennis.com/media/4421/2021-rules-of-tennis-english.pdf',
    L: 23.770, W: 10.970, H: 0.200, state: 'static',
    checkAxes: ['L', 'W'], fit: true,
    extras: { singlesWidth: 8.230, netPostOutsideCourtEachSide: 0.914, netSpan: 12.798 },
    note: 'Two entries — `tennis-court` and `clay-court` — take one row, because clay is a ' +
          'SURFACE and not a different game. MEASURED 9.000 x 6.000 m, so 2.64x and 1.83x ' +
          'short. The net posts sit 0.914 m outside the doubles court on each side, so the ' +
          'net structure spans 12.798 m: wider than the court, and a different claim from ' +
          'the one this row makes. SEPARATE DRAWING DEFECT found while measuring and not a ' +
          'dimension error: only the entry passed kind:\'tennis\' draws a net, and ' +
          '`clay-court` takes the else branch and renders the BASKETBALL backboard ' +
          'marking.' });

  add('track-athletics-400m', {
    name: '400 m Standard Track, 8 lanes (World Athletics)',
    source: 'World Athletics Track and Field Facilities Manual 2019, Figure 1.2.3a and section ' +
            '2.2.1.1: "The 400m Standard Track comprises 2 semicircles, each with a radius of ' +
            '36.50m, which are joined by two straights, each 84.39m in length."',
    sourceUrl: WA_MANUAL,
    L: 176.910, W: 92.520, H: 1.280, state: 'static',
    checkAxes: ['L', 'W'], fit: false,
    extras: { bendRadius: 36.500, straight: 84.390, lanes: 8, laneWidth: 1.220 },
    note: 'THE ARITHMETIC CLOSES ON PAPER, which is why this row is checkable without ' +
          'trusting the drawing: 8 lanes x 1.220 m = 9.760 m outside the kerb, so ' +
          '2 x 36.500 + 2 x 9.760 = 92.520 and 84.390 + 92.520 = 176.910. MEASURED ' +
          '16.000 x 16.000 x 1.280 m, i.e. 11.06x and 5.78x short. NOT FITTED AND NOT ' +
          'MAPPED: gRunningTrack draws two concentric DISCS, and a per-axis fit turns a ' +
          'disc into an ellipse, which has neither the 84.390 m straights nor the constant ' +
          '36.500 m bend radius that are what a 400 m track IS — and its inner disc could ' +
          'not contain the 105 x 68 m pitch the same manual says a Standard Track infield ' +
          'holds. Rebuild the generator to the oval; do not scale the circle. H is a ' +
          'projection artefact of the disc rim rather than a dimension.' });

  add('pool-50m-longcourse', {
    name: 'Long-course swimming pool, 50 x 25 m (World Aquatics)',
    source: 'World Aquatics (FINA) Facilities Rules 2021-2025, FR 2.2.1 length 50.0 m between ' +
            'touch panels, FR 2.2.3 width 25.00 m, FR 2.2.4 minimum depth, FR 2.2.6.2 eight ' +
            '2.5 m lanes plus two 2.5 m spaces outside lanes 1 and 8',
    sourceUrl: 'https://resources.fina.org/fina/document/2022/02/08/77c3058d-b549-4543-8524-ad51a857864e/210805-Facilities-Rules_clean.pdf',
    L: 50.000, W: 25.000, H: 2.000, state: 'static',
    checkAxes: ['L', 'W'], fit: false,
    extras: { lanes: 8, laneWidth: 2.500, minimumDepth: 2.000, recommendedDepth: 3.000 },
    note: 'FR 2.2.6.2 closes the arithmetic: 8 lanes at 2.5 m plus 2 spaces at 2.5 m is ' +
          '25.00 m exactly. FR 2.1.3 sets no minimum width at all in the general rules, so ' +
          '25.000 is specifically the top-competition configuration and this row says ' +
          'which. MEASURED 12.000 x 8.000 x 0.400 m. NOT FITTED AND NOT MAPPED, for a ' +
          'structural reason worth recording as a class: THE DERIVED FIT IS A SIMILARITY ' +
          'TRANSFORM AND THIS ASSET\'S CORRECTNESS DEPENDS ON TWO NESTED DIMENSIONS. gPool ' +
          'draws a 12 x 8 m deck with a 10 x 6 m water body inset 1 m all round, so any ' +
          'factor that puts the deck on 50 x 25 leaves the water at 41.667 x 18.750 — and ' +
          'check() would then report ok for a pool that is not 50 m long, which is the ' +
          'wrong-row-that-fits-perfectly hazard. Rebuild with the water at 50.000 x 25.000 ' +
          'and state the surround separately. H is FR 2.2.4\'s minimum DEPTH, which is ' +
          'below ground while the drawn box is a deck above it — two different claims, so ' +
          'checkAxes omits it.' });

  add('bench-park-2m', {
    name: 'Park bench with backrest, 2.0 m (Broxap Parkgate)',
    source: 'Broxap Parkgate seat, published product dimensions (ductile iron frame, hardwood ' +
            'slats): 2000 x 600 x 800 mm, 70 kg',
    sourceUrl: 'https://www.broxap.com/parkgate.html',
    L: 2.000, W: 0.600, H: 0.800, state: 'static',
    fit: true,
    note: 'MEASURED 4.000 x 1.500 x 2.100 m across 23 entries — 2.00x, 2.50x and 2.63x over, ' +
          'i.e. a bench with a 2.100 m back, TALLER THAN THE 1.750 m PERSON MEANT TO SIT ON ' +
          'IT. The topology is right (slatted seat, backrest, two end legs) and the error is ' +
          'close to a uniform 2.4x, so this is the plain derived-fit case. Mapped by ' +
          'generator for a second, measured reason: five of the 23 lost their bare ids to ' +
          'the city library\'s own gBench and are reachable only as `bench-0~1` onwards, ' +
          'which no id pattern written against the recreation names would catch.' });

  add('bandstand-park-octagonal', {
    name: 'Park bandstand / gazebo (Broxap Beaufort Economy)',
    source: 'Broxap Beaufort Economy Bandstand, published dimensions: 4900 mm across corners, ' +
            '4300 mm across flats, columns on a 3875 mm pitch circle, 4000 mm overall height, ' +
            '2500 mm to the underside of the eaves',
    sourceUrl: 'https://www.broxap.com/beaufort-economy-bandstand.html',
    L: 4.900, W: 4.900, H: 4.000, state: 'static',
    fit: true,
    extras: { acrossFlats: 4.300, columnPitchCircle: 3.875, eavesUnderside: 2.500 },
    note: 'MEASURED 7.600 x 7.600 x 5.000 m, so 1.55x and 1.25x over. One row covers ' +
          'gGazebo and gBandstand because gBandstand is literally a call to gGazebo with a ' +
          'different roof colour, and a name rule would have to know that. INDEPENDENT ' +
          'CROSS-CHECK the row does not use and nothing was fitted to: the drawn column ' +
          'pitch circle is 6.000 m, and the factor derived from the ROOF alone ' +
          '(4.900 / 7.600 = 0.6447) puts it at 3.868 m against the manufacturer\'s ' +
          'published 3.875 m — 0.16% out. Same shape of check as the LR 1300 SX track ' +
          'length against MCEXT.groundOf(). The published unit is octagonal and the ' +
          'generator draws six columns; a hexagonal bandstand is a real object and this row ' +
          'is about the envelope, so the side count is a drawing choice.' });

  add('swing-set-2seat', {
    name: 'Playground swing, single bay, two seats (KOMPAN KSW92003)',
    source: 'KOMPAN Swing, 8 ft H (item KSW92003), published product data, EN 1176 certified: ' +
            '11 ft 10 in x 6 ft 0 in x 8 ft 4 in, two single seats, max fall height 7 ft 11 in',
    sourceUrl: 'https://www.kompan.com/en/us/p/ksw92003',
    L: 3.607, W: 1.829, H: 2.540, state: 'static',
    fit: true,
    extras: { maxFallHeight: 2.413, safetySurfacingAreaSqFt: 549 },
    note: 'MEASURED 4.800 x 2.400 x 3.500 m — 1.33x, 1.31x and 1.38x over, near-uniform ' +
          'across all three axes, which is the fingerprint of a pure scale error and the ' +
          'case the derived fit exists for. The drawn object is exactly the published one: ' +
          'two A-frames, a top beam, two seats. The EN 1176 safety surfacing area is ' +
          'deliberately NOT part of this row — it is a required clear zone rather than an ' +
          'object, and putting it in the bounding box would invent 8.7 m of solid in front ' +
          'of every swing.' });

  add('slide-freestanding-3m', {
    name: 'Freestanding playground slide, 3.2 m (KOMPAN COR66920)',
    source: 'KOMPAN Freestanding Slide, 8 ft (item COR66920), published product data: ' +
            '24 ft 3 in x 5 ft 0 in x 10 ft 6 in, total height 10 ft 6 in, max fall height ' +
            '8 ft 2 in',
    sourceUrl: 'https://www.kompan.com/en/us/p/cor66920',
    L: 7.391, W: 1.524, H: 3.200, state: 'static',
    fit: false,
    extras: { maxFallHeight: 2.489, en1176MaxFreeHeightOfFall: 3.000 },
    note: 'NOT FITTED AND NOT MAPPED, because THE PLAN FOOTPRINT IS A FRAGMENT RATHER THAN ' +
          'A PROJECTION: gSlide draws the chute inside `if(VIEW!==\'top\')`, so MCEXT ' +
          'measures a plan of 1.200 x 1.600 m — the two posts and the platform — while the ' +
          'generator\'s OWN side view carries the chute out to x = 5.000 m. The clash solid ' +
          'is missing four fifths of the object in the direction that says it clears, and a ' +
          'fit scales measured bounds, so it would faithfully scale the fragment. Move the ' +
          'chute out of the top-view guard first, then this row measures something. ' +
          'Citable and separate: the drawn platform sits at 3.000 m, exactly EN 1176-1\'s ' +
          'cap on free height of fall — above that figure the item is not children\'s ' +
          'playground equipment under the standard at all — against the published slide\'s ' +
          '2.489 m.' });

  add('seesaw-2seat', {
    name: 'Playground seesaw (KOMPAN Garden Seesaw M186)',
    source: 'KOMPAN Garden Seesaw (item M186), published product data: 3 ft 7 in x 10 ft 9 in x ' +
            '3 ft 7 in (the 10 ft 9 in is the plank), 10 users, max fall height 3 ft 3 in',
    sourceUrl: 'https://www.kompan.com/en/us/p/m186',
    L: 3.277, W: 1.092, H: 1.092, state: 'static',
    fit: false,
    extras: { maxFallHeight: 0.991 },
    note: 'NOT FITTED AND NOT MAPPED: same plan-fragment defect as gSlide and the worse ' +
          'ratio of the two. The plank and both seats are inside `if(VIEW!==\'top\')`, so ' +
          'MCEXT measures 0.800 x 0.800 m — the pivot block alone — against a 3.277 m ' +
          'object, a 4.10x understatement of the plan footprint. THE REBUILD HAS TO FIX TWO ' +
          'THINGS AT ONCE, because the generator\'s own drawn plank is 6.400 m long, itself ' +
          '1.95x a real one: correcting only the view guard would replace a 4.10x ' +
          'understatement with a 1.95x overstatement.' });

  add('monkey-bars-overhead-ladder', {
    name: 'Overhead ladder / monkey bars (KOMPAN FPW205)',
    source: 'KOMPAN Overhead Ladder (item FPW205), published product data, certified to EN 1176: ' +
            '228 x 119 x 240 cm, 2 users, max fall height 233 cm, safety zone 29.5 m2',
    sourceUrl: 'https://www.kompan.com/en/int/p/fpw205',
    L: 2.280, W: 1.190, H: 2.400, state: 'static',
    fit: true,
    extras: { maxFallHeight: 2.330, safetyZoneSqM: 29.5 },
    note: 'MEASURED 7.400 x 2.000 x 3.160 m, so 3.25x, 1.68x and 1.32x over — the drawn ' +
          'item is 7.4 m of unsupported horizontal ladder between two end frames, which is ' +
          'not something that gets built. The topology is right (two end frames plus a ' +
          'horizontal ladder), so the derived fit applies and lands the span on 2.280 m.' });

  add('roundabout-playground', {
    name: 'Playground roundabout (KOMPAN Carousel with Seats NRO120)',
    source: 'KOMPAN Carousel with Seats (item NRO120), published product data: 5 ft 1 in x ' +
            '5 ft 1 in x 2 ft 8 in, 8 users, max fall height 2 ft 8 in',
    sourceUrl: 'https://www.kompan.com/en/us/p/nro120',
    L: 1.549, W: 1.549, H: 0.813, state: 'static',
    fit: true,
    note: 'MEASURED 6.000 m across and 1.200 m high — 3.87x and 1.48x over; a 6 m playground ' +
          'roundabout is three and a half adults wide. THE GENERATOR RULE IS NOT A ' +
          'CONVENIENCE HERE, IT IS THE ONLY SAFE FORM: `roundabout` unsuffixed is ' +
          'site-core\'s ROAD roundabout and `roundabout~1` is the transport library\'s, so ' +
          'an id pattern would put a 1.5 m play item\'s dimensions onto a highway feature — ' +
          'the gDumpTruck trap pointed the other way. The drawn item has no seats and the ' +
          'published one does, which changes neither the plan diameter nor the deck ' +
          'height.' });

  add('ferris-wheel-transportable', {
    name: 'Transportable Ferris wheel, 10.6 m (Zamperla Fiesta Balloon Wheel)',
    source: 'Zamperla Fiesta Balloon Wheel, published technical data: footprint 10 x 6.5 m, ' +
            'total height 10.6 m, 24 passengers',
    sourceUrl: 'https://www.zamperla.com/products/ferris-wheel-fiesta-balloon-2/',
    L: 10.000, W: 6.500, H: 10.600, state: 'deployed',
    fit: true,
    extras: { miniWheelFootprint: '8 x 4.8 m', midiWheelFootprint: '9.6 x 6.8 m', passengers: 24 },
    note: 'MEASURED 16.000 x 16.000 x 16.400 m. THE FINDING THAT MATTERS IS THE SECOND PLAN ' +
          'AXIS: a Ferris wheel\'s footprint is a RECTANGLE — Zamperla publishes 8 x 4.8, ' +
          '9.6 x 6.8 and 10 x 6.5 across the family — and gFerrisWheel\'s top branch draws a ' +
          'full DISC of the wheel radius, so the plan bound is about 2.46x too deep. That ' +
          'is overstatement, the safe direction, and the per-axis fit corrects it; the ' +
          'residue is that the plan SYMBOL becomes an ellipse where a real wheel in plan is ' +
          'the rim edge-on plus its A-frame. THE GENERATOR RULE MUST SIT BELOW THE GIANT ID ' +
          'RULE: one generator draws both size classes and only the id says which. state is ' +
          '`deployed` because a transportable wheel folds onto trailers, which is a ' +
          'different object on a plan.' });

  add('ferris-wheel-giant-40m', {
    name: 'Giant Ferris wheel, 40 m (Gerstlauer Giant Wheel 40m)',
    source: 'Gerstlauer Amusement Rides, Giant Wheel 40m published technical data: wheel diameter ' +
            '37 m, overall height 40 m, footprint 18.5 x 16 m',
    sourceUrl: 'https://www.gerstlauer-rides.de/en/products/giant-wheels',
    L: 37.000, W: 16.000, H: 40.000, state: 'deployed',
    fit: true,
    extras: { wheelDiameter: 37.000, legFootprint: '18.5 x 16 m',
              family50m: '46 m wheel / 21 x 23 m', family60m: '56 m wheel / 26 x 22 m' },
    note: 'L IS THE WHEEL DIAMETER, NOT THE 18.5 m FOOTPRINT WIDTH, and the distinction is ' +
          'the whole reason to read the spec carefully: the published footprint is where ' +
          'the LEGS meet the ground, the wheel projects far beyond it, and MCEXT bounds the ' +
          'drawn geometry including the rim — so the plan projection is diameter by frame ' +
          'depth. MEASURED 24.000 x 24.000 x 24.400 m, so the catalogue\'s "giant" wheel was ' +
          'smaller than the smallest giant wheel this manufacturer sells. THIS MUST BE AN ' +
          'ID RULE ANCHORED ABOVE the gFerrisWheel generator rule, because one generator ' +
          'draws both size classes.' });

  add('carousel-fairground-10m', {
    name: 'Fairground carousel, 9.7 m (Zamperla Merry Go Round 7m)',
    source: 'Zamperla Merry Go Round 7m, published technical data: footprint 9.7 m diameter, ' +
            'height 5.5 m, 24 passengers, 480 pph',
    sourceUrl: 'https://www.zamperla.com/product/merry-go-round-7m',
    L: 9.700, W: 9.700, H: 5.500, state: 'deployed',
    fit: true,
    note: 'MEASURED 10.800 x 10.800 x 7.200 m — 1.11x and 1.31x over, which makes this THE ' +
          'LEAST WRONG ASSET IN THE RECREATION LIBRARY and the only one whose plan ' +
          'dimension was already inside about 10%. Topology is right: platform, centre ' +
          'pole, ring of mounts, peaked canopy. Worth recording precisely because it is the ' +
          'counter-example — the class is NOT uniformly oversized, so a single blanket ' +
          'correction factor across recreation would be wrong here in the opposite ' +
          'direction.' });

  add('drop-tower-15m', {
    name: 'Drop tower, 15 m class (Zamperla Sky Tower 15)',
    source: 'Zamperla Sky Tower 15, published technical data: height 15 m, footprint 6.8 m ' +
            'diameter (7 m including safety area), 12 adults',
    sourceUrl: 'https://www.zamperla.com/product/sky-tower15',
    L: 6.800, W: 6.800, H: 15.000, state: 'deployed',
    fit: true,
    extras: { footprintIncludingSafetyArea: 7.000, riders: 12 },
    note: 'MEASURED 4.000 x 4.000 x 16.384 m: THE HEIGHT IS ALREADY WITHIN 9% AND IT IS THE ' +
          'PLAN THAT IS WRONG, 1.70x SHORT — the opposite direction from almost everything ' +
          'else in this library, and the dangerous one, because a 16 m tower whose seat ' +
          'carriages sweep around it was being handed a 4.000 m footprint. Same shape of ' +
          'error as the box-versus-swept-circle problem this table already records for ' +
          'slewing plant. The generator rule must sit BELOW the mega id rule.' });

  add('drop-tower-27m', {
    name: 'Drop tower, 27 m class (Zamperla Sky Tower 27)',
    source: 'Zamperla Sky Tower 27, published technical data: height 27 m on a 6.8 m diameter ' +
            'footprint, 12 adults',
    sourceUrl: 'https://www.zamperla.com/product/sky-tower27',
    L: 6.800, W: 6.800, H: 27.000, state: 'deployed',
    fit: true,
    extras: { riders: 12 },
    note: 'MEASURED 4.000 x 4.000 x 22.384 m. TWO ROWS RATHER THAN ONE BECAUSE THE SIZE ' +
          'CLASSES MUST SEPARATE: this is the mini/midi/large excavator failure in another ' +
          'domain, where a 12% model difference stood in for a 67% real one. The drawn med ' +
          'and mega differ by 1.37x in height and Zamperla\'s own range differs by 1.80x on ' +
          'an identical base, so after the fit the two classes separate the way the ' +
          'products do. ID RULE, ANCHORED ABOVE the gDropTower generator rule.' });

  add('teacup-ride-12', {
    name: 'Teacup ride, 12 cups (Zamperla Tea Cup 12)',
    source: 'Zamperla Tea Cup 12, published technical data: footprint 16 m diameter, height ' +
            '5.6 m, 60 passengers',
    sourceUrl: 'https://www.zamperla.com/product/tea-cup12',
    L: 16.000, W: 16.000, H: 5.600, state: 'deployed',
    fit: false,
    extras: { passengers: 60, fabbriComparable: '5.2 m to the tea-pot centre on a 14 m footprint' },
    note: 'MEASURED 10.000 x 10.000 x 1.560 m — the plan is 1.60x short and the HEIGHT is ' +
          '3.59x short, and those are not the same kind of error. Every published teacup ' +
          'ride\'s height figure is its CENTRE STRUCTURE, and gTeacups draws five cups on a ' +
          'bare turntable with nothing in the middle at all. So a three-axis fit would ' +
          'stretch the cups themselves to 3.6 m tall and report that as a measurement, ' +
          'while a plan-only row would leave the clash solid 4 m short in the direction ' +
          'that says it clears. NOT FITTED AND NOT MAPPED: the centre structure has to be ' +
          'drawn — and the cup count reconciled with whichever model is chosen — before ' +
          'this row measures anything real.' });

  /* -------------------------------------------------------------------- */
  /* W3 · SPACE                                                            */
  /* Most of this library is refused below, because "satellite", "planet"   */
  /* and "asteroid" name no class with a characteristic size. What is here  */
  /* is what a real agency or manufacturer publishes an envelope for — and  */
  /* the first row is the same defect this file's header opens with, one    */
  /* library over: a 4.9 m SUITED ASTRONAUT standing beside a gPerson       */
  /* corrected to Neufert's 1.750 m. It survived because MAP's first rule   */
  /* tests the GENERATOR and gAstronaut is a third human-figure generator   */
  /* that rule could never see.                                            */
  /* -------------------------------------------------------------------- */
  add('astronaut-suited-emu', {
    name: 'Suited astronaut, NASA EMU with SAFER (EVA configuration)',
    source: 'NASA EMU / LSS-SSA Hardware Data Book, ESOC-13 Rev. V (JSC-E-DAA-TN55224), ' +
            'Figure 1.11 "ISS EMU Dimensions"',
    sourceUrl: 'https://www.nasa.gov/wp-content/uploads/2017/02/esoc-13_rev._v_emu_hardware_data_book_jsc-e-daa-tn55224.pdf',
    L: 1.041, W: 0.578, H: 1.918, state: 'working',
    fit: true,
    note: 'MEASURED 1.800 x 1.800 x 4.900 m — a 4.9 m astronaut standing next to a gPerson ' +
          'corrected to 1.750 m. This is the 5.59 m people defect one library over, and it ' +
          'survived for exactly the reason MAP records: being a person is a property of the ' +
          'GENERATOR, and a THIRD human-figure generator was never going to be reached by a ' +
          'rule naming the other two. A SUITED FIGURE GENUINELY DIFFERS FROM A STANDING ' +
          'ADULT AND THE DIFFERENCE IS PUBLISHED, not guessed: 1.918 m against 1.750 m is ' +
          '+9.6% for the helmet, boots and suit, and the 0.578 m depth against ' +
          'person-standing\'s 0.400 m is +45% for the PLSS. The 1.041 m is NOT comparable ' +
          'with person-standing\'s 0.485 m shoulder breadth — it is measured across the ' +
          'ARMS — which is why the two rows must stay separate rather than this being ' +
          'mapped to the person row. The fit lands the right way round with no special ' +
          'handling: raw w == raw d, so longX is true and wantLong goes on x, which is the ' +
          'axis the generator draws the arms on.' });

  add('launch-vehicle-medium-f9', {
    name: 'Medium-lift orbital launch vehicle, stacked with standard fairing (Falcon 9 class)',
    source: 'SpaceX Falcon User\'s Guide, rev. 9 May 2025. Table 2-1 "Falcon Dimensions and ' +
            'Characteristics": Height 70 m (229.6 ft) including both stages, interstage and ' +
            'standard fairing; stage Diameter 3.66 m. Section 4.3: "The standard SpaceX Falcon ' +
            'fairing is 5.2 m (17.2 ft) in outer diameter and 13.2 m (43.5 ft) high overall."',
    sourceUrl: 'https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf',
    L: 5.200, W: 5.200, H: 70.000, state: 'deployed',
    fit: true, confidence: 'typical',
    extras: { coreDiameter: 3.660, fairingOuterDiameter: 5.200, fairingHeight: 13.200,
              extendedFairingVehicleHeight: 75.200, extendedFairingHeight: 18.700 },
    note: 'MEASURED 4.000 x 4.000 x 15.000 m — a 3.75:1 stubby toy rocket where every ' +
          'orbital launch vehicle is 10:1 to 19:1, so the clash solid was 4.7x short in ' +
          'height. L AND W ARE THE FAIRING outer diameter, which is the widest part of the ' +
          'vehicle; using the 3.66 m core would understate the envelope, which is the ' +
          'direction that says it clears. THE GOVERNING TEST FOR THE FIT IS THAT THE ' +
          'MEASURED AND PUBLISHED QUANTITIES ARE THE SAME QUANTITY: the drawn top view is a ' +
          'single disc that is the object\'s whole circular plan extent, and 5.2 m is the ' +
          'vehicle\'s whole circular plan extent. Two stylisations survive the fit and are ' +
          'cosmetic only because both are elevation-only and never enter the plan bounds — ' +
          'the tail fins, which a Falcon 9 does not have, and a taper running the wrong ' +
          'way. `typical` with a wide tolerance is right for a generic "Rocket": the class ' +
          'runs Atlas V 58.3 m, Ariane 5 about 53 m, Falcon 9 70 m, SLS Block 1 98.1 m. ' +
          'MAPPED BY ID, NOT BY GENERATOR: gRocket also draws the 48 `Heavy rocket` entries, ' +
          'which are refused below, and a generator rule would sweep them into this row.' });

  add('space-station-module-iss', {
    name: 'Pressurised space station module (ISS Destiny class)',
    source: 'NASA, International Space Station — Destiny Laboratory Module, facts and figures: ' +
            'Mass 32,000 pounds; Length 28 feet; Diameter 14 feet; Scientific racks 13; ' +
            'System racks 11',
    sourceUrl: 'https://www.nasa.gov/international-space-station/destiny-laboratory-module/',
    L: 8.534, W: 4.267, H: 4.267, state: 'static',
    fit: true, confidence: 'typical',
    extras: { columbusLength: 6.871, kiboJPMLength: 11.200 },
    note: 'MEASURED 6.900 x 2.800 x 2.800 m — fit factors 1.24 / 1.52 / 1.52, the most ' +
          'nearly isotropic fit in this class and the cleanest row in it. NASA publishes ' +
          'imperial only; the metric is the exact conversion of 28 ft and 14 ft at 0.3048, ' +
          'which is the practice the wheel-loader-l2350 row already records. W and H are ' +
          'the same number because the module is a cylinder. `typical` because the class is ' +
          'genuinely tight — the Shuttle payload bay fixed it, so Columbus, Destiny and ' +
          'Kibo are all 4.2-4.5 m in diameter. Two stylisations the bounding box does not ' +
          'care about: the drawn body is a box with a round end cap rather than a cylinder, ' +
          'and the drawn side solar arrays are elevation-only — which is actually correct ' +
          'against this reference, because Destiny carries no arrays.' });

  add('mars-rover-perseverance', {
    name: 'Mars surface rover, car-size six-wheeled (Perseverance / Curiosity class)',
    source: 'NASA Science, Mars 2020 Perseverance rover components, "Tech Specs" for the rover ' +
            'body: "Length: 10 feet (3 meters), Width: 9 feet (2.7 meters), Height: 7 feet ' +
            '(2.2 meters)"; the Mars 2020 landing press kit adds that the length excludes the ' +
            'robotic arm',
    sourceUrl: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/',
    L: 3.000, W: 2.700, H: 2.200, state: 'deployed',
    fit: true, confidence: 'typical',
    extras: { merClassLength: 1.600, apolloLRVLength: 3.100 },
    note: 'MEASURED 4.000 x 2.300 x 3.400 m. THE ONLY ASSET IN THE SPACE CLASS DRAWN TOO BIG ' +
          'IN TWO AXES — L 1.33x over and H 1.55x over — while being 1.17x narrow, so the ' +
          'correction runs in both directions and no single factor exists; that is exactly ' +
          'what the per-axis derived fit is for. Topology matches closely: six wheels in ' +
          'three pairs, a body box, a raised mast, all drawn with box() and carrying no ' +
          'VIEW guard, so the plan is a complete plan and the fit is measured-onto-published ' +
          'like for like. The published length EXCLUDES the robotic arm and the drawn rover ' +
          'has no arm, so the two claims match. state is `deployed` because the ' +
          'cruise-stowed rover is folded inside the aeroshell.' });

  add('lunar-lander-apollo-lm', {
    name: 'Crewed lunar lander, landing gear extended (Apollo Lunar Module)',
    source: 'Grumman Aerospace Corporation / NASA, Apollo News Reference — Lunar Module, ' +
            '"QUICK REFERENCE DATA: DIMENSIONS": LM Height 22 ft 11 in (legs extended); ' +
            'Diameter 31 ft (diagonally across extended landing gear); Ascent stage Height ' +
            '12 ft 4 in, Diameter 14 ft 1 in; Descent stage Height 10 ft 7 in, Diameter 13 ft 10 in',
    sourceUrl: 'https://www.apollojournals.org/alsj/LM04_Lunar_Module_ppLV1-17.pdf',
    L: 6.681, W: 6.681, H: 6.985, state: 'deployed',
    fit: false, confidence: 'derived',
    extras: { landingGearDiagonal: 9.449, descentStageDiameter: 4.216, descentStageHeight: 3.226,
              ascentStageDiameter: 4.293, ascentStageHeight: 3.759 },
    note: 'H is published directly: 22 ft 11 in = 275 in = 6.985 m. L AND W ARE DERIVED, ' +
          'because the published plan figure is the 31 ft (9.4488 m) DIAGONAL across ' +
          'opposite footpads and the four legs sit at the corners of a square, so the ' +
          'axis-aligned box across them is 9.4488/sqrt(2) = 6.681 m. MEASURED ' +
          '2.800 x 2.800 x 6.200 m. NOT FITTED AND NOT MAPPED: the legs, footpads and ' +
          'ascent-stage detail are drawn only inside `if(VIEW!==\'top\')`, so the plan ' +
          'bounds are the descent-stage BODY box alone, and the real descent stage is ' +
          '4.216 m across. A fit onto 6.681 would therefore scale the BODY up to the LEG ' +
          'SPAN — the governing test failing, because the measured quantity and the ' +
          'published quantity are not the same quantity, and published/measured is then a ' +
          'fudge arrived at by arithmetic instead of by typing. Draw the legs and footpads ' +
          'in the top view and this row becomes fittable; the shape is otherwise an exact ' +
          'Apollo LM, so it is a top-view fix and not a rebuild from scratch. Until then ' +
          'the clash solid is 2.4x short in plan.' });

  add('space-shuttle-stack', {
    name: 'Space Shuttle launch stack on the pad (orbiter + external tank + two SRBs)',
    source: 'NASA, The Space Shuttle (reference): "Length: Space Shuttle: 184 feet"; orbiter ' +
            '"Length: 122 feet", "Height (on runway): 57 feet", "Wingspan: 78 feet"',
    sourceUrl: 'https://www.nasa.gov/reference/the-space-shuttle/',
    L: 23.774, W: 23.774, H: 56.083, state: 'deployed',
    checkAxes: ['L', 'H'], fit: false,
    extras: { orbiterLength: 37.186, orbiterWingspan: 23.774, orbiterHeightOnRunway: 17.374,
              stackHeight: 56.083 },
    note: 'MEASURED 5.600 x 3.600 x 12.288 m against a published 184 ft stack: 4.6x short in ' +
          'height and about 4.2x short in the widest plan axis. L IS THE ORBITER\'S ' +
          'WINGSPAN, which is the widest part of the whole stack — wider than the tank and ' +
          'both boosters together. W IS A PLACEHOLDER EQUAL TO L AND IS DELIBERATELY NOT ' +
          'CHECKED, exactly the mobile-crane-ltm11200-rigged pattern: the stack\'s plan ' +
          'DEPTH is not published in the cited reference and asserting a figure there would ' +
          'mean inventing one. NOT FITTED AND NOT MAPPED, for two independent reasons. ' +
          '(1) The orbiter box and its wing quads are drawn only inside ' +
          '`if(VIEW!==\'top\')`, so the plan bounds are the tank and the two SRBs alone and ' +
          'the widest element of the real stack is absent from the plan entirely; scaling ' +
          '5.600 up to 23.774 would inflate the TANK-AND-BOOSTER cluster to the orbiter\'s ' +
          'wingspan. (2) The proportions BETWEEN elements are wrong, so no single scale ' +
          'fixes it anyway — the drawn orbiter is 7.0 long against a 12.0 tank where the ' +
          'real orbiter is 37.186 m and its wingspan is several times the tank\'s ' +
          'diameter.' });

  /* -------------------------------------------------------------------- */
  /* W3 · INTERIORS                                                        */
  /* Office furniture is the highest-count family in the whole catalogue —  */
  /* 5,185 desks and 384 chairs — and it was drawn at roughly six times     */
  /* life: an ATX tower 1.40 x 3.00 x 3.60 m, a task chair 3.82 m tall, a   */
  /* two-drawer filing cabinet 3.60 m tall. The filing cabinets carry the   */
  /* familiar fingerprint as well: gFiling reads p.drawers for the number   */
  /* of drawer FRONTS it draws and never for size, so the 2-, 3- and        */
  /* 4-drawer cabinets measured IDENTICALLY. Three published heights are    */
  /* what finally separates them, and 1321 - 1016 = 1016 - 711 = 305 mm     */
  /* exactly, one twelve-inch drawer pitch, which is checkable on paper.    */
  /* -------------------------------------------------------------------- */
  var BISLEY_NOTE = 'Bisley BS foolscap filing cabinet, manufacturer product page';

  add('desktop-tower-atx', {
    name: 'ATX mid-tower desktop PC case',
    source: 'Fractal Design Define 7 ATX mid-tower, manufacturer product sheet — case dimensions ' +
            '547 x 240 x 475 mm; without feet/protrusions 533 x 240 x 451 mm',
    sourceUrl: 'https://www.fractal-design.com/products/cases/define/define-7/',
    L: 0.475, W: 0.240, H: 0.547, state: 'static',
    fit: true,
    note: 'THE CLEANEST FIT IN THIS CLASS — right shape, right orientation, wrong size by a ' +
          'factor of six. gDesktopPC draws a 1.40 x 3.00 x 3.60 m box with the front panel ' +
          'on the -y face, so x IS the front width and y IS the depth; the drawn plan aspect ' +
          '(2.14) matches the real one (475/240 = 1.98) in sign as well as roughly in size, ' +
          'so _fitFactors resolves longX = false and the front panel stays on the 240 mm ' +
          'face. WATCH THE LABEL: Fractal prints "Case dimensions (LxWxH) 547 x 240 x ' +
          '475 mm", calling the VERTICAL dimension L, and transcribing that string in the ' +
          'order printed would put a 475 mm-tall, 547 mm-deep tower in this table with ' +
          'every gate green over it.' });

  add('office-task-chair', {
    name: 'Office task chair on a five-star castor base',
    source: 'Herman Miller Aeron Chair, B size, published dimensions — height 933-1045 mm, ' +
            'width 719 mm, depth 698-719 mm, seat height 376-579 mm, seat depth 432 mm',
    sourceUrl: 'https://www.hermanmiller.com/en_afr/products/seating/office-chairs/aeron-chair/specs/',
    L: 0.719, W: 0.719, H: 1.045, state: 'working',
    fit: true, confidence: 'typical',
    range: { H: [0.933, 1.045] },
    extras: { seatHeightMin: 0.376, seatHeightMax: 0.579, seatDepth: 0.432,
              en1335TypeAMinSeatHeight: 0.400 },
    note: 'THE ROW CARRIES A RANGE ON H because overall height is an ADJUSTMENT and not a ' +
          'dimension, and H is set to the TOP of it deliberately: for a clash solid the ' +
          'tall end is the overstating direction, which is the safe one. Drawn ' +
          '1.750 x 1.712 x 3.820 m — 2.43x in plan and 3.66x in height. The topology is a ' +
          'genuine task chair and the plan is near-square in both the drawing and the ' +
          'product, so there is no transposition risk. IT CARRIES ITS OWN CROSS-CHECK, ' +
          'which is why this row is worth more than its entry count: the drawn seat surface ' +
          'sits at z = 1.92, and 1.92 x 0.2736 = 0.525 m — inside Herman Miller\'s published ' +
          '376-579 mm seat range and above BS EN 1335-1\'s 400 mm minimum for a type A ' +
          'chair, neither of which mc-extents.js ever reads. MAPPED BY ID AND NOT BY ' +
          'GENERATOR: gOfficeChair also draws executive-chair-* (genuinely taller and ' +
          'needing its own row) and drafting-chair-*, which is drawn bit-for-bit as the ' +
          'task chair and is a nameplate defect rather than a size one.' });

  add('office-desk-fixed-height', {
    name: 'Fixed-height office work table / desk',
    source: 'BS EN 527-1:2011, Office furniture — Work tables and desks — Part 1: Dimensions ' +
            '(published 31 May 2011): fixed-height desks 740 mm +/- 20 mm; height-adjustable ' +
            '650-850 mm seated and 650-1250 mm sit/stand; legroom depth 800 mm at floor level; ' +
            'legroom width 850 mm fixed / 1200 mm adjustable',
    sourceUrl: 'https://knowledge.bsigroup.com/products/office-furniture-work-tables-and-desks-dimensions',
    L: 1.600, W: 0.800, H: 0.740, state: 'static',
    checkAxes: ['H'], fit: false,
    range: { H: [0.720, 0.760] },
    extras: { legroomDepthMin: 0.800, legroomWidthMinFixed: 0.850, desktopMaxFrontEdge: 0.055 },
    note: 'ONLY H IS A PUBLISHED FIGURE, which is why checkAxes names one axis. L and W are ' +
          'a representative desk and are NOT checked — said here rather than letting a ' +
          'reader assume all three were sourced, which is the LTM 11200 placeholder ' +
          'argument. The standard bounds the plan from BELOW only: 800 mm legroom depth and ' +
          '850 mm legroom width are minima the desktop must cover, not the desktop\'s own ' +
          'size. NOT FITTED AND NOT MAPPED, and the reason is the sharpest in this wave: a ' +
          'z-only fit is exactly what a height-only checkAxes would produce, and it leaves ' +
          '5.00 x 2.60 m desk 0.74 m high — THE SHAPE BECOMES WORSE WHILE THE GATE GOES ' +
          'GREEN. Drawn 5.00 x 2.60 x 2.20 m: height 2.97x, length 3.1x against a 1600 mm ' +
          'desk, depth 3.25x against 800 mm. THE HUTCH VARIANT IS A SEPARATE TRAP FOR ' +
          'WHOEVER REBUILDS IT: half the entries carry hutch:true and measure 4.80 m tall, ' +
          'and their bounding height legitimately exceeds the work-surface height, so a ' +
          'known-answer case must pick a NON-HUTCH desk exactly as site-cabin-jackleg\'s ' +
          'case picks a cabin without air conditioning.' });

  add('filing-cabinet-2-drawer', {
    name: 'Two-drawer foolscap steel filing cabinet',
    source: BISLEY_NOTE + ' (BS2E) — height 711 mm, width 470 mm, depth 622 mm; drawer internal ' +
            '258 x 385 x 535 mm',
    sourceUrl: 'https://www.bisley.com/shop/bs-filing-cabinet-foolscap-two-drawer/',
    L: 0.622, W: 0.470, H: 0.711, state: 'static',
    fit: true,
    extras: { drawerPitch: 0.305 },
    note: 'THIS ROW AND THE NEXT TWO REPAIR A NAMEPLATE DEFECT WITHOUT TOUCHING THE ' +
          'GENERATOR, which is the only place in interiors where the derived fit does real ' +
          'work beyond scale. gFiling reads p.drawers for the number of drawer FRONTS it ' +
          'draws and never for size, so 2-, 3- and 4-drawer cabinets all measured ' +
          '1.800 x 2.400 x 3.600 m — three names, one object, the record-machine ' +
          'fingerprint at 24 entries. Three published heights make the family separate. ' +
          'Orientation is safe: the drawer fronts are on the +y face of a carcass whose x ' +
          'extent is 1.8, so x fits to 0.470 and y to 0.622, the right way round. THE ' +
          'FAMILY CARRIES A DIVISIBLE IDENTITY worth checking instead of three separate ' +
          'comparisons: 1321 - 1016 = 1016 - 711 = 305 mm exactly, one twelve-inch drawer ' +
          'pitch, so a case can divide and stay true if Bisley restyles the plinth.' });

  add('filing-cabinet-3-drawer', {
    name: 'Three-drawer foolscap steel filing cabinet',
    source: BISLEY_NOTE + ' (BS3E) — height 1016 mm, width 470 mm, depth 622 mm',
    sourceUrl: 'https://www.bisley.com/shop/bs-filing-cabinet-foolscap-3-drawer/',
    L: 0.622, W: 0.470, H: 1.016, state: 'static',
    fit: true,
    extras: { drawerPitch: 0.305 },
    note: 'The same carcass as the two-drawer unit, one drawer pitch taller: ' +
          '1016 - 711 = 305 mm. Drawn 1.800 x 2.400 x 3.600 m, identical to the 2- and ' +
          '4-drawer units; the fit is what makes the three sizes separate.' });

  add('filing-cabinet-4-drawer', {
    name: 'Four-drawer foolscap steel filing cabinet',
    source: BISLEY_NOTE + ' (BS4E) — height 1321 mm, width 470 mm, depth 622 mm',
    sourceUrl: 'https://www.bisley.com/shop/bs-filing-cabinet-foolscap-four-drawer/',
    L: 0.622, W: 0.470, H: 1.321, state: 'static',
    fit: true,
    extras: { drawerPitch: 0.305 },
    note: 'Two drawer pitches above the two-drawer unit: 1321 = 711 + 2 x 305. Drawn ' +
          '1.800 x 2.400 x 3.600 m like the others. THIS IS THE ROW THAT PROVES THE FAMILY ' +
          'WAS COLLAPSED — a four-drawer cabinet and a two-drawer cabinet cannot be the ' +
          'same height, and until these three rows existed nothing in the tree asked.' });

  /* REPRESENTATIVE CASE-GOODS ENVELOPES. These four rows deliberately map
     WHOLE visual finish/configuration families to one published product
     envelope each. The catalogue variants change finish, doors, handles,
     mirrors, drawer layout and decorative legs; they are not separately
     sourced products. A representative, named coordination envelope is an
     honest replacement for the oversized generator default, not a claim that
     every finish variant is the cited IKEA article. */
  add('cabinet-havsta-81', {
    name: 'Cabinet — representative HAVSTA envelope',
    source: 'IKEA HAVSTA cabinet with base, article 005.292.42 — width 81 cm, depth 47 cm, height 89 cm',
    sourceUrl: 'https://www.ikea.com/ca/en/p/havsta-cabinet-with-base-white-00529242/',
    L: 0.810, W: 0.470, H: 0.890, state: 'static', fit: true,
    configuration: 'representative coordination envelope for the gCabinet visual finish/configuration family',
    note: 'REPRESENTATIVE, NOT INFERRED FROM THE DRAWING. gCabinet passes `w` as the ' +
          'first dimension of every carcass/top box, `d` as the second and `H` as the ' +
          'vertical origin/extent; doors, handles and legs only decorate those faces. ' +
          'Therefore generator x = product width, y = depth and z = height. The 0.810 x ' +
          '0.470 x 0.890 m envelope comes from IKEA, while the catalogue\'s finish, door, ' +
          'handle, wide/tall and leg variants remain visual configurations rather than ' +
          'separate manufacturer claims.' });

  add('dresser-malm-3-drawer', {
    name: 'Three-drawer dresser — representative MALM envelope',
    source: 'IKEA MALM buying guide, 3-drawer chest — width 80 cm, depth 48 cm, height 78 cm',
    sourceUrl: 'https://www.ikea.com/in/en/files/pdf/68/71/6871a0bc/malm_buying_guide_na_a4.pdf',
    L: 0.800, W: 0.480, H: 0.780, state: 'static', fit: true,
    configuration: 'representative coordination envelope for the gDresser visual finish/configuration family',
    note: 'REPRESENTATIVE, NOT INFERRED FROM GENERATOR GEOMETRY. gDresser builds its ' +
          'carcass and top with `w` on x, `d` on y and `H` on z; `rows` and `cols` divide ' +
          'the front face and do not transpose an axis. Generator x is therefore width, ' +
          'y depth and z height. IKEA\'s published 0.800 x 0.480 x 0.780 m MALM envelope ' +
          'coordinates the whole finish/drawer-layout family without pretending each ' +
          'rendered front is a separately measured MALM configuration.' });

  add('wardrobe-pax-forsand-100', {
    name: 'Wardrobe — representative PAX/FORSAND envelope',
    source: 'IKEA PAX/FORSAND wardrobe combination, article 895.591.55 — width 100 cm, depth 60 cm, height 201.2 cm',
    sourceUrl: 'https://www.ikea.com/ca/en/p/pax-forsand-wardrobe-combination-dark-gray-dark-gray-s89559155/',
    L: 1.000, W: 0.600, H: 2.012, state: 'static', fit: true,
    configuration: 'representative coordination envelope for the gWardrobe visual finish/configuration family',
    note: 'REPRESENTATIVE, NOT CHOSEN BY APPEARANCE. gWardrobe draws the enclosing body ' +
          'as box(0,0,0,w,d,H): x is width, y is depth and z is height. Door count and ' +
          'the optional mirror subdivide or face that same body without changing the axis ' +
          'meaning. The entire visual family is therefore fitted to IKEA\'s published ' +
          '1.000 x 0.600 x 2.012 m PAX/FORSAND envelope.' });

  add('sideboard-besta-180', {
    name: 'Sideboard — representative BESTA envelope',
    source: 'IKEA BESTA storage combination with doors, article 995.754.66 — width 180 cm, depth 42 cm, height 74 cm',
    sourceUrl: 'https://www.ikea.com/ca/en/p/besta-storage-combination-with-doors-white-faellsvik-anthracite-s99575466/',
    L: 1.800, W: 0.420, H: 0.740, state: 'static', fit: true,
    configuration: 'representative coordination envelope for the gSideboard visual finish/configuration family',
    note: 'REPRESENTATIVE, NOT DERIVED FROM THE GENERATOR\'S DEFAULTS. gSideboard places ' +
          'its carcass/top and four legs with `w` along x, `d` along y and `H` along z; ' +
          'door count changes only the front subdivision. Generator x is width, y depth ' +
          'and z height, so IKEA\'s published 1.800 x 0.420 x 0.740 m BESTA envelope can ' +
          'be fitted without transposing the long plan axis.' });

  add('laptop-notebook-15', {
    name: '15.6-inch notebook computer',
    source: 'Dell Latitude 5550 Owner\'s Manual, Dimensions and weight — width 357.80 mm, ' +
            'depth 233.30 mm, height 20.80 mm (front) / 22.80 mm (rear), 1.62 kg minimum',
    sourceUrl: 'https://www.dell.com/support/manuals/en-us/latitude-15-5550-laptop/latitude-5550-owners-manual/dimensions-and-weight?guid=guid-362133ff-c5e8-4acd-a164-4ce876572659&lang=en-us',
    L: 0.3578, W: 0.2333, H: 0.0228, state: 'working',
    checkAxes: ['L', 'W'], fit: false,
    extras: { heightFront: 0.0208, heightRear: 0.0228, massKg: 1.62 },
    note: 'H IS THE CLOSED CHASSIS AND THE GENERATOR DRAWS THE LID OPEN, so H is recorded ' +
          'and NOT checked — the open-lid height is a pose rather than a dimension. Drawn ' +
          '2.600 x 1.800 x 1.900 m, i.e. a laptop the size of a small car. NOT MAPPED, and ' +
          'that follows from the two facts above rather than from caution: with checkAxes ' +
          '[' + '\'L\',\'W\'' + '] a fit corrects the plan to 0.358 x 0.233 m and LEAVES THE ' +
          'HEIGHT AT 1.900 m, because an axis a row does not publish is not scaled — a ' +
          'laptop nearly two metres tall, with the plan right and the clash solid absurd. ' +
          'The generator has to draw the machine at its real size, and the lid pose is a ' +
          'second decision after that.' });

  /* ==================================================================== */
  /* WHAT WE REFUSED TO SHIP, AND WHY                                      */
  /* Each of these failed a cross-check. Carrying them with a caveat would  */
  /* mean the caveat is the only thing standing between the number and a    */
  /* drawing, and nobody reads a caveat.                                    */
  /* ==================================================================== */
  reject('tower-crane-luffing-jib-potain-mr225a',
    'fails the load-moment identity that every top-slewing designation encodes: ' +
    '14 t x 18.7 m = 262 tonne-metres against a designation of 225, a 16% miss. ' +
    'The 154 EC-H (6 x 25.7 = 154) and the MDT 219 (10 x 21.9 = 219) both pass ' +
    'exactly, so the check is sound and this row is not. Separately, a luffing ' +
    'crane modelled as a fixed envelope is the wrong abstraction anyway — variable ' +
    'radius is the entire reason the machine exists.');
  reject('us-office-trailer',
    'the published height is the INTERIOR ceiling clear (2.438 m = 8 ft), not an ' +
    'external envelope. A US single-wide sits on a chassis and wheels, so the real ' +
    'height is roughly 3.2-3.5 m with the floor about 0.9 m off the ground. About a ' +
    'metre short, and it is precisely the error that makes a rendered compound look ' +
    'like a model railway.');
  reject('skip-volumes',
    'the skip series does not cohere. Prism volume divided by nominal cubic yards ' +
    'gives ratios of 0.96, 0.81, 1.50, 1.57, 1.04 and 1.19 across the six sizes — a ' +
    'tapered skip should give a consistent 1.10-1.35 and these run in BOTH ' +
    'directions. The source is marketing copy rather than a drawing. Footprints may ' +
    'be usable for space planning; volume must never be derived from them.');
  reject('rigid-truck-777-height',
    'the row headline height (4.73 m, top of ROPS) is contradicted by its own front ' +
    'canopy figure of 5.20 m. The canopy overhangs the cab and is part of the static ' +
    'envelope with the body down, so the headline is 0.47 m short IN THE DIRECTION ' +
    'THAT SAYS IT CLEARS. Any overhead-clearance check run off it is wrong.');

  /* The four record machines that did NOT get a row. Each catalogue entry has
     been renamed in core3.js to its machine CLASS, so nothing on screen claims
     a model designation this table cannot measure. Re-add the name here the
     day the figure is sourced — not before. */
  reject('crawler-crane-lr-13000',
    'Liebherr publishes ONE overall dimension for it — track width 14 m — and the ' +
    'other two are configuration: max boom is 120 m + 126 m of jib, so "length" and ' +
    '"height" are a rigging choice, not a dimension. Fitting width alone would scale ' +
    'one axis by 1.75 and leave the other two, which distorts the machine rather than ' +
    'sizing it. The 14 m track width is a real figure and belongs in a row the day ' +
    'the undercarriage length is published beside it.');
  reject('crawler-crane-xgc88000',
    'the XCMG XGC88000 is a 4000 t crawler crane and no overall envelope could be ' +
    'sourced to spec-sheet standard. It measured 23.79 x 8.00 x 42.44 m — the Liebherr ' +
    'LR 1300 SX, a 300 t machine, i.e. one thirteenth of the capacity — because it ' +
    'shares that generator. Refusing the row is the point: the alternative is a ' +
    'plausible number for a machine nobody checked.');
  reject('ring-crane-sgc-250',
    'THE TOPOLOGY IS WRONG, so no fit could rescue it even with figures. The Sarens ' +
    'SGC-250 "Big Carl" runs on a RING TRACK with a ballast wagon on the same ring; ' +
    'it is not a crawler crane and does not have crawlers. The catalogue drew it with ' +
    'gCrawlerCrane. mc-extents.js scales size and never shape, and the header rule ' +
    'says so: never set fit where the topology is wrong.');
  reject('dozer-acco-super',
    'a single prototype built in Italy in the 1980s that never entered production. ' +
    'The circulating dimensions trace to enthusiast pages rather than to a ' +
    'manufacturer document, and they disagree with each other. An unverifiable figure ' +
    'for a one-off machine is the definition of the uncertain row this table does not ' +
    'ship.');


  /* ====================================================================
     THE W3 REFUSALS.

     Forty-one entries in the five W3 libraries were measured, found wrong or
     unmeasurable, and get NO ROW. Three reasons recur and each is worth
     naming, because "we could not source it" is a different claim from "there
     is nothing to source" and both are different from "the figure exists and
     the drawn object is not the thing it describes":

       NO CLASS DIMENSION EXISTS. A terminal building, a station building, a
       dry dock, a launch pad, a satellite, a planet — the entry names a
       CATEGORY whose members span orders of magnitude, so any figure would be
       one chosen to match the geometry already drawn, which is the definition
       of the uncertain row this table does not ship.

       THE FIGURE EXISTS AND WE COULD NOT REACH IT. A ship-to-shore crane's
       gauge and back reach, a jet bridge's retracted length, a linkspan's
       width: real published numbers behind a paywall or a JS-rendered page.
       These say exactly what would close them.

       THE DEFECT IS NOT IN THE BOUNDING BOX. A tunnel portal's box is roughly
       right and its BORE is 1.30 m too narrow for the carriageway through it;
       a toll canopy's plan cannot be sourced and its 4.000 m soffit is level
       with the UK legal vehicle height. A box row would put a green tick over
       the actual defect.
     ==================================================================== */
  /* W3 · transport infrastructure */
  reject('ship-to-shore-crane',
    'THE SHAPE IS THE FIRST REASON. Measured 9.000 x 6.000 x 12.800 m, and that plan ' +
    'footprint is the PORTAL ONLY: gGantryCrane2 draws the waterside outreach boom and ' +
    'the landside back-reach inside `if(VIEW!==\'top\')`, and mc-extents.js takes plan ' +
    'bounds from the top view. The full drawn object spans 21.00 m; MCEXT reports 9.00 m ' +
    'and the clash solid is built from that, so the boom — the entire reason a ' +
    'ship-to-shore crane interferes with anything — is not in the clash volume at all. ' +
    'That is the plan-symbol defect mirrored: there the plan was too big, here it is ' +
    'missing the body, and no row and no fit repairs a footprint that omits the object. ' +
    'SECOND REASON, which is why there is no row even for the rebuild target: Liebherr ' +
    'publishes outreach (38 / 45 / 53 m by class) and lift height, but neither the RAIL ' +
    'GAUGE nor the BACK REACH could be sourced, so the across-quay axis cannot be stated. ' +
    'One terminal operator\'s crane data sheet closes it, and the row should then be ' +
    'state:\'working\' with the stowed boom recorded as a different object.');
  reject('suspension-bridge-main-span',
    'NO SOURCEABLE CLASS DIMENSION, and this is a naming problem before it is a sizing ' +
    'problem. Measured 16.000 x 3.000 x 9.000 m. A suspension bridge\'s main span is a ' +
    'design outcome running from roughly 150 m to 2,000 m and the catalogue entry names no ' +
    'bridge, so there is nothing to meet — the record-machine argument pointed at a ' +
    'structure. What must NOT happen is a fitted deck width alone: bridge-deck-s2\'s ' +
    '8.500 m is a legitimate figure and applying it here would leave an object 16 m long ' +
    'and 8.5 m wide calling itself a suspension bridge, which is worse than what is drawn ' +
    'now because it looks corrected. The drawn proportions also ENCODE the span — the main ' +
    'cable sags from 9 to 4.5 m over 9 m, a sag/span ratio of 0.5 against a real 0.1 — so ' +
    'even a three-axis fit would produce a stretched picture of this object rather than a ' +
    'suspension bridge. Rebuild to a named bridge, or drop the type name.');
  reject('cable-stayed-bridge-main-span',
    'NO SOURCEABLE CLASS DIMENSION, but unlike the suspension bridge there IS a published ' +
    'range and the drawn object fails it by two orders of magnitude, which is worth ' +
    'recording. Measured 16.000 x 3.000 x 12.000 m. FHWA-HRT-05-083 (August 2007) puts ' +
    'cable-stayed bridges in the 150 m to 460 m span range ' +
    '(https://www.fhwa.dot.gov/publications/research/infrastructure/bridge/05083/chap1.cfm). ' +
    'A 16 m cable-stayed bridge is not a scale error, it is a category error: at 16 m ' +
    'every design guide gives you a beam, and the catalogue already draws one. A range is ' +
    'containment rather than a target so it cannot drive a fit, and fitting the deck width ' +
    'alone produces the same absurd stub as the suspension bridge. The FHWA range is the ' +
    'right thing to gate a REBUILT one against.');
  reject('airport-terminal-building',
    'NO CLASS DIMENSION EXISTS. Measured 16.000 x 8.000 x 5.400 m. A terminal building\'s ' +
    'envelope is a capacity outcome — IATA\'s Airport Development Reference Manual sizes ' +
    'terminals in square metres per peak-hour passenger, not in an envelope — and real ' +
    'terminals run from a single-room regional building to a 1.7 km pier. There is no ' +
    'standard, no design-guide figure and no manufacturer to cite, so any row would be a ' +
    'figure invented to fill the column. MCDIM.check() returning null, "not checked", is ' +
    'already the honest answer for these three entries.');
  reject('aerodrome-control-tower',
    'NO CLASS DIMENSION EXISTS. Measured 2.800 x 2.800 x 14.800 m. A control tower\'s ' +
    'height is a SITE-SPECIFIC LINE-OF-SIGHT result — the cab has to see the whole ' +
    'manoeuvring area and the approach, so the answer is different at every aerodrome and ' +
    'is derived from the site rather than from a standard. ICAO Annex 14 and EASA ' +
    'CS-ADR-DSN constrain what may be built NEAR a runway (obstacle limitation surfaces) ' +
    'and say nothing about how tall a tower is. 14.80 m is not implausible for a small ' +
    'aerodrome, so there is not even a demonstrable defect to correct here.');
  reject('aircraft-hangar',
    'NO CLASS DIMENSION SOURCED, but there IS a demonstrable defect and it is checkable ' +
    'inside the catalogue with no external figure at all. Measured 14.000 x 10.000 x ' +
    '10.000 m. A hangar is sized to the aeroplane it houses, and the aeroplane sizes ARE ' +
    'published: EASA CS-ADR-DSN Table A-1 gives code letter by wingspan (A up to 15 m, B ' +
    '15-24, C 24-36, D 36-52, E 52-65, F 65-80), so a 14.00 m hangar admits nothing above ' +
    'code A. Turning that into a ROW needs a door-opening clearance allowance over the ' +
    'wingspan, which is a design-guide number that could not be fetched (UFC 4-211-01 is ' +
    'over the fetch limit and the WBDG mirror refuses), so a row here would be part ' +
    'standard and part invention. WHAT IS ASSERTED INSTEAD NEEDS NO SOURCE: the airliner ' +
    'is 39.47 m long in plan against a hangar 14.00 m wide, so THE AEROPLANE DOES NOT FIT ' +
    'IN THE HANGAR — a catalogue-internal identity of exactly the shape asset_scale.js ' +
    'already uses for "the artic is longer than every rigid", free, and true whichever way ' +
    'the two are eventually sized.');
  reject('passenger-boarding-bridge',
    'NO PUBLISHED FIGURE SOURCED. Measured 6.000 x 1.200 x 4.000 m. A jet bridge is ' +
    'TELESCOPIC — its length is a range, typically 12 to 18 m retracted and 30 to 46 m ' +
    'extended — so the honest row is a range on L plus a fixed tunnel cross-section, and ' +
    'both need a manufacturer data sheet (thyssenkrupp Airport Systems, JBT AeroTech or ' +
    'ADELTE) that was not reached. The drawn 6.00 m is short even against a retracted ' +
    'bridge, but a row stating a number nobody has read is the thing this table exists to ' +
    'stop. One reachable spec sheet closes this cleanly and it is a single asset.');
  reject('roro-linkspan',
    'NO PUBLISHED CLASS FIGURE SOURCED. Measured 10.000 x 4.000 x 0.300 m. A ro-ro ' +
    'linkspan is sized to the design vessel\'s stern ramp and to the berth\'s tidal range, ' +
    'so width and length are project figures rather than class figures; the code of ' +
    'practice that would give them (BS 6349-8) is behind a paywall, and quoting a figure ' +
    'from a document nobody has read would be exactly the wrong outcome. A port ' +
    'authority\'s published linkspan data or a MacGregor/TTS data sheet would give a ' +
    'defensible typical row. Note that the drawn height is a MEASURING ARTEFACT rather ' +
    'than a claim: the inclined deck quad is drawn inside `if(VIEW!==\'side\')`, so the ' +
    'side view sees only the 0.30 m slab and MCEXT reports a ramp with no rise.');
  reject('graving-dry-dock',
    'NO CLASS DIMENSION EXISTS FOR AN UNNAMED DOCK. Measured 14.000 x 9.000 x 0.600 m. A ' +
    'graving dock is built around its design vessel and published lengths run from about ' +
    '100 m to over 500 m; the catalogue entry is called "Dry dock" and names none, so ' +
    'there is nothing for a row to meet. Naming the row after a specific dock and applying ' +
    'it to a generic asset would be the record-machine defect run backwards — attaching a ' +
    'specific claim to geometry that never made one. Two honest routes: name the asset ' +
    'after a real dock whose operator publishes its dimensions, or leave it unchecked. ' +
    'What is NOT available is a "typical dry dock".');
  reject('railway-track-ballast-width',
    'NO ROW, AND THE FINDING IS THAT THERE IS ALMOST NOTHING WRONG WITH IT. Measured ' +
    '12.000 x 3.000 x 0.150 m, and the drawn track gauge is 1.400 m (rails at y 0.80-0.92 ' +
    'and 2.20-2.32, so centres 0.86 and 2.26) against the European standard nominal ' +
    '1 435 mm fixed by the INF TSI, Commission Regulation (EU) No 1299/2014. That is 2.4% ' +
    'out on the one dimension in this asset that is legally defined, which makes it the ' +
    'LEAST WRONG asset in transport infrastructure by a wide margin. A row is refused ' +
    'because the checkable axis would be the TOP-OF-BALLAST WIDTH — sleeper length plus ' +
    'two ballast shoulders — and while sleeper lengths are published (2.50 m UK, 2.60 m ' +
    'UIC) the shoulder width sits in UIC 719R and infrastructure-manager standards that ' +
    'are paywalled. Deriving 3.30 m from a published sleeper plus an unpublished shoulder ' +
    'would put an invented number in a sourced-looking row. A case could check the drawn ' +
    'RAIL SPACING directly, which is a stronger check than the bounding box because the ' +
    'gauge is the thing that is actually defined.');
  reject('railway-station-building',
    'NO CLASS DIMENSION EXISTS. Measured 17.000 x 7.000 x 5.000 m. A station building is ' +
    'architecture — there is no standard, no design-guide envelope and no class figure. ' +
    'The published railway figures that DO exist (platform height above the running ' +
    'surface, obstacle-free width) belong to the PLATFORM, which the catalogue draws as a ' +
    'separate asset. Rejecting this one is not a gap, it is the correct answer.');
  reject('platform-canopy',
    'NO CHECKABLE AXIS, AND NO DEFECT TO CORRECT — both worth stating rather than leaving ' +
    'as a silent gap. Measured 12.000 x 3.000 x 3.600 m; the slab is 0.600 m high and the ' +
    'canopy tops out at 3.600 m. The two published figures are real and were read: the TSI ' +
    'PRM, Commission Regulation (EU) No 1300/2014, gives nominal platform heights of ' +
    '550 mm and 760 mm above the running surface, and clause 4.2.1.12(3) requires the ' +
    'minimum obstacle-free width to be the danger area plus two 80 cm freeways. NEITHER IS ' +
    'A BOUNDING-BOX AXIS of the drawn asset: the box height is the top of the CANOPY, ' +
    'which is architectural and has no published class figure, and the platform-height ' +
    'figure applies to a slab MCEXT does not measure separately. And the asset is already ' +
    'inside both — 0.600 m against a 0.550 m nominal, 3.000 m wide against a minimum of ' +
    '1.60 m plus the danger area — so there is nothing to fit and nothing to correct.');
  reject('signal-gantry',
    'NO ROW, BECAUSE THE ASSET IS AMBIGUOUS AND THE TWO READINGS TAKE DIFFERENT ' +
    'STANDARDS. Measured 8.300 x 0.300 x 5.400 m; the two 5.00 m posts are 8.00 m apart ' +
    'and the beam soffit is at 5.00 m. AS A RAIL GANTRY, which is what the catalogue says ' +
    'it is, the span is a track count times track centres and the clearance is governed by ' +
    'the structure gauge and the overhead line — and neither the track-centre minimum nor ' +
    'the structure clearance came out of a source that could be read, so a row would be ' +
    'guesswork; on the figures available it looks roughly right, an 8.30 m span suiting ' +
    'two tracks and a 5.00 m soffit clearing a 25 kV contact wire. AS A HIGHWAY GANTRY it ' +
    'would be a defect and a sourced one: DMRB CD 127 Table 4.1 gives sign and signal ' +
    'gantries a new-construction headroom of 5.70 m + S and a maintained 5.41 m + S, ' +
    'against which the drawn 5.00 m soffit is 0.41 m below even the maintained minimum. ' +
    'Decide which object it is first; the row follows from that.');
  reject('cloverleaf-interchange',
    'NO PUBLISHED CLASS FIGURE SOURCED. Measured 14.000 x 12.000 x 0.300 m. A ' +
    'cloverleaf\'s footprint is a consequence of its loop radius and its carriageway ' +
    'widths — AASHTO and DMRB give minimum loop radii and the overall square follows from ' +
    'them — so the honest row is derived from a loop radius that was not read. WHAT CAN BE ' +
    'SAID WITHOUT ANY SOURCE is that the drawn object is not a junction at that size: ' +
    '14 x 12 m is smaller than the 15.00 m paved width of the single motorway carriageway ' +
    'it is supposed to join, so the interchange is narrower than one of its own approach ' +
    'roads. That inequality is a catalogue-internal check needing no external figure, and ' +
    'it would fail today.');
  reject('toll-plaza',
    'NO CLASS FIGURE FOR THE PLAN, BUT A SOURCED HEADROOM DEFECT WORTH CARRYING FORWARD. ' +
    'Measured 13.000 x 6.000 x 4.400 m. Toll-lane and island widths vary by operator and ' +
    'no national standard for them was found, so the plan axes cannot be stated. THE ' +
    'CANOPY CAN BE: it is drawn with its soffit at exactly 4.000 m, and DMRB CD 127 ' +
    'Table 4.1 requires 5.30 m + S new-construction headroom for an overbridge and ' +
    '5.70 m + S for a structure vulnerable to vehicular impact, with maintained figures of ' +
    '5.03 and 5.41 m. The drawn canopy is 1.03 to 1.70 m below those and is level with the ' +
    '4.00 m UK legal vehicle height this table already records on `rigid-hgv` — a ' +
    'legal-height lorry passes with zero clearance. Raising the canopy is a generator edit ' +
    'and needs no row; the row for the plan needs a source that does not exist yet.');
  reject('tunnel-portal',
    'NO ROW, BECAUSE THE DEFECT IS NOT IN THE BOUNDING BOX. Measured 9.000 x 4.000 x ' +
    '6.400 m. The box is roughly right for a portal headwall — 9.00 m across comfortably ' +
    'exceeds the 8.500 m deck width derived for bridge-deck-s2, and 6.40 m tall clears a ' +
    '5.30 m headroom plus structure. THE OPENING IS THE PROBLEM AND MCEXT CANNOT SEE IT: ' +
    'the bore is drawn as a path from x = 1.5 to x = 7.5, so it is 6.00 m wide against a ' +
    '7.30 m two-lane carriageway that has to pass through it. A bounding-box row would ' +
    'PASS this asset while the hole in it is 1.30 m too narrow for the road it carries. ' +
    'That is a clearance check on interior geometry, which is a different mechanism from ' +
    'this table entirely, and inventing a box row to stand in for it would put a green ' +
    'tick over the actual defect.');

  /* W3 · transport vehicles */
  reject('wagon-flat-bogie',
    'THE FLAT WAGON CANNOT BE SOURCED TO THREE AXES. Measured 8.000 x 3.020 x 1.200 m over ' +
    '12 entries. Greenbrier Europe\'s Sgnss 60 ft four-axle intermodal wagon publishes ' +
    'length over buffers 19,740 mm and loading height above top of rail 1,155 mm — two of ' +
    'the three, and the second is genuinely checkable because an empty container flat\'s ' +
    'highest point IS its deck, which the drawn 1.200 m is within 4% of. It publishes no ' +
    'width. Neither does TrinityRail\'s 53 ft well car page, and a well car\'s depressed ' +
    'well is a different topology from the drawn flat deck so it would be the wrong ' +
    'reference anyway. The European envelope is the G1 loading gauge, a clearance profile ' +
    'rather than a vehicle dimension. Two sourced figures and one invented one is exactly ' +
    'what this table exists to prevent. Any flat-car spec sheet printing an extreme width ' +
    'closes it.');
  reject('container-stack',
    'NO ROW, AND A ROW IS THE WRONG INSTRUMENT. Measured: container-stack-block ' +
    '12.400 x 7.700 x 5.150 for a declared 5 x 3 x 4 grid, container-stack-low ' +
    '9.900 x 5.100 x 3.850 for 4 x 2 x 3, container-stack-high 14.900 x 7.700 x 6.450 for ' +
    '6 x 3 x 5. gContainerStack draws each unit as a 2.4 x 2.5 x 1.25 m block, which is ' +
    'not a container in ANY axis: against ISO 668\'s 6.058 x 2.438 x 2.591 it is 40% of ' +
    'the length and 48% of the height, and the one axis that even looks plausible gives ' +
    'the game away, because 12.400/5 = 2.48 m is a container\'s WIDTH standing in for its ' +
    'LENGTH. Five twenty-foot containers end to end are 30.29 m against a drawn 12.40 m. A ' +
    'stack size is a grid PARAMETER and three catalogue entries carry three different ' +
    'grids, so a row would bake one grid into a published figure. THE RIGHT GATE IS THE ' +
    'ONE THE PALLET GRID ALREADY ESTABLISHED: divide the measured footprint by the ISO 668 ' +
    'module this table already carries and assert it comes out whole, so the check stays ' +
    'true if the grid changes and fails if the footprint stops being containers. No ' +
    'external source is needed.');

  /* W3 · recreation */
  reject('climbing-frame-playground',
    '"CLIMBING FRAME" IS A CLASS WITH NO ENVELOPE. Measured 4.200 x 4.200 x 3.600 m over ' +
    '25 entries. KOMPAN\'s own published climbing structures run from 2.49 x 2.68 x 2.60 m ' +
    'up to 6.96 x 4.03 x 6.98 m, so the choice of reference model alone decides whether ' +
    'the drawn frame is oversized or undersized — which is the definition of not having a ' +
    'figure, and writing one anyway would be the fabrication this table exists to stop. ' +
    'What IS citable and is a genuine defect: the drawn top deck sits at 3.400 m, so the ' +
    'free height of fall exceeds EN 1176-1\'s 3.000 m limit, above which the item is not ' +
    'children\'s playground equipment under the standard at all. That is a rebuild target ' +
    'needing no envelope figure.');
  reject('playhouse-playground',
    'NO PUBLISHED CLASS FIGURE. Measured 3.800 x 3.000 x 3.800 m over 25 entries. ' +
    'Manufacturers\' play-house models span roughly 1.2 m to 2.5 m and the size is a ' +
    'design choice rather than a standard, so any figure here would be a preference ' +
    'dressed as a measurement. Recording the measurement instead of inventing a number: ' +
    'the drawn walls alone are 2.400 m and the ridge is 3.800 m, which against this ' +
    'tree\'s own person-standing row is more than twice an adult — the object drawn is a ' +
    'garden building, not a child\'s playhouse. Either rebuild to a chosen and cited ' +
    'manufacturer model, or rename the entries by class so the name stops claiming ' +
    'something the geometry does not meet. Do not fit.');
  reject('sandpit-playground',
    'A SANDPIT HAS NO PUBLISHED SIZE in EN 1176 or anywhere else — it is a kerbed area ' +
    'sized to the site, and nothing standardises it. Measured 5.000 x 5.000 x 1.100 m. One ' +
    'thing about that measurement should not be misread later: the 1.100 m height is the ' +
    'drawn TOYS standing in the pit, not the pit, which is a 0.400 m kerb. That is a fair ' +
    'thing for a bounding box to report and there is no figure to check it against, so ' +
    'MCDIM.check() returning null — not checked — remains the correct and honest output.');
  reject('stadium-stand-terrace',
    'THE HONEST ANSWER IS A SPLIT RATHER THAN A ROW. Measured 12.800 x 5.800 x 5.400 m ' +
    'over 23 entries. The PLAN DEPTH is already about right and can be shown to be: the ' +
    'generator lays six rows at a 0.800 m tread, which is the recommended seat row depth ' +
    'in the Guide to Safety at Sports Grounds, and 6 x 0.800 plus the front beam gives the ' +
    'measured 5.800 m. The HEIGHT is the axis that is wrong — a 0.800 m riser is a ' +
    '45 degree rake against a real 30 degrees or shallower — and there is no class figure ' +
    'for a riser, because a riser is the output of a sightline C-value calculation for one ' +
    'particular stand. The LENGTH is arbitrary: a stand is as long as its side of the ' +
    'ground. So a row here would check one axis that is already correct, report ok, and ' +
    'leave the object twice as tall as it should be — the wrong-row-that-fits-perfectly ' +
    'hazard, the same shape as telehandler-operator being fitted to a telehandler.');
  reject('coaster-hill',
    'THE CATALOGUE NAME IS "Roller-coaster hill" — A FRAGMENT OF A RIDE RATHER THAN A ' +
    'RIDE — and neither a manufacturer nor a standard publishes a dimension for one hill. ' +
    'Measured 12.000 x 8.000 x 10.100 m over 25 entries. A coaster\'s published figures ' +
    'are track length, lift height and footprint for a whole named layout, and none of ' +
    'them describes this object: a class rather than a model, no class figure, so reject ' +
    'rather than invent. Nothing measured is evidence that 12 x 8 x 10.1 m is wrong ' +
    'either; it is simply unchecked, which is exactly what MCDIM.check() already reports ' +
    'as null.');
  reject('skate-park',
    'A SKATE PARK IS A DESIGNED FACILITY laid out to its site, with no standard size and ' +
    'no manufacturer envelope, so no row. But the measurement uncovered a real SHAPE ' +
    'defect that must be fixed whether or not a figure ever arrives: the two quarter-pipes ' +
    'and the centre box are drawn inside `if(VIEW!==\'side\')`, and MCEXT takes z from the ' +
    'side view, so the reported height of 0.300 m is the slab alone while the generator\'s ' +
    'own drawn ramps reach 3.000 m. That is a 10x UNDERSTATEMENT OF THE CLASH SOLID\'S ' +
    'HEIGHT, in the direction that says it clears. It is the mirror of the gSlide and ' +
    'gSeesaw plan fragments — the same view-guard error pointed at z instead of at the ' +
    'plan — and it costs nothing to correct.');
  reject('log-flume',
    'A LOG FLUME IS A WHOLE RIDE LAYOUT designed to its site; manufacturers publish track ' +
    'length and lift height per installation, not an envelope for "a log flume". Measured ' +
    '12.000 x 2.000 x 4.000 m. Same category as the coaster hill and the same answer: no ' +
    'class figure, so no row. Unlike the skate park there is no separate geometry defect ' +
    'to report — the drawn timber structure is what supplies the measured height and it is ' +
    'not a fragment.');
  reject('lido-outdoor-pool',
    'A LIDO IS A POOL COMPLEX — a main pool, a children\'s pool, a deck and a diving stage ' +
    '— laid out to its site, and neither a standard nor a manufacturer publishes a size ' +
    'for one. Measured 14.000 x 9.000 x 0.400 m. The competition figures that do exist ' +
    '(World Aquatics FR 2.2: 50.000 x 25.000 m) describe the WATER BODY of a racing pool, ' +
    'which is a different claim from what this asset draws, and borrowing them would be ' +
    'the crane-mast error. SEPARATE MEASURED DEFECT worth fixing regardless of any figure: ' +
    'the 3.000 m diving stage is drawn inside `if(VIEW!==\'side\')`, so MCEXT takes the ' +
    'height from the side view and reports 0.400 m — the tower is absent from the clash ' +
    'solid entirely.');
  reject('water-slide-tower',
    'NO PUBLISHED CLASS FIGURE: a water slide\'s dimensions belong to a named model and a ' +
    'chosen tower height, and manufacturers publish per-model flume lengths rather than an ' +
    'envelope for "a water slide". But THIS ASSET CARRIES THE SINGLE LARGEST MEASURED ' +
    'SHAPE DEFECT IN THE RECREATION LIBRARY and it must be fixed whether or not a figure ' +
    'ever arrives: the flume and the splash pool are both inside `if(VIEW!==\'top\')`, so ' +
    'MCEXT measures a plan of 0.400 x 0.400 m — the support post alone — while the ' +
    'generator\'s own side view carries the flume and pool from x = 2.000 to x = 14.000. ' +
    'That is a 30x understatement of the plan footprint, in the direction that says it ' +
    'clears, from a pure view-guard error.');
  reject('bumper-car-track',
    'NO SOURCED TRACK DIMENSION. Measured 12.000 x 8.000 x 1.300 m. Bertazzon, the ' +
    'reference manufacturer for dodgems, publishes CAR specifications on its product pages ' +
    '— seating, motor, weight — but no track or platform dimension on the adult, midi or ' +
    'mini overview or on the individual model pages, and no standard fixes a dodgem floor. ' +
    'The drawn 12 x 8 m floor is entirely plausible against common practice, WHICH IS ' +
    'EXACTLY WHY IT MUST NOT BE WRITTEN DOWN AS A FIGURE: plausible and sourced are ' +
    'different claims and this table only carries the second. Bertazzon quote track sizes ' +
    'on request.');
  reject('ticket-booth-fairground',
    'A FAIRGROUND TICKET KIOSK HAS NO STANDARD and no published class envelope; they are ' +
    'built to order. Measured 3.600 x 2.600 x 3.500 m over 5 entries. Recording what the ' +
    'measurement says without pretending it is a source: the drawn booth is 3.500 m to the ' +
    'ridge, twice the 1.750 m person-standing row, which is the same proportional tell ' +
    'that found the 5.59 m people and the 3 m safety signs. A tell is a reason to look, ' +
    'not a figure to ship.');
  reject('fairground-stall',
    'A FAIR OR MARKET STALL IS A PITCH DIMENSION set by the event organiser rather than a ' +
    'product with a published envelope. Measured 4.000 x 2.600 x 2.600 m over 5 entries. ' +
    'The common 3.0 m and 2.4 m frontages are local-authority market conventions that vary ' +
    'between markets and are not a standard, so no source meets the bar set for this ' +
    'table: no row and no fit.');
  reject('hot-tub-round-6person',
    'A DIAMETER-ONLY ROW WOULD REPORT OK FOR AN OBJECT STILL 50% OVER ON A REAL PHYSICAL ' +
    'DIMENSION. Measured 4.800 x 4.800 x 1.384 m. The diameter IS sourceable — Softub ' +
    'publishes a 2.000 m outer diameter for the Resort, 5-6 people — but the ' +
    'manufacturer\'s own model page publishes no height, and the height is the axis that ' +
    'is genuinely wrong here rather than a drawing artefact: a domestic spa stands about ' +
    '0.85-0.95 m against the drawn 1.384 m. That is different in kind from the unchecked ' +
    'axes this table DOES ship — a football pitch has no height and a sign face has no ' +
    'published depth, so those placeholders are inert — so the honest answer is no row ' +
    'rather than a partial one. Softub Resort, 2.000 m diameter, is recorded here for ' +
    'whoever finds a published height.');

  /* W3 · space */
  reject('heavy-lift-launch-vehicle',
    'NO ROW CAN BE SOURCED FOR THE ONE AXIS THAT MAKES IT A HEAVY. Measured ' +
    '4.000 x 4.000 x 21.000 m — identical in PLAN to the standard "Rocket" entries, which ' +
    'share the same generator, because gRocket returns early on VIEW==="top" after drawing ' +
    'one disc, so the strap-on boosters are elevation-only. HEIGHT will not separate them ' +
    'either: SpaceX\'s Falcon User\'s Guide Table 2-1 gives 70 m for the Falcon FAMILY, so ' +
    'Falcon Heavy and Falcon 9 are the same height, and a height-only row would make ' +
    '"Rocket" and "Heavy rocket" measure identically — the one-generator-several-nameplates ' +
    'fingerprint that the record-machines block and tools/identical_sweep.py exist to ' +
    'catch. The dimension that actually distinguishes a heavy-lift vehicle is the span ' +
    'across its strap-ons, and it is in no primary document reached: the widely-quoted ' +
    '12.2 m traces to a JS-rendered marketing page and to restatements of it. Deriving ' +
    '3 x 3.66 = 10.98 m from the core diameter was considered and refused, because it is a ' +
    'lower bound presented as a width, i.e. an understatement, which is the direction that ' +
    'says it clears.');
  reject('launch-pad',
    'A LAUNCH PAD\'S SIZE IS ENTIRELY WHICH PAD, AND THE ENTRY NAMES NONE. Measured ' +
    '8.000 x 8.000 x 9.000 m. The class spans a suborbital launch rail a few metres tall ' +
    'to Kennedy LC-39, whose lightning-protection towers are 594 ft and whose SLS mobile ' +
    'launcher tower is 380 ft on a base of roughly 158 x 165 ft. There is no standard, no ' +
    'class default and no representative that is not a specific named facility. The drawn ' +
    'object is a plausible size for some real small pad, so leaving MCDIM.check() to ' +
    'return null costs nothing, and inventing an LC-39-scale figure for a generic entry ' +
    'would be the record-machines defect run in reverse: geometry claiming a facility the ' +
    'name does not name.');
  reject('satellite-bus',
    '"SATELLITE" NAMES NO CLASS WITH A CHARACTERISTIC SIZE. The population runs from a 1U ' +
    'CubeSat at 100 x 100 x 113.5 mm to a GEO communications satellite spanning tens of ' +
    'metres across deployed arrays — four orders of magnitude — and the entry names ' +
    'neither a bus nor a mission. The CubeSat Design Specification does fix 1U exactly, ' +
    'but the drawn object is a large bus with deployed arrays on booms and is not a ' +
    'CubeSat, so that standard does not reach it. Separately and independently ' +
    'disqualifying: the arrays and the mast are drawn only inside `if(VIEW!==\'top\')`, ' +
    'giving a plan fragment 4.5x smaller than the side view — the worst in the space class ' +
    '— so even a sourced row could not be checked against the plan bounds. Also worth ' +
    'recording for whoever places these: measured z0 = 3.000, i.e. the asset floats 3 m ' +
    'above the ground and its clash solid sits in mid-air.');
  reject('radio-dish-antenna',
    'DIAMETER IS THE WHOLE SPECIFICATION OF A PARABOLIC ANTENNA, and it runs from a 0.6 m ' +
    'VSAT terminal to the Deep Space Network\'s 70 m at Goldstone, with no standard fixing ' +
    'a class and no meaningful mean. Measured 4.800 x 4.800 x 4.800 m, which is a ' +
    'plausible mid-size ground-station dish, so MCDIM.check() returning null is honest and ' +
    'the cost of refusing is nil. Sourcing a specific large antenna — the DSN 34 m ' +
    'beam-waveguide is published exactly by NASA — and applying it to a generic entry ' +
    'would put a 34 m claim behind a name that makes none, and in the OVERSTATING ' +
    'direction, which invents interference.');
  reject('dome-habitat',
    'NO PLANETARY DOME HABITAT HAS EVER BEEN BUILT, so there is no published dimension to ' +
    'find — a concept has no spec sheet. Measured 8.000 x 8.000 x 4.000 m. The terrestrial ' +
    'analogues that do exist are individual research structures rather than a class: the ' +
    'HI-SEAS dome and the Mars Desert Research Station Hab are one-off university ' +
    'facilities of different sizes, and the entry names neither. A row here would be a ' +
    'figure chosen to match the thing already drawn, which is the definition of the ' +
    'uncertain row this table does not ship.');
  reject('telescope-dome',
    'AN OBSERVATORY ENCLOSURE IS SIZED TO ITS TELESCOPE\'S APERTURE and runs from roughly ' +
    '2 m amateur domes to the 40 m-class enclosures, with no standard and no class ' +
    'default. Measured 5.200 x 5.200 x 5.400 m. Manufacturers do publish catalogue sizes ' +
    'for standard domes, but picking one and attaching it to an entry named only ' +
    '"Telescope dome" is choosing arbitrarily and presenting the choice as a measurement. ' +
    'Noted because it is the one asset in this class a contractor could actually be asked ' +
    'to build: if it is ever wanted as a real building, rename it to a named dome model or ' +
    'a named observatory and the figure is published.');
  reject('ufo',
    'FICTIONAL. No published dimension exists for a flying saucer and none ever will, so ' +
    'there is nothing this table could be right or wrong about. Measured ' +
    '8.000 x 8.000 x 3.940 m. MCDIM.check() returning null is the correct and final ' +
    'output, and the one thing that must not happen is a row invented for it. Whether a ' +
    'fictional object belongs in a clash population at all is a product decision rather ' +
    'than a dimensions one.');
  reject('alien-figure',
    'FICTIONAL, and refused for the UFO\'s reason — but flagged separately for two things ' +
    'a reader should not miss. (1) IT IS A HUMANOID FIGURE — two legs, two arms, a torso ' +
    'and a head, drawn by the same box-and-mound vocabulary as gPerson — standing 3.529 m ' +
    'tall, i.e. twice a corrected 1.750 m person and beside them on the same plan. If the ' +
    'human-figure MAP rule is ever widened again, this generator must be EXCLUDED from it ' +
    'by name and not swept in, because a person\'s dimensions are not a claim anyone can ' +
    'make about it. (2) Its plan is a 4.00x fragment, so its clash solid is a fraction of ' +
    'what is drawn — academic while the object is fictional, and immediate if it were ever ' +
    're-pointed at something real.');
  reject('planet-model',
    'A PLANET\'S DIAMETER IS PUBLISHED EXACTLY — Mars is 6 779 km — and is four to six ' +
    'orders of magnitude beyond anything a site model can hold, so the ' +
    '8.000 x 8.000 x 8.000 m object is not a planet, it is a MODEL of one at an unstated ' +
    'scale. The size of a model is a display decision, not a published dimension, and this ' +
    'table\'s rows are the published size of a real thing. That is a category this table ' +
    'has not had to name before: not no-asset (the asset exists), not different-claim ' +
    '(there is no claim to compare), not annotation (it is a solid object that would ' +
    'really occupy that space if placed). Do not scale it to the real body and do not ' +
    'invent a display scale.');
  /* W3 · interiors */
  reject('drafting-chair-office',
    'A NAMEPLATE DEFECT THE CATALOGUE SWEEP SURFACED, and it became visible only once the ' +
    'task chair was corrected. gOfficeChair draws 96 `drafting-chair-*` entries BIT FOR ' +
    'BIT as the task chair — measured 1.750 x 1.712 x 3.820 m, which is the pre-fit task chair ' +
    'own pre-fit geometry — so before this wave the two hid inside one 216-name group in ' +
    'tools/identical_sweep.py and after it the drafting chairs stand alone at the old ' +
    'size. A drafting chair is a REAL and DIFFERENT object: a longer gas lift and a ' +
    'footring, because it is used at a bench rather than at a desk, so it is taller than a ' +
    'task chair by a published amount and not by nothing at all. No manufacturer figure ' +
    'was sourced, so there is no row and MCDIM.check() answers null — not checked — which ' +
    'is the correct output. One published drafting-chair height and seat-height range ' +
    'closes it, and the row must NOT simply reuse office-task-chair: that would be the ' +
    'wrong-row-that-fits-perfectly hazard, since the geometry already measures the task ' +
    'chair exactly.');
  reject('executive-chair-office',
    'NEEDS ITS OWN ROW AND HAS NO SOURCED FIGURE. 96 `executive-chair-*` entries measure ' +
    '1.750 x 1.712 x 4.520 m — the same plan as the task and drafting chairs and 0.700 m ' +
    'taller — so unlike the drafting chair the generator does at least draw a genuinely ' +
    'different object. It is still 4.3x an office chair. Mapping it to office-task-chair ' +
    'would fit it to a 1.045 m Aeron and report ok, which is precisely the defect that row ' +
    'is anchored by id rather than by generator to avoid: an executive chair has a higher ' +
    'back and a published height of its own. A manufacturer spec sheet giving overall ' +
    'height and its adjustment range closes it.');

  reject('asteroid-boulder',
    'ASTEROIDS RUN FROM METRES TO CERES AT ABOUT 940 km, the entry names no body, and the ' +
    'generator\'s `seed` parameter varies the SHAPE per entry from a pseudo-random ' +
    'sequence — so there is nothing for a row to be right about in either size or form. ' +
    'Measured 5.200 x 5.200 x 1.291 to 2.188 m depending on seed, and z0 is 1.13 to 1.92, ' +
    'i.e. every one of them floats above the ground. This is the landscape argument in the ' +
    'space library: a boulder is whatever size that boulder is, and adding a row would be ' +
    'fabricating a figure.');

  /* ====================================================================
     WHY A SOURCED ROW MEASURES NOTHING.

     A row that no catalogue asset reaches is checking nothing, and on a list
     it is indistinguishable from one nobody has got round to — which is trap
     15 inside a spec table: the absence reads as a queue rather than as an
     answer. Most of these are not a queue. A crane row publishes its MAST or
     its UNDERCARRIAGE, and the catalogue draws the machine rigged, so the two
     numbers are different claims and forcing a map entry would either fail
     honestly or, worse, pass against the wrong axis.

     Four kinds, and only the first and the last are work outstanding:
       `no-asset`        sourced, nothing draws it yet
       `different-claim` the figure is not a bounding box
       `module`          a unit other rows and assets are built from
       `topology`        the asset exists and the figure IS its bounding box,
                         but the generator draws the wrong SHAPE, so a fit
                         would scale a fragment, invert a plan pair or leave
                         a nested dimension wrong while the gate went green.
                         What is missing is a generator edit, not a number.

     tools/cases/asset_scale.js gates this BOTH WAYS: an unmapped row with no
     entry here fails, and an entry here for a row that IS mapped fails too, so
     the note is deleted the day it stops being true rather than outliving it.
     ==================================================================== */
  var UNMAPPED = {
    'runway-code-4': { kind: 'topology', why:
      'the published 45.000 m cross-section EXCEEDS the drawn long plan axis of 16.200 m, ' +
      'so a width-only fit inverts the plan pair and MCDIM.check() — which compares the ' +
      'plan pair unordered — then fails the asset against the row that just corrected it. ' +
      'Lengthen the tile to at least its own width (90 x 45 is the natural choice) and ' +
      're-lay the markings at that scale; the row then takes fit:true unchanged.' },
    'motorway-carriageway-d3m': { kind: 'topology', why:
      'the same inversion as the runway: 15.000 m of paved width against a tile drawn ' +
      '14.000 m long. Lengthen the tile (30 m is the obvious choice). Separately the drawn ' +
      'markings are a single carriageway\'s, with a painted centre line where a motorway ' +
      'has a central reserve, and no fit of any kind repaints a line.' },
    'helicopter-light-single': { kind: 'topology', why:
      'the main rotor is drawn inside `if(VIEW!==\'top\')`, so the rotor disc — the one ' +
      'envelope a helicopter is dangerous in — is absent from the plan bounds entirely and ' +
      'therefore from the clash solid. A fit would stretch the 1.7 m fuselage sideways ' +
      'into a 10.67 m slab rather than produce a disc. Draw the disc in the top view and ' +
      'put the skids on the ground, then the row is fittable.' },
    'track-athletics-400m': { kind: 'topology', why:
      'gRunningTrack draws two concentric DISCS and a per-axis fit turns a disc into an ' +
      'ellipse, which has neither the 84.390 m straights nor the constant 36.500 m bend ' +
      'radius that are what a 400 m track IS. Rebuild the generator to the oval; do not ' +
      'scale the circle.' },
    'pool-50m-longcourse': { kind: 'topology', why:
      'the derived fit is a similarity transform and this asset\'s correctness depends on ' +
      'TWO NESTED dimensions — a 12 x 8 m deck with a 10 x 6 m water body inset 1 m all ' +
      'round, so any factor that puts the deck on 50 x 25 leaves the water at ' +
      '41.667 x 18.750 and check() reports ok for a pool that is not 50 m long. Rebuild ' +
      'with the water at 50.000 x 25.000 and state the surround separately.' },
    'slide-freestanding-3m': { kind: 'topology', why:
      'the chute is drawn inside `if(VIEW!==\'top\')`, so the plan bounds are the two ' +
      'posts and the platform — 1.20 x 1.60 m of a 7.39 m object — and a fit scales ' +
      'measured bounds, so it would faithfully scale the fragment. Move the chute out of ' +
      'the top-view guard and the row measures something.' },
    'seesaw-2seat': { kind: 'topology', why:
      'the same plan-fragment defect as the slide and the worse ratio of the two: MCEXT ' +
      'measures the 0.800 m pivot block alone against a 3.277 m object. The rebuild has to ' +
      'fix two things at once, because the drawn plank is itself 1.95x a real one — ' +
      'correcting only the view guard would replace a 4.10x understatement with a 1.95x ' +
      'overstatement.' },
    'teacup-ride-12': { kind: 'topology', why:
      'every published teacup ride\'s height figure is its CENTRE STRUCTURE and gTeacups ' +
      'draws five cups on a bare turntable with nothing in the middle, so a three-axis fit ' +
      'would stretch the cups themselves to 3.6 m and report that as a measurement. Draw ' +
      'the centre structure and reconcile the cup count with whichever model is chosen.' },
    'lunar-lander-apollo-lm': { kind: 'topology', why:
      'the legs and footpads are drawn only inside `if(VIEW!==\'top\')`, so the plan ' +
      'bounds are the descent-stage BODY (4.216 m across in life) rather than the 6.681 m ' +
      'footpad span this row publishes. Fitting one onto the other is not a scale, it is a ' +
      'fudge arrived at by arithmetic. Draw the legs and footpads in the top view; the ' +
      'shape is otherwise an exact Apollo LM.' },
    'space-shuttle-stack': { kind: 'topology', why:
      'two independent reasons. The orbiter box and its wing quads are drawn only inside ' +
      '`if(VIEW!==\'top\')`, so the widest element of the real stack — the 23.774 m ' +
      'wingspan — is absent from the plan, and scaling the tank-and-booster cluster up to ' +
      'it would size the wrong object. And the proportions BETWEEN elements are wrong ' +
      'independently of overall size, so no single scale fixes it: re-proportion the ' +
      'orbiter against the tank as well.' },
    'office-desk-fixed-height': { kind: 'topology', why:
      'only H is published, so the fit this row could take is a z-only one — and it leaves ' +
      'a 5.00 x 2.60 m desk 0.74 m high, which makes the SHAPE WORSE while the gate goes ' +
      'green. The generator has to draw a desk at 1.600 x 0.800 m first. Whoever does it ' +
      'must pick a NON-HUTCH entry for the known-answer case: half of them carry ' +
      'hutch:true and legitimately stand taller than the work surface.' },
    'laptop-notebook-15': { kind: 'topology', why:
      'H is the CLOSED chassis and the generator draws the lid open, so H cannot be ' +
      'checked; and with a plan-only checkAxes the fit corrects the plan to ' +
      '0.358 x 0.233 m and leaves the height at 1.900 m, because an axis a row does not ' +
      'publish is not scaled. That is a laptop nearly two metres tall with the plan right. ' +
      'The generator has to draw the machine at its real size first.' },
  };

  /* ==================================================================== */
  /* THE MAP: catalogue id -> spec id. First match wins.                   */
  /* ==================================================================== */
  var MAP = [
    /* ===================================================================
       THE HUMAN FIGURE GOES ABSOLUTELY FIRST, AND IT MATCHES ON THE
       GENERATOR RATHER THAN ON THE NAME.

       This file's own header says the human figure is the one everything
       else is judged against, and that at 3.2x life it made every correctly
       sized object beside it look miniature. That fix was then applied by
       NAME — `groundworker` and `scaffolder` — and the catalogue holds 79
       human figures across two generators. So 77 of them stayed 5.59 m tall
       against a Neufert reference of 1.750 m, standing next to containers
       and excavators that had just been corrected to the millimetre.

       A name-based rule could never have caught them: `bricklayer`,
       `steel-fixer`, `fire-marshal` and `visitor` share no substring, and
       the next trade somebody adds would have been missed in the same
       silence. BEING A PERSON IS A PROPERTY OF THE GENERATOR, so that is
       what the rule tests — `gPerson` and `gWorker` — and a new trade is
       correct the moment it is drawn.

       It also has to be FIRST because `(^|-)telehandler-` was matching
       `telehandler-operator` and fitting a person to a 6.36 m machine. That
       is the same defect as the LTM 11200 note further down: a pattern for
       a machine reaching a name that merely mentions it. Order fixes this
       one; asset_scale.js asserts no person resolves to a machine row.
       =================================================================== */
    /* FOUR MORE PERSON GENERATORS, AND THE RULE ABOVE ALREADY EXPLAINS WHY.
       gPerson and gWorker were the two this rule could SEE. The catalogue
       gates spliced only MF_CATALOG, so all eleven worlds3.js / cityfam3.js
       libraries - 244,617 of 350,635 placeable entries - were outside both
       tools/cases/asset_scale.js and tools/identical_sweep.py, and four more
       human generators sat in that blind spot the whole time.
       Measured by the sweep once it was given the same splice the page uses
       (modules/module-site-plan.html:254):
         gOperator  7,200 names  1.90 x 1.90 x 5.39 m
         gForester  2,000 names  2.00 x 2.00 x 5.41 m
         gCitizen   1,770 names  1.90 x 1.90 x 5.50 m
         gFarmer    1,280 names  1.90 x 1.90 x 5.65 m
       12,250 people at roughly three times life size, standing next to
       containers correct to the millimetre - the same defect the note above
       records for gWorker at 5.59 m, at 155 times the count.
       They are people by the same test: gFarmer takes skin, top, bottom and
       hat; gOperator and gForester are trades in hi-vis; gCitizen is a
       pedestrian. Being a person is a property of the generator, so they
       belong in the same rule rather than in one of their own. */
    { genRe: /^(gPerson|gWorker|gOperator|gForester|gCitizen|gFarmer)$/, spec: 'person-standing' },

    /* The rigid HGVs, by generator: `tipper-truck`, `flatbed-lorry`,
       `fuel-lube-truck`, `water-truck-dust-suppression` and `road-sweeper`
       share a chassis and share no substring. Their lengths stay their own —
       that is what checkAxes ['W','H'] is for. */
    /* THE EXCEPTION GOES ABOVE THE GENERATOR RULE, and it has to.
       An ARTICULATED DUMP TRUCK is drawn by gDumpTruck and is NOT a road
       vehicle — it is 3.801 m wide because it never leaves the site, and
       squashing it into a 2.50 m road section would be the same defect one
       machine along. A generator rule is powerful exactly because it catches
       what a name cannot, and that cuts both ways: anything it should not
       catch must be anchored ahead of it. This was caught by the gate that
       fails when a mapped row becomes unmapped, which is the whole reason that
       gate points both ways. */
    { re: /(^|-)articulated-dump-truck-/, spec: 'adt-745' },
    { genRe: /^(gDumpTruck|gFlatbed|gFuelTruck|gWaterTruck|gSweeper)$/, spec: 'rigid-hgv' },
    /* The light vehicles. A van and a minibus share a body, so they share a
       row; all three axes are fitted here because unlike the HGVs the length
       is published for the same vehicle the width is. */
    { genRe: /^(gVan|gMinibus)$/, spec: 'panel-van-transit' },
    { genRe: /^gPickup$/, spec: 'pickup-double-cab' },
    { genRe: /^gBowser$/, spec: 'bowser-site-tow-2000l' },
    /* 94 signs, one generator, one size. Hand rebuilt rather than fitted —
       the post-to-face proportion was wrong as well as the overall size, and
       a fit only guarantees the bounding box. */
    { genRe: /^gSign$/, spec: 'site-sign-post' },
    /* The three that had no asset at all until this wave drew them. The
       articulated lorry is fitted to a LEGAL MAXIMUM rather than to one
       manufacturer's measurement, deliberately: the asset is the design
       vehicle, the largest thing that can lawfully arrive at the gate. */
    { genRe: /^gArticLorry$/, spec: 'lorry-artic-eu' },
    { genRe: /^gPortaloo$/, spec: 'portable-toilet' },
    { genRe: /^gWelfareUnit$/, spec: 'welfare-unit-mobile' },

    /* The site cabin, by generator for the same reason: `Site office`,
       `Canteen`, `Drying room`, `Shower block` and `Comms / server cabin`
       share no substring either, and they are one object with one section. */
    { genRe: /^gCabin$/, spec: 'site-cabin-jackleg' },

    /* THE RECORD MACHINES GO FIRST. Each pattern is anchored at `^` on a
       manufacturer and a model, so none of them can swallow a generic entry —
       and being first means no generic pattern added later can swallow THEM,
       which is the direction that would silently put a 300 t crawler crane's
       size back under a 4000 t machine's name.

       `^` and not `(^|-)` here, deliberately: unlike the small assets, these
       entries exist in core3.js only. If a twin ever appears in
       masterformat.js the duplicate-generator wall in asset_scale.js is at
       ZERO and fails on it immediately, which is the check that would catch
       this assumption being wrong rather than letting the two drift. */
    { re: /^belaz-75710/, spec: 'haul-truck-belaz-75710' },
    { re: /^bagger-293/, spec: 'bucket-wheel-bagger-293' },
    { re: /^bagger-288/, spec: 'bucket-wheel-bagger-288' },
    { re: /^f60-overburden-conveyor-bridge/, spec: 'conveyor-bridge-f60' },
    { re: /^komatsu-d575a/, spec: 'dozer-d575a' },
    { re: /^letourneau-l-2350/, spec: 'wheel-loader-l2350' },
    { re: /^caterpillar-6090-fs/, spec: 'mining-shovel-6090fs' },
    { re: /^liebherr-r-9800/, spec: 'mining-excavator-r9800' },
    { re: /^big-bertha/, spec: 'tbm-bertha' },
    { re: /^herrenknecht-17-6-m-tbm/, spec: 'tbm-mixshield-s880' },
    { re: /^liebherr-ltm-11200-9-1/, spec: 'mobile-crane-ltm11200-rigged' },
    /* BEFORE the standard 40, or `^container-40-ft` swallows it and measures a
       2.896 m box against a 2.591 m row. First match wins. */
    { re: /^container-40-ft-high-cube/, spec: 'container-40ft-hc' },
    { re: /^container-40-ft/, spec: 'container-40ft' },
    { re: /^container-20-ft/, spec: 'container-20ft' },
    { re: /^container-10-ft/, spec: 'container-10ft' },
    { re: /^scaffold-bay$/, spec: 'scaffold-bay' },
    { re: /^euro-pallet$|^pallet-euro/, spec: 'pallet-euro' },
    /* Excavators appear under both catalogues, so each pattern allows the
       MasterFormat `div-31-earthwork-plant-` prefix as well as the bare name.
       ORDER MATTERS and the generic one is last: `excavator-` would otherwise
       swallow `mini-excavator-`. The negative cases are the point of the
       anchors — `wheeled-excavator-`, `dragline-excavator-`, `bucket-wheel-`,
       `suction-vacuum-` and `gradall-telescopic-` are DIFFERENT MACHINES and
       must not be measured against a crawler spec. */
    { re: /(^|-)mini-excavator/, spec: 'excavator-mini-8t' },
    { re: /(^|-)midi-excavator/, spec: 'excavator-20t' },
    { re: /(^|-)long-reach-excavator/, spec: 'excavator-long-reach' },
    { re: /(^excavator-|plant-excavator-)/, spec: 'excavator-36t' },
    /* THE DERIVED FIT applies to these: the machine is recognisably the right
       machine and simply the wrong size, so mc-extents.js scales the measured
       bounds onto the published ones rather than the generator being rebuilt
       by hand. See the long note in mc-extents.js for where that is legitimate
       and where it is not. The mobile crane is DELIBERATELY absent — what it
       needs is the DEPLOYED state with its outriggers out (2.55 m travelling
       against 7.30 m across the outriggers), and that is a change of shape, not
       of size, so a fit would not deliver it. */
    { re: /(^|-)bulldozer-/, spec: 'dozer-d6' },
    { re: /(^|-)wheeled-loader-/, spec: 'wheel-loader-966' },
    { re: /(^|-)backhoe-loader-/, spec: 'backhoe-loader-3cx' },
    { re: /(^|-)motor-grader-/, spec: 'motor-grader-140' },
    { re: /(^|-)single-drum-roller-/, spec: 'roller-single-drum' },
    { re: /(^|-)tandem-roller-/, spec: 'roller-tandem' },
    { re: /(^|-)skid-steer-/, spec: 'skid-steer' },
    { re: /(^|-)telehandler-/, spec: 'telehandler' },
    /* The catalogue's mobile crane is drawn SET UP — outriggers out, boom
       raised — so it is measured against the deployed row, not the travelling
       one. Both rows exist because they are different objects on a plan. */
    /* ANCHORED AT THE START. `(^|-)mobile-crane` also matched
       `liebherr-ltm-11200-9-1-largest-mobile-crane`, which is a DIFFERENT
       MACHINE — a 1200 t crane with a 100 m boom, drawn by a different
       generator — and measuring it against a 90 t crane's outrigger spread is
       the world-record naming hazard this file's header warns about. */
    { re: /^mobile-crane(-|$)/, spec: 'mobile-crane-at-deployed' },
    { re: /(^|-)scissor-lift-/, spec: 'scissor-lift' },
    { re: /(^|-)mixer-truck-|(^|-)concrete-mixer-/, spec: 'concrete-mixer-truck' },
    /* THE SMALL THINGS, and they were the worst. A 750 mm traffic cone was
       drawn 6.00 x 6.00 x 4.60 m — fourteen times oversize, taller than a
       room — and a groundworker stood 5.59 m tall. THE HUMAN FIGURE IS THE
       ONE EVERYTHING ELSE IS JUDGED AGAINST: at 3.2x life it made every
       correctly-sized object beside it look miniature, which is most of why
       the whole scene read as a toy rather than a site.

       ANCHORED `(^|-)`, NOT `^`. Matching only the bare id fitted core3's copy
       and left masterformat's twin raw, and the two catalogues then disagreed
       about the same asset name MORE than before — the duplicate ratchet went
       from 13 to 15 and caught it. The mobile crane is the deliberate
       exception: there, `^` is required to keep a 1200 t machine out of a 90 t
       crane's row. */
    { re: /(^|-)traffic-cone(-|$)/, spec: 'traffic-cone-750' },
    { re: /(^|-)heras-fence-panel(-|$)/, spec: 'fence-panel' },
    { re: /(^|-)concrete-jersey-barrier(-|$)/, spec: 'jersey-barrier' },
    { re: /(^|-)road-plate(-|$)/, spec: 'road-plate' },
    { re: /(^|-)trackway-mat(-|$)/, spec: 'trackway-mat' },
    /* the two trades this used to name are now reached by the generator rule at
       the top of MAP, along with the other 77 */
    { re: /(^|-)car-(blue|red|white|grey|green|black|silver|yellow|navy)(-|$)/, spec: 'car-passenger' },
    { re: /(^|-)boom-lift-mewp(-|$)/, spec: 'boom-lift' },
    { re: /(^|-)passenger-goods-hoist(-|$)/, spec: 'construction-hoist' },

    /* ===================================================================
       THE W3 WORLDS. These reach the five libraries worlds3.js pushes into
       window.W3, which modules/module-site-plan.html splices into CATALOG
       and which carried no row at all until this wave.

       THE GENERATOR IS THE KEY ALMOST EVERYWHERE HERE, and not as a
       convenience. Every W3 asset LOSES a bare-id collision to the page's
       `~N` dedup pass, because cityfam3.js and worlds3.js both push after
       site-core: the transport library's roundabout is `roundabout~1`, and
       an id rule written against /^roundabout/ reaches site-core's ROAD
       roundabout instead — a highway feature measured against a 1.5 m play
       item's row, which is the gDumpTruck trap pointed the other way. A
       generator rule is immune to the suffix.

       THE FOUR EXCEPTIONS ARE ID RULES AND EACH ONE HAS TO BE:
         · gWagon draws four kinds at three different heights, so a
           generator rule would check the hopper and the flat against the
           boxcar row. Per kind, by id, anchored at `^` so `wagon-\d` cannot
           swallow `tank-wagon-`, `hopper-wagon-` or `flat-wagon-`.
         · gCourt draws all three courts, so a generator rule would put a
           basketball court's dimensions on a tennis court — and the row
           would fit perfectly while being the wrong game.
         · gRocket draws the 48 `Heavy rocket` entries as well, and those are
           REFUSED, so a generator rule would sweep them into the Falcon row.
         · gOfficeChair draws the executive and drafting chairs too, and
           neither is this row.
       And the two size-class pairs are id rules anchored ABOVE their own
       generator rule, for the reason the mini/midi/large excavators exist:
       one generator draws both classes and only the id says which. */
    { genRe: /^gRoundabout2$/, spec: 'roundabout-normal-icd' },
    { genRe: /^(gBeamBridge|gArchBridge|gFlyover)$/, spec: 'bridge-deck-s2' },
    { genRe: /^gAirliner$/, spec: 'airliner-narrowbody' },
    { genRe: /^gLocomotive$/, spec: 'locomotive-bobo' },
    { genRe: /^gTram2$/, spec: 'tram-lrv' },
    { re: /^tank-wagon-/, spec: 'wagon-tank-bogie' },
    { re: /^hopper-wagon-/, spec: 'wagon-hopper-bogie' },
    { re: /^box-van-|^wagon-\d/, spec: 'wagon-box-bogie' },
    /* WAS `{ re: /^shipping-container/, spec: 'container-40ft' }` AND IT WAS
       WRONG BY A FACTOR OF TWO. `Shipping container` occurs nowhere in the
       tree but worlds3.js, so that rule was evaluated against nothing at all
       while asset_scale.js spliced only MF_CATALOG — and the moment the gate
       saw W3 it put 28 TWENTY-FOOT bodies against the FORTY-FOOT row. genRe
       so it cannot be reached by an id that merely starts `shipping-
       container`, and the generator is hand-trimmed to ISO 668's 1CC rather
       than fitted, because site-core's gContainer shares this row and was
       rebuilt by hand. */
    { genRe: /^gContainerSingle$/, spec: 'container-20ft' },
    { genRe: /^gGoalPost$/, spec: 'goal-football-11aside' },
    { genRe: /^gPitch$/, spec: 'pitch-football-11aside' },
    { re: /^basket-court$/, spec: 'court-basketball-fiba' },
    { re: /^(tennis|clay)-court$/, spec: 'court-tennis-doubles' },
    { genRe: /^gParkBench2$/, spec: 'bench-park-2m' },
    { genRe: /^(gGazebo|gBandstand)$/, spec: 'bandstand-park-octagonal' },
    { genRe: /^gSwing$/, spec: 'swing-set-2seat' },
    { genRe: /^gMonkeyBars$/, spec: 'monkey-bars-overhead-ladder' },
    { genRe: /^gRoundabout$/, spec: 'roundabout-playground' },
    { re: /^ferris-wheel-giant-|^ferris-wheel-\d+-big$/, spec: 'ferris-wheel-giant-40m' },
    { genRe: /^gFerrisWheel$/, spec: 'ferris-wheel-transportable' },
    { re: /^drop-tower-mega-|^drop-tower-\d+-big$/, spec: 'drop-tower-27m' },
    { genRe: /^gDropTower$/, spec: 'drop-tower-15m' },
    { genRe: /^gCarousel$/, spec: 'carousel-fairground-10m' },
    { genRe: /^gAstronaut$/, spec: 'astronaut-suited-emu' },
    { re: /^rocket-/, spec: 'launch-vehicle-medium-f9' },
    { genRe: /^gStationModule$/, spec: 'space-station-module-iss' },
    { genRe: /^gRover$/, spec: 'mars-rover-perseverance' },
    { re: /^desktop-tower-/, spec: 'desktop-tower-atx' },
    { re: /^(task|mesh)-chair-/, spec: 'office-task-chair' },
    { genRe: /^gCabinet$/, spec: 'cabinet-havsta-81' },
    { genRe: /^gDresser$/, spec: 'dresser-malm-3-drawer' },
    { genRe: /^gWardrobe$/, spec: 'wardrobe-pax-forsand-100' },
    { genRe: /^gSideboard$/, spec: 'sideboard-besta-180' },
    { re: /^2-drawer-filing-cabinet/, spec: 'filing-cabinet-2-drawer' },
    { re: /^3-drawer-filing-cabinet/, spec: 'filing-cabinet-3-drawer' },
    { re: /^4-drawer-filing-cabinet/, spec: 'filing-cabinet-4-drawer' }

  ];

  /* The catalogue entry behind an id, if the catalogue is loaded at all.
     Guarded exactly the way mc-extents.js guards the same lookup: a bare
     `CATALOG_BY_ID` reference throws ReferenceError in precisely the case the
     check exists to survive, which is this file being loaded on its own. */
  function _entry(id) {
    var CBI = (typeof CATALOG_BY_ID !== 'undefined') ? CATALOG_BY_ID : null;
    if (!CBI && typeof rebuildCatIndex === 'function') {
      rebuildCatIndex();
      CBI = (typeof CATALOG_BY_ID !== 'undefined') ? CATALOG_BY_ID : null;
    }
    return (CBI && CBI[id]) || null;
  }

  /* A MAP row matches on the id (`re`) or on the generator that draws it
     (`genRe`). The generator is the honest key whenever the thing being
     identified is a KIND rather than a model — see the human figure at the top
     of MAP, where a name-based rule reached 2 of 79. The signature is
     unchanged, so every existing caller gets the generator rule for free;
     resolving the entry is one hash lookup and only happens on the first
     `genRe` row. */
  function specFor(catalogId) {
    if (!catalogId) return null;
    var id = String(catalogId), gen = null, looked = false;
    for (var i = 0; i < MAP.length; i++) {
      var m = MAP[i];
      if (m.genRe) {
        if (!looked) {
          var en = _entry(id);
          gen = (en && en.gen && en.gen.name) || '';
          looked = true;
        }
        if (gen && m.genRe.test(gen)) return SPECS[m.spec] || null;
        continue;
      }
      if (m.re && m.re.test(id)) return SPECS[m.spec] || null;
    }
    return null;
  }

  /* ==================================================================== */
  /* THE SWEPT ENVELOPE — what an axis-aligned box misses                  */
  /* ==================================================================== */
  function sweptEnvelope(spec) {
    if (typeof spec === 'string') spec = SPECS[spec];
    if (!spec || !spec.slew) return null;
    var s = spec.slew;
    var r = Math.max(s.radius || 0, s.counterRadius || 0, s.tailSwing || 0);
    if (!(r > 0)) return null;
    var d = 2 * r;
    return {
      radius: r, diameter: d,
      /* the box under-reports the swept circle by this much on each axis */
      boxUnderstatesL: d - spec.L, boxUnderstatesW: d - spec.W,
      pctL: (d / spec.L - 1) * 100, pctW: (d / spec.W - 1) * 100,
      note: 'clearance around a slewing machine is checked against the circle, never ' +
            'the box — and the box is short in the direction that says "it clears"'
    };
  }

  /* ==================================================================== */
  /* SANITY — eight engineering identities, each checkable on paper.       */
  /* These are not unit tests of this file; they are tests of the DATA,    */
  /* and each one catches a different class of transcription error that no */
  /* rendering test could see.                                            */
  /* ==================================================================== */
  function sanity() {
    var out = [];
    function C(id, name, ok, got) { out.push({ id: id, check: name, ok: !!ok, got: got }); }
    var e, s;

    /* C1. Tracked undercarriage width = track gauge + one shoe width. Catches
       the commonest excavator error: a shoe width used as a gauge. */
    ['excavator-mini-8t', 'excavator-20t', 'excavator-36t'].forEach(function (k) {
      s = SPECS[k]; if (!s) return; e = s.extras;
      if (e.trackGauge == null || e.trackShoeWidth == null) return;
      var w = e.trackGauge + e.trackShoeWidth;
      C(k, 'C1 undercarriage = gauge + shoe', Math.abs(w - s.W) <= 0.02,
        e.trackGauge + ' + ' + e.trackShoeWidth + ' = ' + w.toFixed(3) + ' vs W ' + s.W);
    });

    /* C2. Tail swing must exceed half the undercarriage width — the tail
       cannot be inside the tracks — and the ratio classifies the machine. */
    ['excavator-mini-8t', 'excavator-20t', 'excavator-36t'].forEach(function (k) {
      s = SPECS[k]; if (!s || !s.slew || s.slew.tailSwing == null) return;
      var ratio = s.slew.tailSwing / (s.W / 2);
      var band = s.slew.kind === 'compact-radius' ? [1.25, 1.55] : [1.65, 2.15];
      C(k, 'C2 tail swing ratio in band for ' + s.slew.kind,
        ratio > 1.0 && ratio >= band[0] && ratio <= band[1],
        'tailSwing/(W/2) = ' + ratio.toFixed(2) + ', band ' + band[0] + '-' + band[1]);
    });

    /* C3. Dimensional chain closure — the strongest structural test here. */
    s = SPECS['adt-745']; e = s && s.extras;
    if (e && e.axleFrontToHitch != null) {
      var sum = e.axleFrontToHitch + e.axleHitchToRear1 + e.axleRear1ToRear2 + e.rearOverhang;
      C('adt-745', 'C3 axle chain sums to L', Math.abs(sum - s.L) <= 0.025,
        sum.toFixed(3) + ' vs L ' + s.L);
    }
    s = SPECS['telehandler']; e = s && s.extras;
    if (e && e.wheelbase != null) {
      var sum2 = e.frontOverhang + e.wheelbase + e.rearOverhang;
      C('telehandler', 'C3 axle chain sums to L', Math.abs(sum2 - s.L) <= 0.025,
        sum2.toFixed(3) + ' vs L ' + s.L);
    }

    /* C4. MEWP convention: working height - platform height = 2.00 m exactly.
       Any MEWP row failing this has mixed the two figures, which is the most
       common MEWP data error there is. */
    s = SPECS['scissor-lift']; e = s && s.extras;
    if (e) {
      C('scissor-lift', 'C4 working - platform = 2.00 m (indoor)',
        Math.abs((e.workingHeightIndoor - e.platformHeightMaxIndoor) - 2) < 1e-9,
        (e.workingHeightIndoor - e.platformHeightMaxIndoor).toFixed(3) + ' m');
      C('scissor-lift', 'C4 working - platform = 2.00 m (outdoor)',
        Math.abs((e.workingHeightOutdoor - e.platformHeightMaxOutdoor) - 2) < 1e-9,
        (e.workingHeightOutdoor - e.platformHeightMaxOutdoor).toFixed(3) + ' m');
    }
    s = SPECS['boom-lift']; e = s && s.extras;
    if (e) C('boom-lift', 'C4 working - platform = 2.00 m',
      Math.abs((e.workingHeightMax - e.platformHeightMax) - 2) < 1e-9,
      (e.workingHeightMax - e.platformHeightMax).toFixed(3) + ' m');

    /* C6. Tower crane load moment: capacity x radius-at-capacity = designation. */
    s = SPECS['tower-crane-saddle-jib']; e = s && s.extras;
    if (e && e.designationTonneMetres) {
      var tm = e.maxCapacityTonnes * e.radiusAtMaxCapacity;
      C('tower-crane-saddle-jib', 'C6 load moment matches the designation',
        Math.abs(tm / e.designationTonneMetres - 1) <= 0.05,
        e.maxCapacityTonnes + ' t x ' + e.radiusAtMaxCapacity + ' m = ' + tm.toFixed(1) +
        ' tm vs designation ' + e.designationTonneMetres);
    }

    /* C7. Where the WHOLE UPPER STRUCTURE slews above a fixed base — a tower
       crane, a crawler crane, a tracked excavator — the swept circle contains
       the body, and clearance is checked against the circle rather than the
       box. This is the one that matters for clash.

       IT DOES NOT APPLY TO EVERY MACHINE WITH A SLEW RING, and asserting it
       everywhere was wrong: a boom lift and an all-terrain crane have a FIXED
       CHASSIS with a slewing turret on it, so the turret's circle and the
       chassis box are different objects and neither contains the other. Those
       rows carry `bodySlews: false` and are checked for a different thing —
       that they record the deployed footprint their circle actually needs. */
    Object.keys(SPECS).forEach(function (k) {
      s = SPECS[k]; if (!s.slew) return;
      if (s.slew.bodySlews === false) {
        C(k, 'C7b fixed chassis records its deployed footprint',
          s.slew.deployedWidth > 0 || s.slew.radius > 0,
          'the turret slews on a fixed ' + s.L + ' x ' + s.W + ' m chassis, so no circle ' +
          'bounds the body; deployed footprint ' +
          (s.slew.deployedWidth ? (s.slew.deployedWidth + ' m') : 'radius ' + s.slew.radius + ' m'));
        return;
      }
      var sw = sweptEnvelope(s); if (!sw) return;
      if (!(s.slew.sweptRadius > 0)) {
        C(k, 'C7 swept circle not assertable', true,
          'no front working radius is recorded for this row, so the circle that bounds ' +
          'the body is not stated — reported rather than assumed');
        return;
      }
      C(k, 'C7 swept circle contains the box',
        2 * s.slew.sweptRadius >= Math.max(s.L, s.W) - 1e-9,
        'swept radius ' + s.slew.sweptRadius + ' m gives a ' + (2 * s.slew.sweptRadius).toFixed(2) +
        ' m circle against a box of ' + s.L + ' x ' + s.W + ' m');
    });

    /* C_ISO. Every ISO container shares one width and one height family —
       the whole point of the series. */
    var ws = ['container-10ft', 'container-20ft', 'container-40ft', 'container-40ft-hc']
      .map(function (k) { return SPECS[k] && SPECS[k].W; }).filter(function (w) { return w != null; });
    C('container-*', 'ISO 668 series shares one width',
      ws.length === 4 && Math.max.apply(null, ws) === Math.min.apply(null, ws),
      'widths ' + ws.join(' / ') + ' m');

    /* C_STATE. Every plant row declares which state it is in. A row that does
       not is ambiguous by a factor of nearly three (see mobile-crane-at). */
    var plantNoState = Object.keys(SPECS).filter(function (k) {
      return SPECS[k].slew && SPECS[k].state === 'static';
    });
    C('*', 'every slewing asset declares a non-static state', plantNoState.length === 0,
      plantNoState.length ? plantNoState.join(', ') : 'all slewing rows declare transport/working/deployed');

    return out;
  }

  function mapped(catalogIds) {
    var out = [];
    for (var i = 0; i < catalogIds.length; i++) if (specFor(catalogIds[i])) out.push(catalogIds[i]);
    return out;
  }
  function all() { return Object.keys(SPECS).map(function (k) { return SPECS[k]; }); }

  /* ==================================================================== */
  /* THE COMPARISON the gate calls. Plan dimensions are compared as an     */
  /* unordered pair because the catalogue draws some assets along x and    */
  /* some along y; HEIGHT is never swapped, because an object lying down   */
  /* is a different object rather than a tolerance.                        */
  /* ==================================================================== */
  function check(catalogId, ext) {
    var spec = specFor(catalogId);
    if (!spec) return { ok: null, reason: 'no published dimension is recorded for ' + catalogId };
    if (!ext || !(ext.w > 0)) return { ok: false, spec: spec, reason: 'the asset measured no extent at all' };

    var drawnLong = Math.max(ext.w, ext.d), drawnShort = Math.min(ext.w, ext.d);
    var specLong = Math.max(spec.L, spec.W), specShort = Math.min(spec.L, spec.W);

    function one(drawn, want, key) {
      var r = spec.range && spec.range[key];
      if (r) return { key: key, drawn: drawn, want: want, range: r,
                      ok: drawn >= r[0] * (1 - spec.tol) && drawn <= r[1] * (1 + spec.tol),
                      pct: (drawn / want - 1) * 100 };
      return { key: key, drawn: drawn, want: want, range: null,
               ok: Math.abs(drawn / want - 1) <= spec.tol, pct: (drawn / want - 1) * 100 };
    }

    var axes = spec.checkAxes || ['L', 'W', 'H'];
    var parts = [one(drawnLong, specLong, 'L'), one(drawnShort, specShort, 'W'), one(ext.h, spec.H, 'H')]
      .filter(function (p) { return axes.indexOf(p.key) >= 0; });
    if (!parts.length) return { ok: null, spec: spec, reason: 'the row declares no checkable axis' };
    var worst = parts.reduce(function (m, p) { return Math.abs(p.pct) > Math.abs(m.pct) ? p : m; }, parts[0]);

    return {
      ok: parts.every(function (p) { return p.ok; }),
      spec: spec, parts: parts, worst: worst,
      drawn: { L: drawnLong, W: drawnShort, H: ext.h },
      summary: catalogId + ' drawn ' + drawnLong.toFixed(3) + ' x ' + drawnShort.toFixed(3) +
               ' x ' + ext.h.toFixed(3) + ' m, ' + spec.source + ' gives ' +
               specLong.toFixed(3) + ' x ' + specShort.toFixed(3) + ' x ' + spec.H.toFixed(3) +
               ' m (worst axis ' + worst.key + ' ' + (worst.pct >= 0 ? '+' : '') +
               worst.pct.toFixed(1) + '%, tolerance ' + (spec.tol * 100).toFixed(0) + '%' +
               (axes.length < 3 ? ('; only ' + axes.join('/') + ' are published for this row') : '') + ')'
    };
  }

  return {
    SPECS: SPECS, REFUSED: REFUSED, REJECTED: REJECTED, UNMAPPED: UNMAPPED, STATES: STATES,
    of: function (id) { return SPECS[id] || null; },
    specFor: specFor, check: check, mapped: mapped, all: all,
    sweptEnvelope: sweptEnvelope, sanity: sanity,
    _add: add
  };
})();
