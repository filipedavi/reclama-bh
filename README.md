# Reclama BH

**O que BH reclama e como a Prefeitura responde.**

Site que organiza os dados abertos das manifestações da Ouvidoria de Belo Horizonte (reclamações, denúncias,
sugestões, elogios e pedidos de orientação) e responde, para cada serviço público: quantas manifestações
foram atendidas, quantas foram arquivadas, quanto tempo a resposta levou e por qual canal reclamar funciona
melhor. Funciona no celular e no PC e pode ser instalado como aplicativo (PWA).

Projeto Aplicado da disciplina Organização e Tratamento da Informação (OTI071), Sistemas de Informação, UFMG, 2026/2.

## Por que existe

A PBH publica os dados, mas num formato que o cidadão não consegue usar: um CSV por ano com uma linha por
encaminhamento (259 mil linhas para 138 mil manifestações), 1.744 grafias de nome de serviço, siglas de órgão
sem nome por extenso, sem agrupamento por assunto e sem histórico (cada publicação substitui a anterior).
O projeto aplica técnicas de organização da informação (controle de autoridade, taxonomia, tesauro,
metadados, gestão arquivística) para transformar isso em respostas simples.

## Estrutura

```
pipeline/                 Python, só biblioteca padrão
  coletar.py              descobre no portal CKAN o arquivo mais completo de cada ano; arquiva com SHA-256 e manifesto
  processar.py            limpeza, controle de autoridade dos serviços, classificação na taxonomia
  indicadores.py          indicadores por serviço, tema, órgão, regional, canal, ano; gera o site e o catálogo DCAT
  executar.py             roda tudo
  fontes.json             de onde vem cada dado
  vocabulario/            taxonomia, tesauro, lista de órgãos, sinônimos de serviços, conceitos, plano de classificação
data/arquivo/manifesto.json   metadados de cada versão arquivada (Dublin Core + PREMIS + classificação)
data/processed/           base limpa (uma linha por manifestação) e relatório de limpeza
data/raw/                 arquivos originais (fora do git; vão para os Releases do GitHub)
web/                      o site (HTML, CSS e JS puros; Leaflet para o mapa das regionais)
docs/etapa1, docs/etapa2  documentos do trabalho (HTML e PDF)
.github/workflows/        verificação mensal do portal e publicação no GitHub Pages
```

## Como rodar

Precisa de Python 3.10 ou mais novo. Nenhuma biblioteca extra.

```bash
python pipeline/executar.py                # baixa os dados (~60 MB), limpa e gera o site
python -m http.server 8000 --directory web
```

Abra http://localhost:8000. O site precisa de um servidor local: abrir o `index.html` direto do disco não carrega os dados.

## Publicar no GitHub

1. Crie um repositório público no GitHub (ex.: `reclama-bh`) e envie esta pasta:

   ```bash
   git init
   git add .
   git commit -m "Reclama BH"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/reclama-bh.git
   git push -u origin main
   ```

   A pasta `data/raw` (60 MB de originais) fica de fora por causa do `.gitignore`; o workflow a recupera sozinho.
2. Em *Settings → Pages*, em *Source*, escolha **GitHub Actions**.
3. Em *Settings → Actions → General → Workflow permissions*, marque **Read and write permissions** (o workflow grava
   o manifesto, cria Releases e publica o site).
4. Em *Actions*, abra o workflow **Atualizar Reclama BH** e clique em **Run workflow**. Na primeira execução ele
   baixa os quatro originais do portal da PBH, confere o SHA-256, guarda cada um como Release e publica o site em
   `https://SEU-USUARIO.github.io/reclama-bh/`.
5. Depois disso, o mesmo workflow roda sozinho no dia 5 de cada mês: se a PBH publicou um arquivo mais completo,
   arquiva o original, recalcula os indicadores e republica o site.

## Definições (resumo)

- **Manifestação**: um número de protocolo. As linhas repetidas (uma por encaminhamento) são reunidas.
- **Taxas** (atendida, orientação, arquivada): calculadas só sobre manifestações **encerradas**.
- **Tempo**: mediana dos "dias em tramitação com a PBH" das encerradas.
- **No prazo**: até 30 dias (Lei nº 13.460/2017); o campo SLA da PBH usa 30 e 60 dias como limites.
- **Tema/subtema**: atribuídos por regras sobre o nome do serviço (`vocabulario/taxonomia.json`); 1,5% ficam sem classe.

Detalhes e limitações na página *Sobre* do site.

## Fonte

[Dados gerais das manifestações processadas pela Ouvidoria de Belo Horizonte no Sistema BH Digital](https://dados.pbh.gov.br/dataset/dados-gerais-das-manifestacoes-processadas-pela-ouvidoria-de-belo-horizonte-no-sistema-bh-digital),
PBH, licença CC BY. Regionais: PBH/BHGeo. Os dados vão até junho de 2025, última publicação da PBH.
