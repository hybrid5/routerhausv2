/* RouterHaus Kits — Next‑Gen (static, vanilla JS)
 * - Reads kits.json
 * - Derives: brand, coverageBucket, wanTier, priceBucket
 * - Facets: Brand, Wi‑Fi Gen, Mesh, WAN Tier, Coverage, Device Load, Primary Use, Access, Price
 * - URL sync + localStorage
 * - Recommendations computed after quiz
 */

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const state = {
  data: [],
  filtered: [],
  recos: [],
  compare: new Set(),
  facets: {},
  active: {}, // facet -> Set(values)
  sort: 'relevance',
  quiz: null,
};

const elements = {
  results: $('#kitResults'),
  recoGrid: $('#recoGrid'),
  matchCount: $('#matchCount'),
  quickChips: $('#quickChips'),
  activeChips: $('#activeChips'),
  sortSelect: $('#sortSelect'),
  copyLink: $('#copyLink'),
  resetAll: $('#resetAll'),
  filtersFab: $('#filtersFab'),
  filtersAside: $('#filtersAside'),
  filtersForm: $('#filtersForm'),
  drawer: $('#filtersDrawer'),
  drawerMount: $('#drawerFormMount'),
  applyDrawer: $('#applyDrawer'),
  activeCount: $('#activeCount'),
  compareDrawer: $('#compareDrawer'),
  compareItems: $('#compareItems'),
  clearCompare: $('#clearCompare'),
  toggleRecos: $('#toggleRecos'),
};

// --- Utilities ---
const slug = s => s.toLowerCase().replace(/[^\w]+/g,'-').replace(/(^-|-$)/g,'');

function derive(item){
  const out = {...item};

  // brand from model heuristics
  const m = out.model || '';
  const BrandMap = [
    [/^(TP[\-\u2011\u2013]?Link|TP[\-\u2011\u2013]?‑?Link|TP‑Link)/i, 'TP-Link'],
    [/^(ASUS|ROG)/i, 'ASUS'],
    [/^(NETGEAR|Nighthawk|Orbi)/i, 'NETGEAR'],
    [/^(Linksys|Velop)/i, 'Linksys'],
    [/^(Amazon eero|eero)/i, 'eero'],
    [/^(Google|Nest)/i, 'Google'],
    [/^(Ubiquiti|UniFi|Dream)/i, 'Ubiquiti'],
    [/^(Arris|ARRIS)/i, 'Arris'],
    [/^(MikroTik)/i, 'MikroTik'],
    [/^(MSI)/i, 'MSI'],
    [/^(Cudy)/i, 'Cudy'],
    [/^(Synology)/i, 'Synology'],
    [/^(Tenda)/i, 'Tenda'],
    [/^(D[\-‒–]?Link)/i, 'D-Link'],
    [/^(Starlink)/i, 'Starlink'],
    [/^(Zyxel)/i, 'Zyxel'],
  ];
  let brand = 'Unknown';
  for (const [re,b] of BrandMap){ if (re.test(m)) { brand=b; break; } }
  if (brand==='Unknown') brand = (m.split(/\s+/)[0]||'Unknown').replace(/[^A-Za-z]/g,'');
  out.brand = brand;

  // coverageBucket
  const sqft = Number(out.coverageSqft||0);
  out.coverageBucket = sqft <= 1800 ? 'Apartment/Small'
                       : sqft <= 3000 ? '2–3 Bedroom'
                       : 'Large/Multi-floor';

  // wanTier from maxWanSpeedMbps
  const wan = Number(out.maxWanSpeedMbps||0);
  out.wanTier = wan <= 1000 ? '≤1G'
              : wan <= 2500 ? '2.5G'
              : wan <= 5000 ? '5G'
              : '10G';

  // priceBucket
  const price = Number(out.priceUsd||out.msrp||0);
  out.priceBucket = price < 150 ? '<$150'
                    : price < 300 ? '$150–$299'
                    : price < 600 ? '$300–$599'
                    : '$600+';

  // normalize wifi gen
  out.wifiGen = (out.wifiStandard||'').toString();

  // mesh ecosystem guess from model (very rough)
  if (out.meshReady && !out.meshEco){
    if (brand==='ASUS') out.meshEco = 'AiMesh';
    else if (brand==='NETGEAR') out.meshEco = 'Orbi';
    else if (brand==='TP-Link') out.meshEco = 'Deco';
    else if (brand==='eero') out.meshEco = 'eero';
    else if (brand==='Ubiquiti') out.meshEco = 'UniFi';
    else out.meshEco = 'EasyMesh';
  }

  // accessSupport array ensure
  if (!Array.isArray(out.accessSupport)) out.accessSupport = [];

  // device load normalize
  if (!out.deviceLoad) {
    const dl = (out.primaryUse||[]).includes('Gaming') ? '6–15' : '1–5';
    out.deviceLoad = dl;
  }

  out.slug = slug(`${out.brand}-${out.model}`);
  return out;
}

