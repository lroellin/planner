import { chromium } from 'playwright';

const URL = 'http://localhost:5179/';
const browser = await chromium.launch();
const results = [];

async function fresh(seed) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(URL);
  await page.waitForSelector('.fc-timegrid-slot');
  if (seed) { await page.evaluate(seed); await page.reload(); await page.waitForTimeout(900); }
  return { page, errs };
}
const read = page => page.evaluate(() => JSON.parse(localStorage.getItem('wk-planner-state')));

// ── 1. Clearing the week date must not corrupt state ─────────────────────────
{
  const { page, errs } = await fresh();
  const before = (await read(page)).wkStartDate;
  const input = page.locator('input[type=date]');
  await input.fill('');
  await input.blur();
  await page.waitForTimeout(300);
  const after = (await read(page)).wkStartDate;
  await input.fill('2026-09-16');       // a Wednesday -> must snap back to Monday
  await input.blur();
  await page.waitForTimeout(300);
  const snapped = (await read(page)).wkStartDate;
  results.push(['1 date input', `cleared: ${before} -> ${after}`, `Wed 16.9 -> ${snapped}`,
    after === before && snapped === '2026-09-14' && errs.length === 0]);
  await page.close();
}

// ── 2. Inverted phase range cannot be produced, and is survivable if stored ──
{
  const { page, errs } = await fresh(() => {
    const s = JSON.parse(localStorage.getItem('wk-planner-state'));
    s.phases[0].startDay = 3; s.phases[0].endDay = 1;   // inverted, as if hand-edited
    localStorage.setItem('wk-planner-state', JSON.stringify(s));
  });
  const headers = await page.evaluate(() =>
    [...document.querySelectorAll('.phase-seg')].map(s => s.querySelectorAll('.fc-col-header-cell.fc-day').length));
  results.push(['2a stored inverted range', `day headers per phase: ${JSON.stringify(headers)}`,
    `errors: ${errs.length}`, headers.every(n => n > 0) && errs.length === 0]);
  await page.close();
}
{
  const { page } = await fresh();
  await page.getByRole('button', { name: /Config/ }).click();
  await page.getByRole('tab', { name: 'phases' }).click();
  await page.waitForTimeout(200);
  // Phase 1 is Mon-Tue; set its "From" to Fri -> "To" must follow
  const row = page.locator('.grid.grid-cols-\\[1fr_auto_auto_1fr\\]').nth(1);
  await row.locator('select').first().selectOption({ label: 'Fri' });
  await page.waitForTimeout(300);
  const p = (await read(page)).phases[0];
  results.push(['2b config cannot invert', `start=${p.startDay} end=${p.endDay}`, '', p.endDay >= p.startDay]);
  await page.close();
}

// ── 3. Modal move across phases keeps the event on a real lane ───────────────
{
  const { page, errs } = await fresh(() => {
    const s = JSON.parse(localStorage.getItem('wk-planner-state'));
    const kader = s.groups.find(g => g.label === 'K');
    const lesson = s.subjects.find(x => !x.isBreak);
    const lunch = s.subjects.find(x => x.isMultiGroup);
    s.events = [
      { id: 'single', subjectId: lesson.id, groupId: kader.id, dayIndex: 0,
        startTime: '09:00', endTime: '10:30', teacherIds: 'inherit', roomId: 'inherit' },
      { id: 'multi', subjectId: lunch.id, groupId: [kader.id], dayIndex: 0,
        startTime: '12:00', endTime: '13:00', teacherIds: 'inherit', roomId: 'inherit' },
    ];
    localStorage.setItem('wk-planner-state', JSON.stringify(s));
  });

  async function moveToThu(eventTitleIdx) {
    await page.locator('.fc-timegrid-event').nth(eventTitleIdx).click();
    await page.waitForTimeout(300);
    const lanes = await page.locator('dialog .select').first().locator('..').locator('select').nth(1)
      .locator('option').allTextContents().catch(() => []);
    await page.locator('dialog select').first().selectOption({ label: 'Thu' });
    await page.waitForTimeout(200);
    const lanesAfter = await page.locator('dialog select').nth(1).locator('option').allTextContents().catch(() => []);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(400);
    return { lanes, lanesAfter };
  }

  const single = await moveToThu(0);
  const st1 = await read(page);
  const e1 = st1.events.find(e => e.id === 'single');
  const gmap = Object.fromEntries(st1.groups.map(g => [g.id, g.label]));

  const multi = await moveToThu(0); // the Kader lunch is now the only phase-1 event
  const st2 = await read(page);
  const e2 = st2.events.find(e => e.id === 'multi');

  const orphanCount = await page.locator('.conflict-card', { hasText: 'Not on any calendar' }).count();

  results.push(['3a single-group move', `lanes offered for Thu: ${JSON.stringify(single.lanesAfter)}`,
    `-> day ${e1.dayIndex} lane ${gmap[e1.groupId]}`,
    e1.dayIndex === 3 && gmap[e1.groupId] !== 'K']);
  results.push(['3b multi-group move', `-> day ${e2.dayIndex} lanes ${JSON.stringify(e2.groupId.map(g => gmap[g]))}`,
    `orphan cards: ${orphanCount}`,
    e2.dayIndex === 3 && Array.isArray(e2.groupId) && !e2.groupId.map(g => gmap[g]).includes('K') && orphanCount === 0]);
  results.push(['3c no console errors', `errors: ${errs.length}`, JSON.stringify(errs), errs.length === 0]);
  await page.close();
}

