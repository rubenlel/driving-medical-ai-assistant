#!/usr/bin/env bash
#
# Audit de sécurité NON-DESTRUCTIF pour roullepro.com
# -----------------------------------------------------
# À exécuter UNIQUEMENT avec l'autorisation écrite du propriétaire du site.
# Ce script ne fait que des vérifications passives / à faible impact :
# en-têtes HTTP, configuration TLS, DNS, fichiers exposés courants,
# robots.txt / security.txt / sitemap. Il n'effectue AUCUNE injection,
# AUCUN fuzzing et AUCune attaque par force brute.
#
# Pré-requis : curl, dig (dnsutils), openssl. Optionnels : nmap, testssl.sh.
#
# Usage : ./security-audit-roullepro.sh [domaine]
#         ./security-audit-roullepro.sh roullepro.com
#
set -uo pipefail

DOMAIN="${1:-roullepro.com}"
BASE="https://${DOMAIN}"
UA="Mozilla/5.0 (SecurityAudit; authorized)"
OUT="audit-${DOMAIN}-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

hr(){ printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }

hr "1. Résolution DNS & enregistrements"
{
  echo "# A / AAAA"; dig +short "$DOMAIN" A; dig +short "$DOMAIN" AAAA
  echo "# MX";       dig +short "$DOMAIN" MX
  echo "# NS";       dig +short "$DOMAIN" NS
  echo "# TXT (SPF/DKIM/DMARC/vérifs)"; dig +short "$DOMAIN" TXT
  echo "# DMARC";    dig +short "_dmarc.${DOMAIN}" TXT
  echo "# CAA";      dig +short "$DOMAIN" CAA
} | tee "$OUT/dns.txt"

hr "2. En-têtes HTTP de sécurité"
# On veut voir : Strict-Transport-Security, Content-Security-Policy,
# X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
# Et l'ABSENCE de : Server/X-Powered-By verbeux, headers Vercel/Next révélateurs.
curl -sSD - -o /dev/null -A "$UA" "$BASE/" | tee "$OUT/headers.txt"
echo "--- Analyse rapide des en-têtes manquants ---"
H="$OUT/headers.txt"
for want in "strict-transport-security" "content-security-policy" "x-frame-options" \
            "x-content-type-options" "referrer-policy" "permissions-policy"; do
  if grep -iq "$want" "$H"; then echo "OK   présent : $want"; else echo "MANQUE       : $want"; fi
done
for leak in "x-powered-by" "server:"; do
  grep -i "$leak" "$H" && echo "INFO  divulgation possible ($leak)"
done

hr "3. Redirections & HTTPS forcé"
echo "# HTTP -> HTTPS ?"
curl -sSD - -o /dev/null -A "$UA" "http://${DOMAIN}/" | grep -iE "^(HTTP/|location:)"

hr "4. Configuration TLS"
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates -ext subjectAltName 2>/dev/null \
  | tee "$OUT/tls.txt"
echo "# Protocoles obsolètes (doivent ÉCHOUER) :"
for p in ssl3 tls1 tls1_1; do
  if echo | openssl s_client -connect "${DOMAIN}:443" -"$p" 2>/dev/null | grep -q "BEGIN CERTIFICATE"; then
    echo "ALERTE  $p ACCEPTÉ (obsolète, à désactiver)"
  else
    echo "OK      $p refusé"
  fi
done
# Si testssl.sh est installé, audit TLS complet :
command -v testssl.sh >/dev/null && testssl.sh --quiet --color 0 "$DOMAIN" > "$OUT/testssl.txt" 2>&1 \
  && echo "testssl.sh -> $OUT/testssl.txt"

hr "5. Fichiers & chemins sensibles exposés (statut HTTP)"
# Vérifie l'exposition accidentelle de fichiers de config / build / VCS.
for path in \
  /robots.txt /sitemap.xml /security.txt /.well-known/security.txt \
  /.env /.env.local /.env.production /.git/config /.git/HEAD \
  /package.json /next.config.js /.next/ /server.js /Procfile \
  /api /api/health /admin /login /dashboard /_next/static \
  /backup.zip /dump.sql /config.json /.DS_Store ; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -A "$UA" --max-time 15 "${BASE}${path}")
  printf "%-28s %s\n" "$path" "$code"
done | tee "$OUT/exposed-paths.txt"
echo "(200/206/301/302 sur .env, .git, dump.sql, backup.zip, .DS_Store = À TRAITER EN PRIORITÉ)"

hr "6. robots.txt & sitemap (surface d'attaque déclarée)"
curl -sS -A "$UA" "$BASE/robots.txt"       | tee "$OUT/robots.txt"
curl -sS -A "$UA" "$BASE/sitemap.xml" | head -40 | tee "$OUT/sitemap-head.txt"

hr "7. Cookies & attributs de sécurité"
curl -sSD - -o /dev/null -A "$UA" "$BASE/" | grep -i "set-cookie" \
  | tee "$OUT/cookies.txt" || echo "Aucun cookie posé sur la home."
echo "(Vérifier : Secure, HttpOnly, SameSite sur tout cookie de session)"

hr "8. Ports ouverts (nmap si disponible - léger, top 100)"
if command -v nmap >/dev/null; then
  nmap -Pn -T3 --top-ports 100 "$DOMAIN" | tee "$OUT/nmap.txt"
else
  echo "nmap non installé - étape ignorée. (apt install nmap)"
fi

hr "Terminé"
echo "Résultats dans : $OUT/"
echo "Rappel : les tests intrusifs (sqlmap, fuzzing, brute-force sur /login,"
echo "test du flux 'réclamer ma fiche') nécessitent un périmètre écrit dédié."
