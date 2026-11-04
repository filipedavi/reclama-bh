// Gráficos em SVG puro: colunas simples, colunas agrupadas e barras divergentes.
// Regras: marcas finas (até 24 px), ponta arredondada de 4 px, uma única escala,
// legenda quando há 2+ séries, dica no hover e tabela alternativa.

const NS = 'http://www.w3.org/2000/svg';
const dica = () => document.getElementById('dica');

export function mostrarDica(ev, html) {
  const d = dica();
  d.innerHTML = html;
  d.hidden = false;
  const x = Math.min(ev.clientX + 14, window.innerWidth - d.offsetWidth - 8);
  const y = Math.max(8, ev.clientY - d.offsetHeight - 12);
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
}
export function esconderDica() { dica().hidden = true; }

function svg(largura, altura) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${largura} ${altura}`);
  s.setAttribute('role', 'img');
  return s;
}
function no(tag, attrs, pai) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    // var() não funciona em atributo de apresentação do SVG; vai como estilo.
    if (k === 'fill' && String(v).startsWith('var(')) n.style.fill = v;
    else n.setAttribute(k, v);
  }
  if (pai) pai.appendChild(n);
  return n;
}
function texto(pai, x, y, conteudo, attrs = {}) {
  const t = no('text', { x, y, ...attrs }, pai);
  t.textContent = conteudo;
  return t;
}

// Coluna com ponta superior arredondada (4 px) e base reta.
function caminhoColuna(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
// Barra horizontal a partir de x0, com ponta arredondada no lado do dado.
function caminhoBarraH(x0, x1, y, h, r = 4) {
  const w = Math.abs(x1 - x0);
  if (w < 0.5) return '';
  const rr = Math.min(r, h / 2, w);
  if (x1 >= x0) return `M${x0},${y}H${x1 - rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - rr},${y + h}H${x0}Z`;
  return `M${x0},${y}H${x1 + rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 + rr},${y + h}H${x0}Z`;
}

function passoLimpo(max, ticks = 4) {
  if (max <= 0) return 1;
  const bruto = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}
const compacto = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : v.toLocaleString('pt-BR'));

function tabela(dados, cabecalho) {
  const det = document.createElement('details');
  det.className = 'ver-tabela';
  det.innerHTML = `<summary>Ver tabela</summary><div class="rolagem"><table class="dados"><thead><tr>${cabecalho
    .map((c, i) => `<th${i ? ' class="n"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${dados
    .map((l) => `<tr>${l.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return det;
}

/** Colunas de uma série. itens: [{rotulo, valor, dica}] */
export function colunas(alvo, { itens, cor = 'var(--serie-1)', altura = 200, titulo = '' }) {
  alvo.innerHTML = '';
  const W = 560, H = altura, m = { t: 22, r: 8, b: 28, l: 40 };
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const passo = passoLimpo(max);
  const topo = Math.ceil(max / passo) * passo;
  const s = svg(W, H);
  s.setAttribute('aria-label', titulo);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / topo);
  for (let v = 0; v <= topo; v += passo) {
    no('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v ? 'grade-l' : 'base' }, s);
    texto(s, m.l - 6, y(v) + 4, compacto(v), { 'text-anchor': 'end' });
  }
  const banda = (W - m.l - m.r) / itens.length;
  const w = Math.min(24, banda * 0.6);
  itens.forEach((it, i) => {
    const x = m.l + banda * i + (banda - w) / 2;
    const p = no('path', { d: caminhoColuna(x, y(it.valor), w, y(0) - y(it.valor)), fill: cor }, s);
    const alvoHover = no('rect', { x: m.l + banda * i, y: m.t, width: banda, height: H - m.t - m.b, fill: 'transparent' }, s);
    alvoHover.addEventListener('pointermove', (ev) => { p.style.opacity = 0.8; mostrarDica(ev, it.dica || `<b>${it.rotulo}</b>${it.valor.toLocaleString('pt-BR')}`); });
    alvoHover.addEventListener('pointerleave', () => { p.style.opacity = 1; esconderDica(); });
    texto(s, x + w / 2, y(it.valor) - 6, it.valor.toLocaleString('pt-BR'), { 'text-anchor': 'middle', class: 'valor' });
    texto(s, x + w / 2, H - m.b + 16, it.rotulo, { 'text-anchor': 'middle' });
  });
  alvo.appendChild(s);
  alvo.appendChild(tabela(itens.map((i) => [i.rotulo, i.valor.toLocaleString('pt-BR')]), ['Versão', 'Valor']));
}

/** Colunas agrupadas. categorias: [rotulos]; series: [{nome, cor, valores}] */
export function colunasAgrupadas(alvo, { categorias, series, altura = 210, titulo = '', rotuloCategoria = (c) => c, passoRotulo = 1 }) {
  alvo.innerHTML = '';
  const leg = document.createElement('div');
  leg.className = 'legenda';
  leg.innerHTML = series.map((s) => `<span><i style="background:${s.cor}"></i>${s.nome}</span>`).join('');
  alvo.appendChild(leg);
  const W = 560, H = altura, m = { t: 12, r: 8, b: 26, l: 34 };
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const passo = passoLimpo(max);
  const topo = Math.ceil(max / passo) * passo;
  const s = svg(W, H);
  s.setAttribute('aria-label', titulo);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / topo);
  for (let v = 0; v <= topo; v += passo) {
    no('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v ? 'grade-l' : 'base' }, s);
    texto(s, m.l - 6, y(v) + 4, compacto(v), { 'text-anchor': 'end' });
  }
  const banda = (W - m.l - m.r) / categorias.length;
  const gap = 2;
  const w = Math.min(24, (banda * 0.8 - gap * (series.length - 1)) / series.length);
  categorias.forEach((c, i) => {
    const x0 = m.l + banda * i + (banda - (w * series.length + gap * (series.length - 1))) / 2;
    const marcas = series.map((se, k) => no('path', {
      d: caminhoColuna(x0 + k * (w + gap), y(se.valores[i]), w, y(0) - y(se.valores[i]), Math.min(4, w / 2)), fill: se.cor,
    }, s));
    const area = no('rect', { x: m.l + banda * i, y: m.t, width: banda, height: H - m.t - m.b, fill: 'transparent' }, s);
    area.addEventListener('pointermove', (ev) => {
      marcas.forEach((mk) => { mk.style.opacity = 0.8; });
      mostrarDica(ev, `<b>${rotuloCategoria(c)}</b>${series.map((se) => `${se.nome}: ${se.valores[i].toLocaleString('pt-BR')}`).join('<br>')}`);
    });
    area.addEventListener('pointerleave', () => { marcas.forEach((mk) => { mk.style.opacity = 1; }); esconderDica(); });
    if (i % passoRotulo === 0) texto(s, m.l + banda * i + banda / 2, H - m.b + 15, c, { 'text-anchor': 'middle' });
  });
  alvo.appendChild(s);
  alvo.appendChild(tabela(categorias.map((c, i) => [rotuloCategoria(c), ...series.map((se) => se.valores[i].toLocaleString('pt-BR'))]),
    ['', ...series.map((se) => se.nome)]));
}

/** Barras horizontais divergentes em torno de zero. itens: [{rotulo, valor (%), dica, href}] */
export function barrasDivergentes(alvo, { itens, titulo = '' }) {
  alvo.innerHTML = '';
  const linhaH = 30, W = 560, rotW = 110, m = { t: 6, r: 52, b: 6 };
  const H = m.t + m.b + linhaH * itens.length;
  const lim = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  const s = svg(W, H);
  s.setAttribute('aria-label', titulo);
  const x = (v) => rotW + 44 + ((W - rotW - 44 - m.r) * (v + lim)) / (2 * lim);
  no('line', { x1: x(0), x2: x(0), y1: m.t, y2: H - m.b, class: 'base' }, s);
  itens.forEach((it, i) => {
    const yy = m.t + i * linhaH;
    const h = Math.min(18, linhaH - 8);
    const cor = it.valor < 0 ? 'var(--div-n2)' : 'var(--div-p2)';
    const grupo = no('a', it.href ? { href: it.href } : {}, s);
    texto(grupo, rotW, yy + linhaH / 2 + 4, it.rotulo, { 'text-anchor': 'end', class: 'rot-forte' });
    const p = no('path', { d: caminhoBarraH(x(0), x(it.valor), yy + (linhaH - h) / 2, h), fill: cor }, grupo);
    const sinal = it.valor > 0 ? '+' : it.valor < 0 ? '−' : '';
    const ancora = it.valor < 0 ? x(it.valor) - 6 : x(it.valor) + 6;
    texto(grupo, ancora, yy + linhaH / 2 + 4, `${sinal}${Math.abs(it.valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
      { 'text-anchor': it.valor < 0 ? 'end' : 'start', class: 'valor' });
    const area = no('rect', { x: 0, y: yy, width: W, height: linhaH, fill: 'transparent' }, grupo);
    area.addEventListener('pointermove', (ev) => { p.style.opacity = 0.8; mostrarDica(ev, it.dica); });
    area.addEventListener('pointerleave', () => { p.style.opacity = 1; esconderDica(); });
  });
  alvo.appendChild(s);
  alvo.appendChild(tabela(itens.map((i) => [i.rotulo, `${i.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`]), ['', 'Variação']));
}

/** Valor atual de um token de cor (o Leaflet precisa da cor resolvida). */
export function corCSS(v) {
  const m = String(v).match(/^var\((--[\w-]+)\)$/);
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : v;
}

/** Classe divergente (5 faixas) para o mapa de bairros. */
export function corDivergente(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  if (pct <= -10) return 'var(--div-n2)';
  if (pct < -2) return 'var(--div-n1)';
  if (pct <= 2) return 'var(--div-0)';
  if (pct < 10) return 'var(--div-p1)';
  return 'var(--div-p2)';
}
export const FAIXAS_DIVERGENTES = [
  ['var(--div-n2)', 'queda de 10% ou mais'], ['var(--div-n1)', 'queda de 2% a 10%'], ['var(--div-0)', 'estável (±2%)'],
  ['var(--div-p1)', 'alta de 2% a 10%'], ['var(--div-p2)', 'alta de 10% ou mais'],
];
