#!/usr/bin/env bash
# Proxy para la API de Binance en una maquina Ubuntu de Oracle Cloud (Always
# Free, region Sao Paulo). Binance responde 451 desde el pais del servidor del
# panel (EE. UU.) y tambien bloquea las IP de VPN: el panel manda solo sus
# consultas a Binance por este proxy (BINANCE_PROXY_URL en EasyPanel).
#
# Uso, en la maquina de Oracle:
#   sudo bash binance-proxy-oracle.sh <IP_DEL_PANEL>[,<OTRA_IP>] <CLAVE>
#
# - Solo acepta conexiones desde las IP del panel, con usuario "binance" y la
#   clave, y solo deja pasar consultas a api.binance.com (HTTPS).
# - La clave: letras y numeros, 16 o mas (va dentro de la URL del proxy).
# - Al final imprime la linea BINANCE_PROXY_URL para pegar en EasyPanel.
# - Ademas de esto, en la consola de Oracle hay que abrir el puerto 8888 solo
#   para la IP del panel (Security List de la subred).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Correr con sudo"; exit 1; fi
if [ $# -ne 2 ]; then echo "Uso: sudo bash $0 <IP_DEL_PANEL>[,<OTRA_IP>] <CLAVE>"; exit 1; fi
IPS_PANEL="$1"
CLAVE="$2"
PUERTO=8888

if ! [[ "$CLAVE" =~ ^[A-Za-z0-9]{16,}$ ]]; then
  echo "La clave tiene que ser de 16 o mas letras y numeros (sin simbolos)"; exit 1
fi
IFS=',' read -r -a LISTA_IPS <<< "$IPS_PANEL"
for ip in "${LISTA_IPS[@]}"; do
  if ! [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then echo "IP invalida: $ip"; exit 1; fi
done

echo "1/4 Probando si Binance responde desde esta maquina..."
RESPUESTA="$(curl -sS -m 20 -w ' HTTP %{http_code}' https://api.binance.com/api/v3/time || true)"
echo "    $RESPUESTA"
if [[ "$RESPUESTA" != *'"serverTime"'* ]]; then
  echo "Binance no responde desde aqui (451 = pais o IP bloqueados). No se instala nada."
  exit 1
fi

echo "2/4 Instalando tinyproxy..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q tinyproxy iptables-persistent

echo "3/4 Configurando..."
{
  echo "User tinyproxy"
  echo "Group tinyproxy"
  echo "Port $PUERTO"
  echo "Timeout 60"
  echo 'LogFile "/var/log/tinyproxy/tinyproxy.log"'
  echo "LogLevel Warning"
  echo "MaxClients 20"
  echo "Allow 127.0.0.1"
  for ip in "${LISTA_IPS[@]}"; do echo "Allow $ip"; done
  echo "BasicAuth binance $CLAVE"
  # Solo HTTPS (CONNECT al 443) y solo hacia api.binance.com.
  echo "ConnectPort 443"
  echo 'Filter "/etc/tinyproxy/filtro"'
  echo "FilterDefaultDeny Yes"
  echo "DisableViaHeader Yes"
} > /etc/tinyproxy/tinyproxy.conf
echo '^api\.binance\.com$' > /etc/tinyproxy/filtro
chmod 640 /etc/tinyproxy/tinyproxy.conf
chgrp tinyproxy /etc/tinyproxy/tinyproxy.conf
systemctl enable tinyproxy >/dev/null
systemctl restart tinyproxy

# Las imagenes de Ubuntu de Oracle traen iptables cerrado salvo SSH: se abre el
# puerto solo para las IP del panel.
for ip in "${LISTA_IPS[@]}"; do
  iptables -C INPUT -p tcp -s "$ip" --dport "$PUERTO" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT -p tcp -s "$ip" --dport "$PUERTO" -j ACCEPT
done
netfilter-persistent save >/dev/null

echo "4/4 Probando el proxy..."
PRUEBA="$(curl -sS -m 20 -x "http://binance:$CLAVE@127.0.0.1:$PUERTO" https://api.binance.com/api/v3/time || true)"
OTRO="$(curl -s -o /dev/null -m 20 -w '%{http_code}' -x "http://binance:$CLAVE@127.0.0.1:$PUERTO" https://www.google.com || true)"
echo "    Binance por el proxy: $PRUEBA"
echo "    Otro sitio por el proxy (tiene que fallar): ${OTRO:-sin respuesta}"
if [[ "$PRUEBA" != *'"serverTime"'* ]]; then echo "El proxy no funciono: revisa /var/log/tinyproxy/tinyproxy.log"; exit 1; fi
if [[ "$OTRO" == 2* || "$OTRO" == 3* ]]; then
  echo "OJO: el filtro dejo pasar otro sitio; el proxy funciona pero no esta limitado a Binance."
fi

IP_PUBLICA="$(curl -sS -m 10 https://ifconfig.me || echo '<IP_PUBLICA_DE_ESTA_MAQUINA>')"
echo
echo "Listo. En EasyPanel, en las variables del panel:"
echo "  BINANCE_PROXY_URL=http://binance:$CLAVE@$IP_PUBLICA:$PUERTO"
echo "Y en la consola de Oracle: Security List de la subred -> regla de entrada TCP $PUERTO"
echo "con origen <IP_DEL_PANEL>/32 (una por cada IP)."
