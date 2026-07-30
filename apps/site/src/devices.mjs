// Every visual device on the page is generated from the number it illustrates
// (T9 job 4) — never hand-drawn. A grid of squares or a row of ticks is
// produced here from {value, total}; nothing downstream may re-count or
// re-describe it differently than what is rendered.
//
// scripts/check-devices.mjs re-parses the BUILT html and counts the filled
// cells itself, rather than trusting anything this file reports about its own
// output — that is what makes the check worth having.

/**
 * @param {{id: string, value: number, total: number}} figure
 * @param {{cols?: number}} [opts]
 * @returns {string} HTML for a grid/row device, `value` cells marked filled
 *   out of `total`.
 */
export function renderCountDevice(figure, opts = {}) {
  const { id, value, total } = figure;
  if (!Number.isInteger(value) || !Number.isInteger(total) || value < 0 || value > total) {
    throw new Error(`renderCountDevice: figure "${id}" has an invalid value/total (${value}/${total})`);
  }
  const cols = opts.cols || Math.min(total, 10);
  const cells = [];
  for (let i = 0; i < total; i++) {
    cells.push(`<span class="cell${i < value ? ' cell--filled' : ''}"></span>`);
  }
  return (
    `<div class="device device--grid" data-figure-id="${id}" data-figure-kind="measured" ` +
    `data-figure-total="${total}" style="--cols:${cols}">` +
    `<div class="device__grid">${cells.join('')}</div>` +
    `</div>`
  );
}

/**
 * The mechanism device (job 3's replacement for the yearly-words figure) has
 * no number in it by design — ADR-038 Decision 4. It shows the recurrence
 * itself: a word is tapped, waits, and comes back.
 */
export function renderMechanismDevice(figure) {
  return (
    `<div class="device device--loop" data-figure-id="${figure.id}" data-figure-kind="mechanism">` +
    `<span class="loop__chip loop__chip--tap">tap</span>` +
    `<span class="loop__arrow" aria-hidden="true">→</span>` +
    `<span class="loop__chip loop__chip--wait">waits</span>` +
    `<span class="loop__arrow" aria-hidden="true">→</span>` +
    `<span class="loop__chip loop__chip--back">comes back</span>` +
    `</div>`
  );
}
