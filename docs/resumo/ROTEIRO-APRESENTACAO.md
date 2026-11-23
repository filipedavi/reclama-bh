# Roteiro de apresentação: abertura, página inicial e origem dos dados

Tempo: 5 minutos. Cada afirmação vem com "Conferir:", que diz onde ela pode ser verificada, no site, no repositório ou no portal da PBH. Os números foram conferidos em 23/11/2026 nos arquivos gerados pelo pipeline.

Abra antes de começar, em abas separadas:

- Site: https://filipedavi.github.io/reclama-bh/ (Ctrl+F5 para garantir a versão atual)
- Portal da PBH: https://dados.pbh.gov.br/dataset/dados-gerais-das-manifestacoes-processadas-pela-ouvidoria-de-belo-horizonte-no-sistema-bh-digital
- Repositório: https://github.com/filipedavi/reclama-bh

## 1. O problema (40 s, sem clicar)

"Quem registra uma reclamação na Ouvidoria da Prefeitura não sabe o que vai acontecer: se vai ser atendida, arquivada ou só receber uma orientação, nem quanto tempo leva. A Prefeitura publica os dados de todas as manifestações, mas num formato que só quem domina planilha consegue ler. O Reclama BH transforma esse dado numa resposta simples: para cada serviço, o que esperar antes de reclamar."

Conferir: a página inicial do site mostra, em cada serviço da lista "Serviços mais reclamados", a porcentagem atendida e os dias de resposta. Em Sobre > O projeto está o mesmo problema escrito.

## 2. De onde vêm os dados (1 min, mostrar a aba do portal)

"A fonte é o Portal de Dados Abertos da PBH, o conjunto 'Dados gerais das manifestações processadas pela Ouvidoria no Sistema BH Digital', licença Creative Commons."

Conferir: a aba do portal. A licença aparece na lateral da página do conjunto. No site, Sobre > Dados abertos e Sobre > Arquivo de versões citam a fonte com o link.

"A Ouvidoria publica um CSV por ano, que vai acumulando dentro do ano: janeiro, depois janeiro a fevereiro, e assim por diante, e cada publicação substitui a anterior. O arquivo de um ano não contém os outros. Por isso pegamos o mais completo de cada ano: dezembro de 2022, 2023 e 2024, e junho de 2025, que é a última publicação. Quatro arquivos, 138.323 manifestações."

Conferir: no portal, a lista de recursos do conjunto mostra os arquivos mensais por ano, o último sendo o de 2025 até junho. No site, Sobre > Arquivo de versões lista as quatro versões usadas, com o período coberto no título ("2022 (janeiro a 12)", "2025 (janeiro a 06)"), data de publicação, data de captura e hash. No repositório, os quatro originais estão em Releases (ouvidoria-bh-2022-12, 2023-12, 2024-12, 2025-06). O total de 138.323 está no Panorama e em Sobre > Limitações.

"O arquivo bruto tem 259 mil linhas, porque cada encaminhamento interno vira uma linha; 1.744 grafias de nome de serviço; siglas de órgão sem nome por extenso; nenhum agrupamento por assunto; e cada publicação apaga a anterior, não existe histórico. É um caso típico de organização da informação: precisa de controle de vocabulário, classificação, metadados e preservação."

Conferir: Sobre > Limitações traz os números da limpeza: 259.033 linhas lidas, 120.710 repetidas, 138.323 manifestações, 1.744 grafias que viram 1.670 serviços. Sobre > Lista de órgãos mostra as siglas e o nome por extenso que nós atribuímos. Para ver o bruto, baixe um CSV do release e abra: tem colunas de sigla sem nome e nenhuma coluna de tema.

"Importante: o portal não publica o texto da manifestação, só campos categóricos. Não há dado pessoal em nada do que usamos."

Conferir: as colunas do CSV bruto (abrir qualquer arquivo do release). Não há coluna de descrição, nome, CPF ou e-mail.

## 3. A página inicial (1 min 30, voltar ao site)

Apontar a pergunta "Sobre o que você quer reclamar?". "O site é organizado em torno da pergunta do cidadão, no estilo dos sites de serviço público do governo britânico: texto, listas e espaço, sem painel."

Conferir: https://www.gov.uk, para quem quiser comparar a estrutura.

Digitar **poste apagado** e dar Enter. Apontar "Entendi assim: Subtema Luminária apagada" e "Busca equivalente: subtema:ILU.MAN". "O cidadão escreve do jeito dele; o tesauro traduz para o vocabulário controlado do sistema e mostra como entendeu. Isso é recuperação da informação com modelo booleano, e é transparente."

Conferir: Sobre > Tesauro, procurar "poste": aparece como forma não preferida (UP) do subtema Luminária apagada, código ILU.MAN. Sobre > Taxonomia mostra o subtema dentro do tema Iluminação. No repositório, o arquivo pipeline/vocabulario/taxonomia.json tem a regra de palavras do subtema ILU.MAN.

Voltar ao Início. Apontar "Serviços mais reclamados": "Consulta médica na saúde da família é o serviço mais reclamado: 10.303 manifestações, 45% atendidas, resposta mediana de 11 dias."

