# Roteiro de teste do Reclama BH

Para conferir, em uns 20 minutos, se tudo funciona e se os números batem com os documentos. Marque cada item.

## 0. Preparar

- [ ] Copiar a pasta `reclama-bh` para o computador de teste (a subpasta `data/raw` pode ficar de fora).
- [ ] Abrir um terminal dentro da pasta e rodar:
  - Ubuntu/macOS: `bash abrir-site.sh`
  - Windows: dois cliques em `abrir-site.bat` (precisa do Python instalado)
- [ ] O navegador abre em http://localhost:8000 e a página inicial carrega sem a mensagem "Não foi possível carregar os dados".

Se der erro de dados, é porque o `index.html` foi aberto direto do disco em vez de pelo servidor.

## 1. Página inicial

- [ ] O título diz "Antes de reclamar, veja o que esperar da Prefeitura".
- [ ] Os quatro números do topo são: **138.323** manifestações, **37%** atendidas, **23%** arquivadas, **11 dias** de mediana (82% dentro de 30 dias).
- [ ] A barra "Como a Prefeitura responde" mostra 37 / 36 / 23 / 4.
- [ ] O gráfico "Ano a ano" tem 2022 a 2025 e a tabela abaixo dele abre em "Ver tabela".
- [ ] Em "O que mais se reclama", Saúde é o primeiro (37.620) e abre a página do tema ao clicar.
- [ ] Nos rankings: "Coleta de Lixo Domiciliar" aparece em "Mais arquivados" (72%); "Denúncias de Violação de Direitos Humanos" em "Mais demorados" (81 dias); "Agendamento de tratamento especializado" em "Mais atendidos" (81%).
- [ ] Clicar no botão de tema (lua, canto superior direito) alterna claro/escuro e os gráficos continuam legíveis.

## 2. Busca em linguagem natural

Digite cada frase na caixa da página inicial e confira o que o site diz em "Entendi assim":

| Digitar | Deve entender como | Resultados esperados |
|---|---|---|
| `poda de árvore` | Subtema Poda de árvore | 4 serviços; o primeiro é "Árvore – Poda de Árvore em Passeios, Praças, Etc" |
| `poste apagado` | Subtema Luminária apagada, quebrada ou piscando | serviços de iluminação pública |
| `barulho de bar` | Subtema Barulho e poluição sonora | "Poluição Sonora - Fiscalização" entre eles |
| `cachorro abandonado` | Subtema Cães, gatos e maus-tratos | "Castração de Cães e Gatos", "Recolhimento de Cães Abandonados…" |
| `buraco na rua` | Subtema Buracos e asfalto | "Tapa-Buraco", "Via Pública - Recapeamento" |
| `vaga na creche` | Subtema Creches e educação infantil | serviços de creche |
| `iptu` | Subtema IPTU | ~19 serviços |
| `o que mais demora` | Ordenar por: Mais demorada | lista já ordenada por tempo; aviso de "pelo menos 200 manifestações" |
| `o que mais é arquivado` | Ordenar por: Mais arquivada | "Coleta de Lixo Domiciliar" no topo |
| `reclamação de ônibus no barreiro` | Subtema Ônibus… + Regional Barreiro | aviso com link para a página da regional |

- [ ] Em cada busca aparece a linha "Busca equivalente: …" com a consulta booleana (ex.: `subtema:ARV.POD`). Clicar nela repete a busca em modo avançado.

## 3. Busca avançada (booleana)

Abra "Busca avançada: operadores e campos" na página de busca e teste:

| Consulta | Esperado |
|---|---|
| `tema:TRA AND orgao:BHTRANS` | ~139 serviços de transporte respondidos pela BHTRANS |
| `subtema:ARV.POD OR subtema:ARV.COR` | poda + corte de árvores |
| `motivo:"Descumprimento de Prazo" -tema:SAU` | serviços com reclamação de prazo, fora da Saúde |
| `"boca de lobo"` | ~10 serviços com a frase exata |
| `arvo*` | tudo que começa com "arvo" (árvore, árvores) |
| `tema:LIM NOT subtema:LIM.COL` | limpeza urbana sem coleta de lixo |

- [ ] Os filtros da esquerda (tema, subtema, órgão, tipo) reduzem a lista e aparecem como "chips" removíveis.
- [ ] O seletor "Ordenar" muda a ordem (mais reclamados, mais atendidos, menos atendidos, mais arquivados, mais demorados, mais rápidos).
- [ ] No celular (ou janela estreita), o botão "Filtros" abre os filtros.

## 4. Página de um serviço

Abra "Reclamação de Ônibus (Transporte Coletivo)" (busque `ônibus`).

