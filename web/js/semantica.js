// Busca por significado (camada opcional da recuperação da informação).
//
// A busca principal (busca.js) é por vocabulário controlado: tesauro + índice invertido, explicável.
// Quando ela não reconhece a pergunta, esta camada compara o SIGNIFICADO da pergunta com o de cada
// serviço usando um modelo de linguagem pequeno (multilingual-e5-small, 118 MB quantizado) que roda
// no próprio aparelho, via Transformers.js (ONNX em WebAssembly). Nada é enviado a servidor algum.
//
// Os vetores dos serviços e dos subtemas foram calculados no pipeline (pipeline/vetores.py) com o mesmo
// arquivo ONNX; aqui só a pergunta é vetorizada. A nota de um serviço combina a similaridade de cosseno
// do seu nome, a do seu subtema (cujo texto, com os sinônimos do tesauro, é mais rico) e um leve peso de
// popularidade, para que serviços raros de nome parecido não passem na frente dos comuns.

const VERSAO_TJS = '4.3.1';
const URL_TJS = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${VERSAO_TJS}`;
export const TAMANHO_MODELO_MB = 118;

export class BuscaSemantica {
  constructor({ servicos, base = 'data/' }) {
    this.servicos = servicos;
    this.base = base;
    this.extrator = null;
    this.carregando = null;
  }

  get pronta() { return !!this.extrator; }

  static jaBaixada() { try { return localStorage.getItem('rbh:modelo') === '1'; } catch { return false; } }

  // Carrega metadados, vetores e o modelo (uma vez; chamadas simultâneas esperam a mesma promessa).
  carregar(aoProgredir = () => {}) {
    if (this.carregando) return this.carregando;
    this.carregando = (async () => {
      const [meta, bin, tjs] = await Promise.all([
        fetch(`${this.base}vetores.json`).then((r) => r.json()),
        fetch(`${this.base}vetores.bin`).then((r) => r.arrayBuffer()),
        import(URL_TJS),
      ]);
      this.meta = meta;
      const todos = new Int8Array(bin);
      const d = meta.dimensao;
      this.vServicos = todos.subarray(0, meta.ids.length * d);
      this.vSubtemas = todos.subarray(meta.ids.length * d);
      this.posSubtema = new Map(meta.subtemas.map((s, i) => [s, i]));
      tjs.env.allowLocalModels = false;
      const arquivos = new Map();
      this.extrator = await tjs.pipeline('feature-extraction', meta.modelo, {
        dtype: 'q8',
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) arquivos.set(p.file, [p.loaded, p.total]);
          if (p.status === 'done') arquivos.set(p.file, [1, 1]);
          const [l, t] = [...arquivos.values()].reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
          aoProgredir({ etapa: p.status === 'ready' ? 'pronto' : 'baixando', fracao: t ? l / t : 0 });
        },
      });
      try { localStorage.setItem('rbh:modelo', '1'); } catch { /* sem armazenamento */ }
      aoProgredir({ etapa: 'pronto', fracao: 1 });
    })();
    this.carregando.catch(() => { this.carregando = null; });
    return this.carregando;
  }

  async buscar(pergunta, { k = 8, kSubtemas = 3 } = {}) {
    if (!this.pronta) await this.carregar();
    const saida = await this.extrator(this.meta.prefixo_consulta + pergunta, { pooling: 'mean', normalize: true });
    const v = saida.data;
    const d = this.meta.dimensao;
    const escala = this.meta.escala;
    const cos = (vet, i) => { let s = 0; const o = i * d; for (let j = 0; j < d; j++) s += vet[o + j] * v[j]; return s / escala; };
    const simSub = this.meta.subtemas.map((id, i) => ({ id, sim: cos(this.vSubtemas, i) }));
    const notas = this.meta.ids.map((id, i) => {
      const doc = this.servicos[id];
      const sim = cos(this.vServicos, i);
      const sub = simSub[this.posSubtema.get(doc.subtema)]?.sim ?? 0;
      return { doc, sim, nota: 0.5 * sim + 0.5 * sub + 0.01 * Math.log10(doc.n + 1) };
    });
    return {
      subtemas: [...simSub].sort((a, b) => b.sim - a.sim).slice(0, kSubtemas),
      servicos: notas.sort((a, b) => b.nota - a.nota).slice(0, k),
      modelo: this.meta.modelo,
    };
  }
}
