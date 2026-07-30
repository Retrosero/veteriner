# POST /api/v1/branches/:id/archive

Şubeyi arşivler (soft delete). SUPERADMIN veya tenant OWNER.
Fiziksel silme yok; `status = closed` ve `archivedAt` set edilir.

Detaylı sözleşme için: [`API_CATALOG.md`](./API_CATALOG.md#post-apiv1branchesidarchive).

- **Yetki:** `branch:branch:archive`
- **Audit:** `audit:branch.update` action: archive
- **Hata kodları:** `VET-BRANCH-0004` (409 zaten kapalı)
