import { MotorBusca, CAMPOS } from './busca.js';
import { BuscaSemantica, TAMANHO_MODELO_MB } from './semantica.js';
import { colunas, colunasAgrupadas, corCSS } from './graficos.js';

const NOMES_REG = { BA: 'Barreiro', CS: 'Centro-Sul', LE: 'Leste', NE: 'Nordeste', NO: 'Noroeste', NT: 'Norte', OE: 'Oeste', PA: 'Pampulha', VN: 'Venda Nova', NI: 'Não informada' };
const ROT_RES = { atendida: 'Atendida', orientacao: 'Gerou orientação', arquivada: 'Arquivada', outra: 'Outro desfecho' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const POR_PAGINA = 20;
const MIN_RANKING = 200;

const D = {};
const app = document.getElementById('conteudo');
let mapaAtivo = null;

// ------------------------------------------------------------------ utilidades
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (v ?? 0).toLocaleString('pt-BR');
const pct = (v) => (v === undefined || v === null ? '–' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`);
const diasTxt = (v) => (v === undefined || v === null ? '–' : `${Math.round(v)} dia${Math.round(v) === 1 ? '' : 's'}`);
const mesAno = (iso) => `${MESES[+iso.slice(5, 7) - 1]}/${iso.slice(0, 4)}`;
const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const periodoTxt = () => `${mesAno(D.geral.periodo.inicio)} a ${mesAno(D.geral.periodo.fim)}`;

function guardar(k, v) { try { localStorage.setItem(`rbh:${k}`, JSON.stringify(v)); } catch { /* sem armazenamento */ } }
function ler(k, padrao) { try { return JSON.parse(localStorage.getItem(`rbh:${k}`)) ?? padrao; } catch { return padrao; } }
async function json(c) { const r = await fetch(c); if (!r.ok) throw new Error(`${c}: ${r.status}`); return r.json(); }
function definirTitulo(t) { document.title = t ? `${t} · Reclama BH` : 'Reclama BH'; }
function marcarMenu(rota) {
  document.querySelectorAll('.menu a').forEach((a) => { if (a.dataset.rota === rota) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
const nomeTema = (id) => D.temas.find((t) => t.id === id)?.nome || id;
const nomeSub = (id) => D.temas.flatMap((t) => t.subtemas).find((s) => s.id === id)?.nome || id;
const nomeOrgao = (s) => (D.orgaos[s] ? `${s} · ${D.orgaos[s].nome}` : s);

function barra100(r, { legenda = true } = {}) {
  if (!r || !r.encerradas) return '<p class="mini">Sem manifestações encerradas.</p>';
  const partes = ['atendida', 'orientacao', 'arquivada', 'outra'].map((k) => ({ k, v: r[`pct_${k}`] || 0 }));
  return `<div class="barra-100" role="img" aria-label="${partes.map((p) => `${ROT_RES[p.k]} ${pct(p.v)}`).join(', ')}">${partes
    .map((p) => `<span class="${p.k}" style="width:${p.v}%" title="${ROT_RES[p.k]}: ${pct(p.v)}"></span>`).join('')}</div>${legenda
    ? `<div class="legenda-100">${partes.map((p) => `<span><i class="${p.k}" style="background:var(--${{ atendida: 'div-p2', orientacao: 'div-p1', arquivada: 'div-n2', outra: 'eixo' }[p.k]})"></i>${ROT_RES[p.k]} <b>${pct(p.v)}</b></span>`).join('')}</div>` : ''}`;
}

function tiles(r, { comparar = null } = {}) {
  const t = (rot, val, extra = '', cls = '') => `<div class="numero"><div class="rot">${rot}</div><div class="val ${cls}">${val} ${extra ? `<small>${extra}</small>` : ''}</div></div>`;
  const delta = (k, inverte = false) => {
    if (!comparar || r[k] === undefined || comparar[k] === undefined) return '';
    const d = r[k] - comparar[k];
    const bom = inverte ? d < 0 : d > 0;
    return `<span class="${bom ? 'bom' : 'ruim'}">${d > 0 ? '+' : ''}${d.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} p.p. vs. média</span>`;
  };
  return `<div class="numeros">
    ${t('Manifestações registradas', num(r.n), r.em_andamento ? `${num(r.em_andamento)} ainda em andamento` : '')}
    ${t('Atendidas (das encerradas)', pct(r.pct_atendida), delta('pct_atendida'))}
    ${t('Arquivadas sem atendimento', pct(r.pct_arquivada), delta('pct_arquivada', true))}
    ${t('Tempo mediano de resposta', diasTxt(r.mediana_dias), r.pct_no_prazo !== undefined ? `${pct(r.pct_no_prazo)} dentro de 30 dias` : '')}
  </div>`;
}

function cartaoServico(s) {
  const ok = s.suficiente;
  return `<a class="cartao-servico" href="#/servico/${esc(s.id)}">
    <h3>${esc(s.nome)}</h3>
    <div class="trilha">${esc(nomeTema(s.tema))} › ${esc(nomeSub(s.subtema))}${s.orgao ? ` · responde: ${esc(s.orgao)}` : ''}</div>
    <div class="metricas"><span><b>${num(s.n)}</b> manifestações</span>
      ${ok ? `<span class="${s.pct_atendida >= 50 ? 'bom' : s.pct_atendida < 25 ? 'ruim' : ''}">atendidas <b>${pct(s.pct_atendida)}</b></span>
      <span class="${s.pct_arquivada >= 40 ? 'ruim' : ''}">arquivadas <b>${pct(s.pct_arquivada)}</b></span>
      <span class="${s.mediana_dias > 30 ? 'ruim' : ''}">mediana <b>${diasTxt(s.mediana_dias)}</b></span>
      <span>no prazo <b>${pct(s.pct_no_prazo)}</b></span>` : '<span class="mini">poucos registros para calcular taxas</span>'}
    </div></a>`;
}

function listaServicos(docs, { limite = POR_PAGINA } = {}) {
  const wrap = document.createElement('div');
  if (!docs.length) { wrap.innerHTML = '<p class="vazio">Nenhum serviço encontrado.</p>'; return wrap; }
  const lista = document.createElement('div');
  lista.className = 'lista-servicos';
  const botao = document.createElement('button');
  botao.className = 'botao secundario mais';
  botao.type = 'button';
  let n = 0;
  const mais = () => {
    lista.insertAdjacentHTML('beforeend', docs.slice(n, n + limite).map(cartaoServico).join(''));
    n += limite;
    botao.hidden = n >= docs.length;
    botao.textContent = `Mostrar mais (${num(docs.length - n)} restantes)`;
  };
  botao.addEventListener('click', mais);
  wrap.append(lista, botao);
  mais();
  return wrap;
}

function abas(opcoes, atual, aoMudar) {
  const div = document.createElement('div');
  div.className = 'abas';
  for (const [valor, rotulo] of opcoes) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = rotulo; b.setAttribute('aria-pressed', String(valor === atual));
    b.addEventListener('click', () => { div.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); aoMudar(valor); });
    div.appendChild(b);
  }
  return div;
}

function tabelaIndicadores(obj, { rotulo = '', ordem = 'n', link = null, minimo = 1 } = {}) {
  const linhas = Object.entries(obj).filter(([, v]) => v.n >= minimo).sort((a, b) => (b[1][ordem] ?? -1) - (a[1][ordem] ?? -1));
  return `<div class="rolagem"><table class="dados"><thead><tr><th>${rotulo}</th><th class="n">Manif.</th><th class="n">Atendidas</th><th class="n">Arquivadas</th><th class="n">Mediana</th><th class="n">No prazo</th></tr></thead><tbody>
    ${linhas.map(([k, v]) => `<tr><td>${link ? `<a href="${link(k)}">${esc(v.nome || k)}</a>` : esc(v.nome || k)}</td><td class="n">${num(v.n)}</td>
      <td class="n">${v.suficiente ? pct(v.pct_atendida) : '–'}</td><td class="n">${v.suficiente ? pct(v.pct_arquivada) : '–'}</td>
      <td class="n">${v.suficiente ? diasTxt(v.mediana_dias) : '–'}</td><td class="n">${v.suficiente ? pct(v.pct_no_prazo) : '–'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function graficoAnos(alvo, porAno, titulo) {
  const anos = Object.keys(porAno).sort();
  colunasAgrupadas(alvo, {
    titulo, categorias: anos, rotuloCategoria: (a) => a,
    series: [
      { nome: 'Atendidas (%)', cor: 'var(--div-p2)', valores: anos.map((a) => porAno[a].pct_atendida || 0) },
      { nome: 'Arquivadas (%)', cor: 'var(--div-n2)', valores: anos.map((a) => porAno[a].pct_arquivada || 0) },
    ],
  });
}

const elegiveis = () => D.docs.filter((s) => s.suficiente && s.n >= MIN_RANKING && s.tema !== 'OUT' && s.id !== 'sem-servico');

// ------------------------------------------------------------------ início
function viewInicio() {
  definirTitulo(''); marcarMenu('inicio');
  const g = D.geral;
  const anos = g.anos;
  const el = elegiveis();
  const rank = (chave, inverte, cls, fmt) => `<div class="ranking">${[...el].sort((a, b) => (inverte ? a[chave] - b[chave] : b[chave] - a[chave])).slice(0, 6)
    .map((s) => `<a href="#/servico/${esc(s.id)}"><span class="nome">${esc(s.nome)}<small>${num(s.n)} manifestações</small></span><span class="val ${cls}">${fmt(s[chave])}</span></a>`).join('')}</div>`;
  app.innerHTML = `
    <section class="hero">
      <h1>Antes de reclamar, veja o que esperar da Prefeitura.</h1>
      <p class="lead">Reunimos ${num(g.total.n)} manifestações registradas na Ouvidoria de Belo Horizonte (${periodoTxt()}) e calculamos, para cada serviço,
        quantas foram atendidas, quantas foram arquivadas e quanto tempo a resposta levou.</p>
      <form class="busca-principal" role="search" id="form-busca">
        <label class="pular" for="q">Sobre o que você quer reclamar?</label>
        <input id="q" type="search" placeholder="Ex.: buraco na rua, poda de árvore, ônibus lotado, vaga na creche" autocomplete="off">
        <button class="botao" type="submit">Ver o que esperar</button>
      </form>
      <div class="sugestoes" aria-label="Sugestões">
        ${['poda de árvore', 'ônibus', 'poste apagado', 'barulho de bar', 'IPTU', 'vaga na creche', 'remédio no posto', 'o que mais demora', 'o que mais é arquivado']
    .map((s) => `<button type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>
      ${tiles(g.total)}
    </section>
    <section class="secao grade-2">
      <div class="cartao"><h2>Como a Prefeitura responde</h2>
        <p class="mini">Desfecho das ${num(g.total.encerradas)} manifestações encerradas. "Gerou orientação" significa que o cidadão recebeu uma explicação, sem ação sobre o problema.</p>
        ${barra100(g.total)}
        <h3 style="margin-top:16px">Ano a ano</h3><div class="grafico" id="g-anos"></div></div>
      <div class="cartao"><h2>O que mais se reclama</h2>
        <div class="ranking">${[...D.temas].filter((t) => t.id !== 'OUT').sort((a, b) => b.n - a.n).slice(0, 10)
    .map((t) => `<a href="#/tema/${t.id}" class="pct-fundo" style="--p:${(100 * t.n / D.temas[0].n * 0 + 100 * t.n / Math.max(...D.temas.map((x) => x.n))).toFixed(0)}%"><span class="nome">${esc(t.nome)}<small>${pct(t.pct_atendida)} atendidas · mediana ${diasTxt(t.mediana_dias)}</small></span><span class="val">${num(t.n)}</span></a>`).join('')}</div>
        <p class="mini" style="margin-top:8px"><a href="#/temas">Todos os temas</a></p></div>
    </section>
    <section class="secao">
      <h2>Rankings <small>serviços com pelo menos ${MIN_RANKING} manifestações</small></h2>
      <div class="grade-3">
        <div class="cartao"><h3>Mais arquivados sem atendimento</h3>${rank('pct_arquivada', false, 'ruim', pct)}</div>
        <div class="cartao"><h3>Mais demorados (mediana)</h3>${rank('mediana_dias', false, 'ruim', diasTxt)}</div>
        <div class="cartao"><h3>Mais atendidos</h3>${rank('pct_atendida', false, 'bom', pct)}</div>
      </div>
    </section>
    <section class="secao grade-2">
      <div class="cartao"><h2>Por onde reclamar faz diferença</h2>
        <p class="mini">Resultado por canal de registro. "Origem interna" são manifestações registradas por servidores a partir de outros canais (Disque 100, Reclame Aqui, e-mail).</p>
        ${tabelaIndicadores(g.canal, { rotulo: 'Canal', ordem: 'n' })}</div>
      <div class="cartao"><h2>Como usar estes números</h2>
        <ul class="sutil">
          <li><b>Atendida</b> é o que a Prefeitura registrou ao encerrar. Não sabemos se o cidadão concordou.</li>
          <li><b>Arquivada</b> é a manifestação encerrada sem atendimento (por exemplo, por falta de dados ou por não ser competência do órgão).</li>
          <li><b>Mediana</b>: metade das respostas levou menos que isso, metade levou mais. A lei dá 30 dias.</li>
          <li>Os dados vão até <b>${mesAno(g.periodo.fim)}</b>, a última publicação da PBH; manifestações recentes ainda em andamento não entram nas taxas.</li>
        </ul>
        <p><a href="#/sobre">Metodologia e vocabulário</a> · <a href="#/sobre/limitacoes">Limitações</a></p></div>
    </section>`;
  app.querySelector('#form-busca').addEventListener('submit', (ev) => { ev.preventDefault(); location.hash = `#/buscar?q=${encodeURIComponent(app.querySelector('#q').value)}`; });
  app.querySelectorAll('.sugestoes button').forEach((b) => b.addEventListener('click', () => { location.hash = `#/buscar?q=${encodeURIComponent(b.dataset.q)}`; }));
  graficoAnos(app.querySelector('#g-anos'), g.por_ano, 'Atendidas e arquivadas por ano');
}

// ------------------------------------------------------------------ busca por significado
// Segunda camada, sob demanda: só quando o usuário pede (ou já baixou o modelo e a busca por
// vocabulário não encontrou nada). Ver web/js/semantica.js.
function buscaPorSignificado(q, nResultados, caixa) {
  if (!D.semantica) D.semantica = new BuscaSemantica({ servicos: D.servicos });
  const sem = D.semantica;
  const disponivel = sem.pronta || BuscaSemantica.jaBaixada();
  const executar = async () => {
    caixa.innerHTML = '<p class="mini" id="sem-progresso">Carregando o modelo…</p>';
    try {
      if (!sem.pronta) await sem.carregar(({ etapa, fracao }) => {
        const p = caixa.querySelector('#sem-progresso');
        if (p) p.textContent = etapa === 'pronto' ? 'Modelo pronto. Comparando…' : `Baixando o modelo de linguagem: ${Math.round(fracao * 100)}%`;
      });
      const r = await sem.buscar(q);
      if (!caixa.isConnected) return;
      caixa.innerHTML = `<h2>Por significado</h2>
        <div class="entendi"><span>Parece ser sobre:</span>${r.subtemas.map((s) => `<a class="chip" href="#/buscar?f=subtema:${esc(s.id)}">${esc(nomeSub(s.id))}</a>`).join('')}</div>
        <div id="sem-lista"></div>
        <p class="mini">Sugestão por similaridade semântica: a pergunta e os serviços viram vetores no modelo ${esc(r.modelo.split('/')[1])}, que roda no seu aparelho, e os mais próximos aparecem aqui, sem garantia de acerto. A lista acima, por vocabulário controlado, é a busca oficial. <a href="#/sobre/projeto">Como funciona</a>.</p>`;
      caixa.querySelector('#sem-lista').appendChild(listaServicos(r.servicos.map((x) => x.doc), { limite: 8 }));
    } catch (erro) {
      caixa.innerHTML = `<p class="aviso">Não foi possível carregar o modelo (${esc(erro.message)}). Precisa de internet na primeira vez.</p>`;
    }
  };
  if (nResultados === 0 && disponivel) { executar(); return; }
  caixa.innerHTML = `<p>${nResultados ? 'Não era isso?' : 'Nada encontrado pelo vocabulário.'} <button type="button" class="botao secundario" id="btn-semantica">Buscar por significado</button>
    <span class="mini">Usa um modelo de linguagem que roda no seu aparelho${disponivel ? '' : ` (baixa ${TAMANHO_MODELO_MB} MB uma vez)`}; nada é enviado para fora.</span></p>`;
  caixa.querySelector('#btn-semantica').addEventListener('click', executar);
}

// ------------------------------------------------------------------ busca
function viewBuscar(params) {
  marcarMenu('buscar');
  const q = params.get('q') || '';
  const filtros = (params.get('f') || '').split(',').filter(Boolean);
  let ordem = params.get('ordem') || '';
  definirTitulo(q ? `Busca: ${q}` : 'Buscar');
  const r = D.motor.buscar(q, filtros);
  if (!ordem) ordem = { lenta: 'demorados', rapida: 'rapidos', arquivada: 'arquivados', atendida: 'atendidos' }[r.ordenacao] || 'n';
  const ok = (s) => s.suficiente;
  const ordens = {
    n: (a, b) => b.n - a.n,
    atendidos: (a, b) => (ok(b) ? b.pct_atendida : -1) - (ok(a) ? a.pct_atendida : -1),
    menos: (a, b) => (ok(a) ? a.pct_atendida : 999) - (ok(b) ? b.pct_atendida : 999),
    arquivados: (a, b) => (ok(b) ? b.pct_arquivada : -1) - (ok(a) ? a.pct_arquivada : -1),
    demorados: (a, b) => (ok(b) ? b.mediana_dias : -1) - (ok(a) ? a.mediana_dias : -1),
    rapidos: (a, b) => (ok(a) ? a.mediana_dias : 999) - (ok(b) ? b.mediana_dias : 999),
  };
  // Uma pergunta de ranking ("o que mais demora") sem outro termo compara só serviços com amostra suficiente.
  const base = r.ordenacao && !r.consulta ? r.docs.filter((s) => s.suficiente && s.n >= MIN_RANKING && s.tema !== 'OUT') : r.docs;
  const docs = [...base].sort(ordens[ordem] || ordens.n);
  const fac = D.motor.facetas(docs);
  const url = (novo) => { const p = new URLSearchParams({ q, f: filtros.join(','), ordem, ...novo }); for (const [k, v] of [...p]) if (!v) p.delete(k); return `#/buscar?${p}`; };
  const alternar = (c) => url({ f: (filtros.includes(c) ? filtros.filter((x) => x !== c) : [...filtros, c]).join(',') });
  const bloco = (titulo, itens) => (itens.length > 1 ? `<div class="faceta"><h3>${titulo}</h3>${itens.slice(0, 10).map(([k, n]) =>
    `<button type="button" data-ir="${esc(alternar(k))}" aria-pressed="${filtros.includes(k)}"><span>${esc(D.motor.rotulo(k))}</span><span>${n}</span></button>`).join('')}</div>` : '');
  const regionalCitada = r.explic.find((x) => x.campo === 'regional');
  app.innerHTML = `
    <h1>Buscar serviços</h1>
    <form class="busca-principal" role="search" id="form-busca">
      <label class="pular" for="q">Sobre o que você quer reclamar?</label>
      <input id="q" type="search" value="${esc(q)}" placeholder="Escreva do seu jeito ou use a busca avançada" autocomplete="off">
      <button class="botao" type="submit">Buscar</button>
    </form>
    <details class="ajuda-busca"><summary>Busca avançada: operadores e campos</summary>
      <table>
        <tr><td><code>AND</code> <code>OR</code> <code>NOT</code></td><td>operadores booleanos em maiúsculas (também <code>E</code>, <code>OU</code>, <code>NAO</code>); sem operador vale <code>AND</code>.</td></tr>
        <tr><td><code>-termo</code></td><td>exclui o termo.</td></tr>
        <tr><td><code>( )</code></td><td>agrupa: <code>(tema:SAU OR tema:ANI) AND orgao:SMSA</code></td></tr>
        <tr><td><code>"frase"</code></td><td>frase exata no nome do serviço: <code>"boca de lobo"</code></td></tr>
        <tr><td><code>arvo*</code></td><td>truncamento: árvore, árvores…</td></tr>
        <tr><td><code>campo:valor</code></td><td>${Object.entries(CAMPOS).filter(([k]) => k !== 'resultado' && k !== 'servico').map(([k, v]) => `<code>${k}:</code> ${v.toLowerCase()}`).join(', ')}.
          Ex.: <code>tema:TRA</code>, <code>subtema:ARV.POD</code>, <code>orgao:SLU</code>, <code>motivo:"Descumprimento de Prazo"</code>, <code>tipologia:Denúncia</code>, <code>regional:BA</code>.</td></tr>
      </table>
      <p>Códigos de tema na <a href="#/sobre/taxonomia">taxonomia</a>; sinônimos aceitos no <a href="#/sobre/tesauro">tesauro</a>.</p>
    </details>
    <div class="layout-busca">
      <aside class="facetas" id="facetas" aria-label="Filtros">${bloco('Tema', fac.tema)}${bloco('Subtema', fac.subtema)}${bloco('Órgão que responde', fac.orgao)}${bloco('Tipo de manifestação', fac.tipologia)}</aside>
      <div>
        ${r.explic.length ? `<div class="entendi"><span>${r.modo === 'natural' ? 'Entendi assim:' : 'Termos:'}</span>${r.explic.map((x) => `<span class="chip"><b>${esc(CAMPOS[x.campo] || (x.campo === 'frase' ? 'Frase' : 'Palavra'))}</b> ${esc(x.rotulo)}</span>`).join('')}</div>` : ''}
        ${r.modo === 'natural' && r.consulta ? `<p class="mini">Busca equivalente: <a class="consulta-formal" href="${esc(url({ q: r.consulta }))}">${esc(r.consulta)}</a></p>` : ''}
        ${regionalCitada ? `<p class="aviso">Os indicadores dos cartões são de toda a cidade. Para a regional, abra a página <a href="#/regional/${esc(Object.keys(NOMES_REG).find((k) => NOMES_REG[k] === regionalCitada.rotulo) || '')}">${esc(regionalCitada.rotulo)}</a> ou a tabela "Por regional" dentro de cada serviço.</p>` : ''}
        ${r.ordenacao && !r.consulta ? `<p class="aviso">Ranking entre serviços com pelo menos ${MIN_RANKING} manifestações.</p>` : ''}
        ${filtros.length ? `<div class="entendi"><span>Filtros:</span>${filtros.map((f) => `<span class="chip">${esc(D.motor.rotulo(f))}<button type="button" aria-label="Remover filtro" data-ir="${esc(alternar(f))}">×</button></span>`).join('')}</div>` : ''}
        <div class="barra-resultados"><strong>${num(docs.length)} serviço${docs.length === 1 ? '' : 's'}</strong>
          <span><button type="button" class="botao secundario so-celular" id="abrir-filtros">Filtros</button>
          <label class="mini" for="ordem">Ordenar</label>
          <select id="ordem">${[['n', 'Mais reclamados'], ['atendidos', 'Mais atendidos'], ['menos', 'Menos atendidos'], ['arquivados', 'Mais arquivados'], ['demorados', 'Mais demorados'], ['rapidos', 'Mais rápidos']]
    .map(([v, t]) => `<option value="${v}"${v === ordem ? ' selected' : ''}>${t}</option>`).join('')}</select></span></div>
        <div id="resultados"></div>
        <section class="semantica" id="semantica" aria-live="polite"></section>
      </div></div>`;
  app.querySelector('#resultados').appendChild(listaServicos(docs));
  if (r.modo === 'natural') buscaPorSignificado(q, docs.length, app.querySelector('#semantica'));
  app.querySelector('#form-busca').addEventListener('submit', (ev) => { ev.preventDefault(); location.hash = url({ q: app.querySelector('#q').value, f: '', ordem: '' }); });
  app.querySelector('#ordem').addEventListener('change', (ev) => { location.hash = url({ ordem: ev.target.value }); });
  app.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.ir; }));
  app.querySelector('#abrir-filtros').addEventListener('click', () => app.querySelector('#facetas').classList.toggle('aberta'));
}

// ------------------------------------------------------------------ serviço
async function viewServico(id) {
  marcarMenu('');
  const idx = D.servicos[id];
  if (!idx) { app.innerHTML = `<p class="vazio">Serviço não encontrado. <a href="#/buscar">Buscar</a></p>`; return; }
  definirTitulo(idx.nome);
  app.innerHTML = '<div class="carregando">Carregando…</div>';
  const s = await json(`data/servicos/${encodeURIComponent(id)}.json`);
  const anos = Object.keys(s.por_ano_ind).sort();
  const melhorCanal = Object.entries(s.canal).filter(([, v]) => v.suficiente).sort((a, b) => b[1].pct_atendida - a[1].pct_atendida)[0];
  const marcados = ler('marcados', []);
  app.innerHTML = `
    <p class="mini"><a href="#/">Início</a> › <a href="#/tema/${s.tema}">${esc(nomeTema(s.tema))}</a> › <a href="#/buscar?f=subtema:${s.subtema}">${esc(nomeSub(s.subtema))}</a></p>
    <div class="cab-linha"><div><h1>${esc(s.nome)}</h1>
      <p class="sutil">Quem responde: ${s.orgao ? `<a href="#/orgao/${esc(s.orgao)}">${esc(s.orgao_nome)}</a>` : 'não informado'}${s.variantes.length ? ` <span class="selo" title="Nomes usados pela PBH para este serviço: ${esc(s.variantes.join(' | '))}">${s.variantes.length} grafia${s.variantes.length > 1 ? 's' : ''} reunida${s.variantes.length > 1 ? 's' : ''}</span>` : ''}</p></div>
      <div class="acoes"><button class="botao" type="button" id="marcar" aria-pressed="${marcados.includes(id)}">${marcados.includes(id) ? '★ Marcado' : '☆ Marcar'}</button>
        <a class="botao secundario" href="https://prefeitura.pbh.gov.br/ouvidoria" rel="noopener">Registrar manifestação na PBH</a></div></div>
    <h2>O que esperar <small>${periodoTxt()}</small></h2>
    ${s.suficiente ? tiles(s, { comparar: D.geral.total }) : `<p class="aviso">Só ${num(s.n)} manifestações (${num(s.encerradas)} encerradas): poucas para taxas confiáveis. Os números abaixo são apenas descritivos.</p>${tiles(s)}`}
    <section class="secao grade-2">
      <div class="cartao"><h2>Desfecho das manifestações</h2>${barra100(s)}
        <h3 style="margin-top:14px">Ano a ano</h3><div class="grafico" id="g-anos"></div>
        <div class="rolagem"><table class="dados"><thead><tr><th>Ano</th><th class="n">Manif.</th><th class="n">Atendidas</th><th class="n">Arquivadas</th><th class="n">Mediana</th><th class="n">No prazo</th></tr></thead><tbody>
          ${anos.map((a) => { const v = s.por_ano_ind[a]; return `<tr><td>${a}</td><td class="n">${num(v.n)}</td><td class="n">${pct(v.pct_atendida)}</td><td class="n">${pct(v.pct_arquivada)}</td><td class="n">${diasTxt(v.mediana_dias)}</td><td class="n">${pct(v.pct_no_prazo)}</td></tr>`; }).join('')}
        </tbody></table></div></div>
      <div class="cartao"><h2>Por onde reclamar</h2>
        ${melhorCanal ? `<p class="sutil">Canal com maior taxa de atendimento: <b>${esc(melhorCanal[0])}</b> (${pct(melhorCanal[1].pct_atendida)}).</p>` : ''}
        ${tabelaIndicadores(s.canal, { rotulo: 'Canal' })}
        <h3 style="margin-top:14px">Por que as pessoas reclamam</h3>
        <div class="ranking">${Object.entries(s.motivo).map(([m, n]) => `<a href="#/buscar?q=${encodeURIComponent(`motivo:"${m}"`)}"><span class="nome">${esc(m)}</span><span class="val">${num(n)}</span></a>`).join('') || '<span class="mini">Sem motivo registrado.</span>'}</div>
        ${s.detalhe_saude.length ? `<h3 style="margin-top:14px">Detalhes mais citados</h3><p class="mini">${s.detalhe_saude.map(esc).join(' · ')}</p>` : ''}
      </div>
    </section>
    <section class="secao grade-2">
      <div class="cartao"><h2>Por regional</h2><p class="mini">Cerca de metade das manifestações não informa regional.</p>${tabelaIndicadores(s.regional, { rotulo: 'Regional', link: (k) => `#/regional/${k}` })}</div>
      <div class="cartao"><h2>Por órgão que respondeu</h2>${tabelaIndicadores(s.orgao_ind, { rotulo: 'Órgão', link: (k) => (D.orgaos[k] ? `#/orgao/${k}` : null) })}
        <h3 style="margin-top:14px">Tipo de manifestação</h3>${tabelaIndicadores(s.tipologia, { rotulo: 'Tipo' })}</div>
    </section>
    <section class="secao"><div class="cartao"><h2>Manifestações por mês</h2><div class="grafico" id="g-mes"></div></div></section>`;
  app.querySelector('#marcar').addEventListener('click', (ev) => {
    const m = new Set(ler('marcados', [])); m.has(id) ? m.delete(id) : m.add(id); guardar('marcados', [...m]);
    ev.currentTarget.setAttribute('aria-pressed', String(m.has(id))); ev.currentTarget.textContent = m.has(id) ? '★ Marcado' : '☆ Marcar';
  });
  graficoAnos(app.querySelector('#g-anos'), s.por_ano_ind, 'Atendidas e arquivadas por ano');
  const meses = Object.keys(s.mensal).sort();
  colunas(app.querySelector('#g-mes'), { titulo: 'Manifestações por mês', itens: meses.map((m) => ({ rotulo: m.endsWith('-01') ? m.slice(0, 4) : '', valor: s.mensal[m], dica: `<b>${mesAno(m)}</b>${num(s.mensal[m])} manifestações` })) });
}

// ------------------------------------------------------------------ temas
function viewTemas() {
  marcarMenu('temas'); definirTitulo('Temas');
  app.innerHTML = `<h1>Temas</h1><p class="sutil">Os ${num(D.docs.length)} nomes de serviço usados pela Prefeitura, organizados em ${D.temas.length} temas e ${D.temas.reduce((a, t) => a + t.subtemas.length, 0)} subtemas. A barra mostra o desfecho das manifestações encerradas.</p>
    <div class="grade-temas">${[...D.temas].sort((a, b) => b.n - a.n).map((t) => `<a class="tema-card" href="#/tema/${t.id}"><h3>${esc(t.nome)}</h3><div class="n">${num(t.n)} manifestações · ${pct(t.pct_atendida)} atendidas · mediana ${diasTxt(t.mediana_dias)}</div>${barra100(t, { legenda: false })}</a>`).join('')}</div>
    <div class="legenda-100" style="margin-top:10px"><span><i style="background:var(--div-p2)"></i>Atendida</span><span><i style="background:var(--div-p1)"></i>Gerou orientação</span><span><i style="background:var(--div-n2)"></i>Arquivada</span><span><i style="background:var(--eixo)"></i>Outro</span></div>`;
}

function viewTema(id) {
  marcarMenu('temas');
  const t = D.temas.find((x) => x.id === id);
  if (!t) { app.innerHTML = '<p class="vazio">Tema não encontrado.</p>'; return; }
  definirTitulo(t.nome);
  app.innerHTML = `<p class="mini"><a href="#/">Início</a> › <a href="#/temas">Temas</a></p><h1>${esc(t.nome)}</h1>
    ${tiles(t, { comparar: D.geral.total })}
    <section class="secao grade-2">
      <div class="cartao"><h2>Desfecho</h2>${barra100(t)}<h3 style="margin-top:14px">Ano a ano</h3><div class="grafico" id="g-anos"></div></div>
      <div class="cartao"><h2>Subtemas</h2><div class="rolagem"><table class="dados"><thead><tr><th>Subtema</th><th class="n">Manif.</th><th class="n">Atendidas</th><th class="n">Arquivadas</th><th class="n">Mediana</th></tr></thead><tbody>
        ${t.subtemas.sort((a, b) => b.n - a.n).map((s) => `<tr><td><a href="#/buscar?f=subtema:${s.id}">${esc(s.nome)}</a><br><span class="mini">responde: ${s.orgaos.map(esc).join(', ') || '–'}</span></td><td class="n">${num(s.n)}</td><td class="n">${s.suficiente ? pct(s.pct_atendida) : '–'}</td><td class="n">${s.suficiente ? pct(s.pct_arquivada) : '–'}</td><td class="n">${s.suficiente ? diasTxt(s.mediana_dias) : '–'}</td></tr>`).join('')}
      </tbody></table></div>
      <h3 style="margin-top:14px">Motivos mais comuns</h3><p class="mini">${t.motivos.map(([m, n]) => `${esc(m)} (${num(n)})`).join(' · ')}</p></div>
    </section>
    <section class="secao"><h2>Serviços do tema <small><a href="#/buscar?f=tema:${t.id}">abrir na busca</a></small></h2><div id="lista"></div></section>`;
  graficoAnos(app.querySelector('#g-anos'), t.por_ano, 'Atendidas e arquivadas por ano');
  app.querySelector('#lista').appendChild(listaServicos(D.docs.filter((s) => s.tema === id)));
}

// ------------------------------------------------------------------ órgãos
function viewOrgaos() {
  marcarMenu('orgaos'); definirTitulo('Órgãos');
  const lista = Object.values(D.orgaos).filter((o) => o.sigla !== 'não informado');
  app.innerHTML = `<h1>Órgãos da Prefeitura</h1><p class="sutil">Quem responde às manifestações e com que resultado. ${num(D.geral.limpeza.sem_orgao)} manifestações (${pct(100 * D.geral.limpeza.sem_orgao / D.geral.total.n)}) vêm sem órgão informado e ficam de fora. Clique no cabeçalho para ordenar.</p>
    <div class="rolagem"><table class="dados" id="tab-org"><thead><tr><th class="ord" data-k="sigla">Órgão</th><th class="n ord" data-k="n">Manif.</th><th class="n ord" data-k="pct_atendida">Atendidas</th><th class="n ord" data-k="pct_arquivada">Arquivadas</th><th class="n ord" data-k="mediana_dias">Mediana</th><th class="n ord" data-k="pct_no_prazo">No prazo</th></tr></thead><tbody></tbody></table></div>`;
  let chave = 'n', desc = true;
  const pintar = () => {
    const l = [...lista].sort((a, b) => (typeof a[chave] === 'string' ? a[chave].localeCompare(b[chave]) : (a[chave] ?? -1) - (b[chave] ?? -1)) * (desc ? -1 : 1));
    app.querySelector('#tab-org tbody').innerHTML = l.map((o) => `<tr><td><a href="#/orgao/${esc(o.sigla)}"><b>${esc(o.sigla)}</b></a> <span class="mini">${esc(o.nome)}${o.confirmacao === 'pendente' ? ' <span class="selo" title="Nome por extenso a confirmar">a confirmar</span>' : ''}</span></td><td class="n">${num(o.n)}</td><td class="n">${pct(o.pct_atendida)}</td><td class="n">${pct(o.pct_arquivada)}</td><td class="n">${diasTxt(o.mediana_dias)}</td><td class="n">${pct(o.pct_no_prazo)}</td></tr>`).join('');
  };
  app.querySelectorAll('th.ord').forEach((th) => th.addEventListener('click', () => { if (chave === th.dataset.k) desc = !desc; else { chave = th.dataset.k; desc = chave !== 'sigla'; } pintar(); }));
  pintar();
}

function viewOrgao(sigla) {
  marcarMenu('orgaos');
  const o = D.orgaos[sigla];
  if (!o) { app.innerHTML = '<p class="vazio">Órgão não encontrado.</p>'; return; }
  definirTitulo(sigla);
  app.innerHTML = `<p class="mini"><a href="#/">Início</a> › <a href="#/orgaos">Órgãos</a></p><h1>${esc(sigla)} <small class="sutil" style="font-size:1rem;font-weight:400">${esc(o.nome)}</small></h1>
    ${tiles(o, { comparar: D.geral.total })}
    <section class="secao grade-2">
      <div class="cartao"><h2>Desfecho</h2>${barra100(o)}<h3 style="margin-top:14px">Ano a ano</h3><div class="grafico" id="g-anos"></div></div>
      <div class="cartao"><h2>Temas que o órgão responde</h2>${tabelaIndicadores(Object.fromEntries(Object.entries(o.temas).map(([k, v]) => [k, { ...v, nome: nomeTema(k) }])), { rotulo: 'Tema', link: (k) => `#/tema/${k}` })}</div>
    </section>
    <section class="secao"><h2>Serviços mais reclamados <small><a href="#/buscar?f=orgao:${esc(sigla)}">abrir na busca</a></small></h2><div id="lista"></div></section>`;
  graficoAnos(app.querySelector('#g-anos'), o.por_ano, 'Atendidas e arquivadas por ano');
  app.querySelector('#lista').appendChild(listaServicos(o.servicos.map((x) => D.servicos[x.id]).filter(Boolean)));
}

// ------------------------------------------------------------------ regionais e mapa
function novoMapa(el) {
  if (mapaAtivo) { mapaAtivo.remove(); mapaAtivo = null; }
  const m = L.map(el, { scrollWheelZoom: false, zoomControl: false, attributionControl: false, dragging: false, doubleClickZoom: false, touchZoom: false }).setView([-19.92, -43.94], 11);
  mapaAtivo = m;
  return m;
}

async function viewMapa(params) {
  marcarMenu('mapa'); definirTitulo('Regionais');
  let ind = params.get('ind') || 'pct_atendida';
  app.innerHTML = `<h1>Regionais</h1><p class="sutil">Resultado das manifestações por região administrativa. ${pct(100 * D.geral.limpeza.sem_regional / D.geral.total.n)} das manifestações não informam regional e ficam fora deste recorte.</p>
    <div id="abas"></div>
    <div class="grade-2"><div class="mapa grande" id="mapa" aria-label="Mapa das regionais"></div><div id="tab"></div></div>`;
  if (!D.geo) D.geo = await json('data/geo-regionais.json');
  const m = novoMapa(app.querySelector('#mapa'));
  let camada = null;
  const pintar = () => {
    if (camada) camada.remove();
    camada = L.featureGroup().addTo(m);
    const vals = Object.entries(D.regionais).filter(([k]) => k !== 'NI').map(([, v]) => v[ind]).filter((v) => v !== undefined);
    const min = Math.min(...vals), max = Math.max(...vals);
    const inverte = ind !== 'pct_atendida' && ind !== 'pct_no_prazo';
    for (const g of D.geo) {
      const r = D.regionais[g.sigla];
      const v = r?.[ind];
      let t = max === min ? 0.5 : (v - min) / (max - min);
      if (inverte) t = 1 - t;
      const cor = t > 0.66 ? 'var(--div-p2)' : t > 0.33 ? 'var(--div-0)' : 'var(--div-n2)';
      L.polygon(g.poligonos, { color: corCSS('var(--superficie)'), weight: 2, fillColor: corCSS(cor), fillOpacity: 0.85 })
        .bindTooltip(`<b>${g.nome}</b><br>${num(r?.n)} manifestações<br>${{ pct_atendida: 'atendidas', pct_arquivada: 'arquivadas', mediana_dias: 'mediana', pct_no_prazo: 'no prazo' }[ind]}: ${ind === 'mediana_dias' ? diasTxt(v) : pct(v)}`, { sticky: true })
        .on('click', () => { location.hash = `#/regional/${g.sigla}`; }).addTo(camada);
      const anel = g.poligonos[0][0];
      const centro = [anel.reduce((a, p) => a + p[0], 0) / anel.length, anel.reduce((a, p) => a + p[1], 0) / anel.length];
      L.marker(centro, { icon: L.divIcon({ className: 'rotulo-mapa', html: `${g.nome}<br><b>${ind === 'mediana_dias' ? diasTxt(r?.[ind]) : pct(r?.[ind])}</b>`, iconSize: [90, 30], iconAnchor: [45, 15] }), interactive: false }).addTo(camada);
    }
    app.querySelector('#tab').innerHTML = `<div class="cartao">${tabelaIndicadores(D.regionais, { rotulo: 'Regional', ordem: ind, link: (k) => `#/regional/${k}` })}<p class="mini">Azul: melhor terço; cinza: terço do meio; vermelho: pior terço, no indicador escolhido.</p></div>`;
  };
  app.querySelector('#abas').appendChild(abas([['pct_atendida', 'Atendidas'], ['pct_arquivada', 'Arquivadas'], ['mediana_dias', 'Tempo mediano'], ['pct_no_prazo', 'No prazo']], ind, (v) => { ind = v; pintar(); }));
  pintar();
  m.fitBounds(camada.getBounds(), { animate: false });
}

