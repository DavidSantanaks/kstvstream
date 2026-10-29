# Auditoria local de segurança e publicação

Data: 29/10/2026. Escopo: checkout local, arquivos ignorados presentes, histórico Git disponível e os dois APKs distintos encontrados no histórico. Nenhum commit, push, publicação, instalação ou alteração de histórico foi realizado. O código e as configurações do app não foram modificados nesta auditoria.

Este é o retrato da auditoria inicial. Após ela, o usuário autorizou correções e commit. Consulte a atualização ao final para distinguir achados históricos de pendências atuais.

## Resultado

Não foram encontrados segredos fixos pelos padrões examinados: senhas preenchidas no login, tokens conhecidos de serviços, chaves privadas, credenciais em URLs ou valores literais de senha/chave. Isso não certifica ausência de todo segredo possível nem libera automaticamente a distribuição.

Há impedimentos concretos para tratar o projeto como pronto para publicação: atribuições/licenças incompletas, assinatura de debug no APK, referências a identidade de terceiros e proteção insuficiente do servidor e dos dados de conexão.

## O que foi examinado

- Inventário de 562 arquivos presentes, incluindo saídas de build e caches ignorados; 300 arquivos classificados como texto foram examinados por padrões. Arquivos binários genéricos não receberam análise completa de conteúdo.
- Os sete commits alcançáveis pelas referências locais e 63 blobs de texto distintos. Não foram buscadas referências adicionais no servidor GitHub.
- Os dois blobs APK distintos no histórico: nomes de entradas, assets de texto e busca de padrões nas strings dos DEX. Não apareceram arquivos de sessão, listas privadas, keystores ou candidatos a segredo nessas buscas. Não houve decompilação completa nem análise forense.
- Remoto Git: endereço HTTPS sem credenciais embutidas. A identidade dos commits usa um endereço `noreply` do GitHub; nenhum endereço pessoal comum foi identificado nos metadados examinados.
- Regras atuais de `.gitignore`, documentação, SVGs de demonstração, dependências declaradas, fluxo de login, armazenamento local, configurações Android e workflows.
- Teste controlado do proxy: apenas um servidor de teste em loopback com resposta fictícia. O proxy alcançou esse destino e respondeu com CORS `*`. Nenhum provedor IPTV ou serviço interno real foi consultado.

Não foram inspecionados o perfil pessoal do navegador, o armazenamento de uma TV/celular, secrets das configurações do GitHub, releases remotas, forks, backups externos ou arquivos fora do projeto. Credenciais inseridas durante o uso podem existir nesses locais mesmo sem aparecer no código.

## Achados de segurança e dados sensíveis

