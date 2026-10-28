# KS TV-Stream — Fire TV Stick 4K & Web

Player de IPTV minimalista inspirado no **tvOS (Apple TV)**, projetado para ser extremamente leve, rápido e fluido no **Amazon Fire TV Stick 4K** e no navegador.

---

## ✨ Principais Diferenciais

1. **Estética Minimalista estilo Apple TV**:
   - Barra de navegação superior flutuante (`Início`, `TV ao Vivo`, `Filmes`, `Séries`, `Favoritos`, `Busca`, `Conta`).
   - Foco de controle remoto (D-Pad) ultra-rápido a **60 FPS** e pôsteres em proporção de cinema (`2:3`).
2. **Ultra Leve e Rápido (para listas com +75.000 conteúdos)**:
   - Carregamento sob demanda por categoria (`&category_id`) com cache em memória (troca de categorias em `0ms` sem travar a memória da Fire TV).
3. **Player "Clear" (Tela 100% Limpa) + Botão Voltar Inteligente + Mini Player**:
   - Na reprodução de **TV ao Vivo**, **Filmes** e **Séries**, o vídeo roda em tela cheia limpa (*clear*).
   - **1º Clique em VOLTAR (com opções do player visíveis na tela)**: **Some imediatamente com as opções do player**, mantendo o vídeo tocando com a tela 100% limpa (*clear*).
   - **Barra de Progresso Interativa**: Nos filmes e séries, aperte **Cima** para destacar a barra de tempo e use **Esquerda / Direita** para avançar ou retroceder.
4. **3 Opções de Login**:
   - **Servidor + Usuário (Xtream Codes)**: Informe o Servidor, Usuário e Senha da sua lista.
   - **Acesso Rápido**: Informe o DNS/IP e seu Usuário e Senha.
   - **Lista M3U / URL**: Cole sua URL M3U Plus, SSIPTV ou Smart IPTV.

---

## 🚀 Como Usar

### Opção 1: Aplicativo Nativo Fire TV Stick 4K (`.APK` com Media3 ExoPlayer)

O instalador `.apk` pronto para Fire TV Stick / Android TV fica disponível em:
`dist/KS-TV-Stream.apk`

Para compilar o APK ou instalar via ADB em uma Fire TV na mesma rede:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-and-install-firetv.ps1 -InstallToFireTv -FireTvIp "SEU_IP_DA_FIRE_TV:5555"
```

### Opção 2: Web App (No PC ou no Navegador da TV)

Para iniciar o servidor local:

```powershell
node server.js
```

- **No Computador**: Abra `http://localhost:3099`
- **Na TV (mesma rede Wi-Fi)**: Abra o endereço IP local exibido no terminal (ex: `http://192.168.x.x:3099`).