Conferir: é o primeiro item da lista na página inicial; clicar abre a página do serviço com esses números e a comparação com a média da cidade.

Apontar "Por assunto": "Os 1.670 serviços estão organizados em 17 temas, que é a nossa taxonomia."

Conferir: a seção "Por assunto" da página inicial lista os 17 temas. Sobre > Taxonomia mostra temas e subtemas com a quantidade de serviços em cada um.

Apontar "Sobre os dados": "Deixamos claro que o desfecho é o que a Prefeitura registrou, não a opinião do cidadão."

Conferir: o texto está na própria página inicial e, com mais detalhe, em Sobre > Limitações ("Atendida" não significa que o cidadão ficou satisfeito).

## 4. Como funciona por trás (1 min, sem clicar, ou abrir Sobre > O projeto)

"Três programas em Python rodam sozinhos no GitHub todo dia 5: o primeiro consulta o portal, baixa o arquivo novo, calcula o hash SHA-256 e guarda o original em guarda permanente; o segundo limpa, reúne as linhas em uma por manifestação, aplica o controle de autoridade e classifica na taxonomia; o terceiro calcula os indicadores e gera o site. O site é estático, sem servidor, e funciona no celular como aplicativo."

Conferir, item por item:

- Os três programas: pasta pipeline do repositório (coletar.py, processar.py, indicadores.py). Há um quarto, vetores.py, opcional, da busca por significado.
- Todo dia 5: arquivo .github/workflows/atualizar.yml, linha com `cron: "0 9 5 * *"` (6h de Brasília). A aba Actions do repositório mostra as execuções, todas concluídas com sucesso em 1 a 2 minutos.
- Hash SHA-256 e guarda permanente: Sobre > Arquivo de versões mostra o hash de cada versão, a destinação (guarda permanente) e os eventos de captura e verificação. Os originais estão na aba Releases do repositório. Sobre > Gestão arquivística tem o plano de classificação com fases e destinação de cada classe.
- Controle de autoridade: Sobre > Limitações (1.744 grafias, 1.670 serviços). Na página de um serviço que teve mais de uma grafia aparece "N grafias reunidas"; passar o mouse mostra as grafias originais.
- Site estático: o repositório não tem servidor nem banco; a pasta web tem HTML, CSS, JavaScript e os JSON em web/data. Sobre > Dados abertos lista esses JSON para download.
- Aplicativo no celular: ao abrir o site no celular, o navegador oferece "Adicionar à tela inicial". Instalado, abre sem internet com os últimos dados vistos. No repositório: web/manifest.webmanifest e web/sw.js.

Ressalva para não exagerar: o pipeline roda todo dia 5, mas os dados só mudam quando a PBH publicar arquivo novo. Desde o início do projeto o portal continua em junho de 2025, então as execuções têm terminado sem nada a atualizar.

Passar a palavra: "O [nome] vai mostrar a página de serviço e os indicadores, e o [nome] a parte de vocabulário, metadados e arquivo."

## 5. Se perguntarem

- **Por que só até junho de 2025?** É a última publicação da PBH. Quando publicar mais, o pipeline atualiza sozinho. Conferir: a lista de recursos no portal termina em 2025 até junho.
- **Por que não pegar só o último arquivo, se é acumulado?** Porque o acúmulo é dentro do ano: o arquivo de junho de 2025 só tem 2025. Conferir: Sobre > Arquivo de versões, o título de cada versão diz o período coberto.
- **Por que não cruzar com o texto da reclamação?** O portal não publica o texto, só campos categóricos; é limitação do dado. Conferir: colunas do CSV bruto no release.
- **Como a taxonomia foi feita?** Temas a partir das competências da Prefeitura; subtemas a partir dos nomes de serviço; cada subtema tem regras de palavra-chave num JSON, auditável; 1,5% das manifestações ficam sem classe (2.136 de 138.323). Conferir: pipeline/vocabulario/taxonomia.json no repositório; Sobre > Limitações para a quantidade sem classe.
- **Usa inteligência artificial?** A busca principal é por tesauro, sem modelo. Há uma camada opcional, acionada por botão, com um modelo de linguagem pequeno que roda no navegador para sugerir serviços por semelhança quando o tesauro não reconhece a frase. Nada sai do aparelho do usuário. Conferir: na busca, o botão "Por significado" abaixo dos resultados; Sobre > O projeto, seção "Como a busca funciona"; web/js/semantica.js no repositório.
- **Metade sem regional?** 71.024 manifestações (51%) não informam regional e 48.410 (35%) não informam órgão; os recortes por regional e por órgão são feitos só sobre o que tem informação. Conferir: Sobre > Limitações; a página Regionais repete o aviso.
- **"Atendida" significa resolvida?** Não. É o registro da Prefeitura ao encerrar; não temos a avaliação do cidadão, e o prazo não inclui o tempo até o problema ser resolvido na rua. Conferir: Sobre > Limitações.
- **Quem fez o quê?** O código do site e do pipeline foi escrito com apoio de um assistente de IA. As decisões de organização da informação (fonte, taxonomia, tesauro, critérios de classificação, estrutura do site, revisão dos resultados) foram do grupo.
