// Design preview only. Fetch static settings; never call an API or write storage.
(async function () {
  const params = new URLSearchParams(location.search);
  const theme = params.get('theme');
  if (theme === 'high-contrast') {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.contrast = 'high';
  } else if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
    delete document.documentElement.dataset.contrast;
  }
  const panel = document.querySelector('#xp-tracker');
  const toggle = document.querySelector('.tracker-toggle');
  const compact = matchMedia('(max-width:1099px)');
  let expanded = document.body.dataset.initialExpanded === 'true';
  // The footer tab stays inside the compact dialog so it can also close it.
  const surface = panel ? document.createElement('div') : null;
  if (surface) {
    surface.className = 'xp-surface';
    surface.id = 'xp-surface';
    panel.before(surface);
    surface.append(panel, document.querySelector('.compact-footer'));
  }
  const background = [
    document.querySelector('body > .app-bar'),
    document.querySelector('#character-sheet'),
    document.querySelector('.side-rail .mode-panel'),
  ].filter(Boolean).map(node => ({ node, originallyInert: node.inert }));
  const updateDisclosure = () => {
    if (!panel) return;
    panel.classList.toggle('is-open', expanded);
    panel.inert = compact.matches && !expanded;
    toggle.setAttribute('aria-expanded', String(!compact.matches || expanded));
    const modal = compact.matches && expanded;
    for (const { node, originallyInert } of background) node.inert = modal || originallyInert;
    if (modal) {
      surface.setAttribute('role', 'dialog');
      surface.setAttribute('aria-modal', 'true');
      surface.setAttribute('aria-labelledby', panel.getAttribute('aria-labelledby'));
    } else {
      surface.removeAttribute('role');
      surface.removeAttribute('aria-modal');
      surface.removeAttribute('aria-labelledby');
    }
  };
  const setExpanded = (open, focus = true) => {
    expanded = open;
    updateDisclosure();
    if (focus && compact.matches) {
      if (open) panel.querySelector('.tracker-close').focus();
      else toggle.focus();
    }
  };
  let tabDragged = false;
  toggle?.addEventListener('click', event => {
    if (tabDragged && event.detail > 0) {
      tabDragged = false;
      return;
    }
    tabDragged = false;
    setExpanded(!expanded);
  });
  panel?.querySelector('.tracker-close').addEventListener('click', () => setExpanded(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compact.matches && expanded) {
      event.preventDefault();
      setExpanded(false);
    }
    if (event.key === 'Tab' && compact.matches && expanded && surface) {
      const focusable = [...surface.querySelectorAll('a[href], button, select, input, [tabindex="0"]')]
        .filter(node => !node.disabled && !node.closest('[inert]') && node.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  compact.addEventListener('change', updateDisclosure);
  updateDisclosure();
  // Drag supplements the real click/keyboard disclosure; it never replaces it.
  let tabDragStart = null;
  toggle?.addEventListener('pointerdown', event => {
    tabDragged = false;
    tabDragStart = event.clientY;
    toggle.setPointerCapture(event.pointerId);
  });
  toggle?.addEventListener('pointerup', event => {
    if (tabDragStart !== null && tabDragStart - event.clientY > 45 && compact.matches) {
      tabDragged = true;
      setExpanded(true);
    }
    tabDragStart = null;
  });
  toggle?.addEventListener('pointercancel', () => { tabDragStart = null; });
  const drag = panel?.querySelector('.drag-handle');
  let dragStart = null;
  drag?.addEventListener('pointerdown', event => {
    dragStart = event.clientY;
    drag.setPointerCapture(event.pointerId);
  });
  drag?.addEventListener('pointerup', event => {
    if (dragStart !== null && event.clientY - dragStart > 45) setExpanded(false);
    dragStart = null;
  });
  drag?.addEventListener('pointercancel', () => { dragStart = null; });
  try {
    const response = await fetch('xp-tracker-data.json');
    if (!response.ok) throw new Error('XP settings could not be loaded.');
    const data = await response.json();
    const values = { ...data.illustrative.expressions };
    const xp = { ...data.illustrative.xp };
    const maximum = track => track === 'Playbook' ? data.xpTrackMaxima.Playbook : data.xpTrackMaxima.Attribute;
    const total = () => Object.values(values).reduce((sum, value) => sum + value, 0);
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const trackMarks = (value, max, label) => {
      const track = element('div', 'track');
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', `${label}: ${value} of ${max}`);
      for (let index = 0; index < max; index++) {
        const mark = element('i', index < value ? 'filled' : '');
        mark.setAttribute('aria-hidden', 'true');
        track.append(mark);
      }
      return track;
    };
    const renderPermanent = () => {
      const container = document.querySelector('#permanent-xp');
      container.replaceChildren();
      for (const name of Object.keys(xp)) {
        const row = element('div', 'permanent-row');
        const heading = element('div', 'permanent-heading');
        heading.append(element('span', 'lbl', `${name} XP`), element('span', 'small', `${xp[name]} / ${maximum(name)}`));
        row.append(heading, trackMarks(xp[name], maximum(name), `${name} XP`));
        container.append(row);
      }
    };
    const renderExpressions = () => {
      const container = document.querySelector('#session-expressions');
      if (!container) return;
      container.replaceChildren();
      for (const expression of data.expressions) {
        const row = element('section', 'expression-row');
        row.append(element('h3', '', expression.label), element('p', 'small', expression.condition));
        const controls = element('div', 'expression-controls');
        const actions = element('div', 'expression-actions');
        const output = element('output', '', `${values[expression.key]} / ${data.sessionExpressionMax}`);
        output.setAttribute('aria-label', expression.label);
        output.setAttribute('aria-live', 'polite');
        for (const delta of [-1, 1]) {
          const button = element('button', 'btn-secondary', delta < 0 ? '−1' : '+1');
          button.type = 'button';
          button.setAttribute('aria-label', `${delta < 0 ? 'Remove' : 'Add'} 1 ${expression.label}`);
          button.disabled = delta < 0 ? values[expression.key] === 0 : values[expression.key] >= data.sessionExpressionMax;
          button.addEventListener('click', () => {
            values[expression.key] += delta;
            // Preserve focus across local rerenders, including a now-disabled button.
            const focusLabel = button.getAttribute('aria-label');
            renderExpressions();
            const replacement = [...container.querySelectorAll('button')].find(candidate => candidate.getAttribute('aria-label') === focusLabel);
            if (replacement && !replacement.disabled) replacement.focus();
            else container.querySelectorAll('output')[data.expressions.indexOf(expression)].focus();
          });
          actions.append(button);
          if (delta < 0) actions.append(output);
        }
        output.tabIndex = -1;
        controls.append(trackMarks(values[expression.key], data.sessionExpressionMax, expression.label), actions);
        row.append(controls);
        container.append(row);
      }
      document.querySelector('#compact-summary').textContent = `${total()} expression XP`;
    };
    document.querySelectorAll('[data-expression-max]').forEach(node => { node.textContent = data.sessionExpressionMax; });
    document.querySelector('#mark-desperate')?.addEventListener('click', () => {
      const attribute = document.querySelector('#desperate-attribute').value;
      const feedback = document.querySelector('#desperate-feedback');
      if (xp[attribute] >= maximum(attribute)) {
        feedback.textContent = `${attribute} XP is full. Resolve advancement on the sheet before adding a mark. Preview only.`;
        return;
      }
      xp[attribute]++;
      renderPermanent();
      feedback.textContent = `1 ${attribute} XP marked now · preview only. Not part of expression conversion.`;
    });
    renderPermanent();
    renderExpressions();
    const resolution = document.querySelector('#resolution-expressions');
    if (resolution) {
      for (const expression of data.expressions) {
        const row = element('div', 'expression-row resolution-expression');
        const copy = element('div');
        copy.append(element('span', 'lbl', expression.label), element('p', 'small', expression.condition));
        row.append(copy, element('output', '', String(values[expression.key])));
        resolution.append(row);
      }
      document.querySelector('#conversion-equation').textContent = `${data.expressions.map(expression => values[expression.key]).join(' + ')} = ${total()} XP`;
      const next = document.querySelector('#resolution-next');
      let completed = false;
      next.addEventListener('click', () => {
        if (completed) {
          location.href = '06b-payoff.html';
          return;
        }
        const name = document.querySelector('#award-track').value;
        const amount = total();
        if (xp[name] + amount > maximum(name)) {
          document.querySelector('#resolution-feedback').textContent = `${name} cannot hold all ${amount} marks in this example. Choose another track; split awards or advancement would be handled on the real sheet.`;
          return;
        }
        xp[name] += amount;
        for (const key of Object.keys(values)) values[key] = 0;
        completed = true;
        renderPermanent();
        resolution.querySelectorAll('output').forEach(output => { output.textContent = '0'; });
        document.querySelector('#conversion-equation').textContent = `${amount} XP awarded to ${name} · preview`;
        document.querySelector('#award-track').disabled = true;
        document.querySelector('#clear-notice').textContent = 'Scoundrel XP completed in this preview. Playbook, Scoundrel and Struggle session tracks are now cleared. Permanent XP remains; no API request or saved change.';
        document.querySelector('#resolution-feedback').textContent = `Preview complete: ${amount} ${name} XP added; session expressions reset to zero. Continue to Payoff.`;
        next.textContent = 'Next · Payoff';
      });
    }
    document.querySelector('#data-feedback').textContent = 'XP limits and Lurk condition loaded from game settings · SRD expression prompts.';
  } catch (error) {
    document.querySelector('#data-feedback').textContent = `${error.message} Serve this mockup over HTTP and reload to use sourced XP controls.`;
    document.querySelectorAll('#mark-desperate, #resolution-next').forEach(button => { button.disabled = true; });
  }
})();
