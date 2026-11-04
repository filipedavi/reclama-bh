// Motor de recuperação da informação do Reclama BH.
//
// Os documentos recuperados são os serviços públicos (cada um com seus indicadores). Modelo booleano
// sobre um índice invertido com dois tipos de entrada:
//  - termos controlados (campo:valor) atribuídos na indexação: tema, subtema, órgão, motivo, tipologia,
//    regional (regionais em que o serviço tem manifestações), com postagem genérica (quem está num
//    subtema também está no tema);
//  - palavras livres do nome do serviço e das variantes de grafia, reduzidas ao singular.
// A busca em linguagem natural traduz a pergunta para essa linguagem usando o tesauro e mostra ao
// usuário como entendeu. Termos de "resultado" (mais demorada, mais arquivada...) viram ordenação.

export const CAMPOS = {
  tema: 'Tema', subtema: 'Subtema', orgao: 'Órgão', motivo: 'Motivo', tipologia: 'Tipo', regional: 'Regional',
  resultado: 'Ordenar por', servico: 'Serviço',
};
const OPERADORES = { and: 'AND', e: 'AND', or: 'OR', ou: 'OR', not: 'NOT', nao: 'NOT' };

export function normalizar(texto) {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9*]+/g, ' ').trim();
}
// Redução de plural do português (passo de plural do RSLP, Orengo e Huyck, 2001), simplificada.
export function radical(p) {
  if (p.length <= 3 || /\d/.test(p)) return p;
  return p.replace(/oes$|aes$/, 'ao').replace(/ais$/, 'al').replace(/eis$/, 'el').replace(/ois$/, 'ol')
    .replace(/ns$/, 'm').replace(/([^aeiou])is$/, '$1il').replace(/s$/, '');
}
const palavras = (t) => normalizar(t).replace(/\*/g, ' ').split(' ').filter(Boolean).map(radical);
const chaveDoTermo = (id) => (id.includes(':') ? id : `subtema:${id}`);

export class MotorBusca {
  constructor({ servicos, vocabulario, nomesRegionais }) {
    this.docs = Object.values(servicos).sort((a, b) => b.n - a.n);
    this.tesauro = vocabulario.tesauro;
    this.termos = new Map(this.tesauro.termos.map((t) => [t.id, t]));
    this.vazias = new Set(this.tesauro.palavras_vazias.map(normalizar));
    this.nomesRegionais = nomesRegionais;
    this.#dicionario();
    this.#indexar();
  }

