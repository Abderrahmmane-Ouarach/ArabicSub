const API = '';
let jid = null, vfn = null, col = '&H00FFFFFF';
let dirty = false, pollTimer = null;

const PHASE_LABELS = {
  queued:           'في الطابور — ينتظر دوره...',
  transcribing:     'جاري تفريغ الكلام بالذكاء الاصطناعي...',
  queued_burn:      'في الطابور — ينتظر الدمج...',
  burning:          'جاري دمج الترجمة في الفيديو...',
  done_transcribe:  'اكتمل التفريغ ✓',
  done_burn:        'اكتمل الدمج ✓',
  failed:           'حدث خطأ',
};

// ── Unload guard ──────────────────────────────────────────────────────────────
window.addEventListener('beforeunload', e => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

// ── Drop zone ─────────────────────────────────────────────────────────────────
const drop = document.getElementById('drop');
const fi   = document.getElementById('vfile');

drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', ()  => drop.classList.remove('drag'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('drag');
  if (e.dataTransfer.files[0]) { fi.files = e.dataTransfer.files; updateFilename(); }
});
fi.addEventListener('change', updateFilename);

function updateFilename() {
  const f = fi.files[0];
  document.getElementById('fname').textContent = f ? '✓ ' + f.name : '';
}

// ── Color swatches ────────────────────────────────────────────────────────────
document.getElementById('sws').addEventListener('click', e => {
  const sw = e.target.closest('.sw');
  if (!sw) return;
  document.querySelectorAll('.sw').forEach(s => s.classList.remove('on'));
  sw.classList.add('on');
  col = sw.dataset.c;
  updatePreview();
});

// ── Style preview ─────────────────────────────────────────────────────────────
function updatePreview() {
  const el = document.getElementById('prev');

  const colorMap = {
    '&H00FFFFFF': '#fff',
    '&H0000FFFF': '#ff0',
    '&H0040FFFF': '#fc0',
    '&H000040FF': '#f50',
    '&H00FF8000': '#09f',
    '&H0000FF00': '#3c3',
    '&H00000000': '#000',
  };
  const bgMap = {
    '&H00000000': 'transparent',
    '&H90000000': 'rgba(0,0,0,.55)',
    '&HFF000000': '#000',
  };

  const fs = Math.min(parseInt(document.getElementById('fs').value), 28);
  const ol = parseFloat(document.getElementById('ol').value);
  const sh = parseFloat(document.getElementById('sh').value);
  const bg = document.getElementById('bg').value;

  el.style.fontFamily  = document.getElementById('fn').value + ',sans-serif';
  el.style.fontSize    = fs + 'px';
  el.style.fontWeight  = document.getElementById('bold').value === '-1' ? '700' : '400';
  el.style.color       = colorMap[col] || '#fff';
  el.style.background  = bgMap[bg] || 'transparent';
  el.style.padding     = bg !== '&H00000000' ? '3px 10px' : '0';
  el.style.textShadow  = ol > 0
    ? `0 0 ${ol}px #000, 0 0 ${ol * 1.8}px #000${sh > 0 ? `, ${sh}px ${sh}px ${sh}px #000` : ''}`
    : 'none';

  document.querySelector('.screen').style.paddingBottom = document.getElementById('mg').value + 'px';
}

// alias used by inline oninput handlers
const upd = updatePreview;

// ── Style presets ─────────────────────────────────────────────────────────────
function preset(name) {
  const presets = {
    netflix: { fs: 32, ol: 2.5, sh: 1, bold: '-1', bg: '&H00000000', mg: 25 },
    reels:   { fs: 38, ol: 3.5, sh: 0, bold: '-1', bg: '&H00000000', mg: 32 },
    classic: { fs: 28, ol: 1,   sh: 1, bold: '0',  bg: '&H90000000', mg: 20 },
  };
  const p = presets[name];

  document.getElementById('fs').value  = p.fs;   document.getElementById('fsv').textContent = p.fs;
  document.getElementById('ol').value  = p.ol;   document.getElementById('ov').textContent  = p.ol;
  document.getElementById('sh').value  = p.sh;   document.getElementById('sv').textContent  = p.sh;
  document.getElementById('bold').value = p.bold;
  document.getElementById('bg').value  = p.bg;
  document.getElementById('mg').value  = p.mg;   document.getElementById('mv').textContent  = p.mg;

  col = '&H00FFFFFF';
  document.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s.dataset.c === col));
  updatePreview();
}