function getConfig(){
  const params = new URLSearchParams(location.search);
  const conf = {
    active: {},
    sort: params.get('sort') || localStorage.getItem('kits.sort') || 'relevance',
  };
  // facet params in form f_brand=ASUS,TP-Link
  for (const [k,v] of params.entries()){
    if (k.startsWith('f_')){
      conf.active[k.slice(2)] = new Set(decodeURIComponent(v).split(',').filter(Boolean));
    }
  }
  return conf;
}

function saveToURL(){
  const params = new URLSearchParams();
  params.set('sort', state.sort);
  for (const [facet, set] of Object.entries(state.active)){
    if (set && set.size){
      params.set('f_'+facet, encodeURIComponent([...set].join(',')));
    }
  }
  const qs = params.toString();
  history.replaceState(null,'','?'+qs);
  localStorage.setItem('kits.sort', state.sort);
}

function debounce(fn, ms=80){
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); };
}

// --- Facet building ---
const Facets = {
  brand:     { label: 'Brand',        getter: x=>x.brand },
  wifiGen:   { label: 'Wi‑Fi Gen',    getter: x=>x.wifiGen },
  meshReady: { label: 'Mesh Ready',   getter: x=>x.meshReady ? 'Yes' : 'No' },
  meshEco:   { label: 'Mesh Ecosystem', getter: x=>x.meshEco },
  wanTier:   { label: 'WAN Tier',     getter: x=>x.wanTier },
  coverageBucket: { label: 'Coverage', getter: x=>x.coverageBucket },
  deviceLoad: { label:'Device Load',  getter: x=>x.deviceLoad },
  primaryUse: { label:'Primary Use',  getter: x=>x.primaryUse, multi:true },
  access:    { label:'Access Type',   getter: x=>x.accessSupport, multi:true },
  priceBucket: { label:'Price', getter: x=>x.priceBucket },
};

const Quick = ['wifiGen','meshReady','wanTier'];

function computeFacetCounts(items){
  const counts = {};
  for (const key of Object.keys(Facets)){
    counts[key] = new Map();
  }
  for (const it of items){
    for (const [key, meta] of Object.entries(Facets)){
      const v = meta.getter(it);
      if (meta.multi){
        (Array.isArray(v)?v:[]).forEach(val=>{
          counts[key].set(val, (counts[key].get(val)||0)+1);
        });
      } else {
        if (v!=null && v!==''){
          counts[key].set(v, (counts[key].get(v)||0)+1);
        }
      }
    }
  }
  return counts;
}