- [ ] Quatro números: **2.247** manifestações, **11%** atendidas (−27 p.p. vs. média), **64%** arquivadas, **2 dias** de mediana.
- [ ] "Por onde reclamar": canal com maior taxa de atendimento é o Portal (17%); a tabela mostra Portal Mobile com 74% arquivadas.
- [ ] "Por que as pessoas reclamam": Irregularidade em primeiro.
- [ ] Tabela "Por regional" com as nove regionais e "Não informada".
- [ ] Tabela "Por órgão que respondeu": linhas do BHTRANS, SUOUVI e SUMOB com link para a página do órgão.
- [ ] Gráfico "Manifestações por mês" no fim.
- [ ] O botão "☆ Marcar" vira "★ Marcado" e continua marcado ao recarregar a página (fica só no navegador).
- [ ] O selo "1 grafia reunida" ao lado do órgão mostra, ao passar o mouse, o outro nome que a PBH usou.

Abra também "Árvore – Poda de Árvore em Passeios, Praças, Etc": 2.426, 53% atendidas, 38 dias, 45% no prazo.

## 5. Temas, órgãos e regionais

- [ ] Menu **Temas**: 17 cartões com barra de desfecho; o maior é Saúde.
- [ ] Clicar em "Transporte e trânsito": tabela de subtemas (Ônibus, Multas, Táxi, Estacionamento, Sinalização) e lista dos serviços do tema.
- [ ] Menu **Órgãos**: tabela com ~44 siglas; clicar no cabeçalho "Atendidas" ordena; SMSA é a maior em manifestações.
- [ ] Clicar em "SUCOR": página do órgão com temas e serviços (denúncias sobre servidores).
- [ ] Menu **Regionais**: mapa com as nove regionais coloridas e os nomes; as abas (Atendidas, Arquivadas, Tempo mediano, No prazo) recolorem o mapa; clicar numa regional abre sua página.
- [ ] Na tabela ao lado, "Não informada" tem 71.024 manifestações (51%): essa limitação está declarada no texto.

## 6. Seção "Sobre" (é onde está a disciplina)

- [ ] **O projeto**: descreve o pipeline com os números da limpeza (259.033 linhas → 138.323 manifestações; 1.744 grafias → 1.670 serviços).
- [ ] **Conceitos**: 15 conceitos com definição e definição operacional.
- [ ] **Taxonomia**: árvore com 17 temas e 69 subtemas, com contagens; mais as facetas motivo, grupo prioritário e tipologia.
- [ ] **Tesauro**: digitar `buraco` mostra o termo "Buracos e asfalto" com a lista UP; digitar `poda` mostra também os serviços (TE).
- [ ] **Lista de órgãos**: siglas com nome por extenso; algumas marcadas "a confirmar".
- [ ] **Arquivo de versões**: quatro arquivos (2022-12, 2023-12, 2024-12, 2025-06) com data de publicação, SHA-256, tamanho e último evento.
- [ ] **Gestão arquivística**: plano de classificação com prazos e destinação.
- [ ] **Dados abertos**: os links de `catalogo.jsonld` e dos JSON abrem (o navegador mostra o conteúdo).
- [ ] **Limitações**: lista com os dados parando em jun/2025, metade sem regional etc.

## 7. Celular

- [ ] Abrir o mesmo endereço no celular (na mesma rede Wi-Fi, usando o IP do computador em vez de `localhost`, ex.: `http://192.168.0.10:8000`), ou estreitar a janela do navegador.
- [ ] O menu vira uma linha rolável, os cartões empilham, nada fica cortado na horizontal.
- [ ] No Chrome do celular, "Adicionar à tela inicial" instala como aplicativo (ícone azul com balão).

## 8. Pipeline (opcional, precisa de internet; ~5 min)

Na pasta do projeto:

```bash
python3 pipeline/coletar.py --verificar   # confere o SHA-256 dos arquivos arquivados: deve imprimir "ok" para os quatro
python3 pipeline/executar.py              # baixa, limpa e regera o site; a última linha diz "site: 138323 manifestações, 1670 serviços…"
```

- [ ] `coletar.py` informa "sem novidade" para cada ano (ou arquiva uma versão nova, se a PBH tiver publicado).
- [ ] `data/processed/limpeza.json` existe e traz `"manifestacoes": 138323`.

## 9. Documentos

- [ ] `docs/etapa1/Projeto Aplicado - Reclama BH - Etapa 1.pdf`: 8 páginas; numeração começa na página 3; Tabela 1 com os sete serviços.
- [ ] `docs/etapa2/Projeto Aplicado - Reclama BH - Etapa 2.pdf`: 26 páginas; sumário bate com as páginas; Figuras 2 (pipeline) e 3 (ER) legíveis; capturas do site nas Figuras 4 a 8.
- [ ] Os números citados nos PDFs são os mesmos do site (itens 1 e 4 acima).

## Se algo falhar

- Página em branco ou "Não foi possível carregar": o site foi aberto sem servidor. Use o script ou `python3 -m http.server 8000 --directory web`.
- Mapa das regionais vazio: sem internet o mapa ainda funciona (não usa tiles); se continuar vazio, veja o console do navegador (F12) e me mande o erro.
- Busca não entende uma palavra: ela cai em busca por palavra no nome do serviço. Para incluir um sinônimo novo, edite `pipeline/vocabulario/tesauro_base.json` e rode `python3 pipeline/indicadores.py`.
