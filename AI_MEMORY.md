# Memória do projeto — KS TV Player

Última atualização: 29/10/2026. Este arquivo é o ponto de continuidade para agentes que entram no projeto. O código continua sendo a fonte de verdade. Releia os trechos afetados e confira `git status` antes de trabalhar; não assuma que uma anotação histórica descreve uma validação feita após mudanças posteriores.

## Objetivo e direção

Player IPTV pessoal para navegador, Fire TV e Android TV. O usuário quer uma experiência simples, amigável e com estética inspirada no player Apple, preservando as opções que o aplicativo já possui. As referências visuais não exigem uma cópia idêntica.

Preferências explícitas:

- O pedido inicial era trabalhar sem commits. Em 29/10/2026 o usuário autorizou commitar o trabalho revisado e verificar o CI/CD; essa instrução mais recente prevalece para esta etapa. Não publicar releases, criar tags ou instalar em dispositivos por iniciativa própria.
- Usar a logo KS TV Player enviada pelo usuário na interface e nos ícones.
- Manter o mesmo padrão visual nas evoluções, incluindo o player nativo do APK.
- Não perder o contexto entre modelos de agente; manter esta memória atualizada com decisões, estado e pendências reais.

## Arquitetura e mapa de arquivos

| Local | Responsabilidade |
| --- | --- |
| `public/index.html` | Login, navegação, início, catálogos, detalhes e estrutura do player web. |
| `public/app.js` | Estado, login, consultas Xtream/M3U, catálogo/EPG, favoritos/recentes, player web e navegação por foco. JavaScript vanilla dentro de uma IIFE. |
| `public/styles.css` | Base visual e layouts existentes. |
| `public/carousels.css` e `public/carousels.js` | Gesto horizontal nativo e arraste com mouse nas fileiras do início. |
| `public/home.css` | Acabamento do início: acolhimento, composição do destaque, fileiras e navegação em telas pequenas. |
| `public/player.css` | Acabamento do player web e aplicação da logo. Ordem de folhas de estilo: base, carrosséis, início, player. |
| `public/assets/` | Logo, favicon e imagens de ícone web derivadas da arte enviada. |
| `public/vendor/hls.min.js` | HLS.js já incluído no projeto. |
| `server.js` | Servidor Node, arquivos estáticos e proxy de consultas/redirects. Sem instalação de pacotes para iniciar. Porta padrão `3099`, alterável por `PORT`. |
| `android-firetv/app/src/main/java/com/appletv/iptv/firetv/MainActivity.java` | WebView, ponte `AndroidBridge`, reprodução Media3/ExoPlayer, controles nativos, drawer de canais e Mini Player. |
| `android-firetv/app/src/main/assets/www/` | Cópia empacotada de `public/`, não uma segunda fonte independente para novas alterações. |
| `android-firetv/app/src/main/res/` e `AndroidManifest.xml` | Recursos e identificação Android, ícones launcher e banner Fire TV. |
| `scripts/qa-ui.cjs` | Verificação de interface por Chrome/Edge headless via CDP, sem Playwright ou dependências extras. |
| `build-and-install-firetv.ps1` / `.sh` | Sincronização da interface e compilação; instalação é opcional. |
| `dist/KS-TV-Stream.apk` | APK já existente; não presumir que acompanha as últimas alterações de código. |

### Fluxo de dados e reprodução

O login oferece servidor/usuário, acesso rápido e lista M3U. O catálogo é buscado por categoria, usa cache em memória e renderização paginada. Favoritos, sessão e histórico usam `localStorage`; não exponha seu conteúdo porque a sessão pode conter credenciais.

No navegador, as consultas passam por endpoints como `/api/xtream`, `/api/resolve` e `/api/parse-m3u`. A reprodução usa `<video>` e HLS.js quando aplicável. No APK, `startPlayback()` detecta `AndroidBridge.openNativePlayer()` e retorna para o player nativo. Por isso, mudar apenas o OSD HTML/CSS não modifica o player que aparece na TV.

As fileiras “Filmes Mais Assistidos” e “Séries em Alta” são vitrines do catálogo carregado; os nomes não comprovam estatísticas de audiência. O histórico registra itens abertos. Não apresente uma barra de progresso persistido ou uma recomendação personalizada sem implementar o armazenamento ou a lógica correspondentes.

## Identidade visual e comportamento