function viewRegional(sigla) {
  marcarMenu('mapa');
  const r = D.regionais[sigla];
  if (!r) { app.innerHTML = '<p class="vazio">Regional não encontrada.</p>'; return; }
  definirTitulo(`Regional ${r.nome}`);
  app.innerHTML = `<p class="mini"><a href="#/">Início</a> › <a href="#/mapa">Regionais</a></p><h1>Regional ${esc(r.nome)}</h1>
    ${tiles(r, { comparar: D.geral.total })}
    <section class="secao grade-2">
      <div class="cartao"><h2>Desfecho</h2>${barra100(r)}<h3 style="margin-top:14px">Ano a ano</h3><div class="grafico" id="g-anos"></div></div>
      <div class="cartao"><h2>Temas na regional</h2>${tabelaIndicadores(Object.fromEntries(Object.entries(r.temas).map(([k, v]) => [k, { ...v, nome: nomeTema(k) }])), { rotulo: 'Tema', link: (k) => `#/tema/${k}` })}</div>
    </section>
    <section class="secao"><h2>Serviços mais reclamados na regional</h2><div id="lista"></div></section>`;
  graficoAnos(app.querySelector('#g-anos'), r.por_ano, 'Atendidas e arquivadas por ano');
  app.querySelector('#lista').appendChild(listaServicos(r.servicos.map((x) => D.servicos[x.id]).filter(Boolean)));
}

// ------------------------------------------------------------------ sobre
const SECOES = [['projeto', 'O projeto'], ['conceitos', 'Conceitos'], ['taxonomia', 'Taxonomia'], ['tesauro', 'Tesauro'], ['orgaos', 'Lista de órgãos'],
  ['arquivo', 'Arquivo de versões'], ['gestao', 'Gestão arquivística'], ['dados', 'Dados abertos'], ['limitacoes', 'Limitações']];

function viewSobre(secao = 'projeto') {
  marcarMenu('sobre');
  const titulo = SECOES.find(([k]) => k === secao)?.[1] || 'Sobre';
  definirTitulo(titulo);
  const V = D.vocab, L_ = D.geral.limpeza;
  let corpo = '';
  if (secao === 'projeto') {
    corpo = `<div class="cartao">
      <p>A Ouvidoria da Prefeitura de Belo Horizonte publica, no Portal de Dados Abertos, a lista de todas as manifestações que recebe: reclamações, denúncias, sugestões, elogios e pedidos de orientação, com o serviço, o órgão responsável, o tempo de tramitação e o desfecho. São arquivos grandes, com nomes de serviço inconsistentes, uma linha por encaminhamento e sem nenhum agrupamento por assunto. Na prática, ninguém consegue responder a uma pergunta simples: <b>se eu reclamar disso, o que acontece?</b></p>
      <p>O <b>Reclama BH</b> organiza esses dados para responder a essa pergunta. Cada serviço recebe uma página com a taxa de atendimento, a taxa de arquivamento, o tempo mediano de resposta, o canal que funciona melhor e a evolução ano a ano. Os serviços são agrupados numa taxonomia de temas e podem ser encontrados pela linguagem do cidadão, graças a um tesauro.</p>
      <h3>Como a busca funciona</h3>
      <p class="sutil">A busca principal é por <b>vocabulário controlado</b>: a pergunta é normalizada, reduzida ao singular e comparada com o tesauro, que traduz a linguagem do cidadão ("buraco na rua") para os termos do sistema (<code>subtema:VIA.BUR</code>). O resultado é uma consulta booleana sobre um índice invertido, mostrada ao usuário como "Entendi assim" e "Busca equivalente". É explicável e roda sem internet.</p>
      <p class="sutil">Quando o tesauro não reconhece a pergunta, há uma segunda camada, <b>por significado</b>, que o usuário aciona com um botão: um modelo de linguagem pequeno (multilingual-e5-small, 118 MB, baixado uma vez e guardado no navegador) transforma a pergunta num vetor e a compara com os vetores dos ${num(D.docs.length)} serviços e dos subtemas, calculados no pipeline com o mesmo modelo. Tudo roda no aparelho do usuário; nenhum texto é enviado a servidor. Os resultados são sugestões por similaridade, sem a garantia de precisão da busca por vocabulário, e os subtemas apontados servem de atalho para a taxonomia.</p>
      <h3>Pipeline</h3>
      <ol class="sutil">
        <li><b>Coleta</b> (<code>coletar.py</code>): descobre no portal da PBH o arquivo mais completo de cada ano, baixa, calcula SHA-256 e registra no manifesto com metadados de descrição e preservação. Versões substituídas continuam guardadas.</li>
        <li><b>Tratamento</b> (<code>processar.py</code>): reúne as ${num(L_.linhas_lidas)} linhas em ${num(L_.manifestacoes)} manifestações (uma por protocolo), normaliza datas, prazos e situações, aplica o controle de autoridade aos nomes de serviço (${num(L_.servicos_distintos_originais)} grafias viram ${num(L_.servicos_apos_autoridade)} serviços) e classifica cada serviço na taxonomia (${pct(100 * L_.nao_classificados / L_.manifestacoes)} ficam sem classe).</li>
        <li><b>Indicadores</b> (<code>indicadores.py</code>): calcula os indicadores por serviço, tema, órgão, regional, canal e ano, e gera este site, o tesauro completo e o catálogo DCAT.</li>
        <li><b>Vetores</b> (<code>vetores.py</code>, opcional): calcula com o modelo multilingual-e5-small o vetor semântico de cada serviço e subtema, usado pela busca por significado.</li>
      </ol>
      <p class="mini">Indicadores gerados em ${dataBR(D.geral.gerado_em)}. Dados de ${periodoTxt()}.</p></div>`;
  } else if (secao === 'conceitos') {
    corpo = `<p class="sutil">${esc(V.conceitos.descricao)}</p>${V.conceitos.conceitos.map((c) => `<div class="cartao" style="margin-bottom:10px"><h3>${esc(c.termo)} <small class="mini">gênero: ${esc(c.genero)}</small></h3><p>${esc(c.definicao)}</p><p class="mini"><b>Definição operacional:</b> ${esc(c.operacional)}</p></div>`).join('')}`;
  } else if (secao === 'taxonomia') {
    corpo = `<p class="sutil">${esc(V.taxonomia.descricao)}</p><div class="cartao"><ul class="arvore">${D.temas.map((t) => `<li><a href="#/tema/${t.id}"><b>${t.id}</b> ${esc(t.nome)}</a> <span class="mini">(${num(t.n)})</span><ul>${t.subtemas.map((s) => `<li><a href="#/buscar?f=subtema:${s.id}"><code>${s.id}</code> ${esc(s.nome)}</a> <span class="mini">(${num(s.n)} manifestações, ${s.servicos.length}+ serviços)</span></li>`).join('')}</ul></li>`).join('')}</ul>
      <h3>Facetas</h3><p><b>Motivo</b> (vocabulário da própria Ouvidoria): ${D.geral.motivos.map(([m, n]) => `<code>${esc(m)}</code> ${num(n)}`).join('; ')}.</p>
      <p><b>Grupo prioritário</b>: ${D.geral.prioritarios.map(([m, n]) => `<code>${esc(m)}</code> ${num(n)}`).join('; ')}.</p>
      <p><b>Tipologia</b>: ${Object.entries(D.geral.tipologia).map(([k, v]) => `<code>${esc(k)}</code> ${num(v.n)}`).join('; ')}.</p></div>`;
  } else if (secao === 'tesauro') {
    corpo = `<p class="sutil">${esc(V.tesauro.descricao)}</p><p><label for="filtro-tes">Procurar termo ou sinônimo</label><br><input id="filtro-tes" type="search" style="width:100%;max-width:420px;padding:8px;border-radius:8px;border:1px solid var(--eixo);background:var(--superficie)" placeholder="Ex.: buraco, poste, cachorro"></p><div class="cartao" id="lista-tes"></div>`;
  } else if (secao === 'orgaos') {
    corpo = `<p class="sutil">${esc(V.orgaos.descricao)}</p><div class="rolagem"><table class="dados"><thead><tr><th>Sigla</th><th>Forma autorizada</th><th>Área</th><th>Situação</th></tr></thead><tbody>${Object.entries(V.orgaos.orgaos).sort().map(([s, o]) => `<tr><td><b>${esc(s)}</b></td><td>${esc(o.nome)}${o.nota ? `<br><span class="mini">${esc(o.nota)}</span>` : ''}</td><td>${esc(o.area)}</td><td>${o.confirmacao === 'pendente' ? 'a confirmar' : 'confirmada'}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (secao === 'arquivo') {
    corpo = `<p class="sutil">Cada arquivo anual capturado é um documento arquivístico digital: tem proveniência, integridade verificável (SHA-256) e trilha de eventos, como pede o e-ARQ Brasil. Quando a PBH publica um arquivo mais completo do mesmo ano, a versão anterior fica guardada como "substituída".</p>
      <div class="rolagem"><table class="dados"><thead><tr><th>Identificador</th><th>Publicado em</th><th>Cobertura</th><th>Arquivo original</th><th>Estado</th><th>Integridade</th></tr></thead><tbody>
      ${D.meta.versoes.map((v) => `<tr><td><b>${esc(v.identificador)}</b><br><span class="mini">classe ${esc(v.codigo_classificacao)} · ${esc(v.temporalidade.destinacao)}</span></td><td>${dataBR(v.data)}</td><td>${esc(v.cobertura_temporal.inicio)} a ${esc(v.cobertura_temporal.fim)}</td><td><a class="mini" href="${esc(v.fonte)}">${esc(v.nome_original)}</a><br><span class="mini">${esc(v.formato)}</span></td><td>${esc(v.estado)}</td><td><span class="hash">${esc(v.sha256)}</span><br><span class="mini">${num(v.extensao_bytes)} bytes · ${v.n_eventos} eventos · último: ${esc(v.ultimo_evento.tipo)} (${esc(v.ultimo_evento.resultado)}) em ${dataBR(v.ultimo_evento.data)}</span></td></tr>`).join('')}
      </tbody></table></div>`;
  } else if (secao === 'gestao') {
    const P = V.plano;
    const linha = (c, nivel = 0) => `<tr><td style="padding-left:${8 + nivel * 16}px"><b>${esc(c.codigo)}</b> ${esc(c.titulo)}${c.exemplos ? `<br><span class="mini">${esc(c.exemplos)}</span>` : ''}</td><td>${esc(c.corrente || '')}</td><td>${esc(c.intermediaria || '')}</td><td>${esc(c.destinacao || '')}</td><td class="mini">${esc(c.justificativa || '')}</td></tr>${(c.subclasses || []).map((s) => linha(s, nivel + 1)).join('')}`;
    corpo = `<p class="sutil">${esc(P.descricao)}</p><div class="rolagem"><table class="dados"><thead><tr><th>Classe</th><th>Fase corrente</th><th>Fase intermediária</th><th>Destinação</th><th>Justificativa</th></tr></thead><tbody>${P.classes.map((c) => linha(c)).join('')}</tbody></table></div>`;
  } else if (secao === 'dados') {
    corpo = `<div class="cartao"><p>Todos os indicadores do site podem ser baixados em JSON. O catálogo segue o vocabulário DCAT do W3C.</p><ul>
      <li><a href="catalogo.jsonld">catalogo.jsonld</a>: catálogo DCAT</li><li><a href="data/geral.json">geral.json</a>: totais e distribuições</li><li><a href="data/servicos.json">servicos.json</a>: indicadores por serviço (detalhe em <code>data/servicos/&lt;id&gt;.json</code>)</li>
      <li><a href="data/temas.json">temas.json</a>, <a href="data/regionais.json">regionais.json</a>, <a href="data/orgaos.json">orgaos.json</a></li><li><a href="data/vocabulario.json">vocabulario.json</a>: taxonomia, tesauro, lista de órgãos, conceitos e plano de classificação</li><li><a href="data/meta.json">meta.json</a>: versões arquivadas</li></ul>
      <p class="mini">Fonte primária: <a href="https://dados.pbh.gov.br/dataset/dados-gerais-das-manifestacoes-processadas-pela-ouvidoria-de-belo-horizonte-no-sistema-bh-digital">Dados gerais das manifestações processadas pela Ouvidoria de Belo Horizonte no Sistema BH Digital</a> (PBH, licença CC BY).</p></div>`;
  } else if (secao === 'limitacoes') {
    corpo = `<div class="cartao"><ul>
      <li><b>O desfecho é o registrado pela Prefeitura.</b> "Atendida" não significa que o cidadão ficou satisfeito, e "arquivada" pode ter motivos legítimos (dados insuficientes, duplicidade, assunto de outro ente).</li>
      <li><b>Os dados param em ${mesAno(D.geral.periodo.fim)}.</b> A PBH não publicou arquivos mais recentes até a geração deste site. O pipeline verifica o portal todo mês e incorpora novos arquivos automaticamente.</li>
      <li><b>Metade das manifestações não informa a regional</b> (${num(L_.sem_regional)} de ${num(L_.manifestacoes)}), e ${num(L_.sem_orgao)} não informam o órgão responsável.</li>
      <li><b>A classificação em temas é automática</b>, por regras sobre o nome do serviço; ${pct(100 * L_.nao_classificados / L_.manifestacoes)} ficam sem classe e alguns casos de fronteira podem estar no tema errado. A regra de cada serviço é pública (vocabulário).</li>
      <li><b>Nomes de serviço mudam entre anos.</b> O controle de autoridade reúne variantes de grafia e os sinônimos declarados; renomeações não declaradas aparecem como serviços separados.</li>
      <li><b>Manifestações em andamento</b> (${num(D.geral.total.em_andamento)}) não entram nas taxas; nos meses mais recentes elas são muitas, o que pode inflar a taxa de atendimento de 2025.</li>
      <li><b>O tempo é "dias em tramitação com a PBH"</b>, como a Ouvidoria calcula; não inclui o tempo até o problema ser resolvido na rua.</li>
      <li><b>Alguns nomes de órgão por extenso estão marcados "a confirmar"</b>: a sigla vem dos dados, o nome foi inferido da estrutura administrativa.</li>
      <li><b>Privacidade:</b> os dados já vêm sem identificação do cidadão; o site não tem login nem coleta dados.</li>
    </ul></div>`;
  }
  app.innerHTML = `<h1>${esc(titulo)}</h1><nav class="sumario-sobre" aria-label="Seções">${SECOES.map(([k, t]) => `<a href="#/sobre/${k}"${k === secao ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>${corpo}`;
  if (secao === 'tesauro') {
    const termos = V.tesauro.termos;
    const porId = new Map(termos.map((t) => [t.id, t]));
    const nome = (id) => porId.get(id)?.termo || id;
    const lista = app.querySelector('#lista-tes');
    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const pintar = (f) => {
      const nf = norm(f);
      const vis = termos.filter((t) => t.campo !== 'servico' || nf).filter((t) => !nf || norm(t.termo).includes(nf) || (t.UP || []).some((u) => norm(u).includes(nf)));
      lista.innerHTML = vis.slice(0, 80).map((t) => `<div class="termo-tes"><b>${esc(t.termo)}</b> <span class="mini">${esc(t.campo)}</span><dl>${t.NE ? `<dt>NE</dt><dd>${esc(t.NE)}</dd>` : ''}${t.UP?.length ? `<dt>UP</dt><dd>${t.UP.map(esc).join('; ')}</dd>` : ''}${t.TG ? `<dt>TG</dt><dd>${esc(nome(t.TG))}</dd>` : ''}${t.TE?.length ? `<dt>TE</dt><dd>${t.TE.slice(0, 25).map((x) => esc(nome(x))).join('; ')}${t.TE.length > 25 ? ` e mais ${t.TE.length - 25}` : ''}</dd>` : ''}</dl></div>`).join('') + (vis.length > 80 ? `<p class="mini">Mostrando 80 de ${vis.length}.</p>` : '');
    };
    app.querySelector('#filtro-tes').addEventListener('input', (ev) => pintar(ev.target.value));
    pintar('');
  }
}

// ------------------------------------------------------------------ roteador
async function rotear() {
  if (mapaAtivo) { mapaAtivo.remove(); mapaAtivo = null; }
  const [caminho, qs] = (location.hash.replace(/^#/, '') || '/').split('?');
  const partes = caminho.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(qs || '');
  try {
    switch (partes[0]) {
      case undefined: viewInicio(); break;
      case 'buscar': viewBuscar(params); break;
      case 'servico': await viewServico(partes[1]); break;
      case 'temas': viewTemas(); break;
      case 'tema': viewTema(partes[1]); break;
      case 'orgaos': viewOrgaos(); break;
      case 'orgao': viewOrgao(partes[1]); break;
      case 'mapa': await viewMapa(params); break;
      case 'regional': viewRegional(partes[1]); break;
      case 'sobre': viewSobre(partes[1]); break;
      default: app.innerHTML = '<p class="vazio">Página não encontrada. <a href="#/">Voltar ao início</a></p>';
    }
  } catch (erro) { console.error(erro); app.innerHTML = `<p class="vazio">Não foi possível carregar esta página (${esc(erro.message)}).</p>`; }
  window.scrollTo(0, 0);
}

function configurarTema() {
  const salvo = ler('tema', null);
  if (salvo) document.documentElement.dataset.theme = salvo;
  document.querySelector('.tema').addEventListener('click', () => {
    const escuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = escuro ? 'light' : 'dark';
    guardar('tema', document.documentElement.dataset.theme);
    rotear();
  });
}

async function iniciar() {
  configurarTema();
  try {
    [D.geral, D.servicos, D.temas, D.orgaos, D.regionais, D.vocab, D.meta] = await Promise.all(
      ['geral', 'servicos', 'temas', 'orgaos', 'regionais', 'vocabulario', 'meta'].map((n) => json(`data/${n}.json`)));
  } catch (erro) {
    app.innerHTML = `<p class="vazio">Não foi possível carregar os dados (${esc(erro.message)}). Se abriu o arquivo direto do disco, rode um servidor local: <code>python -m http.server 8000 --directory web</code>.</p>`;
    return;
  }
  D.docs = Object.values(D.servicos).sort((a, b) => b.n - a.n);
  D.motor = new MotorBusca({ servicos: D.servicos, vocabulario: D.vocab, nomesRegionais: NOMES_REG });
  window.addEventListener('hashchange', rotear);
  rotear();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar();
