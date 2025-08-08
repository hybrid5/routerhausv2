/* RouterHaus Kits — Quiz modal + mapping */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const dlg = document.getElementById('quizModal');
const openBtn = document.getElementById('openQuiz');
const closeBtns = $$('.modal-close', dlg);

openBtn?.addEventListener('click', ()=> dlg.showModal());
closeBtns.forEach(b=> b.addEventListener('click', ()=> dlg.close()));

$('#quizForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const coverage = $('#qCoverage').value;
  const deviceLoad = $('#qDevices').value;
  const primaryUse = $('#qUse').value;
  if (!coverage || !deviceLoad || !primaryUse) return;

  // Basic mapping: large homes benefit from mesh
  const meshNeed = (coverage === 'Large/Multi-floor');
  const wanPref = null; // could be inferred later
  const pricePref = null;

  const result = { coverage, deviceLoad, primaryUse, meshNeed, wanPref, pricePref };
  window.__kits?.applyQuizResult(result);
  dlg.close();
});