- Fundo preto/carvão, contraste alto, textos brancos/cinzas, poucas cores de destaque e marca KS TV Player.
- Cápsulas e superfícies escuras com borda fina e brilho discreto. Vídeo/conteúdo devem continuar sendo o foco principal.
- Controles de transporte circulares ao centro; título e tempo/progresso próximos à base; opções agrupadas sem painel pesado cobrindo tudo.
- Textos curtos em português brasileiro. O início deve acolher e ajudar a escolher conteúdo. Evite explicações técnicas como copy de produto.
- Não inserir AirPlay, compartilhamento, InSight, velocidade, áudio ou qualquer outro recurso apenas porque aparece na referência. Cada controle deve executar uma função suportada naquela plataforma.
- Fire TV exige atenção ao desempenho e a motores Chromium/WebView antigos. A base menciona Chromium 78+; não trate isso como compatibilidade já testada em todo aparelho. Evite blur em tempo real e prefira animações de `opacity`/`transform`. Novas funções CSS precisam de alternativas se o motor alvo não as suportar.

### Invariantes de interação

- Arraste horizontal não deve abrir um card ao soltar. Toque deve permitir tanto deslizar a fileira quanto rolar a página verticalmente.
- `carousels.js` usa eventos delegados: funciona após as fileiras serem reconstruídas. O toque mantém a rolagem nativa; mouse usa limiar de gesto e captura do ponteiro.
- `isTouchDragging` deve continuar bloqueando o clique sintético pós-gesto e ser limpo quando uma nova interação real de mouse, teclado ou controle começar.
- Use `setTvFocus()` e respeite `.tv-focused`/`data-focusable`. Um foco válido deve estar visível, ser alcançável por setas e permanecer na área rolável.
- Menus web mantêm foco dentro do diálogo por setas e Tab. Fechar o menu, inclusive tocando fora, devolve o foco a “Mais opções”.
- Trocar variante de qualidade/áudio deve preservar tempo e `state.player.previousFocus`, sem substituir esse retorno por um botão do menu que ficará oculto.
- Ao fechar o player, retornar ao card/botão de origem. No início, preservar navegação entre hero, fileiras e barra superior.
- Voltar/Esc fecha primeiro o menu aberto; depois oculta os controles. Com a tela limpa, outro Voltar minimiza TV ao vivo ou encerra VOD. O nativo também permite abrir canais por OK com a tela limpa.
- No web, abrir o drawer de canais oculta o transporte central; sair da lista pela direita ou pelo fim leva ao play e fecha o drawer. No nativo, preserve a navegação equivalente e o toggle de Canais.
- O aviso de conexão tem camada própria acima do OSD, mas ocupa espaço abaixo do transporte. Não deve bloquear controles, capturar foco ou cobrir o título/timeline. Preserve também sua limpeza e a invalidação de operações assíncronas ao sair do player.

## Estado implementado antes da solicitação atual

- Logo integrada ao login/cabeçalho, favicon e ícone de tela inicial web; launcher Android em múltiplas densidades e banner Fire TV.
- Correção do arraste das fileiras com mouse e toque, incluindo alternância entre formas de entrada.
- Novo visual do player web e nativo com controles circulares, tempo decorrido/restante e opções existentes preservadas.
- No web: menu de qualidade/áudio/legendas, importação SRT/VTT, proporção, tela limpa e encerrar; favoritos/próximo episódio continuam disponíveis quando aplicáveis.
- No nativo: canais anterior/próximo, ±15s, +1 minuto, Mini Player, proporção, tela limpa e encerrar. Não presumir paridade de seletores de faixas com o web.
- Correções de foco de menus, rolagem de opções, variantes e retorno ao catálogo.
- A interface web foi sincronizada em `assets/www` ao final dessa etapa.

## Início e carregamento — implementados

O usuário pediu um aviso de conexão abaixo dos controles, frases leves durante a espera e um início mais amigável, mantendo a estética existente. A lógica permanece em `app.js`, com apresentação do início em `home.css` e carregamento web em `player.css`.

Início:

- Saudação por horário e descrições mais acolhedoras, sem instruções técnicas no texto principal.
- Pôster contido à direita no destaque. O fundo só usa uma imagem de backdrop quando ela está disponível; uma capa pequena não é ampliada para preencher o banner.
- “Seus últimos plays” usa `data-shelf-type="recent-media"`, cards horizontais de 112px de altura para filmes/séries e identificação do tipo de conteúdo. “Seus canais recentes” fica em outra fileira (`recent-live`), eliminando a mistura de alturas.
- Em telas pequenas, o cabeçalho tem duas linhas: marca/status e navegação. Os itens da navegação não quebram texto; a cápsula rola horizontalmente e `setTvFocus()` mantém o item focado dentro da área visível.

Carregamento:

