import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const NOT_IN_ORG_ERR_MSG = "You are not a member of this organization (10003)";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Logged in, but not necessarily scoped to one organization yet — use for
// things like "which companies do I belong to" or accepting an invite.
export const protectedProcedure = t.procedure.use(requireUser);

const requireOrg = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (!ctx.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_IN_ORG_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      organizationId: ctx.organizationId,
    },
  });
});

// Logged in AND scoped to one organization the user actually belongs to.
// Use this for anything reading/writing organization data (vehicles,
// repairs, shops, etc) instead of protectedProcedure.
export const orgProcedure = t.procedure.use(requireOrg);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!ctx.organizationId || ctx.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        organizationId: ctx.organizationId,
      },
    });
  }),
);