  #dicionario() {
    this.dic = new Map();
    const add = (forma, id) => {
      const f = normalizar(forma);
      if (!f || this.vazias.has(f)) return;
      if (!this.dic.has(f)) this.dic.set(f, new Set());
      this.dic.get(f).add(id);
    };
    for (const t of this.tesauro.termos) {
      if (t.campo === 'servico') continue;   // os nomes de serviço entram como palavras livres
      add(t.termo, t.id);
      for (const up of t.UP || []) add(up, t.id);
    }
    this.maiorFrase = Math.max(...[...this.dic.keys()].map((k) => k.split(' ').length));
  }

  #indexar() {
    this.invertido = new Map();
    this.livre = new Map();
    this.textos = [];
    const post = (m, k, i) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(i); };
    this.docs.forEach((d, i) => {
      const chaves = [`tema:${d.tema}`, `subtema:${d.subtema}`, `servico:${d.id}`];
      if (d.orgao) chaves.push(`orgao:${d.orgao}`);
      for (const o of d.orgaos || []) if (o !== 'não informado') chaves.push(`orgao:${o}`);
      for (const m of d.motivos || []) chaves.push(`motivo:${m}`);
      for (const t of d.tipologias || []) chaves.push(`tipologia:${t}`);
      for (const r of d.regionais || []) chaves.push(`regional:${r}`);
      chaves.forEach((c) => post(this.invertido, c, i));
      const termo = this.termos.get(`servico:${d.id}`);
      const texto = [d.nome, ...(termo?.UP || []), this.#nomeSub(d.subtema)].join(' ');
      this.textos.push(` ${normalizar(texto)} `);
      new Set(palavras(texto)).forEach((p) => post(this.livre, p, i));
    });
    this.todos = new Set(this.docs.map((_, i) => i));
  }

  #nomeSub(id) { return this.termos.get(`subtema:${id}`)?.termo || ''; }

  rotulo(chave) {
    const [campo, valor] = chave.split(/:(.*)/s);
    const t = this.termos.get(chave);
    if (t) return t.termo;
    if (campo === 'regional') return this.nomesRegionais[valor] || valor;
    if (campo === 'servico') return this.docs.find((d) => d.id === valor)?.nome || valor;
    return valor;
  }

  #porChave(c) { return this.invertido.get(c) || new Set(); }
  #uniao(cs) { const s = new Set(); cs.forEach((c) => c.forEach((i) => s.add(i))); return s; }
  #inter(a, b) { return new Set([...a].filter((i) => b.has(i))); }

  #porPalavra(p) {
    if (p.endsWith('*')) {
      const pref = radical(normalizar(p.slice(0, -1)));
      return this.#uniao([...this.livre].filter(([k]) => k.startsWith(pref)).map(([, v]) => v));
    }
    return this.livre.get(radical(normalizar(p))) || new Set();
  }
  #porFrase(f) {
    const n = ` ${normalizar(f)} `;
    const s = new Set();
    this.textos.forEach((t, i) => { if (t.includes(n)) s.add(i); });
    return s;
  }
  #resolverCampo(campo, valor) {
    const v = normalizar(valor);
    if (campo === 'tema' || campo === 'subtema') {
      const id = valor.toUpperCase();
      if (this.invertido.has(`${campo}:${id}`)) return this.#porChave(`${campo}:${id}`);
    }
    if (campo === 'orgao' && this.invertido.has(`orgao:${valor.toUpperCase()}`)) return this.#porChave(`orgao:${valor.toUpperCase()}`);
    if (campo === 'regional' && this.invertido.has(`regional:${valor.toUpperCase()}`)) return this.#porChave(`regional:${valor.toUpperCase()}`);
    if ((campo === 'motivo' || campo === 'tipologia')) {
      const k = [...this.invertido.keys()].find((c) => c.startsWith(`${campo}:`) && normalizar(c.slice(campo.length + 1)) === v);
      if (k) return this.#porChave(k);
    }
    const ids = [...(this.dic.get(v) || [])].filter((id) => id.split(':')[0] === campo);
    return this.#uniao(ids.map((id) => this.#porChave(id)));
  }

  ehAvancada(q) { return /["()]|\b(AND|OR|NOT|OU|NAO)\b|(^|\s)-\S|\b[a-z]+:\S/.test(q); }

  #tokens(q) {
    const out = [];
    const re = /\s*(\(|\)|"[^"]*"|[a-zA-Zçãéíõ]+:"[^"]*"|-?[^\s()"]+)/g;
    let m;
    while ((m = re.exec(q))) {
      const tk = m[1];
      if (tk === '(' || tk === ')') out.push({ t: tk });
      else if (tk.startsWith('"')) out.push({ t: 'frase', v: tk.slice(1, -1) });
      else if (OPERADORES[normalizar(tk)] && tk === tk.toUpperCase()) out.push({ t: OPERADORES[normalizar(tk)] });
      else if (tk.startsWith('-') && tk.length > 1) { out.push({ t: 'NOT' }); out.push(this.#tokenTermo(tk.slice(1))); }
      else out.push(this.#tokenTermo(tk));
    }
    return out;
  }
  #tokenTermo(tk) {
    const m = tk.match(/^([a-zA-Zçãéíõ]+):(.+)$/);
    if (m && CAMPOS[normalizar(m[1])]) return { t: 'campo', c: normalizar(m[1]), v: m[2].replace(/^"|"$/g, '') };
    return { t: 'palavra', v: tk };
  }

  avaliarBooleana(q) {
    const tk = this.#tokens(q);
    let pos = 0;
    const explic = [];
    const espiar = () => tk[pos];
    const ou = () => { let s = e(); while (espiar()?.t === 'OR') { pos++; s = this.#uniao([s, e()]); } return s; };
    const e = () => {
      let s = nao();
      while (espiar() && espiar().t !== 'OR' && espiar().t !== ')') { if (espiar().t === 'AND') pos++; s = this.#inter(s, nao()); }
      return s;
    };
    const nao = () => {
      if (espiar()?.t === 'NOT') { pos++; const d = nao(); return new Set([...this.todos].filter((i) => !d.has(i))); }
      return atomo();
    };
    const atomo = () => {
      const t = tk[pos++];
      if (!t) return new Set(this.todos);
      if (t.t === '(') { const s = ou(); if (espiar()?.t === ')') pos++; return s; }
      if (t.t === 'campo') { explic.push({ campo: t.c, rotulo: t.v }); return this.#resolverCampo(t.c, t.v); }
      const ids = [...(this.dic.get(normalizar(t.v)) || [])];
      if (t.t === 'frase') { explic.push({ campo: 'frase', rotulo: `"${t.v}"` }); return this.#uniao([this.#porFrase(t.v), ...ids.map((id) => this.#porChave(chaveDoTermo(id)))]); }
      explic.push({ campo: 'palavra', rotulo: t.v });
      return this.#uniao([this.#porPalavra(t.v), ...ids.map((id) => this.#porChave(chaveDoTermo(id)))]);
    };
    return { resultado: tk.length ? ou() : new Set(this.todos), explic };
  }

  // Casamento guloso da frase mais longa do tesauro em cada posição da pergunta.
  interpretar(q) {
    const toks = normalizar(q).split(' ').filter(Boolean);
    const achados = [];
    const livres = [];
    for (let i = 0; i < toks.length;) {
      let casou = false;
      for (let n = Math.min(this.maiorFrase, toks.length - i); n >= 1; n--) {
        const frase = toks.slice(i, i + n).join(' ');
        if (n === 1 && this.vazias.has(frase)) break;
        const ids = this.dic.get(frase);
        if (ids) { achados.push({ frase, ids: [...ids] }); i += n; casou = true; break; }
      }
      if (casou) continue;
      const tok = toks[i++];
      if (!this.vazias.has(tok)) livres.push(tok);
    }
    const porCampo = new Map();
    for (const a of achados) for (const id of a.ids) {
      const campo = id.split(':')[0];
      if (!porCampo.has(campo)) porCampo.set(campo, new Set());
      porCampo.get(campo).add(id);
    }
    if (porCampo.has('subtema') && porCampo.has('tema')) porCampo.delete('tema'); // o subtema já restringe
    const ordenacao = porCampo.get('resultado') ? [...porCampo.get('resultado')][0].split(':')[1] : null;
    porCampo.delete('resultado');
    // A regional não restringe serviços (quase todos têm manifestações em todas); vira só uma indicação.
    const regional = porCampo.get('regional') ? [...porCampo.get('regional')][0] : null;
    porCampo.delete('regional');
    const partes = [];
    const explic = [];
    let resultado = new Set(this.todos);
    for (const [campo, chaves] of porCampo) {
      const lista = [...chaves];
      partes.push(lista.length > 1 ? `(${lista.join(' OR ')})` : lista[0]);
      lista.forEach((c) => explic.push({ campo, rotulo: this.rotulo(c) }));
      resultado = this.#inter(resultado, this.#uniao(lista.map((c) => this.#porChave(c))));
    }
    // Palavras livres: cada uma deve aparecer no nome (AND); se isso zera, cai para OR.
    if (livres.length) {
      const porPalavra = livres.map((p) => this.#porPalavra(p));
      let r = porPalavra.reduce((acc, s) => this.#inter(acc, s), new Set(this.todos));
      let op = 'AND';
      if (!r.size && porCampo.size === 0) { r = this.#uniao(porPalavra); op = 'OR'; }
      const combinado = this.#inter(resultado, r);
      if (combinado.size || porCampo.size === 0) {
        resultado = combinado;
        partes.push(livres.length > 1 && op === 'OR' ? `(${livres.join(' OR ')})` : livres.join(' AND '));
        livres.forEach((p) => explic.push({ campo: 'palavra', rotulo: p }));
      }
      // Se os termos controlados já encontraram algo e as palavras soltas zerariam o resultado
      // ("barulho de bar": 'bar' não está em nome de serviço), as palavras soltas são ignoradas.
    }
    if (ordenacao) explic.push({ campo: 'resultado', rotulo: this.rotulo(`resultado:${ordenacao}`) });
    if (regional) explic.push({ campo: 'regional', rotulo: this.rotulo(regional) });
    return { resultado, explic, consulta: partes.join(' AND '), ordenacao, regional };
  }

  buscar(q, filtros = []) {
    const texto = (q || '').trim();
    let r;
    if (!texto) r = { resultado: new Set(this.todos), explic: [], consulta: '', modo: 'vazia' };
    else if (this.ehAvancada(texto)) r = { ...this.avaliarBooleana(texto), consulta: texto, modo: 'avancada' };
    else r = { ...this.interpretar(texto), modo: 'natural' };
    let ids = r.resultado;
    for (const f of filtros) ids = this.#inter(ids, this.#porChave(f));
    return { ...r, docs: [...ids].sort((a, b) => a - b).map((i) => this.docs[i]) };
  }

  facetas(docs) {
    const conta = (fn) => {
      const m = new Map();
      for (const d of docs) for (const k of [].concat(fn(d)).filter(Boolean)) m.set(k, (m.get(k) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      tema: conta((d) => `tema:${d.tema}`),
      subtema: conta((d) => `subtema:${d.subtema}`),
      orgao: conta((d) => (d.orgao ? `orgao:${d.orgao}` : null)),
      tipologia: conta((d) => (d.tipologias || []).map((t) => `tipologia:${t}`)),
    };
  }
}
