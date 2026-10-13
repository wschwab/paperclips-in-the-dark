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
      const focusable = [...surface.querySelectorAll('a[href], button, select, input, summary, [tabindex="0"]')]
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
    // Same structure and state model as the sheet's stressTrack / Talents rows.
    const stressTrack = (value, max, label, onChange) => {
      const wrap = element('div', 'stress');
      const track = element('div', 'stress-track');
      track.setAttribute('role', 'group');
      track.setAttribute('aria-label', `${label}: ${value} of ${max}`);
      for (let index = 1; index <= max; index++) {
        const box = element('button', 'stress-box');
        box.type = 'button';
        box.dataset.stress = index <= value ? '1' : '0';
        box.dataset.index = String(index);
        box.setAttribute('aria-label', `Stress ${index}`);
        box.setAttribute('aria-pressed', String(index <= value));
        box.addEventListener('click', () => onChange(value === index ? index - 1 : index, index));
        track.append(box);
      }
      wrap.append(track, element('div', 'stress-label lbl', label));
      return wrap;
    };
    const renderExpressions = () => {
      const container = document.querySelector('#session-expressions');
      if (!container) return;
      container.replaceChildren();
      container.append(element('p', 'small expression-condition', `${data.playbook.name}: ${data.playbook.experienceCondition}`));
      for (const expression of data.expressions) {
        const section = element('section', 'expression-row');
        const row = element('div', 'session-track');
        row.dataset.sessionTrack = expression.key;
        const update = (value, focusLabel) => {
          values[expression.key] = value;
          renderExpressions();
          const replacement = [...container.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === focusLabel);
          if (replacement && !replacement.disabled) replacement.focus();
          else container.querySelectorAll('output')[data.expressions.indexOf(expression)].focus();
        };
        row.append(stressTrack(values[expression.key], data.sessionExpressionMax, expression.label, (value, index) => {
          values[expression.key] = value;
          renderExpressions();
          container.querySelector(`[data-session-track="${expression.key}"] .stress-box[data-index="${index}"]`).focus();
        }));
        const output = element('output', '', `${values[expression.key]} / ${data.sessionExpressionMax}`);
        output.setAttribute('aria-label', expression.label);
        output.setAttribute('aria-live', 'polite');
        output.tabIndex = -1;
        row.append(output);
        for (const delta of [-1, 1]) {
          const button = element('button', 'btn-secondary', delta < 0 ? '−1' : '+1');
          const label = `${delta < 0 ? 'Remove' : 'Add'} 1 ${expression.label}`;
          button.type = 'button';
          button.title = label;
          button.setAttribute('aria-label', label);
          button.disabled = delta < 0 ? values[expression.key] === 0 : values[expression.key] >= data.sessionExpressionMax;
          button.addEventListener('click', () => update(values[expression.key] + delta, label));
          row.append(button);
        }
        section.append(row);
        container.append(section);
      }
      const triggers = element('details', 'expression-condition');
      triggers.append(element('summary', 'small', 'Scoundrel & Struggle triggers'));
      for (const expression of data.expressions.filter(item => item.key !== 'playbook')) {
        triggers.append(element('p', 'small', `${expression.label}: ${expression.condition}`));
      }
      container.append(triggers);
      document.querySelector('#compact-summary').textContent = `${total()} expression XP`;
    };
    document.querySelectorAll('[data-expression-max]').forEach(node => { node.textContent = data.sessionExpressionMax; });
    const markingRule = document.querySelector('.tracker-rule');
    if (markingRule) {
      const disclosure = element('details', 'marking-rule');
      markingRule.before(disclosure);
      disclosure.append(element('summary', 'small', 'How to mark session XP'), markingRule);
    }
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
      const allocations = { ...data.illustrative.allocation };
      const scenario = params.get('allocation');
      if (scenario === 'ready') Object.keys(allocations).forEach(name => { allocations[name] = 1; });
      const totalInput = document.querySelector('#xp-total');
      const adjust = document.querySelector('#adjust-total');
      totalInput.value = scenario === 'adjusted' ? '5' : String(total());
      adjust.checked = scenario === 'adjusted';
      totalInput.disabled = !adjust.checked;
      const next = document.querySelector('#resolution-next');
      const feedback = document.querySelector('#resolution-feedback');
      const rows = document.querySelector('#allocation-rows');
      let completed = false;
      const isInteger = value => Number.isInteger(value) && value >= 0;
      const readNumber = input => input.value.trim() === '' ? NaN : Number(input.value);
      const renderResolutionExpressions = () => {
        resolution.replaceChildren();
        for (const expression of data.expressions) {
          const row = element('div', 'resolution-expression');
          row.append(element('span', 'lbl', expression.label), element('output', '', `${values[expression.key]} / ${data.sessionExpressionMax}`));
          resolution.append(row);
        }
        document.querySelector('#conversion-equation').textContent = `${data.expressions.map(expression => values[expression.key]).join(' + ')} = ${total()} session XP`;
      };
      const controls = new Map();
      const refresh = () => {
        const available = readNumber(totalInput);
        const assigned = Object.values(allocations).reduce((sum, value) => sum + value, 0);
        const remaining = available - assigned;
        document.querySelector('#xp-available').textContent = isInteger(available) ? String(available) : '—';
        document.querySelector('#xp-remaining').textContent = Number.isFinite(remaining) ? String(remaining) : '—';
        const errors = [];
        if (!isInteger(available)) errors.push('GM total must be a nonnegative whole number.');
        for (const [name, control] of controls) {
          const amount = allocations[name];
          const room = maximum(name) - xp[name];
          const valid = isInteger(amount);
          control.room.textContent = `${xp[name]} / ${maximum(name)} current → ${valid ? xp[name] + amount : '—'} / ${maximum(name)} planned · ${valid ? room - amount : '—'} room left`;
          control.preview.replaceChildren();
          const marks = trackMarks(xp[name], maximum(name), `${name}: ${xp[name]} current, ${valid ? amount : 'invalid'} planned, maximum ${maximum(name)}`);
          [...marks.children].forEach((mark, index) => {
            if (index >= xp[name] && valid && index < xp[name] + amount) mark.className = 'planned';
          });
          control.preview.append(marks);
          control.input.setAttribute('aria-invalid', String(!valid || amount > room));
          control.minus.disabled = completed || !valid || amount === 0;
          control.plus.disabled = completed || !valid;
          if (!valid) errors.push(`${name} allocation must be a nonnegative whole number.`);
          else if (amount > room) errors.push(`${name} exceeds its room by ${amount - room}; reduce its allocation.`);
        }
        totalInput.setAttribute('aria-invalid', String(!isInteger(available) || remaining < 0));
        if (isInteger(available) && Number.isFinite(remaining)) {
          if (remaining > 0) errors.push(`Assign the remaining ${remaining} XP to continue.`);
          if (remaining < 0) errors.push(`${-remaining} XP over the total; reduce allocations or Adjust the GM total.`);
        }
        next.disabled = !completed && errors.length > 0;
        if (!completed) feedback.textContent = errors.length ? errors.join(' ') : 'All XP placed within track limits. Ready to complete; nothing awarded or cleared yet.';
      };
      for (const name of Object.keys(xp)) {
        const row = element('div', 'allocation-row');
        const copy = element('div', 'allocation-copy');
        const label = element('label', 'lbl', name === 'Playbook' ? 'Playbook XP' : `${name} trait XP`);
        label.htmlFor = `allocation-${name.toLowerCase()}`;
        const room = element('p', 'small');
        const preview = element('div', 'allocation-preview');
        copy.append(label, room, preview);
        const stepper = element('div', 'allocation-stepper');
        const input = element('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.inputMode = 'numeric';
        input.id = label.htmlFor;
        input.value = String(allocations[name]);
        input.setAttribute('aria-describedby', `${input.id}-room`);
        room.id = `${input.id}-room`;
        const minus = element('button', 'btn-secondary', '−');
        const plus = element('button', 'btn-secondary', '+');
        for (const [button, delta] of [[minus, -1], [plus, 1]]) {
          button.type = 'button';
          button.setAttribute('aria-label', `${delta < 0 ? 'Remove' : 'Add'} 1 ${name} allocation`);
          button.addEventListener('click', () => {
            allocations[name] += delta;
            input.value = String(allocations[name]);
            refresh();
          });
        }
        input.addEventListener('input', () => { allocations[name] = readNumber(input); refresh(); });
        stepper.append(minus, input, plus);
        row.append(copy, stepper);
        rows.append(row);
        controls.set(name, { input, room, preview, minus, plus });
      }
      adjust.addEventListener('change', () => { totalInput.disabled = !adjust.checked; refresh(); });
      totalInput.addEventListener('input', refresh);
      renderResolutionExpressions();
      refresh();
      next.addEventListener('click', () => {
        if (completed) {
          location.href = '06b-payoff.html';
          return;
        }
        refresh();
        if (next.disabled) return;
        const awarded = readNumber(totalInput);
        const summary = Object.entries(allocations).filter(([, amount]) => amount > 0).map(([name, amount]) => `${name} +${amount}`).join(', ') || '0 XP';
        for (const name of Object.keys(xp)) xp[name] += allocations[name];
        for (const key of Object.keys(values)) values[key] = 0;
        completed = true;
        renderPermanent();
        renderResolutionExpressions();
        for (const [name, control] of controls) {
          control.room.textContent = `${xp[name]} / ${maximum(name)} current · ${maximum(name) - xp[name]} room left · ${allocations[name]} awarded`;
          control.preview.replaceChildren(trackMarks(xp[name], maximum(name), `${name} XP: ${xp[name]} of ${maximum(name)} after award`));
          control.input.disabled = true;
          control.minus.disabled = true;
          control.plus.disabled = true;
        }
        adjust.disabled = true;
        totalInput.disabled = true;
        document.querySelector('#clear-notice').textContent = 'Scoundrel XP completed locally. Only Playbook, Scoundrel and Struggle session expressions cleared. Permanent XP retained; no API request or saved change.';
        feedback.textContent = `Preview complete: ${awarded} XP awarded (${summary}); all three session tracks reset to zero. Continue to Payoff.`;
        next.textContent = 'Next · Payoff';
      });
    }
    document.querySelector('#data-feedback').textContent = 'XP limits and Lurk condition loaded from game settings · SRD expression prompts.';
  } catch (error) {
    document.querySelector('#data-feedback').textContent = `${error.message} Serve this mockup over HTTP and reload to use sourced XP controls.`;
    document.querySelectorAll('#mark-desperate, #resolution-next').forEach(button => { button.disabled = true; });
  }
})();