- No web, `showPlayerLoading()`/`hidePlayerLoading()` controlam a classe `is-loading`, o status em camada `z-index: 104` e um único timer. O aviso fica abaixo do transporte e acima do OSD, sem receber eventos de ponteiro. O layout compacto reposiciona o transporte para reservar espaço.
- As frases alternam a cada três segundos: “Mexendo na antena…”, “Limpando a tela…” e “Colocando Bombril na antena…”. O título do status distingue conexão inicial de ajuste do sinal.
- `canplay`/`playing`, `ended`, erro, fechamento, Mini Player e `pagehide` limpam o ciclo web. Uma espera nova pode iniciar outro ciclo; não deixe intervalos duplicados nem frases rodando com o player oculto.
- `state.player.requestId` invalida a resolução assíncrona de stream após fechar ou iniciar outra reprodução. Preserve a checagem antes de anexar a mídia para que uma resposta tardia não reabra o player.
- O nativo possui cartão equivalente abaixo do transporte, frases no mesmo intervalo e limpeza ao terminar o buffering, falhar, fechar, minimizar ou sair do ciclo de vida ativo. Erros usam texto claro e removem spinner/frases de brincadeira.

`AGENTS.md` e esta memória foram adicionados como ponto de continuidade para outros agentes. A implementação foi entregue e a validação está registrada abaixo. Os 12 arquivos da interface em `public/` foram sincronizados com `assets/www` e comparados byte a byte.

## Verificação local e limites conhecidos

Iniciar a interface:

```text
node server.js
```

Abrir `http://localhost:3099`. O projeto não possui um build frontend nem uma suíte padrão `npm test`.

Verificação de sintaxe dos arquivos relevantes:

```text
node --check public/app.js
node --check public/carousels.js
node --check scripts/qa-ui.cjs
git diff --check
```

Com o servidor iniciado e Chrome ou Edge local disponível:

```text
node scripts/qa-ui.cjs
```

Para executar apenas o subconjunto dedicado às alterações de início/carregamento, no PowerShell:

```powershell
$env:QA_SCOPE = 'updates'
node scripts/qa-ui.cjs
Remove-Item Env:QA_SCOPE
```

Sem `QA_SCOPE=updates`, o harness executa o fluxo completo. Não relate o resultado do subconjunto como se ele cobrisse toda a suíte.

O harness requer Node 22+ para `WebSocket` nativo, intercepta APIs Xtream com catálogo fictício e usa WAV local para validar controles HTML de mídia. Salva relatório e capturas em uma pasta temporária exclusiva e encerra o navegador ao final. Nesta atualização, as **23 verificações de regressão** passaram, incluindo arraste, toque, menus, foco, variantes, Back, PiP e layouts de computador/celular. Após o ajuste final do cabeçalho mobile, o subconjunto de início/carregamento passou **10/10**, sem exceções JavaScript. Foram execuções separadas, não uma única execução completa de 33 testes.

O subconjunto confirmou: cabeçalho sem quebras em 390px e foco até Conta; aviso abaixo do transporte nos três formatos de tela, acima do OSD e sem sobrepor o título; rotação das três frases; limpeza ao ficar pronto, falhar, fechar ou entrar no Mini Player; recentes separados e com alturas consistentes. Para testar espera e falha reais no navegador, a fixture usa uma URL WAV única por conexão e segura/libera ou falha a requisição por CDP, evitando que o cache de mídia invalide o teste.

A análise sintática compatível com Java 17 passou novamente após as alterações nativas desta atualização. **Isso não foi uma compilação Android.** O SDK Android não estava disponível no ambiente, portanto o APK existente não foi atualizado. O módulo declara `compileSdk/targetSdk 35` e compatibilidade Java 17; confira as configurações atuais antes de preparar outro ambiente.

