/** Original IS4S practice schematic. Geometry illustrates choices, not building-code compliance. */
let diagramSequence = 0;

export function renderDiagram(options = {}) {
  const titleId = `room-title-${++diagramSequence}`;
  const descriptionId = `room-desc-${diagramSequence}`;
  const layout = ['rows', 'groups', 'horseshoe'].includes(options.layout) ? options.layout : 'groups';
  const people = [8, 12, 16, 24].includes(Number(options.people)) ? Number(options.people) : 12;
  const labels = options.labels !== false;
  const dimensions = options.dimensions !== false;
  const route = options.route !== false;
  const names = {rows: 'Rows', groups: 'Small groups', horseshoe: 'Horseshoe'};
  const ink = '#1A1512', red = '#B5141B', gold = '#FFBC00', muted = '#625D58';
  const seatPositions = [];
  let tables = '';

  // Every chair corresponds to one learner. Tables may be shared.
  function chair(x, y, angle = 0) {
    seatPositions.push({x, y, angle});
  }
  function desk(x, y, angle = 0) {
    tables += `<rect x="-20" y="-10" width="40" height="20" rx="3" transform="translate(${x} ${y}) rotate(${angle})" fill="#FFF0C2" stroke="${ink}" stroke-width="1.5"/>`;
    const radians = angle * Math.PI / 180;
    chair(x - 22 * Math.sin(radians), y + 22 * Math.cos(radians), angle);
  }

  if (layout === 'rows') {
    const columns = people === 24 ? 6 : 4;
    const rows = people / columns;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        desk(160 + column * (480 / (columns - 1)), 171 + row * 55);
      }
    }
  } else if (layout === 'groups') {
    const groupCount = Math.ceil(people / 4);
    const columns = groupCount === 2 ? 2 : 3;
    for (let group = 0; group < groupCount; group++) {
      const x = columns === 2 ? 265 + (group % 2) * 270 : 200 + (group % 3) * 200;
      const y = 197 + Math.floor(group / columns) * 119;
      tables += `<rect x="${x - 36}" y="${y - 24}" width="72" height="48" rx="5" fill="#FFF0C2" stroke="${ink}" stroke-width="1.5"/>`;
      chair(x - 18, y - 39, 180);
      chair(x + 18, y - 39, 180);
      chair(x - 18, y + 39);
      chair(x + 18, y + 39);
    }
  } else {
    const topCount = people === 8 ? 4 : people === 12 ? 4 : people === 16 ? 6 : 8;
    const sideCount = (people - topCount) / 2;
    for (let i = 0; i < topCount; i++) desk(220 + i * (360 / (topCount - 1)), 166, 180);
    tables += `<rect x="172" y="197" width="20" height="172" rx="3" fill="#FFF0C2" stroke="${ink}" stroke-width="1.5"/><rect x="608" y="197" width="20" height="172" rx="3" fill="#FFF0C2" stroke="${ink}" stroke-width="1.5"/>`;
    for (let i = 0; i < sideCount; i++) {
      const y = sideCount === 1 ? 270 : 212 + i * (143 / (sideCount - 1));
      chair(160, y, 90);
      chair(640, y, -90);
    }
  }

  const chairs = seatPositions.map(({x, y, angle}, index) => `<g class="learner-seat" data-seat="${index + 1}" transform="translate(${x} ${y}) rotate(${angle})"><rect x="-8" y="-7" width="16" height="14" rx="4" fill="white" stroke="${red}" stroke-width="1.6"/><path d="M-8 5H8" fill="none" stroke="${red}" stroke-width="3"/></g>`).join('');
  const routeGraphic = route ? `<path d="M138 430V387H662V430" fill="none" stroke="${red}" stroke-width="3" stroke-dasharray="8 7"/><path d="M655 422L662 432L669 422" fill="none" stroke="${red}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  const dimensionsGraphic = dimensions ? `<g fill="${muted}" stroke="${muted}" stroke-width="1"><path d="M80 54H720M80 49V59M720 49V59M747 72V422M742 72H752M742 422H752"/><rect x="361" y="43" width="78" height="22" fill="#F7F4F1" stroke="none"/><text x="400" y="59" text-anchor="middle" stroke="none" font-size="14">8 m</text><text x="769" y="250" text-anchor="middle" stroke="none" font-size="14" transform="rotate(90 769 250)">6 m</text></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-labelledby="${titleId} ${descriptionId}" style="font-family:'IBM Plex Sans','Segoe UI',Arial,sans-serif;max-width:100%;height:auto">
<title id="${titleId}">Community Learning Day: ${names[layout]}, ${people} learners</title>
<desc id="${descriptionId}">An original fictional room-planning diagram with ${people} chairs, one per learner, arranged in ${names[layout].toLowerCase()}. A demonstration bench is at the front. Entry and exit are along the bottom.${route ? ' A dashed red line shows a proposed route across the rear of the room.' : ''}${dimensions ? ' The room is labelled 8 metres wide and 6 metres deep.' : ''} This schematic is for comparing layouts and does not establish safe occupancy, accessibility or code compliance.</desc>
<rect width="800" height="500" rx="4" fill="#F7F4F1"/>
${dimensionsGraphic}
<rect x="80" y="72" width="640" height="350" rx="3" fill="#FFFFFF" stroke="${ink}" stroke-width="2"/>
<path d="M115 422H161M639 422H685" stroke="white" stroke-width="5"/>
<path d="M115 422V400M685 422V400" stroke="${ink}" stroke-width="2"/>
<rect x="300" y="93" width="200" height="35" rx="4" fill="${gold}" stroke="${ink}" stroke-width="1.5"/>
${labels ? `<text x="400" y="116" font-size="15" text-anchor="middle" fill="${ink}">Demonstration bench</text>` : ''}
${tables}${chairs}${routeGraphic}
${layout === 'horseshoe' && labels ? `<text x="400" y="283" text-anchor="middle" fill="${muted}" font-size="14">Shared demonstration space</text>` : ''}
${labels ? `<g fill="${muted}" font-size="14"><text x="138" y="448" text-anchor="middle">Entry</text><text x="662" y="448" text-anchor="middle">Exit</text></g>` : ''}
<g font-size="13" fill="${muted}"><rect x="254" y="466" width="20" height="12" rx="2" fill="#FFF0C2" stroke="${ink}"/><text x="282" y="477">Table</text><rect x="338" y="466" width="12" height="12" rx="3" fill="white" stroke="${red}" stroke-width="1.5"/><text x="358" y="477">${people} learner chairs</text>${route ? `<path d="M494 472H522" stroke="${red}" stroke-width="2" stroke-dasharray="5 4"/><text x="530" y="477">Proposed route</text>` : ''}</g>
</svg>`;
}
