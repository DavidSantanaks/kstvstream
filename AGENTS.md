# Orientação para agentes

Leia [AI_MEMORY.md](AI_MEMORY.md) antes de alterar este projeto. Ela registra a arquitetura, o padrão visual, o estado do trabalho e os limites da validação. Atualize-a ao concluir mudanças relevantes, distinguindo o que foi implementado do que foi testado.

## Preferências do projeto

- O usuário autorizou commits das alterações revisadas em 29/10/2026, após a auditoria. Não interpretar essa autorização como permissão permanente para novas tarefas, tags, publicação de releases ou instalação em aparelho. Push e ações remotas devem respeitar o pedido da sessão.
- Preserve as alterações locais existentes. Este checkout contém trabalho anterior ainda sem commit; não reverta nem substitua arquivos inteiros para recuperar uma versão do Git.
- Use português brasileiro na interface e nas respostas.
- Mantenha a identidade KS TV Player e a logo em `public/assets`. Siga o visual escuro inspirado no player Apple: cápsulas discretas, cantos arredondados, controles claros e foco legível. Preserve as funções disponíveis; não acrescente controles Apple decorativos sem implementação.

## Regras de implementação

- `public/` é a fonte da interface. Depois de editar, sincronize os arquivos com `android-firetv/app/src/main/assets/www/`. Confira diferenças antes de sobrescrever cópias que possam conter trabalho independente.
- O player web e o player Android são implementações diferentes. Ajustes em HTML/CSS não alteram os controles nativos de `MainActivity.java`.
- Preserve mouse, toque, teclado e controle remoto. Confira arraste sem clique acidental, rolagem vertical, navegação por setas e retorno de foco após fechar menus/player.
- Evite dependências pesadas, blur contínuo e animações caras em aparelhos de TV. Forneça alternativas CSS para motores antigos quando necessário.
- Não registre credenciais, URLs pessoais de playlists ou dados da sessão em memória, logs, screenshots de teste ou fixtures.

## Verificação e entrega

Execute verificações proporcionais à mudança, consulte os comandos em `AI_MEMORY.md` e comunique limites reais. Análise sintática Java não equivale a APK compilado; testes web com catálogo fictício não validam HLS real ou ExoPlayer no aparelho.