Para compilar quando houver JDK/SDK configurados, o script PowerShell aceita execução sem instalação:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-and-install-firetv.ps1
```

Não use as opções de instalação sem autorização do usuário. O script Bash oferece o fluxo equivalente em Linux/macOS.

## Continuidade necessária

1. Validar HLS real e o player nativo em um aparelho com uma fonte fornecida pelo usuário, sem copiar seus dados para fixtures ou documentação.
2. Compilar um APK atualizado quando o SDK estiver disponível e distinguir esse artefato do APK anterior.

## Auditoria de segurança e publicação

Em 29/10/2026 foi criada [docs/AUDITORIA_PUBLICACAO.md](docs/AUDITORIA_PUBLICACAO.md), a pedido do usuário. Foram examinados os arquivos locais, sete commits/63 blobs de texto e os dois APKs distintos do histórico disponível. Não foram encontrados candidatos a credenciais fixas pelos padrões usados; isso não certifica ausência de todos os segredos e não inclui dados de navegador/dispositivo ou configurações remotas do GitHub.

Antes de publicar, consultar os achados: credenciais persistidas em `localStorage`, HTTP/backup/WebView a restringir, proxy aberto a destinos arbitrários confirmado com fixture local, HLS.js sem avisos junto ao bundle, exclusões de licenças/NOTICE no Gradle, badge MIT sem LICENSE, referências a identidades Apple/IPTV Smarters e alegações não comprovadas no README. O APK rastreado é uma saída de debug, e `release` ainda usa assinatura de debug. O `.gitignore` não cobre o APK atual nem arquivos de assinatura particulares.

A auditoria só adicionou documentação: não alterou código, identidade Android, assinatura, `.gitignore`, índice ou histórico Git. Não tratar as correções recomendadas como concluídas. Não escolher licença do código próprio nem migrar `applicationId`/chaves de armazenamento automaticamente. Manter exemplos e futuros relatórios sem valores reais de credenciais ou URLs privadas.

Não há outro roadmap aprovado registrado. Não transformar essas pendências em um redesenho geral, migração de framework ou novos recursos não solicitados.

## Preparação do commit e CI/CD após a auditoria

O usuário autorizou commitar as alterações revisadas e pediu verificação do repositório e do CI/CD; depois reforçou que a tarefa deveria ser concluída. A restrição anterior de não commitar foi revogada para esta etapa.

- O repositório remoto público tem `main` como branch padrão. A consulta inicial à API confirmou o HEAD anterior e nenhuma execução de Actions registrada. Apenas o workflow de release aparecia listado. Proteção de branch e secrets exigem autenticação e não foram verificados; não declarar que estão configurados.
- CI agora inclui `npm run check`, `npm test`, QA de interface por Chrome, actionlint, `assembleDebug` e `lintDebug`. Node 24, Java 17, SDK 35, Gradle 8.14.6 e AGP 8.13.2. Actions fixadas por SHA e downloads auxiliares por checksum. Chrome aceita `QA_BROWSER` Linux e `QA_ARTIFACTS_DIR` para relatórios sem incluir o perfil do navegador no artefato.
- Release usa versão semver numérica validada, `versionCode` crescente, assinatura real via quatro secrets `KS_SIGNING_*`, verificação com apksigner e checksums. Publicação manual vem desligada e não existe fallback debug. Não criar/uploadar uma chave de produção por iniciativa própria.
- Licenças e avisos em `public/licenses/` são empacotados com Android; metadados Android são preservados. O código próprio está `UNLICENSED`, sem impor MIT ao usuário. README descreve limites reais e há `PRIVACY.md`.
- O APK saiu do rastreamento, mantendo-se local. `.local-tools/` e `.qa-results/` são ignorados. Há Java/SDK/actionlint locais de validação em `.local-tools`, sem dependência de diretórios de outros projetos.
- Servidor inicia em loopback (LAN apenas por `HOST` explícito); cabeçalhos usam KS TV Player. Backup/transferência Android têm exclusões e a WebView bloqueia navegação para páginas externas. Credenciais no localStorage e HTTP permanecem limitações documentadas; o backend não está aprovado para exposição pública.
- Ícone adaptativo, textos em recursos Android, desenho sem alocações recorrentes e fullscreen via WindowInsets corrigem achados de lint. As exceções justificadas de lint cobrem apenas recomendações de atualização, orientação de TV e a forma do logotipo legado.

Scripts úteis: `scripts/check-project.cjs`, `scripts/run-ui-qa.cjs`, `scripts/lint-workflows.cjs`, `scripts/sync-web-assets.cjs`, `scripts/release-version.cjs`, `scripts/package-release.cjs` e `scripts/prepare-android-sdk.cjs`. O teste de assinatura local usa uma chave descartável de validação, sem relação com uma chave de produção; esse APK não deve ser publicado como release oficial.

Validação final desta etapa: 31 verificações de interface e dois testes de versão passaram; actionlint e integridade das fontes/assets passaram. `assembleDebug`/`lintDebug` e `assembleRelease`/`lintRelease` passaram com zero ocorrências nos relatórios de lint. A release foi assinada somente com chave descartável, verificada com apksigner e a chave foi removida. O bloqueio da release sem secrets também foi confirmado. Os builds usaram `--warning-mode=fail` sem depreciações Gradle; o SDK local ainda emitiu aviso externo de metadados XML 4/3, sem falha de build/lint. Não confundir esse aviso do ambiente com uma execução de CI remoto aprovada. HLS real/aparelho e assinatura de produção continuam pendentes.

O usuário autorizou explicitamente o push para `main` após o commit `b4f29f0`. Esse commit foi enviado. A primeira execução remota (`40930951935`) passou fontes, testes, actionlint e interface, mas falhou no upload de relatórios: `upload-artifact` exclui a pasta oculta `.qa-results` por padrão. Foi corrigido com `include-hidden-files: true` apenas no upload cujos padrões selecionam JSON/PNG; o perfil Chrome não entra no artefato. Conferir a execução da correção antes de declarar o CI remoto aprovado.