function renderFacet(key, mountId){
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const counts = state.facetCounts[key] || new Map();
  const entries = [...counts.entries()].sort((a,b)=> String(a[0]).localeCompare(String(b[0]), undefined, {numeric:true}));
  if (!entries.length){ mount.closest('.facet')?.setAttribute('hidden',''); return; }
  mount.innerHTML = entries.map(([val, count])=>{
    const id = `f-${key}-${slug(String(val))}`;
    const checked = state.active[key]?.has(String(val)) ? 'checked' : '';
    return `<label for="${id}">
      <input id="${id}" type="checkbox" name="${key}" value="${String(val)}" ${checked}>
      <span>${String(val)} <small>(${count})</small></span>
    </label>`;
  }).join('');
}

function renderQuick(){
  const chips = [];
  for (const key of Quick){
    const counts = state.facetCounts[key]||new Map();
    for (const [val] of counts){
      const active = state.active[key]?.has(String(val));
      chips.push(`<button class="chip ${active?'active':''}" data-facet="${key}" data-val="${String(val)}">${Facets[key].label}: ${val}</button>`);
    }
  }
  elements.quickChips.innerHTML = chips.join('');
}

// --- Filtering & sorting ---
function applyFilters(){
  const act = state.active;
  let res = state.data;
  for (const [facet, meta] of Object.entries(Facets)){
    const selected = act[facet];
    if (selected && selected.size){
      const get = meta.getter;
      res = res.filter(item=>{
        const val = get(item);
        if (meta.multi){
          const arr = Array.isArray(val)?val:[];
          return arr.some(v => selected.has(String(v)));
        }
        return selected.has(String(val));
      });
    }
  }

  state.filtered = sortItems(res);
  render();
}

function tierRank(t){ return ['≤1G','2.5G','5G','10G','SFP+'].indexOf(t); }
function sortItems(items){
  const by = state.sort;
  const arr = [...items];
  switch(by){
    case 'wifi-desc':
      arr.sort((a,b)=> String(b.wifiGen).localeCompare(String(a.wifiGen), undefined, {numeric:true})); break;
    case 'price-asc':
      arr.sort((a,b)=> (a.priceUsd||99999) - (b.priceUsd||99999)); break;
    case 'price-desc':
      arr.sort((a,b)=> (b.priceUsd||0) - (a.priceUsd||0)); break;
    case 'coverage-desc':
      arr.sort((a,b)=> (b.coverageSqft||0) - (a.coverageSqft||0)); break;
    case 'wan-desc':
      arr.sort((a,b)=> tierRank(b.wanTier) - tierRank(a.wanTier)); break;
    case 'reviews-desc':
      arr.sort((a,b)=> (b.reviews?.score||0) - (a.reviews?.score||0)); break;
    case 'relevance':
    default:
      // quiz score first if available, else wifi desc then coverage
      arr.sort((a,b)=> (Number(b._score||0) - Number(a._score||0)) || String(b.wifiGen).localeCompare(String(a.wifiGen), undefined, {numeric:true}) || (b.coverageSqft||0) - (a.coverageSqft||0));
  }
  return arr;
}

// --- Rendering ---
function specBullets(x){
  const chips = [];
  if (x.wifiGen) chips.push(`Wi‑Fi ${x.wifiGen}`);
  if (x.meshReady) chips.push(`Mesh`);
  if (x.wanTier) chips.push(`${x.wanTier} WAN`);
  const specs = [
    x.coverageSqft ? `${x.coverageSqft.toLocaleString()} sq ft` : null,
    x.meshEco ? `${x.meshEco} mesh` : null,
    x.accessSupport?.length ? x.accessSupport.join(' / ') : null,
  ].filter(Boolean);
  return {chips, specs};
}

