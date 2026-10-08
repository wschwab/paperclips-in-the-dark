// Local demonstration only: URL parameters carry the committed loadout.
// No API requests, app storage writes, or enforcement of game limits.
const limits = { Light: 3, Normal: 5, Heavy: 6 }; // game-settings LoadMaxima.CommitmentMaxBulk
const params = new URLSearchParams(location.search);
let load = params.get('load') || 'Normal';
let items = (params.has('items') ? params.get('items') : '0,1').split(',');
const committedLoad = load;
const committedItems = [...items];
function renderLoadout() {
  document.querySelectorAll('[data-load]').forEach(button => {
    const shownLoad = button.closest('.dialog') ? load : committedLoad;
    button.classList.toggle('selected', button.dataset.load === shownLoad);
  });
  document.querySelectorAll('[data-gear]').forEach(input => {
    const shownItems = input.closest('.dialog') ? items : committedItems;
    input.checked = shownItems.includes(input.dataset.gear);
  });
  document.querySelectorAll('.load-total').forEach(total => {
    const container = total.closest('.dialog, .sheet-card');
    const bulk = [...container.querySelectorAll('[data-gear]:checked')].reduce((sum, input) => sum + Number(input.dataset.bulk), 0);
    const shownLoad = total.closest('.dialog') ? load : committedLoad;
    total.textContent = `${bulk} of ${limits[shownLoad]} load committed · ${shownLoad}`;
  });
  document.querySelectorAll('a[href]').forEach(link => {
    const url = new URL(link.getAttribute('href'), location.href);
    if (!url.pathname.endsWith('.html') || url.origin !== location.origin) return;
    const committing = link.classList.contains('commit-load');
    url.searchParams.set('load', committing ? load : committedLoad);
    url.searchParams.set('items', (committing ? items : committedItems).join(','));
    link.href = url.href;
  });
}
document.querySelectorAll('[data-load]:not(:disabled)').forEach(button => {
  button.addEventListener('click', () => { load = button.dataset.load; renderLoadout(); });
});
document.querySelectorAll('[data-gear]:not(:disabled)').forEach(input => {
  input.addEventListener('change', () => {
    items = [...input.closest('.dialog').querySelectorAll('[data-gear]:checked')].map(item => item.dataset.gear);
    renderLoadout();
  });
});
document.querySelectorAll('.plan').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.plan').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
  });
});
document.querySelectorAll('[data-adjust]').forEach(button => {
  button.addEventListener('click', () => {
    const remaining = button.closest('section,aside').querySelector('.remaining');
    remaining.textContent = `${parseInt(remaining.textContent) + Number(button.dataset.adjust)} of 2 left`;
  });
});
document.querySelectorAll('[data-activity]').forEach(button => {
  button.addEventListener('click', () => {
    const panel = button.closest('section,aside');
    const remaining = panel.querySelector('.remaining');
    remaining.textContent = `${parseInt(remaining.textContent) - 1} of 2 left`;
    panel.querySelector('.activity-feedback').textContent = `${button.dataset.activity} noted · 1 activity spent. Local mockup only.`;
  });
});
document.querySelectorAll('[data-mark]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('.mark-feedback').textContent = `1 XP marked in ${button.dataset.mark} · local mockup only.`;
  });
});
document.querySelectorAll('[data-save-crew]').forEach(button => {
  button.addEventListener('click', () => {
    const dialog = button.closest('.dialog');
    const values = [...dialog.querySelectorAll('.crew-editors input[aria-label]')].map(input => `${input.getAttribute('aria-label')}: ${input.value}`).join(' · ');
    dialog.querySelector('.crew-feedback').textContent = `${values} noted · local mockup only, no crew data saved.`;
  });
});
document.querySelector('#desperate')?.addEventListener('click', () => {
  document.querySelector('#xp-feedback').textContent = `1 XP marked in ${document.querySelector('.mode-panel select').value} · local mockup only.`;
});
renderLoadout();
