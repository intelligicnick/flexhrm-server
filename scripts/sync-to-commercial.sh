#!/usr/bin/env bash
# Sync flexhrm workspace → Flexhrm Commercial folder + MongoDB (flexhrm → hrmcom).
set -euo pipefail

SRC="/Users/nikhil/Desktop/flexhrm"
DEST="/Users/nikhil/Desktop/Flexhrm  Commercial"
BACKUP="$(mktemp -d)"
DUMP_DIR="$(mktemp -d)"

echo "==> Backing up Commercial-only paths to $BACKUP"
preserve() {
  local rel="$1"
  if [[ -e "$DEST/$rel" ]]; then
    mkdir -p "$BACKUP/$(dirname "$rel")"
    cp -R "$DEST/$rel" "$BACKUP/$rel"
  fi
}

# Root / infra
preserve "docker-compose.yml"
preserve "backend/Dockerfile"
preserve "frontend/Dockerfile"

# Backend commercial-only
preserve "backend/scripts/migrate-to-multi-tenant.ts"
preserve "backend/src/platform"
preserve "backend/src/common/utils/tenant.util.ts"
preserve "backend/src/modules/leave"
preserve "backend/src/modules/employee-portal"
preserve "backend/src/modules/shift"
preserve "backend/src/database/schemas/leave-type.schema.ts"
preserve "backend/src/database/schemas/leave-balance.schema.ts"
preserve "backend/src/database/schemas/leave-request.schema.ts"
preserve "backend/src/database/schemas/shift.schema.ts"

# Backend merged files (Commercial tenant/platform layer)
for f in \
  backend/src/app.module.ts \
  backend/src/database/database.module.ts \
  backend/src/config/configuration.ts \
  backend/package.json \
  backend/.env.example \
  backend/src/common/guards/permissions.guard.ts \
  backend/src/common/utils/flush-audit-password.util.ts \
  backend/src/common/utils/permissions.util.ts \
  backend/src/database/schemas/admin.schema.ts \
  backend/src/database/schemas/employee.schema.ts \
  backend/src/database/schemas/role.schema.ts \
  backend/src/database/schemas/session.schema.ts \
  backend/src/modules/admins/admins.controller.ts \
  backend/src/modules/admins/admins.service.ts \
  backend/src/modules/admins/dto/admin.dto.ts \
  backend/src/modules/audit-logs/audit-logs.controller.ts \
  backend/src/modules/auth/auth.controller.ts \
  backend/src/modules/auth/auth.module.ts \
  backend/src/modules/email/email.service.ts \
  backend/src/modules/employees/employees.controller.ts \
  backend/src/modules/employees/employees.service.ts \
  backend/src/modules/roles/dto/upsert-role.dto.ts \
  backend/src/modules/roles/roles.controller.ts \
  backend/src/modules/roles/roles.service.ts \
  backend/src/modules/school-visits/school-visits.controller.ts \
  backend/src/modules/school-visits/school-visits.module.ts \
  backend/src/modules/sessions/sessions.service.ts
do
  preserve "$f"
done

# Frontend commercial-only
preserve "frontend/src/components/TrialBanner.tsx"
preserve "frontend/src/pages/LeavePage.tsx"
preserve "frontend/src/pages/RegisterPage.tsx"
preserve "frontend/src/pages/ShiftPage.tsx"
preserve "frontend/src/pages/employee-portal"
preserve "frontend/src/pages/platform"

# Frontend merged files
for f in \
  frontend/src/App.tsx \
  frontend/src/api.ts \
  frontend/src/env.ts \
  frontend/src/hooks/useAuth.ts \
  frontend/src/hooks/useHRMSApp.tsx \
  frontend/src/layouts/DashboardLayout.tsx \
  frontend/src/main.tsx \
  frontend/src/pages/AdminDashboardPage.tsx \
  frontend/src/pages/ModuleContent.tsx \
  frontend/src/routes.ts \
  frontend/src/types.ts \
  frontend/src/components/auth/LoginPage.tsx
do
  preserve "$f"
done

# Env files (Commercial-specific credentials / DB name)
preserve "backend/.env"
preserve "frontend/.env"
preserve "frontend/.env.production"

echo "==> Rsyncing code from flexhrm → Commercial"
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.vite' \
  --exclude='.DS_Store' \
  --exclude='*.apk' \
  --exclude='*.raw' \
  --exclude='app/build' \
  --exclude='.gradle' \
  --exclude='backend/.env' \
  --exclude='frontend/.env' \
  --exclude='frontend/.env.production' \
  "$SRC/" "$DEST/"

echo "==> Restoring Commercial-only / merged files"
if [[ -d "$BACKUP/backend" ]]; then
  rsync -a "$BACKUP/" "$DEST/"
fi

# Apply flexhrm-only additions into Commercial (without overwriting preserved files)
echo "==> Copying flexhrm-only backend additions"
if [[ -f "$SRC/backend/src/modules/health/pdf-proxy.controller.ts" ]]; then
  cp "$SRC/backend/src/modules/health/pdf-proxy.controller.ts" \
    "$DEST/backend/src/modules/health/pdf-proxy.controller.ts"
fi
cp "$SRC/backend/src/modules/health/health.module.ts" \
  "$DEST/backend/src/modules/health/health.module.ts"

echo "==> Copying flexhrm-only frontend additions"
if [[ -d "$SRC/frontend/android-observer-app" ]]; then
  rsync -a "$SRC/frontend/android-observer-app/" "$DEST/frontend/android-observer-app/"
fi

echo "==> Syncing MongoDB flexhrm → hrmcom"
PLATFORM_COLLECTIONS=(
  tenants
  platform_admins
  subscription_plans
  subscriptions
  invoices
  payment_transactions
  support_tickets
  shift_templates
  shift_rosters
)

PLATFORM_BACKUP="$DUMP_DIR/platform"
mkdir -p "$PLATFORM_BACKUP"
for col in "${PLATFORM_COLLECTIONS[@]}"; do
  count=$(mongosh --quiet hrmcom --eval "db.getCollection('$col').countDocuments()" 2>/dev/null || echo 0)
  if [[ "$count" != "0" ]]; then
    echo "  Backing up hrmcom.$col ($count docs)"
    mongodump --quiet -d hrmcom -c "$col" -o "$PLATFORM_BACKUP" 2>/dev/null || true
  fi
done

echo "  Dumping flexhrm database..."
mongodump --quiet -d flexhrm -o "$DUMP_DIR/flexhrm"

echo "  Restoring flexhrm data into hrmcom..."
mongorestore --quiet --db hrmcom --drop "$DUMP_DIR/flexhrm/flexhrm"

if [[ -d "$PLATFORM_BACKUP/hrmcom" ]]; then
  echo "  Restoring platform collections..."
  mongorestore --quiet --db hrmcom "$PLATFORM_BACKUP/hrmcom"
fi

echo "==> Running multi-tenant migration on hrmcom"
(
  cd "$DEST/backend"
  MONGODB_URI=mongodb://127.0.0.1:27017/hrmcom npm run migrate:multi-tenant
)

rm -rf "$BACKUP" "$DUMP_DIR"

echo ""
echo "✓ Sync complete."
echo "  Code:  $DEST"
echo "  DB:    flexhrm → hrmcom (platform collections preserved)"
echo ""
echo "Next: cd \"$DEST/backend\" && npm install && cd \"$DEST/frontend\" && npm install"