function renderCards(list, mount){
  if (!mount) return;
  const tpl = $('#cardTpl');
  mount.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const x of list){
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = x.slug;
    node.querySelector('.title').textContent = `${x.brand} ${x.model}`;
    const media = node.querySelector('img');
    media.alt = `${x.brand} ${x.model}`;
    if (x.media?.img) media.src = x.media.img;

    const {chips, specs} = specBullets(x);
    node.querySelector('.chips').innerHTML = chips.map(c=>`<span class="chip">${c}</span>`).join('');
    node.querySelector('.specs').innerHTML = specs.map(s=>`<li>${s}</li>`).join('');

    node.querySelector('.price').textContent = x.priceUsd ? `$${x.priceUsd.toFixed(2)}` : (x.msrp ? `MSRP $${x.msrp.toFixed(2)}` : '');
    const buy = node.querySelector('.btn.small');
    buy.textContent = (x.commerce?.retailers?.[0] || 'Buy');
    if (x.commerce?.buyLink) buy.href = x.commerce.buyLink; else buy.removeAttribute('href');

    const cmp = node.querySelector('.compare-btn');
    cmp.addEventListener('click', ()=> toggleCompare(x));

    frag.appendChild(node);
  }
  mount.appendChild(frag);
}

function renderActiveChips(){
  const chips = [];
  for (const [facet, set] of Object.entries(state.active)){
    if (!set || !set.size) continue;
    for (const val of set){
      const label = Facets[facet]?.label || facet;
      chips.push(`<button class="chip" data-remove="${facet}:{val}">${label}: ${val} ×</button>`);
    }
  }
  elements.activeChips.innerHTML = chips.join('');
  elements.activeCount.textContent = chips.length.toString();
}

function render(){
  // facet counts use current filters removed (for counts of remaining items)
  state.facetCounts = computeFacetCounts(state.data);
  renderQuick();
  renderFacet('brand','facet-brand');
  renderFacet('wifiGen','facet-wifiGen');
  renderFacet('meshReady','facet-meshReady');
  renderFacet('meshEco','facet-meshEco');
  renderFacet('wanTier','facet-wanTier');
  renderFacet('coverageBucket','facet-coverageBucket');
  renderFacet('deviceLoad','facet-deviceLoad');
  renderFacet('primaryUse','facet-primaryUse');
  renderFacet('access','facet-access');
  renderFacet('priceBucket','facet-priceBucket');

  elements.matchCount.textContent = `${state.filtered.length} matches`;
  renderActiveChips();
  renderCards(state.filtered, elements.results);
  renderRecs();
  saveToURL();
}

function renderRecs(){
  const mount = elements.recoGrid;
  if (!state.quiz || !elements.toggleRecos.checked){
    mount.innerHTML = '';
    $('#recommendations').style.display = 'none';
    return;
  }
  const top = [...state.data].sort((a,b)=> (b._score||0)-(a._score||0)).slice(0,6);
  renderCards(top, mount);
  $('#recommendations').style.display = top.length ? '' : 'none';
}

function toggleCompare(x){
  if (state.compare.has(x.slug)) state.compare.delete(x.slug); else {
    if (state.compare.size >= 4){ alert('You can compare up to 4 items.'); return; }
    state.compare.add(x.slug);
  }
  renderCompare();
}

function renderCompare(){
  const arr = [...state.compare];
  if (!arr.length){ elements.compareDrawer.hidden = true; return; }
  const items = arr.map(slug => state.data.find(d=>d.slug===slug)).filter(Boolean);
  elements.compareItems.innerHTML = items.map(x=>`<div class="item">${x.brand} ${x.model} · Wi‑Fi ${x.wifiGen} · ${x.wanTier} · ${x.coverageSqft?.toLocaleString()} sq ft</div>`).join('');
  elements.compareDrawer.hidden = false;
}

// --- Event wiring ---
function handleFacetChange(e){
  const t = e.target;
  if (t.matches('input[type="checkbox"][name]')){
    const facet = t.name;
    const val = String(t.value);
    state.active[facet] ??= new Set();
    if (t.checked) state.active[facet].add(val); else state.active[facet].delete(val);
    applyFilters();
  }
}

function handleQuickClick(e){
  const btn = e.target.closest('.chip[data-facet]');
  if (!btn) return;
  const facet = btn.dataset.facet;
  const val = btn.dataset.val;
  state.active[facet] ??= new Set();
  if (state.active[facet].has(val)) state.active[facet].delete(val); else state.active[facet].add(val);
  applyFilters();
}

