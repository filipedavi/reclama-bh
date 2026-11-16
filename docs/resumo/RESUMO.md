# Reclama BH em duas páginas

Projeto Aplicado de Organização e Tratamento da Informação (OTI071), UFMG, 2026/2.
Filipe Davi Gomes, Nathan Filipe Izidorio Alves e Victor Cunha Marques.
Site: https://filipedavi.github.io/reclama-bh/ · Código: https://github.com/filipedavi/reclama-bh

## O que é

Um site que responde, para cada serviço da Prefeitura de Belo Horizonte, o que o cidadão pode esperar ao reclamar: quantas manifestações foram atendidas, quantas foram arquivadas, quanto tempo a resposta levou e por qual canal reclamar funciona melhor. Funciona no celular e no computador, não exige cadastro e não coleta dados pessoais.

A matéria-prima é um conjunto de dados que a Prefeitura já publica no Portal de Dados Abertos: todas as manifestações registradas na Ouvidoria (reclamações, denúncias, sugestões, elogios e pedidos de orientação) de janeiro de 2022 a junho de 2025, 138.323 manifestações. O problema é que esse dado vem num formato que só quem domina planilha consegue ler: um CSV por ano, uma linha por encaminhamento (259 mil linhas), 1.744 grafias diferentes de nome de serviço, siglas de órgão sem nome por extenso, nenhum agrupamento por assunto e nenhum histórico, porque cada publicação substitui a anterior.

## Como funciona

Três programas em Python, só com a biblioteca padrão, rodam em sequência no GitHub Actions todo dia 5:

1. **Coleta** (`coletar.py`): consulta a API do portal, identifica o arquivo mais completo de cada ano, baixa o que for novo, calcula o SHA-256 e registra a versão num manifesto. Os originais ficam guardados como *releases* no GitHub, em guarda permanente; a versão substituída não é apagada.
2. **Tratamento** (`processar.py`): reúne as linhas em uma por manifestação, normaliza datas, prazos e situações, aplica o controle de autoridade aos nomes de serviço (1.744 grafias viram 1.670 serviços) e classifica cada serviço na taxonomia.
3. **Indicadores** (`indicadores.py`): calcula, por serviço, tema, órgão, regional, canal e ano, a taxa de atendimento, a de arquivamento, a mediana de dias e a proporção dentro do prazo legal de 30 dias; gera os arquivos JSON do site, o tesauro completo e o catálogo DCAT.

Um quarto programa, opcional (`vetores.py`), gera os vetores semânticos da busca por significado.

O site é HTML, CSS e JavaScript puros, hospedado no GitHub Pages, sem servidor nem banco de dados: ele lê os JSON gerados pelo pipeline. Pode ser instalado como aplicativo e abre sem internet com os últimos dados vistos.

## O que ele faz

- **Busca em linguagem natural**: o cidadão escreve "poste apagado" ou "barulho de bar" e o sistema traduz, pelo tesauro, para o termo controlado (subtema, tema, órgão, motivo, regional), mostra como entendeu ("Entendi assim") e a consulta booleana equivalente, que pode ser editada.
- **Busca avançada**: AND, OR, NOT, parênteses, frase exata, truncamento e campos (`tema:TRA`, `orgao:SLU`), com facetas e ordenação.
- **Busca por significado**: quando o tesauro não reconhece a frase, um modelo de linguagem pequeno (multilingual-e5-small, 118 MB) roda no navegador do usuário e sugere os serviços mais próximos. Nada é enviado a servidor.
- **Página de cada serviço**: indicadores comparados à média da cidade, desfecho ano a ano, canais, motivos, regionais e órgãos que responderam.
- **Navegação** por tema (taxonomia), órgão, regional (mapa) e panorama da cidade, com rankings dos serviços mais arquivados, mais demorados e mais atendidos.
- **Sobre**: metodologia, limitações, taxonomia e tesauro navegáveis, lista de órgãos, arquivo das versões com hash e eventos, plano de classificação e dados abertos do próprio site.

## O que usamos da disciplina

- **Controle de autoridade**: uma forma preferida por serviço, com as variantes de grafia registradas como remissivas (1.744 formas, 1.670 serviços).
- **Classificação e taxonomia**: 17 temas e 68 subtemas construídos por análise de facetas, de cima para baixo a partir das competências da Prefeitura e de baixo para cima a partir dos nomes de serviço; cada subtema tem uma regra de indexação, e 1,5% das manifestações ficam sem classe.
- **Tesauro**: 1.783 termos e 869 formas não preferidas, com as relações clássicas (UP, TG, TE, NE), ligando a linguagem do cidadão ao vocabulário do sistema.
- **Indexação automática e recuperação da informação**: modelo booleano sobre índice invertido, com postagem genérica (quem está no subtema está no tema), redução de plural (RSLP) e tradução da linguagem natural para a linguagem de busca; a camada semântica, por similaridade de vetores, complementa sem substituir.
- **Metadados**: descrição em Dublin Core, preservação em PREMIS (fixidez e eventos) e catálogo em DCAT para os dados abertos do site.
- **Gestão arquivística**: plano de classificação, tabela de temporalidade (originais em guarda permanente), manifesto com hash SHA-256 e trilha de eventos (captura, verificação, substituição, restauração).

## Limites que vale dizer

O desfecho de cada manifestação é o que a Prefeitura registrou, não a avaliação do cidadão. A Prefeitura não publica o texto da manifestação, só campos categóricos, então não há como cruzar com a descrição. Metade das manifestações não informa regional e um terço não informa o órgão. Os dados vão até junho de 2025, última publicação; quando a Prefeitura publicar mais, o pipeline atualiza sozinho.
