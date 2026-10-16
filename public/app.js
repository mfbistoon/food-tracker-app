(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DEFAULT_GOALS = { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 65 };
  const MACROS = [
    { key: 'protein_g', label: 'Protein', color: 'var(--protein)' },
    { key: 'carbs_g', label: 'Carbs', color: 'var(--carbs)' },
    { key: 'fat_g', label: 'Fat', color: 'var(--fat)' },
  ];

  // ---------- store ----------
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  let meals = load('meals', []);
  let goals = { ...DEFAULT_GOALS, ...load('goals', {}) };
  const persistMeals = () => {
    try { save('meals', meals); }
    catch { alert('Storage is full. Export your data and delete old logs.'); }
  };

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDay = (key) => new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const r1 = (n) => Math.round(n * 10) / 10;
  const sumMeals = (list) => list.reduce((a, m) => ({
    calories: a.calories + m.totals.calories, protein_g: a.protein_g + m.totals.protein_g,
    carbs_g: a.carbs_g + m.totals.carbs_g, fat_g: a.fat_g + m.totals.fat_g,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const byDay = () => {
    const map = {};
    for (const m of meals) (map[dayKey(m.ts)] ||= []).push(m);
    return map;
  };

  // ---------- tabs ----------
  function showTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo(0, 0);
    render();
  }
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- meal list ----------
  function mealRow(m) {
    return `<div class="meal">
      ${m.thumb ? `<img src="${m.thumb}" alt="">` : '<div class="noimg"></div>'}
      <div class="info">
        <div class="name">${esc(m.name)}</div>
        <div class="sub">${fmtTime(m.ts)} · ${Math.round(m.totals.calories)} kcal · P ${r1(m.totals.protein_g)} C ${r1(m.totals.carbs_g)} F ${r1(m.totals.fat_g)}</div>
      </div>
      <button class="del" data-del="${m.id}" aria-label="Delete meal">🗑</button>
    </div>`;
  }
  document.addEventListener('click', (e) => {
    const id = e.target.closest('[data-del]')?.dataset.del;
    if (!id) return;
    if (confirm('Delete this meal?')) { meals = meals.filter((m) => m.id !== id); persistMeals(); render(); }
  });

  // ---------- today ----------
  function renderToday() {
    const list = (byDay()[dayKey(Date.now())] || []).sort((a, b) => a.ts - b.ts);
    const t = sumMeals(list);
    const C = 326.7;
    const pct = goals.calories ? Math.min(t.calories / goals.calories, 1) : 0;
    const fg = $('#ring-fg');
    fg.style.strokeDashoffset = C * (1 - pct);
    fg.classList.toggle('over', goals.calories && t.calories > goals.calories);
    $('#ring-cal').textContent = Math.round(t.calories);
    $('#ring-goal').textContent = `/ ${goals.calories} kcal`;
    $('#macro-bars').innerHTML = MACROS.map((m) => {
      const w = goals[m.key] ? Math.min((t[m.key] / goals[m.key]) * 100, 100) : 0;
      return `<div class="macro"><div class="top"><span>${m.label}</span><span>${Math.round(t[m.key])} / ${goals[m.key]} g</span></div>
        <div class="bar"><i style="width:${w}%;background:${m.color}"></i></div></div>`;
    }).join('');
    $('#today-list').innerHTML = list.length ? list.map(mealRow).join('') : '<div class="empty">No meals logged today. Snap a photo to get started!</div>';
  }

  // ---------- history ----------
  let range = 7;
  $$('#range-seg button').forEach((b) => b.addEventListener('click', () => {
    range = +b.dataset.range;
    $$('#range-seg button').forEach((x) => x.classList.toggle('active', x === b));
    renderHistory();
  }));

  function lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dayKey(d)); }
    return out;
  }

  function renderHistory() {
    const map = byDay();
    const keys = lastDays(range);
    const totals = keys.map((k) => sumMeals(map[k] || []));
    const logged = totals.filter((_, i) => (map[keys[i]] || []).length);

    // bar chart
    const W = 600, H = 200, pad = { l: 36, r: 8, t: 14, b: 26 };
    const max = Math.max(goals.calories * 1.1, ...totals.map((t) => t.calories), 100);
    const bw = (W - pad.l - pad.r) / keys.length;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    const bars = totals.map((t, i) => {
      const x = pad.l + i * bw + bw * 0.15;
      const h = Math.max(H - pad.b - y(t.calories), 0);
      const over = t.calories > goals.calories;
      const label = range === 7 ? new Date(keys[i] + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })
        : (i % 5 === 0 ? keys[i].slice(5) : '');
      return `<rect x="${x}" y="${y(t.calories)}" width="${bw * 0.7}" height="${h}" rx="3" fill="${over ? 'var(--danger)' : 'var(--accent)'}"><title>${fmtDay(keys[i])}: ${Math.round(t.calories)} kcal</title></rect>
        <text x="${x + bw * 0.35}" y="${H - 8}" font-size="11" text-anchor="middle" fill="var(--muted)">${label}</text>`;
    }).join('');
    $('#chart-cal').innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories per day">
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(goals.calories)}" y2="${y(goals.calories)}" stroke="var(--muted)" stroke-dasharray="4 4"/>
      <text x="${pad.l - 4}" y="${y(goals.calories) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${goals.calories}</text>
      ${bars}</svg></div>`;
    const avg = logged.length ? Math.round(logged.reduce((a, t) => a + t.calories, 0) / logged.length) : 0;
    $('#avg-line').textContent = logged.length ? `Average on ${logged.length} logged day${logged.length > 1 ? 's' : ''}: ${avg} kcal (goal ${goals.calories}). Dashed line = goal.` : 'No data in this range yet.';

    // macro split by calories (4/4/9)
    if (logged.length) {
      const avgM = (k) => logged.reduce((a, t) => a + t[k], 0) / logged.length;
      const kc = { protein_g: avgM('protein_g') * 4, carbs_g: avgM('carbs_g') * 4, fat_g: avgM('fat_g') * 9 };
      const tot = kc.protein_g + kc.carbs_g + kc.fat_g || 1;
      $('#macro-split').innerHTML = `<div class="split">${MACROS.map((m) => `<div style="width:${(kc[m.key] / tot) * 100}%;background:${m.color}"></div>`).join('')}</div>
        <div class="legend">${MACROS.map((m) => `<span><i style="background:${m.color}"></i>${m.label} ${Math.round((kc[m.key] / tot) * 100)}% · ${Math.round(avgM(m.key))} g/day</span>`).join('')}</div>`;
    } else $('#macro-split').innerHTML = '<div class="empty">Log some meals to see your macro split.</div>';

    // daily list
    const days = Object.keys(map).sort().reverse().filter((k) => keys.includes(k));
    $('#history-list').innerHTML = days.length ? days.map((k) => {
      const t = sumMeals(map[k]);
      return `<div class="dayhead"><span>${fmtDay(k)}</span><span>${Math.round(t.calories)} kcal</span></div>` +
        map[k].sort((a, b) => a.ts - b.ts).map(mealRow).join('');
    }).join('') : '<div class="empty">Nothing logged in this range.</div>';
  }

  // ---------- capture & review ----------
  const modal = $('#modal');
  let pending = null; // { image (base64), mediaType, thumb, result }

  function setModal(state) {
    $('#modal-loading').hidden = state !== 'loading';
    $('#modal-error').hidden = state !== 'error';
    $('#review-form').hidden = state !== 'review';
    modal.hidden = state === 'closed';
    document.body.style.overflow = state === 'closed' ? '' : 'hidden';
  }

  function resizeImage(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  async function analyze(note) {
    setModal('loading');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: pending.image, mediaType: 'image/jpeg', note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      pending.result = data;
      showReview();
    } catch (err) {
      $('#modal-error-msg').textContent = err.message;
      setModal('error');
    }
  }

  function showReview() {
    const r = pending.result, f = $('#review-form');
    $('#review-img').src = pending.preview;
    f.name.value = r.name;
    f.calories.value = Math.round(r.totals.calories);
    f.protein_g.value = r.totals.protein_g;
    f.carbs_g.value = r.totals.carbs_g;
    f.fat_g.value = r.totals.fat_g;
    $('#review-meta').textContent = `AI estimate · confidence: ${r.confidence}${r.notes ? ' · ' + r.notes : ''}`;
    $('#review-items').innerHTML = r.items.map((i) => `<li>${esc(i.name)} (${esc(i.portion)}) — ${Math.round(i.calories)} kcal</li>`).join('');
    setModal('review');
  }

  $('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const preview = await resizeImage(file, 1024, 0.85);
      const thumb = await resizeImage(file, 160, 0.7);
      pending = { preview, thumb, image: preview.split(',')[1] };
      analyze();
    } catch (err) {
      $('#modal-error-msg').textContent = err.message;
      setModal('error');
    }
  });

  $('#reanalyze').addEventListener('click', () => analyze($('#review-note').value.trim()));
  $('#review-cancel').addEventListener('click', () => { pending = null; setModal('closed'); });
  $('#modal-close-err').addEventListener('click', () => { pending = null; setModal('closed'); });
  modal.addEventListener('click', (e) => { if (e.target === modal && $('#modal-loading').hidden) { pending = null; setModal('closed'); } });

  $('#review-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    meals.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      ts: Date.now(),
      name: f.name.value.trim() || 'Meal',
      items: pending.result.items,
      totals: { calories: +f.calories.value, protein_g: +f.protein_g.value, carbs_g: +f.carbs_g.value, fat_g: +f.fat_g.value },
      thumb: pending.thumb,
    });
    persistMeals();
    pending = null;
    $('#review-note').value = '';
    setModal('closed');
    render();
  });

  // ---------- advice ----------
  function md(text) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    let html = '', list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const line of text.split('\n')) {
      let m;
      if ((m = line.match(/^#{1,3}\s+(.*)/))) { close(); html += `<h2>${inline(m[1])}</h2>`; }
      else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
      else if (line.trim()) { close(); html += `<p>${inline(line)}</p>`; }
      else close();
    }
    close();
    return html;
  }

  function renderAdviceHint() {
    const n = meals.length;
    $('#advice-btn').disabled = n < 3;
    $('#advice-hint').textContent = n < 3 ? `Log at least 3 meals to unlock advice (you have ${n}).` : `Based on your last ${Math.min(14, Object.keys(byDay()).length)} logged day(s).`;
  }

  $('#advice-btn').addEventListener('click', async () => {
    const btn = $('#advice-btn'), out = $('#advice-out');
    const map = byDay();
    const days = Object.keys(map).sort().slice(-14).map((k) => ({
      date: k,
      totals: Object.fromEntries(Object.entries(sumMeals(map[k])).map(([a, v]) => [a, r1(v)])),
      meals: map[k].sort((a, b) => a.ts - b.ts).map((m) => ({ time: fmtTime(m.ts), name: m.name, ...m.totals })),
    }));
    btn.disabled = true; btn.textContent = 'Thinking…';
    out.hidden = false; out.innerHTML = '<div class="spinner"></div>';
    try {
      const res = await fetch('/api/advice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals, days }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      out.innerHTML = md(data.advice);
    } catch (err) {
      out.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    } finally {
      btn.textContent = '✨ Get personalized advice';
      renderAdviceHint();
    }
  });

  // ---------- settings ----------
  const gf = $('#goals-form');
  function fillGoals() { for (const k of Object.keys(DEFAULT_GOALS)) gf[k].value = goals[k]; }
  gf.addEventListener('submit', (e) => {
    e.preventDefault();
    for (const k of Object.keys(DEFAULT_GOALS)) goals[k] = Math.max(0, +gf[k].value || DEFAULT_GOALS[k]);
    save('goals', goals);
    $('#goals-saved').textContent = 'Saved ✓';
    setTimeout(() => ($('#goals-saved').textContent = ''), 1800);
  });
  $('#export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ goals, meals }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `food-tracker-${dayKey(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.meals)) throw new Error();
      const ids = new Set(meals.map((m) => m.id));
      meals = meals.concat(data.meals.filter((m) => m && m.id && m.totals && !ids.has(m.id)));
      if (data.goals) { goals = { ...DEFAULT_GOALS, ...data.goals }; save('goals', goals); fillGoals(); }
      persistMeals(); render();
      alert('Import complete.');
    } catch { alert('That file is not a valid Food Tracker export.'); }
  });
  $('#clear-btn').addEventListener('click', () => {
    if (confirm('Delete ALL logged meals? This cannot be undone.')) { meals = []; persistMeals(); render(); }
  });

  // ---------- render ----------
  function render() {
    const active = $('.tab.active').id;
    if (active === 'tab-today') renderToday();
    else if (active === 'tab-history') renderHistory();
    else if (active === 'tab-advice') renderAdviceHint();
  }

  fillGoals();
  render();
})();
