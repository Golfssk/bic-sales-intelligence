import Chart from 'chart.js/auto';
import './mobile.css';

const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

// Progressive enhancement: desktop keeps its layout, IDs and calculation engine.
export function initMobile() {
  const mobile = matchMedia('(max-width: 760px)');
  const $ = (id) => document.getElementById(id);
  const resizeCharts = () => requestAnimationFrame(() => {
    document.querySelectorAll('canvas').forEach((canvas) => Chart.getChart(canvas)?.resize());
  });
  const folds = new Map();
  function fold(root, id, title, hint) {
    root.id ||= id;
    root.classList.add('mobile-fold');
    root.dataset.mobileOpen = 'false';
    const content = make('div', undefined, 'mobile-fold-content');
    content.id = `${id}Content`;
    content.append(...root.childNodes);
    const button = make('button', undefined, 'mobile-fold-toggle');
    button.type = 'button';
    button.setAttribute('aria-controls', content.id);
    const text = make('span');
    text.append(make('strong', title), make('small', hint));
    button.append(text, make('span', '', 'fold-chevron'));
    root.append(button, content);
    const setOpen = (open) => {
      root.dataset.mobileOpen = String(open);
      button.setAttribute('aria-expanded', String(!mobile.matches || open));
      content.inert = mobile.matches && !open;
      resizeCharts();
    };
    button.onclick = () => setOpen(root.dataset.mobileOpen !== 'true');
    folds.set(id, {root, button, content, setOpen, hint: text.querySelector('small')});
    return folds.get(id);
  }
  const filters = fold(document.querySelector('.global-filters'), 'mobileFilters', 'ตัวกรองข้อมูล', 'ทุกวัน · ทุกสาขา · ทุก Group');
  fold(document.querySelector('.chartarea'), 'mobileTrends', 'แนวโน้มยอดขาย', 'รายชั่วโมง / รายวัน · แตะเพื่อดูกราฟ');
  fold($('groupChartPanel'), 'mobileGroups', 'สัดส่วนยอดขาย', 'ดูยอดขายแยกตาม Group');
  fold(document.querySelector('.tablepanel'), 'mobilePerformance', 'รายละเอียดการขาย', 'แยกสินค้า สาขา และช่วงเวลา');

  // All original tabs remain functional, but live in a collapsible picker on phones.
  const tabs = document.querySelector('.tabs');
  const picker = make('details', undefined, 'mobile-tab-picker');
  const pickerSummary = make('summary');
  pickerSummary.append(make('span', 'ดูตาม'), make('strong', 'Group'), make('span', '', 'picker-chevron'));
  tabs.before(picker); picker.append(pickerSummary, tabs);
  const tabLabels = {group:'Group สินค้า',store:'สาขา',unit:'หน่วยสินค้า',item:'รายการสินค้า',reason:'เหตุผลการคืน',matrix:'ตารางรายชั่วโมง'};
  function syncTab() {
    const active = tabs.querySelector('[aria-pressed="true"]');
    pickerSummary.querySelector('strong').textContent = tabLabels[active?.dataset.tab] || 'Group สินค้า';
    if (mobile.matches) picker.open = false;
  }
  tabs.addEventListener('click', (event) => { if (event.target.closest('[data-tab]')) { syncTab(); if(mobile.matches) pickerSummary.focus(); } });
  new MutationObserver(syncTab).observe(tabs, {subtree:true, attributes:true, attributeFilter:['aria-pressed']});

  const table = $('performance');
  const tableScroll = table.closest('.tablescroll');
  const cards = make('div', undefined, 'mobile-sale-cards');
  cards.setAttribute('aria-label', 'รายละเอียดการขายแบบการ์ด');
  const sortTools = make('div', undefined, 'mobile-sort-tools');
  const sortLabel = make('label', 'เรียงตาม');
  const sortSelect = make('select'); sortSelect.id = 'mobileSort'; sortLabel.htmlFor = sortSelect.id;
  const sortDirection = make('button', '↓'); sortDirection.type = 'button';
  sortDirection.setAttribute('aria-label','สลับเรียงจากน้อยไปมากหรือมากไปน้อย');
  sortTools.append(sortLabel, sortSelect, sortDirection);
  tableScroll.before(sortTools, cards);
  const matrixHint = make('p', 'เลื่อนตารางซ้าย–ขวาเพื่อดูทุกชั่วโมง ↔', 'mobile-matrix-hint');
  tableScroll.before(matrixHint);
  function renderCards() {
    const heads = [...table.querySelectorAll('thead th')];
    const keys = heads.map(th => th.querySelector('[data-sort]')?.dataset.sort);
    const activeTab = tabs.querySelector('[aria-pressed="true"]')?.dataset.tab;
    const matrix = activeTab === 'matrix';
    tableScroll.classList.toggle('mobile-matrix', matrix);
    cards.hidden = matrix; sortTools.hidden = matrix; matrixHint.hidden = !matrix;
    const selected = heads.find(th => th.getAttribute('aria-sort') !== 'none');
    const options = keys.map((key, i) => {
      const opt = make('option', heads[i].textContent.replace(/[↑↓]/g,'').trim()); opt.value = key; return opt;
    });
    sortSelect.replaceChildren(...options);
    sortSelect.value = selected?.querySelector('[data-sort]')?.dataset.sort || 'sales';
    const ascending = selected?.getAttribute('aria-sort') === 'ascending';
    sortDirection.textContent = ascending ? '↑ น้อย → มาก' : '↓ มาก → น้อย';
    const result = [];
    for (const tr of table.querySelectorAll('tbody tr')) {
      if (tr.querySelector('.empty')) { result.push(make('p', tr.textContent.trim(), 'mobile-card-empty')); continue; }
      const values = Object.fromEntries([...tr.cells].map((td,i)=>[keys[i], {text:td.textContent.trim(), cls:td.className}]));
      const value = key => values[key]?.text || '—';
      const card = make('article', undefined, 'mobile-sale-card');
      const top = make('div', undefined, 'sale-card-top');
      const identity = make('div');
      identity.append(make('h3', activeTab === 'item' ? value('name') : value('label')));
      if (activeTab === 'item') identity.append(make('p', `${value('sku')} · ${value('unit')}`));
      else identity.append(make('p', tabLabels[activeTab] || 'ยอดขาย'));
      const sales = make('div', undefined, 'sale-card-sales');
      sales.append(make('small', 'ยอดขาย · THB'), make('strong', value('sales'), values.sales?.cls));
      top.append(identity, sales); card.append(top);
      const metrics = make('dl', undefined, 'sale-card-metrics');
      for (const [key,label] of [['qty','จำนวนสุทธิ'],['share','สัดส่วน %'],['found','บิลที่พบ']]) {
        const cell = make('div'); cell.append(make('dt', label), make('dd', value(key))); metrics.append(cell);
      }
      card.append(metrics);
      const more = make('details', undefined, 'sale-card-more'); more.append(make('summary','รายละเอียดเพิ่มเติม'));
      const list = make('dl');
      for (const [key,label] of [['group','Group'],['mapping','การจัดกลุ่ม'],['ret','ยอดคืน · THB']]) {
        if (!values[key]) continue;
        const entry = make('div'); entry.append(make('dt',label),make('dd',value(key),values[key].cls)); list.append(entry);
      }
      more.append(list); card.append(more); result.push(card);
    }
    cards.replaceChildren(...result);
  }
  sortSelect.onchange = () => table.querySelector(`[data-sort="${sortSelect.value}"]`)?.click();
  sortDirection.onclick = () => table.querySelector(`[data-sort="${sortSelect.value}"]`)?.click();
  new MutationObserver(renderCards).observe(table, {childList:true,subtree:true});
  renderCards(); syncTab();

  // Keep product counts visible on mobile without a fourth narrow table column.
  const syncGroupCounts = () => {
    for(const row of $('groupShareBody').rows) {
      if(row.cells.length < 4) continue;
      row.cells[0].querySelector('.mobile-group-count')?.remove();
      row.cells[0].append(make('small',`${row.cells[3].textContent.trim()} สินค้า`,'mobile-group-count'));
    }
  };
  new MutationObserver(syncGroupCounts).observe($('groupShareBody'),{childList:true});
  syncGroupCounts();

  const nav = make('nav', undefined, 'mobile-bottom-nav'); nav.setAttribute('aria-label','ส่วนต่าง ๆ ของ Dashboard');
  const navItems = [['overview','M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z','ภาพรวม'],['mobileTrends','M4 19V5 M4 19h16 M7 14l4-5 4 3 5-7','กราฟ'],['mobilePerformance','M9 6h11 M9 12h11 M9 18h11 M4 6h1 M4 12h1 M4 18h1','รายละเอียด']];
  for (const [id,icon,label] of navItems) {
    const button = make('button'); button.type='button'; button.dataset.destination=id;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','22');svg.setAttribute('height','22');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',icon);svg.append(path);
    button.append(svg,make('strong',label));
    if (id==='overview') button.setAttribute('aria-current','location');
    button.onclick = () => {
      nav.querySelectorAll('button').forEach(b=>b.removeAttribute('aria-current'));
      button.setAttribute('aria-current','location');
      const destination = id === 'overview' ? $('kpis') : folds.get(id)?.root;
      if (id !== 'overview') folds.get(id)?.setOpen(true);
      destination?.scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    };
    nav.append(button);
  }
  document.body.append(nav);
  // Keep the existing upload toggle and account buttons; no second source of state.
  $('toggleFilters').textContent = 'นำเข้า / บัญชี';
  $('toggleFilters').setAttribute('aria-controls','mobileImportPanel');
  document.querySelector('.filterbody').id='mobileImportPanel';
  const importClose = make('button','ปิดเมนู ↑','btn mobile-import-close'); importClose.type='button';
  importClose.onclick = () => { $('sidebar').classList.remove('open'); $('toggleFilters').setAttribute('aria-expanded','false'); $('toggleFilters').focus(); };
  document.querySelector('.filterbody').append(importClose);
  const compactLabels = () => {
    const labels = {weekday:{all:'ทุกวัน'},store:{all:'ทุกสาขา'},unit:{all:'ทุกหน่วย'},return:{all:'ขายสุทธิ (N+Y)',N:'ขายปกติ (N)',Y:'คืนสินค้า (Y)'},period:{hourly:'รายชั่วโมง',daily:'รายวัน',weekday:'วันในสัปดาห์'},metric:{sales:'ยอดขาย',tc:'จำนวนบิล',ta:'ยอดต่อบิล',qty:'จำนวน'}};
    for (const [id, options] of Object.entries(labels)) for (const option of $(id).options) {
      if (!(option.value in options)) continue;
      option.dataset.fullLabel ||= option.textContent;
      const label = mobile.matches ? options[option.value] : option.dataset.fullLabel;
      if (option.textContent !== label) option.textContent = label;
    }
  };
  const syncHints = () => {
    compactLabels();
    const date = $('from').value ? `${$('from').value.slice(8)}/${$('from').value.slice(5,7)} – ${$('to').value.slice(8)}/${$('to').value.slice(5,7)}` : 'เลือกช่วงวันที่';
    const label = (id) => $(id).selectedOptions[0]?.textContent.split(' / ')[0] || '';
    filters.hint.textContent = [date, label('weekday'), label('store'), $('groupFilterText').textContent, $('return').value==='all'?'':label('return')].filter(Boolean).join(' · ');
  };
  new MutationObserver(syncHints).observe($('globalFilterSummary'),{childList:true,subtree:true,characterData:true});
  syncHints();
  new MutationObserver(() => {
    if (mobile.matches && !$('hourDrillNotice').hidden) {
      const detail = folds.get('mobilePerformance');
      const wasClosed = detail.root.dataset.mobileOpen !== 'true';
      detail.setOpen(true);
      nav.querySelectorAll('button').forEach(b=>{ if(b.dataset.destination==='mobilePerformance') b.setAttribute('aria-current','location'); else b.removeAttribute('aria-current'); });
      if(wasClosed) requestAnimationFrame(()=>detail.root.scrollIntoView({block:'start',behavior:'instant'}));
      syncTab();
    }
  }).observe($('hourDrillNotice'),{attributes:true,attributeFilter:['hidden']});
  let previousRows = window.BIC_APP.getData().rows;
  window.BIC_APP.subscribe(() => {
    const data = window.BIC_APP.getData();
    if (mobile.matches && data.rows !== previousRows && data.rows.length && data.origin === 'local') {
      $('sidebar').classList.remove('open'); $('toggleFilters').setAttribute('aria-expanded','false');
    }
    previousRows = data.rows;
    syncHints();
  });
  const applyViewport = () => {
    compactLabels();
    picker.open = !mobile.matches;
    folds.forEach(f => f.setOpen(f.root.dataset.mobileOpen === 'true'));
    renderCards();
  };
  mobile.addEventListener('change',applyViewport); applyViewport();
}