function handleActiveChip(e){
  const chip = e.target.closest('.chip[data-remove]');
  if (!chip) return;
  const [facet, val] = chip.dataset.remove.split(':');
  state.active[facet]?.delete(val);
  applyFilters();
}

function handleSort(){
  state.sort = elements.sortSelect.value;
  state.filtered = sortItems(state.filtered);
  render();
}

function openDrawer(open){
  elements.drawer.setAttribute('aria-hidden', String(!open));
  if (open){
    // clone form into drawer
    elements.drawerMount.innerHTML = '';
    const clone = elements.filtersForm.cloneNode(true);
    clone.addEventListener('change', handleFacetChange);
    elements.drawerMount.appendChild(clone);
  } else {
    // no-op
  }
}

function copyLink(){
  saveToURL();
  navigator.clipboard.writeText(location.href).then(()=>{
    elements.copyLink.textContent = 'Link copied';
    setTimeout(()=> elements.copyLink.textContent = 'Copy link', 1200);
  });
}

function resetAll(){
  state.active = {};
  state.sort = 'relevance';
  state.compare.clear();
  state.quiz = null;
  applyFilters();
}

// --- Quiz integration ---
function applyQuizResult(q){
  state.quiz = q;
  // compute score
  const w = {cov:0.30, dev:0.25, use:0.25, mesh:0.10, wan:0.05, price:0.05};
  for (const it of state.data){
    let s = 0;
    s += (it.coverageBucket===q.coverage ? 1 : 0) * w.cov;
    s += (String(it.deviceLoad)===String(q.deviceLoad) ? 1 : 0) * w.dev;
    s += (it.primaryUse?.includes(q.primaryUse) ? 1 : 0) * w.use;
    s += (q.meshNeed ? (it.meshReady?1:0): 0) * w.mesh;
    s += (q.wanPref ? (it.wanTier===q.wanPref?1:0) : 0) * w.wan;
    // price fit is soft: prefer within 1 bucket if provided
    s += (q.pricePref && it.priceBucket===q.pricePref ? 1 : 0) * w.price;
    it._score = Math.round(s*100);
  }
  state.sort = 'relevance';
  elements.sortSelect.value = 'relevance';
  state.filtered = sortItems(state.data);
  render();
}

// Expose for quiz-modal.js
window.__kits = { applyQuizResult, state };

// --- Init ---
async function init(){
  const res = await fetch('kits.json', {cache:'no-store'});
  const raw = await res.json();
  state.data = raw.map(derive);

  // init state from URL
  const conf = (function(){ try{ return JSON.parse(localStorage.getItem('kits.conf')||'null') } catch{ return null } })() || null;
  const urlConf = getConfig();
  state.sort = urlConf.sort;
  state.active = urlConf.active;

  // compute initial filtered
  state.facetCounts = computeFacetCounts(state.data);

  elements.filtersForm.addEventListener('change', handleFacetChange);
  elements.quickChips.addEventListener('click', handleQuickClick);
  elements.activeChips.addEventListener('click', handleActiveChip);
  elements.sortSelect.addEventListener('change', handleSort);
  elements.copyLink.addEventListener('click', copyLink);
  elements.resetAll.addEventListener('click', resetAll);
  elements.filtersFab.addEventListener('click', ()=> openDrawer(true));
  elements.drawer.addEventListener('click', (e)=>{
    if (e.target.closest('[data-close-drawer]')) openDrawer(false);
  });
  elements.applyDrawer.addEventListener('click', ()=>{ openDrawer(false); applyFilters(); });

  elements.clearCompare.addEventListener('click', ()=>{ state.compare.clear(); renderCompare(); });
  elements.toggleRecos.addEventListener('change', renderRecs);

  // initial render
  state.filtered = sortItems(state.data);
  applyFilters();
}

init();
