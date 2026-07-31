import { trpc } from "@/lib/trpc";
import { getActiveOrgId } from "@/_core/activeOrg";

// Members can view everything but can't create, edit, or delete anything —
// only Admins can. Use this hook anywhere a page needs to hide/disable
// those controls for non-admins, instead of re-deriving it locally.
export function useIsAdmin() {
  const activeOrgId = getActiveOrgId();
  const { data: memberships, isLoading } = trpc.organizations.list.useQuery();
  const currentMembership = memberships?.find(m => m.organizationId === activeOrgId);
  return { isAdmin: currentMembership?.role === "admin", isLoading };
}
