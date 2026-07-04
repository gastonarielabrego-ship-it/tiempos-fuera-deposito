#!/bin/bash
# ============================================================
# SCRIPT DEPLOY AUTOMÁTICO — Tiempos Fuera de Depósito
# GitHub + Turso + Vercel
# ============================================================
# 
# REQUISITOS PREVIOS (instalar una sola vez):
#   1. npm i -g vercel turso gh
#   2. vercel login
#   3. turso auth login  
#   4. gh auth login
#
# USO: bash scripts/deploy.sh
# ============================================================

set -e

echo "============================================"
echo "  DEPLOY — Tiempos Fuera de Depósito"
echo "============================================"

# ---------- CONFIGURACIÓN ----------
REPO_NAME="${REPO_NAME:-tiempos-fuera-deposito}"
TURSO_DB_NAME="${TURSO_DB_NAME:-tiempos-fuera-deposito}"
TURSO_ORG="${TURSO_ORG:-}"
# ----------------------------------

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# Verificar herramientas
for cmd in git gh turso vercel npm; do
  if ! command -v $cmd &> /dev/null; then
    echo "❌ Falta: $cmd — Instalá con: npm i -g vercel turso gh"
    exit 1
  fi
done

# Verificar login
echo ""
echo "▶ Verificando sesiones..."
gh auth status &> /dev/null || { echo "❌ Hacé 'gh auth login' primero"; exit 1; }
echo "  ✅ GitHub OK"
turso auth whoami &> /dev/null || { echo "❌ Hacé 'turso auth login' primero"; exit 1; }
echo "  ✅ Turso OK"
vercel whoami &> /dev/null || { echo "❌ Hacé 'vercel login' primero"; exit 1; }
echo "  ✅ Vercel OK"

# ========== PASO 1: TURSO ==========
echo ""
echo "━━━ PASO 1/3: Creando base de datos en Turso ━━━"

if turso db show "$TURSO_DB_NAME" &> /dev/null 2>&1; then
  echo "  ⚡ La DB '$TURSO_DB_NAME' ya existe, saltando creación..."
  DB_URL=$(turso db show "$TURSO_DB_NAME" --url 2>/dev/null)
else
  if [ -n "$TURSO_ORG" ]; then
    turso db create "$TURSO_DB_NAME" --org "$TURSO_ORG"
  else
    turso db create "$TURSO_DB_NAME"
  fi
  echo "  ✅ DB creada"
fi

ORG_FLAG=""
if [ -n "$TURSO_ORG" ]; then
  ORG_FLAG="--org $TURSO_ORG"
fi

DB_URL=$(turso db show "$TURSO_DB_NAME" $ORG_FLAG --url 2>/dev/null)
DB_TOKEN=$(turso db tokens create "$TURSO_DB_NAME" $ORG_FLAG 2>/dev/null)

if [ -z "$DB_URL" ] || [ -z "$DB_TOKEN" ]; then
  echo "❌ No se pudo obtener URL/token de Turso"
  exit 1
fi

TURSO_URL="libsql://${DB_URL#libsql://}?authToken=${DB_TOKEN}"
echo "  ✅ URL obtenida"
echo "  ✅ Token obtenido"

# ========== PASO 2: GITHUB ==========
echo ""
echo "━━━ PASO 2/3: Subiendo a GitHub ━━━"

if [ ! -d ".git" ]; then
  git init
  git checkout -b main
  echo "  ✅ Repo git inicializado"
fi

[ ! -f ".env.example" ] && echo "DATABASE_URL=libsql://" > .env.example

git add -A
git diff --cached --quiet || git commit -m "deploy: tiempos fuera de depósito" || echo "  (nada que commitear)"
echo "  ✅ Commit listo"

if ! git remote get-url origin &> /dev/null 2>&1; then
  gh repo create "$REPO_NAME" --public --source=. --push
  echo "  ✅ Repo creado y pusheado en GitHub"
else
  git push origin main --force 2>/dev/null || git push origin main
  echo "  ✅ Pusheado a GitHub"
fi

# ========== PASO 3: VERCEL ==========
echo ""
echo "━━━ PASO 3/3: Desplegando en Vercel ━━━"

if ! vercel ls 2>/dev/null | grep -q "$REPO_NAME"; then
  vercel --yes --prod -e DATABASE_URL="$TURSO_URL"
  echo "  ✅ Proyecto creado y desplegado en Vercel"
else
  vercel --prod -e DATABASE_URL="$TURSO_URL"
  echo "  ✅ Desplegado en Vercel"
fi

DEPLOY_URL=$(vercel ls 2>/dev/null | head -1 | awk '{print $2}')

# ========== RESUMEN ==========
echo ""
echo "============================================"
echo "  ✅ ¡DEPLOY COMPLETADO!"
echo "============================================"
echo ""
echo "  🌐 Tu dashboard está en:"
echo "     ${DEPLOY_URL:-https://vercel.com/dashboard}"
echo ""
echo "  📊 Turso DB: $TURSO_DB_NAME"
echo "  📁 GitHub:   https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo ""
echo "  Para actualizar, solo hacé:"
echo "     git add -A && git commit -m 'update' && git push"
echo "     (Vercel redeploya automáticamente)"
echo ""
echo "============================================"