// ── Nav helpers ───────────────────────────────────────────────────────────────
function step(n) {
  ['s1', 's2', 's3'].forEach((id, i) => {
    document.getElementById(id).className = 'ns' + (i + 1 < n ? ' done' : i + 1 === n ? ' active' : '');
  });
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  if (id === 'p2' && window.innerWidth <= 700) switchTab('editor');
}

function showErr(id, msg) {
  const e = document.getElementById(id);
  e.textContent = '⚠ ' + msg;
  e.classList.add('on');
}

// ── Mobile tabs ───────────────────────────────────────────────────────────────
function switchTab(tab) {
  const isEditor = tab === 'editor';
  document.getElementById('tab-editor').classList.toggle('show', isEditor);
  document.getElementById('tab-style').classList.toggle('show', !isEditor);
  document.querySelectorAll('.p2-tab').forEach((t, i) => t.classList.toggle('on', isEditor ? i === 0 : i === 1));
  document.getElementById('mobile-export').style.display =
    (!isEditor && window.innerWidth <= 700) ? 'block' : 'none';
}

// ── Waiting info panel ────────────────────────────────────────────────────────
function showWaitingInfo(visible) {
  document.getElementById('winfo').classList.toggle('on', visible);
}

// ── Upload & transcribe ───────────────────────────────────────────────────────
async function go() {
  const f = fi.files[0];
  if (!f) { showErr('e1', 'اختر فيديو أولاً'); return; }

  const btn = document.getElementById('tbtn');
  btn.disabled = true;
  btn.textContent = 'جاري الرفع...';
  document.getElementById('e1').classList.remove('on');
  dirty = true;

  const fd = new FormData();
  fd.append('video', f);
  fd.append('max_chars', document.getElementById('mc').value);
  fd.append('model', document.getElementById('model').value);

  try {
    const r = await fetch(`${API}/transcribe`, { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'فشل الرفع');

    jid = d.job_id;
    vfn = d.video_filename;

    document.getElementById('sbox').classList.add('on');
    btn.textContent = 'تم الرفع — في الطابور';
    showWaitingInfo(true);
    pollTranscribe();
  } catch (e) {
    showErr('e1', e.message);
    btn.disabled = false;
    btn.textContent = '▶  ابدأ التفريغ';
    dirty = false;
  }
}

function pollTranscribe() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const [jobRes, qRes] = await Promise.all([
        fetch(`${API}/job/${jid}`).then(r => r.json()),
        fetch(`${API}/queue-status`).then(r => r.json()),
      ]);

      document.getElementById('sphase').textContent = PHASE_LABELS[jobRes.status] || jobRes.status;

      const banner   = document.getElementById('qbanner');
      const isQueued = jobRes.status === 'queued';
      banner.classList.toggle('on', isQueued && qRes.waiting > 0);
      if (isQueued && qRes.waiting > 0) {
        document.getElementById('qtext').textContent =
          `يوجد ${qRes.waiting} ${qRes.waiting === 1 ? 'فيديو' : 'فيديوهات'} قبلك في الطابور`;
      }

      if (jobRes.status === 'done_transcribe') {
        clearInterval(pollTimer);
        document.getElementById('sbox').classList.remove('on');
        document.getElementById('qbanner').classList.remove('on');
        showWaitingInfo(false);

        document.getElementById('vid').src   = `/video/${jid}`;
        document.getElementById('srt').value = jobRes.srt_content;
        showPage('p2');
        step(2);
        updatePreview();
      }

      if (jobRes.status === 'failed') {
        clearInterval(pollTimer);
        document.getElementById('sbox').classList.remove('on');
        showWaitingInfo(false);
        showErr('e1', jobRes.error || 'فشل التفريغ');
        const btn = document.getElementById('tbtn');
        btn.disabled = false;
        btn.textContent = '▶  ابدأ التفريغ';
        dirty = false;
      }
    } catch (e) { /* silent — will retry on next tick */ }
  }, 3000);
}