| Prioridade | Evidência local | Consequência e ação indicada |
| --- | --- | --- |
| Alta para hospedagem pública | `server.js`: escuta em `0.0.0.0`, CORS irrestrito e endpoints de proxy que recebem uma URL do cliente, sem autenticação ou bloqueio de destinos internos. O teste em loopback confirmou o comportamento. | Dependendo da rede/firewall, outros clientes podem usar o serviço para acessar destinos a partir da máquina que o executa. Proteger autenticação, origens, destinos/redirects e limites antes de expor à internet. Manter uso local/LAN não transforma o serviço em um backend público seguro. |
| Alta antes de distribuir | `public/app.js`: `sessionCandidate` contém servidor, usuário, senha e eventualmente URL M3U; `saveJson(STORAGE_KEYS.SESSION, state.session)` grava JSON em `localStorage`. | As credenciais são persistidas sem criptografia pelo app. Na WebView ficam no armazenamento do aplicativo; no navegador, no perfil da origem. Código da mesma origem, acesso ao perfil ou mecanismos de backup/debug podem expor esses valores. Implementar armazenamento apropriado por plataforma e informar o usuário sobre persistência/limpeza. Não publicar exportações desse armazenamento. |
| Alta se o provedor usa HTTP | URLs de autenticação e mídia contêm credenciais; `AndroidManifest.xml` permite tráfego sem TLS. A interface aceita servidores HTTP. | Credenciais podem trafegar em texto claro quando o endereço fornecido é HTTP. Com HTTPS, a query continua sensível para o destino e para eventuais logs. Preferir HTTPS, evitar logs com URLs completas e explicar limites de provedores que só suportam HTTP. Não prometer criptografia inexistente. |
| Média/alta antes de distribuir | `AndroidManifest.xml`: `allowBackup="true"`; `MainActivity.java`: acesso universal a partir de arquivos, JavaScript e `AndroidBridge` disponíveis, com `WebViewClient` genérico. | Revisar exclusões de dados sensíveis de backup e restringir a navegação da WebView aos conteúdos esperados. Uma página não confiável não deve herdar a ponte nativa. Não foi demonstrada exploração de uma página externa durante esta auditoria. |
| Média | `.gitignore` ignora `.env`, caches/builds e configurações locais, mas não protege keystores, propriedades de assinatura ou listas particulares por padrão. | Acrescentar regras antes de criar esses arquivos. Nenhum keystore/chave privada/lista real foi encontrado no checkout examinado. A ausência atual não substitui uma regra de prevenção. |
| Distribuição | `dist/KS-TV-Stream.apk` já é rastreado pelo Git; a regra existente ignora outro nome de APK. Ele é idêntico à saída local `app-debug.apk` e contém identificação de certificado Android Debug. `app/build.gradle` também configura `release` com `signingConfigs.debug`. | O APK não revelou credenciais nas buscas, mas é um artefato de teste, anterior às mudanças recentes. Preparar assinatura de produção e gerar um artefato auditado para distribuição. Chaves privadas de assinatura devem ficar fora do Git. A documentação Android distingue certificados de debug e de publicação. [Assinatura de apps](https://developer.android.com/studio/publish/app-signing). |

Os caches e relatórios de build ignorados contêm caminhos locais de máquina e referências a diretórios de desenvolvimento. Não são credenciais de acesso, mas não devem acompanhar o código público. O certificado público presente no APK também não é uma chave privada: o problema encontrado foi o uso de assinatura de debug para distribuição.

## Copyright, marcas e código de terceiros

### Licenças e atribuições: resolver antes de redistribuir

- O bundle identifica **HLS.js 1.5.17**. Não foi encontrado texto de licença/copyright nesse arquivo nem uma licença correspondente ao lado dele. A licença da versão oficial é **Apache-2.0**, com atribuições a Dailymotion e a código derivado de Brightcove. O número de versão sozinho não atesta a integridade/proveniência do bundle. [Licença oficial dessa versão](https://raw.githubusercontent.com/video-dev/hls.js/v1.5.17/LICENSE).
- **Media3 1.6.1** e **OkHttp 4.12.0** também têm licenças Apache-2.0 nas fontes oficiais. Isso permite uso sujeito às condições; não elimina avisos, licença ou eventuais `NOTICE` aplicáveis. [Media3](https://raw.githubusercontent.com/androidx/media/1.6.1/LICENSE), [OkHttp](https://raw.githubusercontent.com/square/okhttp/parent-4.12.0/LICENSE.txt), [condições Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0).
- `android-firetv/app/build.gradle` exclui `META-INF/LICENSE*`, `META-INF/NOTICE*` e `DEPENDENCIES`. Nos APKs examinados não apareceu um conjunto de licenças/atribuições das dependências; há um `NOTICE` específico da lista de sufixos públicos do OkHttp. Organizar os avisos de todas as dependências, inclusive transitivas, e entregá-los com a distribuição. Excluir metadados duplicados não equivale a cumprir as obrigações por outro meio.
- O README mostra um badge **MIT**, mas não há arquivo `LICENSE` do projeto. A licença do código próprio precisa ser definida pelo titular e separada das licenças de terceiros. Esta auditoria não escolheu uma licença em nome do usuário.

Recomendação concreta: preparar `THIRD_PARTY_NOTICES` e cópias das licenças efetivamente aplicáveis, com mecanismo para incluí-las no APK e na distribuição web. A lista completa de dependências transitivas e sua proveniência continua pendente. A Amazon inclui o descumprimento de atribuições open source entre seus exemplos de violações de propriedade intelectual. [Política da Amazon](https://developer.amazon.com/docs/policy-center/intellectual-property.html).

### Identidade e apresentação

- README e `package.json` promovem o design com nomes Apple, Apple TV, tvOS e Liquid Glass. O identificador Android é `com.appletv.iptv.firetv`. Comentários técnicos, identificadores internos e menções referenciais não são, por si, prova de infração, mas a apresentação pública deve destacar **KS TV Player**, sem sugerir vínculo oficial. A Apple estabelece condições para uso referencial de suas marcas e restringe associações indevidas. [Diretrizes de marcas Apple](https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html).
- `server.js` e `MainActivity.java` enviam `User-Agent` identificando **IPTVSmartersPro** e **AppleTV/tvOS**. Isso declara uma identidade de software de terceiros sem autorização documentada no projeto. Recomenda-se um identificador próprio, testando compatibilidade com fontes autorizadas. Não confundir esse header com uma licença para acessar serviços.
- Não foram encontrados arquivos de fontes SF Pro ou um pacote SF Symbols. Os vetores genéricos e ícones Canvas não comprovam cópia de assets Apple. A origem de todos os vetores anteriores não pode ser certificada apenas por seus nomes/comentários. O padrão escuro, botões de reprodução e cápsulas não constituem automaticamente uma infração; evitar uma apresentação confundível e usar arte própria reduz o risco, sem garantir aprovação.
- A logo KS foi fornecida pelo usuário. Não há no repositório documentação sobre titularidade, origem da arte ou pesquisa de disponibilidade da marca. Guardar essa comprovação antes de uso comercial; aparência original ou geração por IA não garante direitos exclusivos.
- A frase com “Bombril” é uma referência adicional de marca, de prioridade menor. Não foi identificada uma infração automática por essa menção. Uma alternativa editorial, caso se queira remover a referência, é “Reforçando a antena…”.

Não renomear `applicationId`, namespace ou chaves de armazenamento automaticamente: isso pode alterar a identidade do aplicativo, interromper atualizações e exigir migração dos dados dos usuários.

### Conteúdo e material de divulgação

- Não foram encontradas listas IPTV reais, filmes ou episódios distribuídos no código examinado. O app recebe uma fonte informada pelo usuário. Isso não demonstra que toda fonte que alguém inserir seja autorizada.
- Os três SVGs em `docs/screenshots/` não carregam imagens externas e usam exemplos conceituais. Os screenshots reais enviados na conversa não foram encontrados entre os arquivos do projeto. Não acrescentar capturas com capas, cenas, logos de emissoras/times ou dados de assinatura sem os direitos/permissões necessários.
- O README promete “100% Livres de Copyright”. Essa garantia não foi comprovada e deve ser substituída por uma descrição factual dos exemplos e sua origem. Nomes como Dolby Atmos/HDR10+ e alegações de HDR/4K, 60 FPS, atraso zero e compatibilidade também precisam corresponder ao que foi efetivamente implementado e validado. Há ainda divergência entre a referência a Android 5.0 no README e `minSdk 24` no código.
- Apresentar o produto como reprodutor para fontes autorizadas, sem promover acesso não autorizado. O Google Play menciona capas de filmes, logos de times e incentivo a streaming infrator entre os exemplos de risco. A Amazon ressalta que um aviso de “não afiliado” não substitui autorização. [Propriedade intelectual no Google Play](https://support.google.com/googleplay/android-developer/answer/9888072?hl=pt-BR), [política da Amazon](https://developer.amazon.com/docs/policy-center/intellectual-property.html).

Não existe uma conclusão jurídica de que este app infringiu direitos, nem uma garantia de que ele será aceito. As regras de revisão da App Store da Apple só se aplicariam a uma distribuição naquela loja; o APK atual deve ser avaliado para Android/Fire TV e para a loja escolhida. O GitHub também tem procedimentos distintos para reclamações de copyright, marca e dados sensíveis. [Política DMCA do GitHub](https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy).

### Privacidade para distribuição em loja

Não foi encontrada uma política de privacidade do aplicativo no repositório. O aviso legal do README trata de conteúdo, não explica o tratamento de credenciais. Documentar armazenamento local, conexões ao provedor escolhido, histórico/favoritos, limpeza e práticas dos componentes terceiros. Preencher os formulários da loja conforme o comportamento real. [Dados do usuário no Google Play](https://support.google.com/googleplay/android-developer/answer/10144311?hl=pt-BR), [informações de privacidade na Amazon](https://developer.amazon.com/docs/app-submission/appstore-privacy-labels.html).

## O que versionar e o que manter local

| Material | Orientação |
| --- | --- |
| Código `public/`, `server.js`, fontes Android, Gradle, scripts e workflows sem segredos | Pode ser versionado, com as adequações de licenças/identidade indicadas. Revisar o conteúdo, não apenas a extensão. |
| `AGENTS.md`, `AI_MEMORY.md` e esta auditoria | Podem ser versionados no estado revisado; não guardar credenciais, nomes de usuário reais ou URLs privadas nesses documentos. |
| Logo e ícones KS | Versionar quando houver direitos de uso da arte e da identidade. |
| Fixtures e ilustrações próprias ou licenciadas | Podem ser versionadas com origem/licença registradas e sem dados reais. |
| HLS.js e outros componentes de terceiros | Podem ser redistribuídos quando cumpridas suas licenças. Incluir os avisos aplicáveis. |
| `gradle-wrapper.jar` e scripts wrapper | São arquivos usuais do projeto. Não aplicar um bloqueio genérico a todo `.jar`; preservar proveniência e avisos do Gradle. |
| `.env` real, chaves privadas, keystores, senhas de assinatura e service accounts | Manter fora do Git e usar armazenamento seguro. Um `.env.example` só pode conter placeholders. |
| `local.properties`, `.gradle/`, `build/`, `node_modules/`, configurações pessoais de IDE | Manter locais. As principais pastas já estão ignoradas. |
| Listas M3U com credenciais, backups de navegador/WebView, bancos de sessão, HAR, logs e exports reais | Não publicar. Uma lista pública/licenciada de teste precisa de revisão própria, não é proibida apenas pela extensão. |
| Screenshots de conteúdo real ou de tela de conta | Não publicar sem revisão dos direitos e remoção de dados de conexão/pessoais. |
| APK/AAB | Preferir artefatos de release auditados, com assinatura e licenças corretas, fora do histórico de fontes. APK não é segredo por definição; o atual é debug e está desatualizado. |

O `.gitignore` atual ignora outro nome de APK, mas **não** `dist/KS-TV-Stream.apk`. Testes com caminhos fictícios também confirmaram ausência de regras para `release-signing.jks`, `release.keystore`, `key.properties` e uma lista privada M3U. As regras não foram alteradas nesta auditoria. Exemplo de proteção a adaptar antes de criar arquivos sensíveis:

```gitignore
*.jks
*.keystore
*.p12
*.pfx
key.properties
keystore.properties
signing.properties
dist/*.apk
dist/*.aab
dist/*.apks
private/
local-data/
playlists-private/
!.env.example
```

Adicionar uma regra não remove um arquivo já rastreado nem suas versões antigas. O APK está nessa situação. Revisar a remoção do rastreamento e a estratégia de releases separadamente; nenhum arquivo foi retirado do índice e nenhum histórico foi reescrito. Se um segredo real vier a ser identificado, revogar/rotacionar a credencial tem prioridade sobre apagar seu texto. [Arquivos ignorados](https://docs.github.com/en/get-started/git-basics/ignoring-files), [remoção de dados sensíveis](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Ordem recomendada antes de publicar

1. Regularizar as licenças e atribuições das dependências e definir a licença do código próprio.
2. Revisar README, metadados e identidade de rede para destacar KS TV e remover alegações sem comprovação.
3. Proteger credenciais e o proxy; restringir a WebView e definir regras de backup/privacidade.
4. Ampliar `.gitignore`, revisar os arquivos preparados para commit e decidir como retirar o APK de debug do rastreamento sem reescrever histórico por impulso.
5. Configurar assinatura de produção fora do Git, validar no aparelho e gerar um novo artefato para a loja escolhida, com divulgação de privacidade e material visual autorizado.

Esses itens são recomendações desta auditoria, não alterações já aplicadas. O relatório é uma revisão técnica com fontes de políticas/licenças; não certifica titularidade de marca, direito sobre conteúdo, ausência de patentes ou aprovação jurídica/de loja.

## Atualização após autorização de correção e commit

- `.gitignore` ampliado para ferramentas locais, relatórios de QA, chaves e artefatos. O APK de debug saiu do índice; seu arquivo local e o histórico anterior foram preservados.
- HLS.js conferido byte a byte com a distribuição oficial 1.5.17; licenças Apache-2.0, HLS.js, MPL-2.0 e avisos adicionados aos assets web/Android. Licenças/NOTICE das dependências Android são mesclados em vez de excluídos. Gradle Wrapper mantém licença no repositório.
- README e descrição do pacote passaram a apresentar KS TV Player, sem o badge MIT e as garantias de copyright/desempenho não comprovadas. O titular ainda precisa definir uma licença aberta caso deseje concedê-la. A identidade Android legada foi preservada para evitar uma migração acidental.
- Headers de rede passaram a identificar KS TV Player. O servidor inicia em loopback; LAN exige `HOST=0.0.0.0`. Isso reduz exposição acidental, mas não converte o proxy em serviço público seguro.
- Backup e transferência dos dados Android excluídos por regras explícitas; navegação remota da WebView bloqueada para proteger a ponte. Armazenamento de credenciais em `localStorage` e compatibilidade com HTTP continuam declarados em `PRIVACY.md`.
- CI verifica fontes/assets/segredos conhecidos, testes, interface, YAML dos workflows, build e lint estrito. Actions fixadas por SHA com runtime Node 24. Release valida versões e exige secrets de assinatura; não há fallback para APK de debug.
- A versão de produção não foi publicada. Não houve verificação jurídica da arte, da marca ou de fontes IPTV e não se declara aprovação de loja. Secrets e regras de proteção remotas não foram inspecionados sem autenticação.

As exceções de lint são delimitadas: disponibilidade de versões mais novas das dependências/ferramentas não torna o build instável por data; o logotipo quadrado legado em API 24/25 e a orientação de TV têm justificativas locais. Erros, demais avisos de lint e depreciações Gradle continuam bloqueantes.

Validação após as correções: 31 testes de interface, dois testes de versões, actionlint, verificação das fontes/assets e os builds/lints debug e release passaram. Os relatórios de lint tiveram zero ocorrências. Foi verificada a assinatura da release com uma chave descartável de teste e confirmado o bloqueio sem assinatura configurada. A chave de teste foi removida e não deve ser reutilizada. O SDK local emitiu aviso de diferença de versão XML (4/3), sem impedir as verificações; não se declara ausência absoluta de mensagens de ferramentas externas nem aprovação de um CI remoto antes de sua execução.
