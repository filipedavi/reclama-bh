# Roteiro de apresentação: abertura, página inicial e origem dos dados

Tempo: 5 minutos. Site aberto em https://filipedavi.github.io/reclama-bh/ antes de começar (dê Ctrl+F5 para garantir a versão atual). Tenha a aba do portal da PBH aberta também: https://dados.pbh.gov.br/dataset/dados-gerais-das-manifestacoes-processadas-pela-ouvidoria-de-belo-horizonte-no-sistema-bh-digital

## 1. O problema (40 s, sem clicar)

"Quem registra uma reclamação na Ouvidoria da Prefeitura não sabe o que vai acontecer: se vai ser atendida, arquivada ou só receber uma orientação, nem quanto tempo leva. A Prefeitura publica os dados de todas as manifestações, mas num formato que só quem domina planilha consegue ler. O Reclama BH transforma esse dado numa resposta simples: para cada serviço, o que esperar antes de reclamar."

## 2. De onde vêm os dados (1 min, mostrar a aba do portal)

- "A fonte é o Portal de Dados Abertos da PBH, o conjunto 'Dados gerais das manifestações processadas pela Ouvidoria no Sistema BH Digital', licença Creative Commons."
- "A Ouvidoria publica um CSV por ano, que vai acumulando dentro do ano: janeiro, depois janeiro a fevereiro, e assim por diante, e cada publicação substitui a anterior. O arquivo de um ano não contém os outros. Por isso pegamos o mais completo de cada ano: dezembro de 2022, 2023 e 2024, e junho de 2025, que é a última publicação. Quatro arquivos, 138.323 manifestações."
- "O arquivo bruto tem 259 mil linhas, porque cada encaminhamento interno vira uma linha; 1.744 grafias de nome de serviço; siglas de órgão sem nome por extenso; nenhum agrupamento por assunto; e cada publicação apaga a anterior, não existe histórico. É um caso típico de organização da informação: precisa de controle de vocabulário, classificação, metadados e preservação."
- "Importante: o portal não publica o texto da manifestação, só campos categóricos. Não há dado pessoal em nada do que usamos."

## 3. A página inicial (1 min 30, voltar ao site)

- Apontar a pergunta "Sobre o que você quer reclamar?": "O site é organizado em torno da pergunta do cidadão, no estilo dos sites de serviço público do governo britânico: texto, listas e espaço, sem painel."
- Digitar **poste apagado** e dar Enter. Apontar "Entendi assim: Subtema Luminária apagada..." e "Busca equivalente: subtema:ILU.MAN". "O cidadão escreve do jeito dele; o tesauro traduz para o vocabulário controlado do sistema e mostra como entendeu. Isso é recuperação da informação com modelo booleano, e é transparente."
- Voltar ao Início. Apontar "Serviços mais reclamados": "Consulta médica na saúde da família é o serviço mais reclamado, 10 mil manifestações, 45% atendidas, resposta em 11 dias." Apontar "Por assunto": "Os 1.670 serviços estão organizados em 17 temas, que é a nossa taxonomia."
- Apontar "Sobre os dados": "Deixamos claro que o desfecho é o que a Prefeitura registrou, não a opinião do cidadão."

## 4. Como funciona por trás (1 min, sem clicar, ou abrir Sobre > O projeto)

"Três programas em Python rodam sozinhos no GitHub todo dia 5: o primeiro consulta o portal, baixa o arquivo novo, calcula o hash SHA-256 e guarda o original em guarda permanente; o segundo limpa, reúne as linhas em uma por manifestação, aplica o controle de autoridade e classifica na taxonomia; o terceiro calcula os indicadores e gera o site. O site é estático, sem servidor, e funciona no celular como aplicativo."

Passar a palavra: "O [nome] vai mostrar a página de serviço e os indicadores, e o [nome] a parte de vocabulário, metadados e arquivo."

## 5. Se perguntarem

- **Por que só até junho de 2025?** É a última publicação da PBH. Quando publicar mais, o pipeline atualiza sozinho.
- **Por que não cruzar com o texto da reclamação?** O portal não publica o texto, só campos categóricos; é limitação do dado.
- **Como a taxonomia foi feita?** Temas a partir das competências da Prefeitura; subtemas a partir dos nomes de serviço; cada subtema tem regras de palavra-chave num JSON, auditável; 1,5% ficam sem classe.
- **Usa inteligência artificial?** A busca principal é por tesauro, sem modelo. Há uma camada opcional, acionada por botão, com um modelo de linguagem pequeno que roda no navegador para sugerir serviços por semelhança quando o tesauro não reconhece a frase. Nada sai do aparelho do usuário.
- **Metade sem regional?** Sim, 51% não informam regional e 35% não informam órgão; os recortes por regional e por órgão são feitos só sobre o que tem informação.
- **"Atendida" significa resolvida?** Não. É o registro da Prefeitura ao encerrar; não temos a avaliação do cidadão.