// ── Burn subtitles ────────────────────────────────────────────────────────────
async function burn() {
  const btn = document.getElementById('bbtn');
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  document.getElementById('bstatus').classList.add('on');
  document.getElementById('e2').classList.remove('on');

  const fd = new FormData();
  fd.append('job_id',        jid);
  fd.append('video_filename', vfn);
  fd.append('srt_content',   document.getElementById('srt').value);
  fd.append('font_name',     document.getElementById('fn').value);
  fd.append('font_size',     document.getElementById('fs').value);
  fd.append('primary_color', col);
  fd.append('outline_color', '&H00000000');
  fd.append('back_color',    document.getElementById('bg').value);
  fd.append('bold',          document.getElementById('bold').value);
  fd.append('outline',       document.getElementById('ol').value);
  fd.append('shadow',        document.getElementById('sh').value);
  fd.append('margin_v',      document.getElementById('mg').value);

  try {
    const r = await fetch(`${API}/burn`, { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'فشل الإرسال');
    pollBurn();
  } catch (e) {
    showErr('e2', e.message);
    btn.disabled = false;
    btn.textContent = 'دمج وتصدير ←';
    document.getElementById('bstatus').classList.remove('on');
  }
}

function pollBurn() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const jobRes = await fetch(`${API}/job/${jid}`).then(r => r.json());
      document.getElementById('bphase').textContent = PHASE_LABELS[jobRes.status] || jobRes.status;

      if (jobRes.status === 'done_burn') {
        clearInterval(pollTimer);
        document.getElementById('bstatus').classList.remove('on');
        document.getElementById('dl').href = `/download/${jid}`;
        showPage('p3');
        step(3);
        const btn = document.getElementById('bbtn');
        btn.disabled = false;
        btn.textContent = 'دمج وتصدير ←';
      }

      if (jobRes.status === 'failed') {
        clearInterval(pollTimer);
        document.getElementById('bstatus').classList.remove('on');
        showErr('e2', jobRes.error || 'فشل الدمج');
        const btn = document.getElementById('bbtn');
        btn.disabled = false;
        btn.textContent = 'دمج وتصدير ←';
      }
    } catch (e) { /* silent */ }
  }, 3000);
}

// ── Navigation actions ────────────────────────────────────────────────────────
function backToEdit() {
  showPage('p2');
  step(2);
  document.getElementById('srt').scrollTop = 0;
}

async function hardReset() {
  if (!window.confirm('ستفقد جميع بيانات المشروع الحالي. هل أنت متأكد؟')) return;
  if (jid) await fetch(`${API}/cleanup/${jid}`, { method: 'DELETE' }).catch(() => {});

  clearInterval(pollTimer);
  dirty = false;
  jid = null;
  vfn = null;
  col = '&H00FFFFFF';

  fi.value = '';
  document.getElementById('fname').textContent  = '';
  document.getElementById('srt').value          = '';
  document.getElementById('vid').src            = '';
  document.getElementById('e1').classList.remove('on');
  document.getElementById('e2').classList.remove('on');
  document.getElementById('sbox').classList.remove('on');
  document.getElementById('qbanner').classList.remove('on');
  showWaitingInfo(false);

  const btn = document.getElementById('tbtn');
  btn.disabled = false;
  btn.textContent = '▶  ابدأ التفريغ';

  showPage('p1');
  step(1);
}

function dlSRT() {
  if (jid) window.open(`${API}/download-srt/${jid}`);
}

// ── Init ──────────────────────────────────────────────────────────────────────
updatePreview();