# KS TV Player

Reprodutor de mídia para navegador, Fire TV e Android TV. O usuário informa sua própria fonte autorizada via Xtream Codes ou M3U. O projeto não inclui canais, filmes, séries ou assinaturas.

A interface usa HTML, CSS e JavaScript. No navegador, a reprodução utiliza HTMLVideo/HLS.js; no Android, o catálogo usa WebView e o vídeo usa Media3/ExoPlayer. A identidade visual é KS TV Player, sem vínculo com fornecedores de outros players.

## Executar localmente

Use Node.js 22 ou superior. Não é necessário instalar pacotes para iniciar:

```sh
node server.js
```

Abra http://localhost:3099. O servidor escuta apenas em loopback por padrão. Para uso consciente na rede local, defina `HOST=0.0.0.0`; o proxy exige proteção adicional antes de qualquer hospedagem pública. Leia [privacidade](PRIVACY.md) e a [auditoria](docs/AUDITORIA_PUBLICACAO.md).

## Verificar alterações

```sh
node scripts/sync-web-assets.cjs
npm run check
npm test
npm run test:ui
node scripts/lint-workflows.cjs
```

O teste de interface exige Chrome/Chromium e usa catálogo e mídia fictícios. Defina `QA_BROWSER` se o navegador não estiver em um caminho conhecido. Os relatórios são temporários; `QA_ARTIFACTS_DIR` permite escolher uma pasta. As fontes web em `public/` devem corresponder aos assets Android.

## Android

Configure JDK 17 e Android SDK com plataforma 35 e build-tools 35.0.0. O mínimo declarado é API 24 (Android 7). O suporte real à mídia e às resoluções depende da fonte, dos codecs e do aparelho. Não há garantia de desempenho ou HDR para todo dispositivo.

```sh
cd android-firetv
./gradlew :app:assembleDebug :app:lintDebug --warning-mode=fail
```

No Windows, também é possível usar `build-and-install-firetv.ps1` para gerar o APK de teste. A instalação exige a opção explícita do script. APKs de teste não são uma release para loja e ficam fora do Git.

## CI e release

O CI verifica sintaxe, integridade de assets, prevenção básica de segredos, testes de versão, interface, workflows, compilação Android e lint. As Actions têm commits fixados e runtime Node 24.

O workflow de release valida `vMAJOR.MINOR.PATCH`, aplica `versionName` e `versionCode`, gera checksums e verifica a assinatura do APK. Não aceita APK de debug como alternativa. A publicação manual vem desativada; tags `v*` são o gatilho de publicação de uma release assinada.

Antes de executar a release, o responsável deve configurar os quatro secrets no GitHub:

- `KS_SIGNING_KEYSTORE_BASE64`
- `KS_SIGNING_STORE_PASSWORD`
- `KS_SIGNING_KEY_ALIAS`
- `KS_SIGNING_KEY_PASSWORD`

A chave de produção não é gerada nem versionada por este projeto. Sem esses secrets a release falha explicitamente; o CI de debug continua independente deles. Mudanças de chave ou identificador podem impedir atualizações de instalações anteriores e exigem planejamento.

## Direitos e licenças

A licença aberta do código próprio ainda não foi definida pelo titular. A visibilidade do repositório não concede, por si, uma licença geral de redistribuição desse código. O campo `UNLICENSED` do pacote evita declarar uma licença não escolhida.

Os componentes de terceiros mantêm suas licenças. Consulte [avisos](public/licenses/THIRD_PARTY_NOTICES.txt), [Apache-2.0](public/licenses/APACHE-2.0.txt), [HLS.js](public/licenses/hls.js-LICENSE.txt) e [Gradle](licenses/gradle-LICENSE.txt). As licenças web são incluídas nos assets do APK; metadados de licença das dependências Android são preservados.

Os SVGs em `docs/screenshots` são demonstrações conceituais, não um catálogo de obras disponibilizadas pelo app. Não use capas, cenas, logos, listas ou material de terceiros sem os direitos necessários na divulgação ou distribuição. A logo foi fornecida pelo usuário; o responsável pela publicação deve conservar a comprovação dos direitos sobre a arte e a identidade.

O repositório não inclui fontes SF Pro, um pacote SF Symbols, credenciais de provedor ou documentação que comprove licença para conteúdo audiovisual de terceiros. Veja [AI_MEMORY.md](AI_MEMORY.md) para continuidade técnica e limites de validação.