// ── 4. Phases render chronologically regardless of stored order ──────────────
{
  const { page } = await fresh(() => {
    const s = JSON.parse(localStorage.getItem('wk-planner-state'));
    s.phases[0].startDay = 3; s.phases[0].endDay = 4;
    s.phases[1].startDay = 0; s.phases[1].endDay = 2;
    localStorage.setItem('wk-planner-state', JSON.stringify(s));
  });
  const headers = await page.evaluate(() =>
    [...document.querySelectorAll('.phase-seg')].map(s =>
      [...s.querySelectorAll('.fc-col-header-cell.fc-day')].map(c => c.textContent.trim())));
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.phase-label')].map(e => e.textContent.trim()));
  results.push(['4 chronological order', JSON.stringify(headers), JSON.stringify(labels),
    headers[0][0].startsWith('Mo') && headers[1][0].startsWith('Do')]);
  await page.close();
}

// ── 5. Ctrl+Z in a text field must not undo app state ────────────────────────
{
  const { page } = await fresh();
  await page.getByRole('button', { name: /Config/ }).click();
  await page.waitForTimeout(300);
  const labelInput = page.locator('dialog input[type=text]').first();
  await labelInput.fill('KADER-EDIT');
  await labelInput.press('Control+z');
  await page.waitForTimeout(300);
  const groupsIntact = (await read(page)).groups.length;
  results.push(['5 ctrl+z in field', `groups still: ${groupsIntact}`,
    'no app-level undo fired', groupsIntact === 4]);
  await page.close();
}

// ── 6. Event hidden by a disabled in-phase lane is reported as an orphan ─────
{
  const { page } = await fresh(() => {
    const s = JSON.parse(localStorage.getItem('wk-planner-state'));
    const kader = s.groups.find(g => g.label === 'K');
    const g1 = s.groups.find(g => g.label === 'G1');
    const lunch = s.subjects.find(x => x.isMultiGroup);
    // Spans both phases' lanes; the lane the Gruppen phase would draw is off.
    s.events = [{ id: 'x', subjectId: lunch.id, groupId: [kader.id, g1.id], dayIndex: 2,
      startTime: '12:00', endTime: '13:00', teacherIds: 'inherit', roomId: 'inherit' }];
    g1.enabled = false;
    localStorage.setItem('wk-planner-state', JSON.stringify(s));
  });
  const orphanCard = await page.locator('.conflict-card', { hasText: 'Not on any calendar' }).count();
  const drawn = await page.locator('.fc-timegrid-event').count();
  const okCard = await page.locator('text=No conflicts').count();
  results.push(['6 hidden event flagged', `orphan card: ${orphanCard}, drawn: ${drawn}`,
    `"No conflicts" shown: ${okCard}`, orphanCard === 1 && drawn === 0 && okCard === 0]);
  await page.close();
}

console.log();
for (const [name, a, b, pass] of results) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${a}${b ? `\n        ${b}` : ''}`);
}
console.log(`\n${results.filter(r => r[3]).length}/${results.length} passed`);
await browser.close();
