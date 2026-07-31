import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, orgProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { generateToken, hashToken, generateOrgCode } from "./_core/tokens";
import { sendInviteEmail } from "./_core/email";
import { stripe, priceIdForPlan, PlanTier, PLAN_VEHICLE_LIMITS, extraVehiclePriceId } from "./_core/stripe";
import { ENV } from "./_core/env";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // signup/login are plain Express routes (server/auth.ts), not tRPC procedures,
    // since they need to set cookies before any user session exists.
  }),

  // ============ ORGANIZATIONS (membership, switching, invites) ============
  organizations: router({
    // Every company the logged-in user belongs to — powers the org switcher.
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserMemberships(ctx.user.id);
    }),
    getSettings: orgProcedure.query(async ({ ctx }) => {
      const org = await db.getOrganizationById(ctx.organizationId);
      return {
        industryType: org?.industryType ?? "other",
        // Default to true when unset, so orgs created before this feature
        // existed keep showing medical tracking exactly as before.
        enabledModules: { driverMedical: org?.enabledModules?.driverMedical ?? true },
        organizationCode: org?.organizationCode ?? null,
      };
    }),
    updateSettings: adminProcedure
      .input(z.object({
        industryType: z.enum(["nemt", "other"]).optional(),
        enabledModules: z.object({ driverMedical: z.boolean().optional() }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.updateOrganizationSettings(ctx.organizationId, input);
        return { success: true } as const;
      }),
    regenerateCode: adminProcedure.mutation(async ({ ctx }) => {
      let code = generateOrgCode();
      while (await db.getOrganizationByCode(code)) {
        code = generateOrgCode();
      }
      await db.setOrganizationCode(ctx.organizationId, code);
      return { organizationCode: code } as const;
    }),
    members: orgProcedure.query(async ({ ctx }) => {
      return db.getOrganizationMembers(ctx.organizationId);
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(200) }))
      .mutation(async ({ input, ctx }) => {
        const slugify = (name: string) =>
          name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "org";

        const baseSlug = slugify(input.name);
        let slug = baseSlug;
        let attempt = 1;
        while (await db.getOrganizationBySlug(slug)) {
          attempt += 1;
          slug = `${baseSlug}-${attempt}`;
        }

        const organization = await db.createOrganization({ name: input.name, slug });
        await db.createOrganizationMember({
          organizationId: organization.id,
          userId: ctx.user.id,
          role: "admin",
        });

        return { organizationId: organization.id, name: organization.name } as const;
      }),
    pendingInvites: adminProcedure.query(async ({ ctx }) => {
      return db.getPendingInvites(ctx.organizationId);
    }),
    revokeInvite: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const invite = await db.getInviteById(input.id);
        if (!invite || invite.organizationId !== ctx.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found." });
        }
        await db.deleteInvite(input.id);
        return { success: true } as const;
      }),
    invite: adminProcedure
      .input(z.object({
        email: z.string().email(),
        role: z.enum(["user", "admin"]).default("user"),
      }))
      .mutation(async ({ input, ctx }) => {
        const org = await db.getOrganizationById(ctx.organizationId);
        const token = generateToken();
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db.createInvite({
          organizationId: ctx.organizationId,
          email: input.email,
          role: input.role,
          tokenHash,
          invitedByUserId: ctx.user.id,
          expiresAt,
        });

        await sendInviteEmail({
          to: input.email,
          orgName: org?.name ?? "your team",
          token,
        });

        return { success: true } as const;
      }),
    // Accept an invite while already logged in (as the invited email).
    acceptInvite: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const invite = await db.getInviteByTokenHash(hashToken(input.token));
        if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This invite is invalid or has expired." });
        }
        if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This invite was sent to a different email address." });
        }
        const existing = await db.getMembership(ctx.user.id, invite.organizationId);
        if (!existing) {
          await db.createOrganizationMember({
            organizationId: invite.organizationId,
            userId: ctx.user.id,
            role: invite.role,
          });
        }
        await db.markInviteAccepted(invite.id);
        return { success: true, organizationId: invite.organizationId } as const;
      }),
  }),

  // Public lookup so the accept-invite page can show who/what the invite is
  // for before the visitor has logged in.
  invites: router({
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const invite = await db.getInviteByTokenHash(hashToken(input.token));
        if (!invite) return null;
        const org = await db.getOrganizationById(invite.organizationId);
        return {
          email: invite.email,
          organizationName: org?.name ?? "Unknown",
          expired: invite.expiresAt.getTime() < Date.now(),
          accepted: Boolean(invite.acceptedAt),
        };
      }),
  }),

  // ============ VEHICLES ============
  vehicles: router({
    list: orgProcedure.query(async ({ ctx }) => {
      return db.getVehicles(ctx.organizationId);
    }),
    getById: orgProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getVehicleById(ctx.organizationId, input.id);
      }),
    create: orgProcedure
      .input(z.object({
        vanNumber: z.string().min(1),
        vin: z.string().min(1).max(17),
        licensePlate: z.string().optional(),
        ezpassTag: z.string().optional(),
        year: z.number().min(1990).max(2030),
        make: z.string().min(1),
        model: z.string().min(1),
        mileage: z.number().default(0),
        engine: z.string().optional(),
        transmission: z.string().optional(),
        assignedDriver: z.string().optional(),
        status: z.enum(["active", "down", "awaiting_parts", "at_shop", "retired"]).default("active"),
        healthScore: z.enum(["green", "yellow", "red"]).default("green"),
        insuranceIssued: z.number().optional(),
        insuranceExpiry: z.number().optional(),
        registrationIssued: z.number().optional(),
        registrationExpiry: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const org = await db.getOrganizationById(ctx.organizationId);
        if (org?.isGrandfathered !== "yes") {
          const baseLimit = PLAN_VEHICLE_LIMITS[org?.planTier ?? "none"] ?? PLAN_VEHICLE_LIMITS.none;
          const effectiveLimit = baseLimit + (org?.extraVehicleSlots ?? 0);
          const currentCount = (await db.getVehicles(ctx.organizationId)).length;
          if (currentCount >= effectiveLimit) {
            const message = effectiveLimit === 0
              ? "Your organization needs an active subscription before adding vehicles. Subscribe to a plan from the Team page to get started."
              : `You've reached your plan's vehicle limit (${effectiveLimit}). Upgrade your plan or purchase additional vehicle slots from the Team page to add more.`;
            throw new TRPCError({ code: "FORBIDDEN", message });
          }
        }
        return db.createVehicle(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        vanNumber: z.string().optional(),
        vin: z.string().optional(),
        licensePlate: z.string().nullable().optional(),
        ezpassTag: z.string().nullable().optional(),
        year: z.number().optional(),
        make: z.string().optional(),
        model: z.string().optional(),
        mileage: z.number().optional(),
        engine: z.string().nullable().optional(),
        transmission: z.string().nullable().optional(),
        assignedDriver: z.string().nullable().optional(),
        status: z.enum(["active", "down", "awaiting_parts", "at_shop", "retired"]).optional(),
        healthScore: z.enum(["green", "yellow", "red"]).optional(),
        photoUrl: z.string().nullable().optional(),
        photoKey: z.string().nullable().optional(),
        insuranceIssued: z.number().nullable().optional(),
        insuranceExpiry: z.number().nullable().optional(),
        registrationIssued: z.number().nullable().optional(),
        registrationExpiry: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateVehicle(ctx.organizationId, id, data);
        return { success: true };
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteVehicle(ctx.organizationId, input.id);
        return { success: true };
      }),
    uploadPhoto: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `vehicles/${input.vehicleId}/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        await db.updateVehicle(ctx.organizationId, input.vehicleId, { photoUrl: url, photoKey: fileKey });
        return { url, key: fileKey };
      }),
    uploadDocument: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        docType: z.enum(["title", "registration", "insurance"]),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `vehicles/${input.vehicleId}/documents/${input.docType}/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);

        if (input.docType === "title") {
          await db.updateVehicle(ctx.organizationId, input.vehicleId, { titleDocumentUrl: url, titleDocumentKey: fileKey });
        } else if (input.docType === "registration") {
          await db.updateVehicle(ctx.organizationId, input.vehicleId, { registrationDocumentUrl: url, registrationDocumentKey: fileKey });
        } else {
          await db.updateVehicle(ctx.organizationId, input.vehicleId, { insuranceDocumentUrl: url, insuranceDocumentKey: fileKey });
        }
        return { url, key: fileKey };
      }),
    removeDocument: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        docType: z.enum(["title", "registration", "insurance"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.docType === "title") {
          await db.updateVehicle(ctx.organizationId, input.vehicleId, { titleDocumentUrl: null, titleDocumentKey: null });
        } else if (input.docType === "registration") {
          await db.updateVehicle(ctx.organizationId, input.vehicleId, { registrationDocumentUrl: null, registrationDocumentKey: null });
        } else {
          await db.updateVehicle(ctx.organizationId, input.vehicleId, { insuranceDocumentUrl: null, insuranceDocumentKey: null });
        }
        return { success: true } as const;
      }),
  }),

  // ============ REPAIRS ============
  repairs: router({
    list: orgProcedure
      .input(z.object({ vehicleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getRepairs(ctx.organizationId, input?.vehicleId);
      }),
    getById: orgProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getRepairById(ctx.organizationId, input.id);
      }),
    create: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        shopId: z.number().nullable().optional(),
        date: z.number(),
        mileage: z.number().optional(),
        mechanic: z.string().optional(),
        complaint: z.string().optional(),
        diagnosis: z.string().optional(),
        partsReplaced: z.array(z.string()).optional(),
        partsCost: z.string().default("0"),
        laborCost: z.string().default("0"),
        tax: z.string().default("0"),
        totalCost: z.string().default("0"),
        warrantyMonths: z.number().optional(),
        warrantyExpiry: z.number().optional(),
        oldPartReturned: z.enum(["yes", "no"]).optional(),
        repairSuccessful: z.enum(["yes", "no"]).optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const orgId = ctx.organizationId;
        const result = await db.createRepair(orgId, input);
        // Check for repeat repair warnings and auto-generate alerts
        const warnings = await db.checkRepeatRepairs(orgId, input.vehicleId, input.category || undefined, input.partsReplaced || undefined);
        for (const w of warnings) {
          const vehicles = await db.getVehicles(orgId);
          const vehicle = vehicles.find(v => v.id === input.vehicleId);
          await db.createAlert(orgId, {
            vehicleId: input.vehicleId,
            type: "repeat_repair",
            title: `Repeat repair warning - Van ${vehicle?.vanNumber || input.vehicleId}`,
            message: w.message,
            severity: w.type === "warranty_active" ? "critical" : "warning",
          });
        }

        // A repair logged under "DOT Inspection" also creates a matching
        // entry in the DOT Inspections history, so it only needs entering once.
        if (input.category === "DOT Inspection") {
          const expiryDate = new Date(input.date);
          expiryDate.setMonth(expiryDate.getMonth() + 6);
          await db.createDotInspection(orgId, {
            vehicleId: input.vehicleId,
            inspectionDate: input.date,
            expiryDate: expiryDate.getTime(),
            mileageAtInspection: input.mileage,
            inspector: input.mechanic,
            notes: input.notes,
            sourceRepairId: result.id,
          });
        }

        return { ...result, warnings };
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        vehicleId: z.number().optional(),
        shopId: z.number().nullable().optional(),
        date: z.number().optional(),
        mileage: z.number().optional(),
        mechanic: z.string().optional(),
        complaint: z.string().optional(),
        diagnosis: z.string().optional(),
        partsReplaced: z.array(z.string()).optional(),
        partsCost: z.string().optional(),
        laborCost: z.string().optional(),
        tax: z.string().optional(),
        totalCost: z.string().optional(),
        warrantyMonths: z.number().optional(),
        warrantyExpiry: z.number().optional(),
        oldPartReturned: z.enum(["yes", "no"]).optional(),
        repairSuccessful: z.enum(["yes", "no"]).optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const orgId = ctx.organizationId;
        const existingRepair = await db.getRepairById(orgId, id);
        await db.updateRepair(orgId, id, data);

        const effectiveCategory = data.category ?? existingRepair?.category;
        if (effectiveCategory === "DOT Inspection" && existingRepair) {
          const effectiveDate = data.date ?? existingRepair.date;
          const effectiveMileage = data.mileage ?? existingRepair.mileage ?? undefined;
          const effectiveMechanic = data.mechanic ?? existingRepair.mechanic ?? undefined;
          const effectiveNotes = data.notes ?? existingRepair.notes ?? undefined;
          const expiryDate = new Date(effectiveDate);
          expiryDate.setMonth(expiryDate.getMonth() + 6);

          const linked = await db.getDotInspectionBySourceRepairId(orgId, id);
          if (linked) {
            await db.updateDotInspection(orgId, linked.id, {
              inspectionDate: effectiveDate,
              expiryDate: expiryDate.getTime(),
              mileageAtInspection: effectiveMileage,
              inspector: effectiveMechanic,
              notes: effectiveNotes,
            });
          } else {
            await db.createDotInspection(orgId, {
              vehicleId: existingRepair.vehicleId,
              inspectionDate: effectiveDate,
              expiryDate: expiryDate.getTime(),
              mileageAtInspection: effectiveMileage,
              inspector: effectiveMechanic,
              notes: effectiveNotes,
              sourceRepairId: id,
            });
          }
        }

        return { success: true };
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRepair(ctx.organizationId, input.id);
        return { success: true };
      }),
    getDocuments: orgProcedure
      .input(z.object({ repairId: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getRepairDocuments(ctx.organizationId, input.repairId);
      }),
    uploadDocument: orgProcedure
      .input(z.object({
        repairId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `repairs/${input.repairId}/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        await db.createRepairDocument(ctx.organizationId, {
          repairId: input.repairId,
          fileName: input.fileName,
          fileUrl: url,
          fileKey: fileKey,
          fileType: input.contentType,
        });
        return { url, key: fileKey };
      }),
    deleteDocument: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRepairDocument(ctx.organizationId, input.id);
        return { success: true };
      }),
  }),

  // ============ SHOPS ============
  shops: router({
    list: orgProcedure.query(async ({ ctx }) => {
      return db.getShops(ctx.organizationId);
    }),
    getById: orgProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getShopById(ctx.organizationId, input.id);
      }),
    create: orgProcedure
      .input(z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        address: z.string().optional(),
        contactPerson: z.string().optional(),
        specialties: z.array(z.string()).optional(),
        averageLaborRate: z.string().optional(),
        recommendation: z.enum(["yes", "no", "maybe"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createShop(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        contactPerson: z.string().nullable().optional(),
        specialties: z.array(z.string()).optional(),
        averageLaborRate: z.string().nullable().optional(),
        reliabilityScore: z.string().nullable().optional(),
        recommendation: z.enum(["yes", "no", "maybe"]).nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateShop(ctx.organizationId, id, data);
        return { success: true };
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteShop(ctx.organizationId, input.id);
        return { success: true };
      }),
  }),

  // ============ MAINTENANCE ============
  maintenance: router({
    getServices: orgProcedure.query(async ({ ctx }) => {
      return db.getMaintenanceServices(ctx.organizationId);
    }),
    getRecords: orgProcedure
      .input(z.object({ vehicleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getMaintenanceRecords(ctx.organizationId, input?.vehicleId);
      }),
    createRecord: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        serviceId: z.number(),
        completedAt: z.number(),
        mileageAtService: z.number().optional(),
        nextDueMileage: z.number().optional(),
        nextDueDate: z.number().optional(),
        shopId: z.number().optional(),
        cost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createMaintenanceRecord(ctx.organizationId, input);
      }),
    deleteRecord: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteMaintenanceRecord(ctx.organizationId, input.id);
        return { success: true };
      }),
    getUpcoming: orgProcedure.query(async ({ ctx }) => {
      return db.getUpcomingMaintenance(ctx.organizationId);
    }),
    // Most recent completed record per vehicle+service — the basis for
    // computing what's overdue, due soon, or never logged, on the client.
    latestByVehicleAndService: orgProcedure.query(async ({ ctx }) => {
      return db.getLatestMaintenanceByVehicleAndService(ctx.organizationId);
    }),
  }),

  // ============ DOT INSPECTIONS ============
  dotInspections: router({
    list: orgProcedure
      .input(z.object({ vehicleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getDotInspections(ctx.organizationId, input?.vehicleId);
      }),
    latestByVehicle: orgProcedure.query(async ({ ctx }) => {
      return db.getLatestDotInspectionByVehicle(ctx.organizationId);
    }),
    create: orgProcedure
      .input(z.object({
        vehicleId: z.number(),
        inspectionDate: z.number(),
        mileageAtInspection: z.number().optional(),
        inspector: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // DOT inspections are valid for 6 months from the inspection date.
        const expiryDate = new Date(input.inspectionDate);
        expiryDate.setMonth(expiryDate.getMonth() + 6);
        return db.createDotInspection(ctx.organizationId, {
          vehicleId: input.vehicleId,
          inspectionDate: input.inspectionDate,
          expiryDate: expiryDate.getTime(),
          mileageAtInspection: input.mileageAtInspection,
          inspector: input.inspector,
          notes: input.notes,
        });
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDotInspection(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        inspectionDate: z.number().optional(),
        mileageAtInspection: z.number().nullable().optional(),
        inspector: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, inspectionDate, ...rest } = input;
        const data: Record<string, unknown> = { ...rest };

        if (inspectionDate !== undefined) {
          data.inspectionDate = inspectionDate;
          const expiryDate = new Date(inspectionDate);
          expiryDate.setMonth(expiryDate.getMonth() + 6);
          data.expiryDate = expiryDate.getTime();
        }

        await db.updateDotInspection(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
    uploadDocument: orgProcedure
      .input(z.object({
        id: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `vehicles/dot-inspections/${input.id}/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        await db.updateDotInspection(ctx.organizationId, input.id, { documentUrl: url, documentKey: fileKey });
        return { url, key: fileKey };
      }),
    removeDocument: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateDotInspection(ctx.organizationId, input.id, { documentUrl: null, documentKey: null });
        return { success: true } as const;
      }),
  }),

  // ============ DRIVERS ============
  drivers: router({
    list: orgProcedure.query(async ({ ctx }) => {
      return db.getDrivers(ctx.organizationId);
    }),
    create: orgProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        licenseNumber: z.string().optional(),
        phone: z.string().optional(),
        status: z.enum(["active", "archived", "disqualified"]).default("active"),
        ssnLast4: z.string().max(4).optional(),
        dateOfBirth: z.number().optional(),
        cdlExpiry: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createDriver(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        licenseNumber: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        status: z.enum(["active", "archived", "disqualified"]).optional(),
        ssnLast4: z.string().max(4).nullable().optional(),
        dateOfBirth: z.number().nullable().optional(),
        cdlExpiry: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDriver(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDriver(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
    uploadCdlDocument: orgProcedure
      .input(z.object({
        driverId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `drivers/${input.driverId}/cdl/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        await db.updateDriver(ctx.organizationId, input.driverId, { cdlDocumentUrl: url, cdlDocumentKey: fileKey });
        return { url, key: fileKey };
      }),
    removeCdlDocument: orgProcedure
      .input(z.object({ driverId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateDriver(ctx.organizationId, input.driverId, { cdlDocumentUrl: null, cdlDocumentKey: null });
        return { success: true } as const;
      }),
  }),

  // ============ DRIVER MEDICAL CERTS ============
  driverMedicalCerts: router({
    list: orgProcedure
      .input(z.object({ driverId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getDriverMedicalCerts(ctx.organizationId, input?.driverId);
      }),
    latestByDriver: orgProcedure.query(async ({ ctx }) => {
      return db.getLatestMedicalCertByDriver(ctx.organizationId);
    }),
    create: orgProcedure
      .input(z.object({
        driverId: z.number(),
        examDate: z.number(),
        expiryDate: z.number(),
        renewalYears: z.enum(["1", "2"]).default("2"),
        examiner: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createDriverMedicalCert(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        examDate: z.number().optional(),
        expiryDate: z.number().optional(),
        renewalYears: z.enum(["1", "2"]).optional(),
        examiner: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDriverMedicalCert(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDriverMedicalCert(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
    uploadDocument: orgProcedure
      .input(z.object({
        id: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `drivers/medical-certs/${input.id}/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        await db.updateDriverMedicalCert(ctx.organizationId, input.id, { documentUrl: url, documentKey: fileKey });
        return { url, key: fileKey };
      }),
    removeDocument: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateDriverMedicalCert(ctx.organizationId, input.id, { documentUrl: null, documentKey: null });
        return { success: true } as const;
      }),
  }),

  // ============ DRIVER ABSTRACTS (MVR reviews) ============
  driverAbstracts: router({
    list: orgProcedure
      .input(z.object({ driverId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getDriverAbstracts(ctx.organizationId, input?.driverId);
      }),
    latestByDriver: orgProcedure.query(async ({ ctx }) => {
      return db.getLatestAbstractByDriver(ctx.organizationId);
    }),
    create: orgProcedure
      .input(z.object({
        driverId: z.number(),
        pulledDate: z.number(),
        nextDueDate: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createDriverAbstract(ctx.organizationId, input);
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        pulledDate: z.number().optional(),
        nextDueDate: z.number().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDriverAbstract(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDriverAbstract(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
    uploadDocument: orgProcedure
      .input(z.object({
        id: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `drivers/abstracts/${input.id}/${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        await db.updateDriverAbstract(ctx.organizationId, input.id, { documentUrl: url, documentKey: fileKey });
        return { url, key: fileKey };
      }),
    removeDocument: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateDriverAbstract(ctx.organizationId, input.id, { documentUrl: null, documentKey: null });
        return { success: true } as const;
      }),
  }),

  // ============ DRIVER DOCUMENT LIBRARY ============
  driverDocuments: router({
    list: orgProcedure
      .input(z.object({ driverId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getDriverDocuments(ctx.organizationId, input?.driverId);
      }),
    upload: orgProcedure
      .input(z.object({
        driverId: z.number(),
        category: z.enum(["cdl", "medical", "abstract", "other"]).default("other"),
        year: z.number().optional(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `drivers/${input.driverId}/documents/${input.category}/${Date.now()}-${input.fileName}`;
        const { url, key: fileKey } = await storagePut(key, buffer, input.contentType);
        const result = await db.createDriverDocument(ctx.organizationId, {
          driverId: input.driverId,
          category: input.category,
          year: input.year,
          fileName: input.fileName,
          fileUrl: url,
          fileKey,
          notes: input.notes,
        });
        return { id: result.id, url };
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDriverDocument(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
  }),

  // ============ ROUTE PLANNING (Phase 1A) ============
  routePlanning: router({
    createImport: orgProcedure
      .input(z.object({
        tripDate: z.number(),
        fileName: z.string(),
        fileBase64: z.string().optional(),
        contentType: z.string().optional(),
        rows: z.array(z.object({
          jobId: z.string().optional(),
          pickupTime: z.number(),
          appointmentTime: z.number().optional(),
          pickupAddress: z.string(),
          dropoffAddress: z.string(),
          legType: z.enum(["A", "B", "unknown"]).default("unknown"),
          passengerLabel: z.string().optional(),
          mobilityType: z.enum(["ambulatory", "wheelchair", "stretcher"]).default("ambulatory"),
          wheelchairCount: z.number().default(0),
          twoPersonAssist: z.enum(["yes", "no"]).default("no"),
          phone: z.string().optional(),
          facilityName: z.string().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        let fileUrl: string | undefined;
        let fileKey: string | undefined;
        if (input.fileBase64 && input.contentType) {
          const buffer = Buffer.from(input.fileBase64, "base64");
          const key = `route-planning/imports/${ctx.organizationId}/${Date.now()}-${input.fileName}`;
          const stored = await storagePut(key, buffer, input.contentType);
          fileUrl = stored.url;
          fileKey = stored.key;
        }

        const importResult = await db.createRouteImport(ctx.organizationId, {
          tripDate: input.tripDate,
          fileName: input.fileName,
          fileUrl,
          fileKey,
          uploadedByUserId: ctx.user.id,
          rowCount: input.rows.length,
        });

        await db.createTripsBulk(
          ctx.organizationId,
          importResult.id,
          input.rows.map(r => ({
            tripDate: input.tripDate,
            pickupTime: r.pickupTime,
            appointmentTime: r.appointmentTime,
            pickupAddress: r.pickupAddress,
            dropoffAddress: r.dropoffAddress,
            legType: r.legType,
            passengerLabel: r.passengerLabel,
            mobilityType: r.mobilityType,
            wheelchairCount: r.wheelchairCount,
            twoPersonAssist: r.twoPersonAssist,
            phone: r.phone,
            facilityName: r.facilityName,
            notes: r.notes,
            jobId: r.jobId,
            status: "unassigned",
          }))
        );

        return { importId: importResult.id, count: input.rows.length } as const;
      }),
    listImports: orgProcedure.query(async ({ ctx }) => {
      return db.getRouteImports(ctx.organizationId);
    }),
    listByDate: orgProcedure
      .input(z.object({ tripDate: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getTripsByDate(ctx.organizationId, input.tripDate);
      }),
    suggestPairs: orgProcedure
      .input(z.object({ tripDate: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.suggestTripPairs(ctx.organizationId, input.tripDate);
      }),
    linkPair: orgProcedure
      .input(z.object({ tripAId: z.number(), tripBId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.linkTripPair(ctx.organizationId, input.tripAId, input.tripBId);
        return { success: true } as const;
      }),
    unlinkPair: orgProcedure
      .input(z.object({ tripId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.unlinkTripPair(ctx.organizationId, input.tripId);
        return { success: true } as const;
      }),
    eligibility: orgProcedure
      .input(z.object({ tripId: z.number() }))
      .query(async ({ input, ctx }) => {
        const trip = await db.getTripById(ctx.organizationId, input.tripId);
        if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });
        const [drivers, vehicles] = await Promise.all([
          db.getEligibleDriversForTrip(ctx.organizationId, trip),
          db.getEligibleVehiclesForTrip(ctx.organizationId, trip),
        ]);
        return { drivers, vehicles };
      }),
    assign: orgProcedure
      .input(z.object({
        tripId: z.number(),
        driverId: z.number().nullable(),
        vehicleId: z.number().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const trip = await db.getTripById(ctx.organizationId, input.tripId);
        if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });

        const newStatus = input.driverId && input.vehicleId ? "assigned" : "unassigned";
        await db.updateTrip(ctx.organizationId, input.tripId, {
          assignedDriverId: input.driverId,
          assignedVehicleId: input.vehicleId,
          status: newStatus,
        });
        await db.logTripStatusEvent(ctx.organizationId, {
          tripId: input.tripId,
          fromStatus: trip.status,
          toStatus: newStatus,
          changedByUserId: ctx.user.id,
          note: "Manual assignment change",
        });
        return { success: true } as const;
      }),
    updateStatus: orgProcedure
      .input(z.object({
        tripId: z.number(),
        status: z.enum(["imported", "unassigned", "assigned", "dispatched", "in_progress", "completed", "cancelled", "no_show"]),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const trip = await db.getTripById(ctx.organizationId, input.tripId);
        if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });
        await db.updateTrip(ctx.organizationId, input.tripId, { status: input.status });
        await db.logTripStatusEvent(ctx.organizationId, {
          tripId: input.tripId,
          fromStatus: trip.status,
          toStatus: input.status,
          changedByUserId: ctx.user.id,
          note: input.note,
        });
        return { success: true } as const;
      }),
    update: orgProcedure
      .input(z.object({
        id: z.number(),
        jobId: z.string().nullable().optional(),
        pickupTime: z.number().optional(),
        appointmentTime: z.number().nullable().optional(),
        pickupAddress: z.string().optional(),
        dropoffAddress: z.string().optional(),
        passengerLabel: z.string().nullable().optional(),
        mobilityType: z.enum(["ambulatory", "wheelchair", "stretcher"]).optional(),
        wheelchairCount: z.number().optional(),
        twoPersonAssist: z.enum(["yes", "no"]).optional(),
        phone: z.string().nullable().optional(),
        facilityName: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateTrip(ctx.organizationId, id, data);
        return { success: true } as const;
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteTrip(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
    statusHistory: orgProcedure
      .input(z.object({ tripId: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getTripStatusEvents(ctx.organizationId, input.tripId);
      }),
  }),

  // ============ BILLING (Stripe) ============
  billing: router({
    getStatus: orgProcedure.query(async ({ ctx }) => {
      const org = await db.getOrganizationById(ctx.organizationId);
      return {
        planTier: org?.planTier ?? "none",
        subscriptionStatus: org?.subscriptionStatus ?? null,
        hasStripeCustomer: Boolean(org?.stripeCustomerId),
        isGrandfathered: org?.isGrandfathered === "yes",
      };
    }),
    changePlan: adminProcedure
      .input(z.object({ plan: z.enum(["starter", "fleet", "fleet_pro"]) }))
      .mutation(async ({ input, ctx }) => {
        if (!stripe) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Billing isn't configured yet." });
        }
        const org = await db.getOrganizationById(ctx.organizationId);
        if (!org?.stripeSubscriptionId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription to change — subscribe to a plan first." });
        }
        const priceId = priceIdForPlan(input.plan as PlanTier);
        if (!priceId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `No Stripe price configured for the ${input.plan} plan yet.` });
        }
        const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
        const itemId = subscription.items.data[0]?.id;
        if (!itemId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't find your subscription's billing item." });
        }
        // Swaps the price on the existing subscription (with proration) rather
        // than creating a new one. Stripe fires customer.subscription.updated
        // for this automatically — our existing webhook handler already syncs
        // planTier from that event, so no webhook changes are needed here.
        await stripe.subscriptions.update(org.stripeSubscriptionId, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: "create_prorations",
        });
        return { success: true } as const;
      }),
    createCheckoutSession: adminProcedure
      .input(z.object({ plan: z.enum(["starter", "fleet", "fleet_pro"]) }))
      .mutation(async ({ input, ctx }) => {
        if (!stripe) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Billing isn't configured yet. Add your Stripe keys first." });
        }
        const priceId = priceIdForPlan(input.plan as PlanTier);
        if (!priceId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `No Stripe price configured for the ${input.plan} plan yet.` });
        }
        const org = await db.getOrganizationById(ctx.organizationId);
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${ENV.appUrl}/team?billing=success`,
          cancel_url: `${ENV.appUrl}/pricing?billing=cancelled`,
          client_reference_id: String(ctx.organizationId),
          customer_email: org?.stripeCustomerId ? undefined : ctx.user.email,
          customer: org?.stripeCustomerId || undefined,
        });
        return { url: session.url };
      }),
    createPortalSession: adminProcedure.mutation(async ({ ctx }) => {
      if (!stripe) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Billing isn't configured yet." });
      }
      const org = await db.getOrganizationById(ctx.organizationId);
      if (!org?.stripeCustomerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No billing account on file yet — subscribe to a plan first." });
      }
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${ENV.appUrl}/team`,
      });
      return { url: portalSession.url };
    }),
    createExtraVehicleCheckoutSession: adminProcedure
      .input(z.object({ quantity: z.number().min(1).max(200) }))
      .mutation(async ({ input, ctx }) => {
        if (!stripe) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Billing isn't configured yet." });
        }
        const priceId = extraVehiclePriceId();
        if (!priceId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Extra vehicle slots aren't configured yet." });
        }
        const org = await db.getOrganizationById(ctx.organizationId);
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          line_items: [{ price: priceId, quantity: input.quantity, adjustable_quantity: { enabled: true, minimum: 1, maximum: 200 } }],
          success_url: `${ENV.appUrl}/team?billing=success`,
          cancel_url: `${ENV.appUrl}/team?billing=cancelled`,
          client_reference_id: String(ctx.organizationId),
          customer_email: org?.stripeCustomerId ? undefined : ctx.user.email,
          customer: org?.stripeCustomerId || undefined,
          metadata: { purchaseType: "extra_vehicles" },
        });
        return { url: session.url };
      }),
    vehicleLimitStatus: orgProcedure.query(async ({ ctx }) => {
      const org = await db.getOrganizationById(ctx.organizationId);
      const baseLimit = PLAN_VEHICLE_LIMITS[org?.planTier ?? "none"] ?? PLAN_VEHICLE_LIMITS.none;
      const extraSlots = org?.extraVehicleSlots ?? 0;
      const currentCount = (await db.getVehicles(ctx.organizationId)).length;
      return {
        isGrandfathered: org?.isGrandfathered === "yes",
        planTier: org?.planTier ?? "none",
        baseLimit: Number.isFinite(baseLimit) ? baseLimit : null,
        extraSlots,
        effectiveLimit: Number.isFinite(baseLimit) ? baseLimit + extraSlots : null,
        currentCount,
      };
    }),
  }),

  // ============ DRIVER MOBILE APP (admin-side) ============
  driverMobile: router({
    setPin: adminProcedure
      .input(z.object({ driverId: z.number(), pin: z.string().min(4).max(8).regex(/^\d+$/, "PIN must be numbers only") }))
      .mutation(async ({ input, ctx }) => {
        const pinHash = await bcrypt.hash(input.pin, 12);
        await db.setDriverPin(ctx.organizationId, input.driverId, pinHash);
        return { success: true } as const;
      }),
    generatePairingCode: adminProcedure
      .input(z.object({ driverId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        await db.createPairingCode(ctx.organizationId, input.driverId, code, expiresAt);
        return { code, expiresAt } as const;
      }),
    listDevices: orgProcedure
      .input(z.object({ driverId: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getDriverDevicesForDriver(ctx.organizationId, input.driverId);
      }),
    revokeDevice: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.revokeDriverDevice(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
  }),

  // ============ MILEAGE ANALYSIS ============
  mileageAnalysis: router({
    get: orgProcedure
      .input(z.object({ startDate: z.number().optional(), endDate: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getMileageAnalysis(ctx.organizationId, input);
      }),
    deleteShift: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDriverShift(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
  }),

  // ============ LIVE MAP ============
  liveMap: router({
    getLocations: orgProcedure.query(async ({ ctx }) => {
      return db.getLiveDriverLocations(ctx.organizationId);
    }),
  }),

  // ============ TOLLS (E-ZPass) ============
  tolls: router({
    createImport: orgProcedure
      .input(z.object({
        fileName: z.string(),
        fileBase64: z.string().optional(),
        contentType: z.string().optional(),
        rows: z.array(z.object({
          tagOrPlate: z.string().optional(),
          referenceId: z.string().optional(),
          transactionAt: z.number(),
          entryPlaza: z.string().optional(),
          exitPlaza: z.string().optional(),
          vehicleClass: z.string().optional(),
          agency: z.string().optional(),
          amount: z.number(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        let fileUrl: string | undefined;
        let fileKey: string | undefined;
        if (input.fileBase64 && input.contentType) {
          const buffer = Buffer.from(input.fileBase64, "base64");
          const key = `tolls/imports/${ctx.organizationId}/${Date.now()}-${input.fileName}`;
          const stored = await storagePut(key, buffer, input.contentType);
          fileUrl = stored.url;
          fileKey = stored.key;
        }

        const importResult = await db.createTollImport(ctx.organizationId, {
          fileName: input.fileName,
          fileUrl,
          fileKey,
          uploadedByUserId: ctx.user.id,
          rowCount: input.rows.length,
        });

        const result = await db.createTollTransactionsBulk(
          ctx.organizationId,
          importResult.id,
          input.rows.map(r => ({
            tagOrPlate: r.tagOrPlate,
            referenceId: r.referenceId,
            transactionAt: new Date(r.transactionAt),
            entryPlaza: r.entryPlaza,
            exitPlaza: r.exitPlaza,
            vehicleClass: r.vehicleClass,
            agency: r.agency,
            amount: String(r.amount),
            notes: r.notes,
          }))
        );

        return { importId: importResult.id, count: result.count, matchedCount: result.matchedCount } as const;
      }),
    list: orgProcedure
      .input(z.object({ startDate: z.number().optional(), endDate: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getTollTransactions(ctx.organizationId, input);
      }),
    delete: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteTollTransaction(ctx.organizationId, input.id);
        return { success: true } as const;
      }),
    deleteMany: orgProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.deleteTollTransactionsBulk(ctx.organizationId, input.ids);
        return { success: true, count: result.count } as const;
      }),
    deleteAllInRange: orgProcedure
      .input(z.object({ startDate: z.number().optional(), endDate: z.number().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        await db.deleteTollTransactionsInRange(ctx.organizationId, input);
        return { success: true } as const;
      }),
  }),

  // ============ ALERTS ============
  alerts: router({
    list: orgProcedure
      .input(z.object({ unreadOnly: z.boolean().optional(), vehicleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getAlerts(ctx.organizationId, input);
      }),
    markRead: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.markAlertRead(ctx.organizationId, input.id);
        return { success: true };
      }),
    dismiss: orgProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.dismissAlert(ctx.organizationId, input.id);
        return { success: true };
      }),
    dismissAll: orgProcedure.mutation(async ({ ctx }) => {
      await db.dismissAllAlerts(ctx.organizationId);
      return { success: true } as const;
    }),
  }),

  // ============ DASHBOARD ============
  dashboard: router({
    stats: orgProcedure.query(async ({ ctx }) => {
      return db.getDashboardStats(ctx.organizationId);
    }),
    upcomingMaintenance: orgProcedure.query(async ({ ctx }) => {
      return db.getUpcomingMaintenance(ctx.organizationId);
    }),
  }),

  // ============ ANALYTICS ============
  analytics: router({
    repairsByDateRange: orgProcedure
      .input(z.object({ startDate: z.number(), endDate: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getRepairsByDateRange(ctx.organizationId, input.startDate, input.endDate);
      }),
    partsVsLabor: orgProcedure.query(async ({ ctx }) => {
      return db.getPartsVsLaborBreakdown(ctx.organizationId);
    }),
    repairFrequency: orgProcedure
      .input(z.object({ months: z.number().default(12) }).optional())
      .query(async ({ input, ctx }) => {
        return db.getRepairFrequencyTrends(ctx.organizationId, input?.months);
      }),
    costPerMile: orgProcedure.query(async ({ ctx }) => {
      return db.getCostPerMile(ctx.organizationId);
    }),
    averagePricing: orgProcedure.query(async ({ ctx }) => {
      return db.getAverageRepairPricing(ctx.organizationId);
    }),
    shopPerformance: orgProcedure.query(async ({ ctx }) => {
      return db.computeShopPerformance(ctx.organizationId);
    }),
    costByVehicle: orgProcedure.query(async ({ ctx }) => {
      const orgId = ctx.organizationId;
      const allRepairs = await db.getRepairs(orgId);
      const allVehicles = await db.getVehicles(orgId);
      const costMap: Record<number, { vanNumber: string; total: number; count: number }> = {};
      for (const r of allRepairs) {
        if (!costMap[r.vehicleId]) {
          const v = allVehicles.find(v => v.id === r.vehicleId);
          costMap[r.vehicleId] = { vanNumber: v?.vanNumber || "Unknown", total: 0, count: 0 };
        }
        costMap[r.vehicleId].total += parseFloat(r.totalCost || "0");
        costMap[r.vehicleId].count++;
      }
      return Object.entries(costMap).map(([id, data]) => ({
        vehicleId: parseInt(id),
        ...data,
      })).sort((a, b) => b.total - a.total);
    }),
    costByCategory: orgProcedure.query(async ({ ctx }) => {
      const allRepairs = await db.getRepairs(ctx.organizationId);
      const categoryMap: Record<string, { total: number; count: number }> = {};
      for (const r of allRepairs) {
        const cat = r.category || "Uncategorized";
        if (!categoryMap[cat]) categoryMap[cat] = { total: 0, count: 0 };
        categoryMap[cat].total += parseFloat(r.totalCost || "0");
        categoryMap[cat].count++;
      }
      return Object.entries(categoryMap).map(([category, data]) => ({
        category,
        ...data,
      })).sort((a, b) => b.total - a.total);
    }),
    monthlySpending: orgProcedure
      .input(z.object({ months: z.number().default(12) }))
      .query(async ({ input, ctx }) => {
        const now = Date.now();
        const startDate = now - input.months * 30 * 24 * 60 * 60 * 1000;
        const allRepairs = await db.getRepairsByDateRange(ctx.organizationId, startDate, now);
        const monthlyMap: Record<string, number> = {};
        for (const r of allRepairs) {
          const date = new Date(r.date);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          monthlyMap[key] = (monthlyMap[key] || 0) + parseFloat(r.totalCost || "0");
        }
        return Object.entries(monthlyMap).map(([month, total]) => ({
          month,
          total: Math.round(total * 100) / 100,
        })).sort((a, b) => a.month.localeCompare(b.month));
      }),
    shopComparison: orgProcedure.query(async ({ ctx }) => {
      const orgId = ctx.organizationId;
      const allRepairs = await db.getRepairs(orgId);
      const allShops = await db.getShops(orgId);
      const shopMap: Record<number, { name: string; totalCost: number; count: number; successful: number }> = {};
      for (const r of allRepairs) {
        if (r.shopId) {
          if (!shopMap[r.shopId]) {
            const shop = allShops.find(s => s.id === r.shopId);
            shopMap[r.shopId] = { name: shop?.name || "Unknown", totalCost: 0, count: 0, successful: 0 };
          }
          shopMap[r.shopId].totalCost += parseFloat(r.totalCost || "0");
          shopMap[r.shopId].count++;
          if (r.repairSuccessful === "yes") shopMap[r.shopId].successful++;
        }
      }
      return Object.entries(shopMap).map(([id, data]) => ({
        shopId: parseInt(id),
        ...data,
        avgCost: data.count > 0 ? Math.round((data.totalCost / data.count) * 100) / 100 : 0,
        successRate: data.count > 0 ? Math.round((data.successful / data.count) * 100) : 0,
      })).sort((a, b) => b.successRate - a.successRate);
    }),
  }),

  // ============ ALERTS GENERATION ============
  alertGeneration: router({
    run: orgProcedure.mutation(async ({ ctx }) => {
      return db.generateAlerts(ctx.organizationId);
    }),
  }),

  // ============ SEARCH ============
  search: router({
    global: orgProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        return db.globalSearch(ctx.organizationId, input.query);
      }),
  }),

  // ============ AI FLEET ADVISOR ============
  advisor: router({
    chat: orgProcedure
      .input(z.object({
        messages: z.array(z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const orgId = ctx.organizationId;
        // Gather fleet context for the AI
        const [vehicles, repairs, shops, alerts] = await Promise.all([
          db.getVehicles(orgId),
          db.getRepairs(orgId),
          db.getShops(orgId),
          db.getAlerts(orgId, { unreadOnly: true }),
        ]);

        const fleetContext = `
You are the Vanlytics AI Advisor for a commercial Ford Transit Ambulette fleet.

CURRENT FLEET STATUS:
- Total vehicles: ${vehicles.length}
- Active: ${vehicles.filter(v => v.status === "active").length}
- Down: ${vehicles.filter(v => v.status === "down").length}
- At Shop: ${vehicles.filter(v => v.status === "at_shop").length}
- Awaiting Parts: ${vehicles.filter(v => v.status === "awaiting_parts").length}

RECENT REPAIRS (last 20):
${repairs.slice(0, 20).map(r => {
  const v = vehicles.find(v => v.id === r.vehicleId);
  return `- Van ${v?.vanNumber || "?"}: ${r.complaint || r.category || "Repair"} - $${r.totalCost} on ${new Date(r.date).toLocaleDateString()}`;
}).join("\n")}

SHOPS:
${shops.map(s => `- ${s.name}: ${s.recommendation || "no rating"} recommendation, avg labor $${s.averageLaborRate || "N/A"}/hr`).join("\n")}

ACTIVE ALERTS: ${alerts.length}
${alerts.slice(0, 10).map(a => `- [${a.severity}] ${a.title}`).join("\n")}

Based on this fleet data, provide helpful, specific advice about fleet health, repair recommendations, cost optimization, and maintenance strategies. Be direct and actionable. If you notice patterns (repeat repairs, high costs, warranty issues), call them out.`;

        const systemMessage = { role: "system" as const, content: fleetContext };
        const allMessages = [systemMessage, ...input.messages];

        const response = await invokeLLM({
          messages: allMessages,
        });

        const rawContent = response.choices[0]?.message?.content;
        let content = "I'm unable to provide advice at this time.";
        if (typeof rawContent === "string") {
          content = rawContent;
        } else if (Array.isArray(rawContent)) {
          content = rawContent.filter(c => c.type === "text").map(c => (c as any).text).join("");
        }
        return { content };
      }),
  }),
});

export type AppRouter = typeof appRouter;
