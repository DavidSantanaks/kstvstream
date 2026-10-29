#!/usr/bin/env bash
# ==============================================================================
# KS TV-Stream — Compilador e Instalador para Fire TV Stick 4K & Android TV (Linux)
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IPTV_ROOT="$SCRIPT_DIR"

INSTALL_TO_DEVICE=false
TARGET_IP="${FIRETV_IP:-}"

print_usage() {
    cat <<EOF
Uso: $(basename "$0") [OPÇÕES]

Opções:
  -i, --install             Instala o APK compilado no dispositivo via ADB
  --ip <IP:PORTA>           Endereço IP da Fire TV / Android TV (ex: 192.168.1.50:5555)
  -h, --help                Exibe esta ajuda

Exemplos:
  # Apenas compilar o APK:
  ./$(basename "$0")

  # Compilar e instalar em uma Fire TV ou Android TV pela rede:
  ./$(basename "$0") --install --ip 192.168.1.100:5555

  # Compilar e instalar em dispositivo conectado via USB / ADB padrão:
  ./$(basename "$0") --install
EOF
}

# Processamento de argumentos
while [[ $# -gt 0 ]]; do
    case "$1" in
        -i|--install)
            INSTALL_TO_DEVICE=true
            shift
            ;;
        --ip|--firetv-ip)
            TARGET_IP="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Opção desconhecida: $1"
            print_usage
            exit 1
            ;;
    esac
done

echo -e "\033[1;36m==> [1/4] Sincronizando interface KS TV-Stream (public -> android-firetv/assets/www)...\033[0m"
DEST_ASSETS="$IPTV_ROOT/android-firetv/app/src/main/assets/www"
mkdir -p "$DEST_ASSETS"

if command -v rsync >/dev/null 2>&1; then
    rsync -av --delete "$IPTV_ROOT/public/" "$DEST_ASSETS/"
else
    rm -rf "$DEST_ASSETS"/*
    cp -r "$IPTV_ROOT/public/"* "$DEST_ASSETS/"
fi

echo -e "\033[1;36m==> [2/4] Verificando ambiente de compilação (Java & Android SDK)...\033[0m"

# Auto-detecção de JAVA_HOME se não configurado
if [ -z "$JAVA_HOME" ]; then
    for cand in \
        "/usr/lib/jvm/default-java" \
        "/usr/lib/jvm/java-17-openjdk-amd64" \
        "/usr/lib/jvm/java-17-openjdk" \
        "/usr/lib/jvm/java-11-openjdk-amd64" \
        "/usr/lib/jvm/java-11-openjdk"; do
        if [ -d "$cand" ]; then
            export JAVA_HOME="$cand"
            break
        fi
    done
fi

# Auto-detecção de ANDROID_HOME se não configurado
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    for cand in \
        "$HOME/Android/Sdk" \
        "$HOME/android-sdk" \
        "/usr/lib/android-sdk" \
        "/opt/android-sdk"; do
        if [ -d "$cand" ]; then
            export ANDROID_HOME="$cand"
            export ANDROID_SDK_ROOT="$cand"
            break
        fi
    done
fi

if [ -n "$JAVA_HOME" ]; then
    export PATH="$JAVA_HOME/bin:$PATH"
fi
if [ -n "$ANDROID_HOME" ]; then
    export PATH="$ANDROID_HOME/platform-tools:$PATH"
fi

echo -e "\033[1;36m==> [3/4] Compilando APK KS TV-Stream com Gradle...\033[0m"
cd "$IPTV_ROOT/android-firetv"
chmod +x ./gradlew
./gradlew assembleDebug --no-daemon

BUILT_APK="$IPTV_ROOT/android-firetv/app/build/outputs/apk/debug/app-debug.apk"
DIST_DIR="$IPTV_ROOT/dist"
DIST_APK="$DIST_DIR/KS-TV-Stream.apk"

if [ ! -f "$BUILT_APK" ]; then
    echo -e "\033[1;31mErro: APK não foi encontrado após o build ($BUILT_APK).\033[0m"
    exit 1
fi

mkdir -p "$DIST_DIR"
cp "$BUILT_APK" "$DIST_APK"
echo -e "\033[1;32m==> [4/4] APK gerado com sucesso em: $DIST_APK\033[0m"

# Instalação opcional via ADB
if [ "$INSTALL_TO_DEVICE" = true ]; then
    ADB_BIN="adb"
    if [ -n "$ANDROID_HOME" ] && [ -x "$ANDROID_HOME/platform-tools/adb" ]; then
        ADB_BIN="$ANDROID_HOME/platform-tools/adb"
    fi

    if ! command -v "$ADB_BIN" >/dev/null 2>&1; then
        echo -e "\033[1;31mAviso: 'adb' não foi encontrado no PATH. Instale o pacote android-tools ou configure ANDROID_HOME.\033[0m"
        exit 1
    fi

    if [ -n "$TARGET_IP" ]; then
        echo -e "\033[1;36m==> Conectando via ADB ($TARGET_IP)...\033[0m"
        "$ADB_BIN" connect "$TARGET_IP" || true
        echo -e "\033[1;36m==> Instalando APK no dispositivo $TARGET_IP...\033[0m"
        "$ADB_BIN" -s "$TARGET_IP" install -r "$DIST_APK"
        echo -e "\033[1;36m==> Iniciando KS TV-Stream no dispositivo...\033[0m"
        "$ADB_BIN" -s "$TARGET_IP" shell am start -n "com.appletv.iptv.firetv/.MainActivity"
    else
        echo -e "\033[1;36m==> Instalando APK no dispositivo ADB ativo...\033[0m"
        "$ADB_BIN" install -r "$DIST_APK"
        echo -e "\033[1;36m==> Iniciando KS TV-Stream...\033[0m"
        "$ADB_BIN" shell am start -n "com.appletv.iptv.firetv/.MainActivity"
    fi
    echo -e "\033[1;32m==> Concluído com sucesso!\033[0m"
fi

